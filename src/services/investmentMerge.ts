/**
 * investmentMerge — 同股票代码投资记录自动合并服务
 *
 * 分笔记录模式：每笔买入/卖出是一条独立的「投资检查清单」记录。
 * 整个投资生命周期最终只保留【一份单据】（Position = 投资周期），单据内维护结构化三层模型：
 *
 * - Position 层：单据本身（FormRecord），贯穿整个投资生命周期
 * - Trade 层：data.merged_trades（InvestmentTrade[]，BUY/SELL 每笔带 id/date/price/qty/reason/batch_id）
 * - Review 层：data.merged_reviews（InvestmentReview[]，每笔 SELL 一份独立复盘，trade_id 关联，lesson 非空 = 已复盘）
 *
 * 兼容层：旧字段 merged_buy_lots / merged_sell_lots / sell_review_entries 保留，
 * 由 ensureTradesInitialized（幂等派生）与 syncReviewsFromEntries（表单条目同步）维护。
 *
 * - 买入合并（mergeSameCodeBuys）：
 *   同股票代码、双方都是「持有中」的开放持仓（买入完成、未清仓）
 *   → 合并成一份持仓单据：加权买入价 + 逐笔买入明细，旧记录删除、快照保留。
 *   部分卖出后的剩余持仓仍然参与买入合并（剩余部分继续合并新买入）。
 *
 * - 卖出批次（applySellBatch）：
 *   在持仓单据上填写卖出并保存时，本次卖出拆成一个批次（日期/价格/数量/原因）
 *   → 立即并入该单据的 merged_sell_lots（加权卖出价 + 逐笔卖出明细），
 *   同时生成 SELL Trade + Review 骨架（待复盘）。
 *   同一持仓单据的多次卖出批次自然合并；不同单据（不同投资周期）互不混合。
 *   - 部分卖出（卖出量 < 总持仓）：清空顶层卖出字段，单据回到「持有中」，
 *     剩余持仓继续支持合并新买入，复盘阶段保持锁定。
 *   - 全部卖出（卖出量 >= 总持仓）：恢复顶层卖出字段
 *     （sell_date = 最后卖出日期，+30 天冷静期后复盘解锁；sell_exit_price = 加权卖出价），
 *     单据标记 sold_out，成为唯一复盘单据，复盘和数据分析都在这一份上做。
 *
 * 阶段定义（投资检查清单）：0 买入 / 1 持有 / 2 卖出 / 3 复盘
 */
import { v4 as uuidv4 } from 'uuid';
import { getAllRecords, saveRecord, deleteRecord } from '@/services/db';
import type { FormRecord } from '@/types';
import { isFieldEmpty } from '@/utils/formValidation';
import { getCurrentPhaseIndex } from '@/utils/formValidation';
import { investmentChecklistTemplate } from '@/templates';

// ============================================================
// Position + Trade + Trade Review + Position Review 四层模型类型定义
// ============================================================

/**
 * Trade 层 — 每一次买卖行为
 * BUY 来自 merged_buy_lots（或顶层买入字段），SELL 来自 merged_sell_lots
 * 加仓属于 BUY（重新判断当前价格是否值得买入）
 */
export interface InvestmentTrade {
  id: string;
  type: 'BUY' | 'SELL';
  date?: string;
  price: number;
  qty: number;
  /** 卖出原因（SELL 才有） */
  reason?: string;
  /** 来源单据 id */
  source_record_id?: string;
  /** 批次标识（同一次卖出编辑会话内多次自动保存去重，SELL 用 batch_id 作为 trade id 保证稳定） */
  batch_id?: string;
}

/**
 * Trade Review 层 — 针对某笔交易（BUY/SELL）的独立复盘
 * 每笔 Trade 对应一份 Review，lesson 非空 = 已复盘
 * SELL 复盘：为什么卖？是否过早？
 * BUY 复盘：为什么买？判断依据？（由买入字段派生）
 */
export interface InvestmentReview {
  id: string;
  /** 关联的 Trade id（BUY 或 SELL） */
  trade_id: string;
  /** 交易类型（BUY/SELL），用于区分复盘内容 */
  trade_type?: 'BUY' | 'SELL';
  /** 复盘日期 */
  reviewed_at?: string;
  /** 买入逻辑验证 */
  thesis_valid?: string;
  /** 做对了什么 */
  what_was_right?: string;
  /** 做错了什么 */
  what_was_wrong?: string;
  /** 核心教训（非空 = 已复盘） */
  lesson?: string;
  /** 同样的机会再来，你还会做吗 */
  would_repeat?: string;
  /** 下次如何调整 */
  adjustment?: string;
  /** 盈亏结果 */
  profit_result?: string;
  /** 卖出后走势（过早卖出识别，SELL 才有） */
  post_sell_trend?: string;
}

/**
 * Position Review 层 — 针对整个投资周期的完整复盘
 * 仅在 Position 清仓（sold_out）后生成，一个 Position 对应一份 Position Review
 * 关注：投资逻辑是否成立、执行过程、仓位管理、最终结果
 */
export interface PositionReview {
  id: string;
  /** 关联的 Position（单据）id */
  position_id: string;
  /** 复盘日期 */
  reviewed_at?: string;
  /** 原始投资逻辑回顾 */
  original_thesis?: string;
  /** 逻辑验证结果 */
  thesis_result?: string;
  /** 最大成功 */
  biggest_success?: string;
  /** 最大失误 */
  biggest_mistake?: string;
  /** 核心教训（非空 = 已复盘） */
  lesson?: string;
  /** 投资总结 */
  conclusion?: string;
}

