/**
 * InvestmentStats — 投资检查清单统计组件
 *
 * 两部分：
 * 1. 总体指标汇总表（胜率/平均盈亏/风险回报比等）
 * 2. 逐笔交易明细表（仅已平仓）：每个投资周期一组，内含按时间排序的多笔买入/卖出子行
 */
import { useEffect, useState } from 'react';
import {
  InvestmentStats as InvestmentStatsType,
  TradeDetail,
  calcInvestmentStats,
  calcTradeDetails,
  getAllInvestmentRecords,
  TimeRange,
} from '@/services/stats';

interface Props {
  timeRange: TimeRange;
}

function fmtMoney(n: number | null, digits = 2): string {
  if (n === null) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}`;
}

function fmtPrice(n: number | null): string {
  if (n === null) return '-';
  return n.toFixed(2);
}

function pnlColor(v: number | null): string {
  if (v === null) return '';
  if (v > 0) return 'text-red-600';
  if (v < 0) return 'text-green-600';
  return 'text-gray-700';
}

function timeframeColor(judge: string): string {
  if (judge === '符合预期') return 'text-green-700 bg-green-50';
  if (judge === '低于预期') return 'text-amber-700 bg-amber-50';
  if (judge === '高于预期') return 'text-blue-700 bg-blue-50';
  return '';
}

export default function InvestmentStats({ timeRange }: Props) {
  const [stats, setStats] = useState<InvestmentStatsType | null>(null);
  const [details, setDetails] = useState<TradeDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const allRecords = await getAllInvestmentRecords(timeRange);
      if (!cancelled) {
        setStats(calcInvestmentStats(allRecords));
        setDetails(calcTradeDetails(allRecords));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [timeRange]);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">加载中...</div>;
  }

  if (!stats || stats.totalTrades === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-lg mb-1">✅</p>
        <p className="text-sm">暂无投资记录</p>
        <p className="text-xs mt-1">使用投资检查清单记录交易，自动统计胜率和风险回报比</p>
      </div>
    );
  }

  const closedDetails = details.filter((d) => d.status === 'closed');

  const summaryRows: { label: string; value: string; valueClass?: string; note: string }[] = [
    { label: '投资单据', value: String(stats.totalTrades), note: `卖出 ${stats.totalSellBatches} 笔` },
    { label: '已平仓', value: String(stats.closedTrades), note: `平均持有 ${stats.avgHoldDays !== null ? `${stats.avgHoldDays} 天` : '-'}` },
    { label: '胜率', value: stats.winRate !== null ? `${stats.winRate}%` : '-', valueClass: stats.winRate !== null && stats.winRate >= 50 ? 'text-green-700' : 'text-red-700', note: '盈利单据占比' },
    { label: '风险回报比', value: stats.avgRiskReward !== null ? `${stats.avgRiskReward}:1` : '-', note: '平均值' },
    { label: '累计盈亏', value: fmtMoney(stats.totalProfitAmount), valueClass: pnlColor(stats.totalProfitAmount), note: '已实现' },
    { label: '平均盈亏', value: stats.avgProfitPercent !== null ? `${fmtMoney(stats.avgProfitPercent)}%` : '-', valueClass: pnlColor(stats.avgProfitPercent), note: '已平仓' },
  ];

  return (
    <div className="space-y-5">
      {/* 总体指标 */}
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">指标</th>
              <th className="px-4 py-2 font-medium">数值</th>
              <th className="px-4 py-2 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.label} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-600">{row.label}</td>
                <td className={`px-4 py-2 font-semibold ${row.valueClass || 'text-gray-900'}`}>{row.value}</td>
                <td className="px-4 py-2 text-gray-400">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 逐笔交易明细（仅已平仓） */}
      {closedDetails.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">📋 逐笔交易明细（已平仓）</h4>
          <div className="space-y-3">
            {closedDetails.map((d) => (
              <div key={d.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* 投资周期汇总行 */}
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                  <span className="font-semibold text-gray-900 text-sm">{d.code}</span>
                  <span className="text-gray-500">买入 <b className="text-gray-700">{fmtPrice(d.buyPrice)}</b></span>
                  <span className="text-gray-500">卖出 <b className="text-gray-700">{fmtPrice(d.sellPrice)}</b></span>
                  <span className={`font-medium ${pnlColor(d.pnlPercent)}`}>
                    {d.pnlPercent !== null ? `${d.pnlPercent > 0 ? '+' : ''}${d.pnlPercent}%` : '-'}
                  </span>
                  <span className={pnlColor(d.pnlAmount)}>
                    {d.pnlAmount !== null ? fmtMoney(d.pnlAmount) : ''}
                  </span>
                  <span className="text-gray-500">持有 <b className="text-gray-700">{d.holdDays !== null ? `${d.holdDays}天` : '-'}</b></span>
                  {d.riskReward && <span className="text-gray-500">风险回报比 <b className="text-gray-700">{d.riskReward}</b></span>}
                  {d.expectedTimeframe && (
                    <span className="text-gray-500">
                      预期 <b className="text-gray-700">{d.expectedTimeframe}</b>
                      {d.timeframeJudge && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${timeframeColor(d.timeframeJudge)}`}>
                          {d.timeframeJudge}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* 逐笔买入/卖出明细（按时间排序） */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[680px]">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="px-3 py-1.5 font-medium">类型</th>
                        <th className="px-3 py-1.5 font-medium">日期</th>
                        <th className="px-3 py-1.5 font-medium">价格</th>
                        <th className="px-3 py-1.5 font-medium">数量</th>
                        <th className="px-3 py-1.5 font-medium">情绪</th>
                        <th className="px-3 py-1.5 font-medium">信心</th>
                        <th className="px-3 py-1.5 font-medium">策略</th>
                        <th className="px-3 py-1.5 font-medium">原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.lots.map((lot, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              lot.type === 'buy' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {lot.type === 'buy' ? '买入' : '卖出'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-600">{lot.date || '-'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{lot.price !== null ? fmtPrice(lot.price) : '-'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{lot.qty !== null ? lot.qty : '-'}</td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{lot.emotion || '-'}</td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{lot.confidence || '-'}</td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{lot.strategy || '-'}</td>
                          <td className="px-3 py-1.5 text-gray-500 truncate max-w-[160px]">{lot.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
