import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // 生产构建时使用 GitHub Pages 子路径（仓库名），本地开发不受影响
  base: command === 'build' ? '/personal_review_system/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared/core': path.resolve(__dirname, '../shared-core/src'),
    },
    // 防双 React：@shared/core 源码位于父目录，其自身 node_modules 里有 npm 自动安装的 react 副本，
    // 不 dedupe 会导致 production bundle 出现两份 React，hooks dispatcher 为 null 而白屏
    // （dev 因依赖预打包不受影响，typecheck/build 也不报错）。
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'react-hook-form'],
  },
}))
