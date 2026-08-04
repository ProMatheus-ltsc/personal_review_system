/**
 * RecentRecords — 最近编辑记录列表
 *
 * 在仪表盘底部展示最近编辑的 5 条记录，提供快速跳转入口。
 * 显示模板图标、记录标题、相对时间（如「3小时前」）和状态标签。
 * 加载中展示骨架屏，无记录时展示引导提示。
 */
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import clsx from 'clsx';
import { getTemplateIcon, getTemplateName } from '@/utils/dashboard';

interface RecentRecord {
  id: string;
  templateId: string;
  title: string;
  status: string;
  updatedAt: string;
}

interface RecentRecordsProps {
  records: RecentRecord[];
  loading: boolean;
  onRecordClick: (templateId: string, recordId: string) => void;
}

export default function RecentRecords({ records, loading, onRecordClick }: RecentRecordsProps) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">最近编辑</h2>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">还没有复盘记录，选择上方模板开始吧 ✨</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <div
              key={record.id}
              onClick={() => onRecordClick(record.templateId, record.id)}
              className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <span className="text-2xl flex-shrink-0">
                {getTemplateIcon(record.templateId)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {record.title || `未命名 ${getTemplateName(record.templateId)}`}
                </p>
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(record.updatedAt), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </p>
              </div>
              <span
                className={clsx(
                  'text-xs px-2 py-1 rounded-full font-medium flex-shrink-0',
                  record.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                )}
              >
                {record.status === 'completed' ? '已完成' : '草稿'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
