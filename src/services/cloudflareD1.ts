/**
 * Cloudflare D1 远程备份服务（项目适配版）
 *
 * 复用 @shared/core/services/cloudflareD1 的同步协议（apiEndpoint + /api/sync/* 路由），
 * 但数据层调用本项目自己的 db（多账户隔离 + 默认库回退），避免与公共包 db 的元库结构冲突。
 * 采用 Local-First 策略：本地为主，D1 为备份。
 */
import {
  exportAllRecords,
  importRecords,
  getAllRecords,
  getSetting,
  setSetting,
} from './db';
import type { FormRecord } from '@/types';

export interface SyncConfig {
  apiEndpoint: string;
  accountId: string;
  authToken?: string;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  pendingChanges: number;
  isOnline: boolean;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  timestamp: string;
  error?: string;
}

let syncConfig: SyncConfig | null = null;

/** 配置 D1 同步服务 */
export function configureSyncService(config: SyncConfig | null): void {
  syncConfig = config;
}

/** 获取同步配置 */
export function getSyncConfig(): SyncConfig | null {
  return syncConfig;
}

/** 检查网络连通性 */
async function checkConnectivity(): Promise<boolean> {
  if (!syncConfig) return false;
  try {
    const response = await fetch(`${syncConfig.apiEndpoint}/api/sync/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** 获取自 since 之后修改的记录 */
async function getRecordsModifiedSince(since: string | null): Promise<FormRecord[]> {
  const all = await getAllRecords();
  if (!since) return all;
  return all.filter((r) => r.updatedAt > since);
}

/** 获取同步状态 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const lastSyncAt = (await getSetting('lastSyncAt')) as string | null;
  const changedRecords = await getRecordsModifiedSince(lastSyncAt);
  const isOnline = await checkConnectivity();
  return { lastSyncAt, pendingChanges: changedRecords.length, isOnline };
}

/** 推送本地变更到 D1 */
export async function pushChanges(): Promise<SyncResult> {
  if (!syncConfig) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: '未配置同步服务' };
  }
  try {
    const lastSyncAt = (await getSetting('lastSyncAt')) as string | null;
    const changedRecords = await getRecordsModifiedSince(lastSyncAt);
    if (changedRecords.length === 0) {
      return { success: true, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString() };
    }
    const response = await fetch(`${syncConfig.apiEndpoint}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(syncConfig.authToken ? { Authorization: `Bearer ${syncConfig.authToken}` } : {}),
      },
      body: JSON.stringify({
        accountId: syncConfig.accountId,
        records: changedRecords,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!response.ok) throw new Error(`推送失败: ${response.statusText}`);
    const result = await response.json();
    const now = new Date().toISOString();
    await setSetting('lastSyncAt', now);
    return { success: true, pushed: changedRecords.length, pulled: 0, conflicts: result.conflicts ?? 0, timestamp: now };
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : '未知错误' };
  }
}

/** 从 D1 拉取变更到本地（Last-Write-Wins 合并） */
export async function pullChanges(): Promise<SyncResult> {
  if (!syncConfig) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: '未配置同步服务' };
  }
  try {
    const lastSyncAt = (await getSetting('lastSyncAt')) as string | null;
    const response = await fetch(
      `${syncConfig.apiEndpoint}/api/sync/pull?accountId=${syncConfig.accountId}&since=${lastSyncAt ?? ''}`,
      { headers: { ...(syncConfig.authToken ? { Authorization: `Bearer ${syncConfig.authToken}` } : {}) } }
    );
    if (!response.ok) throw new Error(`拉取失败: ${response.statusText}`);
    const remoteData: { records: FormRecord[] } = await response.json();
    const localRecords = await getAllRecords();
    const localMap = new Map(localRecords.map((r) => [r.id, r]));
    let conflicts = 0;
    const toMerge: FormRecord[] = [];
    for (const remote of remoteData.records) {
      const local = localMap.get(remote.id);
      if (!local) {
        toMerge.push(remote);
      } else if (remote.updatedAt > local.updatedAt) {
        toMerge.push(remote);
        conflicts++;
      }
    }
    if (toMerge.length > 0) {
      const all = await getAllRecords();
      const merged = [...all.filter((r) => !toMerge.find((m) => m.id === r.id)), ...toMerge];
      const backup = await exportAllRecords();
      const parsed = JSON.parse(backup) as { records: FormRecord[]; settings: Record<string, unknown> };
      await importRecords(JSON.stringify({ ...parsed, records: merged }), 'merge');
    }
    const now = new Date().toISOString();
    await setSetting('lastSyncAt', now);
    return { success: true, pushed: 0, pulled: toMerge.length, conflicts, timestamp: now };
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : '未知错误' };
  }
}

/** 全量备份到 D1 */
export async function fullBackupToD1(): Promise<SyncResult> {
  if (!syncConfig) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: '未配置同步服务' };
  }
  try {
    const json = await exportAllRecords();
    const data = JSON.parse(json);
    const response = await fetch(`${syncConfig.apiEndpoint}/api/sync/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(syncConfig.authToken ? { Authorization: `Bearer ${syncConfig.authToken}` } : {}),
      },
      body: JSON.stringify({ accountId: syncConfig.accountId, data, timestamp: new Date().toISOString() }),
    });
    if (!response.ok) throw new Error(`备份失败: ${response.statusText}`);
    const now = new Date().toISOString();
    await setSetting('lastSyncAt', now);
    await setSetting('lastFullBackupAt', now);
    return { success: true, pushed: data.records?.length ?? 0, pulled: 0, conflicts: 0, timestamp: now };
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : '未知错误' };
  }
}

/** 从 D1 恢复备份 */
export async function restoreFromD1(timestamp?: string): Promise<SyncResult> {
  if (!syncConfig) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: '未配置同步服务' };
  }
  try {
    const url = timestamp
      ? `${syncConfig.apiEndpoint}/api/sync/restore?accountId=${syncConfig.accountId}&timestamp=${timestamp}`
      : `${syncConfig.apiEndpoint}/api/sync/restore?accountId=${syncConfig.accountId}`;
    const response = await fetch(url, {
      headers: { ...(syncConfig.authToken ? { Authorization: `Bearer ${syncConfig.authToken}` } : {}) },
    });
    if (!response.ok) throw new Error(`恢复失败: ${response.statusText}`);
    const backupData: { records: FormRecord[]; settings?: Record<string, unknown> } = await response.json();
    await importRecords(JSON.stringify(backupData), 'merge');
    return { success: true, pushed: 0, pulled: backupData.records.length, conflicts: 0, timestamp: new Date().toISOString() };
  } catch (error) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : '未知错误' };
  }
}
