/**
 * 认证 Provider —— 转发到 shared-core 的统一认证。
 *
 * 认证算法与状态机在共享包，本项目只提供"用哪个驱动"
 * （本地 IndexedDB，见 `services/authDriver.ts`）。
 */
import type { ReactNode } from 'react';
import { AuthProvider as SharedAuthProvider } from '@shared/core/auth';
import { localAuthDriver } from '@/services/authDriver';

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SharedAuthProvider driver={localAuthDriver} errorMode="boolean">
      {children}
    </SharedAuthProvider>
  );
}
