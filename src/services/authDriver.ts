/**
 * 本项目认证装配：把 shared-core 的统一认证接到本项目的 IndexedDB 上。
 *
 * - 认证算法、状态机、错误语义：全部走 shared-core（`@shared/core/auth`）
 * - 账户存储：仍用本项目的 `services/db.ts`（业务库是 review-app-{accountId}，
 *   且账户 id 即用户名，切换 id 会影响既有业务库命名，不适合直接换用包内 db 层）
 *
 * 历史兼容（三处差异都由 shared-core 的本地驱动原生支持）：
 * - 哈希格式 base64（盐与哈希拼在一个字段），shared-core 的 localDriver 认
 * - 会话介质 sessionStorage，键名沿用 review-app-auth-account
 * - 账户 id 即用户名（accountIdStrategy: 'username'）
 */
import { createLocalAuthDriver, type LocalAccount } from '@shared/core/auth';
import {
  listAccounts,
  getAccount,
  createAccount,
  updateAccountPassword,
  deleteAccount,
  setCurrentAccountId,
} from './db';

/** sessionStorage 键名：记录当前登录账户 id（沿用历史键名） */
export const SESSION_ACCOUNT_KEY = 'review-app-auth-account';
/** sessionStorage 键名：记录当前登录用户名 */
export const SESSION_USERNAME_KEY = 'review-app-auth-username';

/**
 * 本项目 AccountRecord（id 即用户名，无独立 username 列、无独立 salt 列）
 * 与 shared-core LocalAccount 的映射：
 * - `username` 补成 id（shared-core 需要显式的 username 字段）
 * - `salt` 留空——base64 格式下盐在 passwordHash 里
 */
function toLocalAccount(record: {
  id: string;
  passwordHash: string;
  createdAt: string;
}): LocalAccount {
  return {
    id: record.id,
    username: record.id,
    passwordHash: record.passwordHash,
    createdAt: record.createdAt,
  };
}

/**
 * 登录成功/会话恢复后要把业务库上下文切到当前账户。
 * 用本包自带的 `services/db` 时无需传——包内已自动调用 setCurrentAccountId；
 * 用项目自有数据层时在这里接上项目的切换函数。
 */
function syncBusinessAccount(accountId: string | undefined): void {
  setCurrentAccountId(accountId ?? null);
}

/** shared-core 本地认证驱动 */
export const localAuthDriver = createLocalAuthDriver({
  store: {
    list: async () => (await listAccounts()).map(toLocalAccount),
    findByUsername: async (username) => {
      const found = await getAccount(username);
      return found ? toLocalAccount(found) : undefined;
    },
    put: async (account) => {
      const existing = await getAccount(account.id);
      if (existing) {
        await updateAccountPassword(account.id, account.passwordHash);
      } else {
        await createAccount(account.id, account.passwordHash);
      }
    },
  },
  hashFormat: 'base64',
  sessionMedium: 'sessionStorage',
  storageKey: SESSION_ACCOUNT_KEY,
  accountIdStrategy: 'username',
  onAccountChange: syncBusinessAccount,
});

export { deleteAccount, syncBusinessAccount };