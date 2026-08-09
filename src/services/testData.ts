/**
 * testData — 测试账户与测试数据初始化服务
 *
 * 为便于测试提供：
 * 1. 测试账户：账户名 admin，密码 admin（多账户体系下的独立账户）
 * 2. test_mode 设置：跳过 30 天冷静期（复盘立即解锁），仅写入 admin 自己的业务库
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
import { registerAccount, getSessionAccountId } from '@/services/auth';
import { saveRecord, setSetting, getSetting, getAccount, setCurrentAccountId, getCurrentAccountId } from '@/services/db';
import type { FormRecord } from '@/types';
import { ensureTradesInitialized, syncPositionReview, RECORD_ROLE } from '@/services/investmentMerge';

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

/** 构造一条记录并幂等初始化三层结构 */
function makeRecord(
  role: 'position' | 'buy' | 'sell',
  code: string,
  data: Record<string, unknown>
): FormRecord {
  const now = new Date().toISOString();
  const record: FormRecord = {
    id: uuidv4(),
    templateId: 'investment_checklist',
    title: `${code} ${role === 'position' ? '仓位单' : role === 'buy' ? '买入单' : '卖出单'}`,
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

  return { buyRecords, sellRecords, positions };
}

/**
 * 初始化测试账户（幂等，数据写入 admin 专属业务库，不影响其他账户）：
 * 1. 确保 admin 账户已注册到元库（不存在则创建，密码 admin）
 * 2. 临时切换到 admin 业务库，开启 test_mode（跳过 30 天冷静期）
 * 3. 填充覆盖各场景的投资检查清单测试数据
 * 4. 恢复调用前的账户上下文（登录用户的库不受影响）
 */
export async function initializeTestAccount(): Promise<void> {
  try {
    // 1. 确保 admin 账户存在（元库注册，不影响其他账户）
    if (!(await getAccount(TEST_ACCOUNT_NAME))) {
      await registerAccount(TEST_ACCOUNT_NAME, TEST_ACCOUNT_PASSWORD);
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

    // 3. 开启测试模式（跳过冷静期）
    await setSetting('test_mode', 'true');

    // 4. 填充测试数据
    const { buyRecords, sellRecords, positions } = buildSeedRecords();
    // 先存买卖单，再存仓位单（仓位单引用买卖单 id）
    for (const r of buyRecords) await saveRecord(r);
    for (const r of sellRecords) await saveRecord(r);
    for (const r of positions) await saveRecord(r);

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
