/**
 * 认证服务层 — 基于 PBKDF2 + SHA-256 的密码验证
 *
 * 安全设计说明：
 * - 密钥派生算法：PBKDF2（Password-Based Key Derivation Function 2）
 * - 哈希函数：SHA-256，256位输出长度
 * - 迭代次数：100,000 次 — 在安全性和性能之间取得平衡；
 *   足以抵御离线暴力破解，同时在现代浏览器中验证延迟可接受
 * - Salt 策略：每次设置密码时生成 16 字节随机 salt，与 hash 一起存储；
 *   防止彩虹表攻击，且相同密码的不同用户生成不同的 hash
 * - 存储格式：`${saltBase64}:${hashBase64}` — salt 和 hash 均为 base64 编码，用冒号分隔
 *
 * 密钥派生流程：
 * 1. 将密码明文通过 TextEncoder 编码为字节数组
 * 2. 使用 Web Crypto API 的 importKey 导入为 PBKDF2 密钥材料
 * 3. 使用 deriveBits 执行密钥派生（salt + 100000次迭代 + SHA-256）
 * 4. 将输出的 256 位哈希编码为 base64 存储
 *
 * 会话管理：
 * - 认证成功后在 sessionStorage 中设置标志
 * - 关闭浏览器标签页后自动失效，无需额外的过期机制
 */
import { getSetting, setSetting } from './db';

const SESSION_KEY = 'review-app-auth';

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
 * 设置新密码
 *
 * 将密码哈希后存储到 IndexedDB 的 settings store 中。
 * 用于首次使用时的密码初始化。
 *
 * @param password - 用户设置的明文密码
 * @returns Promise<void>
 */
export async function setPassword(password: string): Promise<void> {
  const hashedValue = await hashPassword(password);
  await setSetting('password_hash', hashedValue);
}

/**
 * 检查密码并建立会话
 *
 * 验证密码正确后，在 sessionStorage 中设置认证标志，
 * 后续通过 isAuthenticated() 检查是否已登录。
 *
 * @param password - 用户输入的明文密码
 * @returns 密码是否正确；如果尚未设置密码则返回 false
 */
export async function checkPassword(password: string): Promise<boolean> {
  const storedHash = (await getSetting('password_hash')) as string | undefined;
  if (!storedHash) return false;

  const verified = await verifyPassword(password, storedHash);
  if (verified) {
    sessionStorage.setItem(SESSION_KEY, 'true');
  }
  return verified;
}

/**
 * 检查是否已设置密码
 *
 * 用于区分「首次使用」和「已有密码」两种状态。
 *
 * @returns 已设置密码返回 true，否则 false
 */
export async function isPasswordSet(): Promise<boolean> {
  const storedHash = await getSetting('password_hash');
  return !!storedHash;
}

/**
 * 检查当前会话是否已认证（同步方法）
 *
 * 仅检查 sessionStorage 中的标志，不涉及异步操作。
 *
 * @returns 当前会话已认证返回 true
 */
export function isAuthenticated(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

/**
 * 登出当前会话
 *
 * 清除 sessionStorage 中的认证标志。
 */
export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
