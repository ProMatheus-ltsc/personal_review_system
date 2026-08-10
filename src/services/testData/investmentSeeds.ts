/**
 * investmentSeeds — 投资检查清单测试种子数据
 *
 * 为 admin 测试账户生成覆盖多场景的投资检查清单三角色数据：
 * 6 个股票代码场景（持有中 / 部分卖出 / 多次部分卖出 / 已清仓 / 刚清仓 / 完整复盘），
 * 每个场景包含仓位单 + 关联的买入单/卖出单，并幂等初始化 Trade/Review 结构化层。
 */
import { v4 as uuidv4 } from 'uuid';
import type { FormRecord } from '@/types';
import { ensureTradesInitialized, syncPositionReview, RECORD_ROLE } from '@/services/investmentMerge';

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
  const templateIdMap = { position: 'investment_checklist_position', buy: 'investment_checklist_buy', sell: 'investment_checklist_sell' } as const;
  const record: FormRecord = {
    id: uuidv4(),
    templateId: templateIdMap[role],
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
export function buildSeedRecords(): { buyRecords: FormRecord[]; sellRecords: FormRecord[]; positions: FormRecord[] } {
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
    merged_buy_lots: [{ date: daysAgo(60), price: 100, qty: 100, reason: '苹果生态护城河深厚' }],
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
      { date: daysAgo(120), price: 300, qty: 200, reason: '腾讯游戏+广告双轮驱动' },
      { date: daysAgo(90), price: 350, qty: 100, reason: '业绩验证后加仓' },
    ],
    merged_total_qty: 300,
    merged_sell_lots: [{ date: daysAgo(45), price: 400, qty: 150, reason: '到达目标价' }],
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
    merged_buy_lots: [{ date: daysAgo(200), price: 200, qty: 100, reason: '电动车渗透率提升' }],
    merged_total_qty: 100,
    merged_sell_lots: [{ date: daysAgo(60), price: 250, qty: 100, reason: '到达目标价' }],
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
    merged_buy_lots: [{ date: daysAgo(30), price: 80, qty: 100, reason: '阿里云+电商基本盘' }],
    merged_total_qty: 100,
    merged_sell_lots: [{ date: daysAgo(5), price: 90, qty: 100, reason: '情绪驱动' }],
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
    // 卖出复盘（已填，顶层字段单次复盘，自动关联本笔卖出）
    sell_review_date: daysAgo(70),
    sell_thesis_valid: '完全正确',
    sell_what_was_right: '严格执行了目标价纪律',
    sell_what_was_wrong: '目标价设定偏保守',
    sell_lesson: '趋势向上时目标价可以跟随业绩上修',
    sell_would_repeat: '会，但会调整',
    sell_adjustment: '分批卖出而非一次清仓',
    sell_post_sell_trend: '继续小涨',
  });
  sellRecords.push(msftSell);

  positions.push(makeRecord(RECORD_ROLE.POSITION, 'MSFT', {
    buy_currency: 'USD',
    buy_date: daysAgo(300),
    buy_price: '150.0000',
    merged_buy_lots: [{ date: daysAgo(300), price: 150, qty: 100, reason: 'Azure 云业务高增长' }],
    merged_total_qty: 100,
    merged_sell_lots: [{ date: daysAgo(100), price: 200, qty: 100, reason: '到达目标价' }],
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
    // 第一笔卖出已复盘（顶层字段，自动关联本笔卖出）
    sell_review_date: daysAgo(60),
    sell_thesis_valid: '部分正确',
    sell_what_was_right: '按计划执行了止盈，落袋为安',
    sell_what_was_wrong: '卖点偏早，趋势仍在',
    sell_lesson: '趋势股止盈应分批，不一次性卖完',
    sell_would_repeat: '会，但会调整',
    sell_adjustment: '分 2-3 批卖出，保留底仓',
    sell_post_sell_trend: '继续大涨',
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
      { date: daysAgo(180), price: 100, qty: 200, reason: 'AI 算力需求爆发' },
      { date: daysAgo(150), price: 130, qty: 100, reason: '业绩超预期后加仓' },
    ],
    merged_total_qty: 300,
    merged_sell_lots: [
      { date: daysAgo(90), price: 160, qty: 100, reason: '到达目标价' },
      { date: daysAgo(30), price: 190, qty: 100, reason: '买入逻辑改变' },
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
