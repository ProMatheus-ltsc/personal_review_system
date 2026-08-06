/**
 * FormRenderer — 核心表单引擎组件
 *
 * 根据 FormTemplate 配置动态渲染完整的复盘表单。核心能力：
 * - 多阶段（Phase）支持：按阶段分组展示 section，支持时间锁和冷静期
 * - 自动保存草稿：每次字段变更后自动保存到 IndexedDB
 * - 编辑模式：加载已有记录并回填表单
 * - 表单验证：必填字段校验 + 验证错误高亮定位
 * - 可重复 Section：支持动态添加/删除重复记录块
 * - 条件字段：根据其他字段值动态显示/隐藏
 * - 质量自检：提交前触发 QualityCheck 弹窗
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import type { FormTemplate, FormRecord, FormField } from '@/types';
import { useSaveRecord } from '@/hooks/useDB';
import { getLatestCompletedRecord } from '@/services/db';
import { useToast } from '@/hooks/useToast';
import { validateRequiredFields, getCurrentPhaseIndex, getSectionPhaseIndex, isFieldEmpty, getPhaseTimeLockInfo } from '@/utils/formValidation';
import type { ValidationError } from '@/utils/formValidation';
import { levelMap } from '@/constants/templateMeta';
import { ConditionalField, OptionalFieldsGroup, CollapsibleSection } from './form';
import FieldRenderer from './FieldRenderer';
import QualityCheck from './QualityCheck';
import PhaseIndicator from './PhaseIndicator';
import Toast from './Toast';
import ReferenceSidebar from './ReferenceSidebar';
import RepeatableSection from './RepeatableSection';
import ConfirmDialog from './ConfirmDialog';

/**
 * 解析模板字段中的 magic string defaultValue 为实际值
 */
function resolveDefaultValue(value: unknown, now: Date): unknown {
  if (typeof value !== 'string') return value;
  switch (value) {
    case 'today':
    case 'auto_today':
      return now.toISOString().slice(0, 10);
    case 'auto_week_start':
      return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    case 'auto_week_end':
      return format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    default:
      return value;
  }
}

/**
 * FormRenderer — 核心表单渲染引擎
 *
 * 负责将模板配置（FormTemplate）转换为交互式表单界面。
 *
 * 主要功能：
 * - 多 Tab 分区导航（每个 section 对应一个 tab）
 * - 自动保存（30秒间隔 + tab 切换时保存）
 * - 多阶段生命周期支持（phases）：按时间延迟激活后续阶段
 * - 实时表单验证与错误提示
 * - 质量检查面板集成
 * - 历史参考侧栏
 *
 * Phase 激活逻辑：
 * 1. 第一个 phase 始终激活
 * 2. 后续 phase 需要前一个 phase 的 completionFields 全部非空
 * 3. 如果配置了 activateAfterDays，还需等待指定天数后才激活
 *
 * @param template - 模板配置，定义表单结构和阶段
 * @param initialData - 已有表单数据（编辑模式）
 * @param recordId - 现有记录 ID（编辑模式）
 * @param onSave - 保存回调
 */

interface FormRendererProps {
  template: FormTemplate;
  initialData?: Record<string, unknown>;
  recordId?: string;
  onSave?: (record: FormRecord) => void;
}

