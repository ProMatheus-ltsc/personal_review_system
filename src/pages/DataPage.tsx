/**
 * DataPage — 数据管理页
 *
 * 提供数据的备份与恢复功能，包括：
 * - 数据概览：总记录数、草稿数、已完成数、存储大小估算
 * - 导出功能：导出全部数据 / 仅导出已完成记录（JSON 格式）
 * - 导入功能：支持合并模式（保留现有 + 补充新增）和覆盖模式（清空后导入）
 * - 数据安全说明：告知用户何时需要备份
 *
 * 导出后会记录最后备份时间，用于首页的备份提醒判断。
 */
import { useState, useEffect } from 'react';
import {
  exportAllRecords,
  exportCompletedRecords,
  importRecords,
  getRecordStats,
  getAllRecords,
  getSetting,
  setSetting,
} from '@/services/db';
import { templates } from '@/templates';
import { exportRecordsAsMarkdown, generateAnnualReport } from '@/services/batchExport';
import { syncMirror, savedPassword, rememberPassword, MirrorSyncError } from '@/services/mirrorSync';
import { StatsPanel } from '@/components/stats';
import ConfirmDialog from '@/components/ConfirmDialog';
import { COOLDOWN_SETTINGS, DEFAULT_COOLDOWN_DAYS } from '@/templates/investmentChecklist';

/** 复盘等待期配置项（按账户存储，各场景独立） */
const COOLDOWN_ITEMS = [
  { key: COOLDOWN_SETTINGS.BUY, label: '买入复盘等待期', hint: '买入后，等待多久才能复盘买入决策' },
  { key: COOLDOWN_SETTINGS.SELL, label: '卖出复盘等待期', hint: '卖出后，等待多久才能复盘卖出决策' },
  { key: COOLDOWN_SETTINGS.POSITION, label: '投资周期复盘等待期', hint: '全部卖出后，等待多久才能复盘整个投资过程' },
  { key: COOLDOWN_SETTINGS.DECISION, label: '决策日志长期复盘等待期', hint: '决策完成后，等待多久才能复盘决策结果' },
] as const;

