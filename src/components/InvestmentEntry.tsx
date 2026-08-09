/**
 * InvestmentEntry — 投资检查清单新建入口
 *
 * 以股票代码为中心的操作选择页：
 * 1. 打开即展示快速选择：历史持仓代码 + 热门股票（无需先输入）
 * 2. 输入股票代码后按 Enter 或点「查询」查询仓位单：
 *    - 已有仓位：显示仓位概览 + 操作面板（持有中复盘 / 卖出 / 买入）
 *    - 无仓位：仅允许创建买入单（买入单完成后自动同步创建仓位单）
 * 3. 复盘冷静期设置：买入/卖出/投资周期复盘各场景解锁天数可在页面配置
 *
 * 操作语义：
 * - 持有中复盘：进入仓位单（记录持仓检查）
 * - 卖出：新建独立卖出复盘单（关联仓位单），冷静期后复盘卖点
 * - 买入：新建独立买入复盘单，完成后同步创建仓位单，冷静期后复盘买点
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { getAllRecords, getSetting, setSetting } from '@/services/db';
import type { FormRecord } from '@/types';
import { COOLDOWN_SETTINGS, DEFAULT_COOLDOWN_DAYS } from '@/templates/investmentChecklist';
import {
  collectPositionCodes,
  findPositionByCode,
  linkNewRecord,
  normalizeCode,
  RECORD_ROLE,
} from '@/services/investmentMerge';

/** 热门股票（无历史持仓时也提供快速选项） */
const HOT_STOCKS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', '00700', '600519', '000858', '300750'];

/** 冷静期场景配置项描述 */
const COOLDOWN_ITEMS = [
  { key: COOLDOWN_SETTINGS.BUY, label: '买入复盘等待期', hint: '买入后，等待多久才能复盘买入决策' },
  { key: COOLDOWN_SETTINGS.SELL, label: '卖出复盘等待期', hint: '卖出后，等待多久才能复盘卖出决策' },
  { key: COOLDOWN_SETTINGS.POSITION, label: '投资周期复盘等待期', hint: '全部卖出后，等待多久才能复盘整个投资过程' },
] as const;

