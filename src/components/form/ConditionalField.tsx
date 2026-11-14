/**
 * ConditionalField — 条件显示字段包装器（已下沉到 @shared/core）
 *
 * 本文件保留为兼容适配层：
 * - 历史调用方仍传 `field`，这里转成基座要求的 `condition`；
 * - 本地原有的 animate-fadeIn 包裹层保留，避免视觉回归；
 * - 匹配语义（含 '*' 通配符）由基座实现，能力为本文件超集。
 *
 * 注意：不向基座透传 `control`——本项目的 react-hook-form 版本低于
 * shared-core 内部副本，两边的 Control 泛型不是同一类型。基座在
 * FormProvider 内会自动 useFormContext() 取到当前 control，行为等价。
 */
import type { ReactNode } from 'react';
import { ConditionalField as SharedConditionalField } from '@shared/core/components/form/ConditionalField';
import type { FormField } from '@/types';

interface ConditionalFieldProps {
  field: FormField;
  /** 保留以兼容历史调用签名；实际由基座从 FormProvider 上下文获取 */
  control?: unknown;
  children: ReactNode;
}

/** Wrapper for conditional field display */
const ConditionalField = ({ field, children }: ConditionalFieldProps) => {
  if (!field.condition) return <>{children}</>;

  return (
    <SharedConditionalField condition={field.condition}>
      <div className="animate-fadeIn">{children}</div>
    </SharedConditionalField>
  );
};

export default ConditionalField;
