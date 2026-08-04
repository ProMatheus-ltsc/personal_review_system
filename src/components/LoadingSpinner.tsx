/**
 * LoadingSpinner — 全屏加载动画组件
 *
 * 用于 React.lazy 的 Suspense fallback，
 * 在懒加载页面 chunk 下载期间展示居中的旋转指示器。
 */
export default function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
