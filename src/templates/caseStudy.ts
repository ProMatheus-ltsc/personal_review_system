/**
 * 实战案例模板
 *
 * 用途：深度分析具体事件的决策过程，记录和分析人际互动中的实战案例，
 *   包括场景背景、策略准备、执行过程、结果评估和经验提炼
 * 频率：事件后，建议在重大项目/谈判结束时使用
 * 设计理由：重大事件的复盘需要结构化的框架来确保全面性，
 *   帮助用户从单次事件中提炼可复用的模式和策略
 *
 * 特殊机制：
 * - 场景自适应：选择复盘场景（重大失败/意外成功/人际冲突等）后，
 *   后续字段的引导提示（conditionalHints）会自动适配
 * - 条件字段：如目标未达成时展示失败原因分析、关系恶化时展示修复计划
 */
import type { FormTemplate } from '@/types';

export const caseStudyTemplate: FormTemplate = {
  id: 'case_study',
  name: '实战案例',
  icon: '📋',
  description: '记录和分析人际互动中的实战案例',
  timing: { frequency: '事件后', suggestion: '重大项目/谈判结束时' },
  sections: [
    {
      id: 'scenario_selection',
      title: '场景选择',
      description: '选择复盘场景，后续引导提示会自动适配',
      fields: [
        { id: 'case_scenario', label: '复盘场景', type: 'radio', priority: 'required', required: true, hint: '选择场景后，后续字段的引导提示会自动适配', options: [
          { value: '重大失败/挫折', label: '重大失败/挫折' },
          { value: '意外成功', label: '意外成功' },
          { value: '日常事件', label: '日常事件' },
          { value: '人际冲突', label: '人际冲突' },
          { value: '重要项目', label: '重要项目' },
        ]},
      ],
    },
    {
      id: 'basic_info',
      title: '基本信息',
      description: '案例的基本背景信息',
      fields: [
        { id: 'title', label: '案例标题', type: 'text', required: true, placeholder: '用一句话概括这个案例', priority: 'required' },
        { id: 'scene_type', label: '场景类型', type: 'select', required: true, priority: 'required', options: [
          { value: '婚恋家庭', label: '婚恋家庭' }, { value: '职场发展', label: '职场发展' },
          { value: '商业谈判', label: '商业谈判' }, { value: '冲突处理', label: '冲突处理' }, { value: '其他', label: '其他' },
        ]},
        { id: 'scene_type_custom', label: '自定义场景类型', type: 'text', priority: 'recommended', placeholder: '请描述具体场景类型', condition: { dependsOn: 'scene_type', showWhen: '其他' } },
        { id: 'people_involved', label: '涉及人员', type: 'text', placeholder: '列出相关人员及其角色', priority: 'recommended', autocomplete: true },
        { id: 'event_date', label: '事件日期', type: 'date', priority: 'recommended', defaultValue: 'auto_today' },
        { id: 'location', label: '地点', type: 'text', placeholder: '事件发生的地点', priority: 'optional' },
      ],
    },
    {
      id: 'background',
      title: '背景与目标',
      description: '分析情境、各方立场和目标',
      fields: [
        { id: 'situation', label: '情境描述', type: 'textarea', placeholder: '描述当时的情境和关系状态', priority: 'recommended', hint: '包含时间、地点、人物关系、前因后果' },
        { id: 'positions', label: '各方立场', type: 'textarea', placeholder: '各方的立场和诉求是什么？', priority: 'recommended', hint: '逐一列出每个参与方的公开立场' },
        { id: 'constraints', label: '约束条件', type: 'textarea', placeholder: '有哪些关键约束条件？', priority: 'optional', hint: '时间、资源、规则、关系等方面的限制' },
        { id: 'main_goal', label: '主要目标', type: 'textarea', required: true, placeholder: '你的主要目标是什么？', priority: 'required', hint: '用一句话明确你最想达成的结果', hintDependsOn: 'case_scenario', conditionalHints: {
          '重大失败/挫折': '当时的目标是什么？现在回看，目标设定本身合理吗？',
          '意外成功': '原本的预期是什么？为什么实际结果超出了预期？',
          '人际冲突': '你在这段关系中想要的是什么？对方想要的又是什么？',
          '重要项目': '项目的核心目标和成功标准是什么？',
        }},
        { id: 'bottom_line', label: '底线条件', type: 'textarea', required: true, placeholder: '你的底线/必守条件是什么？', priority: 'required', hint: '低于这个底线就必须放弃或改变策略' },
        { id: 'compromise_space', label: '可妥协空间', type: 'textarea', placeholder: '哪些方面可以妥协？', priority: 'recommended' },
        { id: 'other_surface_demand', label: '对方表面诉求', type: 'textarea', placeholder: '对方表面上要求什么？', priority: 'recommended' },
        { id: 'other_deep_demand', label: '对方深层诉求', type: 'textarea', placeholder: '对方真正想要的是什么？', priority: 'recommended', hint: '思考对方行为背后真正想要的是什么——安全感？认可？控制权？利益最大化？' },
        { id: 'other_concerns', label: '对方顾虑', type: 'textarea', placeholder: '对方可能有哪些顾虑？', priority: 'optional', hint: '站在对方角度思考其担忧和恐惧' },
      ],
    },
    {
      id: 'strategy',
      title: '策略与准备',
      description: '信息收集和策略规划',
      fields: [
        { id: 'known_info', label: '已知信息', type: 'textarea', placeholder: '你掌握了哪些关键信息？', priority: 'recommended' },
        { id: 'unknown_info', label: '未知信息', type: 'textarea', placeholder: '还有哪些信息需要了解？', priority: 'optional' },
        { id: 'info_source', label: '信息来源', type: 'textarea', placeholder: '如何获取缺失的信息？', priority: 'optional' },
        { id: 'overall_strategy', label: '总体策略', type: 'radio', required: true, priority: 'required', options: [
          { value: '合作共赢', label: '合作共赢' }, { value: '竞争对抗', label: '竞争对抗' },
          { value: '回避退让', label: '回避退让' }, { value: '其他', label: '其他（自定义）' },
        ]},
        { id: 'overall_strategy_custom', label: '自定义策略', type: 'textarea', priority: 'recommended', placeholder: '描述你的具体策略思路', condition: { dependsOn: 'overall_strategy', showWhen: '其他' } },
        { id: 'core_tactics', label: '核心战术', type: 'textarea', placeholder: '具体打算怎么做？', priority: 'recommended', hint: '分步骤列出具体的行动计划' },
        { id: 'plan_b', label: '备选方案', type: 'textarea', placeholder: '如果主方案失败，Plan B是什么？', priority: 'recommended' },
        { id: 'opening_line', label: '开场白', type: 'textarea', placeholder: '计划如何开场？', priority: 'optional', hint: '第一句话往往决定了对话的基调' },
        { id: 'persuasion_points', label: '说服要点', type: 'textarea', placeholder: '准备的核心说服论点', priority: 'recommended' },
        { id: 'objection_responses', label: '异议应对', type: 'textarea', placeholder: '对方可能的反对意见及应对', priority: 'optional', hint: '提前预判对方的反驳并准备回应' },
        { id: 'bonus_phrases', label: '加分话术', type: 'textarea', placeholder: '准备的关键话术', priority: 'optional' },
      ],
    },
    {
      id: 'execution',
      title: '执行过程',
      description: '记录实际执行的时间线和关键对话',
      fields: [
        // 时间线记录（表格）
        { id: 'timeline', label: '时间线记录', type: 'table', priority: 'recommended', hint: '记录执行过程中的各个关键阶段', tableColumns: [
          { id: 'phase', label: '阶段', type: 'select', options: ['开场', '交锋', '转折', '收尾'], width: '12%' },
          { id: 'time', label: '时间', type: 'text', width: '15%' },
          { id: 'event', label: '事件', type: 'text', width: '28%' },
          { id: 'action', label: '我的行动', type: 'text', width: '22%' },
          { id: 'reaction', label: '对方反应', type: 'text', width: '23%' },
        ]},
        // 关键对话记录（表格）
        { id: 'key_dialogues', label: '关键对话记录', type: 'table', priority: 'recommended', hint: '记录关键转折点的对话，重点是改变局势的那几句', hintDependsOn: 'case_scenario', conditionalHints: {
          '重大失败/挫折': '从什么时候开始偏离目标的？关键转折点在哪里？',
          '意外成功': '做了哪些事？哪些是有意为之，哪些是无意中做对了？',
          '人际冲突': '冲突是如何升级的？双方各做了什么？',
          '重要项目': '项目的关键里程碑和转折点是什么？',
        }, tableColumns: [
          { id: 'scene', label: '场景', type: 'text', width: '15%' },
          { id: 'my_words', label: '我说的话', type: 'text', width: '25%' },
          { id: 'other_words', label: '对方说的话', type: 'text', width: '25%' },
          { id: 'thought', label: '心理活动', type: 'text', width: '15%' },
          { id: 'effect', label: '效果', type: 'select', options: ['加分', '减分', '中性'], width: '20%' },
        ]},
        // 意外与调整
        { id: 'unexpected', label: '意外情况', type: 'textarea', placeholder: '有什么出乎意料的事发生？', priority: 'optional' },
        { id: 'adjustment', label: '临场调整', type: 'textarea', placeholder: '你做了什么调整？', priority: 'optional' },
        { id: 'adjustment_effect', label: '调整效果', type: 'textarea', placeholder: '调整的效果如何？', priority: 'optional' },
      ],
    },
    {
      id: 'results',
      title: '结果与评估',
      description: '评估最终结果和各项成本',
      fields: [
        { id: 'goal_achievement', label: '目标达成度', type: 'radio', required: true, priority: 'required', options: [
          { value: '完全达成', label: '完全达成' }, { value: '基本达成', label: '基本达成' },
          { value: '部分达成', label: '部分达成' }, { value: '未达成', label: '未达成' },
        ]},
        { id: 'failure_analysis', label: '失败原因分析', type: 'textarea', priority: 'required', placeholder: '深入分析未能达成目标的原因', hint: '从策略、执行、信息、环境等方面逐一分析', condition: { dependsOn: 'goal_achievement', showWhen: '未达成' } },
        { id: 'actual_gains', label: '实际收获', type: 'textarea', placeholder: '最终得到了什么？', priority: 'recommended' },
        { id: 'price_paid', label: '付出代价', type: 'textarea', placeholder: '为此付出了什么代价？', priority: 'recommended' },
        { id: 'relationship_change', label: '关系变化', type: 'radio', priority: 'recommended', options: [
          { value: '改善', label: '改善' }, { value: '维持', label: '维持' }, { value: '恶化', label: '恶化' },
        ]},
        { id: 'relationship_repair_plan', label: '关系修复计划', type: 'textarea', priority: 'recommended', placeholder: '如何修复这段关系？', condition: { dependsOn: 'relationship_change', showWhen: '恶化' } },
        { id: 'other_party_impact', label: '对方影响', type: 'textarea', placeholder: '对对方产生了什么影响？', priority: 'optional' },
        { id: 'time_cost', label: '时间成本', type: 'select', priority: 'recommended', options: [
          { value: '15分钟内', label: '15分钟内' }, { value: '30分钟', label: '30分钟' },
          { value: '1小时', label: '1小时' }, { value: '2-3小时', label: '2-3小时' },
          { value: '半天', label: '半天' }, { value: '一天', label: '一天' },
          { value: '几天', label: '几天' }, { value: '一周以上', label: '一周以上' },
        ]},
        { id: 'financial_cost', label: '金钱成本', type: 'number', priority: 'optional', validation: { min: 0 } },
        { id: 'emotional_cost', label: '情绪成本', type: 'textarea', placeholder: '情绪上的消耗如何？', priority: 'optional' },
        { id: 'benefit_assessment', label: '收益评估', type: 'textarea', placeholder: '整体来看收益是否大于成本？', priority: 'recommended', hint: '从短期和长期两个维度评估', hintDependsOn: 'case_scenario', conditionalHints: {
          '重大失败/挫折': '实际损失有多大？区分事实损失和情绪放大的部分',
          '意外成功': '成功的程度如何量化？运气成分占多少，能力占多少？',
          '人际冲突': '冲突的结果是什么？关系目前的状态如何？',
          '重要项目': '项目目标达成了多少？超出或不及预期的部分？',
        }},
      ],
    },
    {
      id: 'review',
      title: '复盘与提炼',
      description: '总结经验教训，提炼可复用的模式',
      fields: [
        { id: 'done_well_1', label: '做得好的1', type: 'textarea', required: true, placeholder: '第一个做得好的地方', priority: 'required', hint: '最关键的一个成功因素', hintDependsOn: 'case_scenario', conditionalHints: {
          '重大失败/挫折': '即使失败了，哪些判断或行动是正确的？',
          '意外成功': '哪些因素是你能复制的？什么条件可控？',
          '人际冲突': '你在处理过程中哪些反应是建设性的？',
          '重要项目': '哪些策略/方法被证明有效？',
        }},
        { id: 'done_well_2', label: '做得好的2', type: 'textarea', placeholder: '第二个做得好的地方', priority: 'optional' },
        { id: 'done_well_3', label: '做得好的3', type: 'textarea', placeholder: '第三个做得好的地方', priority: 'optional' },
       { id: 'done_poorly_1', label: '做得不好的1', type: 'textarea', required: true, placeholder: '第一个做得不好的地方', priority: 'required', hint: '最需要改进的一个问题', hintDependsOn: 'case_scenario', conditionalHints: {
          '重大失败/挫折': '哪些是判断失误？哪些是执行不力？哪些是运气不好？',
          '意外成功': '成功是否掩盖了某些问题？有没有"虽然赢了但方法不对"的地方？',
          '人际冲突': '你的哪些行为加剧了冲突？有没有情绪化的决定？',
          '重要项目': '如果重做一次，哪些环节会做不同？',
        }},
        { id: 'done_poorly_2', label: '做得不好的2', type: 'textarea', placeholder: '第二个做得不好的地方', priority: 'optional' },
        { id: 'done_poorly_3', label: '做得不好的3', type: 'textarea', placeholder: '第三个做得不好的地方', priority: 'optional' },
        { id: 'insight_human_nature', label: '人性洞察', type: 'textarea', placeholder: '关于人性你学到了什么？', priority: 'recommended', hint: '观察人在压力、利益、情感面前的真实反应' },
        { id: 'insight_strategy', label: '策略洞察', type: 'textarea', placeholder: '关于策略你学到了什么？', priority: 'recommended' },
        { id: 'insight_self', label: '自我洞察', type: 'textarea', placeholder: '关于自己你学到了什么？', priority: 'recommended' },
       { id: 'pattern_name', label: '模式名称', type: 'text', placeholder: '给这个模式起个名字', priority: 'recommended', autocomplete: true, hint: '用简洁的名称命名这个可复用的模式', hintDependsOn: 'case_scenario', conditionalHints: {
          '重大失败/挫折': '这个失败模式以前出现过吗？有没有"总是在XX情况下翻车"的规律？',
          '意外成功': '这次成功背后有没有可复用的模式/策略？在什么条件下可以再次使用？',
          '人际冲突': '你在关系冲突中有没有反复出现的反应模式？',
          '重要项目': '跨项目看，你的管理/执行有什么一致的模式？',
        }},
        { id: 'pattern_scenario', label: '适用场景', type: 'textarea', placeholder: '这个模式适用于什么场景？', priority: 'recommended', autocomplete: true },
        { id: 'pattern_elements', label: '关键要素', type: 'textarea', placeholder: '这个模式的关键要素是什么？', priority: 'recommended' },
        { id: 'pattern_tips', label: '操作要点', type: 'textarea', placeholder: '使用这个模式的注意事项', priority: 'optional' },
        { id: 'pattern_risks', label: '风险提示', type: 'textarea', placeholder: '使用这个模式可能的风险', priority: 'optional' },
      ],
    },
    {
      id: 'next_time',
      title: '下次操作',
      description: '为类似场景做准备',
      collapsedByDefault: true,
      fields: [
       { id: 'different_choices', label: '不同选择', type: 'textarea', placeholder: '如果重来，你会做什么不同的选择？', priority: 'optional', hint: '基于现在的认知，重新做一次会怎样？', hintDependsOn: 'case_scenario', conditionalHints: {
          '重大失败/挫折': '如果时光倒流，哪一步做不同就能改变结果？这次的"学费"换来了什么？',
          '意外成功': '如何把"意外"变成"可重复"？需要创造什么条件？',
          '人际冲突': '下次遇到类似冲突，第一步应该做什么？',
          '重要项目': '提炼1-3条可复用的项目管理经验',
        }},
        { id: 'advance_prep', label: '提前准备', type: 'textarea', placeholder: '下次类似情况需要提前准备什么？', priority: 'optional' },
        { id: 'avoid_what', label: '避免什么', type: 'textarea', placeholder: '下次应该避免什么？', priority: 'optional' },
        { id: 'transfer_scenarios', label: '迁移场景', type: 'textarea', placeholder: '这个经验可以迁移到哪些场景？', priority: 'optional', autocomplete: true },
        { id: 'build_capabilities', label: '能力建设', type: 'textarea', placeholder: '需要建设什么能力？', priority: 'optional' },
      ],
    },
    {
      id: 'case_appendix',
      title: '附录',
      description: '补充材料和心理变化记录',
      collapsedByDefault: true,
      fields: [
        { id: 'theories_used', label: '使用理论', type: 'textarea', placeholder: '参考了哪些理论或框架？', priority: 'optional', autocomplete: true },
        { id: 'reference_cases', label: '参考案例', type: 'textarea', placeholder: '有哪些类似的参考案例？', priority: 'optional' },
        { id: 'follow_up', label: '后续跟进', type: 'textarea', placeholder: '需要后续跟进什么？', priority: 'optional' },
        { id: 'emotional_state', label: '情绪状态', type: 'radio', priority: 'optional', options: [
          { value: '平静', label: '平静' }, { value: '焦虑', label: '焦虑' }, { value: '兴奋', label: '兴奋' },
          { value: '低落', label: '低落' }, { value: '愤怒', label: '愤怒' }, { value: '其他', label: '其他（自定义）' },
        ]},
        { id: 'emotional_state_custom', label: '自定义情绪状态', type: 'text', priority: 'optional', placeholder: '描述你的情绪状态', condition: { dependsOn: 'emotional_state', showWhen: '其他' } },
        { id: 'psychological_change', label: '心理变化', type: 'textarea', placeholder: '心理状态有什么变化？', priority: 'optional' },
        { id: 'personal_patterns', label: '个人模式', type: 'textarea', placeholder: '发现了自己什么样的模式？', priority: 'optional', autocomplete: true },
      ],
    },
  ],
};
