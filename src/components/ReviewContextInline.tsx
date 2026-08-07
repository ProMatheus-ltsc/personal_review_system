/**
 * ReviewContextInline — 卖出复盘量化对比
 *
 * 在「卖出复盘」区块顶部自动对比买入时的预期：
 * - 目标价达成度：加权卖出价 vs 买入目标价
 * - 止损纪律：加权卖出价 vs 止损价（是否跌破止损才离场）
 * - 持有周期：实际持有天数 vs 买入时预期周期
 */
interface ReviewContextInlineProps {
  buyPrice?: string | number;
  sellPrice?: string | number;
  targetPrice?: string | number;
  stopLoss?: string | number;
  buyDate?: string;
  lastSellDate?: string;
  timeframe?: string;
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

function InfoRow({ ok, warn, title, children }: { ok?: boolean; warn?: boolean; title: string; children: React.ReactNode }) {
  const dot = ok ? 'bg-green-500' : warn ? 'bg-amber-500' : 'bg-gray-300';
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0">
        <p className="text-gray-700 font-medium">{title}</p>
        <p className="text-gray-500 mt-0.5">{children}</p>
      </div>
    </div>
  );
}

export default function ReviewContextInline({
  buyPrice,
  sellPrice,
  targetPrice,
  stopLoss,
  buyDate,
  lastSellDate,
  timeframe,
}: ReviewContextInlineProps) {
  const buy = toNum(buyPrice);
  const sell = toNum(sellPrice);
  const target = toNum(targetPrice);
  const stop = toNum(stopLoss);
  if (buy === undefined || sell === undefined) return null;

  // 1. 目标价达成度
  let targetNode: React.ReactNode = null;
  let targetOk: boolean | undefined;
  if (target !== undefined && target > 0) {
    const reached = (sell / target) * 100;
    if (sell >= target) {
      targetOk = true;
      targetNode = (
        <>✅ 卖出价达到目标价（达成 <b className="text-gray-900">{reached.toFixed(1)}%</b>）</>
      );
    } else {
      targetOk = false;
      targetNode = (
        <>⚠️ 未达目标价卖出（仅为目标的 <b className="text-gray-900">{reached.toFixed(1)}%</b>）</>
      );
    }
  } else {
    targetNode = <>未填写买入目标价，无法对比</>;
  }

  // 2. 止损纪律
  let stopNode: React.ReactNode = null;
  let stopOk: boolean | undefined;
  if (stop !== undefined && stop > 0) {
    if (sell >= stop) {
      stopOk = true;
      stopNode = (
        <>✅ 在止损价之上卖出（高于止损 <b className="text-gray-900">{((sell - stop) / stop * 100).toFixed(1)}%</b>）</>
      );
    } else {
      stopOk = false;
      stopNode = (
        <>⚠️ 跌破止损价才离场（低于止损 <b className="text-gray-900">{((stop - sell) / stop * 100).toFixed(1)}%</b>）</>
      );
    }
  } else {
    stopNode = <>未填写止损价，无法对比</>;
  }

  // 3. 持有周期
  let holdNode: React.ReactNode = null;
  if (buyDate && lastSellDate) {
    const start = new Date(buyDate);
    const end = new Date(lastSellDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      holdNode = (
        <>
          实际持有 <b className="text-gray-900">{days} 天</b>
          {timeframe ? ` · 买入时预期：${timeframe}` : ''}
        </>
      );
    }
  } else {
    holdNode = <>买入/卖出日期不完整，无法计算持有天数</>;
  }

  return (
    <div className="mb-4 bg-violet-50/60 border border-violet-200 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-violet-800">📐 复盘量化对比（买入预期 vs 实际）</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <InfoRow title="目标价达成" ok={targetOk} warn={targetOk === false}>
          {targetNode}
        </InfoRow>
        <InfoRow title="止损纪律" ok={stopOk} warn={stopOk === false}>
          {stopNode}
        </InfoRow>
        <InfoRow title="持有周期">
          {holdNode}
        </InfoRow>
      </div>
    </div>
  );
}
