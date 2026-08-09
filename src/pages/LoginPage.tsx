/**
 * LoginPage — 登录/账户创建页
 *
 * 多账户设计，根据用户状态展示不同界面：
 * - 首次使用（isFirstTime=true，无任何账户）→ 创建账户表单（账户名 + 密码 + 确认）
 * - 已有账户 → 登录表单（账户名 + 密码）
 * - 登录页提供「创建新账户」入口（可创建多个账户，数据各自隔离）
 * - 已认证 → 自动跳转到首页
 *
 * 安全措施：
 * - 账户名唯一（账户名即账户 id）
 * - 密码长度限制 4-20 位
 * - 首次创建需二次确认
 * - 支持密码明文切换显示
 */
import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage() {
  const navigate = useNavigate();
  const { isFirstTime, loading, login, register, isAuthenticated, resetPassword } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // 登录模式：login（已有账户登录） / register（创建新账户）
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);

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

  // 首次使用：直接进入创建账户模式；已有账户默认登录模式
  const isRegisterMode = isFirstTime || mode === 'register';

  /** 创建新账户（首次使用或点击「创建新账户」） */
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('请输入账户名');
      return;
    }
    if (password.length < 4 || password.length > 20) {
      setError('密码长度需在 4-20 位之间');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    const result = await register(username, password);
    setSubmitting(false);

    if (result.success) {
      navigate('/', { replace: true });
    } else {
      setError(result.error || '创建失败');
    }
  }

  /** 登录已有账户 */
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('请输入账户名');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }

    setSubmitting(true);
    const result = await login(username, password);
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
          {isFirstTime && (
            <p className="text-xs text-gray-400 mt-1">多账户模式 · 各账户数据相互隔离</p>
          )}
        </div>

        <form onSubmit={isRegisterMode ? handleRegister : handleLogin}>
          <h2 className="text-lg font-semibold text-gray-700 mb-1 text-center">
            {isRegisterMode ? (isFirstTime ? '创建你的账户' : '创建新账户') : '登录'}
          </h2>
          <p className="text-sm text-gray-500 mb-6 text-center">
            {isRegisterMode
                ? '账户数据独立存储，互不影响'
                : '输入账户名与密码解锁'}
          </p>

          {/* Username input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">账户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="如：myname / admin"
              maxLength={30}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
          </div>

          {/* Password input */}
          <div className="mb-4">
            <PasswordInput
              value={password}
              onChange={setPasswordValue}
              showPassword={showPassword}
              onToggleVisibility={() => setShowPassword(!showPassword)}
              placeholder="请输入密码"
              maxLength={20}
              label="密码"
            />
          </div>

          {/* Confirm password (register mode only) */}
          {isRegisterMode && (
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
          )}

          {/* Error message */}
          {error && (
            <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-lg transition-colors"
          >
            {submitting
                ? '处理中...'
                : isRegisterMode
                    ? (isFirstTime ? '创建并进入' : '创建账户')
                    : '登录'}
          </button>
        </form>

        {/* Mode switch / extra actions */}
        <div className="mt-4 flex items-center justify-between text-sm">
          {isFirstTime ? (
            <span className="text-gray-400">还没有账户？创建第一个账户开始使用</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode(isRegisterMode ? 'login' : 'register');
                setError('');
                setConfirmPassword('');
              }}
              className="text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {isRegisterMode ? '← 返回登录' : '创建新账户'}
            </button>
          )}
          {!isRegisterMode && (
            <button
              type="button"
              disabled={resetting}
              onClick={async () => {
                const confirmed = window.confirm(
                  '将清除全部账户（各账户数据仍保留在本地）。\n确认后需重新创建账户。\n\n确定要重置吗？'
                );
                if (!confirmed) return;
                setResetting(true);
                await resetPassword();
                setResetting(false);
              }}
              className="text-gray-400 hover:text-indigo-600 transition-colors"
            >
              {resetting ? '重置中...' : '忘记密码？'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
