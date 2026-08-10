/**
 * FieldInputs — 表单字段类型的纯渲染组件集
 *
 * 从 FieldRenderer 的 renderField 大方法拆出，每种字段类型一个独立组件：
 * - 受控模式（controlled）：value/onChange 由父组件管理（checkbox/rating/table 等）
 * - 非受控模式：RHF register 展开（text/textarea/number/date/select/radio）
 *
 * 每个组件保持单一职责、行数 ≤ 40，方便维护与复用。
 */
import { useState } from 'react';
import type { FormField, QuadrantKey, QuadrantMatrix, DragMatrixValue } from '@/types';
import { DEFAULT_QUADRANTS, DEFAULT_DRAG_QUADRANTS, QUADRANT_KEYS, isQuadrantMatrix } from '@/constants/quadrant';

/** 输入组件统一 props：字段定义 + 样式 + 受控/非受控双模式 */
export interface InputFieldProps {
  field: FormField;
  inputClass: string;
  /** RHF register（非受控模式） */
  register?: (name: string, options?: any) => any;
  /** 受控模式开关（true 时用 value/onChange，忽略 register） */
  controlled?: boolean;
  value?: any;
  onChange?: (val: any) => void;
  /** 自动补全（text/textarea 专用） */
  autocomplete?: {
    enabled: boolean;
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    setFilterText: (t: string) => void;
    renderDropdown: () => React.ReactNode;
  };
  /** select 动态选项覆盖（optionsFrom 生成） */
  dynamicOptions?: { value: string; label: string }[];
}

/** 通用 register 校验选项（required + pattern） */
const registerRules = (field: FormField) => ({
  required: field.required,
  pattern: field.validation?.pattern
    ? { value: field.validation.pattern, message: field.validation.patternMessage || '格式不正确' }
    : undefined,
});

/** textarea 自动增高（输入时随内容撑高，最小高度由样式控制） */
export function autoResize(e: React.FormEvent<HTMLTextAreaElement>) {
  const target = e.currentTarget;
  target.style.height = 'auto';
  target.style.height = `${Math.min(target.scrollHeight, 320)}px`;
}

