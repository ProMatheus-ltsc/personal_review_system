/**
 * InvestmentStats — 投资检查清单统计组件
 *
 * 展示投资记录的统计数据：总交易数、胜率、
 * 持仓检查频率等，支持按时间范围过滤。
 */
import { useEffect, useState } from 'react';
import { InvestmentStats as InvestmentStatsType, calcInvestmentStats, getFilteredRecords, TimeRange } from '@/services/stats';

interface Props {
  timeRange: TimeRange;
}

export default function InvestmentStats({ timeRange }: Props) {
  const [stats, setStats] = useState<InvestmentStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const records = await getFilteredRecords('investment_checklist', timeRange);
      if (!cancelled) {
        setStats(calcInvestmentStats(records));
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 bg-blue-50 border-blue-100">
          <p className="text-xs text-gray-500 mb-1">总交易数</p>
          <p className="text-xl font-bold text-blue-700">{stats.totalTrades}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">记录的交易</p>
        </div>
        <div className="rounded-lg border p-3 bg-emerald-50 border-emerald-100">
          <p className="text-xs text-gray-500 mb-1">已平仓</p>
          <p className="text-xl font-bold text-emerald-700">{stats.closedTrades}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">已有卖出记录</p>
        </div>
        <div className={`rounded-lg border p-3 ${
          stats.winRate !== null && stats.winRate >= 50
            ? 'bg-green-50 border-green-100'
            : 'bg-red-50 border-red-100'
        }`}>
          <p className="text-xs text-gray-500 mb-1">胜率</p>
          <p className={`text-xl font-bold ${
            stats.winRate !== null && stats.winRate >= 50 ? 'text-green-700' : 'text-red-700'
          }`}>
            {stats.winRate !== null ? `${stats.winRate}%` : '-'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">盈利交易占比</p>
        </div>
        <div className="rounded-lg border p-3 bg-purple-50 border-purple-100">
          <p className="text-xs text-gray-500 mb-1">风险回报比</p>
          <p className="text-xl font-bold text-purple-700">
            {stats.avgRiskReward !== null ? `${stats.avgRiskReward}:1` : '-'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">平均值</p>
        </div>
      </div>

      {/* 盈亏分布 */}
      {stats.profitDistribution.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">💰 盈亏分布</h4>
          <div className="flex flex-wrap gap-2">
            {stats.profitDistribution.map((item) => {
              const colorClass = item.name === '盈利'
                ? 'bg-green-50 text-green-700'
                : item.name === '亏损'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-gray-50 text-gray-700';
              return (
                <span
                  key={item.name}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${colorClass}`}
                >
                  {item.name}
                  <span className="font-medium">{item.count}笔</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
