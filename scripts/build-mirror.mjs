#!/usr/bin/env node
/**
 * 构建加密的云端底稿镜像
 *
 * 作用：把一份或多份「个人复盘系统」导出的明文 JSON 合并、去重、加密，
 * 输出到 `public/data/records.enc.json`，随站点一起部署。
 *
 * 为什么加密：本仓库与站点均为公开，明文记录会被任何人直接下载，
 * 因此镜像只以密文形式入库，前端用口令在浏览器内解密。
 *
 * 用法：
 *   node scripts/build-mirror.mjs --in a.json b.json --password 'xxx'
 *   MIRROR_PASSWORD='xxx' node scripts/build-mirror.mjs --in exports/*.json
 *   node scripts/build-mirror.mjs --in a.json --dry-run        # 只统计不写文件
 *
 * 参数：
 *   --in <files...>   输入 JSON（exportAllRecords 生成的格式，appName 必须为 review-app）
 *   --out <path>      输出路径，默认 public/data/records.enc.json
 *   --password <pwd>  加密口令；也可用环境变量 MIRROR_PASSWORD
 *   --dry-run         不写文件，只打印统计
 *   --allow-public    跳过"口令强度不足"的拦截（不建议）
 *
 * 算法与前端 src/services/mirrorSync.ts 严格一致：
 *   PBKDF2-SHA256(310000 次) → AES-GCM-256，salt 16 字节、iv 12 字节，均为随机值
 */

import { webcrypto as crypto } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const VALID_TEMPLATE_IDS = new Set([
  'daily_review', 'weekly_review', 'monthly_review', 'annual_review',
  'emotional_awareness', 'case_study', 'decision_log',
  'investment_checklist_buy', 'investment_checklist_sell', 'investment_checklist_position',
]);

const ITERATIONS = 310_000;

function parseArgs(argv) {
  const opts = { inputs: [], out: 'public/data/records.enc.json', password: '', dryRun: false, allowPublic: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--in') {
      i += 1;
      while (i < argv.length && !argv[i].startsWith('--')) opts.inputs.push(argv[i++]);
      i -= 1;
    } else if (a === '--out') {
      opts.out = argv[++i];
    } else if (a === '--password') {
      opts.password = argv[++i] ?? '';
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--allow-public') {
      opts.allowPublic = true;
    } else if (a === '--help' || a === '-h') {
      console.log('用法: node scripts/build-mirror.mjs --in <json...> [--out path] [--password pwd] [--dry-run]');
      process.exit(0);
    }
  }
  opts.password = opts.password || process.env.MIRROR_PASSWORD || '';
  return opts;
}

function stamp(record) {
  const raw = record?.updatedAt || record?.createdAt;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** 读取一份导出文件，返回记录数组 */
async function readExport(file) {
  const text = await readFile(file, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${file}: 不是有效 JSON`);
  }
  if (data?.appName !== 'review-app' || !Array.isArray(data.records)) {
    throw new Error(`${file}: 缺少 appName=review-app 或 records 数组`);
  }
  return data.records;
}

/** 多份导出按 id 去重，保留 updatedAt 较新的一条 */
function mergeAll(lists) {
  const byId = new Map();
  let dropped = 0;
  for (const list of lists) {
    for (const record of list) {
      if (!record?.id || !VALID_TEMPLATE_IDS.has(record.templateId)) {
        dropped += 1;
        continue;
      }
      const current = byId.get(record.id);
      if (!current || stamp(record) > stamp(current)) byId.set(record.id, record);
    }
  }
  const records = [...byId.values()].sort((a, b) => stamp(a) - stamp(b));
  return { records, dropped };
}

function toB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function encrypt(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );

  return {
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct),
    builtAt: payload.exportDate,
    recordCount: payload.records.length,
  };
}

/** 口令强度：至少 12 位，且不能是纯数字/纯字母 */
function checkPassword(pwd) {
  if (pwd.length < 12) return '口令至少 12 位';
  if (/^\d+$/.test(pwd)) return '口令不能是纯数字';
  if (!/[0-9]/.test(pwd) && !/[^a-zA-Z]/.test(pwd) && pwd.length < 16) {
    return '纯字母口令请至少 16 位，或掺入数字/符号';
  }
  return '';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.inputs.length === 0) {
    console.error('错误：至少需要一个 --in 文件');
    process.exit(1);
  }
  if (!opts.password) {
    console.error('错误：缺少口令（--password 或环境变量 MIRROR_PASSWORD）');
    process.exit(1);
  }
  const weak = checkPassword(opts.password);
  if (weak && !opts.allowPublic) {
    console.error(`错误：${weak}。如确认要用该口令，追加 --allow-public`);
    process.exit(1);
  }

  const lists = [];
  for (const file of opts.inputs) {
    const records = await readExport(file);
    console.log(`  读入 ${file}  ${records.length} 条`);
    lists.push(records);
  }

  const { records, dropped } = mergeAll(lists);
  if (records.length === 0) {
    console.error('错误：合并后没有有效记录');
    process.exit(1);
  }
  if (dropped > 0) console.log(`  跳过无效记录 ${dropped} 条（缺 id 或模板不在白名单）`);

  const byTemplate = records.reduce((acc, r) => {
    acc[r.templateId] = (acc[r.templateId] || 0) + 1;
    return acc;
  }, {});
  const first = records[0];
  const last = records[records.length - 1];

  console.log(`  合并后 ${records.length} 条，时间跨度 ${first.createdAt?.slice(0, 10) ?? '?'} ~ ${last.createdAt?.slice(0, 10) ?? '?'}`);
  for (const [k, v] of Object.entries(byTemplate).sort()) console.log(`    ${k.padEnd(28)} ${v}`);

  const payload = {
    version: 1,
    exportDate: new Date().toISOString(),
    appName: 'review-app',
    records,
  };

  const encrypted = await encrypt(payload, opts.password);
  const size = Buffer.byteLength(JSON.stringify(encrypted));

  if (opts.dryRun) {
    console.log(`\n[dry-run] 将写入 ${opts.out}（约 ${(size / 1024).toFixed(1)} KB），未落盘`);
    return;
  }

  const outPath = path.resolve(opts.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(encrypted, null, 2)}\n`, 'utf8');
  console.log(`\n已写入 ${opts.out}（${(size / 1024).toFixed(1)} KB，${records.length} 条，AES-GCM-256）`);
  console.log('提醒：该文件可安全公开，无口令无法解密；口令遗失则镜像不可恢复。');
}

main().catch((err) => {
  console.error('失败：', err.message);
  process.exit(1);
});
