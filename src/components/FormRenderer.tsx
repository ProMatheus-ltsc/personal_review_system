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
import { getLatestCompletedRecord, getSetting } from '@/services/db';
import { useToast } from '@/hooks/useToast';
import { useInvestmentLinked } from '@/hooks/useInvestmentLinked';
import { validateRequiredFields, getSectionPhaseIndex, isFieldEmpty, getPhaseTimeLockInfo } from '@/utils/formValidation';
import type { ValidationError } from '@/utils/formValidation';
import { usePhaseLogic } from '@/hooks/usePhaseLogic';
import { levelMap } from '@/constants/templateMeta';
import { ConditionalField, OptionalFieldsGroup, CollapsibleSection, FormNavButtons, FormTabs, PhaseNotice } from './form';
import FieldRenderer from './FieldRenderer';
import QualityCheck from './QualityCheck';
import PhaseIndicator from './PhaseIndicator';
import Toast from './Toast';
import ReferenceSidebar from './ReferenceSidebar';
import RepeatableSection from './RepeatableSection';
import PositionReviewOverview from './PositionReviewOverview';
import InvestmentMergePanel, { type MergeLot } from './InvestmentMergePanel';
import { buildRoleTemplate, COOLDOWN_SETTINGS, DEFAULT_COOLDOWN_DAYS } from '@/templates/investmentChecklist';
import SellContextInline from './SellContextInline';
import ReviewContextInline from './ReviewContextInline';
import {
  ensureTradesInitialized,
  syncReviewsFromEntries,
  syncPositionReview,
  type InvestmentTrade,
} from '@/services/investmentMerge';

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
                                                     template: rawTemplate,
                                                     initialData,
                                                     recordId,
                                                     onSave,
                                                   }) => {
  /**
   * 按模板动态构建：
   * - 投资检查清单：按单据角色（record_role）动态构建模板
   *   （position：持有中 + 清仓后投资周期复盘；buy：买入前 + 买入复盘；sell：卖出决策 + 卖出复盘）
   * - 决策日志：按配置动态覆盖长期复盘阶段的等待期（cooldown_days_decision，默认 30）
   * 其余模板原样使用。等待期天数从各账户 settings 读取（可在入口页/设置面板配置）。
   */
  // 各场景复盘等待期天数（异步读取设置后生效）
  const [cooldownDays, setCooldownDays] = useState({
    buy: DEFAULT_COOLDOWN_DAYS,
    sell: DEFAULT_COOLDOWN_DAYS,
    position: DEFAULT_COOLDOWN_DAYS,
    decision: DEFAULT_COOLDOWN_DAYS,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [buy, sell, pos, decision] = await Promise.all([
        getSetting(COOLDOWN_SETTINGS.BUY),
        getSetting(COOLDOWN_SETTINGS.SELL),
        getSetting(COOLDOWN_SETTINGS.POSITION),
        getSetting(COOLDOWN_SETTINGS.DECISION),
      ]);
      if (cancelled) return;
      const toNum = (v: unknown, fallback: number): number => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
      };
      setCooldownDays({
        buy: toNum(buy, DEFAULT_COOLDOWN_DAYS),
        sell: toNum(sell, DEFAULT_COOLDOWN_DAYS),
        position: toNum(pos, DEFAULT_COOLDOWN_DAYS),
        decision: toNum(decision, DEFAULT_COOLDOWN_DAYS),
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const template = useMemo(() => {
    if (rawTemplate.id === 'investment_checklist') {
      const role = initialData?.record_role as string | undefined;
      if (role === 'buy') return buildRoleTemplate('buy', cooldownDays.buy);
      if (role === 'sell') return buildRoleTemplate('sell', cooldownDays.sell);
      if (role === 'position') return buildRoleTemplate('position', cooldownDays.position);
      return rawTemplate;
    }
    // 决策日志：动态覆盖长期复盘阶段的等待期（配置化，默认 30 天）
    if (rawTemplate.id === 'decision_log' && rawTemplate.phases) {
      const phases = rawTemplate.phases.map((p) =>
          p.id === 'long_term' ? { ...p, unlockAfterDays: cooldownDays.decision } : p
      );
      return { ...rawTemplate, phases };
    }
    return rawTemplate;
  }, [rawTemplate, initialData?.record_role, cooldownDays]);

  // 投资检查清单单据角色（用于保存联动与汇总展示）
  const recordRole = useMemo(() => {
    if (rawTemplate.id !== 'investment_checklist') return undefined;
    const role = initialData?.record_role as string | undefined;
    if (role === 'position' || role === 'buy' || role === 'sell') return role as 'position' | 'buy' | 'sell';
    return undefined;
  }, [rawTemplate.id, initialData?.record_role]);

  const [activeTab, setActiveTab] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [loadedFromPrevWeek, setLoadedFromPrevWeek] = useState(false);
  /** 是否已经对只读阶段回看做过一次 Toast 提示（后续不再重复弹） */
  const [readonlyToastShown, setReadonlyToastShown] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const { save } = useSaveRecord();
  const currentRecordId = useRef(recordId || uuidv4());
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build default values from template fields
  const computedDefaults = useCallback(() => {
    if (initialData) {
      // 投资检查清单：幂等初始化 Trade + Review 三层结构（兼容旧单据）
      if (template.id === 'investment_checklist') {
        const initialized = ensureTradesInitialized(initialData);
        const defaults: Record<string, any> = { ...initialData, ...initialized };
        // 对空白日期字段补默认值（auto_today），确保复盘日期、卖出日期等自动填入今天
        const now = new Date();
        template.sections.forEach((s) => {
          if (s.repeatable) return;
          s.fields.forEach((f) => {
            if (f.type !== 'date' || f.defaultValue === undefined) return;
            const val = defaults[f.id];
            if (val === undefined || val === null || String(val).trim() === '') {
              defaults[f.id] = resolveDefaultValue(f.defaultValue, now);
            }
          });
        });
        return defaults;
      }
      // 编辑已有记录：对「空白日期字段」补默认值（auto_today / auto_week_start / auto_week_end）。
      // 保证已解锁的复盘日期（买入/卖出/投资周期复盘）自动填入今天，
      // 周复盘开始/结束日期自动填入本周；已有值不覆盖。
      const defaults: Record<string, any> = { ...initialData };
      const now = new Date();
      template.sections.forEach((s) => {
        if (s.repeatable) return;
        s.fields.forEach((f) => {
          if (f.type !== 'date' || f.defaultValue === undefined) return;
          const val = defaults[f.id];
          if (val === undefined || val === null || String(val).trim() === '') {
            defaults[f.id] = resolveDefaultValue(f.defaultValue, now);
          }
        });
      });
      return defaults;
    }
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
    formState: { errors, isDirty },
  } = useForm({
    defaultValues: computedDefaults(),
  });

  // Warn user before closing/navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && saveStatus !== 'saved') {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, saveStatus]);

  // === Computed fields logic ===
  const computedFields = useMemo(() => {
    const fields: { id: string; dependsOn: string[]; formula: (v: Record<string, unknown>) => string; placeholder?: string; errorText?: string }[] = [];
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
      setValue(cf.id, result, { shouldDirty: false });
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

  /** 构建 FormRecord：从当前表单值组装记录（保留初始 createdAt，更新 updatedAt） */
  const buildRecord = useCallback(
      (status: 'draft' | 'completed'): FormRecord => {
        const now = new Date().toISOString();
        const data = getValues();
        let title = `${template.name} - ${format(new Date(), 'yyyy-MM-dd')}`;
        if (template.id === 'investment_checklist') {
          const role = data.record_role as string | undefined;
          const code = String(data.buy_company_name ?? '').trim();
          if (role === 'buy' && code) {
            title = `投资检查清单 - ${format(new Date(), 'yyyy-MM-dd')} - ${code} 买入`;
          } else if (role === 'sell' && code) {
            title = `投资检查清单 - ${format(new Date(), 'yyyy-MM-dd')} - ${code} 卖出`;
          } else if (role === 'position' && code) {
            title = `投资检查清单 - ${code} 持有`;
          }
        }
        return {
          id: currentRecordId.current,
          templateId: template.id,
          title,
          data,
          status,
          createdAt: initialData ? (initialData._createdAt as string) || now : now,
          updatedAt: now,
        };
      },
      [getValues, template, initialData]
  );

  // Track record status from initial data
  const [recordStatus, setRecordStatus] = useState<'draft' | 'completed'>(
      initialData?._status as 'draft' | 'completed' || 'draft'
  );

  // 投资清单：买卖单 ↔ 仓位单联动（关联仓位单加载、卖出单平均买入上下文注入、保存后汇总联动）
  const positionIdWatch = watch('position_record_id') as string | undefined;
  const { linkedPosition, linkSaveAfterSave } = useInvestmentLinked({
    templateId: template.id,
    recordRole,
    positionId: positionIdWatch,
    positionCooldownDays: cooldownDays.position,
    getValues,
    setValue,
    showToast,
  });

  /** 投资清单保存前：同步卖出复盘 → merged_reviews（卖出单=顶层字段自动关联；仓位单/旧模型=entries 条目）
   *  + position_review_* → merged_position_review（仅仓位单/旧模型） */
  const syncInvestmentReviewLayers = () => {
    if (template.id !== 'investment_checklist') return;
    const currentFormData = getValues();
    let synced = syncReviewsFromEntries(currentFormData);
    if (!recordRole || recordRole === 'position') {
      synced = syncPositionReview(synced);
      if (synced.merged_position_review !== undefined) {
        setValue('merged_position_review', synced.merged_position_review, { shouldDirty: false });
      }
    }
    if (Array.isArray(synced.merged_reviews)) {
      setValue('merged_reviews', synced.merged_reviews, { shouldDirty: false });
    }
  };

  const performSave = useCallback(
      async (status: 'draft' | 'completed', { skipMerge = false }: { skipMerge?: boolean } = {}) => {
        try {
          setSaveStatus('saving');
          // 首次标记完成时写入完成日期，作为复盘阶段解锁的基准
          if (status === 'completed' && isFieldEmpty(getValues('_completedAt'))) {
            setValue('_completedAt', new Date().toISOString().slice(0, 10), { shouldDirty: false });
          }
          // 已完成记录被重新编辑并自动保存时保持 completed 状态，避免被草稿保存降级
          const finalStatus: 'draft' | 'completed' =
              status === 'completed' || recordStatus === 'completed' ? 'completed' : 'draft';

          // 投资检查清单：保存前同步 Trade Review / Position Review 结构化层
          syncInvestmentReviewLayers();

          const record = buildRecord(finalStatus);
          await save(record);

          // 投资清单：保存后联动仓位单（买入单完成创建仓位单 / 卖出单刷新汇总）——
          // 30 秒自动保存（skipMerge=true）不触发，避免填写中被打断
          await linkSaveAfterSave(record, skipMerge);

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
      [buildRecord, save, recordStatus, getValues, setValue, template, linkSaveAfterSave]
  );

  // Auto-save every 30 seconds (skip fully read-only completed records)
  useEffect(() => {
    if (recordStatus === 'completed' && !phases) return;
    autoSaveRef.current = setInterval(() => {
      performSave('draft', { skipMerge: true });
    }, 30000);

    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
      }
    };
  }, [performSave, recordStatus, phases]);

  // 多阶段模板：阶段计算 / 锁定判断 / 完成判定 / 阶段点击导航（拆分自本组件，见 usePhaseLogic）
  const {
    currentPhaseIndex,
    visitedMaxPhase,
    setVisitedMaxPhase,
    isSectionLocked,
    isSectionReadOnly,
    canMarkComplete,
    handlePhaseClick,
    getLockedTabHint,
  } = usePhaseLogic({
    phases,
    templateId: template.id,
    templateSections: template.sections,
    control,
    getValues,
    setValue,
    initialData,
    recordStatus,
    showToast,
    onNavigateSave: () => {
      performSave('draft');
    },
    setActiveTab,
  });

  // Save on tab switch
  const handleTabChange = useCallback(
      (index: number) => {
        // Prevent navigating to a locked section
        if (isSectionLocked(index)) {
          // 投资清单：锁定复盘 tab 点击时提示剩余解锁天数（锁页面体验）
          if (template.id === 'investment_checklist') {
            const hint = getLockedTabHint(index);
            if (hint) {
              showToast(hint, 'info');
              return;
            }
          }
          return;
        }
        // 回看已完成的只读阶段：允许直接进入，首次时 Toast 提示一次
        if (phases && isSectionReadOnly(index) && !isSectionReadOnly(activeTab) && !readonlyToastShown) {
          setReadonlyToastShown(true);
          showToast('该阶段已完成，仅供查看、无法修改', 'info');
        }
        // 进入更高阶段后，之前的阶段才锁定
        if (phases) {
          const targetPhase = getSectionPhaseIndex(phases, index);
          if (targetPhase > visitedMaxPhase) setVisitedMaxPhase(targetPhase);
        }
        performSave('draft');
        setActiveTab(index);
      },
      [performSave, isSectionLocked, phases, isSectionReadOnly, activeTab, visitedMaxPhase, readonlyToastShown, showToast]
  );

  // Handle phase click - navigate to the first section of the selected phase
  // （实现见 usePhaseLogic.handlePhaseClick）

  /** 手动保存草稿：调用 performSave 并提示（底部「保存草稿」按钮） */
  const handleDraftSave = async () => {
    const record = await performSave('draft');
    if (record) {
      showToast('草稿已保存', 'info');
      onSave?.(record);
    }
  };

  /** 完成提交：先校验全模板必填字段，失败跳转到首个错误 section，通过则标记完成 */
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
          msg = `已标记为完成，「${nextPhase.label}」将在 ${lockInfo.daysRemaining} 天后开放`;
        }
      }
      showToast(msg, 'success');
      onSave?.(record);
    }
  }, [canMarkComplete, performSave, phases, template.name, getValues, initialData, showToast, onSave]);

  /** 下一步：切换到后一个 section tab（触发保存） */
  const goNext = () => {
    if (activeTab < template.sections.length - 1) {
      handleTabChange(activeTab + 1);
    }
  };

  /** 上一步：切换到前一个 section tab（触发保存） */
  const goPrev = () => {
    if (activeTab > 0) {
      handleTabChange(activeTab - 1);
    }
  };

  // 投资清单：是否已清仓（控制投资周期复盘 tab 的显示）— 提前声明，供后续 useEffect 使用
  const soldOutWatch = watch('sold_out') as boolean | undefined;

  const activeSection = template.sections[activeTab];

  // 投资清单：清仓撤销后 Position Review tab 消失 → 自动切回卖出复盘 tab
  useEffect(() => {
    if (template.id === 'investment_checklist' && activeSection?.id === 'position_review' && !soldOutWatch) {
      const reviewSectionIdx = template.sections.findIndex((s) => s.id === 'sell_review');
      if (reviewSectionIdx >= 0) setActiveTab(reviewSectionIdx);
    }
  }, [template.id, template.sections, activeSection, soldOutWatch]);

  // Separate fields by priority
  const mainFields = activeSection.fields.filter(
      (f) => f.priority !== 'optional'
  );

  // 「更多选项(N)」计数要与实际渲染一致：optional 字段若带 condition 且当前不满足
  // （如 buy_strategy_other 依赖 buy_strategy_tag 选「其他」），会被 ConditionalField 隐藏，
  // 因此计数时需排除这些条件不满足的字段。这里响应式监听所有 optional 字段的 condition 依赖值。
  const optionalConditionDeps = useMemo(() => {
    const deps: string[] = [];
    activeSection.fields.forEach((f) => {
      if (f.priority === 'optional' && f.condition?.dependsOn && !deps.includes(f.condition.dependsOn)) {
        deps.push(f.condition.dependsOn);
      }
    });
    return deps;
  }, [activeSection]);

  const watchedOptionalDeps = useWatch({
    control,
    name: optionalConditionDeps.length > 0 ? optionalConditionDeps : ['__optional_placeholder__'],
    disabled: optionalConditionDeps.length === 0,
  });

  const optionalFields = useMemo(
      () =>
          activeSection.fields.filter((f) => {
            if (f.priority !== 'optional') return false;
            if (!f.condition) return true;
            // useWatch 数组 name 返回按 name 顺序的值数组 → 按 dependsOn 索引取值
            const idx = optionalConditionDeps.indexOf(f.condition.dependsOn);
            const depValue = idx >= 0 ? (watchedOptionalDeps as unknown[])[idx] : undefined;
            const showWhen = f.condition.showWhen;
            if (Array.isArray(showWhen)) return showWhen.includes(depValue as string);
            return depValue === showWhen;
          }),
      [activeSection, watchedOptionalDeps, optionalConditionDeps]
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

  /**
   * 渲染单个字段：合并 RHF 校验错误与自定义验证错误，处理条件字段/计算字段/
   * 动态选项/条件提示，返回带 key 的受控或非受控表单控件
   */
  /** 投资清单买入/卖出单：股票代码只读展示（代码已在新建入口确定，避免误改导致仓位关联错乱） */
  const renderReadonlyCodeField = () => (
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1 text-gray-700">
          投资标的（股票代码）<span className="text-red-500 ml-1">*</span>
        </label>
        <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900 font-medium">
          {getValues('buy_company_name') || '-'}
        </div>
        <p className="text-xs mt-1 text-gray-400">
          💡 股票代码已在新建入口选择，如需变更请返回新建入口重新创建
        </p>
      </div>
  );

  /** 合并 RHF 校验错误与自定义验证错误，返回首个错误文案 */
  const computeFieldError = (field: FormField): string | undefined => {
    const validationError = validationErrors.find((err) => err.fieldId === field.id);
    const fieldError = errors[field.id];
    return validationError
        ? (validationError.message || '此字段为必填项')
        : fieldError
            ? typeof fieldError.message === 'string'
                ? fieldError.message
                : '此字段为必填项'
            : undefined;
  };

  /** 计算 optionsFrom 动态选项（从表格列取值去重） */
  const computeDynamicOptions = (field: FormField): { value: string; label: string }[] | undefined => {
    if (!field.optionsFrom) return undefined;
    const tableData = watch(field.optionsFrom.fieldId) as Record<string, string>[] | undefined;
    if (!Array.isArray(tableData)) return undefined;
    return tableData
        .map((row) => row[field.optionsFrom!.columnId])
        .filter((v): v is string => !!v && v.trim() !== '')
        .map((v) => ({ value: v, label: v }));
  };

  /**
   * 渲染单个字段：合并 RHF 校验错误与自定义验证错误，处理条件字段/计算字段/
   * 动态选项/条件提示，返回带 key 的受控或非受控表单控件
   */
  const renderFieldItem = (field: FormField) => {
    // 买入单/卖出单：股票代码只读展示
    if (
        template.id === 'investment_checklist' &&
        (recordRole === 'buy' || recordRole === 'sell') &&
        field.id === 'buy_company_name'
    ) {
      return renderReadonlyCodeField();
    }

    const errorMessage = computeFieldError(field);
    // hintDependsOn：切换币种时联动提示
    const watchedHintValue = field.hintDependsOn ? watch(field.hintDependsOn) as string | undefined : undefined;
    // 计算字段：读当前已计算值
    const computedValue = field.computed ? (watch(field.id) as string | undefined) : undefined;
    // optionsFrom：表格列动态选项
    const dynamicOptions = computeDynamicOptions(field);

    // checkbox/rating/table 需要受控传值，其余字段由 RHF register 接管
    const isControlledType = field.type === 'checkbox' || field.type === 'rating' || field.type === 'table';
    const fieldComponent = (
        <FieldRenderer
            key={field.id}
            field={field}
            register={register}
            error={errorMessage}
            templateId={template.id}
            watchedHintValue={watchedHintValue}
            computedValue={computedValue}
            dynamicOptions={dynamicOptions}
            {...(isControlledType
                ? {
                    value: watch(field.id),
                    onChange: (val: unknown) => setValue(field.id, val, { shouldDirty: true }),
                  }
                : {})}
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

  // 投资清单：merged_trades 派生（投资周期概览交易笔数等）
  const mergedTradesWatch = watch('merged_trades') as InvestmentTrade[] | undefined;

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

        {/* 投资清单：持仓明细面板（仓位单展示同代码所有买入/卖出明细，表格形式）
            数据由 syncPositionFromLinked 从关联买入/卖出单派生 */}
        {template.id === 'investment_checklist' && recordRole === 'position' && (
            <InvestmentMergePanel
                stockCode={(watch('buy_company_name') as string) || ''}
                mergedBuyLots={watch('merged_buy_lots') as MergeLot[] | undefined}
                weightedBuy={watch('buy_price') as string | undefined}
                totalBuyQty={watch('merged_total_qty') as string | number | undefined}
                mergedSellLots={watch('merged_sell_lots') as MergeLot[] | undefined}
                weightedSell={watch('sell_exit_price') as string | undefined}
                totalSellQty={watch('merged_total_sell_qty') as string | number | undefined}
                soldOut={watch('sold_out') as boolean | undefined}
                lastSellDate={watch('last_sell_date') as string | undefined}
            />
        )}

        {/* Tab navigation（独立组件，含隐藏/锁定/错误角标/键盘切换） */}
        <FormTabs
            sections={template.sections}
            activeTab={activeTab}
            shouldHide={(index) =>
                template.id === 'investment_checklist' &&
                template.sections[index].id === 'position_review' &&
                !soldOutWatch
            }
            isLocked={isSectionLocked}
            isReadOnly={isSectionReadOnly}
            hasErrors={(index) => sectionsWithErrors.has(index)}
            onTabChange={handleTabChange}
        />

        {/* Active section fields */}
        <form onSubmit={(e) => e.preventDefault()}>
          {/* 阶段状态提示：未来阶段锁页面 + 冷静期延迟提示（独立组件） */}
          <PhaseNotice
              phases={phases}
              activeTab={activeTab}
              currentPhaseIndex={currentPhaseIndex}
              recordStatus={recordStatus}
              canMarkComplete={canMarkComplete}
              onMarkComplete={handleMarkComplete}
              getValues={getValues}
              recordCreatedAt={initialData ? (initialData._createdAt as string) : undefined}
          />

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
                          : `🔒 「${activeSection.title}」已完成，内容仅供查看，无法修改`}
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

                      {/* 投资清单：卖出阶段内联持仓上下文（平均成本/剩余持仓/实时盈亏，数据来自关联仓位单） */}
                      {template.id === 'investment_checklist' && activeSection.id === 'when_selling' && (
                          <SellContextInline
                              buyPrice={linkedPosition?.data.buy_price as string | number | undefined}
                              totalQty={linkedPosition?.data.merged_total_qty as string | number | undefined}
                              sellQty={linkedPosition?.data.merged_total_sell_qty as string | number | undefined}
                              sellPrice={watch('sell_exit_price')}
                              sellQuantity={watch('sell_quantity')}
                              currency={(linkedPosition?.data.buy_currency as string) || 'CNY'}
                          />
                      )}

                      {/* 投资清单：卖出复盘量化对比（目标价/止损/持有周期 vs 实际，买入预期来自关联仓位单） */}
                      {template.id === 'investment_checklist' && activeSection.id === 'sell_review' && (
                          <ReviewContextInline
                              buyPrice={linkedPosition?.data.buy_price as string | number | undefined}
                              sellPrice={watch('sell_exit_price')}
                              targetPrice={linkedPosition?.data.buy_target_price_num as string | number | undefined}
                              stopLoss={linkedPosition?.data.buy_stop_loss_price as string | number | undefined}
                              buyDate={linkedPosition?.data.buy_date as string | undefined}
                              lastSellDate={watch('sell_date') as string | undefined}
                              timeframe={linkedPosition?.data.buy_timeframe as string | undefined}
                          />
                      )}

                      {/* 投资清单：投资周期复盘 — 整体投资概览（独立组件，数据来自仓位单自身） */}
                      {template.id === 'investment_checklist' && activeSection.id === 'position_review' && (
                          <PositionReviewOverview
                              buyPrice={parseFloat(String(watch('buy_price') ?? ''))}
                              sellPrice={parseFloat(String(watch('sell_exit_price') ?? ''))}
                              totalQty={parseFloat(String(watch('merged_total_qty') ?? watch('buy_quantity') ?? ''))}
                              buyDate={watch('buy_date') as string | undefined}
                              lastSellDate={watch('last_sell_date') as string | undefined}
                              trades={mergedTradesWatch}
                          />
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

          {/* Navigation buttons（独立组件，逻辑集中在 FormNavButtons） */}
          <FormNavButtons
              activeTab={activeTab}
              totalSections={template.sections.length}
              recordStatus={recordStatus}
              recordRole={recordRole}
              templateId={template.id}
              hasPhases={!!phases}
              canMarkComplete={canMarkComplete}
              isSectionLocked={isSectionLocked}
              isSectionReadOnly={isSectionReadOnly}
              onPrev={goPrev}
              onNext={goNext}
              onSaveDraft={handleDraftSave}
              onComplete={handleComplete}
              onMarkComplete={handleMarkComplete}
          />
        </form>

      </div>
  );
};

export default FormRenderer;
