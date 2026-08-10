/**
 * usePhaseLogic — 多阶段模板的阶段计算与锁定逻辑
 *
 * 从 FormRenderer 拆出的独立 hook，集中管理：
 * - 当前阶段计算（currentPhaseIndex）：结合表单必填字段 + 可重复段 entries，
 *   通过 getCurrentPhaseIndex 判断用户已推进到的阶段
 * - 已进入最高阶段（visitedMaxPhase）：进入更高阶段后，之前的阶段锁定只读
 * - 锁定判断：isSectionLocked（未来阶段不可进入）/ isSectionReadOnly（已过阶段只读）
 * - 完成判定：canMarkComplete（completesRecord 阶段及其之前所有必填项满足）
 * - 阶段点击导航：handlePhaseClick（只读阶段回看提示 + visitedMaxPhase 推进）
 * - 初始加载自动导航：编辑已有记录时定位到当前阶段第一个 section
 *
 * 时间锁（复盘冷静期）仍由 getPhaseTimeLockInfo 计算，天数由模板 unlockAfterDays 决定。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import type { Dispatch, SetStateAction } from 'react';
import type { FormSection, PhaseConfig } from '@/types';
import { getCurrentPhaseIndex, getPhaseTimeLockInfo, getSectionPhaseIndex, isFieldEmpty } from '@/utils/formValidation';

import { isInvestmentTemplate } from '@/constants/templateMeta';

export interface UsePhaseLogicParams {
  /** 阶段配置（无阶段模板为 undefined） */
  phases?: PhaseConfig[];
  templateId: string;
  /** 模板 sections（用于查 repeatable 标记与 section 标题） */
  templateSections: FormSection[];
  /** react-hook-form 的 control（供 useWatch 监听阶段相关字段） */
  control: any;
  /** 读取全部表单值（canMarkComplete 用） */
  getValues: () => Record<string, any>;
  /** 写入表单值（初始加载时补 sell_date 默认值用） */
  setValue: (name: string, value: unknown, options?: { shouldDirty?: boolean }) => void;
  /** 编辑记录时的初始数据（含 _createdAt/_status/sell_status 等） */
  initialData?: Record<string, any>;
  /** 记录完成状态（isSectionReadOnly 依据） */
  recordStatus: 'draft' | 'completed';
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
  /** 切换 tab / 阶段点击时的保存回调（performSave('draft')） */
  onNavigateSave: () => void;
  /** 设置当前激活的 section tab */
  setActiveTab: (tab: number) => void;
}

export interface UsePhaseLogicResult {
  /** 当前所处阶段索引（0 起） */
  currentPhaseIndex: number;
  /** 用户实际进入过的最高阶段索引（用于回看只读锁定） */
  visitedMaxPhase: number;
  setVisitedMaxPhase: Dispatch<SetStateAction<number>>;
  /** section 是否属于未来阶段（不可进入，显示 🔒） */
  isSectionLocked: (sectionIndex: number) => boolean;
  /** section 是否只读（已完成阶段回看 / 记录完成后 completesRecord 前锁定） */
  isSectionReadOnly: (sectionIndex: number) => boolean;
  /** completesRecord 阶段及其之前的所有必填项是否满足（决定「✅ 完成」按钮是否可用） */
  canMarkComplete: () => boolean;
  /** 点击阶段指示器：导航到该阶段第一个 section（未来阶段拦截、只读回看提示） */
  handlePhaseClick: (phaseIndex: number) => void;
  /** 锁定 section 点击时的剩余冷静期提示文案（无锁/不可算时返回 null） */
  getLockedTabHint: (sectionIndex: number) => string | null;
}

/**
 * 多阶段模板的阶段计算与锁定逻辑 hook（详见文件头）
 */
