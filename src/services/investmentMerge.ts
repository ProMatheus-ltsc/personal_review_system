/**
 * investmentMerge — 投资检查清单数据服务（代码中心三角色模型）
 *
 * 三型单据（record_role 区分）：
 * - position（仓位单）：一个股票代码一份，汇总同代码所有买入/卖出明细，
 *   支持持有中复盘与清仓后投资周期复盘
 * - buy（买入单）：一次买入决策记录，完成后自动建立仓位单，冷静期后复盘买入
 * - sell（卖出单）：一次卖出决策记录，保存后联动刷新仓位单汇总，冷静期后复盘卖出
 *
 * 单据内维护结构化四层模型：
 * - Position 层：单据本身（FormRecord）
 * - Trade 层：data.merged_trades（InvestmentTrade[]，BUY/SELL 每笔带 id/date/price/qty/reason/batch_id）
 * - Trade Review 层：data.merged_reviews（InvestmentReview[]，每笔 Trade 一份，trade_id 关联）
 * - Position Review 层：data.merged_position_review（清仓后生成，投资周期整体复盘）
 *
 * 关键流程：
 * - 买入：linkNewRecord 关联仓位单 → 买入完成后 ensurePositionForBuyRecord 创建/复用仓位单
 * - 卖出：linkNewRecord 关联仓位单 → 保存时 syncPositionFromLinked 重新汇总仓位单
 * - 汇总：syncPositionFromLinked 从关联买入/卖出单派生 merged_buy_lots / merged_sell_lots /
 *   剩余持仓 / 平均价 / 清仓状态（幂等，仅维护仓位单）
 * - 幂等派生：ensureTradesInitialized 为旧数据（merged_buy_lots/merged_sell_lots）派生
 *   merged_trades / merged_reviews（兼容无 role 的历史单据，仅计算不改写用户填写）
 */
import { v4 as uuidv4 } from 'uuid';
import { saveRecord } from '@/services/db';
import type { FormRecord } from '@/types';
import { isFieldEmpty } from '@/utils/formValidation';
// 四层模型类型与字段映射（独立文件，见 investmentMergeTypes.ts）
import {
  SELL_REVIEW_FIELD_MAP,
  POSITION_REVIEW_FIELD_MAP,
  REVIEW_CONTENT_FIELDS,
} from '@/services/investmentMergeTypes';
import type {
  InvestmentTrade,
  InvestmentReview,
  PositionReview,
  SellLot,
  LotInput,
} from '@/services/investmentMergeTypes';
export type {
  InvestmentTrade,
  InvestmentReview,
  PositionReview,
  TradeReview,
  SellLot,
} from '@/services/investmentMergeTypes';
export {
  SELL_REVIEW_FIELD_MAP,
  POSITION_REVIEW_FIELD_MAP,
} from '@/services/investmentMergeTypes';

// ============================================================
// Trade + Review 读取与判断函数
// ============================================================

/** 读取一条投资单据的 Trade 列表（优先 merged_trades，否则返回空数组） */
export function readTrades(r: FormRecord): InvestmentTrade[] {
  return Array.isArray(r.data.merged_trades) ? (r.data.merged_trades as InvestmentTrade[]) : [];
}

/** 读取一条投资单据的 Review 列表（优先 merged_reviews，否则返回空数组） */
export function readReviews(r: FormRecord): InvestmentReview[] {
  return Array.isArray(r.data.merged_reviews) ? (r.data.merged_reviews as InvestmentReview[]) : [];
}

/** 获取所有 SELL Trade（按日期排序） */
export function getSellTrades(r: FormRecord): InvestmentTrade[] {
  return readTrades(r)
    .filter((t) => t.type === 'SELL')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}


/**
 * 乐观判断某笔 SELL Trade 是否已在表单 entries 中复盘。
 * 优先匹配 sell_review_trade_id，否则按序号匹配（兼容未关联的旧条目）。
 */
