import { create } from 'zustand'

interface ChatState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
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

export const useChatStore = create<ChatState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
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
    set((state) => ({ conversationVersion: state.conversationVersion + 1 })),
  conversationStyleOffset: 50,
  setConversationStyleOffset: (offset) => set({ conversationStyleOffset: offset }),
  searchEngine: typeof window !== 'undefined' ? getInitialSearchEngine() : 'qianfan',
  setSearchEngine: (engine) => {
    localStorage.setItem('chat:searchEngine', engine)
    set({ searchEngine: engine })
  },
}))
