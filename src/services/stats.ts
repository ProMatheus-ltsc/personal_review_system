/**
 * 统计计算服务
 *
 * 从 IndexedDB 历史记录中聚合计算各模板的统计数据。
 * 支持按时间范围过滤：本月、近3月、全部。
 */
import { FormRecord, TemplateId } from '@/types';
import { getAllRecords } from '@/services/db';
import { startOfMonth, subMonths, isAfter } from 'date-fns';

export type TimeRange = 'month' | 'quarter' | 'all';

/**
 * 根据时间范围过滤记录
 */
function filterByTimeRange(records: FormRecord[], range: TimeRange): FormRecord[] {
  if (range === 'all') return records;
  const now = new Date();
  const start = range === 'month' ? startOfMonth(now) : startOfMonth(subMonths(now, 2));
  return records.filter((r) => isAfter(new Date(r.createdAt), start));
}

/**
 * 获取指定模板和时间范围的记录（仅已完成记录，排除草稿）
 */
export async function getFilteredRecords(
  templateId: TemplateId,
  range: TimeRange
): Promise<FormRecord[]> {
  const records = await getAllRecords(templateId);
  const completed = records.filter((r) => r.status === 'completed');
  return filterByTimeRange(completed, range);
}

// ============================================================
// 决策日志统计
// ============================================================

export interface DecisionLogStats {
  /** 期间内重大决策数 */
  totalDecisions: number;
  /** 已完成的决策数 */
  completedDecisions: number;
  /** 后悔率（有后悔/疑虑的记录占有 post_decision 数据的记录总数比例） */
  regretRate: number | null;
  /** 预期准确率（result_vs_expected 为"超预期"或"符合预期"的占比） */
  predictionAccuracy: number | null;
  /** 主要认知偏差类型（top 3） */
  topBiases: { name: string; count: number }[];
  /** 改进焦点（最近一条记录的 improvement_plan） */
  improvementFocus: string | null;
  /** 决策类型分布 */
  decisionTypes: { name: string; count: number }[];
}

