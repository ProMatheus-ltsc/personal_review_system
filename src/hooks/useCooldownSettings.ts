/**
 * useCooldownSettings — 统一读取各场景复盘等待期天数
 *
 * 从 IndexedDB settings 读取买入/卖出/持仓/决策日志四种场景的冷静期天数配置，
 * 消除 FormRenderer 和 DashboardPage 中的重复读取代码。
 */
import { useState, useEffect } from 'react';
import { getSetting } from '@/services/db';
import { COOLDOWN_SETTINGS, DEFAULT_COOLDOWN_DAYS } from '@/templates/investmentChecklist';

export interface CooldownDays {
  buy: number;
  sell: number;
  position: number;
  decision: number;
}

const DEFAULT: CooldownDays = {
  buy: DEFAULT_COOLDOWN_DAYS,
  sell: DEFAULT_COOLDOWN_DAYS,
  position: DEFAULT_COOLDOWN_DAYS,
  decision: DEFAULT_COOLDOWN_DAYS,
};

export function useCooldownSettings(): CooldownDays {
  const [cooldownDays, setCooldownDays] = useState<CooldownDays>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [buy, sell, pos, decision] = await Promise.all([
        getSetting(COOLDOWN_SETTINGS.BUY),
        getSetting(COOLDOWN_SETTINGS.SELL),
        getSetting(COOLDOWN_SETTINGS.POSITION),
        getSetting(COOLDOWN_SETTINGS.DECISION),
      ]);
      if (cancelled) return;
      const toNum = (v: unknown, fallback: number): number => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
      };
      setCooldownDays({
        buy: toNum(buy, DEFAULT_COOLDOWN_DAYS),
        sell: toNum(sell, DEFAULT_COOLDOWN_DAYS),
        position: toNum(pos, DEFAULT_COOLDOWN_DAYS),
        decision: toNum(decision, DEFAULT_COOLDOWN_DAYS),
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return cooldownDays;
}
