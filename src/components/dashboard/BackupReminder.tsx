/**
 * BackupReminder — 备份提醒组件
 *
 * 展示两种提醒：
 * 1. 首次访问引导：向新用户说明数据存储方式和何时需要备份
 * 2. 备份提醒：当记录数 >= 10 且从未导出过时，温和提示用户考虑备份
 *
 * 首次引导可通过「我知道了」按钮永久关闭（写入 settings）。
 */
import { Link } from 'react-router-dom';

interface BackupReminderProps {
  isFirstVisit: boolean;
  shouldShowBackupReminder: boolean;
  recordCount: number;
  dismissFirstVisit: () => void;
}

export default function BackupReminder({
  isFirstVisit,
  shouldShowBackupReminder,
  recordCount,
  dismissFirstVisit,
}: BackupReminderProps) {
  if (!isFirstVisit && !shouldShowBackupReminder) return null;

  return (
    <>
      {/* First Visit Data Info */}
      {isFirstVisit && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-semibold text-blue-800">💡 数据存储说明</p>
          </div>
          <div className="text-xs text-blue-700 space-y-2">
            <p>你的复盘数据安全地存储在浏览器本地，日常使用不会丢失（关闭浏览器、关机重启、浏览器更新都没问题）。</p>
            <div>
              <p className="font-medium mb-0.5">只有以下操作需要提前备份：</p>
              <ul className="pl-3 space-y-0.5">
                <li>• 清除浏览器缓存/数据时（最常见原因）</li>
                <li>• 换电脑或换浏览器时</li>
                <li>• 重装操作系统时</li>
                <li>• 想在其他浏览器或其他设备上使用时（数据不会自动同步）</li>
              </ul>
            </div>
            <p>在「数据管理」页面可一键导出备份（3秒），需要时再导入恢复。</p>
          </div>
          <button
            onClick={dismissFirstVisit}
            className="text-xs text-blue-500 mt-3 hover:underline font-medium"
          >
            我知道了
          </button>
        </div>
      )}

      {/* Backup Reminder */}
      {shouldShowBackupReminder && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>💾</span>
              <div>
                <p className="text-sm font-medium text-blue-800">数据备份提示</p>
                <p className="text-xs text-blue-700">
                  你已积累了 {recordCount} 条复盘记录 — 如果哪天需要清除浏览器缓存或换设备，记得先来这里导出一份备份。
                </p>
              </div>
            </div>
            <Link
              to="/data"
              className="text-sm text-blue-700 hover:text-blue-900 font-medium flex-shrink-0 ml-4"
            >
              了解详情 →
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