export function calcDecisionLogStats(records: FormRecord[]): DecisionLogStats {
  const completedRecords = records.filter((r) => r.status === 'completed');

  // 后悔率：有 regret_or_doubt 非空 / 有 post_decision section 任一字段有数据的记录
  const postDecisionFields = [
    'execution_status', 'unexpected_events', 'immediate_feedback',
    'emotion_change', 'regret_or_doubt', 'self_awareness',
    'positive_signals', 'warning_signals', 'needs_adjustment', 'adjustment_plan',
  ];

  const recordsWithPostDecision = completedRecords.filter((r) =>
    postDecisionFields.some((f) => {
      const val = r.data[f];
      return val !== undefined && val !== null && String(val).trim() !== '';
    })
  );

  const recordsWithRegret = recordsWithPostDecision.filter((r) => {
    const val = r.data['regret_or_doubt'];
    return val !== undefined && val !== null && String(val).trim() !== '';
  });

  const regretRate = recordsWithPostDecision.length > 0
    ? Math.round((recordsWithRegret.length / recordsWithPostDecision.length) * 100)
    : null;

  // 预期准确率
  const recordsWithResult = completedRecords.filter((r) => {
    const val = r.data['result_vs_expected'];
    return val !== undefined && val !== null && String(val).trim() !== '';
  });

  const accurateRecords = recordsWithResult.filter((r) => {
    const val = String(r.data['result_vs_expected']);
    return val === '超预期' || val === '符合预期';
  });

  const predictionAccuracy = recordsWithResult.length > 0
    ? Math.round((accurateRecords.length / recordsWithResult.length) * 100)
    : null;

  // 主要认知偏差
  const biasCount: Record<string, number> = {};
  completedRecords.forEach((r) => {
    const biases = r.data['cognitive_biases'];
    if (Array.isArray(biases)) {
      biases.forEach((b: unknown) => {
        const name = String(b);
        biasCount[name] = (biasCount[name] || 0) + 1;
      });
    }
  });
  const topBiases = Object.entries(biasCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // 改进焦点：最近一条有 improvement_plan 的记录
  const sortedRecords = [...completedRecords].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const latestWithPlan = sortedRecords.find((r) => {
    const val = r.data['improvement_plan'];
    return val !== undefined && val !== null && String(val).trim() !== '';
  });
  const improvementFocus = latestWithPlan
    ? String(latestWithPlan.data['improvement_plan'])
    : null;

  // 决策类型分布
  const typeCount: Record<string, number> = {};
  records.forEach((r) => {
    const t = r.data['decision_type'];
    if (t && String(t).trim()) {
      const name = String(t);
      typeCount[name] = (typeCount[name] || 0) + 1;
    }
  });
  const decisionTypes = Object.entries(typeCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDecisions: records.length,
    completedDecisions: completedRecords.length,
    regretRate,
    predictionAccuracy,
    topBiases,
    improvementFocus,
    decisionTypes,
  };
}

// ============================================================
// 日复盘统计
// ============================================================

export interface DailyReviewStats {
  /** 期间内复盘天数 */
  totalDays: number;
  /** 连续天数（从最近一天向前） */
  streakDays: number;
  /** 情绪分布 */
  moodDistribution: { name: string; count: number }[];
  /** 精力分布 */
  energyDistribution: { name: string; count: number }[];
}

export function calcDailyReviewStats(records: FormRecord[]): DailyReviewStats {
  const completedRecords = records.filter((r) => r.status === 'completed');

  // 获取所有唯一日期
  const dates = completedRecords
    .map((r) => {
      const d = r.data['daily_date'];
      return d ? String(d) : r.createdAt.slice(0, 10);
    })
    .filter(Boolean);

  const uniqueDates = [...new Set(dates)].sort().reverse();

  // 计算连续天数
  let streakDays = 0;
  if (uniqueDates.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let checkDate = today;

    for (const dateStr of uniqueDates) {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      const diffDays = Math.round((checkDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) {
        streakDays++;
        checkDate = d;
      } else {
        break;
      }
    }
  }

  // 情绪分布
  const moodCount: Record<string, number> = {};
  completedRecords.forEach((r) => {
    const mood = r.data['daily_mood'];
    if (mood && String(mood).trim()) {
      const name = String(mood);
      moodCount[name] = (moodCount[name] || 0) + 1;
    }
  });
  const moodDistribution = Object.entries(moodCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 精力分布
  const energyCount: Record<string, number> = {};
  completedRecords.forEach((r) => {
    const energy = r.data['daily_energy'];
    if (energy && String(energy).trim()) {
      const name = String(energy);
      energyCount[name] = (energyCount[name] || 0) + 1;
    }
  });
  const energyDistribution = Object.entries(energyCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDays: uniqueDates.length,
    streakDays,
    moodDistribution,
    energyDistribution,
  };
}

// ============================================================
// 周复盘统计
// ============================================================

export interface WeeklyReviewStats {
  /** 期间内完成周数 */
  totalWeeks: number;
  /** 平均目标达成率 */
  avgGoalCompletion: number | null;
  /** 目标完成数 / 目标总数 */
  goalsCompleted: number;
  goalsTotal: number;
}

export function calcWeeklyReviewStats(records: FormRecord[]): WeeklyReviewStats {
  const completedRecords = records.filter((r) => r.status === 'completed');

  let goalsCompleted = 0;
  let goalsTotal = 0;
  let totalProgress = 0;
  let progressCount = 0;

  completedRecords.forEach((r) => {
    // 检查 goal1~3
    for (let i = 1; i <= 3; i++) {
      const goalField = r.data[`goal${i}`];
      if (goalField && String(goalField).trim()) {
        goalsTotal++;
        const completed = r.data[`goal${i}_completed`];
        if (completed && (completed === true || (Array.isArray(completed) && completed.length > 0))) {
          goalsCompleted++;
        }
        const progress = r.data[`goal${i}_progress`];
        if (progress !== undefined && progress !== null) {
          const num = Number(progress);
          if (!isNaN(num)) {
            totalProgress += num;
            progressCount++;
          }
        }
      }
    }
  });

  const avgGoalCompletion = progressCount > 0
    ? Math.round(totalProgress / progressCount)
    : null;

  return {
    totalWeeks: completedRecords.length,
    avgGoalCompletion,
    goalsCompleted,
    goalsTotal,
  };
}

// ============================================================
// 投资检查清单统计
// ============================================================

export interface InvestmentStats {
  /** 总交易数 */
  totalTrades: number;
  /** 已完成交易数（有卖出数据） */
  closedTrades: number;
  /** 胜率（盈利数 / 已完成数） */
  winRate: number | null;
  /** 平均风险回报比 */
  avgRiskReward: number | null;
  /** 盈亏分布 */
  profitDistribution: { name: string; count: number }[];
}

export function calcInvestmentStats(records: FormRecord[]): InvestmentStats {
  // 已关闭交易：有 sell_exit_price 的记录
  const closedRecords = records.filter((r) => {
    const sellPrice = r.data['sell_exit_price'];
    return sellPrice !== undefined && sellPrice !== null && String(sellPrice).trim() !== '';
  });

  // 胜率：sell_profit_result === '盈利' 或 sell_pnl_percent > 0
  const winRecords = closedRecords.filter((r) => {
    const result = r.data['sell_profit_result'];
    if (result === '盈利') return true;
    const pnl = Number(r.data['sell_pnl_percent']);
    return !isNaN(pnl) && pnl > 0;
  });

  const winRate = closedRecords.length > 0
    ? Math.round((winRecords.length / closedRecords.length) * 100)
    : null;

  // 平均风险回报比
  const rrValues: number[] = [];
  records.forEach((r) => {
    const rr = r.data['buy_risk_reward'];
    if (rr && String(rr).includes(':')) {
      const num = parseFloat(String(rr));
      if (!isNaN(num)) rrValues.push(num);
    }
  });
  const avgRiskReward = rrValues.length > 0
    ? Math.round((rrValues.reduce((a, b) => a + b, 0) / rrValues.length) * 100) / 100
    : null;

  // 盈亏分布
  const profitCount: Record<string, number> = {};
  closedRecords.forEach((r) => {
    const result = r.data['sell_profit_result'];
    if (result && String(result).trim()) {
      const name = String(result);
      profitCount[name] = (profitCount[name] || 0) + 1;
    }
  });
  const profitDistribution = Object.entries(profitCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTrades: records.length,
    closedTrades: closedRecords.length,
    winRate,
    avgRiskReward,
    profitDistribution,
  };
}

// ============================================================
// 情绪觉察统计
// ============================================================

export interface EmotionStats {
  /** 总记录数 */
  totalRecords: number;
  /** 情绪分布 */
  emotionDistribution: { name: string; count: number }[];
  /** 触发因素（从 emotion_trigger 中的记录数） */
  triggerCount: number;
  /** 调节效果分布 */
  regulationEffectiveness: { name: string; count: number }[];
}

export function calcEmotionStats(records: FormRecord[]): EmotionStats {
  const completedRecords = records.filter((r) => r.status === 'completed');

  // 情绪分布
  const emotionCount: Record<string, number> = {};
  completedRecords.forEach((r) => {
    const emotion = r.data['emotion_dominant'];
    if (emotion && String(emotion).trim()) {
      const name = String(emotion);
      emotionCount[name] = (emotionCount[name] || 0) + 1;
    }
  });
  const emotionDistribution = Object.entries(emotionCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 触发因素记录数
  const triggerCount = completedRecords.filter((r) => {
    const val = r.data['emotion_trigger'];
    return val !== undefined && val !== null && String(val).trim() !== '';
  }).length;

  // 调节效果分布
  const effectCount: Record<string, number> = {};
  completedRecords.forEach((r) => {
    const effect = r.data['regulate_effectiveness'];
    if (effect && String(effect).trim()) {
      const name = String(effect);
      effectCount[name] = (effectCount[name] || 0) + 1;
    }
  });
  const regulationEffectiveness = Object.entries(effectCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalRecords: completedRecords.length,
    emotionDistribution,
    triggerCount,
    regulationEffectiveness,
  };
}
