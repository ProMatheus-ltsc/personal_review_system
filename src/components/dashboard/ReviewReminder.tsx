/**
 * ReviewReminder — 投资复盘提醒组件
 *
 * 基于投资检查清单记录的卖出日期，提醒用户进行卖后复盘：
 * - readyForReview：卖出已超过 30 天冷静期，可以开始复盘
 * - pendingReview：已卖出但未满 30 天，提示即将进入复盘期
 *
 * 冷静期设计理念：避免在情绪高涨或低落时做复盘，
 * 等待足够时间后能更客观地评估投资决策。
 */
import { Link } from 'react-router-dom';

interface ReviewRecord {
  id: string;
  data: Record<string, unknown>;
}

interface ReviewReminderProps {
  readyForReview: ReviewRecord[];
  pendingReview: ReviewRecord[];
}

export default function ReviewReminder({ readyForReview, pendingReview }: ReviewReminderProps) {
  if (readyForReview.length === 0 && pendingReview.length === 0) return null;

  return (
    <>
      {readyForReview.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔔</span>
            <h3 className="font-semibold text-amber-800">待复盘提醒</h3>
          </div>
          <p className="text-sm text-amber-700 mb-3">
            你有 {readyForReview.length} 笔投资已过冷静期，可以进行卖出复盘了：
          </p>
          <ul className="space-y-2">
            {readyForReview.map((record) => (
              <li key={record.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  {(record.data.buy_company_name as string) || '未命名标的'} · 卖出于 {record.data.sell_date as string}
                </span>
                <Link
                  to={`/form/investment_checklist/${record.id}`}
                  className="text-sm text-blue-600 hover:underline flex-shrink-0 ml-2"
                >
                  去复盘 →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {readyForReview.length === 0 && pendingReview.length > 0 && (
        <div className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2.5 mb-6 flex items-center gap-2">
          <span>📌</span>
          <span>{pendingReview.length} 笔投资将在近期进入复盘期</span>
        </div>
      )}
    </>
  );
}
