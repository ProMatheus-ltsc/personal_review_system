/**
 * ConfirmDialog — 通用确认弹窗（已下沉到 @shared/core）
 * 本文件保留为适配薄层：open/isOpen 属性映射 + 默认 info 变体（延续旧视觉基调），
 * 历史导入路径与调用方式不变。
 */
import { ConfirmDialog as SharedConfirmDialog } from '@shared/core';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <SharedConfirmDialog
      open={isOpen}
      title={title}
      message={message}
      confirmText={confirmText}
      cancelText={cancelText}
      variant="info"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
