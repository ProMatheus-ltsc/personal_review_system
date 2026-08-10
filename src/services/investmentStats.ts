/**
 * investmentStats — 投资检查清单统计
 *
 * 从 IndexedDB 中聚合计算投资检查清单的统计数据（与 stats.ts 拆分的独立模块）：
 * - getAllInvestmentRecords：按时间范围获取新模型单据（position/buy/sell）
 * - calcInvestmentStats：卖出批次、胜率、平均持有天数、累计/平均盈亏、盈亏分布
 * - calcTradeDetails：每个投资周期的完整交易明细（加权买卖价、盈亏、持有天数、逐笔子行）
 * - calcSellQualityStats：卖出质量分析（卖出次数/胜率/过早卖出/平均每笔盈亏/原因分布）
 *
 * 统计口径说明：
 * - 仅统计新模型单据（record_role = position/buy/sell），旧格式不展示
 * - 持有天数 = 最后卖出日 − 加权平均买入日（卖出批次日期缺失时无法计算）
 */
import type { FormRecord } from '@/types';
import { getAllRecords } from '@/services/db';
import { startOfMonth, subMonths, isAfter } from 'date-fns';
import type { TimeRange } from './stats';
import { ensureTradesInitialized, readTrades, readReviews } from '@/services/investmentMerge';
import { isFieldEmpty } from '@/utils/formValidation';

/** 按时间范围过滤记录：全部 / 近3月（从 3 个月前所在月的第一天起算） / 本月 */
function filterByTimeRange(records: FormRecord[], range: TimeRange): FormRecord[] {
  if (range === 'all') return records;
  const now = new Date();
  const start = range === 'month' ? startOfMonth(now) : startOfMonth(subMonths(now, 3));
  return records.filter((r) => isAfter(new Date(r.createdAt), start));
}

/**
 * 获取投资检查清单的全部记录（不限 status，投资单据的统计/明细不应依赖
 * 用户是否手动点了"完成"按钮，sold_out 才是平仓的真实标志）
 * 仅统计新模型单据（record_role = position/buy/sell），旧格式不展示
 */
export async function getAllInvestmentRecords(range: TimeRange): Promise<FormRecord[]> {
  const records = (await Promise.all([
    getAllRecords('investment_checklist_buy'),
    getAllRecords('investment_checklist_sell'),
    getAllRecords('investment_checklist_position'),
  ])).flat();
  return filterByTimeRange(records, range);
}

// ============================================================
// 投资检查清单统计
// ============================================================

/** 数值转换（空值/非法 → undefined） */
function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

/** 读取一条投资单据的卖出批次（合并单据优先 merged_sell_lots，否则用顶层卖出字段） */
interface SellBatchLike {
  date?: string;
  price?: string | number;
  qty?: string | number;
  reason?: string;
}

/** 读取一条投资单据的卖出批次：合并单据优先 merged_sell_lots，否则顶层卖出字段视为一笔批次 */
function readSellBatches(r: FormRecord): SellBatchLike[] {
  const merged = r.data['merged_sell_lots'];
  if (Array.isArray(merged) && merged.length > 0) return merged as unknown as SellBatchLike[];
  // 兼容未合并的单笔记录：顶层卖出字段视为一笔批次
  const sellPrice = r.data['sell_exit_price'];
  if (sellPrice !== undefined && sellPrice !== null && String(sellPrice).trim() !== '') {
    return [{
      date: r.data['sell_date'] as string | undefined,
      price: sellPrice as string | number | undefined,
      qty: r.data['sell_quantity'] as string | number | undefined,
    }];
  }
  return [];
}

/** 判断单据是否已清仓（已全部卖出）：顶层卖出字段恢复（sold_out 时）或标记 */
function isClosedRecord(r: FormRecord): boolean {
  if (r.data['sold_out'] === true) return true;
  const sellPrice = r.data['sell_exit_price'];
  return sellPrice !== undefined && sellPrice !== null && String(sellPrice).trim() !== '';
}

