/**
 * 认证服务层 — 多账户密码认证
 *
 * 实现已下沉到 `@shared/core/auth`（统一认证基座），本文件保留项目原有的
 * 公开 API 签名，供 `hooks/useAuth.ts` 与 `services/testData.ts` 等调用方使用。
 *
 * 多账户设计（保持不变）：
 * - 账户以「用户名 + 密码」为凭据，账户信息（id + passwordHash）存储在元库 `review-app` 的
 *   accounts store 中，对全部账户可见（仅用于登录验证，不含业务数据）
 * - 每个账户的业务数据（records/settings）存储在其独立的业务库 `review-app-{accountId}` 中，
 *   通过 db.setCurrentAccountId() 切换当前账户上下文，实现数据隔离
 * - admin 测试账户与普通账户完全隔离：测试数据只写入 admin 自己的业务库
 *
 * 安全设计说明（已下沉共享包）：
 * - 密钥派生：PBKDF2-SHA256，256 位输出，100,000 次迭代
 * - Salt 策略：每次设置密码生成 16 字节随机 salt，与 hash 一起存储
 * - 存储格式：`${saltBase64}:${hashBase64}` —— shared-core 的本地驱动原生支持
 *   这一格式（hashFormat: 'base64'），老账户切换后无需重置密码
 *
 * 会话管理：
 * - 认证成功后 sessionStorage 记录当前账户 id，关闭浏览器标签页后自动失效
 * - 页面刷新时由 shared-core 驱动的 restore() 从 session 恢复当前账户上下文
 */
import { getAccount, deleteAccount, deleteAllAccounts, listAccounts } from './db';
import { localAuthDriver, SESSION_ACCOUNT_KEY, SESSION_USERNAME_KEY, syncBusinessAccount } from './authDriver';

/** 登录/注册结果 */
export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * 注册新账户（用户名 + 密码）
 *
 * 账户名即账户 id（唯一），已存在则拒绝；密码哈希写入元库 accounts store。
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
  try {
    await localAuthDriver.register({ username: id, password });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '创建账户失败，请重试' };
  }
}

/**
 * 登录（用户名 + 密码）
 *
 * 校验通过后：
 * - 切��业务库上下文 → 后续数据读写进入该账户的独立库
 * - sessionStorage 记录账户 id（会话标志）
 *
 * @param username - 账户名
 * @param password - 明文密码
 * @returns 登录结果
 */
export async function login(username: string, password: string): Promise<AuthResult> {
  const id = username.trim();
  if (!id) return { success: false, error: '请输入账户名' };
  if (!password) return { success: false, error: '请输入密码' };
  try {
    await localAuthDriver.login({ username: id, password });
    // 会话里补记用户名（与历史行为一致，供 getSessionUsername 读取）
    sessionStorage.setItem(SESSION_USERNAME_KEY, id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '验证失败，请重试' };
  }
}

/**
 * 修改账户密码（已登录改密 / 强制重置测试账户密码）
 *
 * @param username - 账户名
 * @param newPassword - 新密码（4-20 位）
 * @returns 修改结果
 */
export async function setAccountPassword(username: string, newPassword: string): Promise<AuthResult> {
  const id = username.trim();
  if (!id) return { success: false, error: '请输入账户名' };
  if (newPassword.length < 4 || newPassword.length > 20) {
    return { success: false, error: '密码长度需在 4-20 位之间' };
  }
  const existing = await getAccount(id);
  if (!existing) return { success: false, error: '账户不存在' };
  try {
    await localAuthDriver.resetPassword?.({ username: id, newPassword });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '修改密码失败，请重试' };
  }
}

/**
 * 重置单个账户（忘记密码时使用）
 *
 * 仅删除元库中该账户的登录凭据（业务数据保留在 review-app-{账户名} 业务库中）：
 * - 重新注册同名账户即可恢复该账户的全部数据（账户 id = 用户名，业务库按用户名命名）
 * - 不影响其他账户
 *
 * @param username - 要重置的账户名
 * @returns 重置结果
 */
export async function resetAccount(username: string): Promise<AuthResult> {
  const id = username.trim();
  if (!id) return { success: false, error: '请输入要重置的账户名' };
  const existing = await getAccount(id);
  if (!existing) return { success: false, error: '账户不存在，请核对账户名' };
  // 删除该账户的登录凭据（业务数据保留在 review-app-{账户名} 业务库中，
  // 重新注册同名账户即可恢复）
  await deleteAccount(id);
  // 仅当重置的是当前会话账户时，才清会话并回退上下文
  if (sessionStorage.getItem(SESSION_ACCOUNT_KEY) === id) {
    sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
    sessionStorage.removeItem(SESSION_USERNAME_KEY);
    syncBusinessAccount(undefined);
  }
  return { success: true };
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
    syncBusinessAccount(id);
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
  void localAuthDriver.logout();
  sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
  sessionStorage.removeItem(SESSION_USERNAME_KEY);
  syncBusinessAccount(undefined);
}

/**
 * 重置全部账户（极端情况使用）
 *
 * 清空元库 accounts store，回退到「首次使用」状态需重新创建账户。
 * 各账户的业务数据仍保留在其独立业务库中——重新注册同名账户即可恢复对应数据。
 *
 * 注意：多账户场景下推荐使用 resetAccount(账户名) 按账户重置，避免影响其他账户。
 */
export async function resetPassword(): Promise<void> {
  await deleteAllAccounts();
  sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
  sessionStorage.removeItem(SESSION_USERNAME_KEY);
  syncBusinessAccount(undefined);
}
