/**
 * QualityCheck — 复盘质量自检弹窗
 *
 * 在用户完成复盘后弹出，提供 5 项质量标准的自检清单：
 * 1. 诚实面对自己，没有美化
 * 2. 关注了模式而非仅单次事件
 * 3. 产出了可执行的改进点
 * 4. 记录了具体的行动承诺
 * 5. 设定了跟进检查的时间
 *
 * 根据勾选数量给出即时反馈（优秀 / 不错 / 可以更好）。
 * 目的是培养高质量复盘习惯，而非强制要求。
 */
import React, { useState } from 'react';

interface QualityCheckProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string;
}

const checkItems = [
  '诚实面对自己，没有美化',
  '关注了模式而非仅单次事件',
  '产出了可执行的改进点',
  '记录了具体的行动承诺',
  '设定了跟进检查的时间',
];

function getFeedback(checkedCount: number) {
  if (checkedCount >= 4) return { emoji: '✨', text: '优秀！这是一次高质量的复盘' };
  if (checkedCount >= 2) return { emoji: '👍', text: '不错！试试完善未勾选的项目' };
  return { emoji: '💪', text: '可以更好！试着让复盘更深入' };
}

const QualityCheck: React.FC<QualityCheckProps> = ({ isOpen, onClose, recordId: _unused }) => {
  const [checked, setChecked] = useState<boolean[]>(new Array(5).fill(false));

  if (!isOpen) return null;

  const checkedCount = checked.filter(Boolean).length;
  const feedback = getFeedback(checkedCount);

  const toggleItem = (index: number) => {
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl p-6 animate-fadeIn">
        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900 mb-1">📋 复盘质量自检</h2>
        <p className="text-sm text-gray-500 mb-5">高质量复盘的5个标准</p>

        {/* Checklist */}
        <div className="space-y-3 mb-6">
          {checkItems.map((item, index) => (
            <label
              key={index}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={checked[index]}
                onChange={() => toggleItem(index)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={`text-sm transition-colors ${checked[index] ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-800'}`}>
                {item}
              </span>
            </label>
          ))}
        </div>

        {/* Feedback */}
        <div className="bg-gray-50 rounded-lg p-3 mb-5 text-center">
          <span className="text-lg mr-1">{feedback.emoji}</span>
          <span className="text-sm text-gray-700">{feedback.text}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            下次提醒我
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default QualityCheck;
