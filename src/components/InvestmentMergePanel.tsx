/**
 * InvestmentMergePanel — 合并后的持仓/卖出明细展示面板
 *
 * 分笔记录经自动合并后，同代码的多份单据只保留一份：
 * - merged_buy_lots：逐笔买入明细（含当前与历史），加权买入价自动计算
 * - merged_sell_lots：逐笔卖出明细，加权卖出价自动计算
 * - 剩余持仓 = 总买入 − 总卖出（全部卖出后单据成为唯一复盘单据）
 *
 * 该面板仅从当前单据自身数据渲染（不再跨单据查询）。
 */
import type { ReactNode } from 'react';

interface MergeLot {
  date?: string;
  price?: string | number;
  qty?: string | number;
  reason?: string;
  source?: string;
}

export type { MergeLot };

/** 被合并（吸收）单据的完整快照，用于回看其填写的买入细节（不止是加权价/数量） */
interface MergedSnapshot {
  recordId: string;
  title: string;
  data: Record<string, unknown>;
}

export type { MergedSnapshot };

interface InvestmentMergePanelProps {
  stockCode: string;
  mergedBuyLots?: MergeLot[];
  weightedBuy?: string | number;
  totalBuyQty?: string | number;
  mergedSellLots?: MergeLot[];
  weightedSell?: string | number;
  totalSellQty?: string | number;
  /** 是否已全部卖出（剩余持仓为 0） */
  soldOut?: boolean;
  /** 最后卖出日期（全部卖出后作为复盘解锁基准） */
  lastSellDate?: string;
  /** 是否已填写卖出复盘（有复盘时禁止撤销卖出） */
  reviewed?: boolean;
  /** 撤销最近一笔卖出的回调（未复盘且存在卖出批次时显示按钮） */
  onUndoLastSell?: () => void;
  /** 当前单据尚未合并时显示的空态文案 */
  emptyText?: string;
  /** 被合并（吸收）的历史买入单据完整快照（含核心买入逻辑/止损/目标价等细节） */
  mergedSnapshots?: MergedSnapshot[];
}

/** 买入批次的来源标签配色：当前记录（indigo）/ 历史记录（gray） */
const statusColor: Record<string, string> = {
  当前记录: 'bg-indigo-100 text-indigo-600',
  历史记录: 'bg-gray-100 text-gray-600',
};

function fmt(n: string | number | undefined, digits = 4): string {
  if (n === undefined || n === null || String(n).trim() === '') return '-';
  const v = parseFloat(String(n));
  return isNaN(v) ? String(n) : v.toFixed(digits);
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <span className="text-sm text-gray-600">
      {label} <b className={strong ? 'text-indigo-700' : 'text-gray-900'}>{value}</b>
    </span>
  );
}

