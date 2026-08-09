/**
 * FieldInputs — 表单字段类型的纯渲染组件集
 *
 * 从 FieldRenderer 的 renderField 大方法拆出，每种字段类型一个独立组件：
 * - 受控模式（controlled）：value/onChange 由父组件管理（checkbox/rating/table 等）
 * - 非受控模式：RHF register 展开（text/textarea/number/date/select/radio）
 *
 * 每个组件保持单一职责、行数 ≤ 40，方便维护与复用。
 */
import type { FormField } from '@/types';

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
