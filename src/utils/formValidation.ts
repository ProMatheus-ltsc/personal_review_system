/**
 * 表单验证工具集
 *
 * 提供表单提交前的验证逻辑：
 * - validateRequiredFields: 校验当前阶段必填字段
 * - getCurrentPhaseIndex: 根据表单数据判断当前所处阶段
 * - getSectionPhaseIndex: 获取 section 所属的阶段索引
 * - isFieldEmpty: 判断字段值是否为空
 * - getPhaseTimeLockInfo: 获取阶段时间锁/冷静期信息
 */
import type { FormTemplate, PhaseConfig, FormSection } from '@/types';

/** 表单验证错误信息 */
export interface ValidationError {
  fieldId: string;
  fieldLabel: string;
  sectionIndex: number;
  /** 自定义错误文案（如正则校验失败提示），缺省时显示「此字段为必填项」 */
  message?: string;
}

/** 阶段计算选项（用于测试模式跳过冷静期等） */
export interface PhaseCalcOptions {
  /** 跳过 unlockAfterDays 时间锁（测试模式：复盘立即解锁） */
  skipCooldown?: boolean;
}

/**
 * 判断字段值是否为空
 * @param val - 待检查的字段值
 * @returns 如果值为空则返回 true
 */
export function isFieldEmpty(val: unknown): boolean {
  // Table field: array of objects — empty if no rows, or all rows have empty values
  if (Array.isArray(val)) {
    if (val.length === 0) return true;
    return val.every((row) => {
      if (typeof row !== 'object' || row === null) return true;
      return Object.values(row).every((v) => v === undefined || v === null || v === '' || (typeof v === 'string' && v.trim() === ''));
    });
  }
  return (
    val === undefined ||
    val === null ||
    val === '' ||
    (typeof val === 'string' && val.trim() === '') ||
    (typeof val === 'boolean' && val === false)
  );
}

/**
 * 验证模板中所有必填字段是否已填写
 * @param template - 表单模板定义
 * @param formData - 当前表单数据
 * @returns 验证结果，包含是否通过和错误列表
 */
export function validateRequiredFields(
  template: FormTemplate,
  formData: Record<string, any>
): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  template.sections.forEach((section, sectionIndex) => {
    // For repeatable sections, skip individual field validation
    // (phase completion logic handles repeatable section completeness)
    if (section.repeatable) return;

    section.fields.forEach((field) => {
      if (field.priority === 'required') {
        // Check if field is conditionally hidden
        if (field.condition) {
          const dependsOnValue = formData[field.condition.dependsOn];
          const showWhen = field.condition.showWhen;
          const isVisible = Array.isArray(showWhen)
            ? showWhen.includes('*')
              ? !!dependsOnValue && String(dependsOnValue).trim() !== ''
              : showWhen.includes(dependsOnValue)
            : dependsOnValue === showWhen;
          if (!isVisible) return;
        }
        // For regular checkboxes (no emphasis), false is acceptable
        if (field.type === 'checkbox' && !field.emphasis) return;
        // Check if value is empty
        const value = formData[field.id];
        if (isFieldEmpty(value)) {
          errors.push({ fieldId: field.id, fieldLabel: field.label, sectionIndex });
        }
      }

      // 正则校验：非空字段配置了 pattern 时校验格式（如股票代码仅限大写字母和数字）
      const pattern = field.validation?.pattern;
      if (pattern) {
        const value = formData[field.id];
        if (!isFieldEmpty(value) && typeof value === 'string') {
          if (!pattern.test(value.trim())) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              sectionIndex,
              message: field.validation?.patternMessage || '格式不正确',
            });
          }
        }
      }

      // 数值范围校验：非空字段配置了 min/max 时按数值比较（text 字段的 RHF min 是字符串长度语义，这里统一按数值判断）
      const min = field.validation?.min;
      const max = field.validation?.max;
      if ((min !== undefined || max !== undefined) && !isFieldEmpty(formData[field.id])) {
        const num = Number(formData[field.id]);
        if (!isNaN(num)) {
          if (min !== undefined && num < min) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              sectionIndex,
              message: `不能小于 ${min}`,
            });
          } else if (max !== undefined && num > max) {
            errors.push({
              fieldId: field.id,
              fieldLabel: field.label,
              sectionIndex,
              message: `不能大于 ${max}`,
            });
          }
        }
      }
    });
  });
  return { valid: errors.length === 0, errors };
}

/**
 * 根据表单数据判断当前所处的阶段索引
 * 对于可重复 section，只要至少有一条记录且满足 completionFields 要求即视为完成
 * @param phases - 阶段配置数组
 * @param formData - 当前表单数据
 * @param sections - 模板 sections（用于检查 repeatable 标记）
 * @param recordCreatedAt - 记录创建时间（用于 unlockAfterDays 默认参考日期）
 * @param options - 计算选项（如测试模式跳过冷静期）
 * @returns 当前阶段的索引
 */
