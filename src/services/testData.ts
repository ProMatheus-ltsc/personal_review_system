/**
 * testData — 测试账户与测试数据初始化服务
 *
 * 为便于测试提供：
 * 1. 测试账户：账户名 admin，密码 admin（多账户体系下的独立账户）
 * 2. 默认各场景复盘等待期 = 0 天（买入/卖出/投资周期/决策日志长期复盘）
 *    —— 机制与普通账户完全一致（走正常等待期逻辑、页面可配置），仅默认值不同，便于测试
 * 3. 自动填充覆盖多场景的投资检查清单测试数据（仅写入 admin 业务库）
 *
 * 账户隔离机制：
 * - admin 账户注册在元库 accounts store（不影响其他账户）
 * - 测试数据通过临时切换 setCurrentAccountId('admin') 写入 admin 专属业务库
 *   review-app-admin，填充完成后恢复原账户上下文 → 完全不影响其他账户的数据
 *
 * 幂等：admin 业务库的 settings 中 test_account_initialized 标记，只初始化一次。
 * 如需重新初始化，可清除 IndexedDB 数据，或调用 resetTestAccountMark() 清除标记后刷新。
 */
import { v4 as uuidv4 } from 'uuid';
import { registerAccount, setAccountPassword, getSessionAccountId } from '@/services/auth';
import { saveRecord, setSetting, getSetting, getAccount, setCurrentAccountId, getCurrentAccountId } from '@/services/db';
import type { FormRecord } from '@/types';
import { ensureTradesInitialized, syncPositionReview, RECORD_ROLE } from '@/services/investmentMerge';
import { COOLDOWN_SETTINGS } from '@/templates/investmentChecklist';

/** 测试数据初始化标记（settings key）：已初始化则跳过，保证幂等 */
const SEED_MARK_KEY = 'test_account_initialized';

/** 测试账户名（账户 id 与登录名一致） */
export const TEST_ACCOUNT_NAME = 'admin';
/** 测试账户密码 */
export const TEST_ACCOUNT_PASSWORD = 'admin';

