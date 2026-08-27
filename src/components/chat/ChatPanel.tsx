'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { AlertCircle, RefreshCw, Settings as SettingsIcon, X, Eye, Plus, Minus } from 'lucide-react'
import Link from 'next/link'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ComparePanel } from './ComparePanel'
import { OutlineSidebar } from './OutlineSidebar'
import { useChatStore } from '@/store/chat-store'
import { getErrorMessage } from '@/lib/chat-errors'
import type { ModelDefinition } from '@/lib/ai/types'
import type { Attachment } from './FileUpload'

const MODEL_STORAGE_KEY = 'chat:selectedModel'
const DEEP_THINK_STORAGE_KEY = 'chat:deepThink'
const WEB_SEARCH_STORAGE_KEY = 'chat:webSearch'
const COMPARE_MODE_STORAGE_KEY = 'chat:compareMode'
const COMPARE_MODELS_STORAGE_KEY = 'chat:compareModels'

interface ChatPanelProps {
  conversationId?: string
  conversationTitle?: string
  initialMessages: UIMessage[]
  initialModel: string
  allModels: ModelDefinition[] // builtin only
  /** 会话模式：single | compare(来自 DB) */
  mode?: string
  /** 对比模式模型列表 (来自 DB) */
  compareModels?: string[]
  /** 对比模式每个泳道的初始消息 */
  laneInitialMessages?: UIMessage[][]
  /** 当前会话已保存的回复风格，默认 50 */
  initialStyleOffset?: number
}

