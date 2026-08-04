/**
 * PhaseIndicator — 多阶段进度指示器
 *
 * 以水平时间线形式展示模板的多个生命周期阶段（如投资检查清单的「买入 → 持有 → 卖出 → 复盘」）。
 *
 * 视觉状态：
 * - 已完成阶段：绿色圆圈 + 绿色连接线
 * - 当前阶段：蓝色圆圈 + 脉冲动画
 * - 未来阶段：灰色圆圈
 * - 等待冷静期：琥珀色圆圈 + 显示剩余天数
 *
 * 点击某个阶段可跳转到对应的表单 section。
 */
import React from 'react';
import type { PhaseConfig } from '@/types';
import { getPhaseTimeLockInfo } from '@/utils/formValidation';

interface PhaseIndicatorProps {
  phases: PhaseConfig[];
  currentPhaseIndex: number;
  onPhaseClick: (phaseIndex: number) => void;
  formData?: Record<string, any>;
  recordCreatedAt?: string;
}

const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({
  phases,
  currentPhaseIndex,
  onPhaseClick,
  formData,
  recordCreatedAt,
}) => {
  return (
    <div className="mb-5 px-2">
      <div className="flex items-center justify-between">
        {phases.map((phase, index) => {
          const isCompleted = index < currentPhaseIndex;
          const isCurrent = index === currentPhaseIndex;
          const isFuture = index > currentPhaseIndex;

          // Check if this future phase has a time lock (unlockAfterDays)
          let isTimeLocked = false;
          let timeLockLabel = '';
          if (isFuture && phase.unlockAfterDays && formData) {
            const lockInfo = getPhaseTimeLockInfo(phase, formData, recordCreatedAt);
            if (lockInfo) {
              isTimeLocked = true;
              if (lockInfo.unlockDate.getFullYear() < 9000) {
                timeLockLabel = `${lockInfo.daysRemaining}天后解锁`;
              } else {
                timeLockLabel = `${phase.unlockAfterDays}天后`;
              }
            }
          }

          // Check if this future phase has a delay that hasn't passed yet (activateAfterDays)
          let isDelayWaiting = false;
          let delayLabel = '';
          if (isFuture && phase.activateAfterDays && phase.activateAfterField && formData) {
            const fieldValue = formData[phase.activateAfterField] as string | undefined;
            if (fieldValue && String(fieldValue).trim()) {
              const parsed = new Date(String(fieldValue));
              if (!isNaN(parsed.getTime())) {
                const today = new Date();
                const daysSince = Math.floor(
                  (today.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (daysSince < phase.activateAfterDays) {
                  isDelayWaiting = true;
                  const remaining = phase.activateAfterDays - daysSince;
                  delayLabel = `${remaining}天后`;
                }
              }
            } else {
              // sell_date not filled yet, just show normal future style
            }
          }

          return (
            <React.Fragment key={phase.id}>
              {/* Phase node */}
              <button
                type="button"
                onClick={() => {
                  if (index <= currentPhaseIndex) {
                    onPhaseClick(index);
                  }
                }}
                disabled={isFuture}
                className={`flex flex-col items-center gap-1.5 group flex-shrink-0 ${isFuture ? 'cursor-not-allowed opacity-80' : ''}`}
              >
                {/* Circle */}
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center text-base transition-all
                    ${isCompleted ? 'bg-green-100 ring-2 ring-green-400' : ''}
                    ${isCurrent ? 'bg-blue-100 ring-2 ring-blue-500 shadow-md shadow-blue-100' : ''}
                    ${isFuture && !isDelayWaiting && !isTimeLocked ? 'bg-gray-100 ring-1 ring-gray-300' : ''}
                    ${isDelayWaiting && !isTimeLocked ? 'bg-gray-100 ring-1 ring-amber-300' : ''}
                    ${isTimeLocked ? 'bg-gray-100 ring-1 ring-amber-300' : ''}
                    group-hover:scale-110
                  `}
                >
                  {isTimeLocked ? (
                    <span className="text-xs text-amber-500 font-medium">🔒</span>
                  ) : isDelayWaiting ? (
                    <span className="text-xs text-amber-500 font-medium">⏳</span>
                  ) : (
                    <span className={isFuture ? 'opacity-50' : ''}>{phase.icon}</span>
                  )}
                </div>
                {/* Label */}
                <span
                  className={`text-xs font-medium whitespace-nowrap transition-colors ${
                    isCompleted ? 'text-green-600' : ''
                  } ${isCurrent ? 'text-blue-600' : ''} ${isFuture ? 'text-gray-400' : ''}`}
                >
                  {phase.label}
                </span>
                {/* Status tag */}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isCompleted ? 'bg-green-50 text-green-500' : ''
                  } ${isCurrent ? 'bg-blue-50 text-blue-500 animate-pulse' : ''} ${
                    isFuture && !isDelayWaiting && !isTimeLocked ? 'bg-gray-50 text-gray-400' : ''
                  } ${isDelayWaiting && !isTimeLocked ? 'bg-amber-50 text-amber-500' : ''} ${
                    isTimeLocked ? 'bg-amber-50 text-amber-500' : ''}`}
                >
                  {isCompleted ? '完成' : isCurrent ? '当前' : isTimeLocked ? timeLockLabel : isDelayWaiting ? delayLabel : '稍后'}
                </span>
              </button>

              {/* Connecting line */}
              {index < phases.length - 1 && (
                <div className="flex-1 mx-2 h-0.5 self-start mt-[18px]">
                  <div
                    className={`h-full rounded-full transition-colors ${
                      index < currentPhaseIndex ? 'bg-green-300' : 'bg-gray-200'
                    }`}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default PhaseIndicator;
