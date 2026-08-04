import { useState, useEffect, useCallback } from 'react';
import * as authService from '@/services/auth';

interface AuthState {
  isAuthenticated: boolean;
  isFirstTime: boolean;
  loading: boolean;
}

interface LoginResult {
  success: boolean;
  error?: string;
}

/**
 * 认证状态管理 Hook
 *
 * 管理用户认证的完整生命周期，提供登录、设置密码和状态查询能力。
 *
 * 认证状态机：
 * - loading=true → 初始化中（检查是否首次使用）
 * - loading=false, isFirstTime=true → 首次使用，需设置密码
 * - loading=false, isFirstTime=false, isAuthenticated=false → 需要登录
 * - isAuthenticated=true → 已认证，可访问受保护页面
 *
 * @returns 返回对象包含：
 * - isAuthenticated: 当前是否已通过密码验证
 * - isFirstTime: 是否为首次使用（未设置过密码）
 * - loading: 初始化状态是否完成
 * - login: 密码登录方法
 * - setPassword: 首次设置密码方法
 * - logout: 登出方法（清除 session 标记）
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: authService.isAuthenticated(),
    isFirstTime: false,
    loading: true,
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
    async (password: string): Promise<LoginResult> => {
      if (!password) {
        return { success: false, error: '请输入密码' };
      }

      try {
        const verified = await authService.checkPassword(password);
        if (verified) {
          setState((prev) => ({ ...prev, isAuthenticated: true }));
          return { success: true };
        }
        return { success: false, error: '密码错误，请重试' };
      } catch {
        return { success: false, error: '验证失败，请重试' };
      }
    },
    []
  );

  const setPassword = useCallback(
    async (password: string): Promise<LoginResult> => {
      if (!password) {
        return { success: false, error: '请输入密码' };
      }
      if (password.length < 4 || password.length > 20) {
        return { success: false, error: '密码长度需在 4-20 位之间' };
      }

      try {
        await authService.setPassword(password);
        await authService.checkPassword(password);
        setState((prev) => ({
          ...prev,
          isAuthenticated: true,
          isFirstTime: false,
        }));
        return { success: true };
      } catch {
        return { success: false, error: '设置密码失败，请重试' };
      }
    },
    []
  );

  const logout = useCallback(() => {
    authService.logout();
    setState((prev) => ({ ...prev, isAuthenticated: false }));
  }, []);

  return {
    isAuthenticated: state.isAuthenticated,
    isFirstTime: state.isFirstTime,
    loading: state.loading,
    login,
    setPassword,
    logout,
  };
}