export function isTradeReviewedInEntries(
  entries: Record<string, unknown>[],
  tradeId?: string,
  tradeIndex?: number
): boolean {
  if (!Array.isArray(entries) || entries.length === 0) return false;
  // 优先按 trade_id 匹配
  if (tradeId) {
    const entry = entries.find((e) => e.sell_review_trade_id === tradeId);
    if (entry) return !isFieldEmpty(entry.sell_lesson);
  }
  // 回退：按序号匹配（旧条目未关联 trade_id 时）
  if (tradeIndex !== undefined && tradeIndex < entries.length) {
    return !isFieldEmpty(entries[tradeIndex].sell_lesson);
  }
  // 未指定 trade：只要有任意条目已复盘即认为已复盘
  return entries.some((e) => !isFieldEmpty(e.sell_lesson));
}

/**
 * 查找待复盘的 SELL Trade（卖出日期 +30 天后仍未复盘）。
 * 用于按每笔卖出独立提醒复盘。
 */
export function findPendingReviewTrades(r: FormRecord): InvestmentTrade[] {
  const sellTrades = getSellTrades(r);
  const reviews = readReviews(r);
  const COOLDOWN_DAYS = 30;
  const now = Date.now();

  return sellTrades.filter((trade) => {
    if (!trade.date) return false;
    const sellDate = new Date(trade.date);
    if (isNaN(sellDate.getTime())) return false;
    const daysSince = Math.floor((now - sellDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < COOLDOWN_DAYS) return false;

    // 已复盘？Trade 层优先
    const review = reviews.find((rv) => rv.trade_id === trade.id);
    if (review && !isFieldEmpty(review.lesson)) return false;

    // 回退到表单 entries
    const entries = Array.isArray(r.data.sell_review_entries)
      ? (r.data.sell_review_entries as Record<string, unknown>[])
      : [];
    const tradeIndex = sellTrades.indexOf(trade);
    if (isTradeReviewedInEntries(entries, trade.id, tradeIndex)) return false;

    return true;
  });
}

// ============================================================
// ensureTradesInitialized — 幂等派生（兼容旧单据）
// ============================================================

/**
 * 幂等初始化 merged_trades / merged_reviews。
 * - 旧单据没有 merged_trades → 从 merged_buy_lots + merged_sell_lots 派生
 * - 旧单据没有 merged_reviews → 从 sell_review_entries 按序关联 SELL trades + 骨架
 * - 已有 merged_trades 但新增了 sell lot → 补充对应 SELL Trade
 * - 已有 merged_reviews 但缺少某 SELL Trade 的 review → 补充骨架
 * 多次调用结果一致（幂等），不破坏已有数据。
 */

/** 从 merged_buy_lots（或顶层买入字段）派生 BUY trades（无 trades 时调用） */
function deriveBuyTrades(result: Record<string, unknown>): InvestmentTrade[] {
  const trades: InvestmentTrade[] = [];
  const buyLots = Array.isArray(result.merged_buy_lots) ? (result.merged_buy_lots as LotInput[]) : [];
  if (buyLots.length > 0) {
    buyLots.forEach((lot, i) => {
      const p = toNum(lot.price);
      const q = toNum(lot.qty);
      if (p !== undefined && q !== undefined) {
        trades.push({ id: `buy_${i}_${uuidv4().slice(0, 8)}`, type: 'BUY', date: lot.date, price: p, qty: q });
      }
    });
  } else {
    const p = toNum(result.buy_price);
    const q = toNum(result.buy_quantity);
    if (p !== undefined && q !== undefined) {
      trades.push({ id: `buy_0_${uuidv4().slice(0, 8)}`, type: 'BUY', date: result.buy_date as string | undefined, price: p, qty: q });
    }
  }
  return trades;
}

/** 从 merged_sell_lots 派生 SELL trades：按 batch_id 去重，仅追加新增批次（保留已有 trades） */
function deriveSellTradesFromLots(result: Record<string, unknown>, base: InvestmentTrade[]): InvestmentTrade[] {
  const trades = [...base];
  const sellLots = Array.isArray(result.merged_sell_lots) ? (result.merged_sell_lots as SellLot[]) : [];
  const existingBatchIds = new Set(trades.filter((t) => t.type === 'SELL').map((t) => t.batch_id));
  sellLots.forEach((lot) => {
    if (lot.batch_id && existingBatchIds.has(lot.batch_id)) return;
    const p = toNum(lot.price);
    const q = toNum(lot.qty);
    if (p !== undefined && q !== undefined) {
      trades.push({
        id: lot.batch_id || `sell_${uuidv4().slice(0, 8)}`,
        type: 'SELL',
        date: lot.date,
        price: p,
        qty: q,
        reason: lot.reason,
        batch_id: lot.batch_id,
      });
    }
  });
  return trades;
}

/**
 * 卖出单（record_role=sell）：自身即一笔卖出决策，但数据里没有 merged_sell_lots
 * （那是仓位单的汇总字段）→ 从顶层卖出字段派生 SELL Trade。
 * 固定 id 'sell_self' 保证幂等（单笔卖出单只有这一笔卖出），供卖出复盘自动关联。
 */
function maybeDeriveSellSelf(result: Record<string, unknown>, trades: InvestmentTrade[]): InvestmentTrade[] {
  if (result.record_role !== 'sell') return trades;
  const sp = toNum(result.sell_exit_price);
  const sq = toNum(result.sell_quantity);
  if (sp === undefined || sq === undefined) return trades;
  if (trades.some((t) => t.type === 'SELL' && t.id === 'sell_self')) return trades;
  return [
    ...trades,
    {
      id: 'sell_self',
      type: 'SELL',
      date: result.sell_date as string | undefined,
      price: sp,
      qty: sq,
      reason: result.sell_reason as string | undefined,
    },
  ];
}

/** 从 sell_review_entries 按序构建 SELL review（旧单据首次派生时使用） */
function deriveSellReviewsFromEntries(result: Record<string, unknown>, sellTrades: InvestmentTrade[]): InvestmentReview[] {
  const entries = Array.isArray(result.sell_review_entries)
      ? (result.sell_review_entries as Record<string, unknown>[])
      : [];
  return sellTrades.map((trade, i) => {
    const entry = entries[i];
    const review: InvestmentReview = { id: uuidv4(), trade_id: trade.id, trade_type: 'SELL' };
    if (entry) {
      Object.entries(SELL_REVIEW_FIELD_MAP).forEach(([entryField, reviewField]) => {
        const val = entry[entryField];
        if (val !== undefined && !isFieldEmpty(val)) {
          (review as unknown as Record<string, unknown>)[reviewField] = val;
        }
      });
    }
    return review;
  });
}

/** 派生 merged_reviews：旧单据从 entries 构建 + BUY 骨架；已有 reviews 做对账（补骨架/移除孤儿） */
function deriveReviews(result: Record<string, unknown>, trades: InvestmentTrade[]): InvestmentReview[] {
  const sellTrades = trades.filter((t) => t.type === 'SELL');
  const buyTrades = trades.filter((t) => t.type === 'BUY');
  const existing = Array.isArray(result.merged_reviews) ? [...(result.merged_reviews as InvestmentReview[])] : [];

  if (existing.length === 0 && (sellTrades.length > 0 || buyTrades.length > 0)) {
    // 旧单据：SELL reviews 从 entries 按序关联 + BUY 骨架（内容由买入字段派生，lesson 暂空）
    return [
      ...deriveSellReviewsFromEntries(result, sellTrades),
      ...buyTrades.map((trade) => ({ id: uuidv4(), trade_id: trade.id, trade_type: 'BUY' as const })),
    ];
  }

  // 已有 reviews：对账 — 移除孤儿 review，补充缺失的 review 骨架
  const allTradeIds = new Set(trades.map((t) => t.id));
  const kept = existing.filter((rv) => allTradeIds.has(rv.trade_id));
  trades.forEach((trade) => {
    if (!kept.some((rv) => rv.trade_id === trade.id)) {
      kept.push({ id: uuidv4(), trade_id: trade.id, trade_type: trade.type });
    }
  });
  return kept;
}

/** Position Review 层：清仓且有卖出价时创建骨架，未清仓时移除（幂等） */
function ensurePositionReviewForClosed(result: Record<string, unknown>): void {
  const isClosed = result.sold_out === true ||
      (result.sell_exit_price !== undefined && result.sell_exit_price !== null &&
          String(result.sell_exit_price).trim() !== '');
  if (isClosed && !result.merged_position_review) {
    result.merged_position_review = { id: uuidv4() } as PositionReview;
  } else if (!isClosed && result.merged_position_review) {
    delete result.merged_position_review;
  }
}

export function ensureTradesInitialized(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };

  // --- 派生 merged_trades（BUY 首次派生 + SELL 按批次去重追加 + 卖出单 sell_self）---
  const existing = Array.isArray(result.merged_trades) ? [...(result.merged_trades as InvestmentTrade[])] : [];
  const trades = existing.length === 0
      ? [...deriveBuyTrades(result), ...deriveSellTradesFromLots(result, [])]
      : deriveSellTradesFromLots(result, existing);
  const finalTrades = maybeDeriveSellSelf(result, trades);
  result.merged_trades = finalTrades;

  // --- 派生 merged_reviews（Trade Review 层，覆盖 BUY + SELL）---
  result.merged_reviews = deriveReviews(result, finalTrades);

  // --- 派生 merged_position_review（Position Review 层，仅清仓时生成）---
  ensurePositionReviewForClosed(result);

  return result;
}

