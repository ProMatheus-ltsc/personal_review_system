/**
 * legacyMigrate — 旧模板数据结构 → 新结构 的读取时幂等迁移
 *
 * 背景：2026-08-11 去重优化后，日复盘删除了「睡前三问」section 及其字段
 * （daily_most_valuable / daily_tomorrow_priority），周复盘删除了
 * weekly_q2_next。历史记录中已存在的旧字段数据不会丢失（仍在 record.data 里），
 * 但新模板不再渲染它们。本工具在「读取记录」时把旧字段映射到新字段，
 * 让历史数据无缝融入新结构，用户无需手动操作。
 *
 * 幂等性：
 * - 目标字段已非空 → 不覆盖用户新填的值
 * - 迁移完成后写入 _matrixMigrated 标记，避免重复注入（用户删掉注入项后
 *   不会再次出现）
 *
 * 迁移规则：
 * - daily_review：
 *   - daily_tomorrow_priority（明天最重要的一件事）→ daily_q2_focus（明日第二象限要事）
 *   - daily_most_valuable（今天最有价值的一件事）→ daily_matrix.q2 首项（第二象限）
 *   - daily_lesson 两版本同名，直接兼容无需迁移
 * - weekly_review：
 *   - weekly_q2_next（下周第二象限要事）→ core_goal1（下周规划核心目标1）
 */
import { isFieldEmpty } from '@/utils/formValidation';
import { isQuadrantMatrix } from '@/constants/quadrant';
import type { QuadrantMatrix } from '@/types';

function isEmpty(val: unknown): boolean {
  return isFieldEmpty(val);
}

/** 归一化为合法的四象限矩阵（损坏/缺失时兜底为空矩阵） */
function normalizeMatrix(val: unknown): QuadrantMatrix {
  if (isQuadrantMatrix(val)) return val;
  return { q1: [], q2: [], q3: [], q4: [] };
}

/**
 * 读取记录时调用：返回迁移后的数据副本（不修改入参）。
 * 仅处理日/周复盘；其他模板原样返回。
 */
export function migrateLegacyMatrixData(
  templateId: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  if (templateId !== 'daily_review' && templateId !== 'weekly_review') return data;
  if (data._matrixMigrated) return data;

  const out = { ...data };
  let changed = false;

  if (templateId === 'daily_review') {
    // 1) 明天最重要的一件事 → 明日第二象限要事（目标为空时才回填）
    if (isEmpty(out.daily_q2_focus) && !isEmpty(out.daily_tomorrow_priority)) {
      out.daily_q2_focus = out.daily_tomorrow_priority;
      changed = true;
    }
    // 2) 今天最有价值的一件事 → 矩阵第二象限首项（第二象限为空时才注入）
    if (!isEmpty(out.daily_most_valuable)) {
      const matrix = normalizeMatrix(out.daily_matrix);
      if (matrix.q2.length === 0) {
        matrix.q2.push({
          id: `legacy-${Date.now()}`,
          text: String(out.daily_most_valuable),
        });
        out.daily_matrix = matrix;
        changed = true;
      }
    }
  }

  if (templateId === 'weekly_review') {
    // 旧「下周第二象限要事」→ 下周规划核心目标1（目标为空时才回填）
    if (isEmpty(out.core_goal1) && !isEmpty(out.weekly_q2_next)) {
      out.core_goal1 = out.weekly_q2_next;
      changed = true;
    }
  }

  if (changed) out._matrixMigrated = true;
  return out;
}