export function usePhaseLogic({
  phases,
  templateId,
  templateSections,
  control,
  getValues,
  setValue,
  initialData,
  recordStatus,
  showToast,
  onNavigateSave,
  setActiveTab,
}: UsePhaseLogicParams): UsePhaseLogicResult {
  /** 用户实际进入过的最高阶段索引（进入更高阶段后，之前的阶段锁定只读） */
  const [visitedMaxPhase, setVisitedMaxPhase] = useState(0);
  /** 初始 tab 是否已定位（避免重复自动导航） */
  const initialTabSetRef = useRef(false);

  // --- 阶段完成度监听：可重复段 entries key + 非重复段的 completionFields ---
  const repeatableEntriesKeys = useMemo(() => {
    if (!phases) return [] as string[];
    const keys: string[] = [];
    phases.forEach((phase) => {
      phase.sectionIndices.forEach((idx) => {
        const section = templateSections[idx];
        if (section?.repeatable) keys.push(`${section.id}_entries`);
      });
    });
    return keys;
  }, [phases, templateSections]);

  const phaseCompletionFields = useMemo(() => {
    if (!phases) return [] as string[];
    const fields: string[] = [];
    phases.forEach((phase) => {
      const isRepeatablePhase = phase.sectionIndices.some((idx) => templateSections[idx]?.repeatable);
      if (!isRepeatablePhase) {
        phase.completionFields.forEach((f) => {
          if (!fields.includes(f)) fields.push(f);
        });
      }
    });
    return fields;
  }, [phases, templateSections]);

  const watchedPhaseValues = useWatch({
    control,
    name: phaseCompletionFields.length > 0 ? phaseCompletionFields : ['__phase_placeholder__'],
    disabled: phaseCompletionFields.length === 0,
  });

  const watchedRepeatableEntries = useWatch({
    control,
    name: repeatableEntriesKeys.length > 0 ? repeatableEntriesKeys : ['__repeatable_placeholder__'],
    disabled: repeatableEntriesKeys.length === 0,
  });

  // --- 当前阶段计算 ---
  const currentPhaseIndex = useMemo(() => {
    if (!phases) return 0;
    const formData: Record<string, any> = {};
    phaseCompletionFields.forEach((field, i) => {
      formData[field] = (watchedPhaseValues as unknown[])[i];
    });
    repeatableEntriesKeys.forEach((key, i) => {
      formData[key] = (watchedRepeatableEntries as unknown[])[i];
    });
    const createdAt = initialData ? (initialData._createdAt as string) : undefined;
    return getCurrentPhaseIndex(phases, formData, templateSections, createdAt);
  }, [phases, phaseCompletionFields, watchedPhaseValues, repeatableEntriesKeys, watchedRepeatableEntries, templateSections, initialData]);

  // --- 初始加载：定位到当前阶段第一个 section，并初始化 visitedMaxPhase ---
  useEffect(() => {
    if (initialTabSetRef.current) return;
    initialTabSetRef.current = true;
    if (!phases || !initialData) return;
    const firstSectionIdx = phases[currentPhaseIndex]?.sectionIndices[0];
    if (firstSectionIdx !== undefined && firstSectionIdx > 0) setActiveTab(firstSectionIdx);
    // 编辑已有记录时，直接以当前阶段作为已进入的最高阶段（之前的阶段锁定）
    // 特殊处理：部分卖出后的记录（sell_status=partial），虽然 currentPhaseIndex 可能在卖出阶段，
    // 但持有阶段应该保持可编辑（用户需要为剩余持仓添加持有检查），因此 visitedMaxPhase 不超过持有阶段
    let effectiveMaxPhase = currentPhaseIndex;
    if (initialData.sell_status === 'partial' && isInvestmentTemplate(templateId)) {
      const holdingPhaseIdx = phases.findIndex((p) => p.id === 'holding');
      if (holdingPhaseIdx >= 0 && currentPhaseIndex > holdingPhaseIdx) {
        effectiveMaxPhase = holdingPhaseIdx;
      }
    }
    setVisitedMaxPhase(effectiveMaxPhase);
    // 部分卖出/撤销后的记录，卖出日期被清空了，重新打开时默认填充今天日期
    if (isInvestmentTemplate(templateId) && !initialData.sell_date) {
      setValue('sell_date', new Date().toISOString().slice(0, 10), { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, initialData, currentPhaseIndex, templateId, setValue, setActiveTab]);

  // --- 完成判定：completesRecord 阶段及其之前所有 completionFields 满足 ---
  const canMarkComplete = (): boolean => {
    if (!phases) return false;
    const formData = getValues();
    const completesPhaseIndex = phases.findIndex((p) => p.completesRecord);
    if (completesPhaseIndex < 0) return false;
    for (let i = 0; i <= completesPhaseIndex; i++) {
      const phase = phases[i];
      const repeatableSection = templateSections.find((s, idx) =>
          s.repeatable && phase.sectionIndices.includes(idx)
      );
      if (repeatableSection) {
        const entriesKey = `${repeatableSection.id}_entries`;
        const entries = formData[entriesKey] as Record<string, unknown>[] | undefined;
        if (!entries || entries.length === 0) return false;
        if (!entries.some((entry) => phase.completionFields.every((fieldId) => !isFieldEmpty(entry[fieldId])))) {
          return false;
        }
      } else {
        if (!phase.completionFields.every((fieldId) => !isFieldEmpty(formData[fieldId]))) {
          return false;
        }
      }
    }
    return true;
  };

  // --- 锁定判断 ---
  const isSectionLocked = (sectionIndex: number): boolean => {
    if (!phases) return false;
    return getSectionPhaseIndex(phases, sectionIndex) > currentPhaseIndex;
  };

  const isSectionReadOnly = (sectionIndex: number): boolean => {
    if (!phases) return recordStatus === 'completed';
    const sectionPhaseIdx = getSectionPhaseIndex(phases, sectionIndex);
    if (sectionPhaseIdx < visitedMaxPhase) return true;
    if (recordStatus === 'completed') {
      const completesIdx = phases.findIndex((p) => p.completesRecord);
      if (completesIdx >= 0 && sectionPhaseIdx <= completesIdx) return true;
    }
    return false;
  };

  // --- 阶段指示器点击：导航到该阶段第一个 section ---
  const handlePhaseClick = (phaseIndex: number) => {
    if (!phases) return;
    if (phaseIndex > currentPhaseIndex) return; // 未来阶段不可进入
    const firstSectionIdx = phases[phaseIndex]?.sectionIndices[0];
    if (firstSectionIdx === undefined) return;
    if (isSectionReadOnly(firstSectionIdx)) {
      // 回看已完成阶段：提示一次
      showToast('该阶段已完成，仅供查看、无法修改', 'info');
    }
    if (phaseIndex > visitedMaxPhase) setVisitedMaxPhase(phaseIndex);
    onNavigateSave();
    setActiveTab(firstSectionIdx);
  };

  /** 锁定 tab 点击时的剩余天数提示（投资清单复盘锁页面体验，由 handleTabChange 调用） */
  const getLockedTabHint = (sectionIndex: number): string | null => {
    if (!phases) return null;
    const sectionPhaseIdx = getSectionPhaseIndex(phases, sectionIndex);
    const phase = phases[sectionPhaseIdx];
    if (!phase?.unlockAfterDays) return null;
    const lockInfo = getPhaseTimeLockInfo(phase, getValues(), initialData ? (initialData._createdAt as string) : undefined);
    if (lockInfo && lockInfo.unlockDate.getFullYear() < 9000) {
      return `「${templateSections[sectionIndex].title}」还需等待 ${lockInfo.daysRemaining} 天冷静期，之后即可复盘`;
    }
    return null;
  };

  return {
    currentPhaseIndex,
    visitedMaxPhase,
    setVisitedMaxPhase,
    isSectionLocked,
    isSectionReadOnly,
    canMarkComplete,
    handlePhaseClick,
    getLockedTabHint,
  };
}
