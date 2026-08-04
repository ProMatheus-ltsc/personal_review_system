/**
 * DashboardPage — 仪表盘首页
 *
 * 应用的主入口页面，综合展示：
 * - 习惯统计（连续复盘天数、本周/本月完成数）
 * - 投资复盘提醒（持仓中需要定期检查的记录）
 * - 备份提醒（距上次备份超过一定天数时提醒）
 * - 模板卡片列表（快速新建各类复盘）
 * - 最近编辑记录（快捷继续编辑）
 * - 统计面板入口
 */
import { useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { templates } from '@/templates';
import { useRecords } from '@/hooks/useDB';
import { formatDistanceToNow, startOfWeek, startOfMonth, endOfWeek, isWithinInterval } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import TemplateCard from '@/components/TemplateCard';
import { getSetting, setSetting } from '@/services/db';
import { calcStreak } from '@/utils/dashboard';
import { HabitStats, ReviewReminder, BackupReminder, RecentRecords } from '@/components/dashboard';

/**
 * DashboardPage — 首页仪表盘
 *
 * 展示用户的复盘习惯统计和快捷操作入口。
 *
 * 数据统计逻辑：
 * - streak: 连续复盘周数（从当前周往前连续有 completed 记录的周数）
 * - weekCount/monthCount: 当前周/月的已完成记录数
 * - templateStats: 各模板的使用次数统计
 *
 * 提醒触发条件：
 * - 备份提醒：记录数 >= 10 且从未导出过
 * - 投资复盘提醒：有 completed 的投资检查清单且距今 >= 30 天（冷静期结束）
 * - 首次访问引导：未设置 firstVisitDismissed 标记
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { records, loading } = useRecords();
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [triggersExpanded, setTriggersExpanded] = useState(false);

  // Backup reminder state
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [backupCheckDone, setBackupCheckDone] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const backupDate = await getSetting('lastBackupDate');
      setLastBackup((backupDate as string) || null);
      const dismissed = await getSetting('firstVisitDismissed');
      if (!dismissed) {
        setIsFirstVisit(true);
      }
      setBackupCheckDone(true);
    };
    loadSettings();
  }, []);

  const dismissFirstVisit = async () => {
    await setSetting('firstVisitDismissed', 'true');
    setIsFirstVisit(false);
  };

  const shouldShowBackupReminder = useMemo(() => {
    if (!backupCheckDone) return false;
    // Only show when user has 10+ records and has never exported
    return records.length >= 10 && !lastBackup;
  }, [records, lastBackup, backupCheckDone]);

  // Streak & counts
  const { streak, weekCount, monthCount } = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const completedRecords = records.filter((r) => r.status === 'completed');

    const weekCount = completedRecords.filter((r) =>
      isWithinInterval(new Date(r.updatedAt), { start: weekStart, end: weekEnd })
    ).length;

    const monthCount = completedRecords.filter((r) => {
      const d = new Date(r.updatedAt);
      return d >= monthStart && d <= now;
    }).length;

    const streak = calcStreak(records);

    return { streak, weekCount, monthCount };
  }, [records]);

  const templateStats = useMemo(() => {
    return templates.map((template) => {
      const templateRecords = records.filter(
        (r) => r.templateId === template.id
      );
      const sorted = [...templateRecords].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      const lastUpdated = sorted[0]
        ? formatDistanceToNow(new Date(sorted[0].updatedAt), {
            addSuffix: true,
            locale: zhCN,
          })
        : undefined;
      return {
        template,
        recordCount: templateRecords.length,
        lastUpdated,
      };
    });
  }, [records]);

  const recentRecords = useMemo(() => {
    return [...records]
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 5);
  }, [records]);

  // Review reminder: investment records that are sold but not yet reviewed
  const { readyForReview, pendingReview } = useMemo(() => {
    const investmentRecords = records.filter(
      (r) => r.templateId === 'investment_checklist'
    );
    const ready: typeof records = [];
    const pending: typeof records = [];

    investmentRecords.forEach((record) => {
      const sellDate = record.data.sell_date as string | undefined;
      const sellLesson = record.data.sell_lesson as string | undefined;
      if (!sellDate || String(sellDate).trim() === '') return;
      if (sellLesson && String(sellLesson).trim() !== '') return; // already reviewed

      const parsed = new Date(String(sellDate));
      if (isNaN(parsed.getTime())) return;

      const today = new Date();
      const daysSinceSell = Math.floor(
        (today.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceSell >= 30) {
        ready.push(record);
      } else {
        pending.push(record);
      }
    });

    return { readyForReview: ready, pendingReview: pending };
  }, [records]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">个人复盘系统</h1>
        <p className="text-gray-500 mt-1">
          选择模板开始新的复盘，或查看历史记录
        </p>
      </div>

      <BackupReminder
        isFirstVisit={isFirstVisit}
        shouldShowBackupReminder={shouldShowBackupReminder}
        recordCount={records.length}
        dismissFirstVisit={dismissFirstVisit}
      />

      <ReviewReminder
        readyForReview={readyForReview}
        pendingReview={pendingReview}
      />

      <HabitStats streak={streak} weekCount={weekCount} monthCount={monthCount} />

      {/* 1B: Quick Tips / Frequency Guide */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setGuideExpanded(!guideExpanded)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${guideExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          复盘指南
        </button>
        {guideExpanded && (
          <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-4 text-sm text-gray-600 space-y-1.5 animate-fadeIn">
            <p>🌙 日常：睡前三问（5分钟）</p>
            <p>📊 每周：周复盘（30-45分钟）</p>
            <p>📅 每月：月度复盘（1-2小时）</p>
            <p>📋 随时：重大事件后立即记录</p>
          </div>
        )}
      </div>

      {/* Template Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
        {templateStats.map(({ template, recordCount, lastUpdated }) => (
          <TemplateCard
            key={template.id}
            template={template}
            recordCount={recordCount}
            lastUpdated={lastUpdated}
            onNewRecord={() => navigate(`/form/${template.id}`)}
            onViewHistory={() => navigate(`/history/${template.id}`)}
          />
        ))}
      </div>

      <RecentRecords
        records={recentRecords}
        loading={loading}
        onRecordClick={(templateId, recordId) => navigate(`/form/${templateId}/${recordId}`)}
      />

      {/* 1C: Review Triggers Reminder */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setTriggersExpanded(!triggersExpanded)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-500 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${triggersExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          什么时候该复盘？
        </button>
        {triggersExpanded && (
          <ul className="mt-2 space-y-1 text-xs text-gray-400 pl-5 list-disc animate-fadeIn">
            <li>重大项目结束后</li>
            <li>重要决策执行后</li>
            <li>重大失败或挫折后</li>
            <li>意外成功时</li>
            <li>人际冲突后</li>
            <li>情绪波动剧烈后</li>
          </ul>
        )}
      </div>
    </div>
  );
}
