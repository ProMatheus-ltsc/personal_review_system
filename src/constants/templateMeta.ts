/**
 * 模板级别映射表，定义每个模板的复盘等级和显示颜色
 */
export const levelMap: Record<string, { level: string; color: string }> = {
  daily_review: { level: 'Level 1 · 记录复盘', color: 'bg-green-50 text-green-600' },
  weekly_review: { level: 'Level 2 · 事件复盘', color: 'bg-blue-50 text-blue-600' },
  monthly_review: { level: 'Level 2-3 · 模式复盘', color: 'bg-purple-50 text-purple-600' },
  annual_review: { level: 'Level 3 · 年度复盘', color: 'bg-rose-50 text-rose-600' },
  case_study: { level: 'Level 2-3 · 深度复盘', color: 'bg-indigo-50 text-indigo-600' },
  decision_log: { level: 'Level 2 · 决策复盘', color: 'bg-amber-50 text-amber-600' },
  investment_checklist: { level: 'Level 1 · 检查清单', color: 'bg-emerald-50 text-emerald-600' },
};

/**
 * 模板 ID 常量集合，用于类型安全的模板引用
 */
export const TEMPLATE_IDS = {
  DAILY: 'daily_review',
  WEEKLY: 'weekly_review',
  MONTHLY: 'monthly_review',
  ANNUAL: 'annual_review',
  EMOTIONAL: 'emotional_awareness',
  CASE_STUDY: 'case_study',
  DECISION_LOG: 'decision_log',
  INVESTMENT: 'investment_checklist',
} as const;
