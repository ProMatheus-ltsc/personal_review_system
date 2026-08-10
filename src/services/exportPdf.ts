/**
 * PDF 导出服务
 *
 * 将复盘记录渲染为带排版的 PDF 文件并下载。
 * 实现方式：先构建 HTML → html2canvas 截图 → jsPDF 拼接为 A4 页面。
 *
 * 导出流程：
 * 1. 根据模板和记录数据生成 HTML 字符串
 * 2. 创建隐藏 DOM 容器并渲染 HTML
 * 3. 使用 html2canvas 将 DOM 截图为 Canvas
 * 4. 按 A4 尺寸（210×297mm）分页写入 PDF
 * 5. 清理临时 DOM 并触发下载
 *
 * 注意：生成的 PDF 为图片型（非文本型），不支持复制文字。
 */
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { FormRecord, FormTemplate, FormField } from '@/types';
import { DEFAULT_QUADRANTS, DEFAULT_DRAG_QUADRANTS, isQuadrantMatrix, isDragMatrixValue } from '@/constants/quadrant';
import { migrateLegacyMatrixData } from '@/services/legacyMigrate';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

/** 将拖拽决策矩阵渲染为 HTML（按成本×效果象限分组的列表） */
function formatDragMatrixHtml(field: FormField, value: unknown): string {
  if (!isDragMatrixValue(value)) {
    return `<div style="margin-bottom: 10px; font-size: 14px; color: #999;">（未填写）</div>`;
  }
  const quadrants = field.dragQuadrants && field.dragQuadrants.length === 4 ? field.dragQuadrants : DEFAULT_DRAG_QUADRANTS;
  let html = '';
  quadrants.forEach((q) => {
    const items = (value[q.key] || []).filter((t) => t && String(t).trim());
    html += `<div style="margin: 8px 0 4px; font-size: 14px; font-weight: 600; color: #444;">${q.label}（${q.desc}）</div>`;
    if (items.length === 0) {
      html += `<div style="font-size: 13px; color: #999; margin-left: 12px;">（未填写）</div>`;
    } else {
      html += '<ul style="margin: 4px 0 8px 24px; font-size: 13px; color: #555;">';
      items.forEach((it) => { html += `<li>${it}</li>`; });
      html += '</ul>';
    }
  });
  return html;
}

/** 将四象限矩阵渲染为 HTML（按象限分组的列表） */
function formatQuadrantMatrixHtml(field: FormField, value: unknown): string {
  if (!isQuadrantMatrix(value)) {
    return `<div style="margin-bottom: 10px; font-size: 14px; color: #999;">（未填写）</div>`;
  }
  const quadrants = field.quadrants && field.quadrants.length === 4 ? field.quadrants : DEFAULT_QUADRANTS;
  let html = '';
  quadrants.forEach((q) => {
    const items = (value[q.key] || []).filter((it) => it && it.text && String(it.text).trim());
    html += `<div style="margin: 8px 0 4px; font-size: 14px; font-weight: 600; color: #444;">${q.label}（${q.action}）</div>`;
    if (items.length === 0) {
      html += `<div style="font-size: 13px; color: #999; margin-left: 12px;">（未填写）</div>`;
    } else {
      html += '<ul style="margin: 4px 0 8px 24px; font-size: 13px; color: #555;">';
      items.forEach((it) => { html += `<li>${it.text}</li>`; });
      html += '</ul>';
    }
  });
  return html;
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
      return String(value).replace(/\n/g, '<br/>');
    }
    case 'quadrant': {
      return formatQuadrantMatrixHtml(field, value);
    }
    case 'dragMatrix': {
      return formatDragMatrixHtml(field, value);
    }
    default:
      return String(value);
  }
}

