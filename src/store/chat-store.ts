import { create } from 'zustand'

interface ChatState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  /** 客户端是否已完成 hydrate. 只在第一次客户端渲染完成后翻为 true,
   *  跨 layout 跳转时 Sidebar 重新挂载但 hydrated 仍为 true, 避免 "先展开再收起" 闪烁. */
  hydrated: boolean
  setHydrated: (v: boolean) => void
  currentConversationId: string | null
  setCurrentConversationId: (id: string | null) => void
  conversationTitle: string | null
  setConversationTitle: (title: string | null) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  previewCode: string | null
  setPreviewCode: (code: string | null) => void
  isPreviewFullscreen: boolean
  setIsPreviewFullscreen: (fullscreen: boolean) => void
  /** 会话列表刷新信号：新会话创建时 +1，侧边栏监听此值重新拉取列表 */
  conversationVersion: number
  bumpConversationVersion: () => void
  /** 当前对话的风格偏移量 (0-100) */
  conversationStyleOffset: number
  setConversationStyleOffset: (offset: number) => void
  /** 当前联网搜索引擎：qianfan | tavily，默认 qianfan */
  searchEngine: 'qianfan' | 'tavily'
  setSearchEngine: (engine: 'qianfan' | 'tavily') => void
}

const getInitialSearchEngine = (): 'qianfan' | 'tavily' => {
  if (typeof window === 'undefined') return 'qianfan'
  return localStorage.getItem('chat:searchEngine') === 'tavily' ? 'tavily' : 'qianfan'
}

/** 读取侧边栏折叠偏好: 桌面端用户上次的选择 */
const getInitialSidebarOpen = (): boolean => {
  if (typeof window === 'undefined') return true
  const v = localStorage.getItem('chat:sidebarOpen')
  // 缺失值或 'true' 视为展开;'false' 才视为折叠
  return v === null ? true : v === 'true'
}

const storeInitializer = (set: any): ChatState => ({
  sidebarOpen: typeof window !== 'undefined' ? getInitialSidebarOpen() : true,
  hydrated: false,
  setHydrated: (v) => set({ hydrated: v }),
  toggleSidebar: () =>
    set((state: ChatState) => {
      const next = !state.sidebarOpen
      if (typeof window !== 'undefined') {
        localStorage.setItem('chat:sidebarOpen', String(next))
      }
      return { sidebarOpen: next }
    }),
  setSidebarOpen: (open) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat:sidebarOpen', String(open))
    }
    set({ sidebarOpen: open })
  },
  currentConversationId: null,
  setCurrentConversationId: (id) => set({ currentConversationId: id }),
  conversationTitle: null,
  setConversationTitle: (title) => set({ conversationTitle: title }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  previewCode: null,
  setPreviewCode: (code) => set({ previewCode: code }),
  isPreviewFullscreen: false,
  setIsPreviewFullscreen: (fullscreen) => set({ isPreviewFullscreen: fullscreen }),
  conversationVersion: 0,
  bumpConversationVersion: () =>
    set((state: ChatState) => ({ conversationVersion: state.conversationVersion + 1 })),
  conversationStyleOffset: 50,
  setConversationStyleOffset: (offset) => set({ conversationStyleOffset: offset }),
  searchEngine: typeof window !== 'undefined' ? getInitialSearchEngine() : 'qianfan',
  setSearchEngine: (engine) => {
    localStorage.setItem('chat:searchEngine', engine)
    set({ searchEngine: engine })
  },
})

/** 防止 Next.js dev 模式 HMR 重新执行 create() 破坏单例:
 *  在 globalThis 上缓存 store 实例,跨模块重载共享同一个 store.
 *  同时 SSR/CSR 各自持有一份实例,SSR 渲染结束即丢弃,不会泄漏到客户端 hydration. */
type StoreType = ReturnType<typeof create<ChatState>>

const globalForStore = globalThis as unknown as { __chatStore?: StoreType }

export const useChatStore: StoreType =
  globalForStore.__chatStore ?? create<ChatState>(storeInitializer)

if (typeof window !== 'undefined' && !globalForStore.__chatStore) {
  globalForStore.__chatStore = useChatStore
}
