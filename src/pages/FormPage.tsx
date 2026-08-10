/**
 * FormPage — 表单填写/编辑页
 *
 * 根据 URL 参数中的 templateId 加载对应模板，渲染 FormRenderer。
 * 支持两种模式：
 * - 新建模式：无 recordId 参数，创建空白表单
 * - 编辑模式：有 recordId 参数，加载已有记录回填表单
 *
 * 额外功能：
 * - 已完成记录显示导出按钮（Markdown / PDF）
 * - 年度复盘模板时显示 ReferenceSidebar 侧栏
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { templates } from '@/templates';
import FormRenderer from '@/components/FormRenderer';
import InvestmentEntry from '@/components/InvestmentEntry';
import ExportButtons from '@/components/ExportButtons';
import { useRecord } from '@/hooks/useDB';
import type { FormRecord } from '@/types';

import { isInvestmentTemplate } from '@/constants/templateMeta';

/**
 * FormPage — 表单填写/编辑页（组件实现）
 * 投资检查清单新建模式（无 recordId）走 InvestmentEntry 代码中心入口；
 * 其余模板/编辑模式直接渲染 FormRenderer。
 */
const FormPage: React.FC = () => {
  const { templateId, recordId } = useParams<{
    templateId: string;
    recordId?: string;
  }>();
  const navigate = useNavigate();
  const [savedRecord, setSavedRecord] = React.useState<FormRecord | null>(null);

  const template = templates.find((t) => t.id === templateId);
  const { record, loading } = useRecord(recordId);

  const handleSave = (rec: FormRecord) => {
    setSavedRecord(rec);
  };

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            模板未找到
          </h2>
          <p className="text-gray-500 mb-4">
            请求的模板不存在，请返回仪表盘重新选择。
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
          >
            返回仪表盘
          </button>
        </div>
      </div>
    );
  }

  if (recordId && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">加载中...</span>
        </div>
      </div>
    );
  }

  // 记录不存在（recordId 存在但 record 加载失败 / 为空）：友好提示，避免静默渲染空表单
  if (recordId && !record) {
    return (
      <div>
        <header className="bg-white border-b border-gray-200 sticky top-14 md:top-16 z-10 -mx-4 md:-mx-6 px-4 md:px-6">
          <div className="max-w-3xl mx-auto py-3 flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition mr-4"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回
            </button>
            <span className="text-sm text-gray-400">{template.name}</span>
          </div>
        </header>
        <main className="py-6">
          <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-lg p-8 text-center">
            <div className="text-5xl mb-3">📭</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">记录不存在或已被删除</h2>
            <p className="text-sm text-gray-500 mb-6">
              该记录可能来自之前的测试会话，或已被清除。请返回新建或选择其他记录。
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => navigate(isInvestmentTemplate(template.id) ? '/' : `/history/${template.id}`)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
              >
                {isInvestmentTemplate(template.id) ? '去新建' : '查看历史'}
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                返回上一页
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 投资检查清单新建模式：先进入股票代码中心入口（选择操作）
  if (templateId === 'investment_checklist_buy' && !recordId) {
    return (
      <div>
        <header className="bg-white border-b border-gray-200 sticky top-14 md:top-16 z-10 -mx-4 md:-mx-6 px-4 md:px-6">
          <div className="max-w-3xl mx-auto py-3 flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition mr-4"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回
            </button>
            <span className="text-sm text-gray-400">{template.name}</span>
          </div>
        </header>
        <main className="py-6">
          <InvestmentEntry />
        </main>
      </div>
    );
  }

  const initialData = record
    ? { ...record.data, _createdAt: record.createdAt, _status: record.status }
    : undefined;

  return (
    <div>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-14 md:top-16 z-10 -mx-4 md:-mx-6 px-4 md:px-6">
        <div className="max-w-3xl mx-auto py-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition mr-4"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            返回
          </button>
          <span className="text-sm text-gray-400">{template.name}</span>
        </div>
      </header>

      {/* Form content */}
      <main className="py-6">
        <FormRenderer
          template={template}
          initialData={initialData}
          recordId={recordId}
          onSave={handleSave}
        />

        {/* Export buttons - show when record exists */}
        {(savedRecord || record) && template && (
          <div className="max-w-3xl mx-auto mt-6 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-3">导出记录</p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <ExportButtons
                record={(savedRecord || record)!}
                template={template}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default FormPage;
