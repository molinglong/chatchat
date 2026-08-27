'use client'

import { useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Plus, Settings, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useChatStore } from '@/store/chat-store'
import { cn } from '@/lib/utils'
import { ConversationItem } from './ConversationItem'
import { SearchDialog } from './SearchDialog'

interface ConversationData {
  id: string
  title: string
  mode?: string
  updatedAt: string
}

/** 每页加载的会话数量 */
const PAGE_SIZE = 20

export function Sidebar() {
  // SSR 期间读不到 localStorage, 默认展开. 客户端 hydrate 后再同步 localStorage 的真值,
  // 避免 store 初始值与 SSR 不一致导致 hydration mismatch.
  // 用 store 里的 hydrated 而非组件局部 mounted: 跨 layout 跳转(chat ↔ images � explore)
  // 会让 Sidebar 实例重新挂载,但 hydrated 标志在 zustand 单例里只翻一次,不再触发闪烁.
  const { sidebarOpen, toggleSidebar, setSidebarOpen, setSettingsOpen, conversationVersion, hydrated, setHydrated } = useChatStore()
  // 用 useLayoutEffect 同步翻 hydrated,避免 useEffect 那一帧先按"未 hydrate"渲染展开,
  // 紧接着再折叠的一闪. 仅在客户端执行,SSR 期间 hydrated 保持 false 不变.
  useLayoutEffect(() => {
    if (!hydrated) setHydrated(true)
  }, [hydrated, setHydrated])
  const sidebarEffectiveOpen = hydrated ? sidebarOpen : true
  const { data: session } = useSession()
  const [conversations, setConversations] = useState<ConversationData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // SSR 期间读不到 localStorage, 默认展开. 客户端 hydrate 后再同步 localStorage 的真值,
  // 避免 store 初始值与 SSR 不一致导致 hydration mismatch.
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

  // Cmd/Ctrl + K 打开搜索弹窗
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
      {sidebarEffectiveOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar
          - 移动端: 固定定位 + translate 滑入滑出
          - 桌面端展开: 静态定位,占 224px
          - 桌面端折叠: 静态定位但缩成 56px 宽,只显示图标(展开按钮始终可见) */}
      <aside
        className={cn(
          'fixed top-1.5 bottom-1.5 left-1.5 z-50 w-56 flex flex-col',
          'bg-surface-glass backdrop-blur-xl text-content-primary',
          'rounded-xl border border-line/50 overflow-hidden',
          'transition-transform duration-300 ease-in-out',
          'm-1.5',
          sidebarEffectiveOpen ? 'translate-x-0' : '-translate-x-full',
          // 桌面端:始终为静态定位(占位)
          'lg:static lg:z-auto lg:inset-auto lg:translate-x-0 lg:m-1.5 lg:transition-all',
          // 桌面端折叠: 缩成窄条,只显示图标
          !sidebarEffectiveOpen && 'lg:w-12 lg:m-1.5'
        )}
      >
        {/* Header — 「八号产房」标题 + 折叠按钮(桌面端与移动端均可见) */}
        <div className={cn(
          'flex items-center pt-3 pb-1.5',
          sidebarEffectiveOpen ? 'justify-between px-3' : 'justify-center px-0'
        )}>
          {sidebarEffectiveOpen ? (
            <h1 className="text-base font-semibold tracking-tight">八号产房</h1>
          ) : (
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-md hover:bg-surface-subtle transition-colors"
              aria-label="展开侧边栏"
              title="展开侧边栏"
            >
              <PanelLeftOpen className="w-3.5 h-3.5 text-content-secondary" />
            </button>
          )}
          {sidebarEffectiveOpen && (
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-md hover:bg-surface-subtle transition-colors"
              aria-label="收起侧边栏"
              title="收起侧边栏"
            >
              <PanelLeftClose className="w-3.5 h-3.5 text-content-secondary" />
            </button>
          )}
        </div>

        {/* 折叠态快捷工具条: 新对话 + 搜索 — 居中堆叠,填充空白 */}
        {!sidebarEffectiveOpen && (
          <div className="flex flex-col items-center gap-1 pt-2">
            <button
              onClick={handleNewConversation}
              className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-subtle/60 transition-colors"
              aria-label="新对话"
              title="新对话"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-subtle/60 transition-colors"
              aria-label="搜索聊天记录"
              title="搜索 (⌘K / Ctrl+K)"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* New Conversation Button — 展开态显示 */}
        {sidebarEffectiveOpen && (
          <div className="px-2 pt-1.5 pb-3">
            <button
              onClick={handleNewConversation}
              className="w-full flex items-center justify-start gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                bg-surface-subtle text-content-primary
                hover:bg-surface-muted transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新对话
            </button>
          </div>
        )}

        {/* 历史记录小标题 */}
        {sidebarEffectiveOpen && (
          <div className="px-3.5 pt-2 pb-1 flex items-center justify-between">
            <h2 className="text-[11px] font-medium text-content-muted/80">
              历史记录
            </h2>
            <div className="flex items-center gap-1.5">
              {total > 0 && (
                <span className="text-[11px] text-content-muted/60 tabular-nums">
                  {conversations.length}
                  {hasMore ? ` / ${total}` : ''}
                </span>
              )}
              <button
                onClick={() => setSearchOpen(true)}
                className="p-0.5 -mr-1 rounded-md text-content-muted/70 hover:text-content-primary hover:bg-surface-subtle transition-colors"
                aria-label="搜索聊天记录"
                title="搜索 (⌘K / Ctrl+K)"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Conversation List — 折叠态下隐藏 */}
        {sidebarEffectiveOpen && (
          <div className="flex-1 overflow-y-auto px-1.5 pt-0.5">
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
        )}

        {/* 用户信息 — 折叠态下隐藏,只显示头像圆点(由下方的折叠态 footer 替代) */}
        {sidebarEffectiveOpen && session?.user && (
          <div className="px-2 pt-2 pb-1 flex items-center gap-2 border-t border-line/40 mt-1">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name || '头像'}
                className="w-7 h-7 rounded-full shrink-0 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-[11px] font-medium text-accent shrink-0">
                {(session.user.name || session.user.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-content-primary truncate">
                {session.user.name || session.user.email || '已登录'}
              </p>
              {session.user.email && session.user.name && (
                <p className="text-[10px] text-content-muted truncate">
                  {session.user.email}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer — 设置按钮(展开态 + 标签, 折叠态 + 图标) */}
        <div className={cn(
          'pt-1 pb-2 flex items-center',
          sidebarEffectiveOpen ? 'px-2 justify-stretch' : 'px-0 justify-center'
        )}>
          {sidebarEffectiveOpen ? (
            <button
              onClick={() => { setSettingsOpen(true); setSidebarOpen(false) }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content-primary hover:bg-surface-subtle/60 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              设置
            </button>
          ) : (
            <button
              onClick={() => { setSettingsOpen(true) }}
              className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-subtle/60 transition-colors"
              aria-label="设置"
              title="设置"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </aside>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
