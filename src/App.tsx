/**
 * 应用根组件 — 路由配置与页面布局
 *
 * 路由结构：
 * - /login        → 登录页（无需认证）
 * - /             → 仪表盘首页（需认证）
 * - /form/:templateId/:recordId? → 表单填写/编辑页（需认证）
 * - /history/:templateId?        → 历史记录页（需认证）
 * - /data         → 数据管理页（需认证）
 *
 * 性能优化：
 * - 使用 React.lazy 对非首屏页面做代码分割，减少初始加载体积
 * - Suspense 在懒加载期间展示统一的加载动画
 * - ProtectedRoute 统一处理认证拦截，未登录自动跳转 /login
 */
import React, { Suspense, useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import LoadingSpinner from '@/components/LoadingSpinner';
import LoginPage from '@/pages/LoginPage';
import { initializeTestAccount } from '@/services/testData';

const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));
const FormPage = React.lazy(() => import('@/pages/FormPage'));
const HistoryPage = React.lazy(() => import('@/pages/HistoryPage'));
const DataPage = React.lazy(() => import('@/pages/DataPage'));

function App() {
  // 测试账户初始化（幂等）：密码 admin + test_mode + 自动填充测试数据。
  // 等待初始化完成后再渲染路由，避免登录页与密码设置的竞态。
  const [initDone, setInitDone] = useState(false);

  useEffect(() => {
    initializeTestAccount().finally(() => setInitDone(true));
  }, []);

  if (!initDone) {
    return <LoadingSpinner />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/form/:templateId/:recordId?"
          element={
            <ProtectedRoute>
              <Layout>
                <FormPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history/:templateId?"
          element={
            <ProtectedRoute>
              <Layout>
                <HistoryPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/data"
          element={
            <ProtectedRoute>
              <Layout>
                <DataPage />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default App;
