/**
 * 周复盘模板
 *
 * 用途：每周系统回顾，包括事件复盘、目标追踪、模式觉察和下周规划，
 *   进行 Level 2 事件复盘（高光与低谷深入分析）
 * 频率：每周，建议周末 30-45 分钟
 * 设计理由：周复盘是复盘体系的核心环节，频率适中、深度适当，
 *   既能及时发现问题，又不会因过重而放弃
 *
 * 特殊机制：
 * - 条件字段：事件结果为「失败」时自动展示原因分析和改进方式字段
 * - 可折叠区域：附录模块默认折叠，减少视觉压力
 *
 * 高效能人士的七个习惯复盘（2026-08-11 新增）：
 * - 自我管理矩阵 = 习惯3 要事第一（已有）
 * - h7_personal 个人方面 = 习惯1 积极主动（4 关键行动）+ 习惯2 以终为始
 * - h7_social 社交方面 = 习惯4 双赢思维（4 行动 + 6 种思维）+ 习惯5 知彼解己（2 关键技巧）+ 习惯6 统合综效（珍视差异、第三方案）
 * 新增字段与现有内容重叠处，以现有架构为准（如要事第一复用自我管理矩阵，不重复添加）
 */
import type { FormTemplate } from '@/types';
import { DEFAULT_QUADRANTS } from '@/constants/quadrant';

