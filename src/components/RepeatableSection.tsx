import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { FormSection, FormField } from '@/types';
import FieldRenderer from './FieldRenderer';
import type { TemplateId } from '@/types';

interface RepeatableEntry {
  [fieldId: string]: unknown;
}

interface RepeatableSectionProps {
  section: FormSection;
  entries: RepeatableEntry[];
  onChange: (entries: RepeatableEntry[]) => void;
  templateId: TemplateId;
}

/**
 * RepeatableSection — 可重复填写 section 组件
 *
 * 用于支持多次定期检查记录（如投资持有期间的多次检查、每笔卖出的独立复盘）。
 * 每条记录以折叠卡片形式展示，支持展开编辑、删除、添加新记录。
 */
const RepeatableSection: React.FC<RepeatableSectionProps> = ({
  section,
  entries,
  onChange,
  templateId,
}) => {
  // Track which entries are expanded (by index)
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(() => {
    // If no entries, return empty set
    if (entries.length === 0) return new Set();
    // Default: expand the last entry
    return new Set([entries.length - 1]);
  });

  // entries 可能在挂载后异步加载（初始为空数组，随后回填历史数据），
  // 此时上面的 useState 初始化函数已经跑过、不会重新执行——
  // 用这个 effect 补一次「首次拿到非空数据时展开最后一条」
  const hasInitializedRef = useRef(entries.length > 0);
  useEffect(() => {
    if (!hasInitializedRef.current && entries.length > 0) {
      hasInitializedRef.current = true;
      setExpandedIndices(new Set([entries.length - 1]));
    }
  }, [entries.length]);

  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  const toggleExpand = useCallback((index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleAddEntry = useCallback(() => {
    // Build default values for new entry
    const newEntry: RepeatableEntry = {};
    const now = new Date();
    section.fields.forEach((f) => {
      if (f.type === 'table') {
        newEntry[f.id] = [{}];
      } else if (f.defaultValue !== undefined) {
        if (f.defaultValue === 'today' || f.defaultValue === 'auto_today') {
          newEntry[f.id] = now.toISOString().slice(0, 10);
        } else {
          newEntry[f.id] = f.defaultValue;
        }
      }
    });
    const newEntries = [...entries, newEntry];
    onChange(newEntries);
    // Expand the new entry
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      next.add(newEntries.length - 1);
      return next;
    });
  }, [entries, onChange, section.fields]);

  const handleDeleteEntry = useCallback(
    (index: number) => {
      const newEntries = entries.filter((_, i) => i !== index);
      onChange(newEntries);
      setDeleteConfirmIdx(null);
      // Adjust expanded indices
      setExpandedIndices((prev) => {
        const next = new Set<number>();
        prev.forEach((i) => {
          if (i < index) next.add(i);
          else if (i > index) next.add(i - 1);
        });
        return next;
      });
    },
    [entries, onChange]
  );

  const handleFieldChange = useCallback(
    (entryIndex: number, fieldId: string, value: unknown) => {
      const newEntries = [...entries];
      newEntries[entryIndex] = { ...newEntries[entryIndex], [fieldId]: value };
      onChange(newEntries);
    },
    [entries, onChange]
  );

  // Get entry title (date + sequence number)
  const getEntryTitle = (entry: RepeatableEntry, index: number): string => {
    // Look for a date field to use in the title
    const dateField = section.fields.find((f) => f.type === 'date');
    const dateValue = dateField ? (entry[dateField.id] as string) : undefined;
    const dateStr = dateValue ? ` - ${dateValue}` : '';
    return `第${index + 1}次检查${dateStr}`;
  };

  // Get entry summary for collapsed state
  const getEntrySummary = (entry: RepeatableEntry): string => {
    const parts: string[] = [];
    // Look for radio/select fields to show key status
    const statusFields = section.fields.filter(
      (f) => (f.type === 'radio' || f.type === 'select') && entry[f.id]
    );
    statusFields.slice(0, 2).forEach((f) => {
      const val = entry[f.id] as string;
      if (val) {
        const option = f.options?.find((o) => o.value === val);
        parts.push(option ? option.label : val);
      }
    });
    return parts.join(' · ');
  };

  // Check if field condition is met within entry context
  const isFieldVisible = (field: FormField, entry: RepeatableEntry): boolean => {
    if (!field.condition) return true;
    const dependsOnValue = entry[field.condition.dependsOn];
    const showWhen = field.condition.showWhen;
    if (Array.isArray(showWhen)) {
      return showWhen.includes(dependsOnValue as string);
    }
    return dependsOnValue === showWhen;
  };

  const renderEntryField = (field: FormField, entry: RepeatableEntry, entryIndex: number) => {
    if (!isFieldVisible(field, entry)) return null;

    const value = entry[field.id];
    const fieldKey = `${section.id}_${entryIndex}_${field.id}`;

    // No-op register for type compatibility (not used in controlled mode)
    const noopRegister = (() => ({
      name: field.id,
      onChange: () => {},
      onBlur: () => {},
      ref: () => {},
    })) as any;

    return (
      <div key={fieldKey} className="mb-3">
        <FieldRenderer
          field={field}
          register={noopRegister}
          value={value}
          onChange={(val) => handleFieldChange(entryIndex, field.id, val)}
          templateId={templateId}
          controlled
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {section.description && (
        <p className="text-sm text-gray-500 mb-4">{section.description}</p>
      )}

      {/* Existing entries */}
      {entries.map((entry, index) => {
        const isExpanded = expandedIndices.has(index);
        const title = getEntryTitle(entry, index);
        const summary = getEntrySummary(entry);

        return (
          <div
            key={index}
            className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm"
          >
            {/* Card header */}
            <div
              className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
              onClick={() => toggleExpand(index)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-gray-400 transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                >
                  ▶
                </span>
                <span className="font-medium text-sm text-gray-800 truncate">
                  {title}
                </span>
                {!isExpanded && summary && (
                  <span className="text-xs text-gray-400 truncate ml-2">
                    {summary}
                  </span>
                )}
              </div>

              {/* Delete button */}
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {deleteConfirmIdx === index ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-500">确认删除？</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(index)}
                      className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmIdx(null)}
                      className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmIdx(index)}
                    className="text-gray-400 hover:text-red-500 transition p-1"
                    title="删除此记录"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Card body (expanded) */}
            {isExpanded && (
              <div className="px-4 py-4 space-y-1">
                {section.fields.map((field) =>
                  renderEntryField(field, entry, index)
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add entry button */}
      <button
        type="button"
        onClick={handleAddEntry}
        className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/30 transition flex items-center justify-center gap-2"
      >
        <span className="text-lg leading-none">+</span>
        <span>{section.repeatLabel || '+ 添加一条记录'}</span>
      </button>

      {entries.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-2">
          暂无检查记录，点击上方按钮添加第一条
        </p>
      )}
    </div>
  );
};

export default RepeatableSection;
