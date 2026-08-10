/**
 * 日常微复盘模板
 *
 * 用途：每日快速记录，以「自我管理矩阵」为核心：把当天事项按重要/紧急归位到
 *   四象限（参考《高效能人士的七个习惯》要事第一），重点关注不紧急但重要的
 *   第二象限，并结合收获/教训与明日第二象限要事，培养最轻量的复盘习惯
 * 频率：每天，建议睡前 5 分钟
 * 设计理由：复盘习惯的养成需要极低的门槛，日常微复盘仅需 5 分钟，
 *   让用户每天都能坚持，逐步建立「复盘反射」
 *
 * 2026-08-11 优化：原「睡前三问」的日期/收获教训/明日要事字段直接并入
 *   自我管理矩阵（最有价值的一件事由矩阵承载，明日最重要的一件事即第二象限要事），
 *   消除重复填写。
 */
import type { FormTemplate } from '@/types';
import { DEFAULT_QUADRANTS } from '@/constants/quadrant';

export const dailyReviewTemplate: FormTemplate = {
  id: 'daily_review',
  name: '日常微复盘',
  icon: '🌙',
  description: '睡前5分钟 — 用四象限矩阵归位今天，为明天选一件要事',
  timing: { frequency: '每天', suggestion: '睡前5分钟' },
  sections: [
    {
      id: 'self_management_matrix',
      title: '自我管理矩阵',
      description: '把今天的事项按「重要/紧急」归位到四个象限，重点关注不紧急但重要的第二象限 —— 它是提升长期效能的杠杆（高效能人士的七个习惯 · 要事第一）',
      fields: [
        { id: 'daily_date', label: '日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
        {
          id: 'daily_matrix',
          label: '今日事项归位',
          type: 'quadrant',
          priority: 'recommended',
          hint: '把今天做过的、没做完的事放入对应象限。今天最有价值的一件事，往往就是不紧急但重要的那件——记得把它放进第二象限',
          quadrants: DEFAULT_QUADRANTS,
        },
        {
          id: 'daily_lesson',
          label: '今天最大的收获/教训是什么？',
          type: 'textarea',
          priority: 'required',
          hint: '可以是一个新认知、一次情绪觉察、或一个小失误；也看看矩阵里哪些象限失衡暴露了问题',
          placeholder: '例：发现自己今天被第三象限的琐事占据太多，明天要回护第二象限的时间',
          autocomplete: true,
        },
        {
          id: 'daily_q2_focus',
          label: '明日第二象限要事（明天最重要的一件事）',
          type: 'textarea',
          priority: 'required',
          hint: '从第二象限中挑选 1 件，明天主动为它预留 30-60 分钟 —— 这就是「明天最重要的一件事」，让明天有焦点',
          placeholder: '例：晨间阅读 30 分钟 / 提前规划下周项目 / 联系一位久未联系的朋友',
          autocomplete: true,
        },
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