export const weeklyReviewTemplate: FormTemplate = {
  id: 'weekly_review',
  name: '周复盘',
  icon: '📊',
  description: '每周回顾与规划，帮助你持续成长',
  timing: { frequency: '每周', suggestion: '周末30-45分钟' },
  sections: [
    {
      id: 'basic_info',
      title: '基本信息',
      description: '本周的时间范围和主题',
      fields: [
        { id: 'start_date', label: '开始日期', type: 'date', required: true, priority: 'required', defaultValue: 'auto_week_start' },
        { id: 'end_date', label: '结束日期', type: 'date', required: true, priority: 'required', defaultValue: 'auto_week_end' },
        { id: 'theme', label: '本周主题', type: 'text', required: true, placeholder: '用1-3个关键词概括本周', priority: 'required', autocomplete: true, hint: '例如：项目冲刺、家庭陪伴、技能学习' },
      ],
    },
    {
      id: 'weekly_review',
      title: '本周回顾',
      description: '回顾本周重要事件和目标完成情况',
      fields: [
        { id: 'last_week_actions', label: '上周计划回顾', type: 'textarea', placeholder: '自动加载上周规划的关键行动（可编辑）', priority: 'recommended', hint: '来自上次周复盘的“下周规划”，方便你对照检查完成情况' },
        {
          id: 'key_events',
          label: '关键事件（3-5件）',
          type: 'table',
          tableColumns: [
            { id: 'event', label: '事件', type: 'text', width: '40%' },
            { id: 'category', label: '类型', type: 'select', options: ['工作', '人际', '学习', '健康', '其他'] },
            { id: 'result', label: '结果', type: 'select', options: ['成功', '一般', '失败'] },
            { id: 'emotion', label: '情绪', type: 'select', options: ['积极', '中性', '消极'] }
          ],
          required: false
        },
        // 目标1
        { id: 'goal1', label: '目标1', type: 'text', required: true, placeholder: '本周目标1', priority: 'required' },
        { id: 'goal1_progress', label: '目标1进度(%)', type: 'number', priority: 'required', validation: { min: 0, max: 100 }, defaultValue: 50 },
        { id: 'goal1_completed', label: '目标1已完成', type: 'checkbox', priority: 'required' },
        // 目标2
        { id: 'goal2', label: '目标2', type: 'text', placeholder: '本周目标2', priority: 'recommended' },
        { id: 'goal2_progress', label: '目标2进度(%)', type: 'number', priority: 'recommended', validation: { min: 0, max: 100 }, defaultValue: 50 },
        { id: 'goal2_completed', label: '目标2已完成', type: 'checkbox', priority: 'recommended' },
        // 目标3
        { id: 'goal3', label: '目标3', type: 'text', placeholder: '本周目标3', priority: 'optional' },
        { id: 'goal3_progress', label: '目标3进度(%)', type: 'number', priority: 'optional', validation: { min: 0, max: 100 }, defaultValue: 50 },
        { id: 'goal3_completed', label: '目标3已完成', type: 'checkbox', priority: 'optional' },
        // 意外产出
        { id: 'unexpected_output', label: '意外产出', type: 'textarea', placeholder: '本周有哪些计划外的收获或产出？', priority: 'optional', hint: '不一定每周都有，有则记录' },
      ],
    },
    {
      id: 'deep_review',
      title: '深度复盘',
      description: '深入分析本周的高光与低谷',
      fields: [
        { id: 'highlight_event', label: '高光事件', type: 'text', required: true, placeholder: '本周最值得骄傲的事', priority: 'required' },
        { id: 'highlight_why', label: '为什么成功', type: 'textarea', placeholder: '分析成功的关键因素', priority: 'recommended', hint: '从能力、努力、环境、运气等维度分析' },
        { id: 'highlight_reusable', label: '可复用经验', type: 'textarea', placeholder: '哪些做法可以在未来复用？', priority: 'recommended', hint: '提炼成可操作的步骤或原则' },
        { id: 'lowpoint_event', label: '低谷事件', type: 'text', required: true, placeholder: '本周最不满意的事', priority: 'required' },
        { id: 'lowpoint_cause', label: '原因分析', type: 'textarea', placeholder: '深入分析失败/不满意的原因', priority: 'recommended', hint: '连续问5个为什么，找到根因' },
        { id: 'lowpoint_improvement', label: '改进方案', type: 'textarea', placeholder: '下次如何避免或改善？', priority: 'recommended', hint: '具体到可执行的行动步骤' },
        { id: 'work_relationship_interaction', label: '职场关系互动', type: 'textarea', placeholder: '本周与同事/上级/下属的重要互动', priority: 'recommended' },
        { id: 'work_relationship_change', label: '职场关系变化', type: 'radio', priority: 'recommended', options: [
          { value: '改善', label: '改善' }, { value: '维持', label: '维持' }, { value: '恶化', label: '恶化' },
        ]},
        { id: 'work_relationship_focus', label: '职场关系关注点', type: 'textarea', placeholder: '下周需要重点关注的关系问题', priority: 'recommended', condition: { dependsOn: 'work_relationship_change', showWhen: '恶化' }, hint: '关系恶化时尤其需要制定修复计划' },
        { id: 'work_relationship_repair', label: '关系修复计划', type: 'textarea', placeholder: '具体的修复行动和时间节点', priority: 'recommended', condition: { dependsOn: 'work_relationship_change', showWhen: '恶化' } },
        { id: 'family_interaction', label: '家庭互动', type: 'textarea', placeholder: '本周与家人的重要互动', priority: 'recommended' },
        { id: 'family_attention', label: '家庭关注', type: 'textarea', placeholder: '家庭方面需要关注的事项', priority: 'optional' },
        { id: 'new_knowledge', label: '新知识', type: 'textarea', placeholder: '本周学到的新知识或技能', priority: 'recommended', autocomplete: true },
        { id: 'valuable_input', label: '有价值的输入', type: 'textarea', placeholder: '本周读到/看到/听到的有价值内容', priority: 'optional', hint: '书籍、文章、播客、对话等' },
        { id: 'cognitive_upgrade', label: '认知升级', type: 'textarea', placeholder: '哪些认知发生了改变或升级？', priority: 'recommended', hint: '关注那些颠覆你既有认知的新观点' },
        { id: 'sleep_quality', label: '睡眠质量', type: 'radio', priority: 'recommended', options: [
          { value: '好', label: '好' }, { value: '一般', label: '一般' }, { value: '差', label: '差' },
        ]},
        { id: 'exercise_frequency', label: '运动次数', type: 'number', priority: 'recommended', validation: { min: 0, max: 14 }, defaultValue: 0 },
        { id: 'energy_level', label: '精力水平', type: 'radio', priority: 'recommended', options: [
          { value: '精力充沛', label: '精力充沛' }, { value: '正常', label: '正常' }, { value: '疲惫', label: '疲惫' },
        ]},
        { id: 'emotional_stability', label: '情绪稳定性', type: 'radio', priority: 'optional', options: [
          { value: '平静', label: '平静' }, { value: '焦虑', label: '焦虑' }, { value: '兴奋', label: '兴奋' }, { value: '低落', label: '低落' }, { value: '愤怒', label: '愤怒' },
        ]},
      ],
    },
    {
      id: 'pattern_awareness',
      title: '模式觉察',
      description: '觉察自己的行为、情绪和决策模式',
      fields: [
        { id: 'behavior_pattern', label: '行为模式', type: 'textarea', placeholder: '本周重复出现的行为模式是什么？', priority: 'recommended', hint: '回想本周是否有重复出现的行为模式？例如拖延、过度承诺、回避冲突等', autocomplete: true },
        { id: 'behavior_help_or_hinder', label: '模式影响', type: 'radio', priority: 'recommended', hint: '评估这个模式带来的正面和负面影响', options: [
          { value: '明显帮助', label: '明显帮助' }, { value: '有些帮助', label: '有些帮助' },
          { value: '中性', label: '中性' }, { value: '有些阻碍', label: '有些阻碍' }, { value: '明显阻碍', label: '明显阻碍' },
        ]},
        { id: 'behavior_trigger', label: '触发条件', type: 'textarea', placeholder: '什么情况会触发这个模式？', priority: 'recommended', hint: '关注情境、情绪、人物等触发因素' },
        { id: 'emotion_dominant', label: '主导情绪', type: 'radio', priority: 'recommended', options: [
          { value: '平静', label: '平静' }, { value: '焦虑', label: '焦虑' }, { value: '兴奋', label: '兴奋' },
          { value: '低落', label: '低落' }, { value: '愤怒', label: '愤怒' }, { value: '其他', label: '其他（自定义）' },
        ], hint: '选择本周占主导的情绪状态' },
        { id: 'emotion_dominant_custom', label: '自定义主导情绪', type: 'text', priority: 'optional', placeholder: '描述你的主导情绪', condition: { dependsOn: 'emotion_dominant', showWhen: '其他' } },
        { id: 'emotion_fluctuation', label: '情绪波动', type: 'textarea', placeholder: '情绪在什么时候波动最大？', priority: 'recommended', hint: '记录情绪高峰和低谷出现的时间节点和情境' },
        { id: 'emotion_regulation', label: '情绪调节', type: 'textarea', placeholder: '你用了哪些方式调节情绪？效果如何？', priority: 'recommended', hint: '运动、冥想、倾诉、写作等，哪些有效？' },
        { id: 'decision_important', label: '重要决策', type: 'textarea', placeholder: '本周做了哪些重要决策？', priority: 'recommended', hint: '包括主动做出的和被动应对的决策' },
        { id: 'decision_quality', label: '决策质量', type: 'radio', priority: 'recommended', hint: '回头看这些决策质量如何？', options: [
          { value: '优秀', label: '优秀' }, { value: '良好', label: '良好' }, { value: '一般', label: '一般' }, { value: '较差', label: '较差' },
        ]},
        { id: 'decision_bias', label: '决策偏见', type: 'checkbox', priority: 'optional', hint: '检查本周决策中是否存在这些常见偏见', options: [
          { value: '确认偏见', label: '确认偏见' }, { value: '锚定效应', label: '锚定效应' },
          { value: '沉没成本', label: '沉没成本' }, { value: '过度自信', label: '过度自信' },
          { value: '损失厌恶', label: '损失厌恶' }, { value: '从众心理', label: '从众心理' },
          { value: '无明显偏见', label: '无明显偏见' },
        ]},
      ],
    },
    {
      id: 'self_management_matrix',
      title: '自我管理矩阵',
      description: '盘点本周时间投向了哪个象限，觉察是否被紧急事务推着走；从第二象限中挑选的要事，将写入「下周规划」的核心目标（高效能人士的七个习惯 · 要事第一）',
      fields: [
        {
          id: 'weekly_matrix',
          label: '本周事项归位',
          type: 'quadrant',
          priority: 'recommended',
          hint: '把本周的主要事项放入对应象限，看看时间分布是否失衡',
          quadrants: DEFAULT_QUADRANTS,
        },
        {
          id: 'weekly_quadrant_balance',
          label: '本周时间分布自评',
          type: 'radio',
          priority: 'recommended',
          hint: '诚实地评估本周时间都去哪了，这比"感觉忙"更接近真相',
          options: [
            { value: 'q1_dominant', label: '第一象限主导（被危机推着走，疲于救火）' },
            { value: 'q2_dominant', label: '第二象限主导（主动规划，掌控节奏）' },
            { value: 'q3_dominant', label: '第三象限主导（忙于琐碎，看似充实实则低效）' },
            { value: 'q4_dominant', label: '第四象限主导（时间被无意义消耗）' },
            { value: 'balanced', label: '相对均衡（能把时间留给要事）' },
          ],
        },
        {
          id: 'weekly_q2_insight',
          label: '第二象限觉察',
          type: 'textarea',
          priority: 'optional',
          hint: '本周哪些第一象限危机，本可以通过提前投入第二象限预防？下周如何调整节奏？',
          placeholder: '例：项目延期本可通过提前 2 天规划避免；下周把规划时间固定到周三晚',
          autocomplete: true,
        },
      ],
    },
    {
      id: 'h7_personal',
      title: '高效能 · 个人方面',
      description: '基于《高效能人士的七个习惯》个人领域的胜利：习惯1 积极主动（4 个关键行动）+ 习惯2 以终为始（习惯3 要事第一见上方自我管理矩阵）',
      fields: [
        // —— 习惯1 积极主动：4 个关键行动复盘 ——
        {
          id: 'h7_proactive_zone',
          label: '积极主动 · 关键行动①影响圈聚焦',
          type: 'radio',
          priority: 'recommended',
          hint: '积极主动的关键是聚焦影响圈——把精力放在自己可控、能改变的事情上',
          options: [
            { value: '影响圈', label: '主要投入影响圈（可控之事）' },
            { value: '关注圈', label: '主要陷入关注圈（不可控之事）' },
            { value: '两者相当', label: '两者相当' },
          ],
        },
        {
          id: 'h7_proactive_language',
          label: '积极主动 · 关键行动②语言觉察',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '把「我不得不」换成「我选择」：本周哪些被动语言暴露了被动心态？',
          hint: '被动语言：「我不得不…」「没办法」「都是他害的」；主动语言：「我选择…」「我可以…」——语言是心态的信号',
          autocomplete: true,
        },
        {
          id: 'h7_proactive_responsibility',
          label: '积极主动 · 关键行动③结果责任',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '遇到挫折时，你选择归咎环境，还是承担结果并主动行动？举例说明',
          hint: '回应（Response-ability）= 选择回应的能力：在刺激与回应之间，你有选择的自由',
          autocomplete: true,
        },
        {
          id: 'h7_proactive_promise',
          label: '积极主动 · 关键行动④承诺兑现',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '本周对己对人的承诺是否兑现？下周要兑现哪些承诺？',
          hint: '对自己信守承诺是建立自信的开始，对他人信守承诺是建立信任的开始',
          autocomplete: true,
        },
        // —— 习惯2 以终为始 ——
        {
          id: 'h7_bwe_alignment',
          label: '以终为始 · 使命对齐',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '本周的行动服务于你的长期愿景/个人使命吗？哪些事偏离了「终点」？',
          hint: '先在心中创造结果，再在现实中实现它——对照你的使命宣言/长期目标回看本周',
          autocomplete: true,
        },
        {
          id: 'h7_bwe_roles',
          label: '以终为始 · 角色检视',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '以重要角色（职业/家庭/健康/学习/朋友）视角回看本周：哪个角色被忽略了？',
          hint: '用你的关键角色来定义「终点」，看本周在每个角色上的投入是否平衡',
          autocomplete: true,
        },
      ],
    },
    {
      id: 'h7_social',
      title: '高效能 · 社交方面',
      description: '基于《高效能人士的七个习惯》公众领域的胜利：习惯4 双赢思维（4 行动 + 6 种思维）+ 习惯5 知彼解己（2 个关键技巧）+ 习惯6 统合综效（珍视差异、寻求第三方案）',
      fields: [
        // —— 习惯4 双赢思维 ——
        {
          id: 'h7_ww_paradigms',
          label: '双赢思维 · 六种人际思维自检',
          type: 'checkbox',
          priority: 'recommended',
          hint: '勾选本周在重要互动中出现的思维范式；双赢（利人利己）是成熟互赖关系的基石',
          options: [
            { value: '利人利己（双赢）', label: '利人利己（双赢）' },
            { value: '损人利己（赢-输）', label: '损人利己（赢-输）' },
            { value: '损己利人（输-赢）', label: '损己利人（输-赢）' },
            { value: '两败俱伤（输-输）', label: '两败俱伤（输-输）' },
            { value: '独善其身（赢）', label: '独善其身（赢）' },
            { value: '好聚好散（无交易）', label: '好聚好散（无交易）' },
          ],
        },
        {
          id: 'h7_ww_actions',
          label: '双赢思维 · 四个行动复盘',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '①换位思考 ②关注利益而非立场 ③探索双方都赢的方案 ④达成清晰协议——本周做到哪些？哪一步最薄弱？',
          hint: '双赢四行动：先弄清对方真正想要的 → 聚焦共同利益而非各自立场 → 创造双方都赢的第三选择 → 用清晰协议固定结果',
          autocomplete: true,
        },
        // —— 习惯5 知彼解己 ——
        {
          id: 'h7_sfu_empathy',
          label: '知彼解己 · 关键技巧一：移情倾听',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '本周倾听他人时，是否先做到「理解」再表达？有没有急于评判或给建议的时刻？',
          hint: '移情倾听：不仅听内容，还要听感受与意图；先诊断、后开方，是提升影响力的第一杠杆',
          autocomplete: true,
        },
        {
          id: 'h7_sfu_diagnose',
          label: '知彼解己 · 关键技巧二：先诊断后开方',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '给别人建议前，是否先充分了解他的处境与需求？本周有没有「没听完就开方子」？',
          hint: '医生先诊断再开药——在理解对方之前提出的建议，往往只是自说自话',
          autocomplete: true,
        },
        // —— 习惯6 统合综效 ——
        {
          id: 'h7_syn_value_diff',
          label: '统合综效 · 珍视差异',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '本周与观点不同的人互动时，把差异看作威胁还是机会？',
          hint: '珍视差异是统合综效的前提：1+1>2 来自不同视角的碰撞，而非相似意见的叠加',
          autocomplete: true,
        },
        {
          id: 'h7_syn_third_way',
          label: '统合综效 · 寻求第三方案',
          type: 'textarea',
          priority: 'recommended',
          placeholder: '遇到分歧时，是否尝试寻求超越双方原方案的「第三方案」？结果如何？',
          hint: '第三方案不是你的方案也不是我的方案，而是共创的新选择——创造性合作的标志',
          autocomplete: true,
        },
      ],
    },
    {
      id: 'next_week',
      title: '下周规划',
      description: '规划下周的核心目标和行动（核心目标优先从上方自我管理矩阵的第二象限中挑选）',
      fields: [
        { id: 'core_goal1', label: '核心目标1', type: 'text', required: true, placeholder: '下周最重要的目标（优先从矩阵第二象限挑选）', priority: 'required', hint: '要事第一：核心目标尽量来自第二象限——不紧急但重要的事，才决定长期结果' },
        { id: 'core_goal2', label: '核心目标2', type: 'text', placeholder: '下周第二重要的目标（可继续从第二象限挑选）', priority: 'recommended' },
        { id: 'core_goal3', label: '核心目标3', type: 'text', placeholder: '下周第三重要的目标', priority: 'optional' },
        {
          id: 'key_actions',
          label: '关键行动',
          type: 'table',
          tableColumns: [
            { id: 'goal', label: '目标', type: 'text', width: '25%' },
            { id: 'action', label: '具体行动', type: 'text', width: '35%' },
            { id: 'deadline', label: '截止时间', type: 'select', options: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], width: '20%' },
            { id: 'priority', label: '优先级', type: 'select', options: ['高', '中', '低'] }
          ],
          required: false
        },
        { id: 'relationship_communication', label: '关系沟通计划', type: 'textarea', placeholder: '下周需要进行的重要沟通', priority: 'recommended', autocomplete: true },
        { id: 'relationship_issues', label: '关系待解决问题', type: 'textarea', placeholder: '需要解决的关系问题', priority: 'optional' },
        { id: 'self_care_plan', label: '自我关怀计划', type: 'textarea', placeholder: '如何照顾自己的身心健康？', priority: 'recommended', hint: '包括休息、运动、社交、兴趣等方面' },
        { id: 'stress_signals', label: '压力信号', type: 'checkbox', priority: 'optional', hint: '勾选本周出现的压力信号', options: [
          { value: '失眠', label: '失眠' }, { value: '头痛', label: '头痛' }, { value: '肩颈酸痛', label: '肩颈酸痛' },
          { value: '易怒', label: '易怒' }, { value: '焦虑感', label: '焦虑感' }, { value: '情绪低落', label: '情绪低落' },
          { value: '拖延加重', label: '拖延加重' }, { value: '暴饮暴食', label: '暴饮暴食' }, { value: '社交回避', label: '社交回避' },
          { value: '注意力下降', label: '注意力下降' },
        ]},
      ],
    },
    {
      id: 'appendix',
      title: '附录',
      description: '补充信息和待办事项',
      collapsedByDefault: true,
      fields: [
        { id: 'quotes', label: '本周金句', type: 'textarea', placeholder: '记录本周触动你的话语或想法', priority: 'optional' },
        { id: 'tools_resources', label: '工具与资源', type: 'textarea', placeholder: '本周发现的有用工具或资源', priority: 'optional', autocomplete: true, hint: '记录工具名称、用途和获取方式' },
        { id: 'explore_topics', label: '待探索话题', type: 'textarea', placeholder: '想要深入了解的话题', priority: 'optional', autocomplete: true },
        { id: 'unfinished_todos', label: '未完成待办', type: 'textarea', placeholder: '本周未完成需要延续的事项', priority: 'optional' },
        { id: 'delegation_items', label: '委派事项', type: 'textarea', placeholder: '需要委派给他人的事项', priority: 'optional', autocomplete: true },
      ],
    },
  ],
};
