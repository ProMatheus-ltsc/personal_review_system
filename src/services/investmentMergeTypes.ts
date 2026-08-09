/**
 * investmentMergeTypes — 投资检查清单四层模型类型与字段映射
 *
 * Position + Trade + Trade Review + Position Review 四层模型的纯类型定义与
 * 表单字段 ↔ 结构化层字段的映射常量（从 investmentMerge 拆出，职责单一：
 * 本文件只声明数据形状与映射关系，不含任何业务逻辑）。
 *
 * 模型层级（单据内 data 字段）：
 * - Position 层：单据本身（FormRecord）
 * - Trade 层：merged_trades（InvestmentTrade[]）
 * - Trade Review 层：merged_reviews（InvestmentReview[]，trade_id 关联）
 * - Position Review 层：merged_position_review（清仓后生成）
 */

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
export const REVIEW_CONTENT_FIELDS: (keyof InvestmentReview)[] = [
  'reviewed_at', 'thesis_valid', 'what_was_right', 'what_was_wrong',
  'lesson', 'would_repeat', 'adjustment', 'profit_result', 'post_sell_trend',
];

/** 批次明细（买入/卖出 lot 的通用形状，date/price/qty/reason） */
export interface LotInput {
  date?: string;
  price?: string | number;
  qty?: string | number;
  reason?: string;
  /** 当前编辑会话的批次标识（同一笔卖出多次自动保存据此更新同一条，而非按取值去重） */
  batch_id?: string;
}

/** 卖出批次（merged_sell_lots 的条目形状） */
export interface SellLot extends LotInput {}
