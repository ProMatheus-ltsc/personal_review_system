/**
 * InvestmentStats — 投资检查清单统计组件
 *
 * 统计口径基于「合并单据」模型：
 * - 总交易数 = 投资单据总数（一份合并单 = 一次投资）
 * - 卖出批次 = 逐笔卖出次数（部分卖出/分批卖出按笔计）
 * - 已平仓 = 已全部卖出的单据（严格剩余=0）
 * - 胜率/平均盈亏% 按已清仓单据计算（加权卖出价 vs 加权买入价）
 */
import { useEffect, useState } from 'react';
import { InvestmentStats as InvestmentStatsType, calcInvestmentStats, getFilteredRecords, TimeRange } from '@/services/stats';

interface Props {
  timeRange: TimeRange;
}

function fmtMoney(n: number | null, digits = 2): string {
  if (n === null) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}`;
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

  const pnlColor = (v: number | null) =>
    v === null ? '' : v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-gray-700';

  const rows: { label: string; value: string; valueClass?: string; note: string }[] = [
    {
      label: '投资单据',
      value: String(stats.totalTrades),
      note: `合并后单据 · 卖出 ${stats.totalSellBatches} 笔`,
    },
    {
      label: '已平仓',
      value: String(stats.closedTrades),
      note: `平均持有 ${stats.avgHoldDays !== null ? `${stats.avgHoldDays} 天` : '-'}`,
    },
    {
      label: '胜率',
      value: stats.winRate !== null ? `${stats.winRate}%` : '-',
      valueClass: stats.winRate !== null && stats.winRate >= 50 ? 'text-green-700' : 'text-red-700',
      note: '盈利单据占比（已平仓）',
    },
    {
      label: '风险回报比',
      value: stats.avgRiskReward !== null ? `${stats.avgRiskReward}:1` : '-',
      note: '平均值',
    },
    {
      label: '累计已实现盈亏',
      value: fmtMoney(stats.totalProfitAmount),
      valueClass: pnlColor(stats.totalProfitAmount),
      note: '按单据币种加总',
    },
    {
      label: '平均盈亏',
      value: stats.avgProfitPercent !== null ? `${stats.avgProfitPercent > 0 ? '+' : ''}${stats.avgProfitPercent}%` : '-',
      valueClass: pnlColor(stats.avgProfitPercent),
      note: '已平仓单据',
    },
  ];

  const totalDistribution = stats.profitDistribution.reduce((s, item) => s + item.count, 0);

  return (
    <div className="space-y-4">
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
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-gray-100">
                <td className="px-4 py-2.5 text-gray-600">{row.label}</td>
                <td className={`px-4 py-2.5 font-semibold ${row.valueClass || 'text-gray-900'}`}>{row.value}</td>
                <td className="px-4 py-2.5 text-gray-400">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 盈亏分布 */}
      {stats.profitDistribution.length > 0 && (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">💰 盈亏分布</th>
                <th className="px-4 py-2 font-medium">单据数</th>
                <th className="px-4 py-2 font-medium">占比</th>
              </tr>
            </thead>
            <tbody>
              {stats.profitDistribution.map((item) => {
                const colorClass = item.name === '盈利'
                  ? 'text-green-700'
                  : item.name === '亏损'
                    ? 'text-red-700'
                    : 'text-gray-700';
                const pct = totalDistribution > 0 ? Math.round((item.count / totalDistribution) * 100) : 0;
                return (
                  <tr key={item.name} className="border-t border-gray-100">
                    <td className={`px-4 py-2.5 font-medium ${colorClass}`}>{item.name}</td>
                    <td className="px-4 py-2.5 text-gray-700">{item.count} 单</td>
                    <td className="px-4 py-2.5 text-gray-400">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
