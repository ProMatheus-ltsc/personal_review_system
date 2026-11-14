/**
 * PhaseIndicator — 多阶段进度指示器（已下沉到 @shared/core）
 *
 * 本文件保留为兼容层：历史默认导入路径与 props 不变，
 * 实现由公共基座提供（基座额外支持 currentIndex/activeIndex 兼容别名与 isCompleted）。
 */
import type { PhaseConfig } from '@/types';
import { PhaseIndicator as SharedPhaseIndicator } from '@shared/core/components/form/PhaseIndicator';

interface PhaseIndicatorProps {
  phases: PhaseConfig[];
  currentPhaseIndex: number;
  onPhaseClick: (phaseIndex: number) => void;
  formData?: Record<string, any>;
  recordCreatedAt?: string;
}

const PhaseIndicator = ({
  phases,
  currentPhaseIndex,
  onPhaseClick,
  formData,
  recordCreatedAt,
}: PhaseIndicatorProps) => (
  <SharedPhaseIndicator
    phases={phases}
    currentPhaseIndex={currentPhaseIndex}
    onPhaseClick={onPhaseClick}
    formData={formData}
    recordCreatedAt={recordCreatedAt}
  />
);

export default PhaseIndicator;
