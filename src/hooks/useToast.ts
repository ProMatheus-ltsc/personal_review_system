/**
 * useToast — 消息提示状态管理 Hook
 *
 * 管理全局 Toast 消息的显示状态，提供 showToast / hideToast 方法。
 * 配合 Toast 组件使用，Toast 组件负责渲染和自动关闭。
 *
 * @returns
 * - toast: 当前提示状态（null 表示无提示）
 * - showToast(message, type): 显示一条提示
 * - hideToast(): 立即关闭提示
 */
import { useState, useCallback } from 'react';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showToast, hideToast };
}
