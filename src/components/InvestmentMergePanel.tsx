/**
 * InvestmentMergePanel — 持仓明细展示面板（仓位单）
 *
 * 买入/卖出各只保留一张表格：
 * - 有 linkedBuyRecords 时展示完整列（日期/价格/数量/逻辑/止损/目标/情绪/信心）
 * - 无 linkedBuyRecords 时 fallback 到 mergedBuyLots 简表
 * - 卖出同理
 */
import type { ReactNode } from 'react';
import type { FormRecord } from '@/types';

interface MergeLot {
  date?: string;
  price?: string | number;
  qty?: string | number;
  reason?: string;
  source?: string;
}

export type { MergeLot };

interface InvestmentMergePanelProps {
  stockCode: string;
  mergedBuyLots?: MergeLot[];
  weightedBuy?: string | number;
  totalBuyQty?: string | number;
  mergedSellLots?: MergeLot[];
  weightedSell?: string | number;
  totalSellQty?: string | number;
  soldOut?: boolean;
  lastSellDate?: string;
  linkedBuyRecords?: FormRecord[];
  linkedSellRecords?: FormRecord[];
}

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
  linkedBuyRecords,
  linkedSellRecords,
}: InvestmentMergePanelProps) {
  if (!stockCode) return null;
  const hasBuy = Array.isArray(mergedBuyLots) && mergedBuyLots.length > 0;
  const hasSell = Array.isArray(mergedSellLots) && mergedSellLots.length > 0;
  if (!hasBuy && !hasSell) return null;

  const buyQty = parseFloat(String(totalBuyQty ?? ''));
  const sellQty = parseFloat(String(totalSellQty ?? ''));
  const remaining =
    !isNaN(buyQty) && !isNaN(sellQty) && sellQty >= 0 ? buyQty - sellQty : undefined;

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

  const isSoldOut = soldOut === true || (remaining !== undefined && remaining === 0);

  let positionStatus: string | null = null;
  if (hasSell) {
    if (isSoldOut) positionStatus = '已清仓';
    else positionStatus = '部分卖出';
  }

  const hasLinkedBuy = Array.isArray(linkedBuyRecords) && linkedBuyRecords.length > 0;
  const hasLinkedSell = Array.isArray(linkedSellRecords) && linkedSellRecords.length > 0;

  return (
    <div className="mb-5 bg-indigo-50/50 border border-indigo-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-indigo-800">
          📊 持仓明细 · <span className="font-bold">{stockCode}</span>
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

      {/* 买入明细（单一表格） */}
      {hasBuy && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2">
            <Row label="平均买入价" value={fmt(weightedBuy)} strong />
            <Row label="总买入数量" value={fmt(totalBuyQty, 0)} />
            {remaining !== undefined && (
              <Row label="剩余持仓" value={remaining > 0 ? remaining : 0} />
            )}
          </div>
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            {hasLinkedBuy ? (
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">买入日期</th>
                    <th className="px-3 py-2 font-medium">买入价</th>
                    <th className="px-3 py-2 font-medium">数量</th>
                    <th className="px-3 py-2 font-medium">买入逻辑</th>
                    <th className="px-3 py-2 font-medium">止损价</th>
                    <th className="px-3 py-2 font-medium">目标价</th>
                    <th className="px-3 py-2 font-medium">情绪</th>
                    <th className="px-3 py-2 font-medium">信心</th>
                  </tr>
                </thead>
                <tbody>
                  {(linkedBuyRecords as FormRecord[]).map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(r.data.buy_date as string) || '-'}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(r.data.buy_price as string | number)}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(r.data.buy_quantity as string | number, 0)}</td>
                      <td className="px-3 py-1.5 text-gray-600 max-w-[200px] truncate" title={(r.data.buy_thesis as string) || ''}>
                        {(r.data.buy_thesis as string) || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(r.data.buy_stop_loss_price as string | number)}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(r.data.buy_target_price_num as string | number)}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(r.data.buy_emotion_state as string) || '-'}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(r.data.buy_confidence as string) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">买入日期</th>
                    <th className="px-3 py-2 font-medium">买入价</th>
                    <th className="px-3 py-2 font-medium">数量</th>
                    <th className="px-3 py-2 font-medium">买入逻辑</th>
                  </tr>
                </thead>
                <tbody>
                  {(mergedBuyLots as MergeLot[]).map((l, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-600">{l.date || '-'}</td>
                      <td className="px-3 py-1.5 text-gray-600">{fmt(l.price)}</td>
                      <td className="px-3 py-1.5 text-gray-600">{fmt(l.qty, 0)}</td>
                      <td className="px-3 py-1.5 text-gray-500 truncate max-w-[200px]" title={l.reason || ''}>
                        {l.reason || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 卖出明细（单一表格） */}
      {hasSell && (
        <div className="mb-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-2">
            <Row label="平均卖出价" value={fmt(weightedSellValue)} strong />
            <Row label="总卖出数量" value={fmt(totalSellQty, 0)} />
            {remaining !== undefined && <Row label="剩余持仓" value={remaining > 0 ? remaining : 0} />}
          </div>
          <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
            {hasLinkedSell ? (
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">卖出日期</th>
                    <th className="px-3 py-2 font-medium">卖出价</th>
                    <th className="px-3 py-2 font-medium">数量</th>
                    <th className="px-3 py-2 font-medium">卖出原因</th>
                    <th className="px-3 py-2 font-medium">情绪</th>
                    <th className="px-3 py-2 font-medium">信心</th>
                  </tr>
                </thead>
                <tbody>
                  {(linkedSellRecords as FormRecord[]).map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 align-top">
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(r.data.sell_date as string) || '-'}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(r.data.sell_exit_price as string | number)}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmt(r.data.sell_quantity as string | number, 0)}</td>
                      <td className="px-3 py-1.5 text-gray-500 truncate max-w-[160px]" title={(r.data.sell_reason as string) || ''}>
                        {(r.data.sell_reason as string) || '-'}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(r.data.sell_emotion_state as string) || '-'}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{(r.data.sell_confidence as string) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* 清仓/部分卖出状态提示 */}
      {hasSell && (
        <div>
          {isSoldOut ? (
            <p className="text-xs text-green-700">
              ✅ 已全部卖出，复盘将于 <b>{lastSellDate || '最后卖出日期'}</b> 起 30 天后开放
            </p>
          ) : (
            remaining !== undefined &&
            remaining > 0 && (
              <p className="text-xs text-blue-600">
                本次为部分卖出，剩余 {remaining} 股仍持有，可继续追加买入；全部卖出后按冷静期设置开放复盘
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