function buildHtml(record: FormRecord, template: FormTemplate): string {
  // 旧结构数据读取时迁移（日/周复盘：睡前三问/旧字段 → 新结构），保证导出内容完整
  const data = migrateLegacyMatrixData(template.id, record.data);
  let html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.6;">
      <h1 style="font-size: 24px; margin-bottom: 8px; font-weight: 700;">${template.name}</h1>
      <div style="font-size: 13px; color: #666; margin-bottom: 4px;">
        <span>填写时间: ${formatDate(record.createdAt)}</span>
        <span style="margin-left: 24px;">状态: ${record.status === 'completed' ? '已完成' : '草稿'}</span>
      </div>
      <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
  `;

  for (const section of template.sections) {
    html += `<h2 style="font-size: 18px; font-weight: 600; margin-top: 28px; margin-bottom: 12px; color: #333;">${section.title}</h2>`;

    // Handle repeatable sections
    if (section.repeatable) {
      const entriesKey = `${section.id}_entries`;
      const entries = data[entriesKey] as Record<string, unknown>[] | undefined;
      if (!entries || entries.length === 0) {
        html += `<div style="margin-bottom: 10px; font-size: 14px; color: #999;">\uff08\u65e0\u8bb0\u5f55\uff09</div>`;
      } else {
        entries.forEach((entry, idx) => {
          const dateField = section.fields.find((f) => f.type === 'date');
          const dateValue = dateField ? (entry[dateField.id] as string) : undefined;
          const dateStr = dateValue ? ` - ${formatDate(dateValue)}` : '';
          html += `<h3 style="font-size: 15px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; color: #444;">\u7b2c${idx + 1}\u6b21\u68c0\u67e5${dateStr}</h3>`;

          for (const field of section.fields) {
            const value = entry[field.id];

            if (field.type === 'table' && Array.isArray(value) && field.tableColumns) {
              const columns = field.tableColumns;
              const rows = value.filter((row: Record<string, string>) =>
                columns.some((col) => String(row[col.id] ?? '').trim() !== '')
              );
              html += `<h4 style="font-size: 14px; font-weight: 600; margin-top: 12px; margin-bottom: 6px; color: #555;">${field.label}</h4>`;
              if (rows.length === 0) {
                html += `<div style="margin-bottom: 10px; font-size: 14px; color: #999;">\uff08\u672a\u586b\u5199\uff09</div>`;
              } else {
                html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px;">`;
                html += '<tr>';
                for (const col of columns) {
                  html += `<th style="border: 1px solid #ddd; padding: 6px 8px; background: #f5f5f5; text-align: left; font-weight: 600;">${col.label}</th>`;
                }
                html += '</tr>';
                for (const row of rows) {
                  html += '<tr>';
                  for (const col of columns) {
                    html += `<td style="border: 1px solid #ddd; padding: 6px 8px;">${(row as Record<string, string>)[col.id] || ''}</td>`;
                  }
                  html += '</tr>';
                }
                html += '</table>';
              }
            } else if (field.type !== 'table' && field.type !== 'quadrant' && field.type !== 'dragMatrix') {
              const formatted = formatFieldValue(field, value);
              html += `
                <div style="margin-bottom: 10px;">
                  <span style="font-weight: 600; font-size: 14px; color: #444;">${field.label}: </span>
                  <span style="font-size: 14px; color: #555;">${formatted}</span>
                </div>
              `;
            } else if (field.type === 'quadrant') {
              html += `<h4 style="font-size: 14px; font-weight: 600; margin-top: 12px; margin-bottom: 6px; color: #555;">${field.label}</h4>`;
              html += formatQuadrantMatrixHtml(field, value);
            } else if (field.type === 'dragMatrix') {
              html += `<h4 style="font-size: 14px; font-weight: 600; margin-top: 12px; margin-bottom: 6px; color: #555;">${field.label}</h4>`;
              html += formatDragMatrixHtml(field, value);
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
          columns.some((col) => String(row[col.id] ?? '').trim() !== '')
        );

        html += `<h3 style="font-size: 15px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; color: #444;">${field.label}</h3>`;

        if (rows.length === 0) {
          html += `<div style="margin-bottom: 10px; font-size: 14px; color: #999;">（未填写）</div>`;
        } else {
          html += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px;">`;
          // Header
          html += '<tr>';
          for (const col of columns) {
            html += `<th style="border: 1px solid #ddd; padding: 6px 8px; background: #f5f5f5; text-align: left; font-weight: 600;">${col.label}</th>`;
          }
          html += '</tr>';
          // Data rows
          for (const row of rows) {
            html += '<tr>';
            for (const col of columns) {
              html += `<td style="border: 1px solid #ddd; padding: 6px 8px;">${(row as Record<string, string>)[col.id] || ''}</td>`;
            }
            html += '</tr>';
          }
          html += '</table>';
        }
      } else if (field.type !== 'table' && field.type !== 'quadrant' && field.type !== 'dragMatrix') {
        const formatted = formatFieldValue(field, value);
        html += `
          <div style="margin-bottom: 10px;">
            <span style="font-weight: 600; font-size: 14px; color: #444;">${field.label}: </span>
            <span style="font-size: 14px; color: #555;">${formatted}</span>
          </div>
        `;
      } else if (field.type === 'quadrant') {
        html += `<h3 style="font-size: 15px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; color: #444;">${field.label}</h3>`;
        html += formatQuadrantMatrixHtml(field, value);
      } else if (field.type === 'dragMatrix') {
        html += `<h3 style="font-size: 15px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; color: #444;">${field.label}</h3>`;
        html += formatDragMatrixHtml(field, value);
      }
    }
  }

  html += '</div>';
  return html;
}

export async function exportToPdf(record: FormRecord, template: FormTemplate): Promise<void> {
  // Create temporary hidden div
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.background = '#fff';
  container.innerHTML = buildHtml(record, template);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pdf = new jsPDF('p', 'mm', 'a4');

    let heightLeft = imgHeight;
    let position = 0;
    let pageNumber = 1;

    // First page
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      0,
      position,
      imgWidth,
      imgHeight
    );
    // Add page number
    pdf.setFontSize(10);
    pdf.setTextColor(150);
    pdf.text(`${pageNumber}`, imgWidth / 2, pageHeight - 5, { align: 'center' });
    heightLeft -= pageHeight;

    // Additional pages
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pageNumber++;
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        position,
        imgWidth,
        imgHeight
      );
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text(`${pageNumber}`, imgWidth / 2, pageHeight - 5, { align: 'center' });
      heightLeft -= pageHeight;
    }

    const datePart = record.createdAt.split('T')[0] || record.createdAt.slice(0, 10);
    const filename = `${template.name}_${datePart}.pdf`;
    pdf.save(filename);
  } finally {
    // Clean up
    document.body.removeChild(container);
  }
}
