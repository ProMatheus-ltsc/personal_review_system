/**
 * LoginPage — 登录/密码设置页
 *
 * 根据用户状态展示不同界面：
 * - 首次使用（isFirstTime=true）→ 密码设置表单（需输入两次确认）
 * - 已设置密码 → 密码登录表单
 * - 已认证 → 自动跳转到首页
 *
 * 安全措施：
 * - 密码长度限制 4-20 位
 * - 首次设置需二次确认
 * - 支持密码明文切换显示
 */
import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage() {
  const navigate = useNavigate();
  const { isFirstTime, loading, login, setPassword, isAuthenticated } = useAuth();

  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 4 || password.length > 20) {
      setError('密码长度需在 4-20 位之间');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    const result = await setPassword(password);
    setSubmitting(false);

    if (result.success) {
      navigate('/', { replace: true });
    } else {
      setError(result.error || '设置失败');
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('请输入密码');
      return;
    }

    setSubmitting(true);
    const result = await login(password);
    setSubmitting(false);

    if (result.success) {
      navigate('/', { replace: true });
    } else {
      setError(result.error || '验证失败');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">📝</div>
          <h1 className="text-xl font-bold text-gray-800">个人复盘系统</h1>
        </div>

        {isFirstTime ? (
          /* First-time setup */
          <form onSubmit={handleSetPassword}>
            <h2 className="text-lg font-semibold text-gray-700 mb-1 text-center">
              设置访问密码
            </h2>
            <p className="text-sm text-gray-500 mb-6 text-center">
              首次使用，请设置一个 4-20 位的密码来保护您的数据
            </p>

            {/* Password input */}
            <div className="mb-4">
              <PasswordInput
                value={password}
                onChange={setPasswordValue}
                showPassword={showPassword}
                onToggleVisibility={() => setShowPassword(!showPassword)}
                placeholder="请输入密码"
                maxLength={20}
                autoFocus
                label="密码"
              />
            </div>

            {/* Confirm password input */}
            <div className="mb-6">
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                showPassword={showConfirm}
                onToggleVisibility={() => setShowConfirm(!showConfirm)}
                placeholder="请再次输入密码"
                maxLength={20}
                label="确认密码"
              />
            </div>

            {/* Error message */}
            {error && (
              <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-lg transition-colors"
            >
              {submitting ? '处理中...' : '开始使用'}
            </button>
          </form>
        ) : (
          /* Login */
          <form onSubmit={handleLogin}>
            <h2 className="text-lg font-semibold text-gray-700 mb-6 text-center">
              输入密码解锁
            </h2>

            {/* Password input */}
            <div className="mb-6">
              <PasswordInput
                value={password}
                onChange={setPasswordValue}
                showPassword={showPassword}
                onToggleVisibility={() => setShowPassword(!showPassword)}
                placeholder="请输入密码"
                maxLength={20}
                autoFocus
              />
            </div>

            {/* Error message */}
            {error && (
              <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-lg transition-colors"
            >
              {submitting ? '验证中...' : '解锁'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
