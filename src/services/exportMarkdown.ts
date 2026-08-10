/**
 * Markdown 导出服务
 *
 * 将复盘记录转换为结构化的 Markdown 文档并下载。
 * 适用于归档到个人知识库（如 Obsidian、Notion）或版本控制系统。
 *
 * 转换规则：
 * - 模板名称 → 一级标题
 * - 每个 section → 二级标题
 * - textarea 类型字段 → 独立段落（保留换行）
 * - 其他字段类型 → 「标签: 值」格式（select/radio 显示 label 而非 value）
 * - 空值统一显示为「（未填写）」
 */
import { FormRecord, FormTemplate, FormField } from '@/types';
import { DEFAULT_QUADRANTS, DEFAULT_DRAG_QUADRANTS, isQuadrantMatrix, isDragMatrixValue } from '@/constants/quadrant';
import { migrateLegacyMatrixData } from '@/services/legacyMigrate';

/** 将 ISO 日期字符串格式化为中文日期（如「2024年3月15日」） */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

/** 将四象限矩阵渲染为 Markdown 列表（按象限分组） */
function formatQuadrantMatrix(field: FormField, value: unknown): string {
  if (!isQuadrantMatrix(value)) return '（未填写）';
  const quadrants = field.quadrants && field.quadrants.length === 4 ? field.quadrants : DEFAULT_QUADRANTS;
  const lines: string[] = [];
  quadrants.forEach((q) => {
    const items = (value[q.key] || []).filter((it) => it && it.text && String(it.text).trim());
    lines.push(`**${q.label}**（${q.action}）`);
    if (items.length === 0) {
      lines.push('- （未填写）');
    } else {
      items.forEach((it) => lines.push(`- ${it.text}`));
    }
    lines.push('');
  });
  return lines.join('\n');
}

/** 将拖拽决策矩阵渲染为 Markdown 列表（按成本×效果象限分组） */
function formatDragMatrix(field: FormField, value: unknown): string {
  if (!isDragMatrixValue(value)) return '（未填写）';
  const quadrants = field.dragQuadrants && field.dragQuadrants.length === 4 ? field.dragQuadrants : DEFAULT_DRAG_QUADRANTS;
  const lines: string[] = [];
  quadrants.forEach((q) => {
    const items = (value[q.key] || []).filter((t) => t && String(t).trim());
    lines.push(`**${q.label}**（${q.desc}）`);
    if (items.length === 0) {
      lines.push('- （未填写）');
    } else {
      items.forEach((it) => lines.push(`- ${it}`));
    }
    lines.push('');
  });
  return lines.join('\n');
}

function formatFieldValue(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '（未填写）';
  }

  switch (field.type) {
    case 'select':
    case 'radio': {
      const option = field.options?.find((opt) => opt.value === value);
      return option ? option.label : String(value);
    }
    case 'checkbox': {
      if (Array.isArray(value)) {
        if (value.length === 0) return '（未填写）';
        const labels = value.map((v) => {
          const option = field.options?.find((opt) => opt.value === v);
          return option ? option.label : String(v);
        });
        return labels.join('、');
      }
      // Boolean checkbox (single)
      return value ? '✓' : '✗';
    }
    case 'date': {
      return formatDate(String(value));
    }
    case 'number': {
      if (field.validation?.max === 100) {
        return `${value}%`;
      }
      return String(value);
    }
    case 'textarea': {
      return String(value);
    }
    case 'quadrant': {
      return formatQuadrantMatrix(field, value);
    }
    case 'dragMatrix': {
      return formatDragMatrix(field, value);
    }
    default:
      return String(value);
  }
}

