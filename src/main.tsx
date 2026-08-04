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
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
