/**
 * FormTabs — 表单 section tab 导航栏
 *
 * 从 FormRenderer 拆出的展示组件：
 * - 支持隐藏指定 tab（投资清单未清仓时隐藏「投资周期复盘」）
 * - 锁定 tab 显示 🔒 且不可点击；只读 tab 显示 ✓ 标记
 * - 错误 tab 显示红色角标
 * - 支持键盘左右方向键切换
 */
import type { FormSection } from '@/types';

interface FormTabsProps {
  sections: FormSection[];
  activeTab: number;
  /** 返回 true 的 tab 索引将被隐藏（不渲染） */
  shouldHide: (index: number) => boolean;
  isLocked: (index: number) => boolean;
  isReadOnly: (index: number) => boolean;
  hasErrors: (index: number) => boolean;
  onTabChange: (index: number) => void;
}

export default function FormTabs({
  sections,
  activeTab,
  shouldHide,
  isLocked,
  isReadOnly,
  hasErrors,
  onTabChange,
}: FormTabsProps) {
  return (
    <div className="mb-6 border-b border-gray-200">
      <nav className="flex overflow-x-auto -mb-px scrollbar-hide" role="tablist" aria-label="表单部分">
        {sections.map((section, index) => {
          if (shouldHide(index)) return null;
          const locked = isLocked(index);
          const readOnly = isReadOnly(index);
          const hasError = hasErrors(index);
          return (
            <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={index === activeTab}
                tabIndex={index === activeTab ? 0 : -1}
                disabled={locked}
                onClick={() => onTabChange(index)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' && index < sections.length - 1) {
                    onTabChange(index + 1);
                  } else if (e.key === 'ArrowLeft' && index > 0) {
                    onTabChange(index - 1);
                  }
                }}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition ${hasError ? 'relative' : ''} ${
                    locked
                        ? 'border-transparent text-gray-300 cursor-not-allowed'
                        : index === activeTab
                            ? 'border-indigo-500 text-indigo-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {locked && <span className="mr-1">🔒</span>}
              {readOnly && !locked && <span className="mr-1 opacity-70">✓</span>}
              {section.title}
              {hasError && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
