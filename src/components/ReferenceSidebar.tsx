/**
 * ReferenceSidebar — 年度复盘参考侧栏
 *
 * 仅在年度复盘模板中展示，提供该年度其他复盘记录的参考数据。
 * 帮助用户在填写年度总结时回顾全年的周复盘、月复盘、案例分析等。
 *
 * 响应式设计：
 * - 桌面端（lg+）：右侧固定面板，通过按钮展开/收起
 * - 移动端：底部浮动按钮 + 底部弹出面板（Bottom Sheet）
 *
 * 数据逻辑：
 * - 根据 year 参数过滤该年度的所有记录
 * - 排除日常复盘和年度复盘本身（避免自引用）
 * - 按模板类型分组展示，支持展开查看字段详情
 */
import React, { useState, useEffect, useMemo } from 'react';
import { getAllRecords } from '@/services/db';
import { templates } from '@/templates';
import type { FormRecord } from '@/types';

interface ReferenceSidebarProps {
  templateId: string;
  /** For annual_review: which year to reference (e.g. "2024") */
  year?: string;
}

const TEMPLATE_DISPLAY: Record<string, { icon: string; name: string }> = {
  daily_review: { icon: '📝', name: '日复盘' },
  weekly_review: { icon: '📊', name: '周复盘' },
  monthly_review: { icon: '📅', name: '月度复盘' },
  annual_review: { icon: '🎯', name: '年度复盘' },
  case_study: { icon: '📋', name: '实战案例' },
  decision_log: { icon: '🔄', name: '决策日志' },
  investment_checklist_buy: { icon: '✅', name: '投资买入' },
  investment_checklist_sell: { icon: '✅', name: '投资卖出' },
  investment_checklist_position: { icon: '✅', name: '投资持仓' },
  emotional_awareness: { icon: '🧠', name: '情绪觉察' },
};

const IMPORTANT_TEMPLATES = ['case_study', 'decision_log', 'investment_checklist_buy', 'investment_checklist_sell', 'investment_checklist_position', 'emotional_awareness'];

// ====== Date Range Helpers ======

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  // Monday as start of week (day=0 is Sunday, shift to 6)
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(d);
  start.setDate(d.getDate() - diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function getYearRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { start, end };
}

// ====== Filter Logic ======

interface FilterConfig {
  routineType: string;
  routineLabel: string;
  importantLabel: string;
  dateRange: { start: Date; end: Date };
}

function getFilterConfig(templateId: string, referenceDate: Date): FilterConfig | null {
  switch (templateId) {
    case 'weekly_review':
      return {
        routineType: 'daily_review',
        routineLabel: '本周日复盘',
        importantLabel: '本周重要复盘',
        dateRange: getWeekRange(referenceDate),
      };
    case 'monthly_review':
      return {
        routineType: 'weekly_review',
        routineLabel: '本月周复盘',
        importantLabel: '本月重要复盘',
        dateRange: getMonthRange(referenceDate),
      };
    case 'annual_review':
      return {
        routineType: 'monthly_review',
        routineLabel: '本年月复盘',
        importantLabel: '本年重要复盘',
        dateRange: getYearRange(referenceDate),
      };
    default:
      return null;
  }
}

// ====== Utility Functions ======

function getRecordDisplayTitle(record: FormRecord): string {
  const data = record.data as Record<string, unknown>;
  const titleFields = ['title', 'week_period', 'month_period', 'case_title', 'decision_title', 'stock_name'];
  for (const field of titleFields) {
    if (data[field] && typeof data[field] === 'string' && (data[field] as string).trim()) {
      return data[field] as string;
    }
  }
  return record.title || new Date(record.createdAt).toLocaleDateString('zh-CN');
}

function getRecordDate(record: FormRecord): string {
  return new Date(record.createdAt).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}



/** Get field labels from template definition */
function getFieldLabels(templateId: string): Record<string, string> {
  const template = templates.find(t => t.id === templateId);
  if (!template) return {};
  const labels: Record<string, string> = {};
  template.sections.forEach(s => s.fields.forEach(f => { labels[f.id] = f.label; }));
  return labels;
}

// ====== Sub-Components ======

const RecordDetail: React.FC<{ record: FormRecord }> = ({ record }) => {
  const labels = useMemo(() => getFieldLabels(record.templateId), [record.templateId]);
  const data = record.data as Record<string, unknown>;
  const entries = Object.entries(data).filter(
    ([key, value]) => value && String(value).trim() && !key.startsWith('_') && labels[key]
  );

  if (entries.length === 0) return <p className="text-xs text-gray-400 italic">无数据</p>;

  return (
    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
      {entries.slice(0, 8).map(([key, value]) => (
        <div key={key}>
          <span className="text-xs font-medium text-gray-500">{labels[key] || key}：</span>
          <span className="text-xs text-gray-700 break-words">
            {String(value).length > 100 ? String(value).slice(0, 100) + '...' : String(value)}
          </span>
        </div>
      ))}
      {entries.length > 8 && (
        <p className="text-xs text-gray-400">...还有 {entries.length - 8} 个字段</p>
      )}
    </div>
  );
};

