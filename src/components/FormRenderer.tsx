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
import { getLatestCompletedRecord, getAllRecords, getRecord, getSetting } from '@/services/db';
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
import InvestmentMergePanel, { type MergeLot, type MergedSnapshot } from './InvestmentMergePanel';
import { buildRoleTemplate } from '@/templates/investmentChecklist';
import SellContextInline from './SellContextInline';
import ReviewContextInline from './ReviewContextInline';
import {
  mergeSameCodeBuys,
  applySellBatch,
  undoLastSellBatch,
  ensureTradesInitialized,
  syncReviewsFromEntries,
  syncPositionReview,
  isTradeReviewedInEntries,
  syncPositionFromLinked,
  getLinkedRecords,
  PHASE_REVIEW,
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
   * 投资检查清单按单据角色（record_role）动态构建模板：
   * - position：仓位单（持有中复盘 + 清仓后投资周期复盘）
   * - buy：买入复盘单（买入前检查 + 30 天买入复盘）
   * - sell：卖出复盘单（卖出决策 + 30 天卖出复盘）
   * 其余模板原样使用。
   */
  const template = useMemo(() => {
    if (rawTemplate.id !== 'investment_checklist') return rawTemplate;
    const role = initialData?.record_role as string | undefined;
    if (role === 'position' || role === 'buy' || role === 'sell') {
      return buildRoleTemplate(role);
    }
    return rawTemplate;
  }, [rawTemplate, initialData?.record_role]);

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
  const [initialTabSet, setInitialTabSet] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [loadedFromPrevWeek, setLoadedFromPrevWeek] = useState(false);
  /** 是否已经对只读阶段回看做过一次 Toast 提示（后续不再重复弹） */
  const [readonlyToastShown, setReadonlyToastShown] = useState(false);
  /** 测试模式：跳过 30 天冷静期（复盘立即解锁） */
  const [skipCooldown, setSkipCooldown] = useState(false);

  // 读取 test_mode 设置（测试模式下跳过复盘冷静期）
  useEffect(() => {
    let cancelled = false;
    getSetting('test_mode').then((v) => {
      if (!cancelled) setSkipCooldown(v === 'true');
    });
    return () => { cancelled = true; };
  }, []);
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
    if (initialData) {
      // 投资检查清单：幂等初始化 Trade + Review 三层结构（兼容旧单据）
      if (template.id === 'investment_checklist') {
        const initialized = ensureTradesInitialized(initialData);
        return { ...initialData, ...initialized };
      }
      return initialData;
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
    return getCurrentPhaseIndex(phases, formData, template.sections, createdAt, { skipCooldown });
  }, [phases, phaseCompletionFields, watchedPhaseValues, repeatableEntriesKeys, watchedRepeatableEntries, template.sections, initialData, skipCooldown]);

  // Auto-navigate to current phase's first section on initial load (for existing records)
  useEffect(() => {
    if (!initialTabSet && phases && initialData) {
      const firstSectionIdx = phases[currentPhaseIndex]?.sectionIndices[0];
      if (firstSectionIdx !== undefined && firstSectionIdx > 0) {
        setActiveTab(firstSectionIdx);
      }
      // 编辑已有记录时，直接以当前阶段作为已进入的最高阶段（之前的阶段锁定）
      // 特殊处理：部分卖出后的记录（sell_status=partial），虽然 currentPhaseIndex 可能在卖出阶段，
      // 但持有阶段应该保持可编辑（用户需要为剩余持仓添加持有检查），因此 visitedMaxPhase 不超过持有阶段
      let effectiveMaxPhase = currentPhaseIndex;
      if (initialData.sell_status === 'partial' && template.id === 'investment_checklist') {
        const holdingPhaseIdx = phases.findIndex((p) => p.id === 'holding');
        if (holdingPhaseIdx >= 0 && currentPhaseIndex > holdingPhaseIdx) {
          effectiveMaxPhase = holdingPhaseIdx;
        }
      }
      setVisitedMaxPhase(effectiveMaxPhase);
      // 部分卖出/撤销后的记录，卖出日期被清空了，重新打开时默认填充今天日期
      if (template.id === 'investment_checklist' && !initialData.sell_date) {
        setValue('sell_date', new Date().toISOString().slice(0, 10), { shouldDirty: false });
      }
      setInitialTabSet(true);
    } else if (!initialTabSet) {
      setInitialTabSet(true);
    }
  }, [initialTabSet, phases, initialData, currentPhaseIndex, template.id, setValue]);

  /** 构建 FormRecord：从当前表单值组装记录（保留初始 createdAt，更新 updatedAt） */
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

  /** 将合并后的数据同步回表单，保证界面与库中一致（含卖出字段清空） */
  const syncMergedData = useCallback(
      (data: Record<string, unknown>) => {
        (
            [
              'buy_price',
              'merged_buy_lots',
              'merged_total_qty',
              'sell_exit_price',
              'sell_date',
              'sell_quantity',
              'sell_reason',
              'sell_reason_other',
              'sell_emotion_state',
              'sell_check_reason',
              'sell_check_rebuy',
              'merged_sell_lots',
              'merged_total_sell_qty',
              'last_sell_date',
              'sold_out',
              'remaining_qty',
              'sell_status',
              'merged_snapshots',
              'parent_position_id',
              '_sell_batch_id',
              // Trade + Review 三层模型字段
              'merged_trades',
              'merged_reviews',
              'merged_position_review',
            ] as const
        ).forEach((k) => {
          if (k in data) setValue(k, data[k], { shouldDirty: false });
        });
      },
      [setValue]
  );

  const performSave = useCallback(
      async (status: 'draft' | 'completed', { skipMerge = false }: { skipMerge?: boolean } = {}) => {
        try {
          setSaveStatus('saving');
          // 首次标记完成时写入完成日期，作为复盘阶段 30 天解锁的基准
          if (status === 'completed' && isFieldEmpty(getValues('_completedAt'))) {
            setValue('_completedAt', new Date().toISOString().slice(0, 10), { shouldDirty: false });
          }
          // 已完成记录被重新编辑并自动保存时保持 completed 状态，避免被草稿保存降级
          const finalStatus: 'draft' | 'completed' =
              status === 'completed' || recordStatus === 'completed' ? 'completed' : 'draft';

          // 投资检查清单：保存前同步 sell_review_entries → merged_reviews（Trade Review 层）
          // + position_review_* → merged_position_review（Position Review 层，仅仓位单/旧模型）
          if (template.id === 'investment_checklist') {
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
          }

          const record = buildRecord(finalStatus);
          await save(record);

          // 投资清单：保存后处理
          // - 新模型（record_role）：买入单/卖出单独立，保存后联动刷新关联仓位单的汇总
          // - 旧模型（无 role）：保留自动合并逻辑（同代码开放持仓合并 / 卖出批次拆分）
          if (template.id === 'investment_checklist' && !skipMerge) {
            const code = String(record.data.buy_company_name ?? '').trim();
            if (code) {
              if (recordRole === 'buy' || recordRole === 'sell') {
                // 新模型：联动更新关联仓位单（merged_buy_lots / merged_sell_lots / 剩余持仓 / 清仓状态）
                const positionId = record.data.position_record_id as string | undefined;
                if (positionId) {
                  const position = await getRecord(positionId);
                  if (position) {
                    const allRecords = await getAllRecords('investment_checklist');
                    const { buyRecords, sellRecords } = getLinkedRecords(position, allRecords);
                    const updated = syncPositionFromLinked(position, buyRecords, sellRecords);
                    await save(updated);
                    if (recordRole === 'sell' && updated.data.sold_out === true) {
                      showToast(
                          `仓位 ${code} 已清仓，30 天后可进行投资周期复盘`,
                          'success'
                      );
                    }
                  }
                }
              } else if (recordRole === 'position') {
                // 仓位单保存：汇总由 syncPositionFromLinked 维护（编辑买入信息不会改变汇总）
                // 无需额外处理
              } else {
                // 旧模型（无 record_role）：保留原有合并逻辑
                // 卖出拆分并入：填写了卖出 → 本笔卖出拆成批次立即并入当前单据
                // 已全部卖出（sold_out）的单据顶层卖出字段仍保留加权卖出价，
                // 复盘阶段的后续自动保存不应再当作"新的一笔卖出"重新校验，否则会
                // 反复触发"超过剩余持仓"的误报
                if (!isFieldEmpty(record.data.sell_exit_price) && record.data.sold_out !== true) {
                  const res = await applySellBatch(record);
                  if (res?.error) {
                    showToast(res.error, 'error');
                  } else if (res) {
                    syncMergedData(res.data);
                    if (res.soldOut) {
                      showToast(
                          `已全部卖出（${code}），加权卖出价 ${res.data.sell_exit_price ?? ''}，复盘将于最后卖出日期 30 天后解锁`,
                          'success'
                      );
                    } else {
                      // 部分卖出：单据回到持有状态，需要降级 visitedMaxPhase 以解除持有阶段的只读锁定，
                      // 让用户可以继续为剩余持仓添加新的持有检查
                      if (phases) {
                        const holdingPhaseIdx = phases.findIndex((p) => p.id === 'holding');
                        if (holdingPhaseIdx >= 0) {
                          setVisitedMaxPhase(holdingPhaseIdx);
                        }
                      }
                      showToast(
                          `已记录本次卖出（${code}），剩余持仓 ${res.remainingQty ?? 0}，可继续买入合并`,
                          'success'
                      );
                    }
                  }
                } else {
                  // 买入合并：前提是同代码且双方都是持有中的开放持仓（未清仓）
                  const res = await mergeSameCodeBuys(record);
                  if (res) {
                    syncMergedData(res.data);
                    showToast(
                        `已自动合并 ${res.merged} 份同代码买入记录（${code}），加权买入价已更新`,
                        'success'
                    );
                  }
                }
              }
            }
          }

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
      [buildRecord, save, recordStatus, getValues, setValue, template, syncMergedData, showToast]
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
  const handlePhaseClick = useCallback(
      (phaseIndex: number) => {
        if (!phases) return;
        // Don't navigate to locked phases
        if (phaseIndex > currentPhaseIndex) return;
        const firstSectionIdx = phases[phaseIndex]?.sectionIndices[0];
        if (firstSectionIdx === undefined) return;
        // 回看已完成的只读阶段：直接进入，首次 Toast 提示
        if (isSectionReadOnly(firstSectionIdx) && !isSectionReadOnly(activeTab) && !readonlyToastShown) {
          setReadonlyToastShown(true);
          showToast('该阶段已完成，仅供查看、无法修改', 'info');
        }
        // 进入更高阶段后，之前的阶段才锁定
        if (phaseIndex > visitedMaxPhase) setVisitedMaxPhase(phaseIndex);
        performSave('draft');
        setActiveTab(firstSectionIdx);
      },
      [phases, performSave, currentPhaseIndex, isSectionReadOnly, activeTab, visitedMaxPhase, readonlyToastShown, showToast]
  );

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
            initialData ? (initialData._createdAt as string) : undefined,
            { skipCooldown }
        );
        if (lockInfo && lockInfo.unlockDate.getFullYear() < 9000) {
          msg = `已标记为完成，「${nextPhase.label}」将在 ${lockInfo.daysRemaining} 天后解锁`;
        } else if (skipCooldown && nextPhase) {
          msg = `已标记为完成，「${nextPhase.label}」已解锁（测试模式跳过冷静期）`;
        }
      }
      showToast(msg, 'success');
      onSave?.(record);
    }
  }, [canMarkComplete, performSave, phases, template.name, getValues, initialData, showToast, onSave, skipCooldown]);

  /** 撤销最近一笔卖出（投资清单）：仅未复盘时可撤销 */
  const handleUndoLastSell = useCallback(async () => {
    const record = buildRecord('draft');
    const res = await undoLastSellBatch(record);
    if (res?.error) {
      showToast(res.error, 'error');
    } else if (res) {
      syncMergedData(res.data);
      // 撤销卖出后，如果不再是全部卖出状态，记录应降回 draft 以解锁卖出阶段的编辑
      if (!res.soldOut && recordStatus === 'completed') {
        setRecordStatus('draft');
      }
      // 撤销后需要降级 visitedMaxPhase：
      // - 如果仍有剩余持仓（部分卖出状态），降到持有阶段（索引1），持有和卖出都可编辑
      // - 如果完全回到未卖出状态（无任何卖出批次），同样降到持有阶段
      // - 需求：撤销后 recordStatus 降回 draft，visitedMaxPhase 降回卖出阶段，卖出 section 恢复可编辑
      //   但部分卖出场景下持有阶段也需要可编辑（用户需为剩余持仓添加持有检查）
      if (!res.soldOut && phases) {
        const holdingPhaseIdx = phases.findIndex((p) => p.id === 'holding');
        const sellingPhaseIdx = phases.findIndex((p) => p.completesRecord);
        // 有剩余持仓：降到持有阶段（持有+卖出都可编辑）
        // 无剩余卖出批次（完全撤销）：也降到持有阶段
        const targetPhase = (res.remainingQty !== undefined && res.remainingQty > 0)
            ? (holdingPhaseIdx >= 0 ? holdingPhaseIdx : sellingPhaseIdx)
            : (sellingPhaseIdx >= 0 ? sellingPhaseIdx : holdingPhaseIdx);
        if (targetPhase >= 0 && visitedMaxPhase > targetPhase) {
          setVisitedMaxPhase(targetPhase);
        }
      }
      showToast('已撤销最近一笔卖出', 'success');
    }
  }, [buildRecord, syncMergedData, showToast]);

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

  /**
   * 渲染单个字段：合并 RHF 校验错误与自定义验证错误，处理条件字段/计算字段/
   * 动态选项/条件提示，返回带 key 的受控或非受控表单控件
   */
  const renderFieldItem = (field: FormField) => {
    // 买入单/卖出单：股票代码已在新建入口确定 → 自动填充并只读展示（避免误改导致仓位关联错乱）
    if (
        template.id === 'investment_checklist' &&
        (recordRole === 'buy' || recordRole === 'sell') &&
        field.id === 'buy_company_name'
    ) {
      return (
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
    }
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

  // 投资清单：是否已复盘（Trade 层优先 → entries 回退）→ 控制撤销卖出按钮
  const sellReviewEntries = watch('sell_review_entries') as Record<string, unknown>[] | undefined;
  const mergedTradesWatch = watch('merged_trades') as InvestmentTrade[] | undefined;
  const mergedReviewsWatch = watch('merged_reviews') as Record<string, unknown>[] | undefined;
  const sellReviewed = (() => {
    // Trade 层优先：检查 merged_reviews 中是否有 lesson 非空
    if (Array.isArray(mergedReviewsWatch) && mergedReviewsWatch.some((rv) => !isFieldEmpty(rv.lesson))) {
      return true;
    }
    // 回退到表单 entries
    return isTradeReviewedInEntries(sellReviewEntries || []);
  })();
  const mergedSellLotsWatch = watch('merged_sell_lots') as unknown[] | undefined;
  const hasSellLots = Array.isArray(mergedSellLotsWatch) && mergedSellLotsWatch.length > 0;

  // 投资清单：SELL trades 选项（用于 sell_review_trade_id select 动态注入）
  // 每笔卖出交易生成一个选项，格式：卖出日期 · 价格 · 数量
  const sellTradeOptions = useMemo(() => {
    if (template.id !== 'investment_checklist' || !Array.isArray(mergedTradesWatch)) return undefined;
    const sellTrades = mergedTradesWatch.filter((t) => t.type === 'SELL');
    if (sellTrades.length === 0) return undefined;
    return sellTrades.map((t) => ({
      value: t.id,
      label: `${t.date || '未填日期'} · ${t.price ?? '-'} · ${t.qty ?? '-'}股${t.reason ? `（${t.reason}）` : ''}`,
    }));
  }, [template.id, mergedTradesWatch]);

  // 投资清单：可重复段字段选项覆盖（sell_review_trade_id ← SELL trades）
  const repeatableFieldOptions = useMemo(() => {
    if (!sellTradeOptions) return undefined;
    return { sell_review_trade_id: sellTradeOptions };
  }, [sellTradeOptions]);

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
                skipCooldown={skipCooldown}
            />
        )}

        {/* 投资清单：仓位汇总面板（同股票代码所有买入/卖出明细，表格形式）
            - 新模型仓位单（record_role=position）：展示从关联买入单/卖出单派生的汇总
            - 旧模型（无 role）：展示合并后的持仓/卖出明细
            买入单/卖出单本身不显示此面板（各自展示自己的决策字段） */}
        {template.id === 'investment_checklist' && (!recordRole || recordRole === 'position') && (
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
                reviewed={sellReviewed}
                onUndoLastSell={!recordRole && hasSellLots ? handleUndoLastSell : undefined}
                mergedSnapshots={watch('merged_snapshots') as MergedSnapshot[] | undefined}
                emptyText={
                  !recordRole && currentPhaseIndex >= 1 && currentPhaseIndex < PHASE_REVIEW
                      ? '📌 同代码且都在持有阶段的买入记录会自动合并进当前单据（加权买入价 + 逐笔明细）；部分卖出的剩余持仓仍可合并新买入，全部卖出后以最后卖出日期为准 30 天解锁复盘'
                      : undefined
                }
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
              // 投资清单：投资周期复盘 tab 仅在清仓后显示
              if (template.id === 'investment_checklist' && section.id === 'position_review' && !soldOutWatch) {
                return null;
              }
              // 买入单/卖出单：复盘 tab（buy_review/sell_review）在未解锁（30 天未到）时隐藏，
              // 避免出现「多余加锁页面」；30 天后自动出现
              if (
                template.id === 'investment_checklist' &&
                (recordRole === 'buy' || recordRole === 'sell') &&
                (section.id === 'buy_review' || section.id === 'sell_review') &&
                isSectionLocked(index)
              ) {
                return null;
              }
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
                    {locked && <span className="mr-1">🔒</span>}
                    {readOnly && !locked && <span className="mr-1 opacity-70">✓</span>}
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
                initialData ? (initialData._createdAt as string) : undefined,
                { skipCooldown }
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
                          fieldOptionsOverride={repeatableFieldOptions}
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

                      {/* 投资清单：卖出阶段内联持仓上下文（加权成本/剩余持仓/实时盈亏） */}
                      {template.id === 'investment_checklist' && activeSection.id === 'when_selling' && (
                          <SellContextInline
                              buyPrice={watch('buy_price')}
                              totalQty={watch('merged_total_qty') as string | number | undefined}
                              sellQty={watch('merged_total_sell_qty') as string | number | undefined}
                              sellPrice={watch('sell_exit_price')}
                              sellQuantity={watch('sell_quantity')}
                              currency={(watch('buy_currency') as string) || 'CNY'}
                          />
                      )}

                      {/* 投资清单：卖出复盘量化对比（目标价/止损/持有周期 vs 实际） */}
                      {template.id === 'investment_checklist' && activeSection.id === 'sell_review' && (
                          <ReviewContextInline
                              buyPrice={watch('buy_price')}
                              sellPrice={watch('sell_exit_price')}
                              targetPrice={watch('buy_target_price_num')}
                              stopLoss={watch('buy_stop_loss_price')}
                              buyDate={watch('buy_date') as string | undefined}
                              lastSellDate={watch('last_sell_date') as string | undefined}
                              timeframe={watch('buy_timeframe') as string | undefined}
                          />
                      )}

                      {/* 投资清单：投资周期复盘 — 整体投资概览 */}
                      {template.id === 'investment_checklist' && activeSection.id === 'position_review' && (() => {
                        const buyPrice = parseFloat(String(watch('buy_price') ?? ''));
                        const sellPrice = parseFloat(String(watch('sell_exit_price') ?? ''));
                        const totalQty = parseFloat(String(watch('merged_total_qty') ?? watch('buy_quantity') ?? ''));
                        const pnlPercent = !isNaN(buyPrice) && !isNaN(sellPrice) && buyPrice > 0
                          ? ((sellPrice - buyPrice) / buyPrice) * 100 : null;
                        const buyDate = watch('buy_date') as string | undefined;
                        const lastSellDate = watch('last_sell_date') as string | undefined;
                        let holdDays: number | null = null;
                        if (buyDate && lastSellDate) {
                          const s = new Date(buyDate), e = new Date(lastSellDate);
                          if (!isNaN(s.getTime()) && !isNaN(e.getTime())) holdDays = Math.round((e.getTime() - s.getTime()) / 86400000);
                        }
                        const trades = Array.isArray(mergedTradesWatch) ? mergedTradesWatch : [];
                        const buyCount = trades.filter((t) => t.type === 'BUY').length;
                        const sellCount = trades.filter((t) => t.type === 'SELL').length;
                        const pnlColor = pnlPercent === null ? '' : pnlPercent > 0 ? 'text-red-600' : pnlPercent < 0 ? 'text-green-600' : 'text-gray-700';
                        return (
                          <div className="mb-4 bg-violet-50/60 border border-violet-200 rounded-lg p-3 text-xs text-gray-600">
                            <p className="text-xs font-semibold text-violet-800 mb-2">📊 投资周期概览</p>
                            <div className="flex flex-wrap gap-x-5 gap-y-1">
                              <span>买入价 <b className="text-gray-900">{!isNaN(buyPrice) ? buyPrice.toFixed(2) : '-'}</b></span>
                              <span>卖出价 <b className="text-gray-900">{!isNaN(sellPrice) ? sellPrice.toFixed(2) : '-'}</b></span>
                              {pnlPercent !== null && (
                                <span>总盈亏 <b className={pnlColor}>{pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%</b></span>
                              )}
                              {holdDays !== null && <span>持有 <b className="text-gray-900">{holdDays} 天</b></span>}
                              {totalQty > 0 && <span>总量 <b className="text-gray-900">{totalQty}</b></span>}
                              <span>交易 <b className="text-gray-900">{buyCount}</b> 买 / <b className="text-gray-900">{sellCount}</b> 卖</span>
                            </div>
                          </div>
                        );
                      })()}

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

      </div>
  );
};

export default FormRenderer;
