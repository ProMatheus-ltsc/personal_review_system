/**
 * PDF 导出服务
 *
 * 将复盘记录渲染为带排版的 PDF 文件并下载。
 * 实现方式：@react-pdf/renderer 把 <PdfReport> 组件编译为 PDF Blob（文本型、可复制、A4 自动分页），
 * 再通过临时 <a download> 触发浏览器下载。
 *
 * 导出流程：
 * 1. 用记录与模板数据渲染 <PdfReport> 虚拟组件（排版逻辑见 src/components/PdfReport.tsx）
 * 2. 调用 pdf(...).toBlob() 生成 PDF 二进制
 * 3. 创建临时 <a download> 触发下载并释放 ObjectURL
 */
import { pdf } from '@react-pdf/renderer';
import type { FormRecord, FormTemplate } from '@/types';
import { PdfReport } from '@/components/PdfReport';

export async function exportToPdf(record: FormRecord, template: FormTemplate): Promise<void> {
  const blob = await pdf(<PdfReport record={record} template={template} />).toBlob();

  const datePart = record.createdAt.split('T')[0];
  const filename = `${template.name}_${datePart}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
