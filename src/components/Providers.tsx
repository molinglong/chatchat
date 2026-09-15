'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'
import { QueryProvider } from '@/lib/query/QueryProvider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {/* QueryProvider 内含 React Query 单例 client,跨 layout 跳转保留缓存 */}
      <QueryProvider>{children}</QueryProvider>
    </SessionProvider>
  )
}
