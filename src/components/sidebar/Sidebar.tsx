'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Plus, Settings, X } from 'lucide-react'
import { useChatStore } from '@/store/chat-store'
import { cn } from '@/lib/utils'
import { ConversationItem } from './ConversationItem'
import { ThemeToggle } from '../ThemeToggle'

interface ConversationData {
  id: string
  title: string
  mode?: string
  updatedAt: string
}

/** 每页加载的会话数量 */
const PAGE_SIZE = 20

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, setSettingsOpen, conversationVersion } = useChatStore()
  const [conversations, setConversations] = useState<ConversationData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const router = useRouter()
  const pathname = usePathname()

  // 首次加载 / 新会话创建后刷新: 从第一页重新拉取
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?limit=${PAGE_SIZE}&offset=0`)
      if (res.ok) {
        const data = await res.json()
        setConversations(data.items ?? [])
        setTotal(data.total ?? 0)
        setHasMore(!!data.hasMore)
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 追加加载下一页
  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/conversations?limit=${PAGE_SIZE}&offset=${conversations.length}`
      )
      if (res.ok) {
        const data = await res.json()
        const items = data.items ?? []
        setConversations((prev) => [...prev, ...items])
        setTotal(data.total ?? 0)
        setHasMore(!!data.hasMore)
      }
    } catch (err) {
      console.error('Failed to load more conversations:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, conversations.length])

  // 新会话创建时(bump 信号)刷新列表,不再依赖 currentConversationId 避免重复请求
  useEffect(() => {
    fetchConversations()
  }, [conversationVersion, fetchConversations])

  function handleNewConversation() {
    setSidebarOpen(false)
    // If the router still thinks we're on /chat (the URL may have been rewritten
    // to /chat/c/[id] via history.replaceState after the first message), pushing
    // the same route is a no-op and the panel won't reset. Hard-navigate instead.
    if (pathname === '/chat') {
      if (window.location.pathname !== '/chat') {
        window.location.href = '/chat'
      }
      return
    }
    router.push('/chat')
  }

  async function handleDeleteConversation(id: string) {
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id))
        router.push('/chat')
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }

  async function handleRenameConversation(id: string, newTitle: string) {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      })
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
        )
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err)
    }
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-1.5 bottom-1.5 left-1.5 z-50 w-56 flex flex-col',
          'bg-surface-glass backdrop-blur-xl text-content-primary',
          'rounded-xl border border-line/50 overflow-hidden',
          'transition-transform duration-300 ease-in-out',
          'lg:static lg:z-auto lg:inset-auto lg:translate-x-0 lg:m-1.5',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
          <h1 className="text-base font-semibold tracking-tight">八号产房</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded-md hover:bg-surface-subtle lg:hidden transition-colors"
            aria-label="关闭侧边栏"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* New Conversation Button */}
        <div className="px-2 pt-1.5">
          <button
            onClick={handleNewConversation}
            className="w-full flex items-center justify-start gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
              bg-accent text-accent-foreground
              hover:bg-accent-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新对话
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-1.5 pt-2">
          <nav className="space-y-0.5">
            {loading ? (
              <div className="px-3 py-6 text-center text-content-muted text-xs">
                加载中...
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-6 text-center text-content-muted text-xs">
                暂无对话记录
              </div>
            ) : (
              <>
                {conversations.map((conv, index) => (
                  <ConversationItem
                    key={conv.id}
                    id={conv.id}
                    title={conv.title}
                    mode={conv.mode}
                    index={index}
                    onDelete={handleDeleteConversation}
                    onRename={handleRenameConversation}
                  />
                ))}
                {/* 限量加载: 还有更多时显示加载按钮 */}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg text-xs text-content-muted hover:text-content-primary hover:bg-surface-subtle/60 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? '加载中...' : `加载更多 (${total - conversations.length} 条剩余)`}
                  </button>
                )}
              </>
            )}
          </nav>
        </div>

        {/* Footer */}
        <div className="px-2 pt-1 pb-2 flex items-center gap-1">
          <button
            onClick={() => { setSettingsOpen(true); setSidebarOpen(false) }}
            className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-subtle/60 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            设置
          </button>
          <ThemeToggle />
        </div>
      </aside>
    </>
  )
}
