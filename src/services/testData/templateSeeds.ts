/**
 * templateSeeds — 其他模板测试种子数据
 *
 * 为 admin 测试账户生成除投资检查清单外的 7 类模板数据（全部 completed）：
 * 日复盘 x2、周复盘 x1、月复盘 x1、年度复盘 x1、情绪觉察 x2、实战案例 x1、决策日志 x2，
 * 覆盖各模板的展示、统计面板与复盘提醒。
 */
import { v4 as uuidv4 } from 'uuid';
import type { FormRecord } from '@/types';

/** 相对今天的日期（YYYY-MM-DD） */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 生成除投资检查清单外的 7 类模板测试数据（全部 completed）：
 * 日复盘 ×2、周复盘 ×1、月复盘 ×1、年度复盘 ×1、情绪觉察 ×2、实战案例 ×1、决策日志 ×2
 */
export function buildTemplateRecords(): FormRecord[] {
  const records: FormRecord[] = [];
  const now = new Date().toISOString();
  const make = (templateId: FormRecord['templateId'], title: string, data: Record<string, unknown>, days: number): void => {
    records.push({
      id: uuidv4(),
      templateId,
      title,
      data,
      status: 'completed',
      createdAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
    });
  };

  // ===== 日复盘（2 条：昨天 + 5 天前） =====
  make('daily_review', `日复盘 - ${daysAgo(1)}`, {
    daily_date: daysAgo(1),
    daily_matrix: {
      q1: [{ id: 'q1-1', text: '处理线上数据同步异常' }],
      q2: [{ id: 'q2-1', text: '完成项目关键节点的方案评审，明确技术路线' }],
      q3: [{ id: 'q3-1', text: '临时会议与琐碎沟通' }],
      q4: [{ id: 'q4-1', text: '' }],
    },
    daily_lesson: '早上一小时无人打扰的专注时间效率最高，应保留给最难的任务',
    daily_q2_focus: '推进数据迁移方案落地，下午安排会议',
    daily_mood: '😊 愉悦',
    daily_energy: '充沛',
    daily_highlight: '和团队就方案达成一致，减少返工',
    daily_gratitude: '感谢同事帮忙审查了方案细节',
    quick_tags: ['工作', '项目'],
  }, 1);
  make('daily_review', `日复盘 - ${daysAgo(5)}`, {
    daily_date: daysAgo(5),
    daily_matrix: {
      q1: [{ id: 'q1-1', text: '' }],
      q2: [{ id: 'q2-1', text: '读完《纳瓦尔宝典》第三章，记录到知识库' }],
      q3: [{ id: 'q3-1', text: '回复各类消息' }],
      q4: [{ id: 'q4-1', text: '刷短视频' }],
    },
    daily_lesson: '碎片时间适合输入，整块时间适合输出',
    daily_q2_focus: '完成周报初稿',
    daily_mood: '😐 平静',
    daily_energy: '正常',
    daily_highlight: '坚持了 30 分钟午间散步',
    daily_gratitude: '感谢自己坚持了运动习惯',
  }, 5);

  // ===== 周复盘（上周） =====
  make('weekly_review', `周复盘 - ${daysAgo(7)}`, {
    start_date: daysAgo(7),
    end_date: daysAgo(1),
    theme: '聚焦与推进',
    weekly_matrix: {
      q1: [{ id: 'q1-1', text: '周五临时上线的需求' }],
      q2: [{ id: 'q2-1', text: '方案评审准备' }, { id: 'q2-2', text: '跑步两次' }],
      q3: [{ id: 'q3-1', text: '频繁的临时沟通' }],
      q4: [{ id: 'q4-1', text: '' }],
    },
    weekly_quadrant_balance: 'q1_dominant',
    weekly_q2_insight: '方案评审的充分准备避免了很多返工；下周把规划时间固定下来',
    key_events: [
      { event: '完成方案评审', category: '工作', result: '成功', emotion: '积极' },
      { event: '和朋友聚餐', category: '人际', result: '一般', emotion: '积极' },
      { event: '跑步两次', category: '健康', result: '成功', emotion: '中性' },
    ],
    goal1: '完成迁移方案', goal1_progress: 80, goal1_completed: false,
    goal2: '运动 3 次', goal2_progress: 100, goal2_completed: true,
    goal3: '读半本书', goal3_progress: 50, goal3_completed: false,
    deep_review: '本周最大亮点是评审顺利通过；不足是计划排得太满，后期精力不足。',
    highlight_event: '方案评审通过',
    highlight_why: '前期的充分准备是关键',
  }, 7);

  // ===== 月复盘（上个月） =====
  make('monthly_review', `月复盘 - ${daysAgo(30)}`, {
    month_period: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7),
    month_theme: '能力提升月',
    month_overall_score: 7,
    month_key_events: '核心模块重构完成，性能提升明显；顺利完成季度评审',
    month_key_decisions: '决定引入类型检查工具，减少线上 bug；调整团队协作方式',
    month_biggest_success: '重构项目按计划上线，无重大事故',
    month_biggest_challenge: '多任务并行导致精力分散',
    month_skills_improved: '架构设计能力',
    month_knowledge_gained: '系统性能调优方法论',
    month_habits_progress: '晨间阅读坚持 20 天',
    month_growth_score: '有所进步',
    month_recurring_patterns: '月初计划过满，月末容易放弃',
    month_energy_pattern: '上午状态最好',
  }, 30);

  // ===== 年度复盘（2025） =====
  make('annual_review', `年度复盘 - 2025`, {
    annual_year: '2025',
    annual_theme: '转型与成长',
    annual_overall_score: 8,
    annual_one_sentence: '完成了职业转型，建立了稳定的复盘习惯',
    annual_top_events: '1. 完成职业转型，进入新团队\n2. 建立每日复盘习惯\n3. 独立负责一个核心模块\n4. 参加了行业大会',
    annual_best_achievement: '顺利完成从开发到架构的转型',
    annual_biggest_regret: '运动计划坚持不够',
    annual_turning_points: '年中决定专注长期价值的事',
    annual_key_decisions: '放弃短期机会，专注核心能力建设',
    annual_skills_gained: '系统设计、团队协作',
    annual_knowledge_gained: '分布式系统原理',
    annual_habits_formed: '每日复盘、周阅读',
    annual_habits_broken: '熬夜',
    annual_growth_score: '稳步提升',
    annual_life_satisfaction: '满意',
  }, 200);

  // ===== 情绪觉察（2 条） =====
  make('emotional_awareness', `情绪觉察 - ${daysAgo(1)}`, {
    emotion_date: daysAgo(1),
    emotion_trigger: '项目延期，被领导追问进度',
    emotion_dominant: '焦虑',
    emotion_intensity: 4,
    emotion_body_signal: '心跳加速',
    regulate_step1_pause: '暂停 10 秒深呼吸',
    regulate_step3_explore: '意识到焦虑来自对不确定性的恐惧',
    regulate_step4_choose: '选择先梳理事实再沟通',
    regulate_step5_action: '列出延期原因与补救计划',
    regulate_effectiveness: '有一定效果',
    regulate_next_time: '更早识别焦虑信号，避免累积',
    emotion_thought: '我担心的是失控感，而非事情本身',
    emotion_pattern: '面对不确定时容易焦虑',
    pattern_core_need: '需要掌控感',
  }, 1);
  make('emotional_awareness', `情绪觉察 - ${daysAgo(6)}`, {
    emotion_date: daysAgo(6),
    emotion_trigger: '和同事意见分歧',
    emotion_dominant: '愤怒',
    emotion_intensity: 3,
    emotion_body_signal: '出汗',
    regulate_step1_pause: '暂停对话，改天再谈',
    regulate_effectiveness: '很有效，情绪平复了',
    emotion_thought: '愤怒源于我觉得不被尊重',
  }, 6);

  // ===== 实战案例（1 条） =====
  make('case_study', `案例 - ${daysAgo(10)}`, {
    title: '一次跨部门协作冲突',
    scene_type: '职场发展',
    event_date: daysAgo(10),
    background: '市场部与研发部对需求优先级产生分歧',
    situation: '双方各执一词，会议陷入僵局',
    main_goal: '达成双方认可的需求优先级排序',
    bottom_line: '不损害核心交付时间',
    compromise_space: '可以调整交付顺序',
    other_surface_demand: '市场部要求尽快上线新功能',
    other_deep_demand: '市场部担心失去竞争力',
    known_info: '双方的核心目标都是项目成功',
    unknown_info: '领导层的最终期望',
    overall_strategy: '先对齐目标，再讨论优先级',
    core_tactics: '先分别了解双方底线，再组织对齐会议',
    plan_b: '无法达成一致时升级到领导层裁决',
  }, 10);

  // ===== 决策日志（2 条：一条已复盘，一条待复盘） =====
  make('decision_log', `决策 - ${daysAgo(15)}`, {
    title: '是否切换前端技术栈',
    decision_type: '职业',
    decision_type_custom: '技术选型',
    decision_date: daysAgo(15),
    deadline: daysAgo(10),
    irreversibility: '基本不可逆',
    problem_statement: '现有前端方案维护成本持续上升，是否应该切换技术栈',
    problem_surface_cause: '维护成本上升：每次改动都要跨模块打补丁',
    problem_root_cause: '早期选型未充分评估长期维护性，团队随业务扩张分工细化',
    trigger_event: '现有方案维护成本上升',
    cost_of_no_decision: '继续累积技术债',
    time_pressure: '中等',
    idea_experience: '第一反应是切换到团队更熟悉的新框架',
    idea_observation: '观察：同类项目的社区活跃度与招聘热度都在上升；推理：长期看生态更健康',
    idea_innovation_scamper: [
      { scamper: 'S 替代', guide: '能否换人 / 换物 / 换流程 / 换渠道？', solution: '替换为核心模块优先迁移的新方案' },
      { scamper: 'C 组合', guide: '能否与其他方案、资源或环节合并？', solution: '' },
      { scamper: 'A 调整', guide: '能否借鉴其他领域 / 行业的现成做法？', solution: '' },
      { scamper: 'M 修改', guide: '能否改变形态、规模、参数或时间安排？', solution: '不一定要全量切换，先改核心模块' },
      { scamper: 'P 他用', guide: '能否换个用途、换个使用场景？', solution: '' },
      { scamper: 'E 消除', guide: '能否去掉某些部分或环节？', solution: '' },
      { scamper: 'R 重排', guide: '能否颠倒顺序、角色或因果关系？', solution: '其余模块渐进迁移，重排上线顺序' },
    ],
    options_analysis: [
      { option_name: '切换新框架', target_cause: '根因', advantage: '长期维护成本低', risk: '迁移成本高', resources: '2 周人力', assessment: '优选' },
      { option_name: '维持现状', target_cause: '表因', advantage: '无迁移成本', risk: '技术债累积', resources: '无', assessment: '备选' },
      { option_name: '渐进式迁移', target_cause: '两者兼治', advantage: '风险可控', risk: '周期较长', resources: '4 周人力', assessment: '优选' },
    ],
    decision_matrix: {
      q1: ['渐进式迁移'],
      q2: ['切换新框架'],
      q3: ['维持现状'],
      q4: [],
    },
    key_info: '新框架生态成熟度、团队熟悉度',
    info_reliability: '高',
    missing_info: '团队成员对新框架的接受度',
    final_choice: '渐进式迁移',
    execution_status: '按计划',
    unexpected_events: '迁移比预期顺利',
    emotion_change: '平静',
    regret_or_doubt: '无',
    self_awareness: '这次决策基于充分调研，过程理性',
    result_vs_expected: '符合预期',
    positive_signals: '迁移进度正常',
    warning_signals: '暂无',
    needs_adjustment: '无需',
    improvement_plan: '重大技术决策前先做小范围验证',
    _completedAt: daysAgo(12),
    long_term_review_entries: [
      { long_term_review_date: daysAgo(5), result_vs_expected: '符合预期', specific_result: '迁移顺利完成，维护成本下降明显' },
    ],
  }, 15);
  make('decision_log', `决策 - ${daysAgo(3)}`, {
    title: '是否接新的外包项目',
    decision_type: '职业',
    decision_date: daysAgo(3),
    deadline: daysAgo(1),
    irreversibility: '完全可逆',
    trigger_event: '朋友介绍了一个外包项目',
    cost_of_no_decision: '可能错失机会',
    time_pressure: '紧急',
    options_analysis: [
      { option_name: '接项目', advantage: '增加收入', risk: '占用休息时间', resources: '周末时间', assessment: '备选' },
      { option_name: '不接', advantage: '保持精力', risk: '收入无增长', resources: '无', assessment: '优选' },
    ],
    key_info: '项目周期与投入',
    info_reliability: '中',
    final_choice: '不接，专注主业',
    _completedAt: daysAgo(2),
  }, 3);

  return records;
}

/**
 * 初始化测试账户（幂等，数据写入 admin 专属业务库，不影响其他账户）：
 * 1. 确保 admin 账户已注册到元库（不存在则创建，密码强制 admin/admin）
 * 2. 临时切换到 admin 业务库，写入各场景复盘等待期默认值 0 天（买入/卖出/投资周期/决策日志）
 * 3. 填充覆盖各场景的投资检查清单测试数据
 * 4. 恢复调用前的账户上下文（登录用户的库不受影响）
 */
