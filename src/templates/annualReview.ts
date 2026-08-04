/**
 * 年度复盘模板
 *
 * 用途：年度全面回顾和目标复盘，包括目标达成、重大事件、能力成长、
 *   人生方向校准
 * 频率：每年，建议年末/年初抽出半天到一天
 * 设计理由：年度复盘是最高级别的自我审视，帮助用户从全年视角审视人生走向，
 *   进行价值观校验和成长反思
 */
import type { FormTemplate } from '@/types';

export const annualReviewTemplate: FormTemplate = {
  id: 'annual_review',
  name: '年度复盘',
  icon: '🎯',
  description: '年度目标回顾、重大事件、能力成长、人生方向校准',
  timing: { frequency: '每年', suggestion: '年末/年初·半天到一天' },
  sections: [
    {
      id: 'basic_info',
      title: '基本信息',
      fields: [
        { id: 'annual_year', label: '复盘年份', type: 'text', priority: 'required', placeholder: '2026', defaultValue: String(new Date().getFullYear()) },
        { id: 'annual_theme', label: '这一年的关键词', type: 'text', priority: 'required', autocomplete: true, hint: '用1-3个词概括这一年' },
        { id: 'annual_overall_score', label: '总体满意度', type: 'radio', priority: 'required', options: [
          { value: '非常满意', label: '非常满意' },
          { value: '满意', label: '满意' },
          { value: '一般', label: '一般' },
          { value: '不满意', label: '不满意' },
          { value: '很不满意', label: '很不满意' },
        ]},
        { id: 'annual_one_sentence', label: '一句话总结这一年', type: 'text', priority: 'recommended', hint: '如果只能用一句话描述这一年，你会怎么说？' },
      ],
    },

    {
      id: 'major_events',
      title: '重大事件回顾',
      fields: [
        { id: 'annual_top_events', label: '年度十大事件', type: 'textarea', priority: 'required', hint: '列出对你影响最大的10件事（正面+负面），从这里能看到一年的轮廓', placeholder: '1. \n2. \n3. \n4. \n5. \n6. \n7. \n8. \n9. \n10. ' },
        { id: 'annual_best_achievement', label: '今年最大的成就', type: 'textarea', priority: 'required', hint: '不一定在计划内，但让你最有成就感的事' },
        { id: 'annual_biggest_regret', label: '今年最大的遗憾', type: 'textarea', priority: 'recommended', hint: '如果能重来，你最想改变什么？' },
        { id: 'annual_turning_points', label: '关键转折点', type: 'textarea', priority: 'recommended', hint: '哪些事件改变了你的方向或认知？之前和之后有什么不同？' },
        { id: 'annual_key_decisions', label: '年度重要决策回顾', type: 'textarea', priority: 'recommended', hint: '回顾今年的重大决策——现在看来哪些是对的？哪些想调整？' },
        { id: 'annual_relationships', label: '重要人际变化', type: 'textarea', priority: 'optional', hint: '新建立的关系、深化的关系、淡化的关系、需要修复的关系' },
      ],
    },
    {
      id: 'growth_summary',
      title: '能力成长总结',
      fields: [
        { id: 'annual_skills_gained', label: '新获得/显著提升的能力', type: 'textarea', priority: 'required', hint: '今年你在哪些方面变强了？', autocomplete: true },
        { id: 'annual_knowledge_gained', label: '重要的新认知/观念转变', type: 'textarea', priority: 'required', hint: '有哪些看法和年初相比发生了根本改变？' },
        { id: 'annual_habits_formed', label: '养成的好习惯', type: 'textarea', priority: 'recommended', hint: '哪些新习惯坚持下来了？' },
        { id: 'annual_habits_broken', label: '戒除的坏习惯', type: 'textarea', priority: 'optional' },
        { id: 'annual_growth_areas', label: '仍需成长的领域', type: 'textarea', priority: 'recommended', hint: '诚实面对：哪些短板还没有改善？' },
        { id: 'annual_growth_score', label: '整体成长感受', type: 'radio', priority: 'required', options: [
          { value: '脱胎换骨', label: '脱胎换骨' },
          { value: '显著成长', label: '显著成长' },
          { value: '稳步提升', label: '稳步提升' },
          { value: '原地踏步', label: '原地踏步' },
          { value: '有所退步', label: '有所退步' },
        ]},
      ],
    },
    {
      id: 'life_direction',
      title: '人生方向校准',
      fields: [
        { id: 'annual_values_check', label: '我的核心价值观是否有变化？', type: 'textarea', priority: 'required', hint: '什么对你最重要？健康？家庭？自由？成长？财富？排序有变吗？' },
        { id: 'annual_life_satisfaction', label: '生活各维度满意度', type: 'table', priority: 'recommended',
          tableColumns: [
            { id: 'dimension', label: '维度', type: 'text', width: '25%' },
            { id: 'score', label: '满意度(1-10)', type: 'select', options: ['1','2','3','4','5','6','7','8','9','10'], width: '20%' },
            { id: 'note', label: '说明/感受', type: 'text', width: '55%' },
          ],
          defaultValue: [
            { dimension: '事业/工作', score: '', note: '' },
            { dimension: '财务/收入', score: '', note: '' },
            { dimension: '健康/体能', score: '', note: '' },
            { dimension: '家庭/亲密关系', score: '', note: '' },
            { dimension: '社交/友谊', score: '', note: '' },
            { dimension: '学习/成长', score: '', note: '' },
            { dimension: '休闲/娱乐', score: '', note: '' },
            { dimension: '精神/内心', score: '', note: '' },
          ],
        },
        { id: 'annual_identity_shift', label: '我在成为什么样的人？', type: 'textarea', priority: 'recommended', hint: '对比一年前的自己，你更接近理想中的自己了吗？' },
        { id: 'annual_what_to_stop', label: '明年要停止做的事', type: 'textarea', priority: 'recommended', hint: '减法比加法更重要——什么在消耗你但不产生价值？' },
        { id: 'annual_what_to_continue', label: '要继续坚持的事', type: 'textarea', priority: 'recommended', hint: '什么正在发挥复利效应？' },
      ],
    },
    {
      id: 'appendix',
      title: '附录',
      collapsedByDefault: true,
      fields: [
        { id: 'annual_books_media', label: '年度阅读/学习清单', type: 'textarea', priority: 'optional', placeholder: '书籍、课程、播客...' },
        { id: 'annual_financial_review', label: '年度财务概况', type: 'textarea', priority: 'optional', hint: '收入变化、资产配置、投资收益、重大支出' },
        { id: 'annual_health_review', label: '年度健康状况', type: 'textarea', priority: 'optional', hint: '身体指标变化、运动习惯、睡眠质量、心理状态' },
        { id: 'annual_gratitude', label: '感恩清单', type: 'textarea', priority: 'optional', hint: '今年最感谢的人/事/机遇' },
        { id: 'annual_letter_to_future', label: '给一年后自己的信', type: 'textarea', priority: 'optional', hint: '写给明年此时的你——期待、叮嘱、鼓励' },
      ],
    },
  ],
};
