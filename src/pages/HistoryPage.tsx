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

type SortOrder = 'newest' | 'oldest';
type StatusFilter = 'all' | 'draft' | 'completed';

export default function HistoryPage() {
  const { templateId: urlTemplateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState<string | undefined>(
    urlTemplateId
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { records, loading, refresh } = useRecords();
  const { remove } = useDeleteRecord();
  const { removeMany, deleting: batchDeleting } = useDeleteRecords();

  // 批量选择状态
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
        {!selectionMode ? (
          <button
            onClick={enterSelectionMode}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border text-gray-600 hover:bg-gray-50 transition-colors"
          >
            管理
          </button>
        ) : (
          <button
            onClick={exitSelectionMode}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border text-gray-600 hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
        )}
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
        </div>
      </div>

      {/* Record list */}
      <HistoryList
        records={filteredRecords}
        onSelect={handleSelect}
        onDelete={handleDelete}
        loading={loading}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />

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