export interface InvestmentStats {
  /** 投资单据总数（含持仓中） */
  totalTrades: number;
  /** 卖出批次总数（合并单据按批次计，避免重复计数） */
  totalSellBatches: number;
  /** 已清仓单据数（全部卖出） */
  closedTrades: number;
  /** 胜率（盈利单据 / 已清仓单据） */
  winRate: number | null;
  /** 平均风险回报比 */
  avgRiskReward: number | null;
  /** 平均持有天数（已清仓单据，最后卖出日 − 买入日） */
  avgHoldDays: number | null;
  /** 累计已实现盈亏金额（按单据各自币种加总；跨币种仅供参考） */
  totalProfitAmount: number | null;
  /** 平均盈亏百分比（已清仓单据） */
  avgProfitPercent: number | null;
  /** 盈亏分布 */
  profitDistribution: { name: string; count: number }[];
}

/** 计算投资检查清单总体统计：卖出批次、胜率、平均持有天数、累计/平均盈亏、盈亏分布 */
export function calcInvestmentStats(records: FormRecord[]): InvestmentStats {
  let totalSellBatches = 0;
  const closed: { pnlPercent: number | null; holdDays: number | null }[] = [];
  let totalProfitAmount = 0;
  let profitAmountValid = true;

  records.forEach((r) => {
    const batches = readSellBatches(r);
    totalSellBatches += batches.length;
    if (batches.length === 0) return;

    const buyWeighted = toNum(r.data['buy_price']); // 加权买入价（合并后）
    const closedRec = isClosedRecord(r);

    // 已实现盈亏（含部分卖出的已卖部分）：Σ qty × (批次价 − 加权买入价)
    if (buyWeighted !== undefined) {
      let profit = 0;
      batches.forEach((b) => {
        const p = toNum(b.price);
        const q = toNum(b.qty);
        if (p !== undefined && q !== undefined) profit += q * (p - buyWeighted);
      });
      totalProfitAmount += profit;
    } else {
      profitAmountValid = false;
    }

    if (closedRec) {
      // 加权卖出价
      let sellQty = 0;
      let sellCost = 0;
      batches.forEach((b) => {
        const p = toNum(b.price);
        const q = toNum(b.qty);
        if (p !== undefined && q !== undefined && q > 0) {
          sellCost += p * q;
          sellQty += q;
        }
      });
      const sellWeighted = sellQty > 0 ? sellCost / sellQty : undefined;
      const pnlPercent = buyWeighted !== undefined && sellWeighted !== undefined && buyWeighted > 0
        ? ((sellWeighted - buyWeighted) / buyWeighted) * 100
        : null;

      // 持有天数：最后卖出日 − 买入日（卖出批次均未填日期时无法计算，保持 null，不回退到买入日）
      let holdDays: number | null = null;
      const buyDate = (r.data['buy_date'] as string) || undefined;
      const lastSellDate = batches
        .map((b) => (b.date as string) || '')
        .filter((d) => !!d)
        .sort()
        .pop();
      if (buyDate && lastSellDate) {
        const start = new Date(buyDate);
        const end = new Date(lastSellDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          holdDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      closed.push({ pnlPercent, holdDays });
    }
  });

  const closedTrades = closed.length;
  // 缺失买入/卖出价格数据（pnlPercent 为 null）的单据不计入胜率与平均盈亏，避免被误当作"盈亏 0%"
  const validPnl = closed.filter((c): c is { pnlPercent: number; holdDays: number | null } => c.pnlPercent !== null);
  const winRecords = validPnl.filter((c) => c.pnlPercent > 0).length;
  const winRate = validPnl.length > 0 ? Math.round((winRecords / validPnl.length) * 100) : null;

  const avgProfitPercent = validPnl.length > 0
    ? Math.round((validPnl.reduce((s, c) => s + c.pnlPercent, 0) / validPnl.length) * 100) / 100
    : null;

  const holdDayValues = closed.map((c) => c.holdDays).filter((d): d is number => d !== null);
  const avgHoldDays = holdDayValues.length > 0
    ? Math.round(holdDayValues.reduce((a, b) => a + b, 0) / holdDayValues.length)
    : null;

  // 平均风险回报比
  const rrValues: number[] = [];
  records.forEach((r) => {
    const rr = r.data['buy_risk_reward'];
    if (rr && String(rr).includes(':')) {
      const num = parseFloat(String(rr));
      if (!isNaN(num)) rrValues.push(num);
    }
  });
  const avgRiskReward = rrValues.length > 0
    ? Math.round((rrValues.reduce((a, b) => a + b, 0) / rrValues.length) * 100) / 100
    : null;

  // 盈亏分布（已清仓单据按 sell_profit_result 或盈亏方向）
  const profitCount: Record<string, number> = {};
  records.forEach((r) => {
    if (!isClosedRecord(r)) return;
    const result = r.data['sell_profit_result'];
    const name = result && String(result).trim() ? String(result) : undefined;
    if (name) {
      profitCount[name] = (profitCount[name] || 0) + 1;
    }
  });
  const profitDistribution = Object.entries(profitCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTrades: records.length,
    totalSellBatches,
    closedTrades,
    winRate,
    avgRiskReward,
    avgHoldDays,
    totalProfitAmount: profitAmountValid ? Math.round(totalProfitAmount * 100) / 100 : null,
    avgProfitPercent,
    profitDistribution,
  };
}

/** 单笔买入/卖出明细行 */
export interface TradeLotDetail {
  type: 'buy' | 'sell';
  date: string;
  price: number | null;
  qty: number | null;
  emotion: string;
  confidence: string;
  strategy: string;
  reason: string;
}

/** 一个投资周期（合并单据）的完整交易明细 */
export interface TradeDetail {
  id: string;
  code: string;
  /** 加权买入价 */
  buyPrice: number | null;
  /** 加权卖出价 */
  sellPrice: number | null;
  pnlPercent: number | null;
  pnlAmount: number | null;
  holdDays: number | null;
  riskReward: string;
  /** 预期持有周期 vs 实际：'符合预期' | '高于预期' | '低于预期' | '' */
  timeframeJudge: string;
  expectedTimeframe: string;
  /** 按时间排序的逐笔买入/卖出明细 */
  lots: TradeLotDetail[];
  status: 'holding' | 'partial' | 'closed';
}

/** 预期持有周期选项对应的天数范围中值（用于与实际持有天数比较） */
function timeframeToDays(tf: string): { min: number; max: number } | null {
  switch (tf) {
    case '1周内': return { min: 0, max: 7 };
    case '1-4周': return { min: 7, max: 28 };
    case '1-3个月': return { min: 28, max: 90 };
    case '3-12个月': return { min: 90, max: 365 };
    case '1年以上': return { min: 365, max: 1095 };
    case '3年以上': return { min: 1095, max: Infinity };
    default: return null;
  }
}

/** 计算逐笔交易明细：每个投资周期一组，含加权买卖价、盈亏、持有天数、按时间排序的逐笔买卖子行 */
/** 从卖出批次计算加权平均卖出价（Σ价×量/Σ量，无有效批次返回 null） */
function calcWeightedSellPrice(batches: SellBatchLike[]): number | null {
  let sellQty = 0;
  let sellCost = 0;
  batches.forEach((b) => {
    const p = toNum(b.price);
    const q = toNum(b.qty);
    if (p !== undefined && q !== undefined && q > 0) { sellCost += p * q; sellQty += q; }
  });
  return sellQty > 0 ? sellCost / sellQty : null;
}

/** 构建逐笔买入明细：优先 merged_buy_lots（第 0 笔取当前记录定性字段，后续从 snapshots 按序取），否则顶层买入字段 */
function buildBuyLotDetails(r: FormRecord, buyPrice: number | null): TradeLotDetail[] {
  const mergedBuyLots = Array.isArray(r.data['merged_buy_lots']) ? (r.data['merged_buy_lots'] as Record<string, unknown>[]) : [];
  const snapshots = Array.isArray(r.data['merged_snapshots'])
      ? (r.data['merged_snapshots'] as { recordId: string; data: Record<string, unknown> }[])
      : [];
  const lots: TradeLotDetail[] = [];
  if (mergedBuyLots.length > 0) {
    mergedBuyLots.forEach((lot, i) => {
      const src = i === 0 ? r.data : (snapshots[i - 1]?.data ?? {});
      lots.push({
        type: 'buy',
        date: String(lot.date ?? ''),
        price: toNum(lot.price) ?? null,
        qty: toNum(lot.qty) ?? null,
        emotion: String(src['buy_emotion_state'] ?? ''),
        confidence: String(src['buy_confidence'] ?? ''),
        strategy: String(src['buy_strategy_tag'] ?? ''),
        reason: '',
      });
    });
  } else {
    lots.push({
      type: 'buy',
      date: String(r.data['buy_date'] ?? ''),
      price: buyPrice,
      qty: toNum(r.data['buy_quantity']) ?? null,
      emotion: String(r.data['buy_emotion_state'] ?? ''),
      confidence: String(r.data['buy_confidence'] ?? ''),
      strategy: String(r.data['buy_strategy_tag'] ?? ''),
      reason: '',
    });
  }
  return lots;
}

/** 计算持有天数（首笔买入日 → 最后卖出日，缺任一日期返回 null） */
function calcHoldDays(buyLots: TradeLotDetail[], sellLots: TradeLotDetail[]): number | null {
  const firstBuyDate = buyLots.map((l) => l.date).filter(Boolean).sort()[0];
  const lastSellDate = sellLots.map((l) => l.date).filter(Boolean).sort().pop();
  if (!firstBuyDate || !lastSellDate) return null;
  const s = new Date(firstBuyDate);
  const e = new Date(lastSellDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

/** 持有周期是否符合预期（buy_timeframe 范围 vs 实际持有天数） */
function judgeTimeframe(holdDays: number | null, expectedTimeframe: string): string {
  if (holdDays === null || !expectedTimeframe) return '';
  const range = timeframeToDays(expectedTimeframe);
  if (!range) return '';
  if (holdDays < range.min) return '低于预期';
  if (holdDays > range.max) return '高于预期';
  return '符合预期';
}

/** 构建单条投资周期明细（calcTradeDetails 的逐记录回调） */
function buildTradeDetailRow(r: FormRecord): TradeDetail {
  const code = String(r.data['buy_company_name'] ?? '').trim();
  const buyPrice = toNum(r.data['buy_price']) ?? null;
  const closed = isClosedRecord(r);
  const batches = readSellBatches(r);
  const sellPrice = calcWeightedSellPrice(batches);

  const totalBuyQty = toNum(r.data['merged_total_qty']) ?? toNum(r.data['buy_quantity']) ?? 0;
  const pnlPercent = buyPrice !== null && sellPrice !== null && buyPrice > 0
      ? Math.round(((sellPrice - buyPrice) / buyPrice) * 10000) / 100
      : null;
  const pnlAmount = buyPrice !== null && sellPrice !== null && totalBuyQty > 0
      ? Math.round((sellPrice - buyPrice) * totalBuyQty * 100) / 100
      : null;

  // 逐笔买入/卖出明细（按日期合并排序）
  const buyLots = buildBuyLotDetails(r, buyPrice);
  const sellLots: TradeLotDetail[] = batches.map((b) => ({
    type: 'sell' as const,
    date: String(b.date ?? ''),
    price: toNum(b.price) ?? null,
    qty: toNum(b.qty) ?? null,
    emotion: String(r.data['sell_emotion_state'] ?? ''),
    confidence: '',
    strategy: '',
    reason: String(b.reason ?? ''),
  }));
  const lots = [...buyLots, ...sellLots].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const holdDays = calcHoldDays(buyLots, sellLots);
  const expectedTimeframe = String(r.data['buy_timeframe'] ?? '').trim();
  const timeframeJudge = judgeTimeframe(holdDays, expectedTimeframe);
  const rr = String(r.data['buy_risk_reward'] ?? '').trim();

  let status: 'holding' | 'partial' | 'closed' = 'holding';
  if (closed) status = 'closed';
  else if (batches.length > 0) status = 'partial';

  return { id: r.id, code, buyPrice, sellPrice, pnlPercent, pnlAmount, holdDays, riskReward: rr, timeframeJudge, expectedTimeframe, lots, status };
}

export function calcTradeDetails(records: FormRecord[]): TradeDetail[] {
  return records.map(buildTradeDetailRow);
}

// ============================================================
// 卖出交易质量统计（基于 Trade + Review 三层模型）
// ============================================================

export interface SellQualityStats {
  /** 卖出次数（SELL Trade 总数） */
  sellCount: number;
  /** 已复盘卖出数（Review 层 lesson 非空） */
  reviewedCount: number;
  /** 卖出胜率（盈利卖出 / 总卖出，按笔计） */
  sellWinRate: number | null;
  /** 过早卖出数（卖出后走势 = 继续大涨/继续小涨） */
  prematureSellCount: number;
  /** 过早卖出占比 */
  prematureSellRate: number | null;
  /** 平均每笔卖出盈亏% */
  avgPnlPerSell: number | null;
  /** 卖出原因分布 */
  sellReasonDistribution: { name: string; count: number }[];
  /** 卖出后走势分布 */
  postSellTrendDistribution: { name: string; count: number }[];
}

/**
 * 计算卖出交易质量统计。
 * 基于 merged_trades + merged_reviews（旧单据经 ensureTradesInitialized 纯计算兼容）。
 * 统计粒度为每笔 SELL Trade（而非每份单据），支持分笔卖出独立复盘分析。
 */
export function calcSellQualityStats(records: FormRecord[]): SellQualityStats {
  let sellCount = 0;
  let reviewedCount = 0;
  let profitableSells = 0;
  let prematureSellCount = 0;
  let pnlSum = 0;
  let pnlCount = 0;
  const reasonCount: Record<string, number> = {};
  const trendCount: Record<string, number> = {};

  records.forEach((r) => {
    // 幂等初始化三层结构（兼容旧单据）
    const initialized = ensureTradesInitialized(r.data);
    const trades = readTrades({ ...r, data: initialized });
    const reviews = readReviews({ ...r, data: initialized });
    const buyPrice = toNum(r.data['buy_price']); // 加权买入价

    const sellTrades = trades.filter((t) => t.type === 'SELL');
    sellTrades.forEach((trade) => {
      sellCount++;

      // 已复盘？
      const review = reviews.find((rv) => rv.trade_id === trade.id);
      if (review && !isFieldEmpty(review.lesson)) reviewedCount++;

      // 盈亏（按笔：卖出价 vs 加权买入价）
      if (buyPrice !== undefined && buyPrice > 0 && trade.price > 0) {
        const pnl = ((trade.price - buyPrice) / buyPrice) * 100;
        pnlSum += pnl;
        pnlCount++;
        if (pnl > 0) profitableSells++;
      }

      // 过早卖出（卖出后继续上涨）
      const trend = review?.post_sell_trend;
      if (trend === '继续大涨' || trend === '继续小涨') {
        prematureSellCount++;
      }

      // 卖出原因分布
      const reason = trade.reason || '未填写';
      reasonCount[reason] = (reasonCount[reason] || 0) + 1;

      // 卖出后走势分布
      if (trend) {
        trendCount[trend] = (trendCount[trend] || 0) + 1;
      }
    });
  });

  const sellWinRate = sellCount > 0 && profitableSells > 0
    ? Math.round((profitableSells / sellCount) * 100)
    : null;
  const prematureSellRate = sellCount > 0 && prematureSellCount > 0
    ? Math.round((prematureSellCount / sellCount) * 100)
    : null;
  const avgPnlPerSell = pnlCount > 0
    ? Math.round((pnlSum / pnlCount) * 100) / 100
    : null;

  const sellReasonDistribution = Object.entries(reasonCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const postSellTrendDistribution = Object.entries(trendCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    sellCount,
    reviewedCount,
    sellWinRate,
    prematureSellCount,
    prematureSellRate,
    avgPnlPerSell,
    sellReasonDistribution,
    postSellTrendDistribution,
  };
}

