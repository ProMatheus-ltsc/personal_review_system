import { useState, useEffect, useCallback } from 'react';
import * as authService from '@/services/auth';

interface AuthState {
  isAuthenticated: boolean;
  isFirstTime: boolean;
  loading: boolean;
  username: string | null;
}

interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * 认证状态管理 Hook
 *
 * 管理用户认证的完整生命周期，提供多账户注册、登录和状态查询能力。
 *
 * 认证状态机：
 * - loading=true → 初始化中（检查是否已有账户）
 * - loading=false, isFirstTime=true → 无任何账户，需创建第一个账户
 * - loading=false, isFirstTime=false, isAuthenticated=false → 需要登录
 * - isAuthenticated=true → 已登录，可访问受保护页面
 *
 * 多账户隔离：登录成功后通过 authService.login 自动切换当前账户上下文，
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
  const [state, setState] = useState<AuthState>({
    isAuthenticated: authService.isAuthenticated(),
    isFirstTime: false,
    loading: true,
    username: authService.getSessionUsername(),
  });

  useEffect(() => {
    let mounted = true;

    async function checkAuthState() {
      try {
        const passwordSet = await authService.isPasswordSet();
        if (mounted) {
          setState((prev) => ({
            ...prev,
            isFirstTime: !passwordSet,
            loading: false,
          }));
        }
      } catch {
        if (mounted) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    }

    checkAuthState();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      if (!username.trim()) {
        return { success: false, error: '请输入账户名' };
      }
      if (!password) {
        return { success: false, error: '请输入密码' };
      }

      try {
        const result = await authService.login(username, password);
        if (result.success) {
          setState((prev) => ({
            ...prev,
            isAuthenticated: true,
            isFirstTime: false,
            username: authService.getSessionUsername(),
          }));
        }
        return result;
      } catch {
        return { success: false, error: '验证失败，请重试' };
      }
    },
    []
  );

  const register = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      if (!username.trim()) {
        return { success: false, error: '请输入账户名' };
      }
      if (password.length < 4 || password.length > 20) {
        return { success: false, error: '密码长度需在 4-20 位之间' };
      }

      try {
        const result = await authService.registerAccount(username, password);
        if (result.success) {
          // 注册成功后自动登录（切换账户上下文 + 建立会话）
          const loginResult = await authService.login(username, password);
          if (loginResult.success) {
            setState((prev) => ({
              ...prev,
              isAuthenticated: true,
              isFirstTime: false,
              username: authService.getSessionUsername(),
            }));
          }
          return loginResult;
        }
        return result;
      } catch {
        return { success: false, error: '创建账户失败，请重试' };
      }
    },
    []
  );

  const setPassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      // 兼容旧调用（仅密码）：无账户场景下注册一个「默认」账户
      return register('默认账户', password);
    },
    [register]
  );

  const logout = useCallback(() => {
    authService.logout();
    setState((prev) => ({ ...prev, isAuthenticated: false, username: null }));
  }, []);

  const resetPassword = useCallback(async () => {
    await authService.resetPassword();
    setState({ isAuthenticated: false, isFirstTime: true, loading: false, username: null });
  }, []);

  return {
    isAuthenticated: state.isAuthenticated,
    isFirstTime: state.isFirstTime,
    loading: state.loading,
    username: state.username,
    login,
    register,
    setPassword,
    logout,
    resetPassword,
  };
}
