/**
 * 决策日志模板（阶段性模板）
 *
 * 用途：记录重要决策及其推理过程，通过分阶段填写实现完整的决策质量追踪闭环
 * 频率：决策前后，建议在面临重要选择时使用
 * 设计理由：多数人只记录决策结果而忽略决策过程，导致无法从决策中学习；
 *   决策日志强制记录决策逻辑，便于事后验证和改进决策能力
 *
 * 阶段设计：
 * - Phase 1「决策前」：做决定时填写，包含基础信息和决策前分析（4 个页签按决策流推进）
 * - Phase 2「决策后」：决策后1-7天填写，记录短期执行反馈；完成即标记整个决策日志完成
 * - Phase 3「长期复盘」：记录完成后1个月提醒填写，评估长期效果
 *
 * 决策前流程（2026-08-11 重构为 4 个页签，避免单页内容过载）：
 * 1. 基础信息 —— 标题/类型/日期/可逆性
 * 2. 问题与根因 —— 明确问题 + 5Why 根因（配合 root-cause-analysis 工具）
 * 3. 选项生成与评估 —— 三维度发散（经验/观察推理/SCAMPER）→ 选项表格 → 决策矩阵拖拽评估
 * 4. 决策确定 —— 最终选择 + 理由 + 预期 + 决策质量检查（信息/偏见/情绪/咨询）
 *
 * 特殊机制：
 * - 条件字段：如「基本不可逆」时强制要求填写退出机制；
 *   执行状态为「有调整」时展示意外事件字段
 * - 多选项条件显示：选项C 仅在填写了选项B 后显示，避免初始视觉过载
 */
import type { FormTemplate } from '@/types';
import { DEFAULT_DRAG_QUADRANTS } from '@/constants/quadrant';

