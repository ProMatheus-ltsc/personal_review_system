/**
 * 数据库服务层
 *
 * 基于 IndexedDB（通过 idb 库封装）的本地持久化存储服务。
 * 提供记录的 CRUD、搜索、导入导出及统计功能。
 *
 * 数据库结构：
 * - records store: 存储所有复盘记录（FormRecord），按 id 为主键
 * - settings store: 存储应用配置项（key-value 形式）
 */
import { openDB, IDBPDatabase } from 'idb';
import { FormRecord } from '@/types';

const DB_NAME = 'review-app';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * 初始化并获取数据库实例（单例模式）
 *
 * 首次调用时创建数据库并建立 object store 和索引；
 * 后续调用直接返回已有连接 Promise。
 *
 * @returns IndexedDB 数据库实例的 Promise
 * @throws 当浏览器不支持 IndexedDB 或存储空间不足时可能抛出异常
 */
export function initDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('records')) {
          const recordStore = db.createObjectStore('records', { keyPath: 'id' });
          recordStore.createIndex('templateId', 'templateId', { unique: false });
          recordStore.createIndex('createdAt', 'createdAt', { unique: false });
          recordStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          recordStore.createIndex('title', 'title', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * 保存（新建或更新）一条复盘记录
 *
 * 使用 put 语义：如果 id 已存在则覆盖，否则新建。
 *
 * @param record - 完整的 FormRecord 对象
 * @returns Promise<void>
 * @throws 当 IndexedDB 写入失败时抛出异常
 */
export async function saveRecord(record: FormRecord): Promise<void> {
  const db = await initDB();
  await db.put('records', record);
}

/**
 * 根据 ID 获取单条复盘记录
 *
 * @param id - 记录的唯一标识符
 * @returns 找到则返回 FormRecord，未找到返回 undefined
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function getRecord(id: string): Promise<FormRecord | undefined> {
  const db = await initDB();
  return db.get('records', id);
}

/**
 * 获取所有记录，可按模板 ID 筛选
 *
 * 返回结果按 updatedAt 降序排列（最近更新的在前）。
 *
 * @param templateId - 可选，按模板 ID 筛选记录
 * @returns 按更新时间降序排列的记录数组
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function getAllRecords(templateId?: string): Promise<FormRecord[]> {
  const db = await initDB();
  let records: FormRecord[];
  if (templateId) {
    records = await db.getAllFromIndex('records', 'templateId', templateId);
  } else {
    records = await db.getAll('records');
  }
  return records.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * 根据 ID 删除一条复盘记录
 *
 * @param id - 要删除的记录 ID
 * @returns Promise<void>
 * @throws 当 IndexedDB 删除操作失败时抛出异常
 */
export async function deleteRecord(id: string): Promise<void> {
  const db = await initDB();
  await db.delete('records', id);
}

/**
 * 批量删除多条复盘记录（使用事务优化）
 *
 * @param ids - 要删除的记录 ID 数组
 * @returns Promise<void>
 * @throws 当 IndexedDB 删除操作失败时抛出异常
 */
export async function deleteRecords(ids: string[]): Promise<void> {
  const db = await initDB();
  const tx = db.transaction('records', 'readwrite');
  await Promise.all(ids.map(id => tx.store.delete(id)));
  await tx.done;
}

/**
 * 搜索复盘记录
 *
 * 搜索逻辑：将查询字符串与记录标题和数据内容进行大小写不敏感的匹配。
 * 数据内容通过 JSON.stringify 转为字符串后进行全文匹配。
 *
 * 注意：当前使用 JSON.stringify 全文匹配方式实现搜索，
 * 适用于个人使用的小数据量场景（通常 < 1000 条记录）。
 * 如果数据量增长到万级以上，应考虑引入全文索引方案。
 *
 * @param query - 搜索关键词
 * @param templateId - 可选，限定在特定模板下搜索
 * @returns 匹配的记录数组，按 updatedAt 降序排列
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function searchRecords(
  query: string,
  templateId?: string
): Promise<FormRecord[]> {
  const db = await initDB();
  let records: FormRecord[];
  if (templateId) {
    records = await db.getAllFromIndex('records', 'templateId', templateId);
  } else {
    records = await db.getAll('records');
  }
  const lowerQuery = query.toLowerCase();
  return records
    .filter((record) => {
      const titleMatch = record.title.toLowerCase().includes(lowerQuery);
      const dataMatch = JSON.stringify(record.data)
        .toLowerCase()
        .includes(lowerQuery);
      return titleMatch || dataMatch;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

/**
 * 获取应用设置项的值
 *
 * @param key - 设置项的键名（如 'password_hash'、'lastBackupDate'）
 * @returns 设置项的值，不存在时返回 undefined
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function getSetting(key: string): Promise<unknown> {
  const db = await initDB();
  const result = await db.get('settings', key);
  return result?.value;
}

/**
 * 设置（新建或更新）一个应用配置项
 *
 * @param key - 设置项的键名
 * @param value - 设置项的值（任意可序列化类型）
 * @returns Promise<void>
 * @throws 当 IndexedDB 写入失败时抛出异常
 */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await initDB();
  await db.put('settings', { key, value });
}

/**
 * 导出所有记录和设置为 JSON 字符串
 *
 * 导出格式包含版本号、导出时间、应用标识、记录和设置数据，
 * 用于备份和跨设备迁移。
 *
 * @returns 格式化的 JSON 字符串（包含 records 和 settings）
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function exportAllRecords(): Promise<string> {
  const db = await initDB();
  const records = await db.getAll('records');
  const settings = await db.getAll('settings');
  const exportData = {
    version: 1,
    exportDate: new Date().toISOString(),
    appName: 'review-app',
    records,
    settings,
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * 仅导出已完成状态的记录为 JSON 字符串
 *
 * 不包含草稿和设置项，适用于导出「干净」的复盘成果。
 *
 * @returns 格式化的 JSON 字符串（仅包含 status === 'completed' 的记录）
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function exportCompletedRecords(): Promise<string> {
  const db = await initDB();
  const records = await db.getAll('records');
  const completed = records.filter((r: FormRecord) => r.status === 'completed');
  const exportData = {
    version: 1,
    exportDate: new Date().toISOString(),
    appName: 'review-app',
    records: completed,
    recordCount: completed.length,
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * 从 JSON 字符串导入记录
 *
 * 支持两种导入策略：
 * - merge: 合并模式，跳过已存在的记录（按 id 判重）
 * - replace: 替换模式，清空现有记录后导入，同时恢复设置项
 *
 * @param jsonString - 由 exportAllRecords 或 exportCompletedRecords 生成的 JSON 字符串
 * @param strategy - 导入策略：'merge'（合并）或 'replace'（替换）
 * @returns 包含 imported（成功导入数）和 skipped（跳过数）的统计对象
 * @throws 当 JSON 格式无效或 appName 不匹配时抛出 Error('无效的备份文件格式')
 * @throws 当 IndexedDB 操作失败时抛出异常
 */
export async function importRecords(
  jsonString: string,
  strategy: 'merge' | 'replace'
): Promise<{ imported: number; skipped: number }> {
  const data = JSON.parse(jsonString);

  // Validate format
  if (!data.appName || data.appName !== 'review-app' || !data.records) {
    throw new Error('无效的备份文件格式');
  }

  const db = await initDB();

  if (strategy === 'replace') {
    await db.clear('records');
  }

  let imported = 0;
  let skipped = 0;

  const tx = db.transaction('records', 'readwrite');
  for (const record of data.records) {
    if (strategy === 'merge') {
      const existing = await tx.store.get(record.id);
      if (existing) {
        skipped++;
        continue;
      }
    }
    await tx.store.put(record);
    imported++;
  }
  await tx.done;

  // Also restore settings if present and strategy is replace
  if (strategy === 'replace' && data.settings) {
    const settingsTx = db.transaction('settings', 'readwrite');
    for (const setting of data.settings) {
      await settingsTx.store.put(setting);
    }
    await settingsTx.done;
  }

  return { imported, skipped };
}

/**
 * 获取指定模板最近一条已完成的记录
 *
 * 按 updatedAt 降序排列，返回第一条 status === 'completed' 的记录。
 * 用于周复盘自动加载上周规划等场景。
 *
 * @param templateId - 模板 ID
 * @returns 最近一条已完成记录，不存在则返回 undefined
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function getLatestCompletedRecord(templateId: string): Promise<FormRecord | undefined> {
  const db = await initDB();
  const records = await db.getAllFromIndex('records', 'templateId', templateId);
  const completed = records
    .filter((r: FormRecord) => r.status === 'completed')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return completed[0];
}

/**
 * 获取记录统计信息
 *
 * 统计总数、草稿数、已完成数和估算存储大小。
 * estimatedSize 通过 JSON 序列化后的 Blob 大小估算（字节数）。
 *
 * @returns 包含 total、drafts、completed、estimatedSize 的统计对象
 * @throws 当 IndexedDB 读取失败时抛出异常
 */
export async function getRecordStats(): Promise<{
  total: number;
  drafts: number;
  completed: number;
  estimatedSize: number;
}> {
  const db = await initDB();
  const records = await db.getAll('records');
  const drafts = records.filter((r: FormRecord) => r.status === 'draft').length;
  const completed = records.filter((r: FormRecord) => r.status === 'completed').length;
  const estimatedSize = new Blob([JSON.stringify(records)]).size;
  return { total: records.length, drafts, completed, estimatedSize };
}
