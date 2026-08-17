/**
 * 全局类型定义
 *
 * 类型契约以 @shared/core 公共包为准（表单引擎核心类型），
 * 业务特有类型在本文件扩展定义：
 * - TemplateId: 所有支持的模板 ID 字面量联合（项目业务强类型）
 *
 * 迁移说明（2026-08-18）：FormField/FormSection/FormTemplate/FormRecord 等
 * 已全面切换到公共包类型；jsonImport 字段类型已回填进 @shared/core 的 FieldType。
 */
export type {
  FieldType,
  FieldOption,
  FieldValidation,
  FieldCondition,
  FieldComputed,
  QuadrantKey,
  QuadrantItem,
  QuadrantMatrix,
  QuadrantConfig,
  DragMatrixValue,
  DragMatrixQuadrantConfig,
  TableColumn,
  FormField,
  FormSection,
  PhaseConfig,
  FormTemplate,
  FormRecord,
} from '@shared/core';

/** 所有模板 ID 的字面量联合类型 */
export type TemplateId =
  | 'daily_review'
  | 'weekly_review'
  | 'monthly_review'
  | 'annual_review'
  | 'emotional_awareness'
  | 'case_study'
  | 'decision_log'
  | 'investment_checklist_buy'
  | 'investment_checklist_sell'
  | 'investment_checklist_position';
