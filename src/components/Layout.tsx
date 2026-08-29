/**
 * Layout — 应用整体布局组件（基于 @shared/core Layout 统一 UI 风格基线）
 *
 * - 桌面端：可折叠左侧边栏（分组导航 + 折叠态 tooltip）
 * - 移动端（<lg 断点）：侧边栏 Drawer 抽屉 + 顶部条
 * - Ctrl+K / Cmd+K：基于导航菜单的全局搜索面板（shared-core Layout 默认能力）
 * - 认证体系为项目自有 useAuth，通过 user/onLogout 注入 shared-core Layout
 */
import { useNavigate } from 'react-router-dom';
import { Layout as SharedLayout } from '@shared/core';
import { BookOpen, Database, History, Home } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// 应用品牌配置（shared-core Layout 顶栏图标 + 名称）
const APP_CONFIG = {
  name: '个人复盘系统',
  icon: BookOpen,
};

// 侧边栏导航（shared-core Layout 扁平导航，等价于单页组）
const NAV_ITEMS = [
  { to: '/', icon: Home, label: '首页', end: true },
  { to: '/history', icon: History, label: '历史记录' },
  { to: '/data', icon: Database, label: '数据管理' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { username, logout } = useAuth();

  // 退出登录后跳转到 /login
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <SharedLayout
      navItems={NAV_ITEMS}
      appConfig={APP_CONFIG}
      user={username ? { username } : null}
      onLogout={handleLogout}
    >
      {children}
    </SharedLayout>
  );
}
