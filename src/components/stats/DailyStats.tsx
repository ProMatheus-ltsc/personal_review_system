/**
 * DailyStats — 日复盘统计组件
 *
 * 展示日复盘记录的统计数据：总天数、平均精力/心情评分、
 * 高频关键词等，支持按时间范围过滤。
 */
import { useEffect, useState } from 'react';
import { DailyReviewStats, calcDailyReviewStats, getFilteredRecords, TimeRange } from '@/services/stats';

interface Props {
  timeRange: TimeRange;
}

export default function DailyStats({ timeRange }: Props) {
  const [stats, setStats] = useState<DailyReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const records = await getFilteredRecords('daily_review', timeRange);
      if (!cancelled) {
        setStats(calcDailyReviewStats(records));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [timeRange]);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">加载中...</div>;
  }

  if (!stats || stats.totalDays === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-lg mb-1">🌙</p>
        <p className="text-sm">暂无日复盘记录</p>
        <p className="text-xs mt-1">坚持每天睡前5分钟复盘，统计数据将在这里展示</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 bg-green-50 border-green-100">
          <p className="text-xs text-gray-500 mb-1">复盘天数</p>
          <p className="text-xl font-bold text-green-700">{stats.totalDays}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">期间内记录天数</p>
        </div>
        <div className="rounded-lg border p-3 bg-blue-50 border-blue-100">
          <p className="text-xs text-gray-500 mb-1">连续天数</p>
          <p className="text-xl font-bold text-blue-700">{stats.streakDays}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">从最近一天向前</p>
        </div>
      </div>

      {/* 情绪分布 */}
      {stats.moodDistribution.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">😊 情绪分布</h4>
          <div className="space-y-2">
            {stats.moodDistribution.map((mood) => {
              const total = stats.moodDistribution.reduce((a, b) => a + b.count, 0);
              const percent = Math.round((mood.count / total) * 100);
              return (
                <div key={mood.name} className="flex items-center gap-2">
                  <span className="text-sm w-20 truncate">{mood.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-indigo-400 h-2 rounded-full"
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

      {/* 精力分布 */}
      {stats.energyDistribution.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">⚡ 精力分布</h4>
          <div className="flex flex-wrap gap-2">
            {stats.energyDistribution.map((item) => (
              <span
                key={item.name}
                className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full"
              >
                {item.name}
                <span className="bg-emerald-200 text-emerald-800 px-1.5 rounded-full text-[10px]">
                  {item.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