/** 相对今天的日期（YYYY-MM-DD） */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 构造一条记录并幂等初始化三层结构（统一单据名：投资检查清单 - {代码} {买入|卖出|持有仓位}） */
function makeRecord(
  role: 'position' | 'buy' | 'sell',
  code: string,
  data: Record<string, unknown>
): FormRecord {
  const now = new Date().toISOString();
  const roleLabel = role === 'position' ? '持有仓位' : role === 'buy' ? '买入' : '卖出';
  const record: FormRecord = {
    id: uuidv4(),
    templateId: 'investment_checklist',
    title: `投资检查清单 - ${code} ${roleLabel}`,
    data: { record_role: role, buy_company_name: code, ...data },
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  // 幂等派生 merged_trades / merged_reviews（结构化交易流水）
  record.data = ensureTradesInitialized(record.data);
  // 仓位单：同步 PositionReview 层（清仓场景生成/同步 merged_position_review）
  if (role === 'position') {
    record.data = syncPositionReview(record.data);
  }
  return record;
}

/**
 * 构建测试数据（返回按依赖顺序排列的记录数组，仓位单放最后由调用方统一保存）
 */
function buildSeedRecords(): { buyRecords: FormRecord[]; sellRecords: FormRecord[]; positions: FormRecord[] } {
  const buyRecords: FormRecord[] = [];
  const sellRecords: FormRecord[] = [];
  const positions: FormRecord[] = [];

  // ========== 场景 1：AAPL 持有中（买入 60 天前，可买入复盘） ==========
  const aaplBuy = makeRecord(RECORD_ROLE.BUY, 'AAPL', {
    buy_date: daysAgo(60),
    buy_price: '100.00',
    buy_quantity: '100',
    buy_currency: 'USD',
    buy_thesis: '苹果生态护城河深厚，服务业务高毛利增长',
    buy_understand_business: true,
    buy_safety_margin: true,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '3-平静',
    buy_confidence: '4-偏高',
    buy_strategy_tag: '价值投资',
    buy_stop_loss_price: '75',
    buy_target_price_num: '150',
  });
  buyRecords.push(aaplBuy);

  positions.push(makeRecord(RECORD_ROLE.POSITION, 'AAPL', {
    buy_currency: 'USD',
    buy_date: daysAgo(60),
    buy_price: '100.0000',
    merged_buy_lots: [{ date: daysAgo(60), price: 100, qty: 100, reason: '苹果生态护城河深厚', source_record_id: aaplBuy.id }],
    merged_total_qty: 100,
    merged_sell_lots: [],
    merged_total_sell_qty: 0,
    remaining_qty: 100,
    sold_out: false,
    sell_status: '',
    linked_buy_record_ids: [aaplBuy.id],
    linked_sell_record_ids: [],
  }));

  // ========== 场景 2：00700 部分卖出（两笔买入 + 一笔卖出，剩余持仓） ==========
  const tencentBuy1 = makeRecord(RECORD_ROLE.BUY, '00700', {
    buy_date: daysAgo(120),
    buy_price: '300.00',
    buy_quantity: '200',
    buy_currency: 'CNY',
    buy_thesis: '腾讯游戏+广告双轮驱动，微信生态变现空间大',
    buy_understand_business: true,
    buy_safety_margin: true,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '3-平静',
    buy_confidence: '3-中等',
    buy_strategy_tag: '价值投资',
    buy_stop_loss_price: '250',
    buy_target_price_num: '450',
  });
  buyRecords.push(tencentBuy1);

  const tencentBuy2 = makeRecord(RECORD_ROLE.BUY, '00700', {
    buy_date: daysAgo(90),
    buy_price: '350.00',
    buy_quantity: '100',
    buy_currency: 'CNY',
    buy_thesis: '业绩验证后加仓，AI 业务打开新增长曲线',
    buy_understand_business: true,
    buy_safety_margin: false,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '4-乐观',
    buy_confidence: '4-偏高',
    buy_strategy_tag: '价值投资',
    buy_stop_loss_price: '280',
    buy_target_price_num: '500',
  });
  buyRecords.push(tencentBuy2);

  const tencentSell = makeRecord(RECORD_ROLE.SELL, '00700', {
    sell_date: daysAgo(45),
    sell_exit_price: '400.00',
    sell_quantity: '150',
    sell_reason: '到达目标价',
    sell_check_reason: true,
    sell_check_rebuy: true,
    sell_emotion_state: '3-平静',
  });
  sellRecords.push(tencentSell);

  positions.push(makeRecord(RECORD_ROLE.POSITION, '00700', {
    buy_currency: 'CNY',
    buy_date: daysAgo(120),
    buy_price: '316.6667', // (300*200 + 350*100) / 300
    merged_buy_lots: [
      { date: daysAgo(120), price: 300, qty: 200, reason: '腾讯游戏+广告双轮驱动', source_record_id: tencentBuy1.id },
      { date: daysAgo(90), price: 350, qty: 100, reason: '业绩验证后加仓', source_record_id: tencentBuy2.id },
    ],
    merged_total_qty: 300,
    merged_sell_lots: [{ date: daysAgo(45), price: 400, qty: 150, reason: '到达目标价', source_record_id: tencentSell.id }],
    merged_total_sell_qty: 150,
    sell_exit_price: '400.0000',
    sell_date: daysAgo(45),
    last_sell_date: daysAgo(45),
    remaining_qty: 150,
    sold_out: false,
    sell_status: 'partial',
    linked_buy_record_ids: [tencentBuy1.id, tencentBuy2.id],
    linked_sell_record_ids: [tencentSell.id],
  }));

  // ========== 场景 3：TSLA 已清仓 60 天前（可卖出复盘 + 投资周期复盘） ==========
  const tslaBuy = makeRecord(RECORD_ROLE.BUY, 'TSLA', {
    buy_date: daysAgo(200),
    buy_price: '200.00',
    buy_quantity: '100',
    buy_currency: 'USD',
    buy_thesis: '电动车渗透率提升 + 储能业务放量',
    buy_understand_business: true,
    buy_safety_margin: true,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '4-乐观',
    buy_confidence: '4-偏高',
    buy_strategy_tag: '趋势跟踪',
    buy_stop_loss_price: '160',
    buy_target_price_num: '280',
  });
  buyRecords.push(tslaBuy);

  const tslaSell = makeRecord(RECORD_ROLE.SELL, 'TSLA', {
    sell_date: daysAgo(60),
    sell_exit_price: '250.00',
    sell_quantity: '100',
    sell_reason: '到达目标价',
    sell_check_reason: true,
    sell_check_rebuy: true,
    sell_emotion_state: '3-平静',
  });
  sellRecords.push(tslaSell);

  positions.push(makeRecord(RECORD_ROLE.POSITION, 'TSLA', {
    buy_currency: 'USD',
    buy_date: daysAgo(200),
    buy_price: '200.0000',
    merged_buy_lots: [{ date: daysAgo(200), price: 200, qty: 100, reason: '电动车渗透率提升', source_record_id: tslaBuy.id }],
    merged_total_qty: 100,
    merged_sell_lots: [{ date: daysAgo(60), price: 250, qty: 100, reason: '到达目标价', source_record_id: tslaSell.id }],
    merged_total_sell_qty: 100,
    sell_exit_price: '250.0000',
    sell_date: daysAgo(60),
    last_sell_date: daysAgo(60),
    remaining_qty: 0,
    sold_out: true,
    sell_status: 'full',
    linked_buy_record_ids: [tslaBuy.id],
    linked_sell_record_ids: [tslaSell.id],
  }));

  // ========== 场景 4：BABA 刚清仓 5 天前（测试时间锁场景） ==========
  const babaBuy = makeRecord(RECORD_ROLE.BUY, 'BABA', {
    buy_date: daysAgo(30),
    buy_price: '80.00',
    buy_quantity: '100',
    buy_currency: 'USD',
    buy_thesis: '阿里云 + 电商基本盘，估值处于历史低位',
    buy_understand_business: true,
    buy_safety_margin: true,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '2-焦虑',
    buy_confidence: '3-中等',
    buy_strategy_tag: '价值投资',
    buy_stop_loss_price: '70',
    buy_target_price_num: '110',
  });
  buyRecords.push(babaBuy);

  const babaSell = makeRecord(RECORD_ROLE.SELL, 'BABA', {
    sell_date: daysAgo(5),
    sell_exit_price: '90.00',
    sell_quantity: '100',
    sell_reason: '情绪驱动（恐慌/贪婪）',
    sell_check_reason: false,
    sell_check_rebuy: false,
    sell_emotion_state: '5-兴奋',
  });
  sellRecords.push(babaSell);

  positions.push(makeRecord(RECORD_ROLE.POSITION, 'BABA', {
    buy_currency: 'USD',
    buy_date: daysAgo(30),
    buy_price: '80.0000',
    merged_buy_lots: [{ date: daysAgo(30), price: 80, qty: 100, reason: '阿里云+电商基本盘', source_record_id: babaBuy.id }],
    merged_total_qty: 100,
    merged_sell_lots: [{ date: daysAgo(5), price: 90, qty: 100, reason: '情绪驱动', source_record_id: babaSell.id }],
    merged_total_sell_qty: 100,
    sell_exit_price: '90.0000',
    sell_date: daysAgo(5),
    last_sell_date: daysAgo(5),
    remaining_qty: 0,
    sold_out: true,
    sell_status: 'full',
    linked_buy_record_ids: [babaBuy.id],
    linked_sell_record_ids: [babaSell.id],
  }));

  // ========== 场景 5：MSFT 完整复盘（买入复盘 + 卖出复盘 + 投资周期复盘均完成） ==========
  const msftBuy = makeRecord(RECORD_ROLE.BUY, 'MSFT', {
    buy_date: daysAgo(300),
    buy_price: '150.00',
    buy_quantity: '100',
    buy_currency: 'USD',
    buy_thesis: 'Azure 云业务高增长，Office 订阅化提升利润质量',
    buy_understand_business: true,
    buy_safety_margin: true,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '3-平静',
    buy_confidence: '5-很高',
    buy_strategy_tag: '价值投资',
    buy_stop_loss_price: '120',
    buy_target_price_num: '220',
    // 买入复盘（已填）
    buy_review_date: daysAgo(270),
    buy_review_thesis_valid: '完全正确',
    buy_review_what_was_right: '准确判断了云业务增长趋势',
    buy_review_what_was_wrong: '仓位可以更重',
    buy_review_lesson: '对高确定性成长股应敢于重仓',
    buy_review_would_repeat: '一定会',
  });
  buyRecords.push(msftBuy);

  const msftSell = makeRecord(RECORD_ROLE.SELL, 'MSFT', {
    sell_date: daysAgo(100),
    sell_exit_price: '200.00',
    sell_quantity: '100',
    sell_reason: '到达目标价',
    sell_check_reason: true,
    sell_check_rebuy: true,
    sell_emotion_state: '3-平静',
    // 卖出复盘（已填）
    sell_review_entries: [
      {
        sell_review_date: daysAgo(70),
        sell_review_trade_id: '',
        sell_thesis_valid: '完全正确',
        sell_what_was_right: '严格执行了目标价纪律',
        sell_what_was_wrong: '目标价设定偏保守',
        sell_lesson: '趋势向上时目标价可以跟随业绩上修',
        sell_would_repeat: '会，但会调整',
        sell_adjustment: '分批卖出而非一次清仓',
        sell_post_sell_trend: '继续小涨',
      },
    ],
  });
  sellRecords.push(msftSell);

  positions.push(makeRecord(RECORD_ROLE.POSITION, 'MSFT', {
    buy_currency: 'USD',
    buy_date: daysAgo(300),
    buy_price: '150.0000',
    merged_buy_lots: [{ date: daysAgo(300), price: 150, qty: 100, reason: 'Azure 云业务高增长', source_record_id: msftBuy.id }],
    merged_total_qty: 100,
    merged_sell_lots: [{ date: daysAgo(100), price: 200, qty: 100, reason: '到达目标价', source_record_id: msftSell.id }],
    merged_total_sell_qty: 100,
    sell_exit_price: '200.0000',
    sell_date: daysAgo(100),
    last_sell_date: daysAgo(100),
    remaining_qty: 0,
    sold_out: true,
    sell_status: 'full',
    linked_buy_record_ids: [msftBuy.id],
    linked_sell_record_ids: [msftSell.id],
    // 投资周期复盘（已填）
    position_review_date: daysAgo(70),
    position_original_thesis: '云业务增长 + 订阅化利润质量',
    position_thesis_result: '完全正确',
    position_biggest_success: '长期持有兑现了云业务成长',
    position_biggest_mistake: '目标价设定保守，提前下车',
    position_lesson: '优质成长股应结合业绩上修动态调整目标价',
    position_conclusion: '成功但可做得更好——纪律执行到位，目标价管理需更灵活',
  }));

  // ========== 场景 6：NVDA 多次部分卖出（两笔买入 + 两次部分卖出，一笔已复盘一笔待复盘） ==========
  const nvdaBuy1 = makeRecord(RECORD_ROLE.BUY, 'NVDA', {
    buy_date: daysAgo(180),
    buy_price: '100.00',
    buy_quantity: '200',
    buy_currency: 'USD',
    buy_thesis: 'AI 算力需求爆发，GPU 龙头受益于数据中心资本开支',
    buy_understand_business: true,
    buy_safety_margin: true,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '3-平静',
    buy_confidence: '4-偏高',
    buy_strategy_tag: '趋势跟踪',
    buy_stop_loss_price: '80',
    buy_target_price_num: '200',
  });
  buyRecords.push(nvdaBuy1);

  const nvdaBuy2 = makeRecord(RECORD_ROLE.BUY, 'NVDA', {
    buy_date: daysAgo(150),
    buy_price: '130.00',
    buy_quantity: '100',
    buy_currency: 'USD',
    buy_thesis: '业绩超预期后加仓，推理侧需求打开第二增长曲线',
    buy_understand_business: true,
    buy_safety_margin: false,
    buy_position_size: true,
    buy_hold_duration: true,
    buy_panic_test: true,
    buy_emotion_state: '4-乐观',
    buy_confidence: '4-偏高',
    buy_strategy_tag: '趋势跟踪',
    buy_stop_loss_price: '105',
    buy_target_price_num: '220',
  });
  buyRecords.push(nvdaBuy2);

  const nvdaSell1 = makeRecord(RECORD_ROLE.SELL, 'NVDA', {
    sell_date: daysAgo(90),
    sell_exit_price: '160.00',
    sell_quantity: '100',
    sell_reason: '到达目标价',
    sell_check_reason: true,
    sell_check_rebuy: true,
    sell_emotion_state: '3-平静',
    // 第一笔卖出已复盘
    sell_review_entries: [
      {
        sell_review_date: daysAgo(60),
        sell_review_trade_id: '',
        sell_thesis_valid: '部分正确',
        sell_what_was_right: '按计划执行了止盈，落袋为安',
        sell_what_was_wrong: '卖点偏早，趋势仍在',
        sell_lesson: '趋势股止盈应分批，不一次性卖完',
        sell_would_repeat: '会，但会调整',
        sell_adjustment: '分 2-3 批卖出，保留底仓',
        sell_post_sell_trend: '继续大涨',
      },
    ],
  });
  sellRecords.push(nvdaSell1);

  const nvdaSell2 = makeRecord(RECORD_ROLE.SELL, 'NVDA', {
    sell_date: daysAgo(30),
    sell_exit_price: '190.00',
    sell_quantity: '100',
    sell_reason: '买入逻辑改变',
    sell_check_reason: true,
    sell_check_rebuy: false,
    sell_emotion_state: '4-乐观',
  });
  sellRecords.push(nvdaSell2);

  positions.push(makeRecord(RECORD_ROLE.POSITION, 'NVDA', {
    buy_currency: 'USD',
    buy_date: daysAgo(180),
    buy_price: '110.0000', // (100*200 + 130*100) / 300
    merged_buy_lots: [
      { date: daysAgo(180), price: 100, qty: 200, reason: 'AI 算力需求爆发', source_record_id: nvdaBuy1.id },
      { date: daysAgo(150), price: 130, qty: 100, reason: '业绩超预期后加仓', source_record_id: nvdaBuy2.id },
    ],
    merged_total_qty: 300,
    merged_sell_lots: [
      { date: daysAgo(90), price: 160, qty: 100, reason: '到达目标价', source_record_id: nvdaSell1.id },
      { date: daysAgo(30), price: 190, qty: 100, reason: '买入逻辑改变', source_record_id: nvdaSell2.id },
    ],
    merged_total_sell_qty: 200,
    sell_exit_price: '175.0000', // (160*100 + 190*100) / 200
    sell_date: daysAgo(30),
    last_sell_date: daysAgo(30),
    remaining_qty: 100,
    sold_out: false,
    sell_status: 'partial',
    linked_buy_record_ids: [nvdaBuy1.id, nvdaBuy2.id],
    linked_sell_record_ids: [nvdaSell1.id, nvdaSell2.id],
  }));

  return { buyRecords, sellRecords, positions };
}

/**
 * 构建其他模板（日/周/月/年/情绪/案例/决策日志）的测试数据
 * 覆盖不同模板的展示与统计，全部标记为 completed
 */
function buildTemplateRecords(): FormRecord[] {
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
    daily_most_valuable: '完成项目关键节点的方案评审，明确了技术路线',
    daily_lesson: '早上一小时无人打扰的专注时间效率最高，应保留给最难的任务',
    daily_tomorrow_priority: '推进数据迁移方案落地，下午安排会议',
    daily_mood: '😊 愉悦',
    daily_energy: '充沛',
    daily_highlight: '和团队就方案达成一致，减少返工',
    daily_gratitude: '感谢同事帮忙审查了方案细节',
    quick_tags: ['工作', '项目'],
  }, 1);
  make('daily_review', `日复盘 - ${daysAgo(5)}`, {
    daily_date: daysAgo(5),
    daily_most_valuable: '读完《纳瓦尔宝典》第三章，记录到知识库',
    daily_lesson: '碎片时间适合输入，整块时间适合输出',
    daily_tomorrow_priority: '完成周报初稿',
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
    trigger_event: '现有方案维护成本上升',
    cost_of_no_decision: '继续累积技术债',
    time_pressure: '中等',
    options_analysis: [
      { option_name: '切换新框架', advantage: '长期维护成本低', risk: '迁移成本高', resources: '2 周人力', assessment: '优选' },
      { option_name: '维持现状', advantage: '无迁移成本', risk: '技术债累积', resources: '无', assessment: '备选' },
    ],
    key_info: '新框架生态成熟度、团队熟悉度',
    info_reliability: '高',
    missing_info: '团队成员对新框架的接受度',
    final_choice: '切换到新框架',
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
export async function initializeTestAccount(): Promise<void> {
  try {
    // 1. 确保 admin 账户存在且账密强制为 admin/admin（存在但密码被改过 → 重置为 admin）
    if (!(await getAccount(TEST_ACCOUNT_NAME))) {
      await registerAccount(TEST_ACCOUNT_NAME, TEST_ACCOUNT_PASSWORD);
    } else {
      await setAccountPassword(TEST_ACCOUNT_NAME, TEST_ACCOUNT_PASSWORD);
    }

    // 2. 记录调用前上下文，临时切换到 admin 业务库
    const prevAccount = getCurrentAccountId();
    setCurrentAccountId(TEST_ACCOUNT_NAME);

    // 幂等标记在 admin 自己的业务库 settings 中
    const seeded = await getSetting(SEED_MARK_KEY);
    if (seeded === 'true') {
      restoreContext(prevAccount);
      return;
    }

    // 3. admin 默认各场景复盘等待期 = 0 天（机制与普通账户完全一致，仅默认值不同，便于测试）
    await setSetting(COOLDOWN_SETTINGS.BUY, '0');
    await setSetting(COOLDOWN_SETTINGS.SELL, '0');
    await setSetting(COOLDOWN_SETTINGS.POSITION, '0');
    await setSetting(COOLDOWN_SETTINGS.DECISION, '0');

    // 4. 填充测试数据（投资检查清单三角色 + 其他模板）
    const { buyRecords, sellRecords, positions } = buildSeedRecords();
    // 先存买卖单，再存仓位单（仓位单引用买卖单 id）
    for (const r of buyRecords) await saveRecord(r);
    for (const r of sellRecords) await saveRecord(r);
    for (const r of positions) await saveRecord(r);
    // 其他模板（日/周/月/年/情绪/案例/决策日志）
    for (const r of buildTemplateRecords()) await saveRecord(r);

    // 5. 标记已初始化
    await setSetting(SEED_MARK_KEY, 'true');

    // 6. 恢复原账户上下文（不影响其他账户）
    restoreContext(prevAccount);
  } catch {
    // 初始化失败不阻塞应用（下次启动重试）；确保账户上下文被恢复
    try {
      const sessionAccount = getSessionAccountId();
      setCurrentAccountId(sessionAccount);
    } catch {
      setCurrentAccountId(null);
    }
  }
}

/**
 * 恢复账户上下文：优先恢复 session 中的登录账户（刷新/并发登录场景），
 * 否则回退到调用前的上下文。
 */
function restoreContext(prevAccount: string | null): void {
  const sessionAccount = getSessionAccountId();
  setCurrentAccountId(sessionAccount ?? prevAccount);
}

/**
 * 重置测试账户标记（便于重新填充测试数据）
 * 注意：不会删除已有记录，重新初始化会追加重复数据。
 * 仅作用于 admin 业务库。
 */
export async function resetTestAccountMark(): Promise<void> {
  const prevAccount = getCurrentAccountId();
  setCurrentAccountId(TEST_ACCOUNT_NAME);
  await setSetting(SEED_MARK_KEY, '');
  setCurrentAccountId(prevAccount);
}
