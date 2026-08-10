/**
 * FieldRenderer — 表单字段渲染器
 *
 * 根据 FormField 的 type 配置分发到对应的输入组件（见 form/FieldInputs.tsx）：
 * - text / textarea: 文本输入（支持自动补全）
 * - number: 数字输入（支持 min/max 验证）
 * - date: 日期选择器
 * - select: 下拉选择（支持动态选项）
 * - radio: 单选按钮组
 * - checkbox: 复选框（支持单选布尔 / 多选组 / emphasis 强调样式）
 * - rating: 数字评分按钮组
 * - table: 表格行内编辑
 * - computed: 只读展示（公式自动计算）
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
import {
  TextInput,
  TextareaInput,
  NumberInput,
  DateInput,
  SelectInput,
  RadioInput,
  SingleCheckboxInput,
  CheckboxGroupInput,
  RatingInput,
  TableInput,
  QuadrantInput,
  ComputedDisplay,
  type InputFieldProps,
} from '@/components/form/FieldInputs';

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

  /** 统一传给输入组件的公共 props（字段/样式/双模式/自动补全） */
  const commonInputProps: InputFieldProps = {
    field,
    inputClass,
    register,
    controlled,
    value,
    onChange,
    dynamicOptions,
    autocomplete: shouldAutocomplete
      ? {
          enabled: true,
          onFocus: handleFocus,
          onBlur: handleBlur,
          onKeyDown: handleKeyDown,
          setFilterText,
          renderDropdown: renderAutocompleteDropdown,
        }
      : undefined,
  };

  /** 按字段类型分发到对应输入组件（计算字段走只读展示） */
  const renderField = () => {
    if (field.computed) return <ComputedDisplay field={field} computedValue={computedValue} />;
    switch (field.type) {
      case 'text': return <TextInput {...commonInputProps} />;
      case 'textarea': return <TextareaInput {...commonInputProps} />;
      case 'number': return <NumberInput {...commonInputProps} />;
      case 'date': return <DateInput {...commonInputProps} />;
      case 'select': return <SelectInput {...commonInputProps} />;
      case 'radio': return <RadioInput {...commonInputProps} />;
      case 'checkbox':
        return field.options && field.options.length > 0
          ? <CheckboxGroupInput {...commonInputProps} />
          : <SingleCheckboxInput {...commonInputProps} />;
      case 'rating': return <RatingInput {...commonInputProps} />;
      case 'table': return <TableInput {...commonInputProps} />;
      case 'quadrant': return <QuadrantInput {...commonInputProps} />;
      default: return null;
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
