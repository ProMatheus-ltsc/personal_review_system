/**
 * useInvestmentLinked — 投资检查清单「买卖单 ↔ 仓位单」联动逻辑
 *
 * 新模型下买入单/卖出单是独立单据，仓位单按股票代码汇总所有买卖明细。
 * 本 hook 封装三类联动，供 FormRenderer 使用，避免主组件过于臃肿：
 *
 * 1. linkedPosition：加载当前单据关联的仓位单
 *    —— 卖出单的持仓上下文（平均成本/剩余持仓）、卖出复盘量化对比
 *       （目标价/止损/预期周期）等数据都从仓位单派生
 * 2. 卖出单注入「加权平均买入日期 + 平均买入价」派生字段
 *    —— 新模型卖出单本身不填买入信息，但盈亏%（sell_pnl_percent）与
 *       持仓周期（sell_hold_days）两个 computed 字段依赖 buy_price/buy_date；
 *       注入后自动计算并持久化。加权平均买入日期与加权平均买入价同思路：
 *       Σ(数量 × 买入日期) / Σ数量
 * 3. linkSaveAfterSave：保存后的联动
 *    —— 买入单完成（代码/逻辑/检查齐备）且尚无仓位单 → 自动创建仓位单
 *    —— 对已有仓位单 → 重新汇总（merged_buy_lots / merged_sell_lots /
 *       剩余持仓 / 平均价 / 清仓状态），全部卖出时提示复盘开放
 */
import { useState, useEffect, useCallback } from 'react';
import type { FormRecord } from '@/types';
import { getRecord, getAllRecords, saveRecord } from '@/services/db';
import {
  ensurePositionForBuyRecord,
  getLinkedRecords,
  syncPositionFromLinked,
  weightedAvgBuyDate,
} from '@/services/investmentMerge';
import { isFieldEmpty } from '@/utils/formValidation';

interface InvestmentLinkedOptions {
  /** 模板 id（仅 investment_checklist 生效） */
  templateId: string;
  /** 单据角色（position / buy / sell） */
  recordRole?: 'position' | 'buy' | 'sell';
  /** 当前单据关联的仓位单 id（watch('position_record_id')） */
  positionId: string | undefined;
  /** 投资周期复盘等待期天数（卖出清仓提示文案用） */
  positionCooldownDays: number;
  /** react-hook-form 的 getValues（支持按字段名读取） */
  getValues: (name?: string) => any;
  setValue: (name: string, value: unknown, options?: { shouldDirty?: boolean }) => void;
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

/**
 * 投资检查清单买卖单联动 hook
 * @returns linkedPosition 关联仓位单（卖出上下文/复盘对比数据源）；linkSaveAfterSave 保存后联动
 */
export function useInvestmentLinked({
  templateId,
  recordRole,
  positionId,
  positionCooldownDays,
  getValues,
  setValue,
  showToast,
}: InvestmentLinkedOptions) {
  // 关联仓位单：卖出上下文/复盘量化对比的数据源（平均成本、剩余持仓、
  // 目标价、止损价等从仓位单派生，而非买卖单自身的买入字段）
  const [linkedPosition, setLinkedPosition] = useState<FormRecord | undefined>(undefined);

  useEffect(() => {
    if (templateId !== 'investment_checklist' || !positionId) {
      setLinkedPosition(undefined);
      return;
    }
    let cancelled = false;
    getRecord(positionId).then((pos) => {
      if (!cancelled) setLinkedPosition(pos);
    });
    return () => {
      cancelled = true;
    };
  }, [templateId, positionId]);

  // 卖出单：注入「加权平均买入日期 + 平均买入价」派生字段（幂等，不覆盖已有值）。
  // 持仓周期按加权平均买入时间计算（Σ数量×买入日期 / Σ数量，与加权平均买入价同思路）
  useEffect(() => {
    if (templateId !== 'investment_checklist' || recordRole !== 'sell' || !linkedPosition) return;
    const buyLots = Array.isArray(linkedPosition.data.merged_buy_lots)
        ? (linkedPosition.data.merged_buy_lots as { date?: string; qty?: string | number }[])
        : [];
    const avgDate = weightedAvgBuyDate(buyLots);
    const avgPrice = linkedPosition.data.buy_price as string | number | undefined;
    if (avgDate && isFieldEmpty(getValues('buy_date'))) {
      setValue('buy_date', avgDate, { shouldDirty: false });
    }
    if (
        avgPrice !== undefined && avgPrice !== null && String(avgPrice).trim() !== '' &&
        isFieldEmpty(getValues('buy_price'))
    ) {
      setValue('buy_price', String(avgPrice), { shouldDirty: false });
    }
  }, [templateId, recordRole, linkedPosition, getValues, setValue]);

  // 保存后联动：
  // 1) 买入单完成（代码/逻辑/检查齐备）且尚无仓位单 → 创建/复用仓位单
  // 2) 对已有仓位单 → 从关联买卖单重新汇总持仓数据
  // 3) 卖出单全部卖出 → 提示投资周期复盘开放时间
  // 30 秒自动保存（skipMerge=true）不触发联动，避免填写中被打断
  const linkSaveAfterSave = useCallback(
      async (record: FormRecord, skipMerge: boolean): Promise<void> => {
        if (templateId !== 'investment_checklist' || skipMerge) return;
        if (recordRole !== 'buy' && recordRole !== 'sell') return;
        const code = String(record.data.buy_company_name ?? '').trim();
        if (!code) return;

        // 读取已关联仓位单（无则买入单完成后创建）
        const linkedId = record.data.position_record_id as string | undefined;
        let position = linkedId ? await getRecord(linkedId) : undefined;
        if (recordRole === 'buy' && !position) {
          position = await ensureBuyPositionForRecord(record, code);
        }

        // 刷新仓位单汇总（merged_buy_lots / merged_sell_lots / 剩余持仓 / 清仓状态）
        if (position) {
          await refreshPositionSummary(position, recordRole, code, positionCooldownDays);
        }
      },
      [templateId, recordRole, positionCooldownDays, showToast]
  );

  /** 买入单完成（核心字段齐备）→ 创建/复用仓位单并提示（幂等） */
  async function ensureBuyPositionForRecord(record: FormRecord, code: string): Promise<FormRecord | undefined> {
    const buyingDone =
        !isFieldEmpty(record.data.buy_company_name) &&
        !isFieldEmpty(record.data.buy_thesis) &&
        record.data.buy_understand_business === true;
    if (!buyingDone) return undefined;
    const allRecords = await getAllRecords('investment_checklist');
    const position = await ensurePositionForBuyRecord(record, allRecords);
    if (position) {
      showToast(`买入记录已完成，已自动建立 ${code} 的持仓记录`, 'success');
    }
    return position;
  }

  /** 从关联买卖单重新汇总仓位单数据并保存；卖出全部清仓时提示投资周期复盘开放 */
  async function refreshPositionSummary(
      position: FormRecord,
      recordRole: 'position' | 'buy' | 'sell',
      code: string,
      cooldownDays: number
  ): Promise<void> {
    const refreshed = await getAllRecords('investment_checklist');
    const { buyRecords, sellRecords } = getLinkedRecords(position, refreshed);
    const updated = syncPositionFromLinked(position, buyRecords, sellRecords);
    await saveRecord(updated);
    if (recordRole === 'sell' && updated.data.sold_out === true) {
      showToast(`${code} 已全部卖出，${cooldownDays} 天后可进行投资周期复盘`, 'success');
    }
  }

  return { linkedPosition, linkSaveAfterSave };
}
