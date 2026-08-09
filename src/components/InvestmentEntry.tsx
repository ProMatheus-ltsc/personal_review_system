/**
 * InvestmentEntry — 投资检查清单新建入口
 *
 * 以股票代码为中心的操作选择页：
 * 1. 输入股票代码（支持已有仓位代码快速选择）
 * 2. 查询该代码仓位单：
 *    - 已有仓位：显示仓位概览 + 操作面板（持有中复盘 / 卖出 / 买入）
 *    - 无仓位：仅允许创建买入单（将同步创建仓位单）
 *
 * 操作语义：
 * - 持有中复盘：进入仓位单（记录持仓检查）
 * - 卖出：新建独立卖出复盘单（关联仓位单），30 天后复盘卖点
 * - 买入：新建独立买入复盘单（关联仓位单，无仓位单时同步创建），30 天后复盘买点
 */
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { getAllRecords } from '@/services/db';
import type { FormRecord } from '@/types';
import {
  collectPositionCodes,
  findPositionByCode,
  linkNewRecord,
  normalizeCode,
  RECORD_ROLE,
} from '@/services/investmentMerge';

export default function InvestmentEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [position, setPosition] = useState<FormRecord | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [allRecords, setAllRecords] = useState<FormRecord[]>([]);
  const [creating, setCreating] = useState<null | 'buy' | 'sell'>(null);
  const [error, setError] = useState<string | null>(null);

  // 已有仓位代码（快速选择）
  const existingCodes = useMemo(() => collectPositionCodes(allRecords), [allRecords]);
  // 当前输入是否命中已有仓位
  const inputCode = normalizeCode(code);
  const matched = existingCodes.find((c) => c === inputCode);

  // 加载全部投资清单记录（用于查仓位）
  const loadRecords = useCallback(async () => {
    const records = await getAllRecords('investment_checklist');
    setAllRecords(records);
    return records;
  }, []);

  // 查询代码
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

  // 创建新单据（买入/卖出），关联仓位单，跳转编辑
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
          // 关联仓位单（无仓位单时同步创建）
          const linked = await linkNewRecord(newRecord, pos);
          if (kind === 'buy' && !pos && linked.position) {
            // 首次买入：仓位单已创建，提示
            setPosition(linked.position);
          }
          await getAllRecords('investment_checklist'); // 刷新（保持数据最新）
          navigate(`/form/investment_checklist/${newRecord.id}`);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : '创建失败，请重试');
        } finally {
          setCreating(null);
        }
      },
      [code, position, allRecords, loadRecords, navigate]
  );

  // 快速选择已有代码
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

  return (
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>✅</span> 投资检查清单
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            以股票代码为中心 — 一个代码一份仓位，买卖各自独立复盘
          </p>
        </div>

        {/* 股票代码输入 */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            股票代码
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

          {/* 已有仓位代码快速选择 */}
          {existingCodes.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-1.5">已有仓位快速选择：</p>
                <div className="flex flex-wrap gap-1.5">
                  {existingCodes.map((c) => (
                      <button
                          key={c}
                          onClick={() => handleQuickSelect(c)}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                              matched === c
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                          }`}
                      >
                        {c}
                      </button>
                  ))}
                </div>
              </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* 查询结果：操作面板 */}
        {checked && position && (
            <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-indigo-800">
                  📌 {normalizeCode(code)} 仓位单
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
                    title={remainingQty <= 0 ? '无持仓，无法卖出' : '新建卖出复盘单，30 天后复盘'}
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
                买卖操作各新建独立复盘单（30 天后可复盘），仓位单自动汇总所有买卖明细。
              </p>
            </div>
        )}

        {/* 查询结果：无仓位 → 仅买入 */}
        {checked && !position && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
              <h3 className="text-base font-semibold text-gray-800 mb-2">
                🆕 {normalizeCode(code)} 还没有仓位单
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                该股票代码暂无仓位，请先创建买入单。创建买入单后将同步创建仓位单，
                之后即可进行持有中复盘与后续买卖操作。
              </p>
              <button
                  onClick={() => handleCreate('buy')}
                  disabled={creating !== null}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating === 'buy' ? '创建中...' : '🛒 创建买入单（同步创建仓位单）'}
              </button>
            </div>
        )}

        {/* 操作说明 */}
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-xs text-gray-500 space-y-1.5">
          <p>📋 使用说明：</p>
          <p>• 买入/卖出各生成独立复盘单，填写决策后 30 天自动解锁对应复盘</p>
          <p>• 仓位单按股票代码自动汇总所有买卖明细（现有表格形式）</p>
          <p>• 仓位单支持持有中复盘（表格形式）；清仓 30 天后解锁投资周期复盘</p>
          <p>• 有持仓的仓位单可随时发起卖出</p>
        </div>
      </div>
  );
}
