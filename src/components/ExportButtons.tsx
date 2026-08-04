/**
 * ExportButtons — 记录导出按钮组
 *
 * 提供两种导出格式：
 * - Markdown：即时生成并下载 .md 文件，适合归档和知识库
 * - PDF：通过 html2canvas + jsPDF 生成带排版的 PDF，适合打印和分享
 *
 * PDF 生成为异步操作，期间按钮显示 loading 状态防止重复点击。
 */
import { useState } from 'react';
import { FormRecord, FormTemplate } from '@/types';
import { downloadMarkdown } from '@/services/exportMarkdown';
import { exportToPdf } from '@/services/exportPdf';

interface ExportButtonsProps {
  record: FormRecord;
  template: FormTemplate;
}

export default function ExportButtons({ record, template }: ExportButtonsProps) {
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleMarkdownExport = () => {
    downloadMarkdown(record, template);
  };

  const handlePdfExport = async () => {
    setPdfLoading(true);
    try {
      await exportToPdf(record, template);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="flex flex-row gap-3">
      <button
        onClick={handleMarkdownExport}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        📄 导出 Markdown
      </button>
      <button
        onClick={handlePdfExport}
        disabled={pdfLoading}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pdfLoading ? (
          <>
            <span className="inline-block animate-spin mr-1">⏳</span>
            生成中...
          </>
        ) : (
          '📋 导出 PDF'
        )}
      </button>
    </div>
  );
}
