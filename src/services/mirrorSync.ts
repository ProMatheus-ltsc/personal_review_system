/**
 * 云端底稿镜像同步（只读方向）
 *
 * 用途：让 AI 侧整理好的复盘记录能进入各设备的 IndexedDB，无需后端服务。
 *
 * 工作方式：
 * - 构建脚本 `scripts/build-mirror.mjs` 把明文记录加密成 `public/data/records.enc.json` 并入仓库
 * - 前端首次同步时输入口令，用 Web Crypto 解密后按 LWW 合并进本地库
 * - 静态文件本身是密文，仓库与站点公开也不泄露内容
 *
 * 合并策略（关键）：
 * - 本地没有、镜像有 → 新增
 * - 两边都有 → 比较 updatedAt，镜像更新则覆盖（Last-Write-Wins）
 * - 本地有、镜像没有 → **保留本地，绝不删除**
 *
 * 也就是说镜像只做「补」和「更新」，永远不会删掉你手机上新填的记录。
 * 反方向（本地 → 云端）不在本模块职责内，仍需通过「导出 JSON」把数据交回整理。
 */

import type { FormRecord } from '@shared/core';
import { initDB, invalidateRecordsCache } from './db';

/** 加密镜像的文件结构，与 scripts/build-mirror.mjs 输出保持一致 */
export interface EncryptedMirror {
  /** 格式版本 */
  v: 1;
  /** 加密算法 */
  alg: 'AES-GCM';
  /** 密钥派生算法 */
  kdf: 'PBKDF2-SHA256';
  /** PBKDF2 迭代次数 */
  iter: number;
  /** base64 盐值 */
  salt: string;
  /** base64 初始化向量 */
  iv: string;
  /** base64 密文 */
  ct: string;
  /** 明文生成时间，仅作展示（不参与校验） */
  builtAt?: string;
  /** 明文记录条数，仅作展示 */
  recordCount?: number;
}

/** 解密后的镜像内容，与 exportAllRecords 的输出格式兼容 */
export interface MirrorPayload {
  version: number;
  exportDate: string;
  appName: 'review-app';
  records: FormRecord[];
  settings?: unknown[];
}

/** 同步结果 */
export interface MirrorSyncResult {
  /** 镜像总条数 */
  total: number;
  /** 新增条数 */
  added: number;
  /** 覆盖更新条数 */
  updated: number;
  /** 因本地更新而跳过的条数 */
  skipped: number;
  /** 镜像构建时间 */
  builtAt?: string;
}

/** 可预期的同步错误，UI 据此给出针对性提示 */
export class MirrorSyncError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not-found'
      | 'bad-format'
      | 'wrong-password'
      | 'network'
      | 'db'
  ) {
    super(message);
    this.name = 'MirrorSyncError';
  }
}

const PASSWORD_STORAGE_KEY = 'mirror-sync-password';

