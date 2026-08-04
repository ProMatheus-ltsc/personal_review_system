/**
 * Toast — 全局消息提示组件
 *
 * 固定定位在页面顶部居中，支持三种类型：
 * - success（绿色）: 操作成功提示，3秒后自动关闭
 * - error（红色）: 错误提示，5秒后自动关闭
 * - info（蓝色）: 信息提示，3秒后自动关闭
 *
 * 通过 slideDown 动画进入，支持手动点击关闭。
 */
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
}

const typeStyles: Record<ToastProps['type'], string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const typeIcons: Record<ToastProps['type'], string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
};

const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose }) => {
  useEffect(() => {
    if (!isVisible) return;
    const duration = type === 'error' ? 5000 : 3000;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [isVisible, type, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] rounded-lg shadow-lg px-4 py-3 flex items-center gap-2 border animate-slideDown ${typeStyles[type]}`}
    >
      <span>{typeIcons[type]}</span>
      <span className="text-sm font-medium">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-2 text-current opacity-60 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;
