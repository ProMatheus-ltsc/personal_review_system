/**
 * ContributionGraph — 复盘热力图（GitHub 提交贡献图风格）
 *
 * 以散点格子的形式展示所选年份每天的复盘记录数量，
 * 颜色越深表示当天记录越多，方便直观看到复盘习惯的连续性。
 * 支持通过下拉框切换查看的年份。
 */
import { useMemo, useState } from 'react';
import { startOfWeek, startOfYear, endOfYear, addWeeks, addDays, format, isSameMonth, differenceInCalendarWeeks } from 'date-fns';

interface ContributionGraphProps {
  records: { createdAt: string }[];
}

const CELL_SIZE = 11;
const CELL_GAP = 3;

/** GitHub 风格绿色阶梯（浅色主题） */
function getColor(count: number): string {
  if (count <= 0) return '#ebedf0';
  if (count === 1) return '#9be9a8';
  if (count === 2) return '#40c463';
  if (count === 3) return '#30a14e';
  return '#216e39';
}

export default function ContributionGraph({ records }: ContributionGraphProps) {
  const currentYear = new Date().getFullYear();

  // 可选年份：当前年份 + 所有记录出现过的年份
  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    records.forEach((r) => {
      const y = new Date(r.createdAt).getFullYear();
      if (!isNaN(y)) set.add(y);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [records, currentYear]);

  const [year, setYear] = useState(currentYear);

  // 按日期统计记录数
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach((r) => {
      const d = r.createdAt.slice(0, 10);
      map[d] = (map[d] || 0) + 1;
    });
    return map;
  }, [records]);

  const today = new Date();

  // 所选年份整年的周网格（周一为每列第一天）
  const weeks = useMemo(() => {
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(yearStart);
    const gridStart = startOfWeek(yearStart, { weekStartsOn: 1 });
    const gridEndWeekStart = startOfWeek(yearEnd, { weekStartsOn: 1 });
    const totalWeeks = differenceInCalendarWeeks(gridEndWeekStart, gridStart, { weekStartsOn: 1 }) + 1;
    const arr: Date[] = [];
    for (let i = 0; i < totalWeeks; i++) arr.push(addWeeks(gridStart, i));
    return arr;
  }, [year]);

  const weekdays = [0, 1, 2, 3, 4, 5, 6];
  const totalInYear = records.filter((r) => new Date(r.createdAt).getFullYear() === year).length;

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h3 className="text-sm font-semibold text-gray-800">📈 复盘热力图</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">{year} 年共 {totalInYear} 条复盘记录</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="inline-block min-w-max">
          {/* 月份标签 */}
          <div className="flex">
            <div className="w-8 flex-shrink-0" />
            <div className="flex" style={{ gap: CELL_GAP }}>
              {weeks.map((week, i) => {
                const prevWeek = weeks[i - 1];
                const showLabel = !prevWeek || !isSameMonth(week, prevWeek);
                return (
                  <div
                    key={i}
                    className="text-[9px] text-gray-400 h-4 leading-4"
                    style={{ width: CELL_SIZE }}
                  >
                    {showLabel ? format(week, 'M月') : ''}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex mt-1">
            {/* 星期标签 */}
            <div className="w-8 flex-shrink-0 flex flex-col" style={{ gap: CELL_GAP }}>
              {weekdays.map((d) => (
                <div
                  key={d}
                  className="text-[9px] text-gray-400 flex items-center"
                  style={{ height: CELL_SIZE }}
                >
                  {d === 0 ? '一' : d === 2 ? '三' : d === 4 ? '五' : ''}
                </div>
              ))}
            </div>

            {/* 格子矩阵：列=周，行=周一~周日 */}
            <div className="flex" style={{ gap: CELL_GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
                  {weekdays.map((d) => {
                    const date = addDays(week, d);
                    const key = format(date, 'yyyy-MM-dd');
                    const count = counts[key] || 0;
                    const isFuture = date.getTime() > today.getTime();
                    return (
                      <div
                        key={d}
                        title={`${format(date, 'M月d日')} · ${count} 条复盘`}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          backgroundColor: isFuture ? 'transparent' : getColor(count),
                          borderRadius: 2,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 图例 */}
          <div className="flex items-center justify-end gap-1 mt-2 text-[9px] text-gray-400">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((c) => (
              <div
                key={c}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  backgroundColor: getColor(c),
                  borderRadius: 2,
                }}
              />
            ))}
            <span>多</span>
          </div>
        </div>
      </div>
    </div>
  );
}
