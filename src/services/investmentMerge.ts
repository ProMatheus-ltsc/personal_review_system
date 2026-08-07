/**
 * investmentMerge — 同股票代码投资记录自动合并服务
 *
 * 分笔记录模式：每笔买入/卖出是一条独立的「投资检查清单」记录。
 * 整个投资生命周期最终只保留【一份单据】：
 *
 * - 买入合并（mergeSameCodeBuys）：
 *   同股票代码、双方都是「持有中」的开放持仓（买入完成、未清仓）
 *   → 合并成一份持仓单据：加权买入价 + 逐笔买入明细，旧记录删除、快照保留。
 *   部分卖出后的剩余持仓仍然参与买入合并（剩余部分继续合并新买入）。
 *
 * - 卖出批次（applySellBatch）：
 *   在持仓单据上填写卖出并保存时，本次卖出拆成一个批次（日期/价格/数量/原因）
 *   → 立即并入该单据的 merged_sell_lots（加权卖出价 + 逐笔卖出明细）。
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

const PHASE_BUYING = 0;
const PHASE_HOLDING = 1;
const PHASE_REVIEW = 3;

const phases = investmentChecklistTemplate.phases!;

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

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
  // 被吸收记录带着历史卖出批次 → 这是「部分卖出后又追加买入」的持仓：
  // 买入合并只影响买入侧，顶层卖出字段必须保持清空（sell_exit_price 等只应在全部
  // 卖出时由 applySellBatch 恢复），否则会被 isOpenPosition/isClosedRecord 误判为
  // 「已清仓」从当前持仓消失，且下次自动保存会被 applySellBatch 当成新的一笔卖出、
  // 把刚合并进来的买入份额也一并清空
  if (totalSellQty > 0) {
    SELL_TOP_LEVEL_FIELDS.forEach((f) => {
      data[f] = '';
    });
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

  const data: Record<string, unknown> = { ...current.data };
  data.merged_sell_lots = newLots;
  data.merged_total_sell_qty = totalSell;
  if (sellWeighted !== undefined) data.sell_exit_price = sellWeighted.toFixed(4);
  else data.sell_exit_price = '';
  if (lastSellDate) data.last_sell_date = lastSellDate;
  else data.last_sell_date = '';
  data.sold_out = soldOut;

  if (newLots.length === 0) {
    // 没有任何卖出批次剩余：彻底回到「未卖出」状态
    SELL_TOP_LEVEL_FIELDS.forEach((f) => {
      data[f] = '';
    });
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
    data.sell_status = 'partial';
    data.remaining_qty = remaining;
  }

  const updated: FormRecord = { ...current, data, updatedAt: new Date().toISOString() };
  await saveRecord(updated);
  return { merged: newLots.length, data, soldOut, remainingQty: remaining };
}

export { PHASE_BUYING, PHASE_HOLDING, PHASE_REVIEW };