export function ChatPanel({
  conversationId: initialConversationId,
  initialMessages,
  initialModel,
  allModels, // builtin
  conversationTitle,
  mode,
  compareModels: compareModelsProp,
  laneInitialMessages,
  initialStyleOffset,
}: ChatPanelProps) {
  const [currentModel, setCurrentModel] = useState(initialModel)
  const [conversationId, setConversationId] = useState(initialConversationId)
  const conversationStyleOffset = useChatStore(state => state.conversationStyleOffset)
  const setConversationStyleOffset = useChatStore(state => state.setConversationStyleOffset)

  useEffect(() => {
    if (initialConversationId) {
      setConversationStyleOffset(initialStyleOffset ?? 50)
      return
    }
    const stored = Number(localStorage.getItem('chat:styleOffset'))
    setConversationStyleOffset(
      Number.isFinite(stored) ? Math.max(0, Math.min(100, stored)) : 50
    )
  }, [initialConversationId, initialStyleOffset, setConversationStyleOffset])

  // Preview panel state
  const previewCode = useChatStore(state => state.previewCode)
  const setPreviewCode = useChatStore(state => state.setPreviewCode)
  const isPreviewFullscreen = useChatStore(state => state.isPreviewFullscreen)
  const setIsPreviewFullscreen = useChatStore(state => state.setIsPreviewFullscreen)
  
  useEffect(() => {
    if (isPreviewFullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isPreviewFullscreen])
  
  // Auto-enable deepThink for reasoning models (like DeepSeek-R1), but allow user to toggle off
  const shouldAutoEnableDeepThink = initialModel && allModels.find(m => m.id === initialModel)?.supportsReasoning
  const [deepThink, setDeepThink] = useState(shouldAutoEnableDeepThink || false)

  // 联网搜索：默认关闭，仅在用户在 ChatInput 中主动开启时才把 web_search 工具挂到模型。
  // 需要后端 /api/search/keys 验证用户是否配置了 SearchApiKey（webSearchAvailable）。
  const [webSearch, setWebSearch] = useState(false)
  const [webSearchAvailable, setWebSearchAvailable] = useState(false)
  // 当前联网搜索引擎（来自共享 store）
  const searchEngine = useChatStore((s) => s.searchEngine)
  useEffect(() => {
    fetch('/api/search/keys')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ engine: string }>) => {
        if (Array.isArray(data) && data.length > 0) {
          setWebSearchAvailable(true)
        } else {
          setWebSearchAvailable(false)
        }
      })
      .catch(() => setWebSearchAvailable(false))
  }, [])

  // 从 localStorage 恢复 webSearch 偏好
  useEffect(() => {
    if (!initialConversationId && localStorage.getItem(WEB_SEARCH_STORAGE_KEY) === 'true') {
      setWebSearch(true)
    }
  }, [initialConversationId])
  
  // Sync deepThink state with model changes - auto-enable for reasoning models
  useEffect(() => {
    if (currentModel && !deepThink) {
      const modelDef = allModels.find(m => m.id === currentModel)
      if (modelDef?.supportsReasoning) {
        setDeepThink(true)
      }
    }
  }, [currentModel, deepThink, allModels])

  // Fetch custom models and merge with builtin
  const [mergedModels, setMergedModels] = useState<ModelDefinition[]>(() => allModels)
  
  useEffect(() => {
    if (!initialConversationId) {
      // new chat: fetch custom models and merge
      let cancelled = false
      fetch('/api/custom-models')
        .then((r) => r.json())
        .then((custom: ModelDefinition[]) => {
          if (!cancelled && custom.length > 0) {
            setMergedModels([...allModels, ...custom])
          } else {
            setMergedModels(allModels)
          }
        })
        .catch(() => { setMergedModels(allModels) })
      return () => { cancelled = true }
    } else {
      // existing chat: use provided allModels (already includes custom from server side if needed)
      setMergedModels(allModels)
    }
  }, [allModels, initialConversationId])

  // 对比模式状态: 仅从 props 初始化(已有 compare 会话),新聊天的 localStorage 预设
  // 在挂载后加载,避免 SSR 水合不一致
  const [compareMode, setCompareMode] = useState(mode === 'compare')

  // 对比模型列表：DB > 默认前两个 (use mergedModels)
  const [compareModels, setCompareModels] = useState<string[]>(() => {
    if (compareModelsProp && compareModelsProp.length >= 2) return compareModelsProp
    const first = mergedModels[0]?.id
    const second = mergedModels.find((m) => m.id !== first)?.id
    return [first, second].filter(Boolean) as string[]
  })

  const handleCompareModeChange = useCallback(
    (enabled: boolean) => {
      setCompareMode(enabled)
      localStorage.setItem(COMPARE_MODE_STORAGE_KEY, String(enabled))
      if (enabled) {
        // 无保存的对比模型时，用当前模型 + 第一个不同模型作为默认
        const saved = localStorage.getItem(COMPARE_MODELS_STORAGE_KEY)
        if (!saved) {
          const second = mergedModels.find((m) => m.id !== currentModel)?.id
          if (second) setCompareModels([currentModel, second])
        }
      }
    },
    [mergedModels, currentModel]
  )

  // 对比模式会话创建后同步回来,用于隐藏切换开关
  const handleCompareConversationCreated = useCallback((convId: string) => {
    setConversationId((prev) => prev ?? convId)
  }, [])

  // On mount, for new chats, load the last selected model and deep think preference from localStorage
  useEffect(() => {
    if (!initialConversationId) {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY)
      if (saved && mergedModels.some((m) => m.id === saved)) {
        setCurrentModel(saved)
      }
      const savedDeepThink = localStorage.getItem(DEEP_THINK_STORAGE_KEY)
      if (savedDeepThink === 'true') {
        setDeepThink(true)
      }
      // 恢复对比模式预设 (移动端不实现对比，跳过)
      if (
        window.matchMedia('(min-width: 768px)').matches &&
        localStorage.getItem(COMPARE_MODE_STORAGE_KEY) === 'true'
      ) {
        setCompareMode(true)
      }
      try {
        const savedCompare = JSON.parse(localStorage.getItem(COMPARE_MODELS_STORAGE_KEY) ?? '[]')
        if (Array.isArray(savedCompare) && savedCompare.length >= 2) {
          const valid = savedCompare.filter((id: unknown) => mergedModels.some((m) => m.id === id))
          if (valid.length >= 2) setCompareModels(valid as string[])
        }
      } catch {
        // 忽略损坏的 localStorage 数据
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const conversationIdRef = useRef(initialConversationId)
  const attachmentsRef = useRef<Attachment[] | undefined>(undefined)
  // 消息区滚动容器(供 OutlineSidebar 做 scroll-spy / 平滑滚动)
  const [messagesScrollEl, setMessagesScrollEl] = useState<HTMLDivElement | null>(null)
  const { setCurrentConversationId, setConversationTitle, bumpConversationVersion } = useChatStore()

  // Notify store of current conversation (triggers Sidebar to refresh conversation list)
  useEffect(() => {
    setCurrentConversationId(initialConversationId ?? null)
    setConversationTitle(conversationTitle ?? null)
  }, [initialConversationId, conversationTitle, setCurrentConversationId, setConversationTitle])

  // Keep ref in sync
  conversationIdRef.current = conversationId

  // Create transport with current model, conversationId, deepThink, and webSearch
  const transport = new DefaultChatTransport<UIMessage>({
    api: '/api/chat',
    body: {
      model: currentModel,
      conversationId: conversationId,
      deepThink,
      webSearch,
      searchEngine,
      styleOffset: conversationStyleOffset,
      // Attachments are read from ref at send time
      get attachments() {
        return attachmentsRef.current
      },
    },
    // Intercept response to capture conversation ID from header
    fetch: async (url, options) => {
      const response = await fetch(url, options)
      const newConvId = response.headers.get('X-Conversation-Id')
      const newConvTitle = response.headers.get('X-Conversation-Title')
      if (newConvId && newConvId !== conversationIdRef.current) {
        conversationIdRef.current = newConvId
        setConversationId(newConvId)
        setCurrentConversationId(newConvId)
        bumpConversationVersion() // 新会话已入库,通知侧边栏刷新列表
        if (newConvTitle) {
          setConversationTitle(decodeURIComponent(newConvTitle))
        }
        // Update URL without full navigation
        window.history.replaceState(null, '', `/chat/c/${newConvId}`)
      }
      return response
    },
  })

  // Ref to setMessages,避免在 useChat 初始化器内部自引用导致循环依赖
  const setMessagesRef = useRef<((updater: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void) | null>(null)

  const { messages, sendMessage, setMessages, stop, status, error, clearError, regenerate } = useChat<UIMessage>({
    transport,
    messages: initialMessages,
    onFinish: async ({ message, isError, isAbort }) => {
      if (isError || isAbort) return
      const convId = conversationIdRef.current
      if (!convId) return
      try {
        // 服务端在 finish 事件之前已完成生图与入库(onFinish 先于 finish part 发送),
        // 这里拉取最新的助手消息,把含图片的最终内容同步到界面。
        const res = await fetch(`/api/conversations/${convId}/messages?limit=1`)
        if (!res.ok) return
        const data = await res.json()
        const latest = data.messages?.[0]
        if (!latest || latest.role !== "assistant" || typeof latest.content !== "string") return
        setMessagesRef.current?.((prev: UIMessage[]) =>
          prev.map((m) => {
            if (m.id !== message.id) return m
            return {
              ...m,
              // 以库中最终数据为准:reasoning 可能被兜底拆分(答案从推理尾部移入正文)
              parts: [
                ...(typeof latest.reasoning === 'string' && latest.reasoning.trim()
                  ? [{ type: 'reasoning' as const, text: latest.reasoning, state: 'done' as const }]
                  : []),
                { type: 'text' as const, text: latest.content, state: 'done' as const },
              ],
            }
          })
        )
      } catch (err) {
        console.error("Failed to sync final message content:", err)
      }
    },
  })

  // Keep ref in sync with latest setMessages
  setMessagesRef.current = setMessages

  // 发送后把附件挂到最后一条用户消息上,保证当前会话中即时展示(与服务端落库一致)
  useEffect(() => {
    const atts = attachmentsRef.current
    if (!atts || atts.length === 0) return
    setMessages((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'user') {
          next[i] = { ...next[i], attachments: atts } as UIMessage
          break
        }
      }
      return next
    })
    attachmentsRef.current = undefined
  }, [messages, setMessages])

  const isLoading = status === 'submitted' || status === 'streaming'

  const handleSend = useCallback(
    (text: string, attachments?: Attachment[]) => {
      attachmentsRef.current = attachments
      sendMessage({ text })
      // Clear after send so it's not included in subsequent messages
      attachmentsRef.current = undefined
    },
    [sendMessage]
  )

  const handleStop = useCallback(() => {
    stop()
  }, [stop])

  const handleModelChange = useCallback((modelId: string) => {
    setCurrentModel(modelId)
    // Persist to localStorage for new chats to pick up
    localStorage.setItem(MODEL_STORAGE_KEY, modelId)
    // Persist to DB for existing conversations
    const convId = conversationIdRef.current
    if (convId) {
      fetch(`/api/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      }).catch((err) => console.error('Failed to persist model:', err))
    }
  }, [])

  const handleDeepThinkChange = useCallback((enabled: boolean) => {
    setDeepThink(enabled)
    localStorage.setItem(DEEP_THINK_STORAGE_KEY, String(enabled))
  }, [])

  const handleWebSearchChange = useCallback((enabled: boolean) => {
    setWebSearch(enabled)
    localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(enabled))
  }, [])

  const handleRetry = useCallback(() => {
    clearError()
    regenerate()
  }, [clearError, regenerate])

  const handleRegenerate = useCallback(() => {
    clearError()
    regenerate()
  }, [clearError, regenerate])

  const handleEditMessage = useCallback(
    async (messageId: string, newText: string) => {
      // Delete the old message and all subsequent messages from the DB
      const convId = conversationIdRef.current
      if (convId) {
        try {
          await fetch(
            `/api/conversations/${convId}/messages?messageId=${messageId}`,
            { method: 'DELETE' }
          )
        } catch (err) {
          console.error('Failed to delete old messages:', err)
        }
      }

      // Truncate local messages to before the edited message
      const editIndex = messages.findIndex((m) => m.id === messageId)
      if (editIndex === -1) return
      const truncated = messages.slice(0, editIndex)
      setMessages(truncated)

      // Send the edited text as a new message
      sendMessage({ text: newText })
    },
    [messages, setMessages, sendMessage]
  )

  const errorInfo = error ? getErrorMessage(error) : null

  // 对比模式: 渲染并排泳道视图(key 确保模型列表变化时重建泳道)
  if (compareMode) {
    return (
      <ComparePanel
        key={compareModels.join('+')}
        conversationId={initialConversationId}
        initialLaneMessages={laneInitialMessages ?? compareModels.map(() => [])}
        initialCompareModels={compareModels}
        allModels={mergedModels}
        styleOffset={conversationStyleOffset}
        deepThink={deepThink}
        onDeepThinkChange={handleDeepThinkChange}
        webSearch={webSearch}
        onWebSearchChange={handleWebSearchChange}
        webSearchAvailable={webSearchAvailable}
        onCompareModeChange={handleCompareModeChange}
        compareModeAvailable={!conversationId}
        onConversationCreated={handleCompareConversationCreated}
      />
    )
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">

      {/* Error banner */}
      {error && errorInfo && (
        <div className="mx-4 mt-3 mb-0 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              {errorInfo.message}
            </p>
            {process.env.NODE_ENV === 'development' && error.message && (
              <p className="mt-1 text-xs text-red-400/70 dark:text-red-400/60 font-mono truncate">
                {error.message}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-red-500 text-white
                  hover:bg-red-600 transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                重试
              </button>
              {errorInfo.type === 'api_key' && (
                <Link
                  href="/chat/settings"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    bg-surface-muted text-content-secondary
                    hover:bg-surface-subtle transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-strong"
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                  前往设置
                </Link>
              )}
            </div>
          </div>
          <button
            onClick={() => clearError()}
            className="shrink-0 p-1 rounded-md text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            aria-label="关闭错误提示"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={setMessagesScrollEl}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      >
        <div className="flex min-h-full">
          <MessageList
            messages={messages}
            isStreaming={isLoading}
            className="min-h-full flex-1"
            onRegenerate={handleRegenerate}
            onEditMessage={handleEditMessage}
            models={mergedModels}
            selectedModel={currentModel}
            onModelChange={handleModelChange}
            onSend={handleSend}
          />
          <OutlineSidebar messages={messages} scrollContainer={messagesScrollEl} />
        </div>
      </div>

      {/* Input area - fixed at bottom (空状态时隐藏,改由 MessageList 中央的输入框接管) */}
      {messages.length > 0 && (
        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isLoading={isLoading}
          models={mergedModels}
          selectedModel={currentModel}
          onModelChange={handleModelChange}
          deepThink={deepThink}
          onDeepThinkChange={handleDeepThinkChange}
          webSearch={webSearch}
          onWebSearchChange={handleWebSearchChange}
          webSearchAvailable={webSearchAvailable}
          compareMode={false}
          compareModeAvailable={!conversationId}
          onCompareModeChange={handleCompareModeChange}
        />
      )}

      {/* Right preview panel (desktop) */}
      {previewCode && !isPreviewFullscreen && (
        <div className="hidden md:flex flex-col border-l border-line bg-code-bg min-w-[400px]">
          <MacHeaderForPreview code={previewCode} onClose={() => setPreviewCode(null)} />
        </div>
      )}
      
      {/* Fullscreen previews - absolute positioned overlays */}
      {(previewCode && isPreviewFullscreen) && (
        <>
          <div className="fixed inset-0 z-50 flex flex-col bg-code-bg md:hidden pointer-events-none">
            <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-line shrink-0 pointer-events-auto">
              <button
                onClick={() => setIsPreviewFullscreen(false)}
                className="flex items-center justify-center w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] hover:brightness-90 transition-all pointer-events-auto"
                aria-label="关闭"
              >
                <X className="w-2 h-2 text-[#820000] opacity-0 hover:opacity-100 transition-opacity" />
              </button>
              <span className="text-[11px] text-content-muted font-mono select-none pointer-events-auto">preview</span>
              <div className="w-3" />
            </div>
            <iframe
              src={`data:text/html;charset=utf-8,${encodeURIComponent(previewCode)}`}
              className="flex-1 w-full bg-white border-0 pointer-events-auto"
              style={{ height: 'calc(100vh - 50px)' }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          
          <div className="hidden md:flex fixed inset-0 z-50 flex flex-col bg-code-bg pointer-events-none">
            <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-line shrink-0 pointer-events-auto">
              <button
                onClick={() => setIsPreviewFullscreen(false)}
                className="flex items-center justify-center w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] hover:brightness-90 transition-all pointer-events-auto"
                aria-label="关闭"
              >
                <X className="w-2 h-2 text-[#820000] opacity-0 hover:opacity-100 transition-opacity" />
              </button>
              <span className="text-[11px] text-content-muted font-mono select-none pointer-events-auto">preview</span>
              <div className="w-3" />
            </div>
            <iframe
              src={`data:text/html;charset=utf-8,${encodeURIComponent(previewCode)}`}
              className="flex-1 w-full bg-white border-0 pointer-events-auto"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </>
      )}
    </div>
  )
}

// ── Mac-style header component for preview ───────────────────────────
function MacHeaderForPreview({ 
  code, 
  onClose 
}: { 
  code: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const zoomMin = 0.5
  const zoomMax = 2
  const zoomStep = 0.25

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-line">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-content-secondary" />
          <span className="text-[11px] text-content-muted font-mono">HTML Preview</span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded-md text-content-muted hover:text-red-500 hover:bg-surface-subtle transition-colors"
          aria-label="关闭预览"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden bg-white">
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} className="origin-top-left">
          <iframe
            src={`data:text/html;charset=utf-8,${encodeURIComponent(code)}`}
            className="w-full origin-top-left"
            style={{ width: '100%', minHeight: '600px' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-3 py-3 bg-code-header border-t border-line shrink-0">
        <button
          onClick={() => setZoom((z) => Math.max(zoomMin, z - zoomStep))}
          disabled={zoom <= zoomMin}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-surface border border-line-strong text-content-secondary hover:bg-surface-subtle disabled:opacity-30 disabled:cursor-default transition-colors"
          aria-label="缩小"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="text-[11px] text-content-secondary font-mono min-w-[3rem] text-center hover:text-content-primary transition-colors"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(zoomMax, z + zoomStep))}
          disabled={zoom >= zoomMax}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-surface border border-line-strong text-content-secondary hover:bg-surface-subtle disabled:opacity-30 disabled:cursor-default transition-colors"
          aria-label="放大"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </>
  )
}
