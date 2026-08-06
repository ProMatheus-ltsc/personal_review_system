/**
 * ReviewReminder — 复盘提醒组件
 *
 * 基于已完成记录的关键日期（投资检查清单的卖出日期、决策日志的完成时间），
 * 提醒用户进行后续复盘：
 * - readyForReview：已过冷静期（30 天），可以开始复盘
 * - pendingReview：已完成但未满 30 天，提示即将进入复盘期
 *
 * 冷静期设计理念：避免在情绪高涨或低落时做复盘，
 * 等待足够时间后能更客观地评估决策。
 */
import { Link } from 'react-router-dom';

export interface ReviewItem {
  id: string;
  templateId: string;
  /** 显示名称（投资标的 / 决策标题） */
  title: string;
  /** 日期说明（如「卖出于 2026-07-01」或「完成于 2026-07-01」） */
  dateLabel: string;
  /** 跳转链接 */
  link: string;
}

interface ReviewReminderProps {
  readyForReview: ReviewItem[];
  pendingReview: ReviewItem[];
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
            你有 {readyForReview.length} 项记录已过冷静期，可以进行复盘了：
          </p>
          <ul className="space-y-2">
            {readyForReview.map((item) => (
              <li key={item.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  {item.title} · {item.dateLabel}
                </span>
                <Link
                  to={item.link}
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
          <span>{pendingReview.length} 项记录将在近期进入复盘期</span>
        </div>
      )}
    </>
  );
}