export function getCurrentPhaseIndex(phases: PhaseConfig[], formData: Record<string, any>, sections?: FormSection[], recordCreatedAt?: string, options?: PhaseCalcOptions): number {
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    // Check if this phase's sections are repeatable
    const repeatableSection = sections?.find((s, idx) =>
      s.repeatable && phase.sectionIndices.includes(idx)
    );

    if (repeatableSection) {
      // For repeatable sections, check entries array
      const entriesKey = `${repeatableSection.id}_entries`;
      const entries = formData[entriesKey] as Record<string, unknown>[] | undefined;
      // completionFields 为空 → 该阶段无强制完成项（如仓位单的持有中复盘），
      // 跳过 entries 检查，允许直接根据下一阶段的时间锁决定是否解锁
      if (phase.completionFields.length > 0) {
        if (!entries || entries.length === 0) return i;
        // Check if at least one entry satisfies completionFields
        const hasCompleteEntry = entries.some((entry) =>
          phase.completionFields.every((fieldId) => {
            const val = entry[fieldId];
            return val !== undefined && val !== null && val !== '' &&
              !(typeof val === 'string' && val.trim() === '') &&
              !(typeof val === 'boolean' && val === false);
          })
        );
        if (!hasCompleteEntry) return i;
      }
    } else {
      const allComplete = phase.completionFields.every(
        (fieldId) => formData[fieldId] && String(formData[fieldId]).trim() !== ''
      );
      if (!allComplete) return i;
    }

    // Time lock check: if the NEXT phase has unlockAfterDays, check it
    const nextPhase = phases[i + 1];
    if (nextPhase?.unlockAfterDays && !options?.skipCooldown) {
      const unlockDays = nextPhase.unlockAfterDays;
      let referenceDate: Date | null = null;

      // Determine reference date
      if (nextPhase.unlockAfterField) {
        const fieldValue = formData[nextPhase.unlockAfterField] as string | undefined;
        if (fieldValue && String(fieldValue).trim()) {
          const parsed = new Date(String(fieldValue));
          if (!isNaN(parsed.getTime())) referenceDate = parsed;
        }
      }
      // 配置了参考字段但尚未填写（如决策日志完成前 _completedAt 不存在）时，
      // 不回退到 createdAt，保持该阶段锁定，避免未完成记录提前解锁
      if (!referenceDate && nextPhase.unlockAfterField) {
        return i;
      }
      // Fallback to record createdAt
      if (!referenceDate && recordCreatedAt) {
        const parsed = new Date(recordCreatedAt);
        if (!isNaN(parsed.getTime())) referenceDate = parsed;
      }

      // If we have a reference date, enforce the time lock
      if (referenceDate) {
        const today = new Date();
        const daysSince = Math.floor(
          (today.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSince < unlockDays) {
          return i; // Current phase is still the max accessible
        }
      } else {
        // No reference date available yet — cannot unlock next phase
        return i;
      }
    }
  }
  return phases.length - 1; // all complete
}

/**
 * 获取指定 section 所属的阶段索引
 * @param phases - 阶段配置数组
 * @param sectionIndex - section 在模板中的索引
 * @returns 对应的阶段索引，找不到返回 -1
 */
export function getSectionPhaseIndex(phases: PhaseConfig[], sectionIndex: number): number {
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].sectionIndices.includes(sectionIndex)) return i;
  }
  return -1;
}

/**
 * 计算某个阶段的时间锁状态
 * @param phase - 阶段配置
 * @param formData - 当前表单数据
 * @param recordCreatedAt - 记录创建时间
 * @param options - 计算选项（如测试模式跳过冷静期）
 * @returns 如果被锁定，返回解锁日期和剩余天数；否则返回 null
 */
export function getPhaseTimeLockInfo(
  phase: PhaseConfig,
  formData: Record<string, any>,
  recordCreatedAt?: string,
  options?: PhaseCalcOptions
): { unlockDate: Date; daysRemaining: number } | null {
  if (options?.skipCooldown) return null; // 测试模式：跳过冷静期
  if (!phase.unlockAfterDays) return null;

  const unlockDays = phase.unlockAfterDays;
  let referenceDate: Date | null = null;

  if (phase.unlockAfterField) {
    const fieldValue = formData[phase.unlockAfterField] as string | undefined;
    if (fieldValue && String(fieldValue).trim()) {
      const parsed = new Date(String(fieldValue));
      if (!isNaN(parsed.getTime())) referenceDate = parsed;
    }
  }
  // 配置了参考字段但尚未填写 → 视为无限期锁定（解锁日期未知）
  if (!referenceDate && phase.unlockAfterField) {
    return { unlockDate: new Date(9999, 0, 1), daysRemaining: unlockDays };
  }
  if (!referenceDate && recordCreatedAt) {
    const parsed = new Date(recordCreatedAt);
    if (!isNaN(parsed.getTime())) referenceDate = parsed;
  }

  if (!referenceDate) return { unlockDate: new Date(9999, 0, 1), daysRemaining: unlockDays };

  const unlockDate = new Date(referenceDate.getTime() + unlockDays * 24 * 60 * 60 * 1000);
  const today = new Date();
  const daysRemaining = Math.ceil(
    (unlockDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysRemaining > 0) {
    return { unlockDate, daysRemaining };
  }
  return null;
}