export default function InvestmentMergePanel({
  stockCode,
  mergedBuyLots,
  weightedBuy,
  totalBuyQty,
  mergedSellLots,
  weightedSell,
  totalSellQty,
  soldOut,
  lastSellDate,
  reviewed,
  onUndoLastSell,
  emptyText,
  mergedSnapshots,
}: InvestmentMergePanelProps) {
  if (!stockCode) return null;
  const hasBuy = Array.isArray(mergedBuyLots) && mergedBuyLots.length > 0;
  const hasSell = Array.isArray(mergedSellLots) && mergedSellLots.length > 0;
  const hasSnapshots = Array.isArray(mergedSnapshots) && mergedSnapshots.length > 0;
  if (!hasBuy && !hasSell) {
    if (!emptyText) return null;
    return (
      <div className="mb-5 bg-indigo-50/50 border border-indigo-200 rounded-lg p-4 text-sm text-gray-500">
        {emptyText}
      </div>
    );
  }

  const buyQty = parseFloat(String(totalBuyQty ?? ''));
  const sellQty = parseFloat(String(totalSellQty ?? ''));
  const remaining =
    !isNaN(buyQty) && !isNaN(sellQty) && sellQty >= 0 ? buyQty - sellQty : undefined;

  // 加权卖出价：优先使用显式传入值，否则从卖出批次计算（部分卖出时顶层字段已清空）
  let weightedSellValue = weightedSell;
  if ((weightedSellValue === undefined || String(weightedSellValue).trim() === '') && hasSell) {
    let qtySum = 0;
    let costSum = 0;
    (mergedSellLots as MergeLot[]).forEach((l) => {
      const p = toNum(l.price);
      const q = toNum(l.qty);
      if (p !== undefined && q !== undefined && q > 0) {
        costSum += p * q;
        qtySum += q;
      }
    });
    if (qtySum > 0) weightedSellValue = costSum / qtySum;
  }

  // 已清仓 = 卖出数量恰好等于总持仓（严格相等）
  const isSoldOut = soldOut === true || (remaining !== undefined && remaining === 0);

  let positionStatus: string | null = null;
  if (hasSell) {
    if (isSoldOut) positionStatus = '已清仓';
    else positionStatus = '部分卖出';
  }

  return (
    <div className="mb-5 bg-indigo-50/50 border border-indigo-200 rounded-lg p-4">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-indigo-800">
          🔗 合并持仓 · <span className="font-bold">{stockCode}</span>
          {hasBuy && (
            <span className="ml-2 text-[10px] font-normal text-gray-500">
              {(mergedBuyLots as MergeLot[]).length} 笔买入
            </span>
          )}
          {hasSell && (
            <span className="ml-1 text-[10px] font-normal text-gray-500">
              · {(mergedSellLots as MergeLot[]).length} 笔卖出
            </span>
          )}
        </h3>
        {positionStatus && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              isSoldOut ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-600'
            }`}
          >
            {positionStatus}
            {remaining !== undefined && remaining > 0 ? ` · 剩余 ${remaining}` : ''}
          </span>
        )}
      </div>

      {/* 买入合并明细 */}
      {hasBuy && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2">
            <Row label="加权买入价" value={fmt(weightedBuy)} strong />
            <Row label="总买入数量" value={fmt(totalBuyQty, 0)} />
            {remaining !== undefined && (
              <Row label="剩余持仓" value={remaining > 0 ? remaining : 0} />
            )}
          </div>
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="w-full text-xs min-w-[420px]">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">来源</th>
                  <th className="px-3 py-2 font-medium">买入日期</th>
                  <th className="px-3 py-2 font-medium">买入价</th>
                  <th className="px-3 py-2 font-medium">数量</th>
                </tr>
              </thead>
              <tbody>
                {(mergedBuyLots as MergeLot[]).map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          statusColor[l.source || ''] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {l.source || '买入'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{l.date || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{fmt(l.price)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{fmt(l.qty, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 被合并的历史买入单据详情（核心买入逻辑/止损价/目标价/情绪等定性细节，不止是加权价与数量） */}
      {hasSnapshots && (
        <div className="mb-3">
          <div className="mb-2 text-xs text-gray-500">
            📋 已合并 {(mergedSnapshots as MergedSnapshot[]).length} 份历史买入单据的完整填写细节
          </div>
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">记录标题</th>
                  <th className="px-3 py-2 font-medium">买入日期</th>
                  <th className="px-3 py-2 font-medium">买入价</th>
                  <th className="px-3 py-2 font-medium">数量</th>
                  <th className="px-3 py-2 font-medium">核心买入逻辑</th>
                  <th className="px-3 py-2 font-medium">止损价</th>
                  <th className="px-3 py-2 font-medium">目标价</th>
                  <th className="px-3 py-2 font-medium">买入情绪</th>
                  <th className="px-3 py-2 font-medium">信心水平</th>
                </tr>
              </thead>
              <tbody>
                {(mergedSnapshots as MergedSnapshot[]).map((s) => (
                  <tr key={s.recordId} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{s.title || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(s.data.buy_date as string) || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(s.data.buy_price as string | number)}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(s.data.buy_quantity as string | number, 0)}</td>
                    <td className="px-3 py-1.5 text-gray-600 max-w-[220px] truncate" title={(s.data.buy_thesis as string) || ''}>
                      {(s.data.buy_thesis as string) || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(s.data.buy_stop_loss_price as string | number)}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(s.data.buy_target_price_num as string | number)}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(s.data.buy_emotion_state as string) || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(s.data.buy_confidence as string) || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 卖出合并明细 */}
      {hasSell && (
        <div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2">
            <Row label="加权卖出价" value={fmt(weightedSellValue)} strong />
            <Row label="总卖出数量" value={fmt(totalSellQty, 0)} />
            {remaining !== undefined && <Row label="剩余持仓" value={remaining > 0 ? remaining : 0} />}
          </div>
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">卖出日期</th>
                  <th className="px-3 py-2 font-medium">卖出价</th>
                  <th className="px-3 py-2 font-medium">数量</th>
                  <th className="px-3 py-2 font-medium">卖出原因</th>
                </tr>
              </thead>
              <tbody>
                {(mergedSellLots as MergeLot[]).map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-600">{l.date || '-'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{fmt(l.price)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{fmt(l.qty, 0)}</td>
                    <td className="px-3 py-1.5 text-gray-500 truncate max-w-[160px]">{l.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isSoldOut ? (
            <p className="mt-2 text-xs text-green-700">
              ✅ 已全部卖出，本单据即唯一复盘单据；复盘将于{' '}
              <b>{lastSellDate || '最后卖出日期'}</b> +30 天后解锁
            </p>
          ) : (
            remaining !== undefined &&
            remaining > 0 && (
              <p className="mt-2 text-xs text-blue-600">
                本次为部分卖出，剩余 {remaining} 股仍在持仓，可继续合并同代码新买入；全部卖出后以最后卖出日期为准 30 天解锁复盘
              </p>
            )
          )}
          {onUndoLastSell && reviewed === false && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onUndoLastSell}
                className="text-[11px] px-2 py-1 rounded-md border border-amber-300 text-amber-700 bg-white hover:bg-amber-50 transition"
                title="撤销最近一笔卖出（已复盘后不可撤销）"
              >
                ↩️ 撤销最近一笔卖出
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
