/**
 * WeeklyStats — 周复盘统计组件
 *
 * 展示周复盘记录的统计数据：总周数、平均完成率、
 * 目标达成趋势等，支持按时间范围过滤。
 */
import { useEffect, useState } from 'react';
import { WeeklyReviewStats, calcWeeklyReviewStats, getFilteredRecords, TimeRange } from '@/services/stats';

interface Props {
  timeRange: TimeRange;
}

export default function WeeklyStats({ timeRange }: Props) {
  const [stats, setStats] = useState<WeeklyReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const records = await getFilteredRecords('weekly_review', timeRange);
      if (!cancelled) {
        setStats(calcWeeklyReviewStats(records));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [timeRange]);

  if (loading) {
    return <div className="text-sm text-gray-400 py-8 text-center">加载中...</div>;
  }

  if (!stats || stats.totalWeeks === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-lg mb-1">📊</p>
        <p className="text-sm">暂无周复盘记录</p>
        <p className="text-xs mt-1">每周末花30分钟复盘，持续追踪目标达成情况</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 bg-blue-50 border-blue-100">
          <p className="text-xs text-gray-500 mb-1">完成周数</p>
          <p className="text-xl font-bold text-blue-700">{stats.totalWeeks}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">期间内完成的周复盘</p>
        </div>
        <div className="rounded-lg border p-3 bg-green-50 border-green-100">
          <p className="text-xs text-gray-500 mb-1">目标达成率</p>
          <p className="text-xl font-bold text-green-700">
            {stats.avgGoalCompletion !== null ? `${stats.avgGoalCompletion}%` : '-'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">平均目标进度</p>
        </div>
        <div className="rounded-lg border p-3 bg-purple-50 border-purple-100">
          <p className="text-xs text-gray-500 mb-1">目标完成</p>
          <p className="text-xl font-bold text-purple-700">
            {stats.goalsTotal > 0 ? `${stats.goalsCompleted}/${stats.goalsTotal}` : '-'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">已完成 / 总设定数</p>
        </div>
      </div>

      {/* 达成率进度条 */}
      {stats.avgGoalCompletion !== null && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">📈 平均目标进度</h4>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  stats.avgGoalCompletion >= 80 ? 'bg-green-500' :
                  stats.avgGoalCompletion >= 50 ? 'bg-blue-500' : 'bg-yellow-500'
                }`}
                style={{ width: `${Math.min(stats.avgGoalCompletion, 100)}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 w-12 text-right">
              {stats.avgGoalCompletion}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