/** TradeReview 别名（V2 概念对齐） */
export type TradeReview = InvestmentReview;

/**
 * sell_review_entries（表单可重复段）字段 ↔ TradeReview 字段映射
 * 用于 syncReviewsFromEntries 双向同步
 */
export const SELL_REVIEW_FIELD_MAP: Record<string, keyof InvestmentReview> = {
  sell_review_date: 'reviewed_at',
  sell_thesis_valid: 'thesis_valid',
  sell_what_was_right: 'what_was_right',
  sell_what_was_wrong: 'what_was_wrong',
  sell_lesson: 'lesson',
  sell_would_repeat: 'would_repeat',
  sell_adjustment: 'adjustment',
  sell_profit_result: 'profit_result',
  sell_review_trade_id: 'trade_id',
  sell_post_sell_trend: 'post_sell_trend',
};

/**
 * position_review 顶层字段 ↔ PositionReview 字段映射
 * 用于 syncPositionReview 双向同步
 */
export const POSITION_REVIEW_FIELD_MAP: Record<string, keyof PositionReview> = {
  position_review_date: 'reviewed_at',
  position_original_thesis: 'original_thesis',
  position_thesis_result: 'thesis_result',
  position_biggest_success: 'biggest_success',
  position_biggest_mistake: 'biggest_mistake',
  position_lesson: 'lesson',
  position_conclusion: 'conclusion',
};

/** TradeReview 骨架字段（用于判断哪些字段属于复盘内容，清空即回骨架） */
const REVIEW_CONTENT_FIELDS: (keyof InvestmentReview)[] = [
  'reviewed_at', 'thesis_valid', 'what_was_right', 'what_was_wrong',
  'lesson', 'would_repeat', 'adjustment', 'profit_result', 'post_sell_trend',
];

export interface MergeResult {
  merged: number;
  /** 合并后的记录数据（用于同步表单） */
  data: Record<string, unknown>;
  /** 是否已全部卖出（供调用方区分 Toast 文案） */
  soldOut?: boolean;
  /** 剩余持仓（部分卖出时 > 0） */
  remainingQty?: number;
  /** 业务错误（如卖出数量超过剩余持仓），有值时表示本次未做任何合并写入 */
  error?: string;
}

interface LotInput {
  date?: string;
  price?: string | number;
  qty?: string | number;
  reason?: string;
  /** 来源单据 id（同一单据的卖出批次据此去重） */
  source_record_id?: string;
  /** 当前编辑会话的批次标识（同一笔卖出多次自动保存据此更新同一条，而非按取值去重） */
  batch_id?: string;
}

export interface SellLot extends LotInput {}

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