/** 文本输入（支持自动补全下拉） */
export function TextInput({ field, inputClass, register, controlled, value, onChange, autocomplete }: InputFieldProps) {
  if (controlled) {
    return (
      <input
        type="text"
        className={inputClass}
        placeholder={field.placeholder}
        value={(value as string) ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  }
  if (autocomplete?.enabled && register) {
    const regProps = register(field.id, registerRules(field));
    return (
      <div className="relative">
        <input
          type="text"
          className={inputClass}
          placeholder={field.placeholder}
          {...regProps}
          onFocus={autocomplete.onFocus}
          onBlur={(e) => {
            regProps.onBlur(e);
            autocomplete.onBlur();
          }}
          onKeyDown={autocomplete.onKeyDown}
          onChange={(e) => {
            regProps.onChange(e);
            autocomplete.setFilterText(e.target.value);
          }}
        />
        {autocomplete.renderDropdown()}
      </div>
    );
  }
  return (
    <input
      type="text"
      className={inputClass}
      placeholder={field.placeholder}
      {...register?.(field.id, registerRules(field))}
    />
  );
}

/** 多行文本输入（支持自动补全下拉） */
export function TextareaInput({ field, inputClass, register, controlled, value, onChange, autocomplete }: InputFieldProps) {
  if (controlled) {
    return (
      <textarea
        className={inputClass}
        placeholder={field.placeholder}
        style={{ minHeight: '80px' }}
        onInput={autoResize}
        value={(value as string) ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  }
  if (autocomplete?.enabled && register) {
    const regProps = register(field.id, registerRules(field));
    return (
      <div className="relative">
        <textarea
          className={inputClass}
          placeholder={field.placeholder}
          style={{ minHeight: '80px' }}
          onInput={autoResize}
          {...regProps}
          onFocus={autocomplete.onFocus}
          onBlur={(e) => {
            regProps.onBlur(e);
            autocomplete.onBlur();
          }}
          onKeyDown={autocomplete.onKeyDown}
          onChange={(e) => {
            regProps.onChange(e);
            autocomplete.setFilterText(e.target.value);
          }}
        />
        {autocomplete.renderDropdown()}
      </div>
    );
  }
  return (
    <textarea
      className={inputClass}
      placeholder={field.placeholder}
      style={{ minHeight: '80px' }}
      onInput={autoResize}
      {...register?.(field.id, registerRules(field))}
    />
  );
}

/** 数字输入 */
export function NumberInput({ field, inputClass, register, controlled, value, onChange }: InputFieldProps) {
  if (controlled) {
    return (
      <input
        type="number"
        className={inputClass}
        placeholder={field.placeholder}
        min={field.validation?.min}
        max={field.validation?.max}
        value={(value as number) ?? ''}
        onChange={(e) => onChange?.(e.target.value ? Number(e.target.value) : '')}
      />
    );
  }
  return (
    <input
      type="number"
      className={inputClass}
      placeholder={field.placeholder}
      min={field.validation?.min}
      max={field.validation?.max}
      {...register?.(field.id, {
        required: field.required,
        min: field.validation?.min,
        max: field.validation?.max,
        valueAsNumber: true,
      })}
    />
  );
}

/** 日期输入 */
export function DateInput({ field, inputClass, register, controlled, value, onChange }: InputFieldProps) {
  if (controlled) {
    return (
      <input
        type="date"
        className={inputClass}
        value={(value as string) ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  }
  return (
    <input
      type="date"
      className={inputClass}
      {...register?.(field.id, { required: field.required })}
    />
  );
}

/** 下拉选择（支持动态选项覆盖） */
export function SelectInput({ field, inputClass, register, controlled, value, onChange, dynamicOptions }: InputFieldProps) {
  const options = dynamicOptions && dynamicOptions.length > 0 ? dynamicOptions : field.options;
  const renderOptions = () => (
    <>
      <option value="">{field.placeholder || '请选择...'}</option>
      {options?.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </>
  );
  if (controlled) {
    return (
      <select
        className={inputClass}
        value={(value as string) ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {renderOptions()}
      </select>
    );
  }
  return (
    <select className={inputClass} {...register?.(field.id, { required: field.required })}>
      {renderOptions()}
    </select>
  );
}

/** 单选组 */
export function RadioInput({ field, register, controlled, value, onChange }: InputFieldProps) {
  const renderRadios = (inputProps: any) => (
    <>
      {field.options?.map((opt) => (
        <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer min-h-[44px] py-2">
          <input type="radio" value={opt.value} className="text-indigo-600 focus:ring-indigo-500" {...inputProps(opt.value)} />
          <span className="text-sm text-gray-700">{opt.label}</span>
        </label>
      ))}
    </>
  );
  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
      {controlled
          ? renderRadios((optValue: string) => ({
              checked: value === optValue,
              onChange: () => onChange?.(optValue),
            }))
          : renderRadios(() => register?.(field.id, { required: field.required }))}
    </div>
  );
}

/** 单个布尔 checkbox（无 options；emphasis 为强调样式，多用于持有检查） */
export function SingleCheckboxInput({ field, value, onChange }: InputFieldProps) {
  const isChecked = !!value;
  const isEmphasis = field.emphasis === true;
  return (
    <label
      className={`flex items-start gap-3 cursor-pointer group rounded-lg px-3 py-2 transition-colors ${
        isEmphasis ? 'rounded-r-lg border-l-4 ' + (isChecked ? 'bg-green-50 border-green-400' : 'bg-blue-50/50 border-blue-400 hover:bg-blue-50')
          : isChecked ? 'bg-green-50' : 'hover:bg-gray-50'
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        checked={isChecked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span
        className={`text-sm transition-colors ${
          isEmphasis ? 'text-base font-semibold ' + (isChecked ? 'text-green-800 line-through decoration-green-400' : 'text-gray-900')
            : isChecked ? 'text-green-700 line-through decoration-green-400' : 'text-gray-700 group-hover:text-gray-900'
        }`}
      >
        {field.label}
      </span>
    </label>
  );
}

/** 多选 checkbox 组 */
export function CheckboxGroupInput({ field, value, onChange }: InputFieldProps) {
  const toggle = (optValue: string, checked: boolean) => {
    if (!onChange) return;
    const current = Array.isArray(value) ? [...(value as string[])] : [];
    onChange(checked ? [...current, optValue] : current.filter((v: string) => v !== optValue));
  };
  return (
    <div className="flex flex-wrap gap-3">
      {field.options?.map((opt) => {
        const checked = Array.isArray(value) && value.includes(opt.value);
        return (
          <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              value={opt.value}
              checked={checked}
              className="rounded text-indigo-600 focus:ring-indigo-500"
              onChange={(e) => toggle(opt.value, e.target.checked)}
            />
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

/** 评分按钮组（min~max 数字点选，默认 1~5） */
export function RatingInput({ field, value, onChange }: InputFieldProps) {
  const max = field.validation?.max || 5;
  const min = field.validation?.min || 1;
  const currentValue = typeof value === 'number' ? value : 0;
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => onChange?.(num)}
          className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border text-sm font-medium transition ${
            currentValue === num
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
          }`}
        >
          {num}
        </button>
      ))}
    </div>
  );
}

/** 表格输入（行内编辑 + 添加/删除行，列支持 text/select 类型） */
export function TableInput({ field, value, onChange }: InputFieldProps) {
  const columns = field.tableColumns || [];
  const rows: Record<string, string>[] = Array.isArray(value) ? value as Record<string, string>[] : [{}];

  const updateCell = (rowIdx: number, colId: string, cellValue: string) => {
    const newRows = rows.map((row, i) => (i === rowIdx ? { ...row, [colId]: cellValue } : row));
    onChange?.(newRows);
  };
  const addRow = () => {
    const emptyRow: Record<string, string> = {};
    columns.forEach((col) => { emptyRow[col.id] = ''; });
    onChange?.([...rows, emptyRow]);
  };
  const removeRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    onChange?.(rows.filter((_, i) => i !== rowIdx));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-gray-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((col) => (
              <th
                key={col.id}
                className="px-3 py-2 text-left text-xs font-medium text-gray-600 border-b border-gray-200"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
            <th className="w-10 border-b border-gray-200" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="group hover:bg-gray-50/50 transition-colors">
              {columns.map((col) => (
                <td key={col.id} className="px-1 py-1 border-b border-gray-100">
                  {col.type === 'select' ? (
                    <select
                      value={row[col.id] || ''}
                      onChange={(e) => updateCell(rowIdx, col.id, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-transparent border-transparent rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    >
                      <option value="">请选择</option>
                      {col.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={row[col.id] || ''}
                      onChange={(e) => updateCell(rowIdx, col.id, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-transparent border-transparent rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      placeholder={col.label}
                    />
                  )}
                </td>
              ))}
              <td className="px-1 py-1 border-b border-gray-100 text-center">
                <button
                  type="button"
                  onClick={() => removeRow(rowIdx)}
                  className={`p-1 rounded transition-colors ${
                    rows.length <= 1
                      ? 'text-gray-200 cursor-not-allowed'
                      : 'text-transparent group-hover:text-red-400 hover:!text-red-600 hover:bg-red-50'
                  }`}
                  disabled={rows.length <= 1}
                  title="删除行"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 w-full py-2 text-sm text-gray-500 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-colors"
      >
        + 添加行
      </button>
    </div>
  );
}

/** 四象限矩阵输入（自我管理矩阵 · 参考《高效能人士的七个习惯》时间管理矩阵）
 * 2×2 网格，每象限一个卡片：名称 + 典型事项 + 指导建议 + 事项列表（增删改）。
 * 第二象限（不紧急但重要）为重点关注对象，视觉上特殊强调。
 * 值为 QuadrantMatrix：{ q1: QuadrantItem[], q2: ..., q3: ..., q4: ... }，受控组件。
 */
export function QuadrantInput({ field, value, onChange }: InputFieldProps) {
  const quadrants = field.quadrants && field.quadrants.length === 4 ? field.quadrants : DEFAULT_QUADRANTS;
  // 归一化：旧数据部分象限缺失/损坏时逐象限兜底为空数组，避免整张矩阵丢失
  const raw = isQuadrantMatrix(value) ? value : (value && typeof value === 'object' ? value as Partial<QuadrantMatrix> : undefined);
  const matrix: QuadrantMatrix = {
    q1: Array.isArray(raw?.q1) ? raw.q1 : [],
    q2: Array.isArray(raw?.q2) ? raw.q2 : [],
    q3: Array.isArray(raw?.q3) ? raw.q3 : [],
    q4: Array.isArray(raw?.q4) ? raw.q4 : [],
  };

  const updateItem = (qk: QuadrantKey, idx: number, text: string) => {
    const items = [...(matrix[qk] || [])];
    items[idx] = { ...items[idx], text };
    onChange?.({ ...matrix, [qk]: items });
  };
  const addItem = (qk: QuadrantKey) => {
    const items = [...(matrix[qk] || [])];
    items.push({ id: `${qk}-${Date.now()}-${items.length}`, text: '' });
    onChange?.({ ...matrix, [qk]: items });
  };
  const removeItem = (qk: QuadrantKey, idx: number) => {
    onChange?.({ ...matrix, [qk]: (matrix[qk] || []).filter((_, i) => i !== idx) });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {quadrants.map((q) => {
        const items = matrix[q.key] || [];
        const isFocus = q.key === 'q2';
        return (
          <div
            key={q.key}
            className={`rounded-xl border p-3 flex flex-col gap-2 ${q.borderClass} ${
              isFocus ? 'ring-2 ' + (q.ringClass || 'ring-emerald-200') : ''
            }`}
          >
            {/* 象限标题 + 重点徽标 */}
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${q.dotClass}`} />
              <span className="text-sm font-semibold text-gray-800">{q.label}</span>
              {isFocus && (
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white whitespace-nowrap">
                  ⭐ 重点投入
                </span>
              )}
            </div>
            {/* 典型事项 + 投入比例 */}
            <p className="text-[11px] text-gray-500 leading-relaxed">
              📌 {q.typical}
              <span className="ml-2 text-gray-400">投入参考：{q.ratio}</span>
            </p>
            {/* 指导建议 */}
            <div className={`text-[11px] leading-relaxed rounded-lg px-2 py-1.5 ${q.adviceClass}`}>
              <span className="font-semibold">【{q.action}】</span>
              {q.advice}
            </div>
            {/* 事项列表 */}
            <div className="flex flex-col gap-1.5 flex-1 min-h-[56px]">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => updateItem(q.key, idx, e.target.value)}
                    placeholder={q.placeholder}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(q.key, idx)}
                    className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                    title="移除事项"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addItem(q.key)}
                className="text-xs py-1.5 border border-dashed border-gray-300 rounded-lg text-gray-400 hover:text-indigo-600 hover:border-indigo-400 transition-colors"
              >
                + 添加事项
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 拖拽决策矩阵（dragMatrix · 成本×效果评估）
 * 选项来自「选项梳理」表格（dynamicOptions），拖拽到 2×2 矩阵中评估：
 * 事半功倍（低成本高效果）/ 物有所值（高成本高效果）/ 无关痛痒（低成本低效果）/ 劳民伤财（高成本低效果）。
 * 值为 DragMatrixValue：{ q1: string[], q2: ..., q3: ..., q4: ... }（存选项文本），受控组件。
 * 布局：横向为效果（左差右好），纵向为成本（上低下高）：
 *   [无关痛痒 | 事半功倍]
 *   [劳民伤财 | 物有所值]
 */
export function DragMatrixInput({ field, value, onChange, dynamicOptions }: InputFieldProps) {
  const [dragOver, setDragOver] = useState<QuadrantKey | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const quadrants = field.dragQuadrants && field.dragQuadrants.length === 4 ? field.dragQuadrants : DEFAULT_DRAG_QUADRANTS;
  // 归一化矩阵（容错旧数据）
  const raw = value && typeof value === 'object' ? value as Partial<DragMatrixValue> : undefined;
  const matrix: DragMatrixValue = {
    q1: Array.isArray(raw?.q1) ? raw.q1 : [],
    q2: Array.isArray(raw?.q2) ? raw.q2 : [],
    q3: Array.isArray(raw?.q3) ? raw.q3 : [],
    q4: Array.isArray(raw?.q4) ? raw.q4 : [],
  };
  const assigned = new Set(([] as string[]).concat(...QUADRANT_KEYS.map((k) => matrix[k])));
  // 选项池：dynamicOptions 中尚未放入矩阵的选项
  const poolOptions = (dynamicOptions && dynamicOptions.length > 0 ? dynamicOptions : [])
    .map((o) => o.label)
    .filter((t) => t.trim() !== '' && !assigned.has(t));
  const allPooled = poolOptions.length + assigned.size;

  const updateMatrix = (qk: QuadrantKey, items: string[]) =>
    onChange?.({ q1: matrix.q1, q2: matrix.q2, q3: matrix.q3, q4: matrix.q4, [qk]: items });

  const assignTo = (qk: QuadrantKey, text: string) => {
    const t = String(text).trim();
    if (!t) return;
    const cur = matrix[qk];
    if (cur.includes(t)) return;
    updateMatrix(qk, [...cur, t]);
  };
  const removeFrom = (qk: QuadrantKey, idx: number) => {
    updateMatrix(qk, matrix[qk].filter((_, i) => i !== idx));
  };

  const onDrop = (qk: QuadrantKey, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const text = e.dataTransfer.getData('text/plain') || dragging;
    if (text) assignTo(qk, text);
    setDragging(null);
  };

  // 布局顺序：行1 = [q3 无关痛痒, q1 事半功倍]，行2 = [q4 劳民伤财, q2 物有所值]
  const layout: { qk: QuadrantKey; col: 'top' | 'bottom'; row: 'left' | 'right' }[] = [
    { qk: 'q3', col: 'top', row: 'left' },
    { qk: 'q1', col: 'top', row: 'right' },
    { qk: 'q4', col: 'bottom', row: 'left' },
    { qk: 'q2', col: 'bottom', row: 'right' },
  ];

  // 评估解读：按「放置结果」动态生成建议（事半功倍 > 物有所值 > 无关痛痒 > 劳民伤财）
  const evalOrder: { key: QuadrantKey; icon: string }[] = [
    { key: 'q1', icon: '⭐' }, { key: 'q2', icon: '💰' },
    { key: 'q3', icon: '⚖️' }, { key: 'q4', icon: '🚫' },
  ];
  const placed = evalOrder.filter((o) => matrix[o.key].length > 0);
  const lowCost = matrix.q1.length + matrix.q3.length;
  const highCost = matrix.q2.length + matrix.q4.length;
  const highEffect = matrix.q1.length + matrix.q2.length;
  const lowEffect = matrix.q3.length + matrix.q4.length;
  const trendParts: string[] = [];
  if (assigned.size > 0) {
    if (lowEffect === 0) trendParts.push('全部落在效果好区间');
    else if (lowEffect > highEffect) trendParts.push('多数选项效果偏弱，建议先改进方案本身');
    if (highCost === 0) trendParts.push('成本均较低、风险可控');
    else if (highCost > lowCost) trendParts.push('成本偏高，需评估资源承受力');
    trendParts.push(`共 ${assigned.size} 个选项完成评估`);
  }

  return (
    <div>
      {/* 选项池（可拖拽） */}
      <div className="mb-3">
        <p className="text-[11px] text-gray-500 mb-1.5">
          📦 待评估选项（{poolOptions.length}/{allPooled}）—— 按住拖动到下方矩阵对应位置
        </p>
        <div className="flex flex-wrap gap-1.5 min-h-[34px]">
          {poolOptions.length === 0 && (
            <span className="text-xs text-gray-400 py-1.5">
              {allPooled === 0 ? '请先在「选项梳理」表格中填写选项' : '所有选项已放入矩阵'}
            </span>
          )}
          {poolOptions.map((opt) => (
            <span
              key={opt}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', opt);
                e.dataTransfer.effectAllowed = 'move';
                setDragging(opt);
              }}
              onDragEnd={() => setDragging(null)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full border cursor-grab active:cursor-grabbing transition select-none ${
                dragging === opt
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700 opacity-60'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600'
              }`}
              title="拖拽到矩阵中评估"
            >
              {opt}
            </span>
          ))}
        </div>
      </div>

      {/* 2×2 决策矩阵（坐标轴式布局：横轴=效果，纵轴=成本） */}
      <div className="rounded-xl border-2 border-gray-300 overflow-hidden">
        {/* 顶部：效果轴（横轴） */}
        <div className="grid grid-cols-[30px_1fr_1fr]">
          <div className="bg-gray-100 border-r border-gray-300" />
          <div className="col-span-2 bg-gray-100 text-center text-[10px] text-gray-500 py-1 border-b-2 border-gray-300 tracking-wide">
            效果（横向）· 低 ←——————→ 高
          </div>
        </div>
        {(['top', 'bottom'] as const).map((col) => (
          <div key={col} className="grid grid-cols-[30px_1fr_1fr]">
            {/* 左侧：成本轴（纵轴）标签 */}
            <div
              className={`flex items-center justify-center text-[10px] text-gray-500 border-r border-gray-300 tracking-wide ${
                col === 'top' ? 'border-b border-gray-200' : ''
              }`}
              style={{ writingMode: 'vertical-rl' }}
            >
              {col === 'top' ? '成本低' : '成本高'}
            </div>
            {layout.filter((l) => l.col === col).map(({ qk, row }) => {
              const q = quadrants.find((x) => x.key === qk)!;
              const items = matrix[qk];
              return (
                <div
                  key={qk}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(qk); }}
                  onDragLeave={() => setDragOver((cur) => (cur === qk ? null : cur))}
                  onDrop={(e) => onDrop(qk, e)}
                  className={`p-2.5 border border-dashed transition-colors min-h-[96px] relative ${
                    col === 'top' ? 'border-b-0' : ''
                  } ${row === 'left' ? 'border-r-0' : ''} ${
                    dragOver === qk ? 'bg-indigo-50 border-indigo-300' : 'bg-white'
                  }`}
                >
                  {/* 坐标角标（效果 × 成本） */}
                  <span className="absolute top-1 right-1.5 text-[9px] text-gray-300">
                    {row === 'left' ? '效果低' : '效果高'} · {col === 'top' ? '成本低' : '成本高'}
                  </span>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full ${q.dotClass}`} />
                    <span className="text-xs font-semibold text-gray-800">{q.label}</span>
                  </div>
                  <p className={`text-[10px] leading-snug rounded px-1.5 py-0.5 mb-1 ${q.adviceClass}`}>{q.advice}</p>
                  <div className="flex flex-wrap gap-1 min-h-[20px]">
                    {items.map((it, idx) => (
                      <span
                        key={`${it}-${idx}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', it);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragging(it);
                        }}
                        onDragEnd={() => setDragging(null)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium rounded bg-gray-100 border border-gray-200 text-gray-700 group cursor-grab select-none"
                      >
                        {it}
                        <button
                          type="button"
                          onClick={() => removeFrom(qk, idx)}
                          className="text-gray-300 group-hover:text-red-500 hover:!text-red-600 leading-none"
                          title="移出矩阵"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {items.length === 0 && dragOver !== qk && (
                      <span className="text-[10px] text-gray-300 self-center">拖选项到这里</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 评估解读：根据放置结果动态生成建议 */}
      <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
        <p className="text-xs font-semibold text-indigo-800 mb-1.5">📋 评估解读</p>
        {assigned.size === 0 ? (
          <p className="text-xs text-indigo-500">把选项拖入矩阵后，这里会按「成本 × 效果」的落位给出针对性建议。</p>
        ) : (
          <>
            <ul className="space-y-1 mb-2">
              {placed.map(({ key, icon }) => {
                const q = quadrants.find((x) => x.key === key)!;
                return (
                  <li key={key} className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-semibold text-gray-800">{icon} {q.label}（{q.desc}）：</span>
                    <span className="font-medium text-indigo-700">{matrix[key].join('、')}</span>
                    <span className="text-gray-500"> — {q.advice}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-indigo-700">{trendParts.join('；')}。</p>
          </>
        )}
      </div>
    </div>
  );
}

/** 计算字段只读展示（computed 字段由公式自动算出，不可编辑） */
export function ComputedDisplay({ field, computedValue }: { field: FormField; computedValue?: string }) {
  const displayValue = computedValue || '';
  const isError = displayValue === '__ERROR__';
  const isEmpty = !displayValue;
  const placeholder = field.computed?.placeholder || '自动计算';
  const errorText = field.computed?.errorText || '无法计算';

  const displayContent = isError ? errorText : isEmpty ? placeholder : displayValue;
  const textClass = isError ? 'text-red-500' : isEmpty ? 'text-gray-400' : 'text-gray-900 font-medium';

  return (
    <div className={`w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed ${textClass}`}>
      {displayContent}
    </div>
  );
}
