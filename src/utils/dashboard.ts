import { startOfWeek, subWeeks } from 'date-fns';
import { templates } from '@/templates';

/**
 * 计算连续复盘周数（每周至少完成 1 条记录即算连续）
 * @param records - 包含 status 和 updatedAt 的记录数组
 * @returns 连续复盘的周数
 */
export function calcStreak(records: { status: string; updatedAt: string }[]): number {
  const completed = records
    .filter((r) => r.status === 'completed')
    .map((r) => new Date(r.updatedAt));

  if (completed.length === 0) return 0;

  // Group by week start (Monday)
  const weekSet = new Set<string>();
  completed.forEach((d) => {
    const ws = startOfWeek(d, { weekStartsOn: 1 });
    weekSet.add(ws.toISOString());
  });

  // Walk backwards from current week
  let streak = 0;
  let cursor = startOfWeek(new Date(), { weekStartsOn: 1 });

  while (weekSet.has(cursor.toISOString())) {
    streak++;
    cursor = subWeeks(cursor, 1);
  }

  return streak;
}

/**
 * 根据模板 ID 获取对应的图标
 * @param templateId - 模板 ID
 * @returns 模板图标 emoji，找不到时返回默认图标
 */
export function getTemplateIcon(templateId: string): string {
  return templates.find((t) => t.id === templateId)?.icon || '📄';
}

/**
 * 根据模板 ID 获取对应的模板名称
 * @param templateId - 模板 ID
 * @returns 模板名称，找不到时返回 '未知模板'
 */
export function getTemplateName(templateId: string): string {
  return templates.find((t) => t.id === templateId)?.name || '未知模板';
}
