/**
 * 月度复盘模板
 *
 * 用途：月度模式识别和趋势分析，包括目标达成评估、能力成长记录、
 *   行为模式觉察
 * 频率：每月，建议月末 1-2 小时
 * 设计理由：月度复盘提供更高维度的视角，帮助发现周复盘中难以觉察的
 *   长期模式和趋势，并进行方向校准
 */
import type { FormTemplate } from '@/types';

export const monthlyReviewTemplate: FormTemplate = {
  id: 'monthly_review',
  name: '月度复盘',
  icon: '📅',
  description: '能力评估、模式觉察、重要事件回顾',
  timing: { frequency: '每月', suggestion: '月末1-2小时' },
  sections: [
    {
      id: 'basic_info',
      title: '基本信息',
      fields: [
        { id: 'month_period', label: '月份', type: 'text', priority: 'required', placeholder: '2026年8月', defaultValue: `${new Date().getFullYear()}年${new Date().getMonth() + 1}月` },
        { id: 'month_theme', label: '本月主题/关键词', type: 'text', priority: 'recommended', autocomplete: true, hint: '用1-3个词概括这个月' },
        { id: 'month_overall_score', label: '总体满意度', type: 'radio', priority: 'required', options: [
          { value: '非常满意', label: '非常满意' },
          { value: '满意', label: '满意' },
          { value: '一般', label: '一般' },
          { value: '不满意', label: '不满意' },
          { value: '很不满意', label: '很不满意' },
        ]},
      ],
    },
    {
      id: 'key_events_decisions',
      title: '重要事件与决策',
      fields: [
        { id: 'month_key_events', label: '本月重大事件', type: 'textarea', priority: 'required', hint: '列出3-5件对你影响最大的事件', placeholder: '1. 事件 + 影响\n2. ...' },
        { id: 'month_key_decisions', label: '本月重要决策回顾', type: 'textarea', priority: 'recommended', hint: '这些决策现在看来正确吗？为什么？' },
        { id: 'month_biggest_success', label: '本月最大的成功', type: 'textarea', priority: 'required', hint: '是什么让它成功？能否复制到其他领域？' },
        { id: 'month_biggest_challenge', label: '本月最大的挑战', type: 'textarea', priority: 'required', hint: '你是如何应对的？下次会如何不同？' },
      ],
    },
    {
      id: 'ability_growth',
      title: '能力与成长',
      fields: [
        { id: 'month_skills_improved', label: '提升的能力', type: 'textarea', priority: 'recommended', hint: '这个月在哪些方面有明显进步？', autocomplete: true },
        { id: 'month_knowledge_gained', label: '新学到的知识/认知', type: 'textarea', priority: 'recommended', hint: '有什么观念发生了改变？' },
        { id: 'month_habits_progress', label: '习惯养成进展', type: 'textarea', priority: 'recommended', hint: '好习惯的坚持情况，坏习惯的改善情况' },
        { id: 'month_growth_score', label: '成长感受', type: 'radio', priority: 'recommended', options: [
          { value: '显著成长', label: '显著成长' },
          { value: '有所进步', label: '有所进步' },
          { value: '原地踏步', label: '原地踏步' },
          { value: '有所退步', label: '有所退步' },
        ]},
      ],
    },
    {
      id: 'pattern_awareness',
      title: '模式觉察',
      collapsedByDefault: false,
      fields: [
        { id: 'month_recurring_patterns', label: '反复出现的模式', type: 'textarea', priority: 'recommended', hint: '这个月有哪些行为/情绪模式反复出现？和上月相比有改善吗？' },
        { id: 'month_energy_pattern', label: '精力分配回顾', type: 'textarea', priority: 'recommended', hint: '精力主要花在了哪里？是否匹配优先级？' },
        { id: 'month_relationship_changes', label: '人际关系变化', type: 'textarea', priority: 'optional', hint: '重要关系的变化，新建立或需修复的关系' },
      ],
    },
    {
      id: 'appendix_data',
      title: '附录与数据',
      collapsedByDefault: true,
      fields: [
        { id: 'month_reading_list', label: '本月阅读/学习', type: 'textarea', priority: 'optional', placeholder: '书籍、课程、文章...' },
        { id: 'month_financial_summary', label: '财务简况', type: 'textarea', priority: 'optional', hint: '收支概况、投资变动' },
        { id: 'month_health_status', label: '身心健康', type: 'textarea', priority: 'optional', hint: '运动、睡眠、情绪整体状况' },
        { id: 'month_notes', label: '其他备注', type: 'textarea', priority: 'optional' },
      ],
    },
  ],
};
