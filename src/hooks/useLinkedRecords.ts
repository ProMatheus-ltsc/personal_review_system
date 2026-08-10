/**
 * useLinkedRecords — 持仓单关联记录加载 hook
 *
 * 持仓单(position)会关联多条买入单和卖出单，本 hook 根据
 * linkedBuyIds / linkedSellIds 批量加载对应的 FormRecord，
 * 供 PositionReviewOverview 等组件展示关联交易明细。
 *
 * 仅当 templateId 属于投资模板且 recordRole === 'position' 时才触发加载，
 * 其余场景返回空数组以避免无意义的 DB 读取。
 */
import { useState, useEffect } from 'react';
import type { FormRecord } from '@/types';
import { getRecord } from '@/services/db';
import { isInvestmentTemplate } from '@/constants/templateMeta';

export function useLinkedRecords(
  templateId: string,
  recordRole: 'position' | 'buy' | 'sell' | undefined,
  linkedBuyIds: string[] | undefined,
  linkedSellIds: string[] | undefined
) {
  const [buyRecords, setBuyRecords] = useState<FormRecord[]>([]);
  const [sellRecords, setSellRecords] = useState<FormRecord[]>([]);

  useEffect(() => {
    if (!isInvestmentTemplate(templateId) || recordRole !== 'position') {
      setBuyRecords([]);
      setSellRecords([]);
      return;
    }
    let cancelled = false;
    const buyIds = Array.isArray(linkedBuyIds) ? linkedBuyIds : [];
    const sellIds = Array.isArray(linkedSellIds) ? linkedSellIds : [];

    Promise.all([
      Promise.all(buyIds.map((id) => getRecord(id))),
      Promise.all(sellIds.map((id) => getRecord(id))),
    ]).then(([buys, sells]) => {
      if (cancelled) return;
      setBuyRecords(buys.filter((r): r is FormRecord => !!r));
      setSellRecords(sells.filter((r): r is FormRecord => !!r));
    });
    return () => { cancelled = true; };
  }, [templateId, recordRole, linkedBuyIds?.join(','), linkedSellIds?.join(',')]);

  return { linkedBuyRecords: buyRecords, linkedSellRecords: sellRecords };
}
