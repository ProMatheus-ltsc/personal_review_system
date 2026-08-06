/**
 * FieldRenderer — 表单字段渲染器
 *
 * 根据 FormField 的 type 配置渲染对应的表单控件：
 * - text: 单行文本输入（支持自动补全）
 * - textarea: 多行文本（自动增高 + 可选自动补全）
 * - number: 数字输入（支持 min/max 验证）
 * - date: 日期选择器
 * - select: 下拉选择
 * - radio: 单选按钮组
 * - checkbox: 复选框（支持单选布尔 / 多选组 / emphasis 强调样式）
 * - rating: 数字评分按钮组
 *
 * 附加功能：
 * - 自动补全：从历史记录中提取建议值，支持模糊过滤
 * - 条件提示：根据依赖字段值动态展示 hint 文案
 * - 错误提示：与 react-hook-form 验证和自定义验证联动
 * - 可展开的长文本 hint
 *
 * 性能：使用 React.memo 避免无关字段重渲染
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { UseFormRegister, FieldValues } from 'react-hook-form';
import type { FormField } from '@/types';
import { getFieldSuggestions } from '@/services/suggestions';

interface FieldRendererProps {
  field: FormField;
  register: UseFormRegister<FieldValues>;
  error?: string;
  value?: unknown;
  onChange?: (value: unknown) => void;
  templateId?: string;
  /** The current value of the field referenced by hintDependsOn */
  watchedHintValue?: string;
  /** Current computed value (set externally via useWatch+setValue) */
  computedValue?: string;
  /** Dynamic options derived from another field (e.g. table column) */
  dynamicOptions?: { value: string; label: string }[];
  /** When true, use value+onChange for all field types (controlled mode) */
  controlled?: boolean;
}

const baseInputClass =
  'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition';
const errorClass = 'text-xs text-red-500 mt-1';

function autoResize(e: React.FormEvent<HTMLTextAreaElement>) {
  const target = e.currentTarget;
  target.style.height = 'auto';
  target.style.height = target.scrollHeight + 'px';
}

