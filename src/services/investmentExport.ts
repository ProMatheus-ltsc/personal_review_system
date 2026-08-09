/**
 * investmentExport — 投资检查清单历史记录 JSON 导出服务
 *
 * 支持三种过滤方式（可组合）：
 * - 全量导出：不带任何过滤条件
 * - 时间段导出：按买入日期（buy_date）过滤，含边界（dateFrom <= buy_date <= dateTo）
 * - 股票代码导出：按 buy_company_name 精确匹配（大小写不敏感，兼容大写字母代码）
 *
 * 导出格式带元信息（exportType / exportDate / filter / recordCount），
 * 便于辨识导出内容与过滤条件。
 */
import type { FormRecord } from '@/types';

/** 导出过滤条件 */
export interface InvestmentExportFilter {
  /** 股票代码（大小写不敏感，如 AAPL / 00700 / 600519） */
  code?: string;
  /** 时间段起始（含），按买入日期 buy_date 过滤，格式 YYYY-MM-DD */
  dateFrom?: string;
  /** 时间段结束（含），按买入日期 buy_date 过滤，格式 YYYY-MM-DD */
  dateTo?: string;
}

/** 导出结果元信息 */
interface InvestmentExportMeta {
  exportType: 'investment_checklist';
  exportDate: string;
  appName: string;
  /** 实际生效的过滤条件（仅包含已填写的项） */
  filter: { code?: string; dateFrom?: string; dateTo?: string };
  recordCount: number;
}

/** 完整导出结构 */
export interface InvestmentExportPayload extends InvestmentExportMeta {
  records: FormRecord[];
}

/** 归一化日期为 YYYY-MM-DD（无效返回空串） */
function normalizeDate(v: unknown): string {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  const s = String(v).trim();
  // 兼容带时间的 ISO 串
  const datePart = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '';
  return datePart;
}

/**
 * 应用过滤条件筛选投资检查清单记录
 * @param records - 全部投资检查清单记录（未过滤）
 * @param filter - 过滤条件（code / dateFrom / dateTo 均可选，同时满足）
 * @returns 过滤后的记录（按买入日期升序，无买入日期排最后）
 */
export function filterInvestmentRecords(
  records: FormRecord[],
  filter: InvestmentExportFilter = {}
): FormRecord[] {
  const code = filter.code?.trim().toUpperCase() || '';
  const dateFrom = normalizeDate(filter.dateFrom);
  const dateTo = normalizeDate(filter.dateTo);

  const result = records.filter((r) => {
    // 股票代码过滤（大小写不敏感）
    if (code) {
      const recordCode = String(r.data.buy_company_name ?? '').trim().toUpperCase();
      if (recordCode !== code) return false;
    }
    // 时间段过滤（按买入日期，含边界）
    if (dateFrom || dateTo) {
      const buyDate = normalizeDate(r.data.buy_date);
      if (!buyDate) return false; // 无买入日期 → 不匹配时间段条件
      if (dateFrom && buyDate < dateFrom) return false;
      if (dateTo && buyDate > dateTo) return false;
    }
    return true;
  });

  // 按买入日期升序（无买入日期排最后），保持稳定
  return result.sort((a, b) => {
    const da = normalizeDate(a.data.buy_date);
    const db = normalizeDate(b.data.buy_date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  });
}

/**
 * 导出投资检查清单记录为 JSON 字符串
 * @param records - 全部投资检查清单记录
 * @param filter - 导出过滤条件（缺省 = 全量导出）
 * @returns 格式化的 JSON 字符串（含元信息与记录）
 */
export function exportInvestmentRecords(
  records: FormRecord[],
  filter: InvestmentExportFilter = {}
): string {
  const filtered = filterInvestmentRecords(records, filter);

  // 仅记录已填写的过滤项
  const activeFilter: { code?: string; dateFrom?: string; dateTo?: string } = {};
  const code = filter.code?.trim().toUpperCase() || '';
  const dateFrom = normalizeDate(filter.dateFrom);
  const dateTo = normalizeDate(filter.dateTo);
  if (code) activeFilter.code = code;
  if (dateFrom) activeFilter.dateFrom = dateFrom;
  if (dateTo) activeFilter.dateTo = dateTo;

  const payload: InvestmentExportPayload = {
    exportType: 'investment_checklist',
    exportDate: new Date().toISOString(),
    appName: 'review-app',
    filter: activeFilter,
    recordCount: filtered.length,
    records: filtered,
  };

  return JSON.stringify(payload, null, 2);
}

/** 生成导出文件名（含过滤条件描述） */
export function buildExportFilename(filter: InvestmentExportFilter = {}): string {
  const date = new Date().toISOString().slice(0, 10);
  const code = filter.code?.trim().toUpperCase() || '';
  const dateFrom = normalizeDate(filter.dateFrom);
  const dateTo = normalizeDate(filter.dateTo);
  const parts = ['investment', date];
  if (code) parts.push(code);
  if (dateFrom || dateTo) parts.push(`${dateFrom || 'all'}_${dateTo || 'all'}`);
  return `${parts.join('-')}.json`;
}
