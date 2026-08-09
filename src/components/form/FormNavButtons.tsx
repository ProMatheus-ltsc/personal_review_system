/**
 * FormNavButtons — 表单底部导航按钮组
 *
 * 从 FormRenderer 拆出的展示组件，集中管理底部三个动作：
 * - ← 上一步 / 下一步 →：切换 section tab（未来阶段锁定置灰）
 * - 保存草稿：只读阶段禁用
 * - 完成类按钮：按记录状态与阶段锁定情况分 5 种分支渲染
 *   （已完成只读 / 完成 / 时间锁定显示已完成 / 可标记完成（含买入/卖出单文案）/ 下一步）
 */
interface FormNavButtonsProps {
  /** 当前激活的 section tab 索引 */
  activeTab: number;
  /** section 总数 */
  totalSections: number;
  recordStatus: 'draft' | 'completed';
  /** 投资清单单据角色（buy/sell 时完成按钮显示「完成买入单/卖出单 · 等待复盘」） */
  recordRole?: string;
  templateId: string;
  /** 是否有阶段配置（无阶段模板 = 简单完成流程） */
  hasPhases: boolean;
  canMarkComplete: () => boolean;
  isSectionLocked: (index: number) => boolean;
  isSectionReadOnly: (index: number) => boolean;
  onPrev: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onComplete: () => void;
  onMarkComplete: () => void;
}

export default function FormNavButtons({
  activeTab,
  totalSections,
  recordStatus,
  recordRole,
  templateId,
  hasPhases,
  canMarkComplete,
  isSectionLocked,
  isSectionReadOnly,
  onPrev,
  onNext,
  onSaveDraft,
  onComplete,
  onMarkComplete,
}: FormNavButtonsProps) {
  /** 投资清单买入/卖出单的完成文案（等待复盘解锁） */
  const completeLabel =
      templateId === 'investment_checklist' && recordRole === 'buy'
          ? '✅ 完成买入单 · 等待复盘'
          : templateId === 'investment_checklist' && recordRole === 'sell'
              ? '✅ 完成卖出单 · 等待复盘'
              : '✅ 完成';

  /** 完成类按钮：按 5 种状态分支渲染 */
  const renderCompleteButton = () => {
    // 分支 1：无阶段模板且已完成 → 只读展示「已完成」
    if (recordStatus === 'completed' && !hasPhases) {
      return (
        <button type="button" disabled
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg cursor-default">
          ✅ 已完成
        </button>
      );
    }
    // 分支 2：最后一个 section → 直接「完成」（校验后保存为 completed）
    if (activeTab === totalSections - 1) {
      return (
        <button type="button" onClick={onComplete}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">
          完成
        </button>
      );
    }
    // 分支 3：已完成记录且下一阶段时间锁定 → 展示完成状态
    if (isSectionLocked(activeTab + 1) && recordStatus === 'completed') {
      return (
        <button type="button" disabled
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg cursor-default">
          ✅ 已完成
        </button>
      );
    }
    // 分支 4：completesRecord 阶段完成、下一阶段时间锁定 → 可标记完成（等待复盘）
    if (isSectionLocked(activeTab + 1) && canMarkComplete()) {
      return (
        <button type="button" onClick={onMarkComplete}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition">
          {completeLabel}
        </button>
      );
    }
    // 分支 5：默认「下一步」（未来阶段锁定置灰）
    return (
      <button type="button" onClick={onNext} disabled={isSectionLocked(activeTab + 1)}
              className={`w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg transition ${
                  isSectionLocked(activeTab + 1)
                      ? 'text-gray-300 bg-gray-100 cursor-not-allowed'
                      : 'text-white bg-indigo-600 hover:bg-indigo-700'
              }`}>
        下一步 →
      </button>
    );
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mt-6 pt-4 border-t border-gray-100 gap-3 sm:gap-0">
      <button
          type="button"
          onClick={onPrev}
          disabled={activeTab === 0}
          className={`w-full sm:w-auto px-4 py-2 text-sm font-medium rounded-lg transition ${
              activeTab === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-100'
          }`}
      >
        ← 上一步
      </button>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSectionReadOnly(activeTab)}
            className={`w-full sm:w-auto px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg transition ${
                isSectionReadOnly(activeTab)
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-50'
            }`}
        >
          保存草稿
        </button>
        {renderCompleteButton()}
      </div>
    </div>
  );
}
