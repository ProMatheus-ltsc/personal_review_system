/**
 * SellContextInline — 卖出阶段内联持仓上下文
 *
 * 在「卖出时」区块顶部实时展示：
 * - 加权买入价 / 剩余持仓
 * - 按当前填写的卖出价与数量，实时估算本笔盈亏% 与预计盈亏金额
 * 无需切到合并面板即可看到关键数字。
 */
interface SellContextInlineProps {
  buyPrice?: string | number;
  totalQty?: string | number;
  sellQty?: string | number;
  sellPrice?: string | number;
  sellQuantity?: string | number;
  currency?: string;
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

function fmt(n: number, digits = 4): string {
  return n.toFixed(digits);
}

function pnlColor(v: number): string {
  if (v > 0) return 'text-red-600';
  if (v < 0) return 'text-green-600';
  return 'text-gray-700';
}

export default function SellContextInline({
  buyPrice,
  totalQty,
  sellQty,
  sellPrice,
  sellQuantity,
  currency = 'CNY',
}: SellContextInlineProps) {
  const buy = toNum(buyPrice);
  const total = toNum(totalQty);
  const sold = toNum(sellQty) ?? 0;
  const remaining = buy !== undefined && total !== undefined ? total - sold : undefined;

  if (buy === undefined) return null;

  const price = toNum(sellPrice);
  const qty = toNum(sellQuantity);
  const pnlPercent = price !== undefined && buy > 0 ? ((price - buy) / buy) * 100 : undefined;
  const pnlAmount = price !== undefined && qty !== undefined ? qty * (price - buy) : undefined;

  return (
    <div className="mb-4 bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span>
          加权成本 <b className="text-gray-900">{fmt(buy)}</b>
          <span className="text-[10px] text-gray-400 ml-0.5">{currency}</span>
        </span>
        {remaining !== undefined && (
          <span>
            剩余持仓 <b className="text-gray-900">{remaining > 0 ? remaining : 0}</b>
            {total !== undefined && (
              <span className="text-gray-400 text-[10px]"> / 总 {total} 股</span>
            )}
          </span>
        )}
        {pnlPercent !== undefined && (
          <span>
            本笔盈亏 <b className={pnlColor(pnlPercent)}>{pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%</b>
            {pnlAmount !== undefined && (
              <span className={`ml-2 ${pnlColor(pnlAmount)}`}>
                {pnlAmount > 0 ? '+' : ''}{pnlAmount.toFixed(2)}
              </span>
            )}
          </span>
        )}
      </div>
      {pnlPercent === undefined && (
        <p className="text-[11px] text-amber-600">填写卖出价格后自动计算本笔盈亏</p>
      )}
    </div>
  );
}