// ============================================================
// syncReviewsFromEntries — 表单条目按 trade_id 同步到 Review 层
// ============================================================

/**
 * 将 sell_review_entries（表单可重复段）按 trade_id 同步到 merged_reviews。
 * - 有对应 entry 的 SELL review：用 entry 字段更新 review（SELL_REVIEW_FIELD_MAP 映射）
 * - 无对应 entry 的 SELL review（删除了条目）：清空复盘内容字段，回骨架
 * - BUY trade reviews 保留不动（内容由买入字段派生）
 * 该函数不修改 merged_trades，只维护 merged_reviews 与 entries 的一致性。
 */
/** 确保每个 SELL/BUY trade 都有 review 骨架，并移除孤儿 review（对应 trade 已不存在） */
function ensureAllTradeReviews(trades: InvestmentTrade[], reviews: InvestmentReview[]): InvestmentReview[] {
  const kept = [...reviews];
  const allTradeIds = new Set(trades.map((t) => t.id));
  const filtered = kept.filter((rv) => allTradeIds.has(rv.trade_id));
  trades.forEach((trade) => {
    if (!filtered.some((rv) => rv.trade_id === trade.id)) {
      filtered.push({ id: uuidv4(), trade_id: trade.id, trade_type: trade.type });
    }
  });
  return filtered;
}

