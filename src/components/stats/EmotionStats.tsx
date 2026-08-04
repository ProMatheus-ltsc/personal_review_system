/**
 * EmotionStats — 情绪觉察统计组件
 *
 * 展示情绪觉察记录的统计数据：总记录数、高频情绪类型、
 * 触发场景分布等，支持按时间范围过滤。
 */
import { useEffect, useState } from 'react';
import { EmotionStats as EmotionStatsType, calcEmotionStats, getFilteredRecords, TimeRange } from '@/services/stats';

interface Props {
  timeRange: TimeRange;
}

export default function EmotionStats({ timeRange }: Props) {
  const [stats, setStats] = useState<EmotionStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const records = await getFilteredRecords('emotional_awareness', timeRange);
      if (!cancelled) {
        setStats(calcEmotionStats(records));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [timeRange]);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">加载中...</div>;
  }

  if (!stats || stats.totalRecords === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-lg mb-1">🧠</p>
        <p className="text-sm">暂无情绪觉察记录</p>
        <p className="text-xs mt-1">在情绪波动后使用情绪觉察模板，追踪情绪模式</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 bg-purple-50 border-purple-100">
          <p className="text-xs text-gray-500 mb-1">记录总数</p>
          <p className="text-xl font-bold text-purple-700">{stats.totalRecords}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">情绪觉察记录</p>
        </div>
        <div className="rounded-lg border p-3 bg-blue-50 border-blue-100">
          <p className="text-xs text-gray-500 mb-1">触发因素</p>
          <p className="text-xl font-bold text-blue-700">{stats.triggerCount}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">已记录触发点</p>
        </div>
      </div>

      {/* 情绪分布 */}
      {stats.emotionDistribution.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">🎭 主导情绪分布</h4>
          <div className="space-y-2">
            {stats.emotionDistribution.map((emotion) => {
              const total = stats.emotionDistribution.reduce((a, b) => a + b.count, 0);
              const percent = Math.round((emotion.count / total) * 100);
              const isPositive = ['喜悦', '平静', '兴奋'].includes(emotion.name);
              return (
                <div key={emotion.name} className="flex items-center gap-2">
                  <span className="text-sm w-16 truncate">{emotion.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isPositive ? 'bg-green-400' : 'bg-orange-400'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">{percent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 调节效果 */}
      {stats.regulationEffectiveness.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">💪 调节效果分布</h4>
          <div className="flex flex-wrap gap-2">
            {stats.regulationEffectiveness.map((item) => {
              const colorClass = item.name.includes('很有效')
                ? 'bg-green-50 text-green-700'
                : item.name.includes('无效')
                  ? 'bg-red-50 text-red-700'
                  : 'bg-gray-50 text-gray-700';
              return (
                <span
                  key={item.name}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${colorClass}`}
                >
                  {item.name}
                  <span className="font-medium">{item.count}次</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