export default function DataPage() {
  const [stats, setStats] = useState<{
    total: number;
    drafts: number;
    completed: number;
    estimatedSize: number;
  } | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pendingImportText, setPendingImportText] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  // 复盘等待期设置（按账户存储，默认 30 天）
  const [cooldownInputs, setCooldownInputs] = useState<Record<string, string>>({
    [COOLDOWN_SETTINGS.BUY]: String(DEFAULT_COOLDOWN_DAYS),
    [COOLDOWN_SETTINGS.SELL]: String(DEFAULT_COOLDOWN_DAYS),
    [COOLDOWN_SETTINGS.POSITION]: String(DEFAULT_COOLDOWN_DAYS),
    [COOLDOWN_SETTINGS.DECISION]: String(DEFAULT_COOLDOWN_DAYS),
  });
  const [cooldownSaved, setCooldownSaved] = useState(false);
  const [cooldownError, setCooldownError] = useState<string | null>(null);
  // 文档导出（批量 Markdown / 年度报告）
  const [docTemplate, setDocTemplate] = useState<string>('all');
  const [docYear, setDocYear] = useState<string>(String(new Date().getFullYear()));
  const [docExporting, setDocExporting] = useState(false);
  const [docMessage, setDocMessage] = useState<string | null>(null);
  // 云端底稿同步（加密镜像，只读方向）
  const [mirrorPassword, setMirrorPassword] = useState<string>(() => savedPassword());
  const [mirrorRemember, setMirrorRemember] = useState<boolean>(() => Boolean(savedPassword()));
  const [mirrorBusy, setMirrorBusy] = useState(false);
  const [mirrorResult, setMirrorResult] = useState<{ ok: boolean; text: string } | null>(null);
  // 可选年份：今年 + 前 4 年
  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  useEffect(() => {
    loadData();
    // 加载复盘等待期配置
    (async () => {
      const [buy, sell, pos, decision] = await Promise.all([
        getSetting(COOLDOWN_SETTINGS.BUY),
        getSetting(COOLDOWN_SETTINGS.SELL),
        getSetting(COOLDOWN_SETTINGS.POSITION),
        getSetting(COOLDOWN_SETTINGS.DECISION),
      ]);
      setCooldownInputs({
        [COOLDOWN_SETTINGS.BUY]: String(buy ?? DEFAULT_COOLDOWN_DAYS),
        [COOLDOWN_SETTINGS.SELL]: String(sell ?? DEFAULT_COOLDOWN_DAYS),
        [COOLDOWN_SETTINGS.POSITION]: String(pos ?? DEFAULT_COOLDOWN_DAYS),
        [COOLDOWN_SETTINGS.DECISION]: String(decision ?? DEFAULT_COOLDOWN_DAYS),
      });
    })();
  }, []);

  /** 保存复盘等待期配置（0 = 无需等待；对新记录生效） */
  const handleSaveCooldowns = async () => {
    for (const item of COOLDOWN_ITEMS) {
      const raw = cooldownInputs[item.key]?.trim();
      const n = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setCooldownError(`「${item.label}」需为 0 或正整数`);
        return;
      }
    }
    for (const item of COOLDOWN_ITEMS) {
      await setSetting(item.key, String(Math.round(Number(cooldownInputs[item.key]))));
    }
    setCooldownSaved(true);
    setTimeout(() => setCooldownSaved(false), 2000);
    setCooldownError(null);
  };

  const loadData = async () => {
    const s = await getRecordStats();
    setStats(s);
    const backup = await getSetting('lastBackupDate');
    setLastBackup(backup as string | null);
  };

  const handleExport = async (completedOnly: boolean) => {
    setExporting(true);
    try {
      const json = completedOnly
          ? await exportCompletedRecords()
          : await exportAllRecords();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      // Record last backup date and record count for periodic reminder
      await setSetting('lastBackupDate', new Date().toISOString());
      await setSetting('lastBackupRecordCount', String(stats?.total ?? 0));
      setLastBackup(new Date().toISOString());
    } finally {
      setExporting(false);
    }
  };

  /** 批量导出为 Markdown 文档（按模板筛选） */
  const handleDocExport = async () => {
    setDocExporting(true);
    setDocMessage(null);
    try {
      const all = docTemplate === 'all' ? await getAllRecords() : await getAllRecords(docTemplate);
      const md = exportRecordsAsMarkdown(all, templates);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `review-export-${docTemplate === 'all' ? 'all' : docTemplate}-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setDocMessage(`已导出 ${all.length} 条记录为 Markdown`);
    } catch {
      setDocMessage('导出失败，请重试');
    } finally {
      setDocExporting(false);
    }
  };

  /** 生成年度复盘报告（Markdown） */
  const handleAnnualReport = async () => {
    setDocExporting(true);
    setDocMessage(null);
    try {
      const all = await getAllRecords();
      const year = Number(docYear);
      const md = generateAnnualReport(all, year);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `annual-review-${year}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setDocMessage(`已生成 ${year} 年度复盘报告`);
    } catch {
      setDocMessage('生成失败，请重试');
    } finally {
      setDocExporting(false);
    }
  };

  const executeImport = async (text: string, strategy: 'merge' | 'replace') => {
    try {
      const result = await importRecords(text, strategy);
      const parts = [`导入完成：成功 ${result.imported} 条，跳过 ${result.skipped} 条`];
      if (result.warnings.length > 0) {
        parts.push(`\n⚠️ 校验警告：\n${result.warnings.join('\n')}`);
      }
      setImportResult(parts.join(''));
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      setImportResult(`导入失败：${message}`);
    }
  };

  /**
   * 云端底稿同步：拉取加密镜像 → 口令解密 → 按 LWW 合并
   *
   * 合并只做「补充新增」和「覆盖更晚修改的」，不会删除本机任何记录，
   * 因此可以放心反复执行。
   */
  const handleMirrorSync = async () => {
    const pwd = mirrorPassword.trim();
    if (!pwd) {
      setMirrorResult({ ok: false, text: '请先输入同步口令' });
      return;
    }
    setMirrorBusy(true);
    setMirrorResult(null);
    try {
      const r = await syncMirror(pwd);
      rememberPassword(mirrorRemember ? pwd : null);
      const parts = [`同步完成：底稿 ${r.total} 条 → 新增 ${r.added}，更新 ${r.updated}，跳过 ${r.skipped}`];
      if (r.builtAt) parts.push(`底稿生成于 ${new Date(r.builtAt).toLocaleString('zh-CN')}`);
      if (r.added + r.updated === 0) parts.push('本机已是最新');
      setMirrorResult({ ok: true, text: parts.join('\n') });
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof MirrorSyncError ? err.message : '同步失败，请重试';
      setMirrorResult({ ok: false, text: message });
    } finally {
      setMirrorBusy(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      if (importStrategy === 'replace') {
        setPendingImportText(text);
        setShowReplaceConfirm(true);
      } else {
        await executeImport(text, 'merge');
      }
    };
    input.click();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    return `~${Math.round(bytes / 1024)}KB`;
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>💾</span> 数据管理
          </h1>
        </div>

        {/* Template Stats */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>📈</span> 模板统计
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <StatsPanel />
          </div>
        </section>

        {/* Data Overview */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>📊</span> 数据概览
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            {stats ? (
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    总记录数: <span className="font-medium">{stats.total}</span>
                    {'  '}草稿: <span className="font-medium">{stats.drafts}</span>
                    {'  '}已完成: <span className="font-medium">{stats.completed}</span>
                  </p>
                  <p>
                    最近备份:{' '}
                    <span className="font-medium">
                  {lastBackup ? formatDate(lastBackup) : '从未'}
                </span>
                  </p>
                  <p>
                    数据大小:{' '}
                    <span className="font-medium">
                  {formatSize(stats.estimatedSize)}
                </span>
                  </p>
                </div>
            ) : (
                <p className="text-sm text-gray-400">加载中...</p>
            )}
          </div>
        </section>

        {/* Export */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>📤</span> 导出数据
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-4">
              将所有复盘记录导出为 JSON 文件，需要时可随时备份。
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                  onClick={() => handleExport(false)}
                  disabled={exporting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                导出全部数据
              </button>
              <button
                  onClick={() => handleExport(true)}
                  disabled={exporting}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                仅导出已完成
              </button>
            </div>
          </div>
        </section>

        {/* 文档导出：批量 Markdown + 年度复盘报告 */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>📄</span> 文档导出
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <p className="text-sm text-gray-600">
              将记录导出为可读的 Markdown 文档（适合归档到知识库），或一键生成年度复盘报告。
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1.5">选择模板</p>
                <select
                    value={docTemplate}
                    onChange={(e) => setDocTemplate(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">全部模板</option>
                  {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1.5">选择年份（年度报告）</p>
                <select
                    value={docYear}
                    onChange={(e) => setDocYear(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                  onClick={handleDocExport}
                  disabled={docExporting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                批量导出 Markdown
              </button>
              <button
                  onClick={handleAnnualReport}
                  disabled={docExporting}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                生成年度复盘报告
              </button>
            </div>
            {docMessage && <p className="text-sm text-green-600">{docMessage}</p>}
          </div>
        </section>

        {/* Import */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>📥</span> 导入数据
          </h2>          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-4">
              从备份文件恢复数据。
            </p>
            <div className="mb-4">
              <p className="text-sm text-gray-700 font-medium mb-2">导入策略:</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                      type="radio"
                      name="importStrategy"
                      value="merge"
                      checked={importStrategy === 'merge'}
                      onChange={() => setImportStrategy('merge')}
                      className="text-indigo-600"
                  />
                  合并（保留现有，补充新增）
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                      type="radio"
                      name="importStrategy"
                      value="replace"
                      checked={importStrategy === 'replace'}
                      onChange={() => setImportStrategy('replace')}
                      className="text-indigo-600"
                  />
                  覆盖（清除现有，完全替换）
                </label>
              </div>
            </div>
            <button
                onClick={handleImport}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              选择备份文件
            </button>
            {importResult && (
              <p
                  className={`mt-3 text-sm whitespace-pre-line ${
                      importResult.startsWith('导入完成') && !importResult.includes('⚠️')
                          ? 'text-green-600'
                          : importResult.startsWith('导入完成')
                              ? 'text-amber-600'
                              : 'text-red-600'
                  }`}
              >
                {importResult}
              </p>
            )}
          </div>
        </section>

        {/* 云端底稿（加密镜像，只读同步） */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>☁️</span> 云端底稿
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-4">
              把云端整理好的复盘记录合并到本机，多台设备输同一个口令即可看到同一份底稿。
              镜像以密文形式公开托管，未持有口令无法解开。
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="password"
                value={mirrorPassword}
                onChange={(e) => setMirrorPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !mirrorBusy) handleMirrorSync();
                }}
                placeholder="同步口令"
                autoComplete="off"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleMirrorSync}
                disabled={mirrorBusy}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {mirrorBusy ? '同步中...' : '同步云端底稿'}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={mirrorRemember}
                onChange={(e) => {
                  setMirrorRemember(e.target.checked);
                  if (!e.target.checked) rememberPassword(null);
                }}
                className="rounded text-indigo-600"
              />
              在本机记住口令（存于浏览器 localStorage，公共设备不建议勾选）
            </label>
            {mirrorResult && (
              <p
                className={`mt-3 text-sm whitespace-pre-line ${
                  mirrorResult.ok ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {mirrorResult.text}
              </p>
            )}
            <p className="mt-3 text-[11px] text-gray-400">
              合并只会补充新记录、更新修改时间更晚的记录，不会删除本机已有数据，可反复执行。
              反方向（本机 → 云端）不在自动同步范围内：本机新填的内容请先用上方「导出数据」交回整理，再重新生成底稿。
            </p>
          </div>
        </section>

        {/* 复盘等待期设置 */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>⏱</span> 复盘等待期设置
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
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
              {cooldownError && <span className="text-sm text-red-600">{cooldownError}</span>}
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <span>💡</span> 关于数据安全
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
            <div>
              <p className="font-semibold text-sm text-blue-900 mb-1">你的数据安全吗？</p>
              <p className="text-sm text-gray-600">
                日常使用完全安全。正常关闭浏览器、关机重启、浏览器更新都不会影响数据。
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm text-blue-900 mb-1">什么时候需要备份？</p>
              <p className="text-sm text-gray-600 mb-1.5">
                不需要定期备份。只在以下情况发生前导出即可：
              </p>
              <ol className="text-sm text-gray-600 pl-5 space-y-0.5 list-decimal">
                <li>准备清除浏览器缓存/数据（最常见的数据丢失原因）</li>
                <li>准备换新电脑或新浏览器</li>
                <li>准备重装操作系统</li>
                <li>设备可能丢失或损坏时（如出差带笔记本）</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold text-sm text-blue-900 mb-1">跨浏览器/跨设备使用</p>
              <p className="text-sm text-gray-600">
                不同浏览器（如 Chrome 和 Firefox）之间数据不互通，不同设备之间也不会自动同步。如需在新浏览器或新设备上使用，请先在原环境导出数据，再在新环境导入即可。
              </p>
            </div>
            <div>
              <p className="font-semibold text-sm text-blue-900 mb-1">如何备份和恢复？</p>
              <ul className="text-sm text-gray-600 space-y-0.5">
                <li>• 备份：点击上方「导出全部数据」→ 保存 JSON 文件到网盘或 U 盘</li>
                <li>• 恢复：新环境中打开本应用 →「导入数据」→ 选择备份文件 → 完成</li>
              </ul>
            </div>
          </div>
        </section>

        <ConfirmDialog
            isOpen={showReplaceConfirm}
            title="确认覆盖导入"
            message={
              <>
                覆盖模式将<strong>清空当前全部 {stats?.total ?? 0} 条记录</strong>，然后替换为备份文件内容。此操作不可撤销。
                <br /><br />
                确定要覆盖导入吗？
              </>
            }
            confirmText="确认覆盖"
            cancelText="取消"
            onConfirm={async () => {
              setShowReplaceConfirm(false);
              if (pendingImportText) {
                await executeImport(pendingImportText, 'replace');
                setPendingImportText(null);
              }
            }}
            onCancel={() => {
              setShowReplaceConfirm(false);
              setPendingImportText(null);
            }}
        />
      </div>
  );
}
