/**
 * 认证收口回归测试
 *
 * 验证切换到 shared-core 统一认证后：
 * 1. 老账户（base64 盐:哈希 组合串的存量数据）仍能登录——迁移最怕把老用户锁在门外
 * 2. 新注册账户能正常登录
 * 3. 错误密码被拒绝
 * 4. 账户 id 即用户名（业务库按用户名命名，不能变）
 */
import { describe, expect, it } from 'vitest';
import { createLocalAuthDriver, type LocalAccount } from '@shared/core/auth';

/** 内存版账户存储，模拟项目的 IndexedDB accounts store */
function createMemoryStore() {
  const accounts: LocalAccount[] = [];
  return {
    accounts,
    store: {
      list: async () => accounts.map((a) => ({ ...a })),
      findByUsername: async (username: string) => {
        const found = accounts.find((a) => a.id === username);
        return found ? { ...found } : undefined;
      },
      put: async (account: LocalAccount) => {
        const index = accounts.findIndex((a) => a.id === account.id);
        if (index >= 0) accounts[index] = { ...account };
        else accounts.push({ ...account });
      },
    },
  };
}

/** 造一个历史格式的存量账户：base64 盐:哈希 组合串（盐在 passwordHash 里，无独立 salt 列） */
async function legacyAccount(username: string, password: string): Promise<LocalAccount> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key,
    256,
  );
  const toB64 = (bytes: Uint8Array) => {
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  };
  return {
    id: username,
    username,
    passwordHash: `${toB64(salt)}:${toB64(new Uint8Array(bits))}`,
    createdAt: new Date().toISOString(),
  };
}

/** 按本项目口径创建驱动（base64 格式 + sessionStorage + id 即用户名） */
function createDriver(memory: ReturnType<typeof createMemoryStore>) {
  return createLocalAuthDriver({
    store: memory.store,
    hashFormat: 'base64',
    sessionMedium: 'sessionStorage',
    storageKey: 'review-app-auth-account',
    accountIdStrategy: 'username',
  });
}

describe('本地统一认证（shared-core）', () => {
  it('存量 base64 格式账户仍可登录', async () => {
    const memory = createMemoryStore();
    memory.accounts.push(await legacyAccount('老用户', 'oldpass'));
    const driver = createDriver(memory);

    const user = await driver.login({ username: '老用户', password: 'oldpass' });
    expect(user.username).toBe('老用户');
    // 账户 id 必须仍是用户名——业务库按 review-app-{用户名} 命名，改了会丢数据
    expect(user.id).toBe('老用户');
  });

  it('存量账户用错密码被拒绝', async () => {
    const memory = createMemoryStore();
    memory.accounts.push(await legacyAccount('老用户', 'oldpass'));
    const driver = createDriver(memory);

    await expect(driver.login({ username: '老用户', password: 'wrong' })).rejects.toThrow();
  });

  it('新注册账户的 id 就是用户名', async () => {
    const memory = createMemoryStore();
    const driver = createDriver(memory);

    const created = await driver.register({ username: '新用户', password: 'pw123456' });
    expect(created.id).toBe('新用户');
    expect(memory.accounts).toHaveLength(1);
    expect(memory.accounts[0].id).toBe('新用户');
  });

  it('注册后可直接登录', async () => {
    const memory = createMemoryStore();
    const driver = createDriver(memory);
    await driver.register({ username: '新用户', password: 'pw123456' });
    const user = await driver.login({ username: '新用户', password: 'pw123456' });
    expect(user.id).toBe('新用户');
  });

  it('重名注册被拒绝', async () => {
    const memory = createMemoryStore();
    const driver = createDriver(memory);
    await driver.register({ username: 'dup', password: 'pw123456' });
    await expect(driver.register({ username: 'dup', password: 'pw123456' })).rejects.toThrow();
  });

  it('切换账户时回调收到新的账户 id', async () => {
    const memory = createMemoryStore();
    const changed: (string | undefined)[] = [];
    const driver = createLocalAuthDriver({
      store: memory.store,
      hashFormat: 'base64',
      accountIdStrategy: 'username',
      onAccountChange: (id) => changed.push(id),
    });

    await driver.register({ username: 'u1', password: 'pw123456' });
    await driver.login({ username: 'u1', password: 'pw123456' });
    await driver.logout();

    expect(changed).toContain('u1');
    expect(changed[changed.length - 1]).toBeUndefined();
  });
});
