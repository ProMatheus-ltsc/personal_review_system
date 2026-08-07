/**
 * HistoryList — 复盘记录列表组件
 *
 * 展示指定模板的历史记录列表，支持：
 * - 多阶段模板的阶段进度显示（彩色标签）
 * - 草稿 vs 已完成状态区分
 * - 记录的创建/更新时间显示
 * - 点击编辑、删除操作
 */
import { FormRecord, PhaseConfig, FormSection } from '@/types';
import { templates } from '@/templates';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import clsx from 'clsx';

/** Determine the current phase index based on form data */
function getCurrentPhaseIndex(phases: PhaseConfig[], formData: Record<string, unknown>, sections?: FormSection[]): number {
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const repeatableSection = sections?.find((s, idx) =>
      s.repeatable && phase.sectionIndices.includes(idx)
    );

    if (repeatableSection) {
      const entriesKey = `${repeatableSection.id}_entries`;
      const entries = formData[entriesKey] as Record<string, unknown>[] | undefined;
      if (!entries || entries.length === 0) return i;
      const hasCompleteEntry = entries.some((entry) =>
        phase.completionFields.every((fieldId) => {
          const val = entry[fieldId];
          return val !== undefined && val !== null && val !== '' &&
            !(typeof val === 'string' && val.trim() === '') &&
            !(typeof val === 'boolean' && val === false);
        })
      );
      if (!hasCompleteEntry) return i;
    } else {
      const allComplete = phase.completionFields.every(
        (fieldId) => formData[fieldId] && String(formData[fieldId]).trim() !== ''
      );
      if (!allComplete) return i;
    }
  }
  return phases.length - 1;
}

/** Get the phase badge color based on phase position */
function getPhaseBadgeColor(phaseId: string): string {
  if (phaseId === 'buying' || phaseId === 'opening') {
    return 'bg-blue-50 text-blue-600';
  }
  if (phaseId === 'holding') {
    return 'bg-amber-50 text-amber-600';
  }
  // selling / closed
  return 'bg-green-50 text-green-600';
}

/** 投资清单：持仓状态徽标（替代阶段徽标，信息更直观） */
function getInvestmentBadge(record: FormRecord): { label: string; className: string } | null {
  if (record.templateId !== 'investment_checklist') return null;
  const d = record.data;
  const code = String(d.buy_company_name ?? '').trim();
  if (!code) return null;

  const sellPrice = d.sell_exit_price;
  const hasTopSell = sellPrice !== undefined && sellPrice !== null && String(sellPrice).trim() !== '';
  const sellLots = Array.isArray(d.merged_sell_lots) ? (d.merged_sell_lots as unknown[]) : [];

  if (d.sold_out === true) return { label: '已清仓', className: 'bg-green-100 text-green-700' };
  if (hasTopSell) return { label: '待复盘', className: 'bg-amber-100 text-amber-700' };
  if (sellLots.length > 0) {
    const total = Number(d.merged_total_qty ?? d.buy_quantity ?? 0);
    const sold = Number(d.merged_total_sell_qty ?? 0);
    const remaining = isNaN(total - sold) ? 0 : total - sold;
    return { label: `部分卖出 · 剩余 ${remaining > 0 ? remaining : 0}`, className: 'bg-blue-100 text-blue-600' };
  }
  // 买入已完成（核心买入逻辑已填）→ 持仓中
  if (d.buy_company_name && d.buy_thesis) {
    return { label: '持仓中', className: 'bg-sky-100 text-sky-700' };
  }
  return null;
}

interface HistoryListProps {
  records: FormRecord[];
  onSelect: (record: FormRecord) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export default function HistoryList({
  records,
  onSelect,
  onDelete,
  loading,
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelect,
}: HistoryListProps) {
  const getTemplateIcon = (templateId: string) => {
    return templates.find((t) => t.id === templateId)?.icon || '📄';
  };

  const getRecordPhase = (record: FormRecord) => {
    const tmpl = templates.find((t) => t.id === record.templateId);
    if (!tmpl?.phases) return null;
    const idx = getCurrentPhaseIndex(tmpl.phases, record.data, tmpl.sections);
    return tmpl.phases[idx];
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('确定删除这条记录吗？此操作不可撤销。')) {
      onDelete(id);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-gray-200 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-gray-400">暂无记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => {
        const phase = getRecordPhase(record);
        const isDraftWithPhase = record.status === 'draft' && phase;
        const investmentBadge = getInvestmentBadge(record);

        return (
        <div
          key={record.id}
          onClick={() => selectionMode ? onToggleSelect?.(record.id) : onSelect(record)}
          className={clsx(
            'flex items-center gap-4 p-4 bg-white rounded-lg border cursor-pointer transition-colors',
            selectionMode && selectedIds.has(record.id)
              ? 'border-indigo-400 bg-indigo-50'
              : 'hover:bg-gray-50'
          )}
        >
          {selectionMode ? (
            <input
              type="checkbox"
              checked={selectedIds.has(record.id)}
              onChange={() => onToggleSelect?.(record.id)}
              onClick={(e) => e.stopPropagation()}
              className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          ) : (
            <span className="text-2xl">{getTemplateIcon(record.templateId)}</span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {record.title || '未命名记录'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">
                {format(new Date(record.createdAt), 'yyyy年M月d日', {
                  locale: zhCN,
                })}
              </p>
              {investmentBadge ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${investmentBadge.className}`}>
                  {investmentBadge.label}
                </span>
              ) : phase ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getPhaseBadgeColor(phase.id)}`}>
                  {phase.icon} {phase.label}
                </span>
              ) : null}
            </div>
          </div>
          {isDraftWithPhase ? (
            <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap bg-indigo-50 text-indigo-600">
              继续填写 · {phase.label}
            </span>
          ) : (
            <span
              className={clsx(
                'text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap',
                record.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              )}
            >
              {record.status === 'completed' ? '已完成' : '草稿'}
            </span>
          )}
          {!selectionMode && (
            <button
              onClick={(e) => handleDelete(e, record.id)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
              title="删除"
            >
              🗑️
            </button>
          )}
        </div>
        );
      })}
    </div>
  );
}
