'use client'

import { Menu, Settings as SettingsIcon, Plus, Sparkles, Scale } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useChatStore } from '@/store/chat-store'
import { useEffect, useState } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

export function TopBar() {
  const { toggleSidebar, setSettingsOpen, conversationTitle } = useChatStore()
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
    // Same-route guard: when the router still thinks we're on /chat but the URL
    // was rewritten to /chat/c/[id] via history.replaceState, a push to /chat is
    // a no-op. Hard-navigate to a truly fresh chat panel.
    if (pathname === '/chat') {
      if (window.location.pathname !== '/chat') {
        window.location.href = '/chat'
      }
      return
    }
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
    <header className="relative flex items-center justify-between h-9 px-2 shrink-0 m-1.5 rounded-xl border border-line/50 bg-surface-glass backdrop-blur-xl overflow-hidden">
      {/* Left: sidebar toggle (mobile) + new chat */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-surface-subtle lg:hidden transition-colors"
          aria-label="切换侧边栏"
        >
          <Menu className="w-4 h-4 text-content-secondary" />
        </button>
        <button
          onClick={handleNewChat}
          className="p-1.5 rounded-lg hover:bg-surface-subtle transition-colors"
          aria-label="新对话"
        >
          <Plus className="w-4 h-4 text-content-secondary" />
        </button>
        <button
          onClick={handleGoImages}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            isImagesPage
              ? 'bg-accent/15 text-accent'
              : 'hover:bg-surface-subtle text-content-secondary'
          )}
          aria-label="生图工作台"
          title="生图工作台"
        >
          <Sparkles className="w-4 h-4" />
        </button>
        <button
          onClick={handleGoExplore}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            isExplorePage
              ? 'bg-accent/15 text-accent'
              : 'hover:bg-surface-subtle text-content-secondary'
          )}
          aria-label="观点探索"
          title="观点探索"
        >
          <Scale className="w-4 h-4" />
        </button>
      </div>

      {/* Center: title */}
      <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
        <span className="text-xs font-medium text-content-muted">
          {displayTitle}
        </span>
      </div>

      {/* Right: theme toggle + settings */}
      <div className="flex items-center gap-0.5">
        <ThemeToggle className="p-1.5 rounded-lg" />
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-lg hover:bg-surface-subtle transition-colors"
          aria-label="设置"
        >
          <SettingsIcon className="w-4 h-4 text-content-secondary" />
        </button>
      </div>
    </header>
  )
}

