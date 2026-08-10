/**
 * batchExport — 批量文档导出服务
 *
 * 1. exportRecordsAsMarkdown：把多条记录按模板分组、按时间排序，合并为单个 Markdown 文档
 *    （区别于数据管理页的 JSON 备份——这是给人读的文档归档）
 * 2. generateAnnualReport：按年份汇总全年复盘数据，生成年度复盘报告（Markdown）
 *    —— 汇总各模板数量、日复盘情绪/精力分布、情绪觉察主导情绪、决策类型分布、投资记录数、连续复盘天数
 */
import type { FormRecord, FormTemplate } from '@/types';
import { exportToMarkdown } from './exportMarkdown';

/** 多条记录 → 合并 Markdown（按模板分组，组内按时间升序） */
export function exportRecordsAsMarkdown(records: FormRecord[], templateList: FormTemplate[]): string {
  const templateMap = new Map<string, FormTemplate>(templateList.map((t) => [t.id, t]));
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groups = new Map<string, FormRecord[]>();
  sorted.forEach((r) => {
    const list = groups.get(r.templateId) ?? [];
    list.push(r);
    groups.set(r.templateId, list);
  });

  const lines: string[] = [
    '# 复盘记录批量导出',
    '',
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    `记录总数：${records.length} 条`,
    '',
  ];
  for (const [tid, recs] of groups) {
    const t = templateMap.get(tid);
    lines.push(`## ${t?.name ?? tid}（${recs.length} 条）`, '');
    recs.forEach((r, i) => {
      const md = t ? exportToMarkdown(r, t) : `### ${r.title}\n\n（模板缺失，无法导出）`;
      lines.push(`### ${i + 1}. ${r.title}`, '', md, '---', '');
    });
  }
  return lines.join('\n');
}

interface CountMap {
  [key: string]: number;
}

/** 统计数组元素出现次数 */
function countBy(items: (string | undefined)[]): CountMap {
  const map: CountMap = {};
  items.forEach((v) => {
    if (!v) return;
    const key = String(v).trim();
    if (!key) return;
    map[key] = (map[key] ?? 0) + 1;
  });
  return map;
}

/** 计算日期集合（YYYY-MM-DD）的最长连续天数 */
function longestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const set = new Set(dates);
  let best = 1;
  const visited = new Set<string>();
  for (const d of set) {
    if (visited.has(d)) continue;
    visited.add(d);
    let prev = new Date(`${d}T00:00:00`);
    let next = new Date(`${d}T00:00:00`);
    let streak = 1;
    while (true) {
      prev.setDate(prev.getDate() - 1);
      const prevStr = prev.toISOString().slice(0, 10);
      if (set.has(prevStr) && !visited.has(prevStr)) { visited.add(prevStr); streak += 1; } else break;
    }
    while (true) {
      next.setDate(next.getDate() + 1);
      const nextStr = next.toISOString().slice(0, 10);
      if (set.has(nextStr) && !visited.has(nextStr)) { visited.add(nextStr); streak += 1; } else break;
    }
    if (streak > best) best = streak;
  }
  return best;
}

/** 生成年度复盘报告（Markdown） */
export function generateAnnualReport(records: FormRecord[], year: number): string {
  const inYear = records.filter((r) => {
    const y = new Date(r.createdAt).getFullYear();
    return y === year;
  });
  const countByTemplate: CountMap = {};
  inYear.forEach((r) => { countByTemplate[r.templateId] = (countByTemplate[r.templateId] ?? 0) + 1; });

  const dailies = inYear.filter((r) => r.templateId === 'daily_review' && r.status === 'completed');
  const moods = countBy(dailies.map((r) => (r.data as Record<string, unknown>)?.daily_mood as string | undefined));
  const energies = countBy(dailies.map((r) => (r.data as Record<string, unknown>)?.daily_energy as string | undefined));
  const dailyDates = dailies
      .map((r) => String((r.data as Record<string, unknown>)?.daily_date ?? ''))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  const emotions = inYear.filter((r) => r.templateId === 'emotional_awareness' && r.status === 'completed');
  const emotionMap = countBy(emotions.map((r) => (r.data as Record<string, unknown>)?.emotion_dominant as string | undefined));

  const decisions = inYear.filter((r) => r.templateId === 'decision_log' && r.status === 'completed');
  const decisionTypes = countBy(decisions.map((r) => (r.data as Record<string, unknown>)?.decision_type as string | undefined));

  const investments = inYear.filter((r) => ['investment_checklist', 'investment_buy', 'investment_sell', 'investment_position'].includes(r.templateId));

  const templateNames: Record<string, string> = {
    daily_review: '日常微复盘', weekly_review: '周复盘', monthly_review: '月复盘', annual_review: '年度复盘',
    emotional_awareness: '情绪觉察', case_study: '实战案例', decision_log: '决策日志',
    investment_checklist: '投资检查清单', investment_buy: '投资·买入', investment_sell: '投资·卖出', investment_position: '投资·仓位',
  };

  const lines: string[] = [
    `# ${year} 年度复盘报告`,
    '',
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '## 一、全年概况',
    '',
    `- 复盘记录总数：${inYear.length} 条`,
    ...Object.entries(countByTemplate)
        .sort((a, b) => b[1] - a[1])
        .map(([tid, n]) => `- ${templateNames[tid] ?? tid}：${n} 条`),
    '',
    '## 二、日常复盘（情绪与精力）',
    '',
    `- 日复盘完成天数：${dailies.length} 天`,
    `- 最长连续复盘：${longestStreak(dailyDates)} 天`,
    '',
    '### 情绪分布',
    '',
    ...(Object.keys(moods).length > 0
        ? Object.entries(moods).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}：${n} 天`)
        : ['- （未记录）']),
    '',
    '### 精力分布',
    '',
    ...(Object.keys(energies).length > 0
        ? Object.entries(energies).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}：${n} 天`)
        : ['- （未记录）']),
    '',
    '## 三、情绪觉察',
    '',
    `- 情绪觉察记录：${emotions.length} 条`,
    ...(Object.keys(emotionMap).length > 0
        ? Object.entries(emotionMap).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- 主导情绪「${k}」：${n} 次`)
        : []),
    '',
    '## 四、决策日志',
    '',
    `- 已完成决策：${decisions.length} 个`,
    ...(Object.keys(decisionTypes).length > 0
        ? Object.entries(decisionTypes).sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}类决策：${n} 个`)
        : []),
    '',
    '## 五、投资记录',
    '',
    `- 投资相关记录：${investments.length} 条`,
    '',
    '---',
    '本报告由个人复盘系统自动生成，可配合月度/年度复盘模板使用。',
    '',
  ];
  return lines.join('\n');
}
