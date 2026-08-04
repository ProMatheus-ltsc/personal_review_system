/**
 * DecisionStats — 决策日志统计组件
 *
 * 展示决策记录的统计数据：总决策数、后悔率、预测准确率、
 * 主要认知偏差 top3 等，支持按时间范围过滤。
 */
import { useEffect, useState } from 'react';
import { DecisionLogStats, calcDecisionLogStats, getFilteredRecords, TimeRange } from '@/services/stats';

interface Props {
  timeRange: TimeRange;
}

export default function DecisionStats({ timeRange }: Props) {
  const [stats, setStats] = useState<DecisionLogStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const records = await getFilteredRecords('decision_log', timeRange);
      if (!cancelled) {
        setStats(calcDecisionLogStats(records));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [timeRange]);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">加载中...</div>;
  }

  if (!stats || stats.totalDecisions === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-lg mb-1">📝</p>
        <p className="text-sm">暂无决策日志记录</p>
        <p className="text-xs mt-1">完成一些决策日志后，这里将展示统计数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 核心指标网格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="决策总数"
          value={stats.totalDecisions}
          subtext={`已完成 ${stats.completedDecisions}`}
          color="blue"
        />
        <StatCard
          label="后悔率"
          value={stats.regretRate !== null ? `${stats.regretRate}%` : '-'}
          subtext="有后悔/疑虑的占比"
          color={stats.regretRate !== null && stats.regretRate > 50 ? 'red' : 'green'}
        />
        <StatCard
          label="预期准确率"
          value={stats.predictionAccuracy !== null ? `${stats.predictionAccuracy}%` : '-'}
          subtext="符合/超预期的占比"
          color={stats.predictionAccuracy !== null && stats.predictionAccuracy >= 60 ? 'green' : 'yellow'}
        />
        <StatCard
          label="已识别偏差"
          value={stats.topBiases.length > 0 ? stats.topBiases.length : '-'}
          subtext="认知偏差类型数"
          color="purple"
        />
      </div>

      {/* 认知偏差 Top 3 */}
      {stats.topBiases.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">🧠 主要认知偏差</h4>
          <div className="space-y-2">
            {stats.topBiases.map((bias, i) => (
              <div key={bias.name} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
                <span className="text-sm text-gray-700 flex-1">{bias.name}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {bias.count}次
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 决策类型分布 */}
      {stats.decisionTypes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">📊 决策类型分布</h4>
          <div className="flex flex-wrap gap-2">
            {stats.decisionTypes.map((type) => (
              <span
                key={type.name}
                className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full"
              >
                {type.name}
                <span className="bg-amber-200 text-amber-800 px-1.5 rounded-full text-[10px]">
                  {type.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 改进焦点 */}
      {stats.improvementFocus && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">🎯 改进焦点</h4>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
            {stats.improvementFocus}
          </p>
          <p className="text-xs text-gray-400 mt-2">来自最近一次决策复盘</p>
        </div>
      )}
    </div>
  );
}

// ===================== 统计卡片组件 =====================

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}) {
  const colorMap = {
    blue: 'bg-blue-50 border-blue-100',
    green: 'bg-green-50 border-green-100',
    red: 'bg-red-50 border-red-100',
    yellow: 'bg-yellow-50 border-yellow-100',
    purple: 'bg-purple-50 border-purple-100',
  };
  const valueColorMap = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    red: 'text-red-700',
    yellow: 'text-yellow-700',
    purple: 'text-purple-700',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueColorMap[color]}`}>{value}</p>
      {subtext && <p className="text-[11px] text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  );
}
