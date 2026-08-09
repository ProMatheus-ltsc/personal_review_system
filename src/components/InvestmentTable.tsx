/**
 * InvestmentTable — 投资交易记录表格视图
 *
 * 以表格形式展示投资检查清单的关键数据：
 * 标的、买入/卖出日期与价格、盈亏百分比、持有天数、当前状态。
 * 盈亏遵循中国习惯：盈利红色、亏损绿色。
 */
import type { FormRecord } from '@/types';
import { isFieldEmpty } from '@/utils/formValidation';
import { readReviews } from '@/services/investmentMerge';
import clsx from 'clsx';

interface InvestmentTableProps {
  records: FormRecord[];
  onSelect: (record: FormRecord) => void;
}

export default function InvestmentTable({ records, onSelect }: InvestmentTableProps) {
  const getStatus = (r: FormRecord): { label: string; cls: string } => {
    const role = r.data.record_role as string | undefined;
    // 买入单：买入后 30 天可复盘（buy_review_lesson）
    if (role === 'buy') {
      const reviewed = !isFieldEmpty(r.data.buy_review_lesson);
      return reviewed
          ? { label: '已复盘', cls: 'bg-green-100 text-green-700' }
          : { label: '买入单', cls: 'bg-blue-100 text-blue-600' };
    }
    // 卖出单：卖出后 30 天可复盘（sell_review_entries）
    if (role === 'sell') {
      const entries = r.data.sell_review_entries as Record<string, unknown>[] | undefined;
      const reviewed = Array.isArray(entries) && entries.some((e) => !isFieldEmpty(e.sell_lesson));
      return reviewed
          ? { label: '已复盘', cls: 'bg-green-100 text-green-700' }
          : { label: '卖出单', cls: 'bg-amber-100 text-amber-700' };
    }
    // 仓位单：已复盘（position_lesson 或 Trade 层）
    const positionReviewed = !isFieldEmpty(r.data.position_lesson);
    if (positionReviewed) {
      return { label: '已复盘', cls: 'bg-green-100 text-green-700' };
    }
    const reviews = readReviews(r);
    if (reviews.some((rv) => !isFieldEmpty(rv.lesson))) {
      return { label: '已复盘', cls: 'bg-green-100 text-green-700' };
    }
    const entries = r.data.sell_review_entries as Record<string, unknown>[] | undefined;
    if (Array.isArray(entries) && entries.some((e) => !isFieldEmpty(e.sell_lesson))) {
      return { label: '已复盘', cls: 'bg-green-100 text-green-700' };
    }
    if (r.data.sold_out === true) {
      return { label: '已清仓', cls: 'bg-blue-100 text-blue-600' };
    }
    const sellPrice = r.data.sell_exit_price;
    if (sellPrice !== undefined && sellPrice !== null && String(sellPrice).trim() !== '') {
      return { label: '已卖出', cls: 'bg-blue-100 text-blue-600' };
    }
    return { label: '持有中', cls: 'bg-amber-100 text-amber-700' };
  };

  const currencySymbol = (r: FormRecord): string =>
    r.data.buy_currency === 'USD' ? '$' : '¥';

  const renderPnl = (r: FormRecord) => {
    const raw = r.data.sell_pnl_percent;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return <span className="text-gray-300">-</span>;
    }
    const num = Number(raw);
    if (isNaN(num)) return <span className="text-gray-300">-</span>;
    return (
      <span
        className={clsx(
          'font-medium',
          num > 0 ? 'text-red-600' : num < 0 ? 'text-green-600' : 'text-gray-500'
        )}
      >
        {num > 0 ? '+' : ''}
        {num.toFixed(2)}%
      </span>
    );
  };

  if (records.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-gray-400">暂无投资记录</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-3 py-2.5 font-medium">标的</th>
            <th className="px-3 py-2.5 font-medium">买入日期</th>
            <th className="px-3 py-2.5 font-medium">买入价</th>
            <th className="px-3 py-2.5 font-medium">卖出日期</th>
            <th className="px-3 py-2.5 font-medium">卖出价</th>
            <th className="px-3 py-2.5 font-medium">盈亏</th>
            <th className="px-3 py-2.5 font-medium">持有天数</th>
            <th className="px-3 py-2.5 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const st = getStatus(r);
            const cur = currencySymbol(r);
            const buyPrice = r.data.buy_price;
            const sellPrice = r.data.sell_exit_price;
            const holdDays = r.data.sell_hold_days;
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r)}
                className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {(r.data.buy_company_name as string) || '未命名标的'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  {(r.data.buy_date as string) || '-'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  {buyPrice ? `${cur}${buyPrice}` : '-'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  {(r.data.sell_date as string) || '-'}
                </td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  {sellPrice ? `${cur}${sellPrice}` : '-'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{renderPnl(r)}</td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                  {holdDays !== undefined && holdDays !== null && holdDays !== ''
                    ? String(holdDays)
                    : '-'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
