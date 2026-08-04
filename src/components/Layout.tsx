/**
 * Layout — 应用整体布局组件
 *
 * 提供响应式的导航栏和内容区域：
 * - 桌面端（md+）：顶部固定导航栏，包含 Logo、导航链接、退出按钮
 * - 移动端：顶部简化导航栏 + 左侧抽屉菜单（Drawer）
 *
 * 交互细节：
 * - 路由变化时自动关闭抽屉
 * - 抽屉打开时锁定页面滚动（防止背景滑动）
 * - 退出登录后跳转到 /login
 */
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { path: '/', label: '首页' },
    { path: '/history', label: '历史记录' },
    { path: '/data', label: '💾 数据管理' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Navbar */}
      <header className="hidden md:block fixed top-0 left-0 right-0 h-16 bg-white shadow-sm border-b border-gray-200 z-30">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
          {/* Left: Logo */}
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
            📝 个人复盘系统
          </Link>

          {/* Center/Right: Nav links */}
          <nav className="flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors pb-0.5 ${
                  isActive(link.path)
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Far right: Logout */}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium"
          >
            退出
          </button>
        </div>
      </header>

      {/* Mobile Navbar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white shadow-sm border-b border-gray-200 z-30">
        <div className="h-full px-4 flex items-center justify-between">
          {/* Left: Hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="打开菜单"
          >
            <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Center: Title */}
          <span className="text-base font-semibold text-gray-900">个人复盘</span>

          {/* Right: Spacer */}
          <div className="w-10" />
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-64 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer header */}
        <div className="h-14 px-4 flex items-center border-b border-gray-200">
          <span className="text-base font-semibold text-gray-900">📝 个人复盘</span>
        </div>

        {/* Drawer nav links */}
        <nav className="flex flex-col py-2">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`py-3 px-4 text-base font-medium transition-colors ${
                isActive(link.path)
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Drawer footer: Logout */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 p-4">
          <button
            onClick={handleLogout}
            className="w-full py-3 px-4 text-base font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="pt-16 md:pt-16">
        <div className="pt-0 md:pt-0">
          <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile: adjust padding-top for smaller navbar */}
      <style>{`
        @media (max-width: 767px) {
          main { padding-top: 3.5rem; }
        }
      `}</style>
    </div>
  );
}