const FormRenderer: React.FC<FormRendererProps> = ({
  template,
  initialData,
  recordId,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [initialTabSet, setInitialTabSet] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [loadedFromPrevWeek, setLoadedFromPrevWeek] = useState(false);
  /** 待确认的只读（已锁定过去阶段）section 索引，null 表示未弹窗 */
  const [readonlyConfirmSection, setReadonlyConfirmSection] = useState<number | null>(null);
  /**
   * 用户实际进入过的最高阶段索引。
   * currentPhaseIndex 会在字段填满时自动推进（用于解锁下一阶段），
   * 但只有用户真正进入下一阶段后，之前的阶段才锁定——
   * 避免「买入前」刚填完必填项就被置灰锁定的自动完成错觉。
   */
  const [visitedMaxPhase, setVisitedMaxPhase] = useState(0);
  const { toast, showToast, hideToast } = useToast();
  const { save } = useSaveRecord();
  const currentRecordId = useRef(recordId || uuidv4());
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build default values from template fields
  const computedDefaults = useCallback(() => {
    if (initialData) return initialData;
    const defaults: Record<string, any> = {};
    const now = new Date();
    template.sections.forEach((s) => {
      if (s.repeatable) {
        // Initialize repeatable section with empty entries array
        defaults[`${s.id}_entries`] = [];
        return;
      }
      s.fields.forEach((f) => {
        if (f.type === 'table') {
          defaults[f.id] = Array.isArray(f.defaultValue) ? f.defaultValue : [{}];
        } else if (f.defaultValue !== undefined) {
          defaults[f.id] = resolveDefaultValue(f.defaultValue, now);
        }
      });
    });
    return defaults;
  }, [template, initialData]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: computedDefaults(),
  });

  // === Computed fields logic ===
  const computedFields = useMemo(() => {
    const fields: { id: string; dependsOn: string[]; formula: (v: Record<string, unknown>) => string; placeholder?: string; errorText?: string; autoOnly?: boolean }[] = [];
    template.sections.forEach((s) => {
      if (s.repeatable) return; // skip repeatable sections
      s.fields.forEach((f) => {
        if (f.computed) {
          fields.push({ id: f.id, ...f.computed });
        }
      });
    });
    return fields;
  }, [template]);

  const computedDependencyFields = useMemo(
    () => [...new Set(computedFields.flatMap((c) => c.dependsOn))],
    [computedFields]
  );

  const watchedComputedDeps = useWatch({
    control,
    name: computedDependencyFields.length > 0 ? computedDependencyFields : ['__computed_placeholder__'],
    disabled: computedDependencyFields.length === 0,
  });

  useEffect(() => {
    if (computedFields.length === 0) return;
    // Build a map of dependency values
    const depValues: Record<string, unknown> = {};
    computedDependencyFields.forEach((field, i) => {
      depValues[field] = watchedComputedDeps[i];
    });
    // Calculate and set each computed field
    computedFields.forEach((cf) => {
      const result = cf.formula(depValues);
      if (cf.autoOnly) {
        // autoOnly：仅在公式有有效结果时写回；无结果时保留用户手动填写的值
        if (result !== '') {
          setValue(cf.id, result, { shouldDirty: false });
        }
      } else {
        setValue(cf.id, result, { shouldDirty: false });
      }
    });
  }, [watchedComputedDeps, computedFields, computedDependencyFields, setValue]);

  // === Load previous week's plan for new weekly_review ===
  useEffect(() => {
    if (template.id !== 'weekly_review' || initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const prevRecord = await getLatestCompletedRecord('weekly_review');
        if (cancelled || !prevRecord) return;
        const prevData = prevRecord.data as Record<string, unknown>;
        // Map: core_goal1/2/3 → goal1/2/3
        if (prevData.core_goal1) {
          setValue('goal1', prevData.core_goal1 as string, { shouldDirty: false });
        }
        if (prevData.core_goal2) {
          setValue('goal2', prevData.core_goal2 as string, { shouldDirty: false });
        }
        if (prevData.core_goal3) {
          setValue('goal3', prevData.core_goal3 as string, { shouldDirty: false });
        }
        // Format key_actions table into readable text
        const keyActions = prevData.key_actions as Record<string, string>[] | undefined;
        if (Array.isArray(keyActions) && keyActions.length > 0) {
          const formatted = keyActions
            .filter(row => row.goal || row.action)
            .map((row, i) => {
              const parts: string[] = [];
              if (row.goal) parts.push(`目标: ${row.goal}`);
              if (row.action) parts.push(`行动: ${row.action}`);
              if (row.deadline) parts.push(`截止: ${row.deadline}`);
              if (row.priority) parts.push(`优先级: ${row.priority}`);
              return `${i + 1}. ${parts.join(' | ')}`;
            })
            .join('\n');
          if (formatted) {
            setValue('last_week_actions', formatted, { shouldDirty: false });
          }
        }
        setLoadedFromPrevWeek(true);
      } catch {
        // silently ignore - non-critical feature
      }
    })();
    return () => { cancelled = true; };
  }, [template.id, initialData, setValue]);

  // Phase detection - watch all completion fields for reactivity
  const phases = template.phases;

  // For repeatable sections, we watch the entries key instead of individual fields
  const repeatableEntriesKeys = useMemo(() => {
    if (!phases) return [] as string[];
    const keys: string[] = [];
    phases.forEach((phase) => {
      phase.sectionIndices.forEach((idx) => {
        const section = template.sections[idx];
        if (section?.repeatable) {
          keys.push(`${section.id}_entries`);
        }
      });
    });
    return keys;
  }, [phases, template.sections]);

  const phaseCompletionFields = useMemo(
    () => {
      if (!phases) return [] as string[];
      const fields: string[] = [];
      phases.forEach((phase) => {
        const isRepeatablePhase = phase.sectionIndices.some((idx) =>
          template.sections[idx]?.repeatable
        );
        if (!isRepeatablePhase) {
          phase.completionFields.forEach((f) => {
            if (!fields.includes(f)) fields.push(f);
          });
        }
      });
      return fields;
    },
    [phases, template.sections]
  );

  const watchedPhaseValues = useWatch({
    control,
    name: phaseCompletionFields.length > 0 ? phaseCompletionFields : ['__phase_placeholder__'],
    disabled: phaseCompletionFields.length === 0,
  });

  // Also watch repeatable entries for phase detection
  const watchedRepeatableEntries = useWatch({
    control,
    name: repeatableEntriesKeys.length > 0 ? repeatableEntriesKeys : ['__repeatable_placeholder__'],
    disabled: repeatableEntriesKeys.length === 0,
  });

  const currentPhaseIndex = useMemo(() => {
    if (!phases) return 0;
    const formData: Record<string, any> = {};
    phaseCompletionFields.forEach((field, i) => {
      formData[field] = watchedPhaseValues[i];
    });
    // Include repeatable entries data
    repeatableEntriesKeys.forEach((key, i) => {
      formData[key] = watchedRepeatableEntries[i];
    });
    const createdAt = initialData ? (initialData._createdAt as string) : undefined;
    return getCurrentPhaseIndex(phases, formData, template.sections, createdAt);
  }, [phases, phaseCompletionFields, watchedPhaseValues, repeatableEntriesKeys, watchedRepeatableEntries, template.sections, initialData]);

  // Auto-navigate to current phase's first section on initial load (for existing records)
  useEffect(() => {
    if (!initialTabSet && phases && initialData) {
      const firstSectionIdx = phases[currentPhaseIndex]?.sectionIndices[0];
      if (firstSectionIdx !== undefined && firstSectionIdx > 0) {
        setActiveTab(firstSectionIdx);
      }
      // 编辑已有记录时，直接以当前阶段作为已进入的最高阶段（之前的阶段锁定）
      setVisitedMaxPhase(currentPhaseIndex);
      setInitialTabSet(true);
    } else if (!initialTabSet) {
      setInitialTabSet(true);
    }
  }, [initialTabSet, phases, initialData, currentPhaseIndex]);

  const buildRecord = useCallback(
    (status: 'draft' | 'completed'): FormRecord => {
      const now = new Date().toISOString();
      const data = getValues();
      return {
        id: currentRecordId.current,
        templateId: template.id,
        title: `${template.name} - ${format(new Date(), 'yyyy-MM-dd')}`,
        data,
        status,
        createdAt: initialData ? (initialData._createdAt as string) || now : now,
        updatedAt: now,
      };
    },
    [getValues, template, initialData]
  );

  // Check if all phases before the completesRecord phase are filled
  // (used to determine if "mark as completed" button should be shown)
  const canMarkComplete = useCallback((): boolean => {
    if (!phases) return false;
    const formData = getValues();
    // Find the phase with completesRecord
    const completesPhaseIndex = phases.findIndex(p => p.completesRecord);
    if (completesPhaseIndex < 0) return false;
    // All phases up to and including the completesRecord phase must have completionFields satisfied
    for (let i = 0; i <= completesPhaseIndex; i++) {
      const phase = phases[i];
      const repeatableSection = template.sections.find((s, idx) =>
        s.repeatable && phase.sectionIndices.includes(idx)
      );
      if (repeatableSection) {
        const entriesKey = `${repeatableSection.id}_entries`;
        const entries = formData[entriesKey] as Record<string, unknown>[] | undefined;
        if (!entries || entries.length === 0) return false;
        const hasCompleteEntry = entries.some((entry) =>
          phase.completionFields.every((fieldId) => !isFieldEmpty(entry[fieldId]))
        );
        if (!hasCompleteEntry) return false;
      } else {
        const allComplete = phase.completionFields.every(
          (fieldId) => !isFieldEmpty(formData[fieldId])
        );
        if (!allComplete) return false;
      }
    }
    return true;
  }, [phases, getValues, template.sections]);

  // Track record status from initial data
  const [recordStatus, setRecordStatus] = useState<'draft' | 'completed'>(
    initialData?._status as 'draft' | 'completed' || 'draft'
  );

  const performSave = useCallback(
    async (status: 'draft' | 'completed') => {
      try {
        setSaveStatus('saving');
        // 首次标记完成时写入完成日期，作为复盘阶段 30 天解锁的基准
        if (status === 'completed' && isFieldEmpty(getValues('_completedAt'))) {
          setValue('_completedAt', new Date().toISOString().slice(0, 10), { shouldDirty: false });
        }
        // 已完成记录被重新编辑并自动保存时保持 completed 状态，避免被草稿保存降级
        const finalStatus: 'draft' | 'completed' =
          status === 'completed' || recordStatus === 'completed' ? 'completed' : 'draft';
        const record = buildRecord(finalStatus);
        await save(record);
        setLastSaved(new Date());
        setSaveStatus('saved');
        if (finalStatus === 'completed') {
          setRecordStatus('completed');
        }
        return record;
      } catch {
        setSaveStatus('idle');
        return null;
      }
    },
    [buildRecord, save, recordStatus, getValues, setValue]
  );

  // Auto-save every 30 seconds (skip fully read-only completed records)
  useEffect(() => {
    if (recordStatus === 'completed' && !phases) return;
    autoSaveRef.current = setInterval(() => {
      performSave('draft');
    }, 30000);

    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
      }
    };
  }, [performSave, recordStatus, phases]);

  // Check if a section belongs to a locked (future) phase
  const isSectionLocked = useCallback(
    (sectionIndex: number): boolean => {
      if (!phases) return false;
      const sectionPhaseIdx = getSectionPhaseIndex(phases, sectionIndex);
      return sectionPhaseIdx > currentPhaseIndex;
    },
    [phases, currentPhaseIndex]
  );

  // 判断 section 是否为只读：
  // - 无阶段模板：已完成记录整体只读
  // - 多阶段模板：
  //   1) 用户已实际进入过的更高阶段 → 之前的阶段锁定（只能查看不能修改）
  //   2) 记录标记完成后，completesRecord 阶段（决策后/卖出）及之前的阶段
  //      全部锁定，不能再修改（复盘阶段解锁后仍可填写）
  const isSectionReadOnly = useCallback(
    (sectionIndex: number): boolean => {
      if (!phases) return recordStatus === 'completed';
      const sectionPhaseIdx = getSectionPhaseIndex(phases, sectionIndex);
      if (sectionPhaseIdx < visitedMaxPhase) return true;
      if (recordStatus === 'completed') {
        const completesIdx = phases.findIndex((p) => p.completesRecord);
        if (completesIdx >= 0 && sectionPhaseIdx <= completesIdx) return true;
      }
      return false;
    },
    [phases, recordStatus, visitedMaxPhase]
  );

  // Save on tab switch
  const handleTabChange = useCallback(
    (index: number) => {
      // Prevent navigating to a locked section
      if (isSectionLocked(index)) return;
      // 回看多阶段模板中已完成的过去阶段：需确认只读查看
      // （已处于只读阶段内切换则无需重复确认）
      if (phases && isSectionReadOnly(index) && !isSectionReadOnly(activeTab)) {
        setReadonlyConfirmSection(index);
        return;
      }
      // 进入更高阶段后，之前的阶段才锁定
      if (phases) {
        const targetPhase = getSectionPhaseIndex(phases, index);
        if (targetPhase > visitedMaxPhase) setVisitedMaxPhase(targetPhase);
      }
      performSave('draft');
      setActiveTab(index);
    },
    [performSave, isSectionLocked, phases, isSectionReadOnly, activeTab, visitedMaxPhase]
  );

  // Handle phase click - navigate to the first section of the selected phase
  const handlePhaseClick = useCallback(
    (phaseIndex: number) => {
      if (!phases) return;
      // Don't navigate to locked phases
      if (phaseIndex > currentPhaseIndex) return;
      const firstSectionIdx = phases[phaseIndex]?.sectionIndices[0];
      if (firstSectionIdx === undefined) return;
      // 回看已完成/锁定的阶段（含完成后的 completesRecord 阶段）：需确认只读查看
      // （已处于只读阶段则无需重复确认）
      if (isSectionReadOnly(firstSectionIdx) && !isSectionReadOnly(activeTab)) {
        setReadonlyConfirmSection(firstSectionIdx);
        return;
      }
      // 进入更高阶段后，之前的阶段才锁定
      if (phaseIndex > visitedMaxPhase) setVisitedMaxPhase(phaseIndex);
      performSave('draft');
      setActiveTab(firstSectionIdx);
    },
    [phases, performSave, currentPhaseIndex, isSectionReadOnly, activeTab, visitedMaxPhase]
  );

  const handleDraftSave = async () => {
    const record = await performSave('draft');
    if (record) {
      showToast('草稿已保存', 'info');
      onSave?.(record);
    }
  };

  const handleComplete = async () => {
    const formData = getValues();
    const { valid, errors } = validateRequiredFields(template, formData);

    if (!valid) {
      setValidationErrors(errors);
      // Navigate to the first section with errors
      const firstErrorSection = errors[0].sectionIndex;
      setActiveTab(firstErrorSection);
      showToast(`有 ${errors.length} 个字段未通过校验，请检查`, 'error');
      return;
    }

    setValidationErrors([]);
    handleSubmit(async () => {
      const record = await performSave('completed');
      if (record) {
        showToast('复盘已完成并保存 ✨', 'success');
        // 延迟显示质量检查弹窗，避免遮挡 Toast 提示
        setTimeout(() => setShowQualityCheck(true), 1500);
        onSave?.(record);
      }
    })();
  };

  /**
   * 标记记录为已完成
   *
   * 用于 completesRecord 阶段（如决策日志的「决策后」、投资清单的「卖出」）
   * 完成后、下一阶段被时间锁定的场景：只校验到 completesRecord 阶段为止的
   * 必填项，不校验被锁定尚未填写的未来阶段字段。
   */
  const handleMarkComplete = useCallback(async () => {
    if (!canMarkComplete()) {
      showToast('请先完成本阶段的必填项', 'error');
      return;
    }
    const record = await performSave('completed');
    if (record) {
      const completesIdx = phases ? phases.findIndex((p) => p.completesRecord) : -1;
      const nextPhase = phases && completesIdx >= 0 ? phases[completesIdx + 1] : undefined;
      let msg = `「${template.name}」已完成 ✨`;
      if (nextPhase?.unlockAfterDays) {
        const lockInfo = getPhaseTimeLockInfo(
          nextPhase,
          getValues(),
          initialData ? (initialData._createdAt as string) : undefined
        );
        if (lockInfo && lockInfo.unlockDate.getFullYear() < 9000) {
          msg = `已标记为完成，「${nextPhase.label}」将在 ${lockInfo.daysRemaining} 天后解锁`;
        }
      }
      showToast(msg, 'success');
      onSave?.(record);
    }
  }, [canMarkComplete, performSave, phases, template.name, getValues, initialData, showToast, onSave]);

  const goNext = () => {
    if (activeTab < template.sections.length - 1) {
      handleTabChange(activeTab + 1);
    }
  };

  const goPrev = () => {
    if (activeTab > 0) {
      handleTabChange(activeTab - 1);
    }
  };

  const activeSection = template.sections[activeTab];

  // Separate fields by priority
  const mainFields = activeSection.fields.filter(
    (f) => f.priority !== 'optional'
  );
  const optionalFields = activeSection.fields.filter(
    (f) => f.priority === 'optional'
  );

  // Clear validation errors when user modifies a field
  // 仅监听有验证错误的字段，避免全量订阅
  const errorFieldIds = validationErrors.map(e => e.fieldId);
  const watchedErrorValues = useWatch({
    control,
    name: errorFieldIds.length > 0 ? errorFieldIds : ['__placeholder__'],
    disabled: errorFieldIds.length === 0
  });

  useEffect(() => {
    if (validationErrors.length > 0 && errorFieldIds.length > 0) {
      const remaining = validationErrors.filter((_err, index) => {
        const val = watchedErrorValues[index];
        return isFieldEmpty(val);
      });
      if (remaining.length !== validationErrors.length) {
        setValidationErrors(remaining);
      }
    }
  }, [watchedErrorValues, validationErrors]);

  // Compute sections with errors for tab indicators
  const sectionsWithErrors = useMemo(() => {
    const set = new Set<number>();
    validationErrors.forEach((err) => set.add(err.sectionIndex));
    return set;
  }, [validationErrors]);

  const renderFieldItem = (field: FormField) => {
    // Check for validation errors from our custom validation
    const validationError = validationErrors.find((err) => err.fieldId === field.id);
    const fieldError = errors[field.id];
    const errorMessage = validationError
      ? (validationError.message || '此字段为必填项')
      : fieldError
        ? typeof fieldError.message === 'string'
          ? fieldError.message
          : '此字段为必填项'
        : undefined;

    // Compute watchedHintValue for fields with hintDependsOn
    const watchedHintValue = field.hintDependsOn ? watch(field.hintDependsOn) as string | undefined : undefined;

    // Get computed value for computed fields
    const computedValue = field.computed ? (watch(field.id) as string | undefined) : undefined;

    // autoOnly 计算字段：仅当公式有有效结果时锁定为自动计算显示，否则作为普通可编辑字段
    let computedActive = true;
    if (field.computed?.autoOnly) {
      const depMap: Record<string, unknown> = {};
      field.computed.dependsOn.forEach((d) => {
        depMap[d] = watch(d);
      });
      computedActive = field.computed.formula(depMap) !== '';
    }

    // Compute dynamic options for fields with optionsFrom (linked to a table column)
    let dynamicOptions: { value: string; label: string }[] | undefined;
    if (field.optionsFrom) {
      const tableData = watch(field.optionsFrom.fieldId) as Record<string, string>[] | undefined;
      if (Array.isArray(tableData)) {
        dynamicOptions = tableData
          .map((row) => row[field.optionsFrom!.columnId])
          .filter((v): v is string => !!v && v.trim() !== '')
          .map((v) => ({ value: v, label: v }));
      }
    }

    const fieldComponent =
      field.type === 'checkbox' || field.type === 'rating' || field.type === 'table' ? (
        <FieldRenderer
          key={field.id}
          field={field}
          register={register}
          error={errorMessage}
          value={watch(field.id)}
          onChange={(val) => setValue(field.id, val, { shouldDirty: true })}
          templateId={template.id}
          watchedHintValue={watchedHintValue}
          computedValue={computedValue}
          computedActive={computedActive}
          dynamicOptions={dynamicOptions}
        />
      ) : (
        <FieldRenderer
          key={field.id}
          field={field}
          register={register}
          error={errorMessage}
          templateId={template.id}
          watchedHintValue={watchedHintValue}
          computedValue={computedValue}
          computedActive={computedActive}
          dynamicOptions={dynamicOptions}
        />
      );

    return (
      <ConditionalField key={field.id} field={field} control={control}>
        {fieldComponent}
      </ConditionalField>
    );
  };

  const levelInfo = levelMap[template.id];

  // For annual review: get the year value for the sidebar
  const annualYearValue = template.id === 'annual_review' ? (watch('annual_year') as string || String(new Date().getFullYear())) : '';

  // Templates that support smart reference sidebar
  const SIDEBAR_TEMPLATES = ['weekly_review', 'monthly_review', 'annual_review'];
  const showSidebar = SIDEBAR_TEMPLATES.includes(template.id);

  return (
    <div className={`mx-auto ${template.id === 'annual_review' ? 'max-w-3xl' : 'max-w-3xl'}`}>
      {/* Smart Reference Sidebar */}
      {showSidebar && (
        <ReferenceSidebar
          templateId={template.id}
          year={template.id === 'annual_review' ? annualYearValue : undefined}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={!!toast}
          onClose={hideToast}
        />
      )}
      {/* Status bar */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900">{template.name}</h1>
          {levelInfo && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelInfo.color}`}>
              {levelInfo.level}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              保存中...
            </span>
          )}
          {saveStatus === 'saved' && lastSaved && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              已自动保存 {format(lastSaved, 'HH:mm:ss')}
            </span>
          )}
        </div>
      </div>

      {/* Quality Check Modal */}
      <QualityCheck
        isOpen={showQualityCheck}
        onClose={() => setShowQualityCheck(false)}
        recordId={currentRecordId.current}
      />

      {/* Phase indicator (only for multi-phase templates) */}
      {phases && (
        <PhaseIndicator
          phases={phases}
          currentPhaseIndex={currentPhaseIndex}
          onPhaseClick={handlePhaseClick}
          formData={getValues()}
          recordCreatedAt={initialData ? (initialData._createdAt as string) : undefined}
        />
      )}

      {/* Tab navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav
          className="flex overflow-x-auto -mb-px scrollbar-hide"
          role="tablist"
          aria-label="表单部分"
        >
          {template.sections.map((section, index) => {
            const hasErrors = sectionsWithErrors.has(index);
            const locked = isSectionLocked(index);
            const readOnly = isSectionReadOnly(index);
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={index === activeTab}
                tabIndex={index === activeTab ? 0 : -1}
                disabled={locked}
                onClick={() => handleTabChange(index)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' && index < template.sections.length - 1) {
                    handleTabChange(index + 1);
                  } else if (e.key === 'ArrowLeft' && index > 0) {
                    handleTabChange(index - 1);
                  }
                }}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition ${hasErrors ? 'relative' : ''} ${
                  locked
                    ? 'border-transparent text-gray-300 cursor-not-allowed'
                    : index === activeTab
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {(locked || readOnly) && <span className="mr-1">🔒</span>}
                {section.title}
                {hasErrors && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active section fields */}
      <form onSubmit={(e) => e.preventDefault()}>
        {/* Future phase banner */}
        {phases && getSectionPhaseIndex(phases, activeTab) > currentPhaseIndex && (() => {
          const sectionPhaseIdx = getSectionPhaseIndex(phases, activeTab);
          const sectionPhase = phases[sectionPhaseIdx];
          const timeLockInfo = sectionPhase ? getPhaseTimeLockInfo(
            sectionPhase,
            getValues(),
            initialData ? (initialData._createdAt as string) : undefined
          ) : null;

          if (timeLockInfo) {
            const unlockDateStr = timeLockInfo.unlockDate.getFullYear() < 9000
              ? timeLockInfo.unlockDate.toISOString().slice(0, 10)
              : '待确定';
            const showMarkCompleteBtn = recordStatus === 'draft' && canMarkComplete();
            return (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm p-4 rounded-lg mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">🔒</span>
                  <div>
                    <p className="font-medium">该阶段尚未解锁</p>
                    <p className="mt-1">「{sectionPhase.label}」将在 <strong>{unlockDateStr}</strong> 后解锁（还需等待 {timeLockInfo.daysRemaining} 天）</p>
                    <p className="mt-1 text-xs text-amber-600">让时间帮你获得更客观的视角，再来复盘效果更佳</p>
                  </div>
                </div>
                {showMarkCompleteBtn && (
                  <div className="mt-3 ml-8">
                    <button
                      type="button"
                      onClick={handleMarkComplete}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
                    >
                      ✅ 标记为已完成
                    </button>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className="text-sm text-gray-400 italic bg-gray-50 p-2 rounded mb-4 flex items-center gap-2">
              <span>📌</span>
              <span>此部分将在「{phases[sectionPhaseIdx]?.label}」阶段填写</span>
            </div>
          );
        })()}

        {/* Delay notice for phases with activateAfterDays */}
        {phases && (() => {
          const sectionPhaseIdx = getSectionPhaseIndex(phases, activeTab);
          const sectionPhase = phases[sectionPhaseIdx];
          if (!sectionPhase?.activateAfterDays || !sectionPhase?.activateAfterField) return null;
          const fieldValue = getValues(sectionPhase.activateAfterField) as string;
          if (!fieldValue || !fieldValue.trim()) return null;
          const parsedDate = new Date(fieldValue);
          if (isNaN(parsedDate.getTime())) return null;
          const today = new Date();
          const daysSince = Math.floor((today.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysRemaining = sectionPhase.activateAfterDays - daysSince;
          if (daysRemaining > 0) {
            return (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm p-3 rounded-lg mb-4">
                ⏰ 建议在卖出 {sectionPhase.activateAfterDays} 天后再进行复盘（距离可复盘还有 {daysRemaining} 天），让时间帮你获得更客观的视角
              </div>
            );
          } else {
            return (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded-lg mb-4">
                ✅ 已过 {sectionPhase.activateAfterDays} 天冷静期，现在是复盘的好时机！
              </div>
            );
          }
        })()}

        {/* Only render form fields if the section is NOT locked */}
        {!isSectionLocked(activeTab) && (
          <fieldset disabled={isSectionReadOnly(activeTab)} className="min-w-0 border-0 p-0 m-0">
            {/* Read-only banner */}
            {isSectionReadOnly(activeTab) && (
              <div
                className={`text-sm p-3 rounded-lg mb-4 border ${
                  recordStatus === 'completed' && !phases
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
              >
                {recordStatus === 'completed' && !phases
                  ? '✅ 此记录已完成，内容为只读，不能修改'
                  : `🔒 「${activeSection.title}」阶段已完成并锁定，只能查看，无法修改`}
              </div>
            )}

            {activeSection.repeatable ? (
              <div>
                <RepeatableSection
                  section={activeSection}
                  entries={(watch(`${activeSection.id}_entries`) as Record<string, unknown>[] | undefined) || []}
                  onChange={(newEntries) => setValue(`${activeSection.id}_entries`, newEntries, { shouldDirty: true })}
                  templateId={template.id}
                />
              </div>
            ) : (
              <CollapsibleSection key={activeSection.id} section={activeSection}>
                {activeSection.description && !activeSection.collapsedByDefault && (
                  <p className="text-sm text-gray-500 mb-4">{activeSection.description}</p>
                )}

                {/* Banner: data loaded from previous week's plan */}
                {loadedFromPrevWeek && activeSection.id === 'weekly_review' && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm p-3 rounded-lg mb-4 flex items-center gap-2">
                    <span>📋</span>
                    <span>目标已从上周复盘的「下周规划」自动加载，你可以直接编辑调整</span>
                  </div>
                )}

                {/* Required + Recommended fields */}
                {mainFields.map((field) => renderFieldItem(field))}

                {/* Optional fields in collapsible group */}
                <OptionalFieldsGroup count={optionalFields.length}>
                  {optionalFields.map((field) => renderFieldItem(field))}
                </OptionalFieldsGroup>
              </CollapsibleSection>
            )}
          </fieldset>
        )}

        {/* Navigation buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mt-6 pt-4 border-t border-gray-100 gap-3 sm:gap-0">
          <button
            type="button"
            onClick={goPrev}
            disabled={activeTab === 0}
            className={`w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            ← 上一步
          </button>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleDraftSave}
              disabled={isSectionReadOnly(activeTab)}
              className={`w-full sm:w-auto px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg transition ${
                isSectionReadOnly(activeTab)
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              保存草稿
            </button>

            {recordStatus === 'completed' && !phases ? (
              // 无阶段模板：记录已完成，整体只读
              <button
                type="button"
                disabled
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg cursor-default"
              >
                ✅ 已完成
              </button>
            ) : activeTab === template.sections.length - 1 ? (
              <button
                type="button"
                onClick={handleComplete}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
              >
                完成
              </button>
            ) : isSectionLocked(activeTab + 1) && recordStatus === 'completed' ? (
              // 记录已完成，下一阶段仍被时间锁定：显示完成状态
              <button
                type="button"
                disabled
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg cursor-default"
              >
                ✅ 已完成
              </button>
            ) : isSectionLocked(activeTab + 1) && canMarkComplete() ? (
              // completesRecord 阶段（决策后/卖出）已完成、下一阶段被时间锁定：
              // 在此即可标记记录完成，复盘阶段将在冷静期后解锁
              <button
                type="button"
                onClick={handleMarkComplete}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition"
              >
                ✅ 完成
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={isSectionLocked(activeTab + 1)}
                className={`w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg transition ${
                  isSectionLocked(activeTab + 1)
                    ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                    : 'text-white bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                下一步 →
              </button>
            )}
          </div>
        </div>
      </form>

      {/* 回看已锁定过去阶段的确认弹窗 */}
      <ConfirmDialog
        isOpen={readonlyConfirmSection !== null}
        title="该阶段已锁定"
        message={
          readonlyConfirmSection !== null ? (
            <>
              「{template.sections[readonlyConfirmSection].title}」阶段已完成并锁定，
              进入后<strong>只能查看，无法修改</strong>。确认只查看、不做任何修改吗？
            </>
          ) : (
            ''
          )
        }
        confirmText="仅查看"
        cancelText="取消"
        onConfirm={() => {
          if (readonlyConfirmSection !== null) {
            setActiveTab(readonlyConfirmSection);
            setReadonlyConfirmSection(null);
          }
        }}
        onCancel={() => setReadonlyConfirmSection(null)}
      />
    </div>
  );
};

export default FormRenderer;
