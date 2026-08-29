/**
 * 应用入口文件
 *
 * 使用 HashRouter（基于 URL hash 的路由）以支持静态文件部署（如 GitHub Pages），
 * 无需服务端配置即可正常处理前端路由。
 *
 * StrictMode 在开发环境下启用额外的检查和警告，帮助发现潜在问题。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
// 移动端响应式全局基线：触控目标 44px / 输入 16px 防聚焦缩放 / safe-area / dvh / modal-clamp / 容器查询 / 表格滚动
import '@shared/core/styles/responsive.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
