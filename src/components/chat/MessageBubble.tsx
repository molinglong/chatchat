'use client'

import { useState, useCallback, useRef, useEffect, KeyboardEvent } from 'react'
import { Bot, Copy, Check, RotateCw, Pencil, X, ChevronDown, Brain, FileText } from 'lucide-react'
import { cn, splitReasoningTail } from '@/lib/utils'
import { useTypewriter } from '@/lib/useTypewriter'
import { MarkdownRenderer } from './MarkdownRenderer'
import type { UIMessage } from 'ai'
import type { Attachment } from '@/lib/attachment-types'

/** UIMessage 上挂载的附件扩展字段(历史加载与发送后注入) */
export type UIMessageWithAttachments = UIMessage & { attachments?: Attachment[] }

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface MessageBubbleProps {
  message: UIMessage
  isStreaming?: boolean
  isLastAssistant?: boolean
  canRegenerate?: boolean
  onRegenerate?: () => void
  canEdit?: boolean
  onEdit?: (messageId: string, newText: string) => void
}

export function MessageBubble({
  message,
  isStreaming,
  isLastAssistant,
  canRegenerate,
  onRegenerate,
  canEdit,
  onEdit,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [showReasoning, setShowReasoning] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Extract reasoning parts from message (for deep thinking / reasoning models)
  const reasoningParts = message.parts.filter((p) => p.type === 'reasoning')
  const reasoningText = reasoningParts.map((p) => p.text).join('')
  const lastReasoningPart = reasoningParts[reasoningParts.length - 1] as { state?: string } | undefined
  const isReasoningStreaming = isStreaming && isAssistant && lastReasoningPart?.state === 'streaming'

  // Debug: log message structure for developer inspection
  useEffect(() => {
    if (isAssistant && typeof window !== 'undefined') {
      console.log('[MessageBubble] Message parts:', {
        totalParts: message.parts.length,
        reasoningCount: reasoningParts.length,
        reasoningTextLength: reasoningText.length,
        textCount: message.parts.filter((p) => p.type === 'text').length,
        allTypes: Array.from(new Set(message.parts.map((p) => p.type))),
      })
    }
  }, [message.parts, reasoningText, isAssistant])

  // 附件 (仅用户消息有)
  const attachments = (message as UIMessageWithAttachments).attachments ?? []

  // Extract text from message parts
  const textParts = message.parts.filter((p) => p.type === 'text')
  const text = textParts.map((p) => p.text).join('')
  const lastPart = textParts[textParts.length - 1] as { state?: string } | undefined
  const isCurrentlyStreaming = isStreaming && isAssistant && lastPart?.state === 'streaming'
  const isWaitingForReasoning = isStreaming && isAssistant && !reasoningText && !text

  // 兜底:模型偶发把全部内容(含最终答案)都放进 <think> 标签,导致正文为空。
  // 此时从推理尾部拆出答案部分作为正文显示(流式期间不触发,避免误判)。
  const needsBodyFallback = !isStreaming && !text.trim() && reasoningText.trim() !== ''
  const bodySplit = needsBodyFallback ? splitReasoningTail(reasoningText) : null
  const bodyText = bodySplit ? bodySplit.tail : text
  const displayReasoningText = bodySplit ? bodySplit.head : reasoningText

  // 思考过程默认展开(深度思考用户需要一眼看到推理),用户可手动折叠
  // (不再自动折叠:流式结束后保持展开,避免两边对比时误以为没有思考)

  // Typewriter effect: only for live streaming, not for historical messages
  // Skip typewriter when message is already complete (streaming ended) to avoid
  // performance issues with long messages on page refresh
  const { displayText, isTyping } = useTypewriter(
    bodyText,
    Boolean(isAssistant && isCurrentlyStreaming) // Only enable during active stream
  )

  // Show cursor while AI is streaming OR typewriter is still catching up
  const showCursor = isCurrentlyStreaming || isTyping

  // Show actions only when message is fully rendered (not streaming, not typing, not reasoning)
  const showActions = isStreaming !== undefined && !isCurrentlyStreaming && !isTyping && !isReasoningStreaming && bodyText.length > 0

  // Auto-focus and select when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
      // Auto-resize to fit content
      const ta = textareaRef.current
      ta.style.height = 'auto'
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
    }
  }, [isEditing])

  // Reset edit value when entering edit mode
  const startEditing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditValue(text)
    setIsEditing(true)
  }, [text])

  const cancelEditing = useCallback(() => {
    setEditValue('')
    setIsEditing(false)
  }, [])

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== text && onEdit) {
      onEdit(message.id, trimmed)
    }
    setIsEditing(false)
  }, [editValue, text, onEdit, message.id])

  const handleEditKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    }
  }, [commitEdit, cancelEditing])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(bodyText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [bodyText])

  // Edit mode: inline textarea for user messages
  if (isUser && isEditing) {
    return (
      <div className="flex justify-end px-4 py-2">
        <div className="max-w-[80%] w-full">
          <div className="rounded-lg bg-accent rounded-br-sm overflow-hidden">
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value)
                // Auto-resize
                const ta = e.target
                ta.style.height = 'auto'
                ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
              }}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEdit}
              rows={1}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-accent-foreground outline-none px-3 py-1.5 min-h-[24px] max-h-[200px]"
            />
          </div>
          <div className="flex items-center justify-end gap-1 mt-1">
            <button
              onMouseDown={(e) => { e.preventDefault(); cancelEditing() }}
              className="p-1 rounded-md text-content-muted hover:text-red-500 hover:bg-surface-subtle transition-colors"
              title="取消"
              aria-label="取消"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); commitEdit() }}
              className="p-1 rounded-md text-content-muted hover:text-green-500 hover:bg-surface-subtle transition-colors"
              title="确认"
              aria-label="确认"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-message-id={message.id}
      className={cn('flex gap-2.5 px-4 py-2', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* Avatar - only for AI */}
      {!isUser && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-accent text-accent-foreground mt-0.5">
          <Bot className="w-3 h-3" />
        </div>
      )}

      {/* Message content */}
      <div className={cn('min-w-0 overflow-hidden', isUser ? 'max-w-[80%]' : 'flex-1 max-w-full')}>
        {isAssistant ? (
          <>
            {/* Reasoning / deep thinking section */}
            {displayReasoningText && (
              <div className="mb-2">
                <button
                  onClick={() => setShowReasoning(!showReasoning)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-content-secondary hover:opacity-80 transition-opacity"
                >
                  <Brain className="w-3 h-3" />
                  <span>思考过程</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', showReasoning ? '' : '-rotate-90')} />
                </button>
                {showReasoning && (
                  <div className="mt-1.5 pl-3 border-l-2 border-line-strong/60">
                    <p className="text-xs text-content-secondary whitespace-pre-wrap break-words leading-relaxed">
                      {displayReasoningText}
                      {isReasoningStreaming && (
                        <span className="inline-block w-1 h-3 ml-0.5 bg-accent animate-pulse align-middle" />
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* Main response */}
            {displayText ? (
              <div className="relative text-sm text-content-primary leading-relaxed">
                <MarkdownRenderer content={displayText} messageId={message.id} />
                {showCursor && (
                  <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-content-secondary animate-pulse align-middle" />
                )}
              </div>
            ) : isWaitingForReasoning ? (
              <div className="flex items-center gap-1.5 py-1">
                <Brain className="w-3 h-3 text-content-secondary animate-pulse" />
                <span className="text-xs text-content-muted">思考中...</span>
              </div>
            ) : isCurrentlyStreaming ? (
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-2 h-2 bg-content-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-content-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-content-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            {/* 附件展示:图片缩略图(点击看大图) / 文件卡片 */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                {attachments.map((att, idx) =>
                  att.type.startsWith('image/') ? (
                    <a
                      key={idx}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={att.name}
                      className="block overflow-hidden rounded-lg border border-line hover:opacity-90 transition-opacity"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.url}
                        alt={att.name}
                        className="max-h-40 max-w-[220px] object-contain bg-surface-muted"
                      />
                    </a>
                  ) : (
                    <a
                      key={idx}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={att.name}
                      className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-muted px-2 py-1.5 max-w-[180px] hover:bg-surface-subtle transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-content-secondary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-content-primary truncate">{att.name}</p>
                        <p className="text-[10px] text-content-muted">{formatSize(att.size)}</p>
                      </div>
                    </a>
                  )
                )}
              </div>
            )}
            <div className="rounded-lg bg-accent px-3 py-1.5 rounded-br-sm">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-accent-foreground">{text}</p>
            </div>
          </div>
        )}

        {/* Action bar */}
        {showActions && (
          <div className={cn('flex items-center gap-0.5 mt-1', isUser ? 'justify-end' : 'justify-start')}>
            <button
              onClick={handleCopy}
              className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors"
              title="复制"
              aria-label="复制"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {isAssistant && isLastAssistant && canRegenerate && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors"
                title="重新生成"
                aria-label="重新生成"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}
            {isUser && canEdit && onEdit && (
              <button
                onClick={startEditing}
                className="p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors"
                title="编辑"
                aria-label="编辑"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
