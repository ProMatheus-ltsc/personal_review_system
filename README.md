# 📝 个人复盘系统

一个纯客户端的个人复盘工具 Web 应用，将复盘模板转换为交互式网页表单，帮助您进行系统化的个人复盘。

## ✨ 功能特性

- **八大复盘模板**：覆盖从日常记录到年度总结的完整复盘体系
  - 📅 日复盘 — 每日快速回顾
  - 📊 周复盘 — 每周事件复盘
  - 📈 月复盘 — 月度模式复盘
  - 🎯 年度复盘 — 年度总结与规划
  - 💭 情绪觉察 — 情绪识别与管理
  - 📋 实战案例 — 深度案例分析
  - 🔄 决策日志 — 决策过程记录
  - 💰 投资检查清单 — 投资全生命周期管理
- **投资检查清单 · 代码中心三角色模型**：
  - 以股票代码为中心，**仓位单**（一个代码一份）自动汇总所有买卖明细
  - **买入单 / 卖出单**各自独立成单；买入单完成后自动创建仓位单
  - 买入/卖出决策分别按**可配置冷静期**（默认 30 天）解锁复盘
  - 仓位单支持持有中复盘（表格形式）与清仓后投资周期复盘（冷静期可配置）
  - 结构化四层数据模型（Position + Trade + Trade Review + Position Review）
- **测试模式**：内置独立测试账户（`admin` / `admin`），一键跳过 30 天冷静期，自动填充覆盖各场景的测试数据，便于验收测试且不影响其他账户
- **多阶段生命周期**：投资检查清单支持"买入 → 持有 → 卖出 → 冷静期复盘"四阶段，含 30 天冷静期机制
- **交互式表单**：分步 Tab 导航，丰富字段覆盖完整复盘维度
- **表单质量检查**：实时质量检查面板，帮助提升复盘质量
- **历史参考侧栏**：填写时可参考历史记录，支持自动补全建议
- **习惯统计仪表盘**：连续周数追踪、本周/本月复盘统计、复盘提醒、当前持仓概览
- **数据管理页面**：存储统计、JSON 导入/导出、全量/已完成记录备份恢复
- **投资清单 JSON 导出**：支持全量导出、按时间段（买入日期）、按股票代码过滤导出
- **自动保存**：每 30 秒自动存档，切换 Tab 时也会保存
- **数据持久化**：基于 IndexedDB 的本地存储，每个账户独立业务库，关闭浏览器数据不丢失
- **导出功能**：支持 Markdown 和 PDF 两种格式导出
- **搜索与分类**：按模板类型、时间、状态筛选，关键词搜索
- **隐私保护**：本地多账户密码加密（PBKDF2 + SHA-256），各账户数据完全隔离
- **多账户数据隔离**：每个账户（用户名+密码）拥有独立的 IndexedDB 业务库（`review-app-{账户id}`），互不可见
- **移动端适配**：响应式设计，手机/平板/桌面端均可使用
- **零服务器依赖**：纯静态部署，无需后端服务

## 🛠️ 技术栈

- React 18 + TypeScript 5
- Vite 5（构建工具）
- Tailwind CSS（样式）
- React Hook Form + Zod（表单管理与校验）
- IndexedDB via idb（数据存储）
- jsPDF + html2canvas（PDF 导出）
- React Router（路由）
- date-fns（日期处理）
- uuid（唯一 ID 生成）
- clsx（条件样式拼接）

## 🚀 快速开始

### 环境要求

- **Node.js 18+**（推荐 20+，开发测试使用 22.x 验证通过）
- npm（随 Node.js 一并安装）
- 现代浏览器（Chrome / Edge / Firefox / Safari）