export default function InvestmentEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [position, setPosition] = useState<FormRecord | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [allRecords, setAllRecords] = useState<FormRecord[]>([]);
  const [creating, setCreating] = useState<null | 'buy' | 'sell'>(null);
  const [error, setError] = useState<string | null>(null);

  // 冷静期设置（按账户存储）
  const [cooldownInputs, setCooldownInputs] = useState<Record<string, string>>({
    [COOLDOWN_SETTINGS.BUY]: String(DEFAULT_COOLDOWN_DAYS),
    [COOLDOWN_SETTINGS.SELL]: String(DEFAULT_COOLDOWN_DAYS),
    [COOLDOWN_SETTINGS.POSITION]: String(DEFAULT_COOLDOWN_DAYS),
  });
  const [cooldownSaved, setCooldownSaved] = useState(false);

  // 加载全部投资清单记录（用于查仓位与历史持仓快速选择）
  const loadRecords = useCallback(async () => {
    const records = await getAllRecords('investment_checklist');
    setAllRecords(records);
    return records;
  }, []);

  // 打开页面即加载历史持仓（快速选择前置到输入之前）
  useEffect(() => {
    loadRecords();
    // 读取冷静期配置
    (async () => {
      const [buy, sell, pos] = await Promise.all([
        getSetting(COOLDOWN_SETTINGS.BUY),
        getSetting(COOLDOWN_SETTINGS.SELL),
        getSetting(COOLDOWN_SETTINGS.POSITION),
      ]);
      setCooldownInputs({
        [COOLDOWN_SETTINGS.BUY]: String(buy ?? DEFAULT_COOLDOWN_DAYS),
        [COOLDOWN_SETTINGS.SELL]: String(sell ?? DEFAULT_COOLDOWN_DAYS),
        [COOLDOWN_SETTINGS.POSITION]: String(pos ?? DEFAULT_COOLDOWN_DAYS),
      });
    })();
  }, [loadRecords]);

  // 历史持仓代码（快速选择，输入前即展示）
  const existingCodes = useMemo(() => collectPositionCodes(allRecords), [allRecords]);
  // 当前输入是否命中已有仓位
  const inputCode = normalizeCode(code);
  const matched = existingCodes.find((c) => c === inputCode);

  /** 保存冷静期配置 */
  const handleSaveCooldowns = useCallback(async () => {
    for (const item of COOLDOWN_ITEMS) {
      const raw = cooldownInputs[item.key]?.trim();
      const n = raw === '' ? 0 : Number(raw);
      const valid = Number.isFinite(n) && n >= 0;
      if (!valid) {
        setError(`「${item.label}」需为 0 或正整数`);
        return;
      }
    }
    for (const item of COOLDOWN_ITEMS) {
      await setSetting(item.key, String(Math.round(Number(cooldownInputs[item.key]))));
    }
    setCooldownSaved(true);
    setTimeout(() => setCooldownSaved(false), 2000);
    setError(null);
  }, [cooldownInputs]);

  // 查询代码（按钮或 Enter 触发）
  const handleQuery = useCallback(async () => {
    const normalized = normalizeCode(code);
    if (!normalized) {
      setError('请输入股票代码');
      return;
    }
    setError(null);
    const records = await loadRecords();
    const p = findPositionByCode(records, normalized);
    setPosition(p);
    setChecked(true);
  }, [code, loadRecords]);

  // 输入框 Enter 键触发查询
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuery();
    }
  }, [handleQuery]);

  // 创建新单据（买入/卖出），关联已有仓位单，跳转编辑
  const handleCreate = useCallback(
      async (kind: 'buy' | 'sell') => {
        const normalized = normalizeCode(code);
        if (!normalized) return;
        setCreating(kind);
        setError(null);
        try {
          const records = position ? allRecords : await loadRecords();
          const pos = position ?? findPositionByCode(records, normalized);
          const now = new Date().toISOString();
          const newRecord: FormRecord = {
            id: uuidv4(),
            templateId: 'investment_checklist',
            // 统一单据名：投资检查清单 - {代码} {买入|卖出}（仓位单为「持有仓位」）
            title: `投资检查清单 - ${normalized} ${kind === 'buy' ? '买入' : '卖出'}`,
            data: {
              record_role: kind === 'buy' ? RECORD_ROLE.BUY : RECORD_ROLE.SELL,
              buy_company_name: normalized,
              // 预填默认日期（买入/卖出当天）
              ...(kind === 'buy' ? { buy_date: now.slice(0, 10) } : { sell_date: now.slice(0, 10) }),
            },
            status: 'draft',
            createdAt: now,
            updatedAt: now,
          };
          // 关联已有仓位单（无仓位单时不创建——买入单完成后才同步创建）
          await linkNewRecord(newRecord, pos);
          navigate(`/form/investment_checklist/${newRecord.id}`);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : '创建失败，请重试');
        } finally {
          setCreating(null);
        }
      },
      [code, position, allRecords, loadRecords, navigate]
  );

  // 快速选择（历史持仓 / 热门股票）：选中即查询
  const handleQuickSelect = useCallback(
      (c: string) => {
        setCode(c);
        setPosition(findPositionByCode(allRecords, c));
        setChecked(true);
        setError(null);
      },
      [allRecords]
  );

  // 仓位概览（已有仓位时）
  const remainingQty = position
      ? Number(position.data.remaining_qty ?? position.data.merged_total_qty ?? 0)
      : 0;
  const soldOut = position?.data.sold_out === true;

  // 快速选择按钮渲染（历史持仓 + 热门股票，去重）
  const quickCodes = useMemo(() => {
    const seen = new Set<string>();
    return [...existingCodes, ...HOT_STOCKS].filter((c) => {
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    });
  }, [existingCodes]);

  return (
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>✅</span> 投资检查清单
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            输入股票代码，管理持仓、买入与卖出复盘
          </p>
        </div>

        {/* 股票代码输入 */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            股票代码 <span className="text-gray-400 font-normal">（输入后按 Enter 查询）</span>
          </label>
          <div className="flex gap-2">
            <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setChecked(false);
                  setPosition(undefined);
                }}
                onKeyDown={handleKeyDown}
                placeholder="如 AAPL / 00700 / 600519"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
            />
            <button
                onClick={handleQuery}
                disabled={!code.trim() || creating !== null}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              查询
            </button>
          </div>

          {/* 快速选择（输入前即展示：历史持仓 + 热门股票） */}
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-1.5">
              {existingCodes.length > 0 ? '历史持仓 / 热门快速选择（点击即查询）：' : '热门股票快速选择（点击即查询）：'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickCodes.map((c) => (
                  <button
                      key={c}
                      onClick={() => handleQuickSelect(c)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                          matched === c
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : existingCodes.includes(c)
                                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                  >
                    {c}
                    {existingCodes.includes(c) && <span className="ml-0.5 text-[9px] opacity-60">●</span>}
                  </button>
              ))}
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* 查询结果：操作面板 */}
        {checked && position && (
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-indigo-800">
                  📌 {normalizeCode(code)} 持仓
                </h3>
                <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        soldOut ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-600'
                    }`}
                >
                  {soldOut ? '已清仓' : remainingQty > 0 ? `持有中 · 剩余 ${remainingQty}` : '空仓'}
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-0.5 mb-4">
                <p>
                  加权买入价{' '}
                  <b className="text-gray-900">{String(position.data.buy_price ?? '-')}</b>
                  {' · '}总买入{' '}
                  <b className="text-gray-900">{Number(position.data.merged_total_qty ?? 0)}</b>
                  {' · '}累计卖出{' '}
                  <b className="text-gray-900">{Number(position.data.merged_total_sell_qty ?? 0)}</b>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* 持有中复盘：进入仓位单 */}
                <button
                    onClick={() => navigate(`/form/investment_checklist/${position.id}`)}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  ⏳ 持有中复盘
                </button>
                {/* 卖出（持股 > 0 时可用） */}
                <button
                    onClick={() => handleCreate('sell')}
                    disabled={creating !== null || remainingQty <= 0 || soldOut}
                    className="px-4 py-2 bg-white border border-amber-400 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={remainingQty <= 0 ? '无持仓，无法卖出' : '新建卖出复盘单，冷静期后复盘'}
                >
                  {creating === 'sell' ? '创建中...' : '💰 卖出'}
                </button>
                {/* 买入 */}
                <button
                    onClick={() => handleCreate('buy')}
                    disabled={creating !== null}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {creating === 'buy' ? '创建中...' : '🛒 买入'}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-indigo-400">
                每次买入/卖出都会生成独立的复盘记录，等待期结束后即可复盘；同一代码的买卖明细会自动汇总展示在持仓记录中。
              </p>
            </div>
        )}

        {/* 查询结果：无仓位 → 仅买入 */}
        {checked && !position && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
              <h3 className="text-base font-semibold text-gray-800 mb-2">
                🆕 {normalizeCode(code)} 还没有持仓记录
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                该股票代码暂无持仓，请先创建买入记录。买入记录填写完成后，系统会自动建立对应的持仓记录，
                之后即可记录持有检查、继续买入或卖出。
              </p>
              <button
                  onClick={() => handleCreate('buy')}
                  disabled={creating !== null}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating === 'buy' ? '创建中...' : '🛒 创建买入记录（完成后自动建立持仓记录）'}
              </button>
            </div>
        )}

        {/* 复盘冷静期设置（按场景可配置） */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">
            ⏱ 复盘等待期设置
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            每次复盘前需要等待的天数，可按场景分别设置（0 表示无需等待；修改后对新记录生效）
          </p>
          <div className="space-y-3">
            {COOLDOWN_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">{item.label}</p>
                    <p className="text-[11px] text-gray-400">{item.hint}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                        type="number"
                        min={0}
                        max={365}
                        value={cooldownInputs[item.key]}
                        onChange={(e) => setCooldownInputs((prev) => ({ ...prev, [item.key]: e.target.value }))}
                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <span className="text-xs text-gray-400">天</span>
                  </div>
                </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
                onClick={handleSaveCooldowns}
                className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              保存设置
            </button>
            {cooldownSaved && <span className="text-sm text-green-600">✅ 已保存</span>}
          </div>
        </div>

        {/* 操作说明 */}
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-xs text-gray-500 space-y-1.5">
          <p>📋 使用说明：</p>
          <p>• 买入和卖出各自独立复盘：完成记录后，等待设置的冷静期即可复盘</p>
          <p>• 买入记录完成后自动建立持仓记录；同一代码的所有买卖明细会自动汇总展示</p>
          <p>• 持仓期间可随时记录持有检查；全部卖出后，等待冷静期即可做整体复盘</p>
          <p>• 有持仓时可随时发起卖出</p>
        </div>
      </div>
  );
}