/** 镜像文件地址：跟随 Vite base，生产为 /personal_review_system/data/... */
export function mirrorUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/data/records.enc.json`;
}

// ============ base64 与字节互转 ============

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// ============ 解密 ============

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/** 用口令解密镜像；口令错误时主动抛 wrong-password（AES-GCM 自带完整性校验） */
export async function decryptMirror(
  payload: EncryptedMirror,
  password: string
): Promise<MirrorPayload> {
  if (payload?.v !== 1 || payload.alg !== 'AES-GCM') {
    throw new MirrorSyncError('镜像格式不受支持', 'bad-format');
  }
  let plain: ArrayBuffer;
  try {
    const key = await deriveKey(password, b64ToBytes(payload.salt), payload.iter);
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(payload.iv) as unknown as BufferSource },
      key,
      b64ToBytes(payload.ct) as unknown as BufferSource
    );
  } catch {
    throw new MirrorSyncError('口令不正确', 'wrong-password');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new MirrorSyncError('镜像内容不是有效 JSON', 'bad-format');
  }
  const data = parsed as Partial<MirrorPayload>;
  if (data?.appName !== 'review-app' || !Array.isArray(data.records)) {
    throw new MirrorSyncError('镜像内容缺少 records 或 appName 不符', 'bad-format');
  }
  return data as MirrorPayload;
}

// ============ 拉取 ============

/** 拉取加密镜像文件；不存在时抛 not-found（未配置时属正常情况） */
export async function fetchMirror(): Promise<EncryptedMirror> {
  let res: Response;
  try {
    res = await fetch(mirrorUrl(), { cache: 'no-store' });
  } catch {
    throw new MirrorSyncError('网络不可用，无法获取云端底稿', 'network');
  }
  if (res.status === 404) {
    throw new MirrorSyncError('尚未生成云端底稿', 'not-found');
  }
  if (!res.ok) {
    throw new MirrorSyncError(`获取失败（HTTP ${res.status}）`, 'network');
  }
  // SPA 托管（dev server / 配了 404.html 的静态站）会把缺失路径回落成 200 + HTML，
  // 必须靠 content-type 判定，否则会误报"格式错误"。
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new MirrorSyncError('尚未生成云端底稿', 'not-found');
  }
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new MirrorSyncError('读取镜像失败', 'network');
  }
  if (!text.trim().startsWith('{')) {
    throw new MirrorSyncError('尚未生成云端底稿', 'not-found');
  }
  try {
    return JSON.parse(text) as EncryptedMirror;
  } catch {
    throw new MirrorSyncError('镜像文件不是有效 JSON', 'bad-format');
  }
}

// ============ 合并 ============

/** 取记录的时间戳，用于 LWW 比较；无法解析时视为 0 */
function stamp(record: FormRecord): number {
  const raw = record.updatedAt || record.createdAt;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : 0;
}

// 仅允许已知模板，避免脏数据写入
const VALID_TEMPLATE_IDS = new Set<string>([
  'daily_review', 'weekly_review', 'monthly_review', 'annual_review',
  'emotional_awareness', 'case_study', 'decision_log',
  'investment_checklist_buy', 'investment_checklist_sell', 'investment_checklist_position',
]);

/**
 * 把外部来源的记录规范成合法的 FormRecord
 *
 * 为什么必须做：镜像由构建脚本或 AI 生成，字段名写错（例如把 data 写成 content）、
 * 漏 title、漏 status 都是真实发生过的情况。IndexedDB 不做 schema 校验，
 * 原样 put 进去会让列表页出现空白标题、详情页读不到字段的记录，
 * 且这种脏数据一旦写入就很难定位来源。因此在入口处统一兜底。
 *
 * @returns 规范化后的记录；数据不足以渲染时返回 null，交由调用方计入 skipped
 */
function normalizeRecord(raw: unknown): FormRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.templateId !== 'string' || !VALID_TEMPLATE_IDS.has(r.templateId)) return null;

  // data 是页面的唯一数据源，缺失或不是对象则该记录无法渲染，直接丢弃
  const data = r.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const createdAt = typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : new Date().toISOString();
  const updatedAt = typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : createdAt;
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : '未命名记录';

  const record: FormRecord = {
    id: r.id,
    templateId: r.templateId,
    title,
    data: data as Record<string, unknown>,
    status: r.status === 'draft' ? 'draft' : 'completed',
    createdAt,
    updatedAt,
  };
  if (Array.isArray(r.tags)) {
    record.tags = r.tags.filter((t): t is string => typeof t === 'string');
  }
  if (typeof r.module === 'string' && r.module) record.module = r.module;
  return record;
}


/**
 * 把镜像记录按 LWW 合并进本地库
 *
 * @returns 新增/更新/跳过 的条数统计
 */
export async function mergeMirrorRecords(
  records: readonly unknown[]
): Promise<Pick<MirrorSyncResult, 'added' | 'updated' | 'skipped'>> {
  const db = await initDB();
  const existing = (await db.getAll('records')) as FormRecord[];
  const byId = new Map(existing.map((r) => [r.id, r]));

  let added = 0;
  let updated = 0;
  let skipped = 0;

  const tx = db.transaction('records', 'readwrite');
  for (const raw of records) {
    const record = normalizeRecord(raw);
    if (!record) {
      skipped += 1;
      continue;
    }
    const current = byId.get(record.id);
    if (!current) {
      await tx.store.put(record);
      added += 1;
      continue;
    }
    if (stamp(record) > stamp(current)) {
      await tx.store.put(record);
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  await tx.done;
  if (added > 0 || updated > 0) invalidateRecordsCache();
  return { added, updated, skipped };
}

// ============ 组合入口 ============

/**
 * 完整同步：拉取 → 解密 → 合并
 *
 * @param password 口令；省略时读取本地记住的口令
 */
export async function syncMirror(password?: string): Promise<MirrorSyncResult> {
  const pwd = password || savedPassword();
  if (!pwd) throw new MirrorSyncError('请先输入同步口令', 'wrong-password');

  const encrypted = await fetchMirror();
  const payload = await decryptMirror(encrypted, pwd);
  const stats = await mergeMirrorRecords(payload.records);
  return {
    total: payload.records.length,
    ...stats,
    builtAt: encrypted.builtAt,
  };
}

// ============ 口令记忆 ============

export function savedPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberPassword(password: string | null): void {
  try {
    if (password) localStorage.setItem(PASSWORD_STORAGE_KEY, password);
    else localStorage.removeItem(PASSWORD_STORAGE_KEY);
  } catch {
    /* 隐私模式下 localStorage 不可写，忽略即可 */
  }
}
