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
import { saveRecord, setSetting, getSetting, deleteSetting, getAccount, setCurrentAccountId, getCurrentAccountId } from '@/services/db';
import { buildSeedRecords } from '@/services/testData/investmentSeeds';
import { buildTemplateRecords } from '@/services/testData/templateSeeds';
import { COOLDOWN_SETTINGS } from '@/templates/investmentChecklist';

/** 测试数据初始化标记（settings key）：已初始化则跳过，保证幂等 */
const SEED_MARK_KEY = 'test_account_initialized';

/** 等待期回默认值的一次性迁移标记 */
const COOLDOWN_MIGRATION_KEY = 'cooldown_default_migration_v1';

/** 测试账户名（账户 id 与登录名一致） */
export const TEST_ACCOUNT_NAME = 'admin';
/** 测试账户密码 */
export const TEST_ACCOUNT_PASSWORD = 'admin';

/** 四个等待期设置键 */
const COOLDOWN_KEYS = [
  COOLDOWN_SETTINGS.BUY,
  COOLDOWN_SETTINGS.SELL,
  COOLDOWN_SETTINGS.POSITION,
  COOLDOWN_SETTINGS.DECISION,
] as const;

/**
 * 一次性修复：把被测试账户初始化写死的 0 天等待期还原为默认值。
 *
 * 背景：旧版 `initializeTestAccount()` 在生产构建里也会执行，把 admin 业务库的
 * 四项等待期直接写成 `'0'`。等待期在代码里的默认值是 30 天
 * （`DEFAULT_COOLDOWN_DAYS`），一旦被写成 `'0'`，页面就显示 0 天，且因为设置了
 * `test_account_initialized` 标记，后续启动不会再改回来——看起来就像"默认值被改了"。
 *
 * 处理方式：删除这四个 key，而不是写回 `'30'`。这样读取时会回落到代码默认值，
 * 将来调整 `DEFAULT_COOLDOWN_DAYS` 也能生效。
 *
 * 只在「该库确实被测试初始化污染过」时动手（存在 seed 标记且四项全为 '0'），
 * 用户自己配过任何一项都不碰。全程幂等，靠 `COOLDOWN_MIGRATION_KEY` 保证只跑一次。
 *
 * @returns 被还原的项数（0 表示无需处理）
 */
export async function restoreCooldownDefaults(): Promise<number> {
  try {
    if ((await getSetting(COOLDOWN_MIGRATION_KEY)) === 'done') return 0;

    const seeded = await getSetting(SEED_MARK_KEY);
    const values = await Promise.all(COOLDOWN_KEYS.map((k) => getSetting(k)));
    // 未经过测试初始化，或用户已自行配置过非 0 值 → 不动数据，只落标记
    const polluted = seeded === 'true' && values.every((v) => String(v) === '0');
    if (!polluted) {
      await setSetting(COOLDOWN_MIGRATION_KEY, 'done');
      return 0;
    }

    for (const key of COOLDOWN_KEYS) await deleteSetting(key);
    await setSetting(COOLDOWN_MIGRATION_KEY, 'done');
    return COOLDOWN_KEYS.length;
  } catch {
    // 修复失败不影响应用，下次启动重试
    return 0;
  }
}

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

    // 3. admin 默认各场景复盘等待期 = 0 天（仅当从未配置过时写入，避免覆盖已有设置）
    for (const key of COOLDOWN_KEYS) {
      if ((await getSetting(key)) === undefined) {
        await setSetting(key, '0');
      }
    }

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
