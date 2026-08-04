/**
 * ConditionalField — 条件显示字段包装器
 *
 * 根据字段的 condition 配置决定是否渲染子组件：
 * - 无 condition 配置 → 始终渲染
 * - 有 condition 配置 → 监听 dependsOn 字段的值，
 *   仅当值匹配 showWhen 时才渲染（支持单值或数组匹配）
 *
 * 使用 useWatch 实现响应式监听，值变化时自动显示/隐藏字段。
 */
import React from 'react';
import { useWatch } from 'react-hook-form';
import type { FormField } from '@/types';

interface ConditionalFieldProps {
  field: FormField;
  control: any;
  children: React.ReactNode;
}

/** Wrapper for conditional field display */
const ConditionalField: React.FC<ConditionalFieldProps> = ({ field, control, children }) => {
  if (!field.condition) return <>{children}</>;

  const watchedValue = useWatch({ control, name: field.condition.dependsOn });
  const showWhen = field.condition.showWhen;

  // Support wildcard '*' to match any non-empty value
  const isVisible = Array.isArray(showWhen)
    ? showWhen.includes('*')
      ? !!watchedValue && String(watchedValue).trim() !== ''
      : showWhen.includes(watchedValue)
    : watchedValue === showWhen;

  if (!isVisible) return null;
  return <div className="animate-fadeIn">{children}</div>;
};

export default ConditionalField;
