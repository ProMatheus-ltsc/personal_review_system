/**
 * HistoryPage — 历史记录页
 *
 * 展示所有复盘记录列表，提供多维度筛选和排序功能：
 * - 按模板类型筛选（全部 / 特定模板）
 * - 按状态筛选（全部 / 草稿 / 已完成）
 * - 按时间排序（最新 / 最早）
 * - 全文搜索（标题 + 内容）
 *
 * URL 参数：
 * - templateId（可选）: 预设模板筛选，从仪表盘模板卡片点击「历史记录」时传入
 *
 * 交互：
 * - 点击记录 → 跳转到表单编辑页
 * - 删除记录 → 确认后删除并刷新列表
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
import { templates } from '@/templates';
import { useRecords, useDeleteRecord, useDeleteRecords } from '@/hooks/useDB';
import clsx from 'clsx';
import SearchBar from '@/components/SearchBar';
import HistoryList from '@/components/HistoryList';
import InvestmentTable from '@/components/InvestmentTable';
import {
  exportInvestmentRecords,
  buildExportFilename,
  filterInvestmentRecords,
  type InvestmentExportFilter,
} from '@/services/investmentExport';

type SortOrder = 'newest' | 'oldest';
type StatusFilter = 'all' | 'draft' | 'completed';
type ViewMode = 'list' | 'table';

export default function HistoryPage() {
  const { templateId: urlTemplateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(
    urlTemplateId
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { records, loading, refresh } = useRecords();
  const { remove } = useDeleteRecord();
  const { removeMany, deleting: batchDeleting } = useDeleteRecords();

  // 批量选择状态
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 投资清单导出状态
  const [exportCode, setExportCode] = useState('');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  // 当前投资清单记录（仅模板筛选，不过滤搜索/状态，让导出条件独立可控）
  const investmentRecords = useMemo(() => {
    return records.filter((r) => r.templateId === 'investment_checklist');
  }, [records]);

  // 导出过滤条件下符合的记录数（实时预览）
  const exportMatchCount = useMemo(() => {
    if (activeTemplateId !== 'investment_checklist') return 0;
    const filter: InvestmentExportFilter = {
      code: exportCode,
      dateFrom: exportDateFrom,
      dateTo: exportDateTo,
    };
    return filterInvestmentRecords(investmentRecords, filter).length;
  }, [activeTemplateId, investmentRecords, exportCode, exportDateFrom, exportDateTo]);

  const handleExport = useCallback(async () => {
    if (exportMatchCount === 0) {
      setExportResult('没有符合条件的记录可导出');
      return;
    }
    setExporting(true);
    try {
      const filter: InvestmentExportFilter = {
        code: exportCode,
        dateFrom: exportDateFrom,
        dateTo: exportDateTo,
      };
      const json = exportInvestmentRecords(investmentRecords, filter);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename(filter);
      a.click();
      URL.revokeObjectURL(url);
      setExportResult(`✅ 已导出 ${exportMatchCount} 条投资记录`);
    } catch (err: unknown) {
      setExportResult(`导出失败：${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setExporting(false);
    }
  }, [exportMatchCount, exportCode, exportDateFrom, exportDateTo, investmentRecords]);

  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Filter by template
    if (activeTemplateId) {
      result = result.filter((r) => r.templateId === activeTemplateId);
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(query) ||
          JSON.stringify(r.data).toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [records, activeTemplateId, statusFilter, searchQuery, sortOrder]);

  const handleDelete = async (id: string) => {
    await remove(id);
    refresh();
  };

  const handleSelect = (record: { templateId: string; id: string }) => {
    navigate(`/form/${record.templateId}/${record.id}`);
  };

  // 批量选择操作
  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
  }, [filteredRecords]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      `确定删除已选的 ${selectedIds.size} 条记录吗？此操作不可撤销。`
    );
    if (!confirmed) return;
    await removeMany(Array.from(selectedIds));
    refresh();
    exitSelectionMode();
  }, [selectedIds, removeMany, refresh, exitSelectionMode]);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg hover:bg-gray-200 transition-colors text-gray-600"
        >
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex-1">
          {activeTemplate ? `${activeTemplate.name} 记录` : '历史记录'}
        </h1>
        {!selectionMode && !(viewMode === 'table' && activeTemplateId === 'investment_checklist') ? (
          <button
            onClick={enterSelectionMode}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border text-gray-600 hover:bg-gray-50 transition-colors"
          >
            管理
          </button>
        ) : selectionMode ? (
          <button
            onClick={exitSelectionMode}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border text-gray-600 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        ) : null}
      </div>

      {/* Filters */}
      <div className="space-y-4 mb-6">
        {/* Search */}
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {/* Template tabs */}
        <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
            <button
              onClick={() => setActiveTemplateId(undefined)}
              className={clsx(
                'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
                !activeTemplateId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              )}
            >
              全部
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTemplateId(t.id)}
                className={clsx(
                  'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
                  activeTemplateId === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border text-gray-600 hover:bg-gray-50'
                )}
              >
                {t.icon} {t.name}
              </button>
            ))}
          </div>

        {/* Sort & Status filters */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 sm:gap-4">
            {/* Sort toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setSortOrder('newest')}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  sortOrder === 'newest'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                最新
              </button>
              <button
                onClick={() => setSortOrder('oldest')}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  sortOrder === 'oldest'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                最早
              </button>
            </div>

            {/* Status filter */}
            <div className="flex rounded-lg border overflow-hidden">
              {(
                [
                  { key: 'all', label: '全部' },
                  { key: 'draft', label: '草稿' },
                  { key: 'completed', label: '已完成' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  onClick={() => setStatusFilter(item.key)}
                  className={clsx(
                    'px-3 py-1.5 text-sm font-medium transition-colors',
                    statusFilter === item.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* 投资记录视图切换（列表 / 表格） */}
            {activeTemplateId === 'investment_checklist' && (
              <div className="flex rounded-lg border overflow-hidden">
                {(
                  [
                    { key: 'list', label: '列表' },
                    { key: 'table', label: '表格' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setViewMode(item.key)}
                    className={clsx(
                      'px-3 py-1.5 text-sm font-medium transition-colors',
                      viewMode === item.key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* 投资清单导出面板 */}
      {activeTemplateId === 'investment_checklist' && (
        <div className="mb-6 bg-indigo-50/60 border border-indigo-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📤</span>
            <h3 className="text-sm font-semibold text-indigo-800">导出投资记录（JSON）</h3>
            <span className="text-[11px] text-indigo-400 font-normal">
              匹配 {exportMatchCount} 条记录
            </span>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            {/* 股票代码 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">股票代码</label>
              <input
                type="text"
                value={exportCode}
                onChange={(e) => setExportCode(e.target.value)}
                placeholder="如 AAPL / 00700 / 600519"
                className="w-full sm:w-44 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            {/* 时间段 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">开始日期</label>
              <input
                type="date"
                value={exportDateFrom}
                onChange={(e) => setExportDateFrom(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">结束日期</label>
              <input
                type="date"
                value={exportDateTo}
                onChange={(e) => setExportDateTo(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            {/* 导出按钮 */}
            <div className="flex items-end gap-2">
              <button
                onClick={handleExport}
                disabled={exporting || exportMatchCount === 0}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {exporting ? '导出中...' : `导出 JSON (${exportMatchCount})`}
              </button>
              {(exportCode || exportDateFrom || exportDateTo) && (
                <button
                  onClick={() => {
                    setExportCode('');
                    setExportDateFrom('');
                    setExportDateTo('');
                    setExportResult(null);
                  }}
                  className="px-3 py-2 text-sm text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  清空条件
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            留空全部条件 = 全量导出；时间段按<b>买入日期</b>过滤（含边界）；股票代码与时间段可组合使用。
          </p>
          {exportResult && (
            <p
              className={clsx(
                'mt-2 text-sm',
                exportResult.startsWith('✅')
                  ? 'text-green-600'
                  : exportResult.startsWith('导出失败')
                  ? 'text-red-600'
                  : 'text-amber-600'
              )}
            >
              {exportResult}
            </p>
          )}
        </div>
      )}

      {/* Record list */}
      {viewMode === 'table' && activeTemplateId === 'investment_checklist' ? (
        <InvestmentTable records={filteredRecords} onSelect={handleSelect} />
      ) : (
        <HistoryList
          records={filteredRecords}
          onSelect={handleSelect}
          onDelete={handleDelete}
          loading={loading}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* 批量操作栏 */}
      {selectionMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 z-50">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600">
              已选 <span className="font-semibold text-indigo-600">{selectedIds.size}</span> 项
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={selectedIds.size === filteredRecords.length ? deselectAll : selectAll}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {selectedIds.size === filteredRecords.length ? '取消全选' : '全选'}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0 || batchDeleting}
                className={clsx(
                  'px-4 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  selectedIds.size === 0 || batchDeleting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                )}
              >
                {batchDeleting ? '删除中...' : `删除选中 (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
