/**
 * FormNavButtons — 表单底部导航按钮组（已下沉到 @shared/core）
 *
 * 本文件保留为兼容适配层：
 * - 历史 props（含投资清单的 recordRole/templateId）保持不变；
 * - 组件本体（5 分支渲染、锁定/只读/导航）由公共基座提供；
 * - 业务文案（买入单/卖出单）在本层算好后通过 completeLabel 注入，
 *   符合基座"业务文案由使用方注入"的设计。
 */
import { isInvestmentTemplate } from '@/constants/templateMeta';
import SharedFormNavButtons from '@shared/core/components/form/FormNavButtons';

interface FormNavButtonsProps {
  /** 当前激活的 section tab 索引 */
  activeTab: number;
  /** section 总数 */
  totalSections: number;
  recordStatus: 'draft' | 'completed';
  /** 投资清单单据角色（buy/sell 时完成按钮显示「完成买入单/卖出单 · 等待复盘」） */
  recordRole?: string;
  templateId: string;
  /** 是否有阶段配置（无阶段模板 = 简单完成流程） */
  hasPhases: boolean;
  canMarkComplete: () => boolean;
  isSectionLocked: (index: number) => boolean;
  isSectionReadOnly: (index: number) => boolean;
  onPrev: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onComplete: () => void;
  onMarkComplete: () => void;
}

export default function FormNavButtons({
  recordRole,
  templateId,
  ...rest
}: FormNavButtonsProps) {
  /** 投资清单买入/卖出单的完成文案（等待复盘解锁） */
  const completeLabel =
    isInvestmentTemplate(templateId) && recordRole === 'buy'
      ? '✅ 完成买入单 · 等待复盘'
      : isInvestmentTemplate(templateId) && recordRole === 'sell'
        ? '✅ 完成卖出单 · 等待复盘'
        : '✅ 完成';

  return <SharedFormNavButtons {...rest} completeLabel={completeLabel} />;
}