/** 用 entry（或顶层字段）更新 review 的映射字段；字段为空则清空对应 review 字段 */
function syncMappedFields(source: Record<string, unknown>, review: InvestmentReview, skipFields: string[] = []) {
  Object.entries(SELL_REVIEW_FIELD_MAP).forEach(([entryField, reviewField]) => {
    if (skipFields.includes(entryField)) return;
    const val = source[entryField];
    if (val !== undefined && !isFieldEmpty(val)) {
      (review as unknown as Record<string, unknown>)[reviewField] = val;
    } else {
      delete (review as unknown as Record<string, unknown>)[reviewField];
    }
  });
}

/** 清空 review 的复盘内容字段（回骨架，保留 trade 关联） */
function clearReviewContent(review: InvestmentReview) {
  REVIEW_CONTENT_FIELDS.forEach((field) => {
    delete (review as unknown as Record<string, unknown>)[field];
  });
}

/**
 * 将 sell_review_entries（表单可重复段）按 trade_id 同步到 merged_reviews。
 * - 有对应 entry 的 SELL review：用 entry 字段更新 review（SELL_REVIEW_FIELD_MAP 映射）
 * - 无对应 entry 的 SELL review（删除了条目）：清空复盘内容字段，回骨架
 * - BUY trade reviews 保留不动（内容由买入字段派生）
 * 该函数不修改 merged_trades，只维护 merged_reviews 与 entries 的一致性。
 */