> Windows 下建议使用 [NVM for Windows](https://github.com/coreybutler/nvm-windows) 管理 Node 版本，避免版本冲突。

### Windows 启动方式

#### PowerShell（推荐）

```powershell
# 1. 进入项目目录
cd C:\Users\你的用户名\IdeaProjects\personal_review_system

# 2. 安装依赖（首次或 node_modules 缺失时）
npm install

# 3. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 4. 构建生产版本（输出到 dist/）
npm run build

# 5. 预览生产构建
npm run preview
```

#### CMD（命令提示符）

```cmd
cd /d C:\Users\你的用户名\IdeaProjects\personal_review_system
npm install
npm run dev
```

#### Git Bash（若已安装）

```bash
cd /c/Users/你的用户名/IdeaProjects/personal_review_system
npm install
npm run dev
```

#### macOS（Terminal）

```bash
# 1. 进入项目目录（替换为实际路径）
cd ~/IdeaProjects/personal_review_system

# 2. 安装依赖（首次或 node_modules 缺失时）
npm install

# 3. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 4. 构建生产版本（输出到 dist/）
npm run build

# 5. 预览生产构建
npm run preview
```

> macOS 建议使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node 版本：`nvm install 22 && nvm use 22`。

#### Linux（Terminal）

```bash
# 1. 进入项目目录（替换为实际路径）
cd ~/projects/personal_review_system

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 构建生产版本
npm run build

# 5. 预览生产构建
npm run preview
```

> Linux 下若提示 Node 版本过低，可使用 [nvm](https://github.com/nvm-sh/nvm) 或系统包管理器安装 Node 20+。
> 部分发行版（如 Ubuntu）默认的 `node` 版本较旧，安装后可用 `node -v` 检查版本。

#### 指定端口启动（端口被占用时）

```powershell
npm run dev -- --port 5199
```

> 开发服务器启动后，终端会显示 `Local: http://localhost:5173/`（或指定端口），在浏览器中打开该地址即可访问。
> macOS/Linux 与 Windows 的命令一致（`npm run dev`），仅终端与路径书写方式不同。

### 测试模式（admin 账户）

项目内置测试环境初始化，**首次启动时自动完成**（应用打开前的初始化过程）：

| 项目 | 说明 |
|------|------|
| 账户名 | `admin`（独立账户，与普通账户数据完全隔离） |
| 登录密码 | `admin`（账密固定为 admin/admin，应用启动时自动校正） |
| 跳过冷静期 | 测试模式下所有 30 天复盘立即解锁 |
| 测试数据 | 自动填充 6 个投资场景 + 7 类模板记录，仅写入 admin 账户 |

投资检查清单测试数据（6 个场景）：

| 代码 | 场景 | 覆盖点 |
|------|------|--------|
| `AAPL` | 持有中 | 买入 60 天前 → 可买入复盘 |
| `00700` | 部分卖出 | 2 笔买入 + 1 笔卖出，剩余 150 股 |
| `NVDA` | 多次部分卖出 | 2 笔买入 + 2 笔部分卖出（一笔已复盘/一笔待复盘），剩余 100 股 |
| `TSLA` | 已清仓 60 天 | 可卖出复盘 + 投资周期复盘 |
| `BABA` | 刚清仓 5 天 | 验证时间锁（test_mode 下立即解锁） |
| `MSFT` | 完整复盘 | 买入复盘 + 卖出复盘 + 周期复盘全部已填 |

其他模板测试数据：日复盘 ×2、周复盘 ×1、月复盘 ×1、年度复盘 ×1、情绪觉察 ×2、实战案例 ×1、决策日志 ×2（一条已复盘/一条待复盘）——便于测试各模板展示、统计与复盘提醒。

> 多账户说明：系统支持创建任意数量的本地账户（用户名 + 密码），每个账户数据存储在独立的 IndexedDB 业务库中，完全隔离。admin 测试账户的初始化只影响其自身账户，不会影响你创建的其他账户。
> **注意：测试账户初始化是幂等的**（以 `test_account_initialized` 标记，只执行一次）。因此 admin 账户已经初始化过之后，**新增的测试数据不会自动追加**。若想重新填充测试数据（或看到最新版本的数据），需先清除 admin 账户的业务库再刷新页面，具体步骤：
>
> 1. 浏览器控制台：按 `F12`（或右键 → 检查）打开开发者工具
> 2. 切换到 **Application（应用）** 面板 → 左侧 **IndexedDB**
> 3. 删除 `review-app-admin` 数据库（想连同所有账户一并重置可删除全部 `review-app*` 数据库）
> 4. 刷新页面，等待应用自动重新填充测试数据（几秒钟）
>
> 也可在控制台执行以下命令快速完成（等价于上述步骤）：
> ```javascript
> indexedDB.deleteDatabase('review-app-admin');
> location.reload();
> ```

### 部署到 GitHub Pages

1. **创建 GitHub 仓库**并推送代码：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/你的用户名/你的仓库名.git
   git push -u origin main
   ```

2. **安装 gh-pages 工具**：
   ```bash
   npm install -D gh-pages
   ```

3. **在 `package.json` 中添加部署脚本**：
   ```json
   {
     "scripts": {
       "deploy": "npm run build && gh-pages -d dist"
     },
     "homepage": "https://你的用户名.github.io/你的仓库名"
   }
   ```

4. **执行部署**：
   ```bash
   npm run deploy
   ```

5. **GitHub 仓库设置**：
   - 进入仓库 → Settings → Pages
   - Source 选择 `gh-pages` 分支
   - 等待几分钟后访问 `https://你的用户名.github.io/你的仓库名`

### 部署到 Vercel（推荐）

1. 将代码推送到 GitHub
2. 登录 [Vercel](https://vercel.com)，导入仓库
3. 框架选择 Vite，点击 Deploy
4. 完成！Vercel 会自动构建和部署

### 部署到 Netlify

1. 登录 [Netlify](https://netlify.com)
2. 拖拽 `dist/` 文件夹到部署区域
3. 或连接 GitHub 仓库，设置构建命令为 `npm run build`，发布目录为 `dist`

## 📁 项目结构

```
src/
├── components/
│   ├── dashboard/              # 仪表盘子组件
│   │   ├── HabitStats.tsx          # 习惯统计（连续周数、本周/本月数据）
│   │   ├── ReviewReminder.tsx      # 复盘提醒（按单据角色独立提醒）
│   │   ├── BackupReminder.tsx      # 备份提醒
│   │   ├── RecentRecords.tsx       # 最近记录
│   │   ├── PositionOverview.tsx    # 当前持仓概览
│   │   ├── ContributionGraph.tsx   # GitHub 风格复盘热力图
│   │   └── index.ts
│   ├── form/                   # 表单子组件
│   │   ├── ConditionalField.tsx    # 条件渲染字段
│   │   ├── OptionalFieldsGroup.tsx # 可选字段组
│   │   ├── CollapsibleSection.tsx  # 可折叠区域
│   │   └── index.ts
│   ├── stats/                  # 统计面板组件
│   │   ├── StatsPanel.tsx          # 统计面板入口
│   │   ├── DailyStats.tsx          # 日复盘统计
│   │   ├── WeeklyStats.tsx         # 周复盘统计
│   │   ├── EmotionStats.tsx        # 情绪觉察统计
│   │   ├── DecisionStats.tsx       # 决策日志统计
│   │   ├── InvestmentStats.tsx     # 投资检查清单统计（含卖出质量）
│   │   └── index.ts
│   ├── FormRenderer.tsx        # 核心表单渲染引擎（支持三角色动态模板）
│   ├── FieldRenderer.tsx       # 单字段渲染（React.memo 优化）
│   ├── RepeatableSection.tsx   # 可重复填写 section（支持动态选项注入）
│   ├── InvestmentEntry.tsx     # 投资检查清单新建入口（代码中心操作面板）
│   ├── InvestmentMergePanel.tsx# 仓位汇总面板（买入/卖出明细表格）
│   ├── InvestmentTable.tsx     # 投资记录表格视图（三角色状态）
│   ├── SellContextInline.tsx   # 卖出阶段内联持仓上下文
│   ├── ReviewContextInline.tsx # 卖出复盘量化对比
│   ├── PasswordInput.tsx       # 密码输入组件
│   ├── LoadingSpinner.tsx      # 加载动画
│   ├── ExportButtons.tsx       # 导出按钮（Markdown / PDF）
│   ├── HistoryList.tsx         # 历史记录列表
│   ├── Layout.tsx              # 全局布局（导航+内容）
│   ├── PhaseIndicator.tsx      # 多阶段进度指示器（支持跳过冷静期）
│   ├── ProtectedRoute.tsx      # 路由守卫
│   ├── QualityCheck.tsx        # 表单质量检查面板
│   ├── ReferenceSidebar.tsx    # 历史参考侧栏
│   ├── SearchBar.tsx           # 搜索栏
│   ├── TemplateCard.tsx        # 模板卡片
│   ├── ConfirmDialog.tsx       # 确认对话框
│   └── Toast.tsx               # Toast 通知
├── pages/
│   ├── DashboardPage.tsx       # 首页仪表盘
│   ├── FormPage.tsx            # 表单填写页（投资清单新建走 InvestmentEntry）
│   ├── HistoryPage.tsx         # 历史记录页（投资清单 JSON 导出面板）
│   ├── DataPage.tsx            # 数据管理页（存储统计、JSON 导入/导出、备份恢复）
│   └── LoginPage.tsx           # 登录页
├── templates/                  # 8 个复盘模板配置
│   ├── dailyReview.ts              # 📅 日复盘
│   ├── weeklyReview.ts             # 📊 周复盘
│   ├── monthlyReview.ts            # 📈 月复盘
│   ├── annualReview.ts             # 🎯 年度复盘
│   ├── emotionalAwareness.ts       # 💭 情绪觉察
│   ├── caseStudy.ts                # 📋 实战案例
│   ├── decisionLog.ts              # 🔄 决策日志
│   ├── investmentChecklist.ts      # 💰 投资检查清单（含三角色动态模板）
│   └── index.ts
├── services/                   # 业务逻辑层
│   ├── db.ts                       # IndexedDB 数据操作（元库存账户 + 每账户独立业务库）
│   ├── auth.ts                     # 认证服务（多账户注册/登录，PBKDF2 + SHA-256）
│   ├── investmentMerge.ts          # 投资合并/三角色模型/仓位汇总联动
│   ├── investmentExport.ts         # 投资清单 JSON 导出（全量/时间段/代码）
│   ├── testData.ts                 # 测试账户与测试数据初始化（admin 独立隔离）
│   ├── stats.ts                    # 统计计算服务
│   ├── exportMarkdown.ts           # Markdown 导出
│   ├── exportPdf.ts                # PDF 导出
│   └── suggestions.ts              # 自动补全建议服务
├── hooks/                      # React Hooks
│   ├── useDB.ts                    # 数据库 Hooks
│   ├── useAuth.ts                  # 认证 Hooks
│   └── useToast.ts                 # Toast 通知 Hook
├── utils/                      # 工具函数
│   ├── formValidation.ts           # 表单验证 + 阶段计算（支持跳过冷静期）
│   └── dashboard.ts                # 仪表盘计算函数
├── constants/                  # 常量定义
│   └── templateMeta.ts             # 模板元数据（等级、颜色映射）
└── types/                      # TypeScript 类型定义
    └── index.ts
```

## 💡 使用说明

1. **创建账户**：首次使用创建账户（账户名 + 密码，4-20 位），各账户数据相互隔离；测试模式可直接登录 `admin` / `admin`
2. **切换账户**：点击导航栏「退出登录」回到登录页，可登录其他账户或创建新账户；不同账户的数据互不可见
3. **创建复盘**：在首页仪表盘选择模板，点击"新建"
4. **填写表单**：通过 Tab 切换不同章节，逐步填写；右侧可打开历史参考侧栏
5. **投资检查清单**：
   - 进入后**无需先输入**：页面直接展示「历史持仓 + 热门股票」快捷按钮，点击即查询；输入代码后按 **Enter** 或点「查询」
   - 已有仓位：可进行持有中复盘、卖出（新建卖出单）、买入（新建买入单）
   - 无仓位：仅创建买入单；**买入单填写完成后自动同步创建仓位单**
   - 买入单/卖出单填写决策后，按「复盘冷静期设置」中的天数解锁对应复盘（默认 30 天，可在入口页按场景配置：买入/卖出/投资周期复盘各自独立）
   - 仓位单汇总同代码所有买卖明细（表格形式），清仓后按冷静期设置解锁投资周期复盘
   - 复盘 tab 在冷静期内显示 🔒 锁页面，点击提示剩余解锁天数
6. **质量检查**：关注质量检查面板的实时反馈，提升复盘深度
7. **保存数据**：支持"保存草稿"和"完成"两种状态
8. **查看历史**：在历史记录页查找、筛选已保存的复盘
9. **投资清单导出**：历史记录页（投资检查清单视图）可按股票代码、时间段导出 JSON，或全量导出
10. **导出分享**：将完成的复盘导出为 Markdown 或 PDF 文件
11. **数据管理**：在数据管理页可以查看存储统计、导出全部/已完成记录、导入备份
12. **多阶段模板**：投资检查清单支持"买入 → 持有 → 卖出 → 冷静期复盘"四阶段，卖出 30 天后自动解锁复盘阶段（admin 测试模式下立即解锁）

## ⚠️ 注意事项

- 数据存储在浏览器本地（IndexedDB），**清除浏览器数据会导致丢失**
- 每个账户的数据独立存储（`review-app-{账户id}`），互不可见；**请记得自己的账户名与密码**
- 建议定期使用数据管理页的导出功能备份重要复盘记录
- **忘记密码**：登录页「忘记密码」输入账户名 → 仅重置该账户的登录凭据（不影响其他账户）；该账户业务数据仍保留在本地，**用同名账户重新注册（设置新密码）即可恢复数据**
- admin 测试账户仅用于测试，其数据独立于其他账户；正式使用请创建自己的账户
- 推荐使用 Chrome、Firefox、Safari、Edge 等现代浏览器
- **Windows 构建提示**：若 `npm run build` 时出现 `dist` 目录清理报错，可先手动删除 `dist` 目录再构建：
  ```powershell
  Remove-Item dist -Recurse -Force
  npm run build
  ```
- 若 `npm run dev` 提示端口被占用，可指定其他端口：`npm run dev -- --port 5199`

## 📄 License

MIT
