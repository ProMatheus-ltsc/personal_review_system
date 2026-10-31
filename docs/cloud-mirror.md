# 云端底稿同步（加密静态镜像）

让 AI 侧整理好的复盘记录进入各设备的 IndexedDB，同时不引入后端、不泄露内容。

## 为什么不是直接放 JSON

本仓库与站点都是**公开**的：任何人都能 `git clone`，也能直接访问
`https://promatheus-ltsc.github.io/personal_review_system/`。
如果把明文 `records.json` 放进 `public/`，等于把情绪、决策、健康、投资记录全部公开。

所以镜像只以**密文**入库：`public/data/records.enc.json`。
文件公开无害，没有口令无法解密；解密在浏览器内完成，口令不上传任何服务器。

## 数据流

```
导出 JSON（本机）
      │
      ▼
scripts/build-mirror.mjs        ← PBKDF2-SHA256(600000) + AES-GCM-256
      │
      ▼
public/data/records.enc.json    ← 密文，可安全公开
      │
      ▼
浏览器：输口令 → Web Crypto 解密 → LWW 合并进 IndexedDB
```

## 生成底稿

```bash
cd personal_review_system

# 单份导出（口令不足 12 位时追加 --allow-public）
node scripts/build-mirror.mjs --in ~/Downloads/review-backup.json --password '你的口令' --allow-public

# 多份导出（去重，保留 updatedAt 较新的一条）
node scripts/build-mirror.mjs --in exports/*.json --password '你的口令'

# 只看统计，不落盘
node scripts/build-mirror.mjs --in a.json --password 'x' --dry-run
```

口令也可走环境变量，避免进入 shell 历史：

```bash
MIRROR_PASSWORD='你的口令' node scripts/build-mirror.mjs --in backup.json
```

### 口令与强度

迭代次数：**PBKDF2-SHA256 600000 次**（OWASP 2023 对 PBKDF2-SHA256 的推荐值），
密文头部会记录 `iter`，前端解密按密文自带的 `iter` 派生密钥，因此改迭代次数不需要同步改前端。
60 万次在浏览器里约 0.3~0.8 秒，可接受。

口令强度要求：至少 12 位，不能是纯数字。不足时脚本会拦截，须加 `--allow-public` 才能放行。

当前底稿使用一个 11 位的自定口令（`--allow-public` 放行）。这在熵上偏弱，
之所以还能接受，是因为迭代次数已拉到 60 万，把单次猜测成本提高到约两倍。
若将来记录里出现更敏感的内容，建议换成长口令重新生成一次底稿——换口令不需要改任何代码。

## 在设备上同步

1. 打开站点 → 进入「数据」页
2. 找到「☁️ 云端底稿」区块
3. 输入口令 → 点「同步云端底稿」
4. 勾选「在本机记住口令」可免去每次输入（存 localStorage）

多台设备输入**同一个口令**即可看到同一份底稿。

## 合并策略

| 情况 | 行为 |
|---|---|
| 本机没有、镜像有 | 新增 |
| 两边都有，镜像 `updatedAt` 更晚 | 覆盖（Last-Write-Wins） |
| 两边都有，本机更晚 | 跳过，保留本机 |
| 本机有、镜像没有 | **保留，绝不删除** |

因此可以放心反复执行：镜像只做「补」和「更新」，不会删掉本机任何记录。

## 已知边界

- **反方向不自动**。本机新填的记录不会自动回到云端，需要用「导出数据」把 JSON 交回，再重新生成底稿。
  这是静态镜像方案的固有代价：没有后端就不可能做到真正的双向同步。
- **账户要一致**。IndexedDB 库名是 `review-app-<accountId>`，不同账户登录看到的是不同数据库。
  多设备请用同一个账户登录，否则各自同步到各自库里，看起来像"没生效"。
- **口令丢失无法恢复**。密文没有找回通道，口令丢了只能重新导出一份明文再加密。
- **CDN 缓存**。前端拉取带了 `cache: 'no-store'`，但 GitHub Pages 边缘节点仍可能缓存几分钟。
  更新底稿后若没看到变化，等几分钟或强制刷新。

## 与其他方案的关系

| 方案 | 多设备 | AI 能写 | 代价 |
|---|---|---|---|
| **加密镜像（本方案）** | 读方向自动 | 生成底稿即可 | 反方向手动 |
| Worker + D1 双向同步 | 双向自动 | 调 API 写入 | 需部署后端与凭据 |
| 导出/导入 | 各设备各自导入 | 提供 JSON | 全手动 |

`shared-core` 里其实已有 D1 同步的完整积木（`worker/` 模板 + `services/cloudflareD1.ts` 客户端），
当初 `380af1b` 主动没接。将来若要双向同步，接回去即可，不必重写。
