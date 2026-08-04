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
- **多阶段生命周期**：投资检查清单支持"买入 → 持有 → 卖出 → 冷静期复盘"四阶段，含 30 天冷静期机制
- **交互式表单**：分步 Tab 导航，丰富字段覆盖完整复盘维度
- **表单质量检查**：实时质量检查面板，帮助提升复盘质量
- **历史参考侧栏**：填写时可参考历史记录，支持自动补全建议
- **习惯统计仪表盘**：连续周数追踪、本周/本月复盘统计、复盘提醒
- **数据管理页面**：存储统计、JSON 导入/导出、全量/已完成记录备份恢复
- **自动保存**：每 30 秒自动存档，切换 Tab 时也会保存
- **数据持久化**：基于 IndexedDB 的本地存储，关闭浏览器数据不丢失
- **导出功能**：支持 Markdown 和 PDF 两种格式导出
- **搜索与分类**：按模板类型、时间、状态筛选，关键词搜索
- **隐私保护**：本地密码加密保护（PBKDF2 + SHA-256）
- **移动端适配**：响应式设计，手机/平板/桌面端均可使用
- **零服务器依赖**：纯静态部署，无需后端服务

## 🛠️ 技术栈

- React 18 + TypeScript 5
- Vite 5（构建工具）
- Tailwind CSS（样式）
- React Hook Form（表单管理）
- IndexedDB via idb（数据存储）
- jsPDF + html2canvas（PDF 导出）
- React Router（路由）
- date-fns（日期处理）
- uuid（唯一 ID 生成）
- clsx（条件样式拼接）

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

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
│   │   ├── ReviewReminder.tsx      # 复盘提醒
│   │   ├── BackupReminder.tsx      # 备份提醒
│   │   ├── RecentRecords.tsx       # 最近记录
│   │   └── index.ts
│   ├── form/                   # 表单子组件
│   │   ├── ConditionalField.tsx    # 条件渲染字段
│   │   ├── OptionalFieldsGroup.tsx # 可选字段组
│   │   ├── CollapsibleSection.tsx  # 可折叠区域
│   │   └── index.ts
│   ├── FormRenderer.tsx        # 核心表单渲染引擎
│   ├── FieldRenderer.tsx       # 单字段渲染（React.memo 优化）
│   ├── PasswordInput.tsx       # 密码输入组件
│   ├── LoadingSpinner.tsx      # 加载动画
│   ├── ExportButtons.tsx       # 导出按钮（Markdown / PDF）
│   ├── HistoryList.tsx         # 历史记录列表
│   ├── Layout.tsx              # 全局布局（导航+内容）
│   ├── PhaseIndicator.tsx      # 多阶段进度指示器
│   ├── ProtectedRoute.tsx      # 路由守卫
│   ├── QualityCheck.tsx        # 表单质量检查面板
│   ├── ReferenceSidebar.tsx    # 历史参考侧栏
│   ├── SearchBar.tsx           # 搜索栏
│   ├── TemplateCard.tsx        # 模板卡片
│   └── Toast.tsx               # Toast 通知
├── pages/
│   ├── DashboardPage.tsx       # 首页仪表盘
│   ├── FormPage.tsx            # 表单填写页
│   ├── HistoryPage.tsx         # 历史记录页
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
│   ├── investmentChecklist.ts      # 💰 投资检查清单
│   └── index.ts
├── services/                   # 业务逻辑层
│   ├── db.ts                       # IndexedDB 数据操作
│   ├── auth.ts                     # 认证服务（PBKDF2 + SHA-256）
│   ├── exportMarkdown.ts           # Markdown 导出
│   ├── exportPdf.ts                # PDF 导出
│   └── suggestions.ts              # 自动补全建议服务
├── hooks/                      # React Hooks
│   ├── useDB.ts                    # 数据库 Hooks
│   ├── useAuth.ts                  # 认证 Hooks
│   └── useToast.ts                 # Toast 通知 Hook
├── utils/                      # 工具函数
│   ├── formValidation.ts           # 表单验证逻辑
│   └── dashboard.ts                # 仪表盘计算函数
├── constants/                  # 常量定义
│   └── templateMeta.ts             # 模板元数据（等级、颜色映射）
└── types/                      # TypeScript 类型定义
    └── index.ts
```

## 💡 使用说明

1. **首次使用**：设置一个 4-20 位的访问密码
2. **创建复盘**：在首页仪表盘选择模板，点击"新建"
3. **填写表单**：通过 Tab 切换不同章节，逐步填写；右侧可打开历史参考侧栏
4. **质量检查**：关注质量检查面板的实时反馈，提升复盘深度
5. **保存数据**：支持"保存草稿"和"完成"两种状态
6. **查看历史**：在历史记录页查找、筛选已保存的复盘
7. **导出分享**：将完成的复盘导出为 Markdown 或 PDF 文件
8. **数据管理**：在数据管理页可以查看存储统计、导出全部/已完成记录、导入备份
9. **多阶段模板**：投资检查清单支持"买入 → 持有 → 卖出 → 冷静期复盘"四阶段，卖出 30 天后自动解锁复盘阶段

## ⚠️ 注意事项

- 数据存储在浏览器本地（IndexedDB），**清除浏览器数据会导致丢失**
- 建议定期使用数据管理页的导出功能备份重要复盘记录
- 如忘记密码，数据无法恢复（这是隐私保护的设计）
- 推荐使用 Chrome、Firefox、Safari、Edge 等现代浏览器

## 📄 License

MIT