/** 获取所有 BUY Trade（按日期排序） */
export function getBuyTrades(r: FormRecord): InvestmentTrade[] {
  return readTrades(r)
    .filter((t) => t.type === 'BUY')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** 读取一条投资单据的 Position Review（单个对象，清仓后生成） */
export function readPositionReview(r: FormRecord): PositionReview | undefined {
  return r.data.merged_position_review as PositionReview | undefined;
}

/** 判断投资周期是否已复盘（PositionReview 的 lesson 非空） */
export function isPositionReviewed(r: FormRecord): boolean {
  const pr = readPositionReview(r);
  return !!pr && !isFieldEmpty(pr.lesson);
}

/** 判断投资周期是否已清仓（sold_out 或顶层卖出字段非空） */
export function isPositionClosed(r: FormRecord): boolean {
  if (r.data.sold_out === true) return true;
  const sellPrice = r.data.sell_exit_price;
  return sellPrice !== undefined && sellPrice !== null && String(sellPrice).trim() !== '';
}

/** 判断某笔 Review 是否已复盘（lesson 非空） */
export function isTradeReviewed(review: InvestmentReview | undefined): boolean {
  if (!review) return false;
  return !isFieldEmpty(review.lesson);
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
export function ensureTradesInitialized(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };

  // --- 派生 merged_trades ---
  let trades = Array.isArray(result.merged_trades) ? [...(result.merged_trades as InvestmentTrade[])] : [];

  if (trades.length === 0) {
    // 从 merged_buy_lots 派生 BUY trades
    const buyLots = Array.isArray(result.merged_buy_lots) ? (result.merged_buy_lots as LotInput[]) : [];
    if (buyLots.length > 0) {
      buyLots.forEach((lot, i) => {
        const p = toNum(lot.price);
        const q = toNum(lot.qty);
        if (p !== undefined && q !== undefined) {
          trades.push({
            id: `buy_${i}_${uuidv4().slice(0, 8)}`,
            type: 'BUY',
            date: lot.date,
            price: p,
            qty: q,
          });
        }
      });
    } else {
      // 顶层买入字段
      const p = toNum(result.buy_price);
      const q = toNum(result.buy_quantity);
      if (p !== undefined && q !== undefined) {
        trades.push({
          id: `buy_0_${uuidv4().slice(0, 8)}`,
          type: 'BUY',
          date: result.buy_date as string | undefined,
          price: p,
          qty: q,
        });
      }
    }

    // 从 merged_sell_lots 派生 SELL trades（用 batch_id 作为 trade id 保证稳定）
    const sellLots = Array.isArray(result.merged_sell_lots) ? (result.merged_sell_lots as SellLot[]) : [];
    sellLots.forEach((lot) => {
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
          source_record_id: lot.source_record_id,
        });
      }
    });
  } else {
    // 已有 trades：对账 — 补充新增的 sell lot 对应的 SELL Trade
    const sellLots = Array.isArray(result.merged_sell_lots) ? (result.merged_sell_lots as SellLot[]) : [];
    const existingBatchIds = new Set(trades.filter((t) => t.type === 'SELL').map((t) => t.batch_id));
    sellLots.forEach((lot) => {
      if (lot.batch_id && existingBatchIds.has(lot.batch_id)) return;
      const p = toNum(lot.price);
      const q = toNum(lot.qty);
      if (p !== undefined && q !== undefined) {
        const tradeId = lot.batch_id || `sell_${uuidv4().slice(0, 8)}`;
        trades.push({
          id: tradeId,
          type: 'SELL',
          date: lot.date,
          price: p,
          qty: q,
          reason: lot.reason,
          batch_id: lot.batch_id,
          source_record_id: lot.source_record_id,
        });
      }
    });
  }

  result.merged_trades = trades;

  // --- 派生 merged_reviews（Trade Review 层，覆盖 BUY + SELL）---
  let reviews = Array.isArray(result.merged_reviews) ? [...(result.merged_reviews as InvestmentReview[])] : [];
  const allTrades = trades;
  const sellTrades = trades.filter((t) => t.type === 'SELL');
  const buyTrades = trades.filter((t) => t.type === 'BUY');

  if (reviews.length === 0 && (sellTrades.length > 0 || buyTrades.length > 0)) {
    // 旧单据：SELL reviews 从 sell_review_entries 按序关联
    const entries = Array.isArray(result.sell_review_entries)
      ? (result.sell_review_entries as Record<string, unknown>[])
      : [];

    // SELL Trade Reviews
    sellTrades.forEach((trade, i) => {
      const entry = entries[i];
      const review: InvestmentReview = {
        id: uuidv4(),
        trade_id: trade.id,
        trade_type: 'SELL',
      };
      if (entry) {
        Object.entries(SELL_REVIEW_FIELD_MAP).forEach(([entryField, reviewField]) => {
          const val = entry[entryField];
          if (val !== undefined && !isFieldEmpty(val)) {
            (review as unknown as Record<string, unknown>)[reviewField] = val;
          }
        });
      }
      reviews.push(review);
    });

    // BUY Trade Reviews（骨架 — BUY 复盘内容由买入字段派生，lesson 暂为空）
    buyTrades.forEach((trade) => {
      reviews.push({
        id: uuidv4(),
        trade_id: trade.id,
        trade_type: 'BUY',
      });
    });
  } else {
    // 已有 reviews：对账 — 补充缺失的 review 骨架（BUY + SELL），移除孤儿 review
    const allTradeIds = new Set(allTrades.map((t) => t.id));
    reviews = reviews.filter((rv) => allTradeIds.has(rv.trade_id));

    allTrades.forEach((trade) => {
      if (!reviews.some((rv) => rv.trade_id === trade.id)) {
        reviews.push({
          id: uuidv4(),
          trade_id: trade.id,
          trade_type: trade.type,
        });
      }
    });
  }

  result.merged_reviews = reviews;

  // --- 派生 merged_position_review（Position Review 层，仅清仓时生成）---
  const isClosed = result.sold_out === true ||
    (result.sell_exit_price !== undefined && result.sell_exit_price !== null &&
     String(result.sell_exit_price).trim() !== '');

  if (isClosed && !result.merged_position_review) {
    // 清仓但无 PositionReview → 创建骨架
    result.merged_position_review = {
      id: uuidv4(),
      position_id: String(result._recordId || ''),
    } as PositionReview;
  } else if (!isClosed && result.merged_position_review) {
    // 未清仓但有 PositionReview（撤销卖出后回退）→ 移除
    delete result.merged_position_review;
  }

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
export function syncReviewsFromEntries(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  const trades = Array.isArray(result.merged_trades) ? (result.merged_trades as InvestmentTrade[]) : [];
  const sellTrades = trades.filter((t) => t.type === 'SELL');
  const buyTrades = trades.filter((t) => t.type === 'BUY');
  const entries = Array.isArray(result.sell_review_entries)
    ? (result.sell_review_entries as Record<string, unknown>[])
    : [];

  let reviews = Array.isArray(result.merged_reviews) ? [...(result.merged_reviews as InvestmentReview[])] : [];

  // 确保每个 SELL trade 都有 review
  sellTrades.forEach((trade) => {
    if (!reviews.some((rv) => rv.trade_id === trade.id)) {
      reviews.push({ id: uuidv4(), trade_id: trade.id, trade_type: 'SELL' });
    }
  });

  // 确保每个 BUY trade 都有 review 骨架
  buyTrades.forEach((trade) => {
    if (!reviews.some((rv) => rv.trade_id === trade.id)) {
      reviews.push({ id: uuidv4(), trade_id: trade.id, trade_type: 'BUY' });
    }
  });

  // 移除孤儿 review（对应 trade 已不存在）
  const allTradeIds = new Set(trades.map((t) => t.id));
  reviews = reviews.filter((rv) => allTradeIds.has(rv.trade_id));

  // 按 trade_id 同步 SELL entries → reviews（BUY reviews 不从 entries 同步）
  reviews.forEach((review) => {
    if (review.trade_type === 'BUY') return; // BUY review 跳过 entries 同步
    const entry = entries.find((e) => e.sell_review_trade_id === review.trade_id);
    if (entry) {
      // 用 entry 字段更新 review
      Object.entries(SELL_REVIEW_FIELD_MAP).forEach(([entryField, reviewField]) => {
        const val = entry[entryField];
        if (val !== undefined && !isFieldEmpty(val)) {
          (review as unknown as Record<string, unknown>)[reviewField] = val;
        } else {
          // entry 字段为空 → 清空 review 对应字段
          delete (review as unknown as Record<string, unknown>)[reviewField];
        }
      });
    } else {
      // 无对应 entry → 清空复盘内容，回骨架
      REVIEW_CONTENT_FIELDS.forEach((field) => {
        delete (review as unknown as Record<string, unknown>)[field];
      });
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
    pr = { id: uuidv4(), position_id: String(result._recordId || '') };
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

/** 阶段索引：0 买入 / 1 持有 / 3 复盘（投资检查清单模板） */
const PHASE_BUYING = 0;
const PHASE_HOLDING = 1;
const PHASE_REVIEW = 3;

/** 投资检查清单模板的 phases 配置引用（供阶段计算使用） */
const phases = investmentChecklistTemplate.phases!;

/** 数值转换：空值/非法值返回 undefined（表单字段可能存储为字符串/数字/空） */
function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

/** 加权平均价格：Σ(price × qty) / Σ(qty)，忽略非正数量；无有效批次时返回 undefined */
function weightedAvg(lots: { price: number; qty: number }[]): number | undefined {
  let qty = 0;
  let cost = 0;
  for (const l of lots) {
    if (l.qty <= 0) continue;
    cost += l.price * l.qty;
    qty += l.qty;
  }
  return qty > 0 ? cost / qty : undefined;
}

/** 判断单据是否已填写卖出价（顶层卖出字段非空 = 已发生卖出） */
function isSellFilled(r: FormRecord): boolean {
  return !isFieldEmpty(r.data.sell_exit_price);
}

/** 计算某条投资记录当前所处的阶段索引 */
function phaseOf(r: FormRecord): number {
  return getCurrentPhaseIndex(
      phases,
      r.data as Record<string, any>,
      investmentChecklistTemplate.sections,
      r.createdAt
  );
}

/** 收集一条记录的买入批次（优先使用已有的合并明细，否则用字段值） */
function collectBuyLots(r: FormRecord, source: string): { date?: string; price: number; qty: number; source: string }[] {
  const lots: { date?: string; price: number; qty: number; source: string }[] = [];
  const date = (r.data.buy_date as string) || undefined;
  const existing = Array.isArray(r.data.merged_buy_lots) ? (r.data.merged_buy_lots as LotInput[]) : [];
  if (existing.length > 0) {
    existing.forEach((l) => {
      const p = toNum(l.price);
      const q = toNum(l.qty);
      if (p !== undefined && q !== undefined) lots.push({ date: l.date || date, price: p, qty: q, source });
    });
  } else {
    const p = toNum(r.data.buy_price);
    const q = toNum(r.data.buy_quantity);
    if (p !== undefined && q !== undefined) lots.push({ date, price: p, qty: q, source });
  }
  return lots;
}

/** 收集被吸收（合并）记录的完整快照：保留其标题与全部填写数据，供回看买入细节 */
function appendSnapshots(currentData: Record<string, unknown>, absorbees: FormRecord[]): unknown[] {
  const snapshots = Array.isArray(currentData.merged_snapshots) ? [...(currentData.merged_snapshots as unknown[])] : [];
  absorbees.forEach((r) => {
    snapshots.push({ recordId: r.id, title: r.title, data: r.data });
  });
  return snapshots;
}

/** 读取一条记录的累计卖出批次（合并明细） */
function readSellLots(r: FormRecord): SellLot[] {
  return Array.isArray(r.data.merged_sell_lots) ? (r.data.merged_sell_lots as SellLot[]) : [];
}

/** 计算一条记录的总买入数量（优先合并总量，否则单笔数量） */
function totalBuyQtyOf(r: FormRecord): number {
  return toNum(r.data.merged_total_qty) ?? toNum(r.data.buy_quantity) ?? 0;
}

/**
 * 判断是否为「持有中」的开放持仓记录：
 * 买入阶段已完成（phase >= 1）且未卖出、且未清仓（sold_out）。
 * 部分卖出后的剩余持仓（merged_sell_lots 非空但顶层卖出字段已清空）仍视为开放持仓，
 * 可继续合并新买入的同代码记录。
 */
function isOpenPosition(r: FormRecord): boolean {
  if (r.data.sold_out === true) return false;
  if (isSellFilled(r)) return false;
  return phaseOf(r) >= PHASE_HOLDING;
}

/** 顶层卖出字段列表（拆分后需要从持仓单据上清空，使其回到持有状态） */
const SELL_TOP_LEVEL_FIELDS = [
  'sell_date',
  'sell_exit_price',
  'sell_quantity',
  'sell_reason',
  'sell_reason_other',
  'sell_pnl_percent',
  'sell_hold_days',
  'sell_emotion_state',
  'sell_check_reason',
  'sell_check_rebuy',
  '_sell_batch_id',
];

/**
 * 买入合并：同代码、双方都是持有中的开放持仓 → 合并成一份持仓单据
 * - 被吸收记录的卖出批次（merged_sell_lots）一并并入当前单据，不丢失
 * - 部分卖出后的持仓单仍可参与（剩余持仓继续合并新买入）；
 *   合并后如果带有历史卖出批次，顶层卖出字段保持清空（只有全部卖出才应该非空），
 *   避免刚合并的持仓被误判为「已清仓」而从持仓列表消失、或被下次自动保存误当作新卖出处理
 * @returns 合并数量与合并后的数据；不满足前提时返回 null
 */
export async function mergeSameCodeBuys(current: FormRecord): Promise<MergeResult | null> {
  const code = String(current.data.buy_company_name ?? '').trim();
  if (!code) return null;
  // 前提：当前单据是开放持仓（买入完成、未清仓）
  if (!isOpenPosition(current)) return null;

  const all = await getAllRecords('investment_checklist');
  const absorbees = all.filter(
      (r) =>
          r.id !== current.id &&
          String(r.data.buy_company_name ?? '').trim() === code &&
          isOpenPosition(r)
  );
  if (absorbees.length === 0) return null;

  const lots = [...collectBuyLots(current, '当前记录')];
  absorbees.forEach((r) => lots.push(...collectBuyLots(r, '历史记录')));

  // 被吸收记录的历史卖出批次一并并入（同一投资周期内的部分卖出明细不丢失）
  const sellLots = [...readSellLots(current)];
  absorbees.forEach((r) => sellLots.push(...readSellLots(r)));

  const weighted = weightedAvg(lots);
  const totalQty = lots.reduce((s, l) => s + l.qty, 0);
  const totalSellQty = sellLots.reduce((s, l) => s + (toNum(l.qty) ?? 0), 0);
  const data: Record<string, unknown> = { ...current.data };
  if (weighted !== undefined) data.buy_price = weighted.toFixed(4);
  data.merged_buy_lots = lots;
  data.merged_total_qty = totalQty;
  data.merged_sell_lots = sellLots;
  data.merged_total_sell_qty = totalSellQty;
  data.merged_snapshots = appendSnapshots(current.data, absorbees);

  // 合并 Trade 层 + Review 层：当前记录 + 被吸收记录的 merged_trades / merged_reviews
  // 先 ensureTradesInitialized 确保三层结构存在，再合并
  let initializedData = ensureTradesInitialized(data);
  const currentTrades = Array.isArray(initializedData.merged_trades) ? (initializedData.merged_trades as InvestmentTrade[]) : [];
  const currentReviews = Array.isArray(initializedData.merged_reviews) ? (initializedData.merged_reviews as InvestmentReview[]) : [];
  const mergedTrades: InvestmentTrade[] = [...currentTrades];
  const mergedReviews: InvestmentReview[] = [...currentReviews];
  absorbees.forEach((r) => {
    const rData = ensureTradesInitialized(r.data);
    const rTrades = Array.isArray(rData.merged_trades) ? (rData.merged_trades as InvestmentTrade[]) : [];
    const rReviews = Array.isArray(rData.merged_reviews) ? (rData.merged_reviews as InvestmentReview[]) : [];
    mergedTrades.push(...rTrades);
    mergedReviews.push(...rReviews);
  });
  data.merged_trades = mergedTrades;
  data.merged_reviews = mergedReviews;
  // 被吸收记录带着历史卖出批次 → 这是「部分卖出后又追加买入」的持仓：
  // 买入合并只影响买入侧，顶层卖出字段必须保持清空（sell_exit_price 等只应在全部
  // 卖出时由 applySellBatch 恢复），否则会被 isOpenPosition/isClosedRecord 误判为
  // 「已清仓」从当前持仓消失，且下次自动保存会被 applySellBatch 当成新的一笔卖出、
  // 把刚合并进来的买入份额也一并清空
  if (totalSellQty > 0) {
    SELL_TOP_LEVEL_FIELDS.forEach((f) => {
      data[f] = '';
    });
    // 恢复卖出日期为当天：下次进入卖出阶段时默认显示今天
    data.sell_date = new Date().toISOString().slice(0, 10);
    data.sold_out = false;
    data.sell_status = 'partial';
    data.remaining_qty = totalQty - totalSellQty;
  }

  const updated: FormRecord = { ...current, data, updatedAt: new Date().toISOString() };
  await saveRecord(updated);
  for (const r of absorbees) await deleteRecord(r.id);
  return { merged: absorbees.length, data };
}

/**
 * 卖出批次拆分并入（在持仓单据上填写卖出并保存时触发）：
 * 把本次卖出（sell_date / sell_exit_price / sell_quantity / sell_reason）
 * 拆成一个批次并入单据自身的 merged_sell_lots。同一次卖出编辑会话内的多次自动保存
 * 通过 _sell_batch_id 识别为同一批次并更新，而不是按取值匹配去重——避免两笔日期、
 * 价格、数量恰好相同的独立卖出被误合并丢单。
 *
 * - 部分卖出：清空顶层卖出字段（含 _sell_batch_id），单据保持「持有中」，复盘锁定；
 * - 全部卖出（卖出数量 = 总持仓数量）：恢复顶层卖出字段（sell_date = 最后卖出日期，
 *   +30 天解锁复盘；sell_exit_price = 加权卖出价），标记 sold_out。
 * - 超卖（卖出数量 > 剩余持仓）：视为数据错误，返回 error，不做任何写入。
 *   仅当已知总买入数量（merged_total_qty 或 buy_quantity）时才做超卖校验；
 *   历史记录未填写买入数量时无法判断剩余持仓，不拦截，首次卖出即视为清仓。
 *
 * @returns 合并后的数据；未填卖出价格时返回 null；超卖/数量非法时返回 { error }
 */
export async function applySellBatch(current: FormRecord): Promise<MergeResult | null> {
  const code = String(current.data.buy_company_name ?? '').trim();
  if (!code) return null;
  const price = toNum(current.data.sell_exit_price);
  if (price === undefined) return null;

  // 已累计的卖出批次 + 本次批次
  const lots = readSellLots(current);
  const sellDate = (current.data.sell_date as string) || undefined;
  const qtyInput = toNum(current.data.sell_quantity);
  const reason = (current.data.sell_reason as string) || undefined;
  const totalBuy = totalBuyQtyOf(current);
  const totalSellBefore = lots.reduce((s, l) => s + (toNum(l.qty) ?? 0), 0);

  if (qtyInput !== undefined && qtyInput <= 0) {
    return { merged: 0, data: current.data, error: '卖出数量必须大于 0' };
  }

  // 未填写卖出数量时默认卖出全部剩余持仓（仅当已知总买入数量时才能算出剩余）
  const knownTotalBuy = totalBuy > 0;
  const remainingBefore = totalBuy - totalSellBefore;
  const qty = qtyInput ?? (knownTotalBuy ? remainingBefore : undefined);
  if (qty === undefined) {
    return { merged: 0, data: current.data, error: '未记录买入数量，无法判断剩余持仓，请填写本次卖出数量' };
  }

  // 超卖校验：仅当已知总买入数量时才拦截（历史记录未填写买入数量时不做校验）
  if (knownTotalBuy && qty > remainingBefore) {
    return {
      merged: 0,
      data: current.data,
      error: `卖出数量（${qty}）超过剩余持仓（${remainingBefore}），请修改后重新保存`,
    };
  }

  // 同一批次（同一次卖出编辑会话内的多次自动保存）按 _sell_batch_id 识别更新；
  // 找不到已有 id 或对应批次时，视为一笔新的卖出，生成新 id
  const existingBatchId = (current.data._sell_batch_id as string) || undefined;
  const existingIdx = existingBatchId ? lots.findIndex((l) => l.batch_id === existingBatchId) : -1;
  const batchId = existingIdx >= 0 ? existingBatchId! : uuidv4();

  const batch: SellLot = {
    date: sellDate,
    price,
    qty,
    reason,
    source_record_id: current.id,
    batch_id: batchId,
  };

  if (existingIdx >= 0) {
    lots[existingIdx] = { ...lots[existingIdx], ...batch };
  } else {
    lots.push(batch);
  }

  const totalSell = lots.reduce((s, l) => s + (toNum(l.qty) ?? 0), 0);
  const sellWeighted = weightedAvg(lots.map((l) => ({ price: toNum(l.price) ?? 0, qty: toNum(l.qty) ?? 0 })));
  const lastSellDate = lots
      .map((l) => l.date)
      .filter((d): d is string => !!d)
      .sort()
      .pop();
  // 未知总买入数量的历史记录：无法判断部分/全部，首次卖出即视为清仓
  const remaining = knownTotalBuy ? totalBuy - totalSell : 0;
  const soldOut = knownTotalBuy ? remaining === 0 : true;

  const data: Record<string, unknown> = { ...current.data };
  data.merged_sell_lots = lots;
  data.merged_total_sell_qty = totalSell;
  if (sellWeighted !== undefined) data.sell_exit_price = sellWeighted.toFixed(4);
  if (lastSellDate) data.last_sell_date = lastSellDate;
  data.sold_out = soldOut;

  // --- Trade 层：新增/更新 SELL Trade ---
  let trades = Array.isArray(data.merged_trades) ? [...(data.merged_trades as InvestmentTrade[])] : [];
  if (trades.length === 0 && (Array.isArray(data.merged_buy_lots) || toNum(data.buy_price) !== undefined)) {
    // 旧单据首次卖出：先初始化 trades
    const initialized = ensureTradesInitialized(data);
    trades = Array.isArray(initialized.merged_trades) ? [...(initialized.merged_trades as InvestmentTrade[])] : [];
  }
  // 用 batchId 作为 trade id 保证稳定（同一次卖出会话的自动保存更新同一条）
  const tradeId = batchId;
  const existingTradeIdx = trades.findIndex((t) => t.id === tradeId || t.batch_id === batchId);
  const sellTrade: InvestmentTrade = {
    id: tradeId,
    type: 'SELL',
    date: sellDate,
    price,
    qty,
    reason,
    source_record_id: current.id,
    batch_id: batchId,
  };
  if (existingTradeIdx >= 0) {
    trades[existingTradeIdx] = { ...trades[existingTradeIdx], ...sellTrade };
  } else {
    trades.push(sellTrade);
  }
  data.merged_trades = trades;

  // --- Review 层：新增 SELL Trade 对应的复盘骨架（如尚未存在）---
  let reviews = Array.isArray(data.merged_reviews) ? [...(data.merged_reviews as InvestmentReview[])] : [];
  if (!reviews.some((rv) => rv.trade_id === tradeId)) {
    reviews.push({ id: uuidv4(), trade_id: tradeId, trade_type: 'SELL' });
  }
  data.merged_reviews = reviews;

  // --- Position Review 层：清仓时自动生成投资周期复盘骨架 ---
  if (soldOut && !data.merged_position_review) {
    data.merged_position_review = {
      id: uuidv4(),
      position_id: current.id,
    } as PositionReview;
  }

  if (soldOut) {
    // 全部卖出：恢复顶层卖出字段 → 阶段推进到「已卖出」，sell_date = 最后卖出日期 → 30 天后复盘解锁
    data.sell_date = lastSellDate || sellDate;
    data.sell_quantity = String(totalSell);
    data.sell_status = 'full';
    // sell_exit_price 已是加权卖出价；sell_reason 取最后一批的原因
    data.sell_reason = reason ?? lots[lots.length - 1]?.reason ?? '';
    data.remaining_qty = 0;
    data._sell_batch_id = '';
  } else {
    // 部分卖出：清空顶层卖出字段（含批次标识），回到持有状态，复盘保持锁定
    SELL_TOP_LEVEL_FIELDS.forEach((f) => {
      data[f] = '';
    });
    // 恢复卖出日期为当天：下次进入卖出阶段时默认显示今天，免去用户重复填写
    data.sell_date = new Date().toISOString().slice(0, 10);
    data.sell_status = 'partial';
    data.remaining_qty = remaining;
  }

  const updated: FormRecord = { ...current, data, updatedAt: new Date().toISOString() };
  await saveRecord(updated);
  return { merged: lots.length - (existingIdx >= 0 ? 1 : 0), data, soldOut, remainingQty: remaining };
}

/**
 * 撤销最近一笔卖出：从 merged_sell_lots 移除最后一批，重算加权卖出价/总卖出量/剩余持仓。
 * 仅当尚未复盘（sell_review_entries 为空）时可撤销，避免修改已沉淀的复盘结论。
 * @returns 撤销后的数据；无可撤销或已复盘时返回 { error }
 */
export async function undoLastSellBatch(current: FormRecord): Promise<MergeResult | null> {
  const code = String(current.data.buy_company_name ?? '').trim();
  if (!code) return null;

  const lots = readSellLots(current);
  if (lots.length === 0) {
    return { merged: 0, data: current.data, error: '没有可撤销的卖出记录' };
  }

  // 已复盘则不允许撤销（卖出复盘为可重复段，检查是否已有核心教训）
  const reviewEntries = current.data.sell_review_entries as Record<string, unknown>[] | undefined;
  const reviewed = Array.isArray(reviewEntries) && reviewEntries.some((e) => !isFieldEmpty(e.sell_lesson));
  if (reviewed) {
    return { merged: 0, data: current.data, error: '已填写卖出复盘，无法撤销卖出记录' };
  }

  const newLots = lots.slice(0, -1);
  const totalSell = newLots.reduce((s, l) => s + (toNum(l.qty) ?? 0), 0);
  const sellWeighted = weightedAvg(newLots.map((l) => ({ price: toNum(l.price) ?? 0, qty: toNum(l.qty) ?? 0 })));
  const lastSellDate = newLots
      .map((l) => l.date)
      .filter((d): d is string => !!d)
      .sort()
      .pop();
  const totalBuy = totalBuyQtyOf(current);
  const knownTotalBuy = totalBuy > 0;
  const remaining = knownTotalBuy ? totalBuy - totalSell : 0;
  // 撤销后不再有任何卖出批次：完全回到「未卖出」状态；否则仅当已知总买入数量且刚好卖完时才算清仓
  const soldOut = newLots.length > 0 && knownTotalBuy && remaining === 0;

  // 被撤销的卖出批次（用于定位要移除的 Trade + Review）
  const removedLot = lots[lots.length - 1];
  const removedTradeId = removedLot?.batch_id;

  const data: Record<string, unknown> = { ...current.data };
  data.merged_sell_lots = newLots;
  data.merged_total_sell_qty = totalSell;
  if (sellWeighted !== undefined) data.sell_exit_price = sellWeighted.toFixed(4);
  else data.sell_exit_price = '';
  if (lastSellDate) data.last_sell_date = lastSellDate;
  else data.last_sell_date = '';
  data.sold_out = soldOut;

  // --- Trade 层 + Review 层：移除被撤销的 SELL Trade 及其 Review ---
  if (removedTradeId) {
    let trades = Array.isArray(data.merged_trades) ? (data.merged_trades as InvestmentTrade[]) : [];
    trades = trades.filter((t) => t.id !== removedTradeId && t.batch_id !== removedTradeId);
    data.merged_trades = trades;

    let reviews = Array.isArray(data.merged_reviews) ? (data.merged_reviews as InvestmentReview[]) : [];
    reviews = reviews.filter((rv) => rv.trade_id !== removedTradeId);
    data.merged_reviews = reviews;
  }

  if (newLots.length === 0) {
    // 没有任何卖出批次剩余：彻底回到「未卖出」状态
    SELL_TOP_LEVEL_FIELDS.forEach((f) => {
      data[f] = '';
    });
    // 恢复卖出日期为当天：下次进入卖出阶段时默认显示今天
    data.sell_date = new Date().toISOString().slice(0, 10);
    data.sell_status = '';
    data.remaining_qty = knownTotalBuy ? totalBuy : 0;
  } else if (soldOut) {
    data.sell_date = lastSellDate || '';
    data.sell_quantity = String(totalSell);
    data.sell_status = 'full';
    data.sell_reason = newLots[newLots.length - 1]?.reason ?? '';
    data.remaining_qty = 0;
  } else {
    SELL_TOP_LEVEL_FIELDS.forEach((f) => {
      data[f] = '';
    });
    // 恢复卖出日期为当天：下次进入卖出阶段时默认显示今天
    data.sell_date = new Date().toISOString().slice(0, 10);
    data.sell_status = 'partial';
    data.remaining_qty = remaining;
  }

  const updated: FormRecord = { ...current, data, updatedAt: new Date().toISOString() };
  await saveRecord(updated);
  return { merged: newLots.length, data, soldOut, remainingQty: remaining };
}

export { PHASE_BUYING, PHASE_HOLDING, PHASE_REVIEW };

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

  // --- 买入侧：从买入单汇总 ---
  const buyLots: { date?: string; price: string | number; qty: string | number; reason?: string; source_record_id: string }[] = [];
  let totalBuyQty = 0;
  let buyCost = 0;
  buyRecords.forEach((r) => {
    const p = toNum(r.data.buy_price);
    const q = toNum(r.data.buy_quantity);
    if (p !== undefined && q !== undefined && q > 0) {
      buyLots.push({
        date: (r.data.buy_date as string) || undefined,
        price: p,
        qty: q,
        reason: String(r.data.buy_thesis ?? ''),
        source_record_id: r.id,
      });
      buyCost += p * q;
      totalBuyQty += q;
    }
  });
  data.merged_buy_lots = buyLots;
  data.merged_total_qty = totalBuyQty;
  if (totalBuyQty > 0) {
    data.buy_price = (buyCost / totalBuyQty).toFixed(4);
    data.buy_date = buyRecords.map((r) => String(r.data.buy_date ?? '')).filter(Boolean).sort()[0] ?? '';
  }

  // --- 卖出侧：从卖出单汇总 ---
  const sellLots: { date?: string; price: string | number; qty: string | number; reason?: string; source_record_id: string }[] = [];
  let totalSellQty = 0;
  let sellCost = 0;
  sellRecords.forEach((r) => {
    const p = toNum(r.data.sell_exit_price);
    const q = toNum(r.data.sell_quantity);
    if (p !== undefined && q !== undefined && q > 0) {
      sellLots.push({
        date: (r.data.sell_date as string) || undefined,
        price: p,
        qty: q,
        reason: String(r.data.sell_reason ?? ''),
        source_record_id: r.id,
      });
      sellCost += p * q;
      totalSellQty += q;
    }
  });
  data.merged_sell_lots = sellLots;
  data.merged_total_sell_qty = totalSellQty;
  if (totalSellQty > 0) {
    data.sell_exit_price = (sellCost / totalSellQty).toFixed(4);
    const lastSellDate = sellRecords.map((r) => String(r.data.sell_date ?? '')).filter(Boolean).sort().pop();
    if (lastSellDate) data.last_sell_date = lastSellDate;
    // 顶层 sell_date 恢复为最后卖出日（用于 30 天复盘解锁）
    data.sell_date = lastSellDate || '';
  }

  // --- 持仓状态 ---
  const remaining = totalBuyQty - totalSellQty;
  const soldOut = totalBuyQty > 0 && remaining === 0;
  data.remaining_qty = remaining > 0 ? remaining : 0;
  data.sold_out = soldOut;
  data.sell_status = soldOut ? 'full' : totalSellQty > 0 ? 'partial' : '';

  return { ...position, data, updatedAt: new Date().toISOString() };
}

/**
 * 创建买入单（或卖出单）并建立与仓位单的关联：
 * - 有仓位单：关联 position_record_id，并把单据 id 追加进仓位单 linked_*_record_ids
 * - 无仓位单：同时创建仓位单（role=position），建立双向关联
 * 仓位单汇总在后续 syncPositionFromLinked 时统一刷新。
 */
export async function linkNewRecord(
  newRecord: FormRecord,
  position: FormRecord | undefined
): Promise<{ buyRecord?: FormRecord; sellRecord?: FormRecord; position: FormRecord }> {
  const role = getRecordRole(newRecord);
  const code = normalizeCode(newRecord.data.buy_company_name);

  let positionData = position;
  // 无仓位单：创建仓位单骨架（仅记录代码与首笔关联）
  if (!positionData) {
    const now = new Date().toISOString();
    positionData = {
      id: uuidv4(),
      templateId: 'investment_checklist',
      title: `投资检查清单 - ${code} 持有仓位`,
      data: {
        record_role: RECORD_ROLE.POSITION,
        buy_company_name: code,
        buy_currency: newRecord.data.buy_currency || 'CNY',
        linked_buy_record_ids: [],
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
    await saveRecord(positionData);
  }

  // 建立关联
  if (role === RECORD_ROLE.BUY) {
    newRecord.data.position_record_id = positionData.id;
    const linked = Array.isArray(positionData.data.linked_buy_record_ids)
      ? [...(positionData.data.linked_buy_record_ids as string[])]
      : [];
    if (!linked.includes(newRecord.id)) linked.push(newRecord.id);
    positionData.data.linked_buy_record_ids = linked;
  } else if (role === RECORD_ROLE.SELL) {
    newRecord.data.position_record_id = positionData.id;
    const linked = Array.isArray(positionData.data.linked_sell_record_ids)
      ? [...(positionData.data.linked_sell_record_ids as string[])]
      : [];
    if (!linked.includes(newRecord.id)) linked.push(newRecord.id);
    positionData.data.linked_sell_record_ids = linked;
  }

  // 关键：必须保存买入/卖出单本身（此前缺失导致跳转后记录不存在、代码字段为空）
  await saveRecord(newRecord);
  await saveRecord(positionData);
  return { position: positionData, buyRecord: role === RECORD_ROLE.BUY ? newRecord : undefined, sellRecord: role === RECORD_ROLE.SELL ? newRecord : undefined };
}
