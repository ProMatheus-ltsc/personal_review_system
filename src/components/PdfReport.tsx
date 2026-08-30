/**
 * PDF 报告组件：把一次复盘记录的内容排版为 A4 PDF 文档。
 * 结构：标题（模板名）→ 元信息（填写时间 / 状态徽章）→ 按模板 section 顺序
 * 逐节输出字段值（可重复段逐条编号"第N次检查"）→ 页脚为报告生成时间。
 * 核心概念：这是一个"虚拟组件"，不会在页面渲染，而是被 @react-pdf/renderer 编译成 PDF；
 * 样式使用 StyleSheet.create 声明的 PDF 专用样式（flex 布局、单位为 pt）。
 */
import { Font, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { registerPdfChineseFont } from '@shared/core/utils/pdfFont';
import type { FormRecord, FormTemplate, FormField, TableColumn } from '@/types';
import { DEFAULT_QUADRANTS, DEFAULT_DRAG_QUADRANTS, isQuadrantMatrix, isDragMatrixValue } from '@/constants/quadrant';
import { migrateLegacyMatrixData } from '@/services/legacyMigrate';

// 中文字体本地化：fonts.gstatic.com 在部分网络不可达，远程 fetch 会导致 toBlob() 抛 Failed to fetch；
// 字体文件随 public/fonts/ 分发，注册逻辑沉淀在 @shared/core/utils/pdfFont
registerPdfChineseFont(Font, import.meta.env.BASE_URL);

/** PDF 专用样式表：类似 CSS，但由 react-pdf 解析（flexDirection、marginTop 等命名与 Web 略有差异） */
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Noto Sans SC', fontSize: 10, color: '#1e293b' },
  header: { marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#4f46e5', marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  metaText: { fontSize: 9, color: '#64748b', marginRight: 16 },
  badge: { fontSize: 9, color: '#059669', backgroundColor: '#ecfdf5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  section: { marginTop: 14, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#334155', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' },
  entry: { marginBottom: 8, paddingLeft: 8 },
  entryTitle: { fontSize: 10, fontWeight: 'bold', color: '#6366f1', marginBottom: 4 },
  field: { marginBottom: 6 },
  fieldLabel: { fontSize: 9, fontWeight: 'bold', color: '#64748b', marginBottom: 2 },
  fieldValue: { fontSize: 10, color: '#1e293b', lineHeight: 1.5 },
  emptyText: { fontSize: 9, color: '#94a3b8' },
  quadrantBlock: { marginBottom: 6 },
  quadrantTitle: { fontSize: 10, fontWeight: 'bold', color: '#475569', marginBottom: 2 },
  quadrantItem: { fontSize: 10, color: '#334155', lineHeight: 1.5, paddingLeft: 10 },
  table: { marginTop: 2, borderWidth: 1, borderColor: '#e2e8f0' },
  tableRow: { flexDirection: 'row' },
  tableHeaderCell: { flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  tableBodyCell: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: '#e2e8f0', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  tableHeaderText: { fontSize: 9, fontWeight: 'bold', color: '#475569' },
  tableCellText: { fontSize: 9, color: '#334155', lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', fontSize: 8, color: '#94a3b8' },
});

/** 日期格式化为「YYYY年M月D日」（无效日期原样返回） */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 简单字段的显示文本：select/radio 解析选项 label，checkbox 多选拼接，date 转中文日期，number 满分加 % */
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
    default:
      // textarea 的换行符由 react-pdf 的 Text 原生保留为换行
      return String(value);
  }
}

/** 四象限矩阵（重要×紧急）：按象限分组输出列表 */
function QuadrantMatrixView({ field, value }: { field: FormField; value: unknown }) {
  if (!isQuadrantMatrix(value)) {
    return <Text style={styles.emptyText}>（未填写）</Text>;
  }
  const quadrants = field.quadrants && field.quadrants.length === 4 ? field.quadrants : DEFAULT_QUADRANTS;
  return (
    <View>
      {quadrants.map((q) => {
        const items = (value[q.key] || []).filter((it) => it && it.text && String(it.text).trim());
        return (
          <View key={q.key} style={styles.quadrantBlock}>
            <Text style={styles.quadrantTitle}>{q.label}（{q.action}）</Text>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>（未填写）</Text>
            ) : (
              items.map((it) => (
                <Text key={it.id} style={styles.quadrantItem}>• {it.text}</Text>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

/** 拖拽决策矩阵（成本×效果）：按象限分组输出选项文本列表 */
function DragMatrixView({ field, value }: { field: FormField; value: unknown }) {
  if (!isDragMatrixValue(value)) {
    return <Text style={styles.emptyText}>（未填写）</Text>;
  }
  const quadrants = field.dragQuadrants && field.dragQuadrants.length === 4 ? field.dragQuadrants : DEFAULT_DRAG_QUADRANTS;
  return (
    <View>
      {quadrants.map((q) => {
        const items = (value[q.key] || []).filter((t) => t && String(t).trim());
        return (
          <View key={q.key} style={styles.quadrantBlock}>
            <Text style={styles.quadrantTitle}>{q.label}（{q.desc}）</Text>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>（未填写）</Text>
            ) : (
              items.map((it, idx) => (
                <Text key={idx} style={styles.quadrantItem}>• {it}</Text>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

/** 表格字段：过滤全空行后按 tableColumns 输出表头 + 数据行 */
function TableView({ columns, value }: { columns: TableColumn[]; value: unknown[] }) {
  const rows = value.filter((row) =>
    columns.some((col) => String((row as Record<string, string>)?.[col.id] ?? '').trim() !== '')
  );
  if (rows.length === 0) {
    return <Text style={styles.emptyText}>（未填写）</Text>;
  }
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        {columns.map((col) => (
          <View key={col.id} style={styles.tableHeaderCell}>
            <Text style={styles.tableHeaderText}>{col.label}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, idx) => (
        <View key={idx} style={styles.tableRow} wrap={false}>
          {columns.map((col) => (
            <View key={col.id} style={styles.tableBodyCell}>
              <Text style={styles.tableCellText}>{String((row as Record<string, string>)[col.id] || '')}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * 单个字段的 PDF 渲染：表格 / 象限矩阵 / 拖拽矩阵走专属排版，其余按「标签 + 文本」输出。
 * 表格字段仅在值为数组且定义了列时渲染（与旧 HTML 导出的行为一致）。
 */
function FieldView({ field, value }: { field: FormField; value: unknown }) {
  if (field.type === 'table') {
    if (!Array.isArray(value) || !field.tableColumns) return null;
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <TableView columns={field.tableColumns} value={value} />
      </View>
    );
  }
  if (field.type === 'quadrant' || field.type === 'dragMatrix') {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        {field.type === 'quadrant'
          ? <QuadrantMatrixView field={field} value={value} />
          : <DragMatrixView field={field} value={value} />}
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <Text style={styles.fieldValue}>{formatFieldValue(field, value)}</Text>
    </View>
  );
}

interface PdfReportProps {
  /** 复盘记录（导出内容的数据源） */
  record: FormRecord;
  /** 复盘模板（决定 PDF 里的章节结构与字段标签） */
  template: FormTemplate;
}

/**
 * PDF 报告文档组件。
 * @param record 复盘记录（导出内容的的数据源）
 * @param template 模板（决定章节结构与字段标签）
 */
export function PdfReport({ record, template }: PdfReportProps) {
  // 旧结构数据读取时迁移（日/周复盘：睡前三问/旧字段 → 新结构），保证导出内容完整
  const data = migrateLegacyMatrixData(template.id, record.data);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{template.name}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>填写时间：{formatDate(record.createdAt)}</Text>
            <View style={styles.badge}>
              <Text>{record.status === 'completed' ? '已完成' : '草稿'}</Text>
            </View>
          </View>
        </View>

        {template.sections.map((section) => {
          if (!section.repeatable) {
            // 普通段：直接按字段输出
            return (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.fields.map((field) => (
                  <FieldView key={field.id} field={field} value={data[field.id]} />
                ))}
              </View>
            );
          }

          // 可重复段：entriesKey = `${section.id}_entries`，逐条编号"第N次检查"
          const entries = data[`${section.id}_entries`] as Record<string, unknown>[] | undefined;
          return (
            <View key={section.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {!entries || entries.length === 0 ? (
                <Text style={styles.emptyText}>（无记录）</Text>
              ) : (
                entries.map((entry, idx) => {
                  const dateField = section.fields.find((f) => f.type === 'date');
                  const dateValue = dateField ? (entry[dateField.id] as string) : undefined;
                  return (
                    <View key={idx} style={styles.entry}>
                      <Text style={styles.entryTitle}>
                        第{idx + 1}次检查{dateValue ? ` - ${formatDate(dateValue)}` : ''}
                      </Text>
                      {section.fields.map((field) => (
                        <FieldView key={field.id} field={field} value={entry[field.id]} />
                      ))}
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        <Text style={styles.footer} fixed>
          复盘报告 · {template.name} · 生成于 {new Date().toLocaleDateString('zh-CN')}
        </Text>
      </Page>
    </Document>
  );
}
