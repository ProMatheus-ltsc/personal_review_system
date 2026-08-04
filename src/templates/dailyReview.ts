/**
 * 日常微复盘模板
 *
 * 用途：每日快速记录，通过「睡前三问」关注情绪和关键事件，培养最轻量的复盘习惯
 * 频率：每天，建议睡前 5 分钟
 * 设计理由：复盘习惯的养成需要极低的门槛，日常微复盘仅需 5 分钟，
 *   让用户每天都能坚持，逐步建立「复盘反射」
 */
import type { FormTemplate } from '@/types';

export const dailyReviewTemplate: FormTemplate = {
  id: 'daily_review',
  name: '日常微复盘',
  icon: '🌙',
  description: '睡前5分钟三问 — 最轻量的日常复盘习惯',
  timing: { frequency: '每天', suggestion: '睡前5分钟' },
  sections: [
    {
      id: 'bedtime_questions',
      title: '睡前三问',
      fields: [
        { id: 'daily_date', label: '日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
        { id: 'daily_most_valuable', label: '今天最有价值的一件事是什么？', type: 'textarea', priority: 'required', hint: '不必是最忙的，而是最有意义的', placeholder: '例：与团队完成了一次深度对话，澄清了项目方向', autocomplete: true },
        { id: 'daily_lesson', label: '今天最大的收获/教训是什么？', type: 'textarea', priority: 'required', hint: '可以是一个新认知、一次情绪觉察、或一个小失误', placeholder: '例：发现自己在压力下容易忽略细节', autocomplete: true },
        { id: 'daily_tomorrow_priority', label: '明天最重要的一件事是什么？', type: 'textarea', priority: 'required', hint: '只选一件，让明天有焦点', placeholder: '例：完成项目方案初稿', autocomplete: true },
      ],
    },
    {
      id: 'quick_tags',
      title: '快速标记',
      fields: [
        { id: 'daily_mood', label: '今日情绪', type: 'radio', priority: 'recommended', options: [
          { value: '😊 愉悦', label: '😊 愉悦' },
          { value: '😐 平静', label: '😐 平静' },
          { value: '😔 低落', label: '😔 低落' },
          { value: '😤 焦躁', label: '😤 焦躁' },
          { value: '😴 疲惫', label: '😴 疲惫' },
        ]},
        { id: 'daily_energy', label: '精力水平', type: 'radio', priority: 'recommended', options: [
          { value: '充沛', label: '充沛' },
          { value: '正常', label: '正常' },
          { value: '不足', label: '不足' },
        ]},
        { id: 'daily_highlight', label: '今日亮点', type: 'text', priority: 'optional', placeholder: '一个让你微笑的瞬间', autocomplete: true },
        { id: 'daily_gratitude', label: '感恩一件事', type: 'text', priority: 'optional', placeholder: '今天感谢谁/什么？', hint: '感恩练习有助于保持积极心态' },
      ],
    },
  ],
};