export function exportToMarkdown(record: FormRecord, template: FormTemplate): string {
  const lines: string[] = [];
  // 旧结构数据读取时迁移（日/周复盘：睡前三问/旧字段 → 新结构），保证导出内容完整
  const data = migrateLegacyMatrixData(template.id, record.data);

  lines.push(`# ${template.name}`);
  lines.push('');
  lines.push(`**填写时间**: ${formatDate(record.createdAt)}`);
  lines.push(`**状态**: ${record.status === 'completed' ? '已完成' : '草稿'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const section of template.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    // Handle repeatable sections
    if (section.repeatable) {
      const entriesKey = `${section.id}_entries`;
      const entries = data[entriesKey] as Record<string, unknown>[] | undefined;
      if (!entries || entries.length === 0) {
        lines.push('（无记录）');
        lines.push('');
      } else {
        entries.forEach((entry, idx) => {
          // Try to get date for title
          const dateField = section.fields.find((f) => f.type === 'date');
          const dateValue = dateField ? (entry[dateField.id] as string) : undefined;
          const dateStr = dateValue ? ` - ${formatDate(dateValue)}` : '';
          lines.push(`### 第${idx + 1}次检查${dateStr}`);
          lines.push('');

          for (const field of section.fields) {
            const value = entry[field.id];

            if (field.type === 'table' && Array.isArray(value) && field.tableColumns) {
              const columns = field.tableColumns;
              const rows = value.filter((row: Record<string, string>) =>
                columns.some((col) => String(row[col.id] ?? '').trim() !== '')
              );
              lines.push(`#### ${field.label}`);
              lines.push('');
              if (rows.length === 0) {
                lines.push('（未填写）');
                lines.push('');
              } else {
                const header = '| ' + columns.map((col) => col.label).join(' | ') + ' |';
                const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';
                const dataRows = rows.map((row: Record<string, string>) =>
                  '| ' + columns.map((col) => row[col.id] || '').join(' | ') + ' |'
                );
                lines.push(header);
                lines.push(separator);
                dataRows.forEach((row) => lines.push(row));
                lines.push('');
              }
            } else if (field.type === 'textarea' && value) {
              lines.push(`**${field.label}**:`);
              lines.push('');
              lines.push(String(value));
              lines.push('');
            } else if (field.type === 'quadrant') {
              lines.push(`#### ${field.label}`);
              lines.push('');
              lines.push(formatQuadrantMatrix(field, value));
            } else if (field.type === 'dragMatrix') {
              lines.push(`#### ${field.label}`);
              lines.push('');
              lines.push(formatDragMatrix(field, value));
            } else if (field.type !== 'table') {
              const formatted = formatFieldValue(field, value);
              lines.push(`**${field.label}**: ${formatted}`);
              lines.push('');
            }
          }
        });
      }
      continue;
    }

    for (const field of section.fields) {
      const value = data[field.id];

      if (field.type === 'table' && Array.isArray(value) && field.tableColumns) {
        const columns = field.tableColumns;
        // Filter out rows where all columns are empty
        const rows = value.filter((row: Record<string, string>) =>
          columns.some((col) => row[col.id] && row[col.id].trim() !== '')
        );

        lines.push(`### ${field.label}`);
        lines.push('');

        if (rows.length === 0) {
          lines.push('（未填写）');
          lines.push('');
        } else {
          // Header row
          const header = '| ' + columns.map((col) => col.label).join(' | ') + ' |';
          // Separator row
          const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';
          // Data rows
          const dataRows = rows.map((row: Record<string, string>) =>
            '| ' + columns.map((col) => row[col.id] || '').join(' | ') + ' |'
          );

          lines.push(header);
          lines.push(separator);
          dataRows.forEach((row) => lines.push(row));
          lines.push('');
        }
      } else if (field.type === 'textarea' && value) {
        lines.push(`**${field.label}**:`);
        lines.push('');
        lines.push(String(value));
        lines.push('');
      } else if (field.type === 'quadrant') {
        lines.push(`### ${field.label}`);
        lines.push('');
        lines.push(formatQuadrantMatrix(field, value));
      } else if (field.type === 'dragMatrix') {
        lines.push(`### ${field.label}`);
        lines.push('');
        lines.push(formatDragMatrix(field, value));
      } else if (field.type !== 'table') {
        const formatted = formatFieldValue(field, value);
        lines.push(`**${field.label}**: ${formatted}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

export function downloadMarkdown(record: FormRecord, template: FormTemplate): void {
  const markdown = exportToMarkdown(record, template);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const datePart = record.createdAt.split('T')[0] || record.createdAt.slice(0, 10);
  const filename = `${template.name}_${datePart}.md`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
