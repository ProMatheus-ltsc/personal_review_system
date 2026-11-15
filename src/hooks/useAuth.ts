import { useCallback, useEffect } from 'react';
import * as authService from '@/services/auth';
import { useAuth as useSharedAuth } from '@shared/core/auth';

/** 登录/注册结果 */
export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * 认证状态管理 Hook
 *
 * 管理用户认证的完整生命周期，提供多账户注册、登录和状态查询能力。
 *
 * 认证状态机（沿用 shared-core 的四态）：
 * - 'loading' → 初始化中（检查是否已有账户）
 * - 'firstTime' → 无任何账户，需创建第一个账户
 * - 'login' → 需要登录
 * - 'authenticated' → 已登录，可访问受保护页面
 *
 * 多账户隔离：登录成功后通过驱动切换当前账户上下文，
 * 之后所有数据读写进入该账户独立的业务库（review-app-{accountId}）。
 *
 * @returns 返回对象包含：
 * - isAuthenticated: 当前是否已登录
 * - isFirstTime: 是否无任何已注册账户（首次使用）
 * - username: 当前登录账户名
 * - loading: 初始化状态是否完成
 * - login: 登录方法（用户名 + 密码）
 * - register: 注册新账户方法（用户名 + 密码）
 * - setPassword: 兼容旧名（注册第一个账户）
 * - logout: 登出方法
 * - resetPassword: 重置全部账户
 */
export function useAuth() {
  const { state, user, login: sharedLogin, register: sharedRegister, logout: sharedLogout } =
    useSharedAuth();

  const isAuthenticated = state === 'authenticated';
  const isFirstTime = state === 'firstTime';
  const loading = state === 'loading';
  const username = user?.username ?? null;

  const login = useCallback(
    async (name: string, password: string): Promise<AuthResult> => {
      if (!name.trim()) {
        return { success: false, error: '请输入账户名' };
      }
      if (!password) {
        return { success: false, error: '请输入密码' };
      }
      const ok = await sharedLogin(name.trim(), password);
      if (ok) return { success: true };
      return { success: false, error: '验证失败，请重试' };
    },
    [sharedLogin],
  );

  const register = useCallback(
    async (name: string, password: string): Promise<AuthResult> => {
      if (!name.trim()) {
        return { success: false, error: '请输入账户名' };
      }
      if (password.length < 4 || password.length > 20) {
        return { success: false, error: '密码长度需在 4-20 位之间' };
      }
      // 注册成功即自动登录（共享包的 register 内部即完成登录）
      const ok = await sharedRegister(name.trim(), password);
      if (ok) return { success: true };
      return { success: false, error: '创建账户失败，请重试' };
    },
    [sharedRegister],
  );

  const setPassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      // 兼容旧调用（仅密码）：无账户场景下注册一个「默认」账户
      return register('默认账户', password);
    },
    [register],
  );

  const logout = useCallback(() => {
    void sharedLogout();
  }, [sharedLogout]);

  const resetPassword = useCallback(async () => {
    await authService.resetPassword();
  }, []);

  // 账户上下文需要在登录态变化时同步到业务库；共享驱动已处理，
  // 这里仅在会话恢复失败时兜底回退。
  useEffect(() => {
    if (state === 'authenticated' && user) {
      authService.isAuthenticated();
    }
  }, [state, user]);

  return {
    isAuthenticated,
    isFirstTime,
    loading,
    username,
    login,
    register,
    setPassword,
    logout,
    resetPassword,
  };
}