export function syncReviewsFromEntries(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  const trades = Array.isArray(result.merged_trades) ? (result.merged_trades as InvestmentTrade[]) : [];
  const sellTrades = trades.filter((t) => t.type === 'SELL');
  const entries = Array.isArray(result.sell_review_entries)
    ? (result.sell_review_entries as Record<string, unknown>[])
    : [];

  let reviews = Array.isArray(result.merged_reviews) ? [...(result.merged_reviews as InvestmentReview[])] : [];
  // 补全 trade 骨架 + 移除孤儿
  reviews = ensureAllTradeReviews(trades, reviews);

  // 按 trade_id 同步 SELL reviews（BUY reviews 不同步，内容由买入字段派生）
  sellTrades.forEach((trade) => {
    const review = reviews.find((rv) => rv.trade_id === trade.id);
    if (!review) return;

    // 卖出单（record_role=sell）：单次复盘，内容存顶层 sell_review_* 字段，
    // 自动关联到本单唯一的 SELL Trade（id='sell_self'），无需用户手动选择
    if (result.record_role === 'sell' && review.trade_id === 'sell_self') {
      syncMappedFields(result, review, ['sell_review_trade_id']);
      return;
    }

    // 仓位单/旧模型：按 sell_review_entries 条目同步（无条目则清空内容回骨架）
    const entry = entries.find((e) => e.sell_review_trade_id === review.trade_id);
    if (entry) {
      syncMappedFields(entry, review);
    } else {
      clearReviewContent(review);
    }
  });

  result.merged_reviews = reviews;
  return result;
}

// ============================================================
// syncPositionReview — 顶层字段同步到 PositionReview 层
// ============================================================

/**
 * 将 position_review_* 顶层字段同步到 merged_position_review。
 * - 清仓时：从顶层字段构建/更新 PositionReview
 * - 未清仓时：移除 PositionReview（回退到持有状态）
 * 该函数维护 merged_position_review 与顶层字段的一致性。
 */
export function syncPositionReview(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  const isClosed = result.sold_out === true ||
    (result.sell_exit_price !== undefined && result.sell_exit_price !== null &&
     String(result.sell_exit_price).trim() !== '');

  if (!isClosed) {
    // 未清仓 → 移除 PositionReview
    delete result.merged_position_review;
    return result;
  }

  // 清仓 → 从顶层字段构建/更新 PositionReview
  let pr = result.merged_position_review as PositionReview | undefined;
  if (!pr) {
    pr = { id: uuidv4() };
  }

  Object.entries(POSITION_REVIEW_FIELD_MAP).forEach(([fieldId, reviewField]) => {
    const val = result[fieldId];
    if (val !== undefined && !isFieldEmpty(val)) {
      (pr as unknown as Record<string, unknown>)[reviewField] = val;
    } else {
      delete (pr as unknown as Record<string, unknown>)[reviewField];
    }
  });

  result.merged_position_review = pr;
  return result;
}


/** 数值转换：空值/非法值返回 undefined（表单字段可能存储为字符串/数字/空） */
function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

/** 加权平均价格：Σ(price × qty) / Σ(qty)，忽略非正数量；无有效批次时返回 undefined */

// ============================================================
// 单据角色模型（Position / Buy / Sell 三型单据）
// 仓位单以股票代码为准，一个代码一份；买入/卖出为独立复盘单
// ============================================================

export const RECORD_ROLE = {
  /** 仓位单：代码维度的汇总看板 + 持有中复盘 + 清仓后投资周期复盘 */
  POSITION: 'position',
  /** 买入单：一次买入决策记录，30 天后复盘买入 */
  BUY: 'buy',
  /** 卖出单：一次卖出决策记录，30 天后复盘卖出 */
  SELL: 'sell',
} as const;

export type RecordRole = (typeof RECORD_ROLE)[keyof typeof RECORD_ROLE];

/** 读取单据角色（无 role 的旧数据返回 undefined） */
export function getRecordRole(r: FormRecord): RecordRole | undefined {
  const role = r.data.record_role as string | undefined;
  if (role === RECORD_ROLE.POSITION || role === RECORD_ROLE.BUY || role === RECORD_ROLE.SELL) {
    return role;
  }
  return undefined;
}

