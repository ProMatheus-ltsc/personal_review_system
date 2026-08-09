/**
 * 认证服务层 — 多账户密码认证（PBKDF2 + SHA-256）
 *
 * 多账户设计：
 * - 账户以「用户名 + 密码」为凭据，账户信息（id + passwordHash）存储在元库 `review-app` 的
 *   accounts store 中，对全部账户可见（仅用于登录验证，不含业务数据）
 * - 每个账户的业务数据（records/settings）存储在其独立的业务库 `review-app-{accountId}` 中，
 *   通过 db.setCurrentAccountId() 切换当前账户上下文，实现数据隔离
 * - admin 测试账户与普通账户完全隔离：测试数据只写入 admin 自己的业务库
 *
 * 安全设计说明：
 * - 密钥派生算法：PBKDF2（Password-Based Key Derivation Function 2）
 * - 哈希函数：SHA-256，256位输出长度
 * - 迭代次数：100,000 次 — 在安全性和性能之间取得平衡
 * - Salt 策略：每次设置密码时生成 16 字节随机 salt，与 hash 一起存储；
 *   防止彩虹表攻击，且相同密码的不同账户生成不同的 hash
 * - 存储格式：`${saltBase64}:${hashBase64}` — salt 和 hash 均为 base64 编码，用冒号分隔
 *
 * 会话管理：
 * - 认证成功后 sessionStorage 记录当前账户 id，关闭浏览器标签页后自动失效
 * - 页面刷新时通过 isAuthenticated() 从 session 恢复当前账户上下文
 */
import {
  getAccount,
  createAccount,
  listAccounts,
  deleteAllAccounts,
  setCurrentAccountId,
} from './db';

const SESSION_ACCOUNT_KEY = 'review-app-auth-account';
const SESSION_USERNAME_KEY = 'review-app-auth-username';

/** 登录/注册结果 */
export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * 对密码进行哈希处理（内部函数）
 *
 * 生成随机 salt 并使用 PBKDF2 派生密钥，返回 `salt:hash` 格式的字符串。
 *
 * @param password - 用户输入的明文密码
 * @returns base64 编码的 `salt:hash` 字符串
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

  return `${saltBase64}:${hashBase64}`;
}

/**
 * 验证密码是否与存储的哈希匹配
 *
 * 从存储的 hash 中提取 salt，重新执行 PBKDF2 派生，
 * 然后对比计算结果与存储的 hash 是否一致。
 *
 * @param password - 用户输入的明文密码
 * @param storedHash - 存储的 `salt:hash` 格式字符串
 * @returns 密码是否正确
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltBase64, hashBase64] = storedHash.split(':');
  if (!saltBase64 || !hashBase64) return false;

  const salt = new Uint8Array(
    atob(saltBase64)
      .split('')
      .map((c) => c.charCodeAt(0))
  );

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const computedHashBase64 = btoa(
    String.fromCharCode(...new Uint8Array(hashBuffer))
  );

  return computedHashBase64 === hashBase64;
}

/**
 * 注册新账户（用户名 + 密码）
 *
 * 账户名即账户 id（唯一），已存在则拒绝；密码哈希写入元库 accounts store。
 * 注册成功后需再调用 login 建立会话（或由调用方直接登录）。
 *
 * @param username - 账户名（作为账户唯一 id）
 * @param password - 明文密码（4-20 位）
 * @returns 注册结果
 */
export async function registerAccount(username: string, password: string): Promise<AuthResult> {
  const id = username.trim();
  if (!id) return { success: false, error: '请输入账户名' };
  if (password.length < 4 || password.length > 20) {
    return { success: false, error: '密码长度需在 4-20 位之间' };
  }
  const existing = await getAccount(id);
  if (existing) return { success: false, error: '该账户名已存在' };
  const hashedValue = await hashPassword(password);
  await createAccount(id, hashedValue);
  return { success: true };
}

/**
 * 登录（用户名 + 密码）
 *
 * 校验通过后：
 * - setCurrentAccountId(accountId) 切换业务库上下文 → 后续数据读写进入该账户的独立库
 * - sessionStorage 记录账户 id（会话标志）
 *
 * @param username - 账户名
 * @param password - 明文密码
 * @returns 登录结果
 */
export async function login(username: string, password: string): Promise<AuthResult> {
  const id = username.trim();
  if (!id) return { success: false, error: '请输入账户名' };
  const account = await getAccount(id);
  if (!account) return { success: false, error: '账户不存在' };
  const verified = await verifyPassword(password, account.passwordHash);
  if (verified) {
    setCurrentAccountId(account.id);
    sessionStorage.setItem(SESSION_ACCOUNT_KEY, account.id);
    sessionStorage.setItem(SESSION_USERNAME_KEY, id);
    return { success: true };
  }
  return { success: false, error: '密码错误，请重试' };
}

/**
 * 检查是否存在已注册账户（区分「首次使用」和「已有账户」）
 *
 * @returns 已注册账户返回 true，否则 false
 */
export async function isPasswordSet(): Promise<boolean> {
  const accounts = await listAccounts();
  return accounts.length > 0;
}

/**
 * 检查当前会话是否已认证（同步方法）
 *
 * 同时从 session 恢复当前账户上下文（页面刷新后保证业务库指向正确账户）。
 *
 * @returns 当前会话已认证返回 true
 */
export function isAuthenticated(): boolean {
  const id = sessionStorage.getItem(SESSION_ACCOUNT_KEY);
  if (id) {
    setCurrentAccountId(id);
    return true;
  }
  return false;
}

/** 获取当前会话的账户 id（未登录为 null） */
export function getSessionAccountId(): string | null {
  return sessionStorage.getItem(SESSION_ACCOUNT_KEY);
}

/** 获取当前会话的账户名（未登录为 null） */
export function getSessionUsername(): string | null {
  return sessionStorage.getItem(SESSION_USERNAME_KEY);
}

/**
 * 登出当前会话
 *
 * 清除 session 标志并重置账户上下文（后续业务操作回退到默认库）。
 */
export function logout(): void {
  sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
  sessionStorage.removeItem(SESSION_USERNAME_KEY);
  setCurrentAccountId(null);
}

/**
 * 重置全部账户（忘记密码时使用）
 *
 * 清空元库 accounts store，回退到「首次使用」状态需重新创建账户。
 * 注意：各账户的业务数据仍保留在其独立业务库中（不影响）。
 */
export async function resetPassword(): Promise<void> {
  await deleteAllAccounts();
  sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
  sessionStorage.removeItem(SESSION_USERNAME_KEY);
  setCurrentAccountId(null);
}
