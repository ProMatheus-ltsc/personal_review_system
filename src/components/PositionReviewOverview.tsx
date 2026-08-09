/**
 * PositionReviewOverview — 投资周期概览（仓位单 · 投资周期复盘段顶部）
 *
 * 展示整个投资周期的关键量化指标：
 * - 平均买入价 / 平均卖出价
 * - 总盈亏%（红涨绿跌，中国习惯）
 * - 持有天数（最后卖出日 − 平均买入日）
 * - 总数量 / 交易笔数（买/卖）
 *
 * 数据全部来自仓位单自身（merged_trades 为 BUY/SELL 交易流水的权威来源）。
 */
import type { InvestmentTrade } from '@/services/investmentMerge';

interface PositionReviewOverviewProps {
  /** 平均买入价（仓位单 buy_price） */
  buyPrice: number;
  /** 平均卖出价（仓位单 sell_exit_price） */
  sellPrice: number;
  /** 总买入数量 */
  totalQty: number;
  /** 平均买入日期（仓位单 buy_date，卖出单注入的派生字段） */
  buyDate?: string;
  /** 最后卖出日期 */
  lastSellDate?: string;
  /** 结构化交易流水（merged_trades） */
  trades?: InvestmentTrade[];
}

export default function PositionReviewOverview({
  buyPrice,
  sellPrice,
  totalQty,
  buyDate,
  lastSellDate,
  trades,
}: PositionReviewOverviewProps) {
  // 总盈亏%（买入价/卖出价均有效时计算）
  const pnlPercent = !isNaN(buyPrice) && !isNaN(sellPrice) && buyPrice > 0
      ? ((sellPrice - buyPrice) / buyPrice) * 100
      : null;
  const pnlColor = pnlPercent === null ? '' : pnlPercent > 0 ? 'text-red-600' : pnlPercent < 0 ? 'text-green-600' : 'text-gray-700';

  // 持有天数 = 最后卖出日 − 平均买入日
  let holdDays: number | null = null;
  if (buyDate && lastSellDate) {
    const s = new Date(buyDate);
    const e = new Date(lastSellDate);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      holdDays = Math.round((e.getTime() - s.getTime()) / 86400000);
    }
  }

  const tradeList = Array.isArray(trades) ? trades : [];
  const buyCount = tradeList.filter((t) => t.type === 'BUY').length;
  const sellCount = tradeList.filter((t) => t.type === 'SELL').length;

  return (
    <div className="mb-4 bg-violet-50/60 border border-violet-200 rounded-lg p-3 text-xs text-gray-600">
      <p className="text-xs font-semibold text-violet-800 mb-2">📊 投资周期概览</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <span>买入价 <b className="text-gray-900">{!isNaN(buyPrice) ? buyPrice.toFixed(2) : '-'}</b></span>
        <span>卖出价 <b className="text-gray-900">{!isNaN(sellPrice) ? sellPrice.toFixed(2) : '-'}</b></span>
        {pnlPercent !== null && (
          <span>总盈亏 <b className={pnlColor}>{pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%</b></span>
        )}
        {holdDays !== null && <span>持有 <b className="text-gray-900">{holdDays} 天</b></span>}
        {totalQty > 0 && <span>总量 <b className="text-gray-900">{totalQty}</b></span>}
        <span>交易 <b className="text-gray-900">{buyCount}</b> 买 / <b className="text-gray-900">{sellCount}</b> 卖</span>
      </div>
    </div>
  );
}
