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
import { isFieldEmpty } from '@/utils/formValidation';
import { findPendingReviewTrades, ensureTradesInitialized } from '@/services/investmentMerge';
import { HabitStats, ReviewReminder, BackupReminder, RecentRecords, ContributionGraph, PositionOverview, type ReviewItem, type PositionItem } from '@/components/dashboard';

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
  const [lastBackupRecordCount, setLastBackupRecordCount] = useState<number>(0);
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [backupCheckDone, setBackupCheckDone] = useState(false);
  // 测试模式：复盘提醒立即生效（冷静期 0 天）
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    getSetting('test_mode').then((v) => setTestMode(v === 'true'));
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      const backupDate = await getSetting('lastBackupDate');
      setLastBackup((backupDate as string) || null);
      const backupCount = await getSetting('lastBackupRecordCount');
      setLastBackupRecordCount(backupCount ? Number(backupCount) : 0);
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

  /** 备份提醒触发条件：记录数达标且满足「从未备份 / 距上次备份新增≥10条 / 距上次备份≥30天」任一 */
  const shouldShowBackupReminder = useMemo(() => {
    if (!backupCheckDone) return false;
    if (records.length < 10) return false;
    if (!lastBackup) return true;
    if (records.length - lastBackupRecordCount >= 10) return true;
    const daysSinceBackup = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceBackup >= 30) return true;
    return false;
  }, [records, lastBackup, lastBackupRecordCount, backupCheckDone]);

  // Streak & counts
  const { streak, weekCount, monthCount } = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const completedRecords = records.filter((r) => r.status === 'completed');

    const weekCount = completedRecords.filter((r) =>
      isWithinInterval(new Date(r.createdAt), { start: weekStart, end: weekEnd })
    ).length;

    const monthCount = completedRecords.filter((r) => {
      const d = new Date(r.createdAt);
      return d >= monthStart && d <= now;
    }).length;

    const streak = calcStreak(records);

    return { streak, weekCount, monthCount };
  }, [records]);

  /** 各模板使用统计：记录数 + 最近编辑时间（用于模板卡片展示） */
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

  /** 最近编辑的 5 条记录（按 updatedAt 降序，用于快捷继续编辑） */
  const recentRecords = useMemo(() => {
    return [...records]
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, 5);
  }, [records]);

  // 当前持仓：仓位单（record_role=position）且未清仓的投资记录
  const positions = useMemo<PositionItem[]>(() => {
    return records
      .filter((r) => {
        if (r.templateId !== 'investment_checklist') return false;
        if (r.data.record_role !== 'position') return false;
        if (r.data.sold_out === true) return false;
        const sellPrice = r.data.sell_exit_price;
        if (sellPrice !== undefined && sellPrice !== null && String(sellPrice).trim() !== '') return false;
        const code = String(r.data.buy_company_name ?? '').trim();
        return code !== '';
      })
      .map((r) => {
        const totalQty = Number(r.data.merged_total_qty ?? r.data.buy_quantity ?? 0);
        const sellQty = Number(r.data.merged_total_sell_qty ?? 0);
        return {
          recordId: r.id,
          code: String(r.data.buy_company_name ?? '').trim(),
          avgBuyPrice: Number(r.data.buy_price ?? 0),
          totalQty: isNaN(totalQty) ? 0 : totalQty,
          remainingQty: isNaN(totalQty - sellQty) ? 0 : totalQty - sellQty,
          currency: String(r.data.buy_currency ?? 'CNY'),
        };
      })
      .filter((p) => p.remainingQty > 0);
  }, [records]);

  // 复盘提醒：投资检查清单按单据角色独立提醒（买入单/卖出单/仓位单各 +30 天），决策日志按完成时间
  const { readyForReview, pendingReview } = useMemo(() => {
    // 测试模式：冷静期 0 天（所有待复盘立即 ready）
    const COOLDOWN_DAYS = testMode ? 0 : 30;
    const ready: ReviewItem[] = [];
    const pending: ReviewItem[] = [];

    records.forEach((record) => {
      if (record.templateId === 'investment_checklist') {
        const role = record.data.record_role as string | undefined;
        const code = (record.data.buy_company_name as string) || '未命名标的';
        const pushItem = (key: string, title: string, dateLabel: string, dateStr: string) => {
          const parsed = new Date(dateStr);
          if (isNaN(parsed.getTime())) return;
          const daysSince = Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
          const item: ReviewItem = {
            id: key,
            templateId: 'investment_checklist',
            title,
            dateLabel,
            link: `/form/investment_checklist/${record.id}`,
          };
          if (daysSince >= COOLDOWN_DAYS) ready.push(item);
          else pending.push(item);
        };

        if (role === 'buy') {
          // 买入单：买入日期 +30 天，买入复盘（buy_review_lesson）未填 → 提醒
          const buyDate = record.data.buy_date as string | undefined;
          if (!buyDate) return;
          const reviewed = !isFieldEmpty(record.data.buy_review_lesson);
          if (reviewed) return;
          pushItem(`buy_${record.id}`, `${code} · 买入复盘`, `买于 ${buyDate}`, buyDate);
        } else if (role === 'sell') {
          // 卖出单：卖出日期 +30 天，卖出复盘（sell_review_entries）未填 → 提醒
          const sellDate = record.data.sell_date as string | undefined;
          if (!sellDate) return;
          const entries = record.data.sell_review_entries as Record<string, unknown>[] | undefined;
          const reviewed = Array.isArray(entries) && entries.some((e) => !isFieldEmpty(e.sell_lesson));
          if (reviewed) return;
          const price = record.data.sell_exit_price as string | number | undefined;
          const qty = record.data.sell_quantity as string | number | undefined;
          pushItem(
              `sell_${record.id}`,
              `${code} · 卖出${qty ? `${qty}股` : ''}${price ? `@${price}` : ''}复盘`,
              `卖于 ${sellDate}`,
              sellDate
          );
        } else if (role === 'position') {
          // 仓位单：清仓后最后卖出日 +30 天，投资周期复盘（position_lesson）未填 → 提醒
          if (record.data.sold_out !== true) return;
          const sellDate = record.data.sell_date as string | undefined;
          if (!sellDate) return;
          const reviewed = !isFieldEmpty(record.data.position_lesson);
          if (reviewed) return;
          pushItem(`pos_${record.id}`, `${code} · 投资周期复盘`, `清仓于 ${sellDate}`, sellDate);
        } else {
          // 旧模型（无 role）：Trade 层优先按每笔卖出提醒，回退整单
          const initialized = ensureTradesInitialized(record.data);
          const recordWithInit = { ...record, data: initialized };
          const pendingTrades = findPendingReviewTrades(recordWithInit);
          if (pendingTrades.length > 0) {
            pendingTrades.forEach((trade) => {
              if (!trade.date) return;
              pushItem(
                  `${record.id}_${trade.id}`,
                  `${code} · 卖出${trade.qty}股@${trade.price}`,
                  `卖出于 ${trade.date}`,
                  trade.date
              );
            });
            return;
          }
          const sellDate = record.data.sell_date as string | undefined;
          if (!sellDate || String(sellDate).trim() === '') return;
          const reviewEntries = record.data.sell_review_entries as Record<string, unknown>[] | undefined;
          const reviewed = Array.isArray(reviewEntries) && reviewEntries.some((e) => !isFieldEmpty(e.sell_lesson));
          if (reviewed) return;
          pushItem(record.id, code, `卖出于 ${String(sellDate)}`, String(sellDate));
        }
      } else if (record.templateId === 'decision_log' && record.status === 'completed') {
        const completedAt = (record.data._completedAt as string) || record.createdAt.slice(0, 10);
        if (!completedAt || String(completedAt).trim() === '') return;
        // 已复盘？长期复盘为可重复段，检查是否已有「结果对比预期」的记录
        const reviewEntries = record.data.long_term_review_entries as Record<string, unknown>[] | undefined;
        const reviewed = Array.isArray(reviewEntries) && reviewEntries.some((e) => !isFieldEmpty(e.result_vs_expected));
        if (reviewed) return;

        const parsed = new Date(String(completedAt));
        if (isNaN(parsed.getTime())) return;
        const daysSince = Math.floor(
          (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)
        );
        const item: ReviewItem = {
          id: record.id,
          templateId: 'decision_log',
          title: (record.data.title as string) || '未命名决策',
          dateLabel: `完成于 ${String(completedAt)}`,
          link: `/form/decision_log/${record.id}`,
        };
        if (daysSince >= COOLDOWN_DAYS) ready.push(item);
        else pending.push(item);
      }
    });

    return { readyForReview: ready, pendingReview: pending };
  }, [records, testMode]);

  return (
    <div>
      {/* Header */}

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

      {/* 当前持仓概览（投资检查清单） */}
      <PositionOverview
        positions={positions}
        onOpen={(recordId) => navigate(`/form/investment_checklist/${recordId}`)}
      />

      {/* GitHub 风格复盘热力图 */}
      <ContributionGraph records={records} />

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
