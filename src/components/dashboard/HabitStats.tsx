/**
 * HabitStats — 复盘习惯统计卡片组
 *
 * 在仪表盘顶部展示三项关键指标：
 * - 连续复盘周数（streak）：从当前周往前连续有完成记录的周数
 * - 本周复盘次数（weekCount）：当前自然周内的已完成记录数
 * - 本月复盘次数（monthCount）：当前自然月内的已完成记录数
 *
 * 通过视觉化的数字和颜色激励用户保持复盘习惯。
 */
interface HabitStatsProps {
  streak: number;
  weekCount: number;
  monthCount: number;
}

export default function HabitStats({ streak, weekCount, monthCount }: HabitStatsProps) {
  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-4 py-2">
        <span className="text-lg">🔥</span>
        <div>
          <p className="text-xs text-orange-600 font-medium">连续复盘</p>
          <p className="text-xl font-bold text-orange-700">{streak}<span className="text-xs font-normal ml-0.5">周</span></p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">
        <span className="text-lg">📊</span>
        <div>
          <p className="text-xs text-blue-600 font-medium">本周复盘</p>
          <p className="text-xl font-bold text-blue-700">{weekCount}<span className="text-xs font-normal ml-0.5">次</span></p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-lg px-4 py-2">
        <span className="text-lg">📅</span>
        <div>
          <p className="text-xs text-purple-600 font-medium">本月复盘</p>
          <p className="text-xl font-bold text-purple-700">{monthCount}<span className="text-xs font-normal ml-0.5">次</span></p>
        </div>
      </div>
    </div>
  );
}
