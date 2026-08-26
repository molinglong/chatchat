'use client'

import { useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { AlertCircle, MessageSquarePlus, RefreshCw, RotateCw, Settings as SettingsIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MessageList } from './MessageList'
import { PROVIDER_DOT } from './ModelSelector'
import { getErrorMessage } from '@/lib/chat-errors'
import type { ModelDefinition } from '@/lib/ai/types'
import type { Attachment } from './FileUpload'

export interface LaneApi {
  send: (text: string, attachments?: Attachment[]) => void
  stop: () => void
  regenerate: () => void
}

interface CompareLaneProps {
  modelId: string
  modelDef: ModelDefinition
  initialMessages: UIMessage[]
  conversationIdRef: React.MutableRefObject<string | null>
  groupIdRef: React.MutableRefObject<string>
  attachmentsRef: React.MutableRefObject<Attachment[] | undefined>
  styleOffset: number
  deepThink: boolean
  /** 联网搜索开关(由 ComparePanel 统一控制,每个泳道都带上) */
  webSearch: boolean
  onConvIdFromHeader: (newConvId: string, newConvTitle?: string | null) => void
  registerApi: (api: LaneApi | null) => void
  onLoadingChange: (isLoading: boolean) => void
  /** 请求与当前泳道模型单独继续聊天(由父级弹窗确认) */
  onRequestSolo?: (modelId: string) => void
}

export function CompareLane({
  modelId,
  modelDef,
  initialMessages,
  conversationIdRef,
  groupIdRef,
  attachmentsRef,
  styleOffset,
  deepThink,
  webSearch,
  onConvIdFromHeader,
  registerApi,
  onLoadingChange,
  onRequestSolo,
}: CompareLaneProps) {
  // Create transport with dynamic body getters so values are read at send time
  const transport = new DefaultChatTransport<UIMessage>({
    api: '/api/chat',
    body: {
      model: modelId,
      get conversationId() {
        return conversationIdRef.current
      },
      get groupId() {
        return groupIdRef.current
      },
      styleOffset,
      deepThink,
      webSearch,
      get attachments() {
        return attachmentsRef.current
      },
    },
    // 兜底: 若客户端预创建会话失败,以服务端返回头为准
    fetch: async (url, options) => {
      const response = await fetch(url, options)
      const newConvId = response.headers.get('X-Conversation-Id')
      const newConvTitle = response.headers.get('X-Conversation-Title')
      if (newConvId) {
        onConvIdFromHeader(newConvId, newConvTitle)
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
        // 仅拉取本模型最新的助手消息(含图片替换后的最终内容)
        const res = await fetch(
          `/api/conversations/${convId}/messages?limit=1&model=${encodeURIComponent(modelId)}`
        )
        if (!res.ok) return
        const data = await res.json()
        const latest = data.messages?.[0]
        if (!latest || latest.role !== 'assistant' || typeof latest.content !== 'string') return
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
        console.error('Failed to sync final message content:', err)
      }
    },
  })

  // 本泳道自己的待注入附件 ref(共享 ref 会被多泳道竞争,不能用于 UI 注入)
  const pendingAttachmentsRef = useRef<Attachment[] | undefined>(undefined)

  setMessagesRef.current = setMessages

  // 发送后把附件挂到最后一条用户消息上,保证当前会话中即时展示(与服务端落库一致)
  useEffect(() => {
    const atts = pendingAttachmentsRef.current
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
    pendingAttachmentsRef.current = undefined
  }, [messages, setMessages])

  const isLoading = status === 'submitted' || status === 'streaming'

  // 向父级注册/注销本泳道 API;卸载时重置加载状态避免父级卡在 loading
  useEffect(() => {
    registerApi({
      send: (text, attachments) => {
        // 传输用共享 ref(请求体 getter 读取),UI 注入用本泳道私有 ref
        attachmentsRef.current = attachments
        pendingAttachmentsRef.current = attachments
        sendMessage({ text })
      },
      stop,
      regenerate,
    })
    return () => {
      registerApi(null)
      onLoadingChange(false)
    }
  }, [sendMessage, stop, regenerate, registerApi, onLoadingChange, attachmentsRef])

  useEffect(() => {
    onLoadingChange(isLoading)
  }, [isLoading, onLoadingChange])

  const handleRegenerate = () => {
    clearError()
    regenerate()
  }

  const errorInfo = error ? getErrorMessage(error) : null

  return (
    <div className="flex flex-col min-w-0 h-full">
      {/* Lane header: model name + regenerate */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line/60 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              PROVIDER_DOT[modelDef.provider] ?? 'bg-content-muted'
            )}
          />
          <span className="text-xs font-medium text-content-primary truncate" title={modelDef.name}>
            {modelDef.name}
          </span>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={isLoading}
          className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="重新生成"
          aria-label="重新生成"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        {onRequestSolo && conversationIdRef.current && (
          <button
            onClick={() => onRequestSolo(modelId)}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-content-muted hover:text-accent hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="与这个模型单独继续聊天"
            aria-label="单独聊"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            单独聊
          </button>
        )}
      </div>

      {/* Lane error banner */}
      {error && errorInfo && (
        <div className="mx-2 mt-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 shrink-0">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium break-words">
                {errorInfo.message}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  onClick={() => {
                    clearError()
                    regenerate()
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
                    bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  重试
                </button>
                {errorInfo.type === 'api_key' && (
                  <Link
                    href="/chat/settings"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
                      bg-surface-muted text-content-secondary hover:bg-surface-subtle transition-colors"
                  >
                    <SettingsIcon className="w-3 h-3" />
                    前往设置
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lane messages (对比模式内禁用编辑用户消息) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <MessageList
          messages={messages}
          isStreaming={isLoading}
          className="min-h-full"
          onRegenerate={handleRegenerate}
        />
      </div>
    </div>
  )
}