/** 归一化股票代码（大写） */
export function normalizeCode(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

/** 查询某代码的仓位单（存在多个时取最近更新的一条） */
export function findPositionByCode(records: FormRecord[], code: string): FormRecord | undefined {
  const upper = normalizeCode(code);
  if (!upper) return undefined;
  return records
    .filter((r) => getRecordRole(r) === RECORD_ROLE.POSITION)
    .filter((r) => normalizeCode(r.data.buy_company_name) === upper)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
}

/** 收集所有已有仓位代码（用于新建时的快速选择） */
export function collectPositionCodes(records: FormRecord[]): string[] {
  const codes = new Set<string>();
  records.forEach((r) => {
    if (getRecordRole(r) !== RECORD_ROLE.POSITION) return;
    const code = normalizeCode(r.data.buy_company_name);
    if (code) codes.add(code);
  });
  return [...codes].sort();
}

/** 读取仓位单关联的买入单 / 卖出单（linked_*_record_ids） */
export function getLinkedRecords(
  position: FormRecord,
  allRecords: FormRecord[]
): { buyRecords: FormRecord[]; sellRecords: FormRecord[] } {
  const buyIds = Array.isArray(position.data.linked_buy_record_ids)
    ? (position.data.linked_buy_record_ids as string[])
    : [];
  const sellIds = Array.isArray(position.data.linked_sell_record_ids)
    ? (position.data.linked_sell_record_ids as string[])
    : [];
  const byId = new Map(allRecords.map((r) => [r.id, r]));
  return {
    buyRecords: buyIds
      .map((id) => byId.get(id))
      .filter((r): r is FormRecord => !!r)
      .sort((a, b) => String(a.data.buy_date ?? '').localeCompare(String(b.data.buy_date ?? ''))),
    sellRecords: sellIds
      .map((id) => byId.get(id))
      .filter((r): r is FormRecord => !!r)
      .sort((a, b) => String(a.data.sell_date ?? '').localeCompare(String(b.data.sell_date ?? ''))),
  };
}

/**
 * 计算分批买入的「加权平均买入日期」（YYYY-MM-DD）。
 * 与加权平均买入价同思路：Σ(qty × 日期天数) / Σ(qty)，避免多笔买入时
 * 只取首笔或末笔买入日期导致的持仓周期偏差。
 * 仅统计有有效日期且数量 > 0 的批次；无有效批次时返回 undefined。
 */
export function weightedAvgBuyDate(
  buyLots: { date?: string; qty?: string | number }[]
): string | undefined {
  const DAY_MS = 24 * 60 * 60 * 1000;
  let qtySum = 0;
  let daySum = 0;
  buyLots.forEach((lot) => {
    if (!lot.date || String(lot.date).trim() === '') return;
    const q = toNum(lot.qty);
    const t = new Date(String(lot.date).slice(0, 10)).getTime();
    if (q === undefined || q <= 0 || isNaN(t)) return;
    qtySum += q;
    daySum += q * (t / DAY_MS);
  });
  if (qtySum <= 0) return undefined;
  return new Date(Math.round(daySum / qtySum) * DAY_MS).toISOString().slice(0, 10);
}


/**
 * 从关联的买入单/卖出单同步仓位单汇总数据：
 * - merged_buy_lots（逐笔买入明细，来自买入单的买入前段字段）
 * - merged_sell_lots（逐笔卖出明细，来自卖出单的卖出段字段）
 * - merged_total_qty / remaining_qty / sold_out / merged_total_sell_qty
 * - 顶层加权 buy_price / sell_exit_price / sell_date（最后卖出日）
 * 返回新的仓位单数据（不保存，由调用方决定）。
 */
/** 从买入单记录汇总买入批次（含总数量与总成本）；忽略无价/无数量/数量 ≤0 的记录 */
function collectBuyLotsFromRecords(buyRecords: FormRecord[]): { lots: LotInput[]; totalQty: number; cost: number } {
  const lots: LotInput[] = [];
  let totalQty = 0;
  let cost = 0;
  buyRecords.forEach((r) => {
    const p = toNum(r.data.buy_price);
    const q = toNum(r.data.buy_quantity);
    if (p !== undefined && q !== undefined && q > 0) {
      lots.push({ date: (r.data.buy_date as string) || undefined, price: p, qty: q, reason: String(r.data.buy_thesis ?? '') });
      cost += p * q;
      totalQty += q;
    }
  });
  return { lots, totalQty, cost };
}

/** 从卖出单记录汇总卖出批次（含总数量与总成本）；忽略无价/无数量/数量 ≤0 的记录 */
function collectSellLotsFromRecords(sellRecords: FormRecord[]): { lots: LotInput[]; totalQty: number; cost: number } {
  const lots: LotInput[] = [];
  let totalQty = 0;
  let cost = 0;
  sellRecords.forEach((r) => {
    const p = toNum(r.data.sell_exit_price);
    const q = toNum(r.data.sell_quantity);
    if (p !== undefined && q !== undefined && q > 0) {
      lots.push({ date: (r.data.sell_date as string) || undefined, price: p, qty: q, reason: String(r.data.sell_reason ?? '') });
      cost += p * q;
      totalQty += q;
    }
  });
  return { lots, totalQty, cost };
}

/**
 * 从关联的买入单/卖出单同步仓位单汇总数据：
 * - merged_buy_lots（逐笔买入明细，来自买入单的买入前段字段）
 * - merged_sell_lots（逐笔卖出明细，来自卖出单的卖出段字段）
 * - merged_total_qty / remaining_qty / sold_out / merged_total_sell_qty
 * - 顶层加权 buy_price / sell_exit_price / sell_date（最后卖出日）
 * 返回新的仓位单数据（不保存，由调用方决定）。
 */
export function syncPositionFromLinked(
  position: FormRecord,
  buyRecords: FormRecord[],
  sellRecords: FormRecord[]
): FormRecord {
  const data: Record<string, unknown> = { ...position.data };

  // --- 买入侧：从买入单汇总（加权平均价 + 首笔买入日期）---
  const buy = collectBuyLotsFromRecords(buyRecords);
  data.merged_buy_lots = buy.lots;
  data.merged_total_qty = buy.totalQty;
  if (buy.totalQty > 0) {
    data.buy_price = (buy.cost / buy.totalQty).toFixed(4);
    data.buy_date = buyRecords.map((r) => String(r.data.buy_date ?? '')).filter(Boolean).sort()[0] ?? '';
  }

  // --- 卖出侧：从卖出单汇总（加权卖出价 + 最后卖出日）---
  const sell = collectSellLotsFromRecords(sellRecords);
  data.merged_sell_lots = sell.lots;
  data.merged_total_sell_qty = sell.totalQty;
  if (sell.totalQty > 0) {
    data.sell_exit_price = (sell.cost / sell.totalQty).toFixed(4);
    const lastSellDate = sellRecords.map((r) => String(r.data.sell_date ?? '')).filter(Boolean).sort().pop();
    if (lastSellDate) data.last_sell_date = lastSellDate;
    // 顶层 sell_date 恢复为最后卖出日（用于复盘解锁基准）
    data.sell_date = lastSellDate || '';
  }

  // --- 持仓状态：剩余持仓 / 清仓标记 / 卖出状态 ---
  const remaining = buy.totalQty - sell.totalQty;
  const soldOut = buy.totalQty > 0 && remaining === 0;
  data.remaining_qty = remaining > 0 ? remaining : 0;
  data.sold_out = soldOut;
  data.sell_status = soldOut ? 'full' : sell.totalQty > 0 ? 'partial' : '';

  return { ...position, data, updatedAt: new Date().toISOString() };
}

/**
 * 创建买入单（或卖出单）并建立与已有仓位单的关联：
 * - 有仓位单：关联 position_record_id，并把单据 id 追加进仓位单 linked_*_record_ids
 * - 无仓位单：**不创建**（仓位单改为「买入单完成后」由 ensurePositionForBuyRecord 创建）
 * 仓位单汇总在后续 syncPositionFromLinked 时统一刷新。
 */
export async function linkNewRecord(
  newRecord: FormRecord,
  position: FormRecord | undefined
): Promise<{ buyRecord?: FormRecord; sellRecord?: FormRecord; position?: FormRecord }> {
  const role = getRecordRole(newRecord);

  // 无仓位单：仅关联置空（仓位单由买入单完成时创建）
  if (!position) {
    await saveRecord(newRecord);
    return { buyRecord: role === RECORD_ROLE.BUY ? newRecord : undefined, sellRecord: role === RECORD_ROLE.SELL ? newRecord : undefined, position: undefined };
  }

  // 建立关联
  if (role === RECORD_ROLE.BUY) {
    newRecord.data.position_record_id = position.id;
    const linked = Array.isArray(position.data.linked_buy_record_ids)
      ? [...(position.data.linked_buy_record_ids as string[])]
      : [];
    if (!linked.includes(newRecord.id)) linked.push(newRecord.id);
    position.data.linked_buy_record_ids = linked;
  } else if (role === RECORD_ROLE.SELL) {
    newRecord.data.position_record_id = position.id;
    const linked = Array.isArray(position.data.linked_sell_record_ids)
      ? [...(position.data.linked_sell_record_ids as string[])]
      : [];
    if (!linked.includes(newRecord.id)) linked.push(newRecord.id);
    position.data.linked_sell_record_ids = linked;
  }

  // 关键：必须保存买入/卖出单本身（此前缺失导致跳转后记录不存在、代码字段为空）
  await saveRecord(newRecord);
  await saveRecord(position);
  return { position, buyRecord: role === RECORD_ROLE.BUY ? newRecord : undefined, sellRecord: role === RECORD_ROLE.SELL ? newRecord : undefined };
}

/** 建立买入单 ↔ 仓位单的双向关联并保存（幂等：已关联则跳过） */
async function linkBuyToPosition(buyRecord: FormRecord, position: FormRecord): Promise<FormRecord> {
  buyRecord.data.position_record_id = position.id;
  const linked = Array.isArray(position.data.linked_buy_record_ids)
      ? [...(position.data.linked_buy_record_ids as string[])]
      : [];
  if (!linked.includes(buyRecord.id)) linked.push(buyRecord.id);
  position.data.linked_buy_record_ids = linked;
  await saveRecord(buyRecord);
  await saveRecord(position);
  return position;
}

/** 创建仓位单骨架（仅记录代码与首笔买入关联，汇总由 syncPositionFromLinked 刷新） */
function createPositionSkeleton(code: string, buyRecord: FormRecord): FormRecord {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    templateId: 'investment_checklist',
    title: `投资检查清单 - ${code} 持有仓位`,
    data: {
      record_role: RECORD_ROLE.POSITION,
      buy_company_name: code,
      buy_currency: buyRecord.data.buy_currency || 'CNY',
      linked_buy_record_ids: [buyRecord.id],
      linked_sell_record_ids: [],
      merged_buy_lots: [],
      merged_sell_lots: [],
      merged_total_qty: 0,
      merged_total_sell_qty: 0,
      remaining_qty: 0,
      sold_out: false,
      sell_status: '',
    },
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 买入单完成后同步创建仓位单（幂等）：
 * - 已存在同代码仓位单 → 复用并建立关联
 * - 不存在 → 创建仓位单骨架并建立双向关联
 * 返回仓位单（供调用方保存后的汇总刷新）。
 */
export async function ensurePositionForBuyRecord(
  buyRecord: FormRecord,
  allRecords: FormRecord[]
): Promise<FormRecord | undefined> {
  const role = getRecordRole(buyRecord);
  if (role !== RECORD_ROLE.BUY) return undefined;
  const code = normalizeCode(buyRecord.data.buy_company_name);
  if (!code) return undefined;

  // 已有关联仓位单 → 直接返回
  const linkedId = buyRecord.data.position_record_id as string | undefined;
  if (linkedId) {
    const existing = allRecords.find((r) => r.id === linkedId);
    if (existing) return existing;
  }

  // 查同代码仓位单（可能此前已通过其他买入单创建）→ 复用；否则创建骨架
  const position = findPositionByCode(allRecords, code) || createPositionSkeleton(code, buyRecord);
  return linkBuyToPosition(buyRecord, position);
}