const RecordItem: React.FC<{ record: FormRecord }> = ({ record }) => {
  const [expanded, setExpanded] = useState(false);
  const config = TEMPLATE_DISPLAY[record.templateId];

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left py-1.5 px-2 hover:bg-gray-100 rounded transition-colors flex items-center justify-between gap-1"
      >
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {config && <span className="text-xs shrink-0">{config.icon}</span>}
          <span className="text-xs text-gray-700 truncate block">{getRecordDisplayTitle(record)}</span>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{getRecordDate(record)}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 animate-fadeIn">
          <RecordDetail record={record} />
        </div>
      )}
    </div>
  );
};

const RecordGroup: React.FC<{ title: string; icon: string; records: FormRecord[] }> = ({ title, icon, records }) => {
  const [expanded, setExpanded] = useState(true);

  if (records.length === 0) return null;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2 px-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
            {records.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="ml-2 mt-1 animate-fadeIn">
          {records.map(record => (
            <RecordItem key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  );
};

// ====== Main Component ======

const MAX_RECORDS_PER_GROUP = 30;

const ReferenceSidebar: React.FC<ReferenceSidebarProps> = ({ templateId, year }) => {
  const [routineRecords, setRoutineRecords] = useState<FormRecord[]>([]);
  const [importantRecords, setImportantRecords] = useState<FormRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const filterConfig = useMemo(() => {
    let referenceDate = new Date();
    if (templateId === 'annual_review' && year) {
      referenceDate = new Date(parseInt(year), 0, 1);
    }
    return getFilterConfig(templateId, referenceDate);
  }, [templateId, year]);

  useEffect(() => {
    if (!filterConfig) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getAllRecords().then(all => {
      const { dateRange, routineType } = filterConfig;
      const startTime = dateRange.start.getTime();
      const endTime = dateRange.end.getTime();

      // Filter routine records (e.g., daily_review for weekly_review)
      // Exclude drafts — only completed records have reference value
      const routine = all
        .filter(r => {
          const t = new Date(r.createdAt).getTime();
          return r.status === 'completed' && r.templateId === routineType && t >= startTime && t <= endTime;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_RECORDS_PER_GROUP);

      // Filter important records (case_study, decision_log, etc.)
      // Exclude drafts — only completed records have reference value
      const important = all
        .filter(r => {
          const t = new Date(r.createdAt).getTime();
          return r.status === 'completed' && IMPORTANT_TEMPLATES.includes(r.templateId) && t >= startTime && t <= endTime;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_RECORDS_PER_GROUP);

      setRoutineRecords(routine);
      setImportantRecords(important);
      setLoading(false);
    });
  }, [filterConfig]);

  // If current template has no filter config, don't render anything
  if (!filterConfig) return null;

  const totalCount = routineRecords.length + importantRecords.length;

  const getSidebarTitle = (): string => {
    switch (templateId) {
      case 'weekly_review': return '本周参考记录';
      case 'monthly_review': return '本月参考记录';
      case 'annual_review': return `${year || new Date().getFullYear()}年参考记录`;
      default: return '参考记录';
    }
  };

  const sidebarContent = (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <span>📚</span>
          <span>{getSidebarTitle()}</span>
          {totalCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {totalCount}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => { setIsOpen(false); setIsMobileOpen(false); }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-gray-400">加载中...</span>
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-3xl mb-2">📭</span>
            <p className="text-sm text-gray-500">暂无相关参考记录</p>
            <p className="text-xs text-gray-400 mt-1">完成相关复盘后这里会显示参考数据</p>
          </div>
        ) : (
          <div>
            <RecordGroup
              title={filterConfig.routineLabel}
              icon={TEMPLATE_DISPLAY[filterConfig.routineType]?.icon || '📄'}
              records={routineRecords}
            />
            <RecordGroup
              title={filterConfig.importantLabel}
              icon="⭐"
              records={importantRecords}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        {!isOpen ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="fixed right-4 top-1/2 -translate-y-1/2 z-30 bg-white border border-gray-200 shadow-md rounded-l-lg px-2 py-3 hover:bg-gray-50 transition-colors group"
            title="打开参考记录"
          >
            <span className="text-sm writing-vertical">📚 参考往期记录</span>
          </button>
        ) : (
          <div className="fixed right-0 top-0 h-full w-80 bg-gray-50 border-l border-gray-200 shadow-lg z-30 flex flex-col">
            {sidebarContent}
          </div>
        )}
      </div>

      {/* Mobile floating button + bottom sheet */}
      <div className="lg:hidden">
        {!isMobileOpen && (
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="fixed bottom-6 right-6 z-40 bg-blue-600 text-white rounded-full w-12 h-12 shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors active:scale-95"
            title="参考记录"
          >
            <span className="text-lg">📚</span>
          </button>
        )}

        {isMobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setIsMobileOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[75vh] flex flex-col animate-slideUp">
              {sidebarContent}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default ReferenceSidebar;
