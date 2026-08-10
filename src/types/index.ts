/**
 * 全局类型定义
 *
 * 定义整个应用的核心数据结构：
 * - FieldType / FormField: 表单字段类型和配置
 * - FormSection: 表单分区（一组字段的容器）
 * - PhaseConfig: 多阶段配置（阶段名称、包含的 section、时间锁等）
 * - FormTemplate: 完整的模板定义（元数据 + sections + phases）
 * - FormRecord: 存储在 IndexedDB 中的复盘记录
 * - TemplateId: 所有支持的模板 ID 联合类型
 */
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'rating' | 'table' | 'quadrant' | 'dragMatrix' | 'jsonImport';

/** 四象限矩阵的象限标识（参考《高效能人士的七个习惯》时间管理矩阵） */
export type QuadrantKey = 'q1' | 'q2' | 'q3' | 'q4';

/** 象限中的单个事项 */
export interface QuadrantItem {
  id: string;
  text: string;
}

/** 四象限矩阵的值结构：每个象限一组事项 */
export type QuadrantMatrix = Record<QuadrantKey, QuadrantItem[]>;

/** 四象限配置：名称 / 典型事项 / 处理原则 / 指导建议 / 视觉样式 */
export interface QuadrantConfig {
  key: QuadrantKey;
  /** 象限名称，如「紧急且重要」 */
  label: string;
  /** 处理原则，如「立即做」 */
  action: string;
  /** 典型事项示例，如「危机、紧急问题、临期任务」 */
  typical: string;
  /** 针对该象限的指导建议 */
  advice: string;
  /** 事项输入框占位提示 */
  placeholder: string;
  /** 建议投入时间占比参考，如「40-50%（核心）」 */
  ratio: string;
  /** 象限色点 class */
  dotClass: string;
  /** 卡片边框 class */
  borderClass: string;
  /** 指导建议背景 class */
  adviceClass: string;
  /** 第二象限（重点）外发光 ring class */
  ringClass?: string;
}

/** 拖拽决策矩阵的值结构：每个象限一组选项文本（选项来自表格列，如 options_analysis.option_name） */
export type DragMatrixValue = Record<QuadrantKey, string[]>;

/** 拖拽决策矩阵的象限配置（成本×效果评估） */
export interface DragMatrixQuadrantConfig {
  key: QuadrantKey;
  /** 象限名称，如「事半功倍」 */
  label: string;
  /** 象限描述（成本/效果说明），如「成本低 · 效果好」 */
  desc: string;
  /** 处理建议 */
  advice: string;
  /** 色点 class */
  dotClass: string;
  /** 卡片边框 class */
  borderClass: string;
  /** 建议背景 class */
  adviceClass: string;
}

export interface TableColumn {
  id: string;           // 列标识
  label: string;        // 列标题
  type: 'text' | 'select';  // 单元格类型
  options?: string[];   // select 类型的选项
  width?: string;       // 列宽（可选，如 '30%'）
}

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  validation?: {
    min?: number;
    max?: number;
    maxLength?: number;
    /** 正则校验（如股票代码仅允许大写字母和数字） */
    pattern?: RegExp;
    /** pattern 校验失败时的提示文案 */
    patternMessage?: string;
  };

  /** Table field column configuration */
  tableColumns?: TableColumn[];

  /** Field importance level - controls visibility and layout */
  priority?: 'required' | 'recommended' | 'optional';

  /** 只读字段：展示已存值，禁止手动编辑（如决策日志的问题/根因，仅通过 JSON 导入填充） */
  readOnly?: boolean;

  /** Conditional display logic - show this field only when condition is met */
  condition?: {
    dependsOn: string;  // field id to watch
    showWhen: string | string[];  // show when dependsOn field equals this value(s)
  };

  /** Helpful hint text shown below the field (guidance for user) */
  hint?: string;

  /** Default value to pre-fill */
  defaultValue?: any;

  /** Enable autocomplete from history records */
  autocomplete?: boolean;

  /** If true, this field is visually emphasized (larger, bold label, colored background) */
  emphasis?: boolean;

  /** Dynamic hints based on another field's value */
  conditionalHints?: Record<string, string>;

  /** Dynamic placeholders based on another field's value */
  conditionalPlaceholders?: Record<string, string>;

  /** Which field to watch for conditional hints/placeholders */
  hintDependsOn?: string;

  /** Dynamic options sourced from a table field's column (for select type) */
  optionsFrom?: { fieldId: string; columnId: string };

  /** 四象限矩阵配置（quadrant 类型专用）：定义 4 个象限的名称与指导建议 */
  quadrants?: QuadrantConfig[];

  /** 拖拽决策矩阵配置（dragMatrix 类型专用）：定义成本×效果四象限；选项来源复用 optionsFrom */
  dragQuadrants?: DragMatrixQuadrantConfig[];

  /**
   * Computed field configuration — makes the field read-only and auto-calculated.
   * The formula function receives the dependent field values and returns the display string.
   */
  computed?: {
    dependsOn: string[];  // field IDs to watch (within same record/entry)
    externalDeps?: string[];  // field IDs resolved from external context (e.g. parent record)
    formula: (values: Record<string, unknown>) => string;  // calculation function
    placeholder?: string;  // shown when dependencies are incomplete
    errorText?: string;  // shown when calculation is invalid (e.g. division by zero)
  };
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];

  /** If true, section starts collapsed (for optional sections) */
  collapsedByDefault?: boolean;

  /** If true, this section supports repeated entries (e.g. periodic check records) */
  repeatable?: boolean;

  /** Button label for adding a new entry, e.g. "+ 添加一次持有检查" */
  repeatLabel?: string;
}

export interface PhaseConfig {
  id: string;
  label: string;
  icon: string;
  /** Brief description of when to fill this phase */
  description?: string;
  /** Section indices (0-based) that belong to this phase */
  sectionIndices: number[];
  /** Field IDs that indicate this phase is complete (all must be non-empty) */
  completionFields: string[];
  /** Days to wait before this phase becomes active (after previous phase completion) */
  activateAfterDays?: number;
  /** Field ID from previous phase that determines the "start date" for delay calculation */
  activateAfterField?: string;
  /** Hard time lock: days after reference date before this phase can be unlocked */
  unlockAfterDays?: number;
  /** Field ID whose date value is the reference for unlockAfterDays (defaults to record createdAt) */
  unlockAfterField?: string;
  /** If true, completing this phase auto-marks the record as 'completed' */
  completesRecord?: boolean;
}

/** 所有模板 ID 的字面量联合类型 */
export type TemplateId = 'daily_review' | 'weekly_review' | 'monthly_review' | 'annual_review' | 'emotional_awareness' | 'case_study' | 'decision_log' | 'investment_checklist_buy' | 'investment_checklist_sell' | 'investment_checklist_position';

export interface FormTemplate {
  id: TemplateId;
  name: string;
  icon: string;
  description: string;
  sections: FormSection[];
  /** Lifecycle phase configuration for multi-stage templates */
  phases?: PhaseConfig[];
  /** When to use this template - displayed on dashboard card */
  timing?: {
    frequency: string;
    suggestion: string;
  };
}

export interface FormRecord {
  id: string;
  templateId: TemplateId;
  title: string;
  data: Record<string, unknown>;
  status: 'draft' | 'completed';
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}
