/**
 * PositionOverview — 仪表盘持仓概览
 *
 * 汇总当前持仓（未清仓的投资检查清单单据）：
 * - 每项：股票代码、加权买入价、总数量、剩余数量
 * - 手动填写当前价格 → 实时估算浮盈/浮亏（红涨绿跌）
 * - 合计：总成本、总市值、总浮盈
 *
 * 当前价保存在 localStorage（key: position_price_{code}），跨会话保留。
 */
import { useMemo, useState } from 'react';

export interface PositionItem {
  recordId: string;
  code: string;
  avgBuyPrice: number;
  totalQty: number;
  remainingQty: number;
  currency: string;
}

interface PositionOverviewProps {
  positions: PositionItem[];
  onOpen: (recordId: string) => void;
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pnlColor(v: number): string {
  if (v > 0) return 'text-red-600';
  if (v < 0) return 'text-green-600';
  return 'text-gray-600';
}

export default function PositionOverview({ positions, onOpen }: PositionOverviewProps) {
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    try {
      const raw = localStorage.getItem('position_prices');
      if (raw) Object.assign(map, JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return map;
  });

  const setPrice = (code: string, value: string) => {
    const next = { ...prices, [code]: value };
    setPrices(next);
    try {
      localStorage.setItem('position_prices', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const rows = useMemo(() => {
    return positions.map((p) => {
      const price = parseFloat(prices[p.code] ?? '');
      const marketValue = !isNaN(price) && price > 0 ? price * p.remainingQty : null;
      const cost = p.avgBuyPrice * p.remainingQty;
      const pnl = marketValue !== null ? marketValue - cost : null;
      return { ...p, price: isNaN(price) ? undefined : price, marketValue, cost, pnl };
    });
  }, [positions, prices]);

  const totals = useMemo(() => {
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    let totalMarket = 0;
    let pricedCost = 0;
    rows.forEach((r) => {
      if (r.marketValue !== null) {
        totalMarket += r.marketValue;
        pricedCost += r.cost;
      }
    });
    const totalPnl = pricedCost > 0 ? totalMarket - pricedCost : null;
    const pnlPct = pricedCost > 0 ? ((totalMarket - pricedCost) / pricedCost) * 100 : null;
    return { totalCost, totalMarket, totalPnl, pnlPct, pricedCount: rows.filter((r) => r.marketValue !== null).length };
  }, [rows]);

  if (positions.length === 0) return null;

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">📈 当前持仓</h2>
        <span className="text-[11px] text-gray-400">{positions.length} 只标的</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">代码</th>
              <th className="px-3 py-2 font-medium">加权成本</th>
              <th className="px-3 py-2 font-medium">剩余持仓</th>
              <th className="px-3 py-2 font-medium">当前价</th>
              <th className="px-3 py-2 font-medium">浮盈估算</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.recordId}
                className="border-t border-gray-100 hover:bg-indigo-50/40 cursor-pointer"
                onClick={() => onOpen(r.recordId)}
              >
                <td className="px-4 py-2.5 font-semibold text-gray-900">{r.code}</td>
                <td className="px-3 py-2.5 text-gray-600">
                  {fmt(r.avgBuyPrice)}
                  <span className="text-[10px] text-gray-400 ml-0.5">{r.currency}</span>
                </td>
                <td className="px-3 py-2.5 text-gray-600">
                  {fmt(r.remainingQty, 0)}
                  <span className="text-[10px] text-gray-400 ml-1">/ {fmt(r.totalQty, 0)} 股</span>
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={prices[r.code] ?? ''}
                    placeholder="填市价"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPrice(r.code, e.target.value)}
                    className="w-24 px-2 py-1 border border-gray-200 rounded-md text-gray-700 focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 outline-none bg-white"
                  />
                </td>
                <td className={`px-3 py-2.5 font-medium ${pnlColor(r.pnl ?? 0)}`}>
                  {r.pnl !== null ? (
                    <>
                      {fmt(r.pnl)}
                      <span className="text-[10px] ml-1">
                        ({r.cost > 0 ? ((r.pnl / r.cost) * 100).toFixed(1) : 0}%)
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-700">合计</td>
              <td className="px-3 py-2.5 text-gray-600">{fmt(totals.totalCost)}</td>
              <td className="px-3 py-2.5 text-gray-400" colSpan={1}>
                {totals.pricedCount > 0 ? `已估价 ${totals.pricedCount} 只` : '填市价后估算'}
              </td>
              <td className="px-3 py-2.5 text-gray-600">{totals.pricedCount > 0 ? fmt(totals.totalMarket) : '—'}</td>
              <td className={`px-3 py-2.5 font-semibold ${pnlColor(totals.totalPnl ?? 0)}`}>
                {totals.totalPnl !== null ? (
                  <>
                    {fmt(totals.totalPnl)}
                    {totals.pnlPct !== null && (
                      <span className="text-[10px] ml-1">({totals.pnlPct.toFixed(1)}%)</span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100 bg-gray-50/40">
        填当前价可估算浮盈（按剩余持仓 ×（市价 − 加权成本））；点击行进入持仓单据。
      </p>
    </div>
  );
}