export const decisionLogTemplate: FormTemplate = {
  id: 'decision_log',
  name: '决策日志',
  icon: '🔄',
  description: '记录重要决策的全过程，追踪决策质量',
  timing: { frequency: '决策前后', suggestion: '面临重要选择时' },
  phases: [
    {
      id: 'pre',
      label: '决策前',
      icon: '📝',
      description: '做决定时填写',
      sectionIndices: [0, 1, 2, 3],
      completionFields: ['title', 'decision_type', 'decision_date', 'irreversibility', 'options_analysis', 'final_choice', 'core_reasons'],
    },
    {
      id: 'post',
      label: '决策后',
      icon: '📊',
      description: '决策后1-7天填写',
      sectionIndices: [4],
      completionFields: ['execution_status'],
      completesRecord: true,
    },
    {
      id: 'long_term',
      label: '长期复盘',
      icon: '🔍',
      description: '记录完成后1个月填写',
      sectionIndices: [5],
      completionFields: ['result_vs_expected'],
      // 复盘在记录标记完成后 30 天解锁（_completedAt 由表单引擎在完成时写入），
      // 与投资检查清单按卖出日期解锁的冷静期机制一致
      unlockAfterDays: 30,
      unlockAfterField: '_completedAt',
    },
  ],
  sections: [
    {
      id: 'basic_info',
      title: '基础信息',
      description: '决策的基本信息',
      fields: [
        { id: 'title', label: '决策标题', type: 'text', required: true, placeholder: '用一句话概括这个决策', priority: 'required' },
        { id: 'decision_type', label: '决策类型', type: 'select', required: true, priority: 'required', options: [
          { value: '职业', label: '职业' }, { value: '财务', label: '财务' },
          { value: '人际', label: '人际' }, { value: '健康', label: '健康' },
          { value: '学习', label: '学习' }, { value: '其他', label: '其他' },
        ]},
        { id: 'decision_type_custom', label: '自定义决策类型', type: 'text', priority: 'optional', placeholder: '描述决策类型', condition: { dependsOn: 'decision_type', showWhen: '其他' } },
        { id: 'decision_date', label: '决策日期', type: 'date', required: true, priority: 'required', defaultValue: 'auto_today' },
        { id: 'deadline', label: '截止日期', type: 'date', priority: 'recommended', hint: '决策需要在什么时间之前做出？' },
        { id: 'irreversibility', label: '可逆性', type: 'radio', required: true, priority: 'required', options: [
          { value: '完全可逆', label: '完全可逆' }, { value: '部分可逆', label: '部分可逆' }, { value: '基本不可逆', label: '基本不可逆' },
        ]},
        { id: 'exit_mechanism_prominent', label: '退出机制（重要）', type: 'textarea', priority: 'required', placeholder: '不可逆决策必须提前规划退出路径', hint: '明确在什么条件下必须止损退出，以及具体退出步骤', condition: { dependsOn: 'irreversibility', showWhen: '基本不可逆' } },
      ],
    },
    {
      id: 'problem_root_cause',
      title: '问题与根因',
      description: '明确要解决的问题及其根本原因（决策方案必须建立在对根因的理解上）',
      fields: [
        { id: 'problem_statement', label: '已明确的问题', type: 'textarea', required: true, placeholder: '用一句话说清楚：要解决的核心问题是什么？', priority: 'required', hint: '决策前必须先明确问题本身——避免"用错误的方法解决正确的问题"' },
        { id: 'problem_root_cause', label: '问题的根因', type: 'textarea', required: true, placeholder: '导致这个问题的根本原因是什么？', priority: 'required', hint: '先用根因分析工具完成 5Why 连续追问（https://promatheus-ltsc.github.io/root-cause-analysis/），再把根因结论填到这里——只有针对根因的方案才可能真正解决问题' },
        { id: 'trigger_event', label: '触发事件', type: 'textarea', required: true, placeholder: '是什么事件触发了这个决策需求？', priority: 'required', hint: '描述促使你必须做出决策的事件或变化' },
        { id: 'cost_of_no_decision', label: '不决策的代价', type: 'textarea', placeholder: '如果不做决策，会有什么后果？', priority: 'recommended' },
        { id: 'time_pressure', label: '时间压力', type: 'radio', required: true, priority: 'required', options: [
          { value: '紧急', label: '紧急' }, { value: '中等', label: '中等' }, { value: '充裕', label: '充裕' },
        ]},
      ],
    },
    {
      id: 'option_generation',
      title: '选项生成与评估',
      description: '从三个维度发散选项，提炼成正式选项后用决策矩阵（成本×效果）评估',
      fields: [
        { id: 'idea_experience', label: '选项生成 · 经验维度（立即反应）', type: 'textarea', priority: 'recommended', placeholder: '凭直觉/第一反应，你首先想到的做法是什么？过去遇到类似情况你是怎么做的？', hint: '写下脑海中第一个冒出来的方案，以及过往经验中可复用的做法', autocomplete: true },
        { id: 'idea_observation', label: '选项生成 · 观察/归纳/推理维度', type: 'textarea', priority: 'recommended', placeholder: '基于观察到的事实和规律，可以推导出哪些方案？', hint: '观察现状与数据 → 归纳规律 → 逻辑推理：别人/其他领域是怎么解决类似问题的？', autocomplete: true },
        {
          id: 'idea_innovation_scamper',
          label: '选项生成 · 创新维度（SCAMPER 逐项创意）',
          type: 'table',
          priority: 'recommended',
          hint: '按 SCAMPER 七个角度逐项提问，每个角度都试着提出一个创意解决方案；最后把可行的想法提炼进下方「选项梳理」',
          tableColumns: [
            { id: 'scamper', label: '法则', type: 'text', width: '14%' },
            { id: 'guide', label: '引导问题', type: 'text', width: '42%' },
            { id: 'solution', label: '创意方案', type: 'text', width: '44%' },
          ],
          defaultValue: [
            { scamper: 'S 替代', guide: '能否换人 / 换物 / 换流程 / 换渠道？', solution: '' },
            { scamper: 'C 组合', guide: '能否与其他方案、资源或环节合并？', solution: '' },
            { scamper: 'A 调整', guide: '能否借鉴其他领域 / 行业的现成做法？', solution: '' },
            { scamper: 'M 修改', guide: '能否改变形态、规模、参数或时间安排？', solution: '' },
            { scamper: 'P 他用', guide: '能否换个用途、换个使用场景？', solution: '' },
            { scamper: 'E 消除', guide: '能否去掉某些部分或环节？', solution: '' },
            { scamper: 'R 重排', guide: '能否颠倒顺序、角色或因果关系？', solution: '' },
          ],
        },
        { id: 'options_analysis', label: '选项梳理', type: 'table', required: true, priority: 'required', hint: '把上面三个维度产生的想法提炼成 2-4 个正式选项填入表格', tableColumns: [
          { id: 'option_name', label: '选项', type: 'text', width: '20%' },
          { id: 'advantage', label: '优势', type: 'text', width: '25%' },
          { id: 'risk', label: '风险', type: 'text', width: '25%' },
          { id: 'resources', label: '所需资源', type: 'text', width: '15%' },
          { id: 'assessment', label: '评估', type: 'select', options: ['优选', '备选', '排除'], width: '15%' },
        ]},
        {
          id: 'decision_matrix',
          label: '决策矩阵评估（成本 × 效果）',
          type: 'dragMatrix',
          priority: 'recommended',
          hint: '把「选项梳理」中的选项拖拽到矩阵对应象限：事半功倍（低成本高效果）优先、物有所值（高成本高效果）评估资源、无关痛痒（低成本低效果）谨慎、劳民伤财（高成本低效果）排除',
          optionsFrom: { fieldId: 'options_analysis', columnId: 'option_name' },
          dragQuadrants: DEFAULT_DRAG_QUADRANTS,
        },
      ],
    },
    {
      id: 'final_decision',
      title: '决策确定',
      description: '结合矩阵评估结果做出最终选择，并完成决策质量检查',
      fields: [
        { id: 'final_choice', label: '最终选择', type: 'select', required: true, priority: 'required', placeholder: '请选择上方表格中的某个选项', hint: '优先从「事半功倍」「物有所值」象限的选项中挑选', optionsFrom: { fieldId: 'options_analysis', columnId: 'option_name' } },
        { id: 'core_reasons', label: '核心理由', type: 'textarea', required: true, placeholder: '做出这个选择的核心理由', priority: 'required', hint: '列出最重要的2-3个理由' },
        { id: 'expected_result', label: '预期结果', type: 'textarea', placeholder: '预期会有什么结果？', priority: 'recommended' },
        { id: 'worst_case', label: '最坏情况', type: 'textarea', placeholder: '最坏的情况是什么？', priority: 'recommended', hint: '如果一切都往最坏方向发展会怎样？你能承受吗？' },
        { id: 'exit_mechanism', label: '退出机制', type: 'textarea', placeholder: '什么情况下应该退出/调整？', priority: 'recommended' },
        { id: 'key_info', label: '关键信息', type: 'textarea', placeholder: '做决策需要的关键信息有哪些？', priority: 'recommended' },
        { id: 'info_reliability', label: '信息可靠性', type: 'radio', priority: 'recommended', options: [
          { value: '高', label: '高' }, { value: '中', label: '中' }, { value: '低', label: '低' },
        ]},
        { id: 'missing_info', label: '缺失信息', type: 'textarea', placeholder: '还缺少哪些重要信息？', priority: 'optional' },
        { id: 'cognitive_biases', label: '认知偏见检查', type: 'checkbox', priority: 'recommended', hint: '逐项确认本次决策未受该偏见影响（勾选 = 确认没有）。常见偏差：确认偏见（只找支持自己的证据）、锚定效应（被第一个数字锚定）、沉没成本（因已投入而不愿放弃）、过度自信（高估自己的判断）、损失厌恶（对损失更敏感）', options: [
          { value: '确认偏见', label: '已确认无「确认偏见」' }, { value: '锚定效应', label: '已确认无「锚定效应」' },
          { value: '沉没成本', label: '已确认无「沉没成本」' }, { value: '过度自信', label: '已确认无「过度自信」' },
          { value: '损失厌恶', label: '已确认无「损失厌恶」' },
        ]},
        { id: 'current_emotion', label: '当前情绪', type: 'radio', priority: 'recommended', options: [
          { value: '平静', label: '平静' }, { value: '焦虑', label: '焦虑' }, { value: '兴奋', label: '兴奋' },
          { value: '恐惧', label: '恐惧' }, { value: '愤怒', label: '愤怒' }, { value: '其他', label: '其他' },
        ]},
        { id: 'emotion_impact', label: '情绪影响', type: 'textarea', placeholder: '情绪如何影响你的判断？', priority: 'recommended', hint: '在强烈情绪下做的决策往往需要二次审视' },
        { id: 'should_delay', label: '是否应延迟决策', type: 'radio', priority: 'optional', options: [
          { value: '是', label: '是' }, { value: '否', label: '否' },
        ]},
        { id: 'consulted_advice', label: '咨询意见', type: 'textarea', placeholder: '咨询了谁？他们怎么说？', priority: 'recommended', autocomplete: true },
        { id: 'different_perspectives', label: '不同视角', type: 'textarea', placeholder: '有哪些不同的看法？', priority: 'optional' },
        { id: 'decision_authority', label: '决策权限', type: 'radio', priority: 'optional', options: [
          { value: '完全在我', label: '完全在我' }, { value: '需要协商', label: '需要协商' }, { value: '受限外部条件', label: '受限外部条件' },
        ]},
        { id: 'similar_decisions', label: '类似决策', type: 'textarea', placeholder: '你过去做过哪些类似的决策？', priority: 'optional', autocomplete: true },
        { id: 'others_cases', label: '他人案例', type: 'textarea', placeholder: '别人在类似情况下是怎么做的？', priority: 'optional' },
        { id: 'frameworks_tools', label: '框架工具', type: 'textarea', placeholder: '用了哪些决策框架或工具？', priority: 'optional', autocomplete: true },
        { id: 'related_materials', label: '相关资料', type: 'textarea', placeholder: '相关的参考资料链接', priority: 'optional' },
      ],
    },
    {
      id: 'post_decision',
      title: '决策后',
      description: '决策执行后的短期反馈',
      fields: [
        { id: 'execution_status', label: '执行状态', type: 'radio', required: true, priority: 'required', options: [
          { value: '按计划', label: '按计划' }, { value: '有调整', label: '有调整' }, { value: '未执行', label: '未执行' },
        ]},
        { id: 'unexpected_events', label: '意外事件', type: 'textarea', placeholder: '执行中有什么意外发生？', priority: 'recommended', condition: { dependsOn: 'execution_status', showWhen: '有调整' } },
        { id: 'immediate_feedback', label: '即时反馈', type: 'textarea', placeholder: '得到了什么即时反馈？', priority: 'recommended' },
        { id: 'emotion_change', label: '情绪变化', type: 'textarea', placeholder: '决策后情绪有什么变化？', priority: 'recommended' },
        { id: 'regret_or_doubt', label: '后悔/疑虑', type: 'textarea', placeholder: '有后悔或疑虑吗？具体是什么？', priority: 'recommended' },
        { id: 'self_awareness', label: '自我觉察', type: 'textarea', placeholder: '关于自己有什么新的认识？', priority: 'optional' },
        { id: 'positive_signals', label: '积极信号', type: 'textarea', placeholder: '有哪些积极的信号？', priority: 'recommended' },
        { id: 'warning_signals', label: '警告信号', type: 'textarea', placeholder: '有哪些需要警惕的信号？', priority: 'recommended', hint: '注意任何让你感到不安的早期信号——身体反应、他人态度变化、数据异常等' },
        { id: 'needs_adjustment', label: '是否需要调整', type: 'radio', priority: 'recommended', options: [
          { value: '是', label: '是' }, { value: '否', label: '否' }, { value: '待观察', label: '待观察' },
        ]},
        { id: 'adjustment_plan', label: '调整方案', type: 'textarea', priority: 'recommended', placeholder: '具体如何调整执行计划？', condition: { dependsOn: 'needs_adjustment', showWhen: '是' } },
      ],
    },
    {
      id: 'long_term_review',
      title: '长期复盘',
      description: '决策的长期效果评估',
      repeatable: true,
      repeatLabel: '添加一次复盘',
      fields: [
        { id: 'long_term_review_date', label: '复盘日期', type: 'date', priority: 'required', defaultValue: 'auto_today' },
        { id: 'result_vs_expected', label: '结果对比预期', type: 'radio', required: true, priority: 'required', options: [
          { value: '超预期', label: '超预期' }, { value: '符合预期', label: '符合预期' },
          { value: '低于预期', label: '低于预期' }, { value: '完全不符', label: '完全不符' },
        ]},
        { id: 'specific_result', label: '具体结果', type: 'textarea', placeholder: '具体产生了什么结果？', priority: 'recommended' },
        { id: 'quantitative_assessment', label: '量化评估', type: 'text', placeholder: '用数据衡量结果（如收益率、时间等）', priority: 'recommended' },
        { id: 'decision_process_quality', label: '决策过程质量', type: 'radio', priority: 'recommended', options: [
          { value: '优秀', label: '优秀' }, { value: '良好', label: '良好' }, { value: '一般', label: '一般' }, { value: '较差', label: '较差' },
        ]},
        { id: 'execution_quality', label: '执行质量', type: 'radio', priority: 'recommended', options: [
          { value: '优秀', label: '优秀' }, { value: '良好', label: '良好' }, { value: '一般', label: '一般' }, { value: '较差', label: '较差' },
        ]},
        { id: 'info_collection_improvement', label: '信息收集改进', type: 'textarea', placeholder: '信息收集方面可以如何改进？', priority: 'recommended' },
        { id: 'option_evaluation_improvement', label: '选项评估改进', type: 'textarea', placeholder: '选项评估方面可以如何改进？', priority: 'recommended' },
        { id: 'execution_improvement', label: '执行改进', type: 'textarea', placeholder: '执行方面可以如何改进？', priority: 'recommended' },
        { id: 'decision_pattern', label: '决策模式', type: 'textarea', placeholder: '这次决策体现了你什么样的决策模式？', priority: 'optional', autocomplete: true },
        { id: 'pattern_in_other_scenarios', label: '模式在其他场景', type: 'textarea', placeholder: '这个模式在其他场景中表现如何？', priority: 'optional' },
        { id: 'strength_or_trap', label: '优势还是陷阱', type: 'radio', priority: 'optional', hint: '这个模式对你的决策是帮助还是妨碍？', options: [
          { value: '明确是优势', label: '明确是优势' }, { value: '主要是优势', label: '主要是优势' },
          { value: '两面性', label: '两面性' }, { value: '主要是陷阱', label: '主要是陷阱' },
          { value: '明确是陷阱', label: '明确是陷阱' },
        ]},
        { id: 'skill_gaps', label: '能力缺口', type: 'textarea', placeholder: '暴露了什么能力缺口？', priority: 'optional' },
        { id: 'knowledge_needed', label: '需要的知识', type: 'textarea', placeholder: '需要补充什么知识？', priority: 'optional', autocomplete: true },
        { id: 'improvement_plan', label: '改进计划', type: 'textarea', placeholder: '具体的改进计划是什么？', priority: 'optional' },
      ],
    },
  ],
};
