/**
 * StatsPanel — 统计面板容器组件
 *
 * 提供模板类型切换标签和时间范围选择器，
 * 根据当前选中的模板渲染对应的统计子组件（决策/日/周/投资/情绪）。
 */
import { useState } from 'react';
import { TimeRange } from '@/services/stats';
import { TemplateId } from '@/types';
import DecisionStats from './DecisionStats';
import DailyStats from './DailyStats';
import WeeklyStats from './WeeklyStats';
import InvestmentStats from './InvestmentStats';
import EmotionStats from './EmotionStats';

const TEMPLATE_TABS: { id: TemplateId; label: string; icon: string }[] = [
  { id: 'decision_log', label: '决策日志', icon: '🔄' },
  { id: 'daily_review', label: '日复盘', icon: '🌙' },
  { id: 'weekly_review', label: '周复盘', icon: '📊' },
  { id: 'investment_checklist', label: '投资', icon: '✅' },
  { id: 'emotional_awareness', label: '情绪', icon: '🧠' },
];

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'month', label: '本月' },
  { value: 'quarter', label: '近3月' },
  { value: 'all', label: '全部' },
];

export default function StatsPanel() {
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>('decision_log');
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  return (
    <div>
      {/* 模板类型切换 */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-gray-200 pb-3">
        {TEMPLATE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTemplate(tab.id)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTemplate === tab.id
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 时间范围切换 */}
      <div className="flex items-center gap-1 mb-4">
        <span className="text-xs text-gray-400 mr-2">时间范围:</span>
        {TIME_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTimeRange(opt.value)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              timeRange === opt.value
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 统计内容区域 */}
      <div className="min-h-[200px]">
        {activeTemplate === 'decision_log' && <DecisionStats timeRange={timeRange} />}
        {activeTemplate === 'daily_review' && <DailyStats timeRange={timeRange} />}
        {activeTemplate === 'weekly_review' && <WeeklyStats timeRange={timeRange} />}
        {activeTemplate === 'investment_checklist' && <InvestmentStats timeRange={timeRange} />}
        {activeTemplate === 'emotional_awareness' && <EmotionStats timeRange={timeRange} />}
      </div>
    </div>
  );
}
