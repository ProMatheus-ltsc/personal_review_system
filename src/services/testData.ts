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
import { registerAccount, setAccountPassword, getSessionAccountId } from '@/services/auth';
import { saveRecord, setSetting, getSetting, getAccount, setCurrentAccountId, getCurrentAccountId } from '@/services/db';
import { buildSeedRecords } from '@/services/testData/investmentSeeds';
import { buildTemplateRecords } from '@/services/testData/templateSeeds';
import { COOLDOWN_SETTINGS } from '@/templates/investmentChecklist';

/** 测试数据初始化标记（settings key）：已初始化则跳过，保证幂等 */
const SEED_MARK_KEY = 'test_account_initialized';

/** 测试账户名（账户 id 与登录名一致） */
export const TEST_ACCOUNT_NAME = 'admin';
/** 测试账户密码 */
export const TEST_ACCOUNT_PASSWORD = 'admin';

/**
 * 初始化测试账户（幂等，数据写入 admin 专属业务库，不影响其他账户）：
 * 1. 确保 admin 账户已注册到元库（不存在则创建，密码强制 admin/admin）
 * 2. 临时切换到 admin 业务库，写入各场景复盘等待期默认值 0 天（买入/卖出/投资周期/决策日志）
 * 3. 填充覆盖各场景的投资检查清单测试数据 + 其他模板数据
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