const FieldRenderer = React.memo<FieldRendererProps>(function FieldRenderer({
  field,
  register,
  error,
  value,
  onChange,
  templateId,
  watchedHintValue,
  computedValue,
  dynamicOptions,
  controlled,
}) {
  const isOptional = field.priority === 'optional';
  const isRequired = field.priority === 'required';
  const labelClass = `block text-sm font-medium mb-1 ${
    isOptional ? 'text-gray-500' : 'text-gray-700'
  }`;
  const inputClass = `${baseInputClass} ${error ? 'border-red-500' : 'border-gray-300'}`;

  // Hint state
  const [hintExpanded, setHintExpanded] = useState(false);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filterText, setFilterText] = useState('');
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldAutocomplete =
    field.autocomplete === true && (field.type === 'text' || field.type === 'textarea');

  const fetchSuggestions = useCallback(async () => {
    if (!shouldAutocomplete) return;
    try {
      const data = await getFieldSuggestions(field.id, templateId);
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    }
  }, [field.id, templateId, shouldAutocomplete]);

  const handleFocus = () => {
    if (shouldAutocomplete) {
      fetchSuggestions();
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion to register
    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (onChange) {
      onChange(suggestion);
    }
    setShowSuggestions(false);
    setFilterText('');
  };

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  // Filter suggestions based on current input
  const filteredSuggestions = suggestions.filter((s) =>
    s.toLowerCase().includes(filterText.toLowerCase())
  ).slice(0, 5);

  const renderAutocompleteDropdown = () => {
    if (!showSuggestions || filteredSuggestions.length === 0) return null;
    return (
      <div
        ref={suggestionsRef}
        className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto"
      >
        {filteredSuggestions.map((suggestion, idx) => (
          <button
            key={idx}
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSuggestionClick(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    );
  };

  const renderField = () => {
    // Computed field: render as read-only display
    if (field.computed) {
      const displayValue = computedValue || '';
      const isError = displayValue === '__ERROR__';
      const isEmpty = !displayValue;
      const placeholder = field.computed.placeholder || '自动计算';
      const errorText = field.computed.errorText || '无法计算';

      let displayContent: string;
      let textClass: string;
      if (isError) {
        displayContent = errorText;
        textClass = 'text-red-500';
      } else if (isEmpty) {
        displayContent = placeholder;
        textClass = 'text-gray-400';
      } else {
        displayContent = displayValue;
        textClass = 'text-gray-900 font-medium';
      }

      return (
        <div
          className={`w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed ${textClass}`}
        >
          {displayContent}
        </div>
      );
    }

    switch (field.type) {
      case 'text':
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
        if (shouldAutocomplete) {
          const regProps = register(field.id, {
            required: field.required,
            pattern: field.validation?.pattern
              ? { value: field.validation.pattern, message: field.validation.patternMessage || '格式不正确' }
              : undefined,
          });
          return (
            <div className="relative">
              <input
                type="text"
                className={inputClass}
                placeholder={field.placeholder}
                {...regProps}
                onFocus={() => {
                  handleFocus();
                }}
                onBlur={(e) => {
                  regProps.onBlur(e);
                  handleBlur();
                }}
                onKeyDown={handleKeyDown}
                onChange={(e) => {
                  regProps.onChange(e);
                  setFilterText(e.target.value);
                }}
              />
              {renderAutocompleteDropdown()}
            </div>
          );
        }
        return (
          <input
            type="text"
            className={inputClass}
            placeholder={field.placeholder}
            {...register(field.id, {
              required: field.required,
              pattern: field.validation?.pattern
                ? { value: field.validation.pattern, message: field.validation.patternMessage || '格式不正确' }
                : undefined,
            })}
          />
        );

      case 'textarea':
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
        if (shouldAutocomplete) {
          const regProps = register(field.id, {
            required: field.required,
            pattern: field.validation?.pattern
              ? { value: field.validation.pattern, message: field.validation.patternMessage || '格式不正确' }
              : undefined,
          });
          return (
            <div className="relative">
              <textarea
                className={inputClass}
                placeholder={field.placeholder}
                style={{ minHeight: '80px' }}
                onInput={autoResize}
                {...regProps}
                onFocus={() => {
                  handleFocus();
                }}
                onBlur={(e) => {
                  regProps.onBlur(e);
                  handleBlur();
                }}
                onKeyDown={handleKeyDown}
                onChange={(e) => {
                  regProps.onChange(e);
                  setFilterText(e.target.value);
                }}
              />
              {renderAutocompleteDropdown()}
            </div>
          );
        }
        return (
          <textarea
            className={inputClass}
            placeholder={field.placeholder}
            style={{ minHeight: '80px' }}
            onInput={autoResize}
            {...register(field.id, {
              required: field.required,
              pattern: field.validation?.pattern
                ? { value: field.validation.pattern, message: field.validation.patternMessage || '格式不正确' }
                : undefined,
            })}
          />
        );

      case 'number':
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
            {...register(field.id, {
              required: field.required,
              min: field.validation?.min,
              max: field.validation?.max,
              valueAsNumber: true,
            })}
          />
        );

      case 'date':
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
            {...register(field.id, { required: field.required })}
          />
        );

      case 'select': {
        const selectOptions = dynamicOptions && dynamicOptions.length > 0
          ? dynamicOptions
          : field.options;
        if (controlled) {
          return (
            <select
              className={inputClass}
              value={(value as string) ?? ''}
              onChange={(e) => onChange?.(e.target.value)}
            >
              <option value="">{field.placeholder || '请选择...'}</option>
              {selectOptions?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          );
        }
        return (
          <select
            className={inputClass}
            {...register(field.id, { required: field.required })}
          >
            <option value="">{field.placeholder || '请选择...'}</option>
            {selectOptions?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }

      case 'radio':
        if (controlled) {
          return (
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              {field.options?.map((opt) => (
                <label
                  key={opt.value}
                  className="inline-flex items-center gap-2 cursor-pointer min-h-[44px] py-2"
                >
                  <input
                    type="radio"
                    value={opt.value}
                    className="text-indigo-600 focus:ring-indigo-500"
                    checked={value === opt.value}
                    onChange={() => onChange?.(opt.value)}
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          );
        }
        return (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
            {field.options?.map((opt) => (
              <label
                key={opt.value}
                className="inline-flex items-center gap-2 cursor-pointer min-h-[44px] py-2"
              >
                <input
                  type="radio"
                  value={opt.value}
                  className="text-indigo-600 focus:ring-indigo-500"
                  {...register(field.id, { required: field.required })}
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        // Single boolean checkbox (no options)
        if (!field.options || field.options.length === 0) {
          const isChecked = !!value;
          const isEmphasis = field.emphasis === true;

          if (isEmphasis) {
            return (
              <label
                className={`flex items-start gap-3 cursor-pointer group rounded-r-lg px-3 py-2 transition-colors border-l-4 ${
                  isChecked
                    ? 'bg-green-50 border-green-400'
                    : 'bg-blue-50/50 border-blue-400 hover:bg-blue-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={isChecked}
                  onChange={(e) => {
                    onChange?.(e.target.checked);
                  }}
                />
                <span
                  className={`text-base font-semibold transition-colors ${
                    isChecked ? 'text-green-800 line-through decoration-green-400' : 'text-gray-900'
                  }`}
                >
                  {field.label}
                </span>
              </label>
            );
          }

          return (
            <label
              className={`flex items-start gap-3 cursor-pointer group rounded-lg px-3 py-2 transition-colors ${
                isChecked ? 'bg-green-50' : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={isChecked}
                onChange={(e) => {
                  onChange?.(e.target.checked);
                }}
              />
              <span
                className={`text-sm group-hover:text-gray-900 transition-colors ${
                  isChecked ? 'text-green-700 line-through decoration-green-400' : 'text-gray-700'
                }`}
              >
                {field.label}
              </span>
            </label>
          );
        }
        // Multi-option checkbox group
        return (
          <div className="flex flex-wrap gap-3">
            {field.options.map((opt) => {
              const checked = Array.isArray(value) && value.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="inline-flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    value={opt.value}
                    checked={checked}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                    onChange={(e) => {
                      if (!onChange) return;
                      const current = Array.isArray(value) ? [...value] : [];
                      if (e.target.checked) {
                        onChange([...current, opt.value]);
                      } else {
                        onChange(current.filter((v: string) => v !== opt.value));
                      }
                    }}
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              );
            })}
          </div>
        );

      case 'rating': {
        const max = field.validation?.max || 5;
        const min = field.validation?.min || 1;
        const currentValue = typeof value === 'number' ? value : 0;
        return (
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: max - min + 1 }, (_, i) => i + min).map(
              (num) => (
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
              )
            )}
          </div>
        );
      }

      case 'table': {
        const columns = field.tableColumns || [];
        const rows: Record<string, string>[] = Array.isArray(value) ? (value as Record<string, string>[]) : [{}];

        const updateCell = (rowIdx: number, colId: string, cellValue: string) => {
          const newRows = rows.map((row, i) =>
            i === rowIdx ? { ...row, [colId]: cellValue } : row
          );
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

      default:
        return null;
    }
  };

  // Compute effective hint based on conditionalHints
  const effectiveHint = (
    field.conditionalHints && watchedHintValue && field.conditionalHints[watchedHintValue]
  ) || field.hint;

  const renderHint = () => {
    if (!effectiveHint) return null;
    const isLong = effectiveHint.length > 60;
    const displayText = isLong && !hintExpanded
      ? effectiveHint.slice(0, 60) + '...'
      : effectiveHint;

    const isConditional = !!(field.conditionalHints && watchedHintValue && field.conditionalHints[watchedHintValue]);

    return (
      <p className={`text-xs mt-1 italic ${isConditional ? 'text-indigo-500' : 'text-gray-400'}`}>
        <span className="mr-1">{isConditional ? '🎯' : '💡'}</span>
        {displayText}
        {isLong && (
          <button
            type="button"
            onClick={() => setHintExpanded(!hintExpanded)}
            className="ml-1 text-indigo-400 hover:text-indigo-600 underline"
          >
            {hintExpanded ? '收起' : '展开'}
          </button>
        )}
      </p>
    );
  };

  // Single checkbox uses a special inline layout
  const isSingleCheckbox = field.type === 'checkbox' && (!field.options || field.options.length === 0);

  if (isSingleCheckbox) {
    return (
      <div className="mb-4">
        {renderField()}
        {field.hint && (
          <p className="text-xs text-gray-400 mt-1 italic pl-8">
            <span className="mr-1">💡</span>
            {field.hint}
          </p>
        )}
        {error && <p className={`${errorClass} pl-8`}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label htmlFor={field.id} className={labelClass}>
        {field.label}
        {(field.required || isRequired) && <span className="text-red-500 ml-1">*</span>}
      </label>
      {renderField()}
      {renderHint()}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
});

FieldRenderer.displayName = 'FieldRenderer';

export default FieldRenderer;
