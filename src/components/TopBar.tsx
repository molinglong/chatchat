'use client'

import { Plus, Sparkles, Scale } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function TopBar() {
  const { conversationTitle } = useChatStore()
  const [title, setTitle] = useState(conversationTitle)
  const router = useRouter()
  const pathname = usePathname()

  // Update local state when store changes
  useEffect(() => {
    setTitle(conversationTitle)
  }, [conversationTitle])

  // 在 /images 页面显示固定的页面标题
  const isImagesPage = pathname?.startsWith('/images')
  const isExplorePage = pathname?.startsWith('/explore')
  const displayTitle = isImagesPage ? '生图工作台' : isExplorePage ? '观点探索' : (title || '新对话')

  function handleNewChat() {
    // 已经在空白聊天页: 直接通过 popstate / replace 强制刷新组件,
    // 不再用 window.location.href 硬跳(避免侧边栏 store 重置引发闪烁).
    if (pathname === '/chat') {
      router.replace('/chat')
      router.refresh()
      return
    }
    // 在某个对话里 (/chat/c/xxx): SPA push 回到空白页,让 ChatPanel 重置内部状态
    if (pathname?.startsWith('/chat/')) {
      router.push('/chat')
      return
    }
    // 在生图/探索页: 走 SPA push,侧边栏 store 在 zustand 单例里保持不变,不会闪烁
    router.push('/chat')
  }

  function handleGoImages() {
    if (pathname?.startsWith('/images')) return
    router.push('/images')
  }

  function handleGoExplore() {
    if (pathname?.startsWith('/explore')) return
    router.push('/explore')
  }

  return (
    <header className="relative flex items-center h-9 px-2 shrink-0 m-1.5 rounded-xl border border-line/50 bg-surface-glass backdrop-blur-xl">
      {/* Left: 当前页标题(限宽避免与胶囊重叠) */}
      <div className="flex items-center gap-0.5 min-w-0 flex-1 max-w-[40%]">
        <span className="text-xs font-medium text-content-muted truncate ml-1">
          {displayTitle}
        </span>
      </div>

      {/* Center: 胶囊选项卡(聊天 / 生图 / 探索) — 绝对居中,不受标题长度影响 */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-none">
        {/* 胶囊容器 */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-subtle/70 pointer-events-auto">
          <button
            onClick={handleNewChat}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150',
              !isImagesPage && !isExplorePage
                ? 'bg-surface text-content-primary shadow-sm'
                : 'text-content-secondary hover:text-content-primary'
            )}
            aria-label="新对话"
            title="新对话"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>聊天</span>
          </button>
          <button
            onClick={handleGoImages}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150',
              isImagesPage
                ? 'bg-surface text-content-primary shadow-sm'
                : 'text-content-secondary hover:text-content-primary'
            )}
            aria-label="生图工作台"
            title="生图工作台"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>生图</span>
          </button>
          <button
            onClick={handleGoExplore}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150',
              isExplorePage
                ? 'bg-surface text-content-primary shadow-sm'
                : 'text-content-secondary hover:text-content-primary'
            )}
            aria-label="观点探索"
            title="观点探索"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>探索</span>
          </button>
        </div>
      </div>

      {/* Right: 镜像占位,与左侧等宽,保证胶囊视觉居中 */}
      <div className="flex items-center gap-0.5 min-w-0 flex-1 max-w-[40%] justify-end" />
    </header>
  )
}

