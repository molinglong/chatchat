'use client'

import { useRef, useEffect, useState, KeyboardEvent, type ChangeEvent } from 'react'
import { cn } from '@/lib/utils'
import { Send, ArrowUp } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { ModelSelector } from './ModelSelector'
import type { UIMessage } from 'ai'
import type { ModelDefinition } from '@/lib/ai/types'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了，还在思考？'
  if (hour < 9) return '早上好，新的一天开始了'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 21) return '晚上好'
  return '夜深了，注意休息'
}

interface MessageListProps {
  messages: UIMessage[]
  isStreaming: boolean
  className?: string
  onRegenerate?: () => void
  onEditMessage?: (messageId: string, newText: string) => void
  models: ModelDefinition[]
  selectedModel: string
  onModelChange: (modelId: string) => void
  onSend: (text: string) => void
}

export function MessageList({ messages, isStreaming, className, onRegenerate, onEditMessage, models, selectedModel, onModelChange, onSend }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isMultiline, setIsMultiline] = useState(false)

  useEffect(() => {
    const messageList = containerRef.current
    const scrollContainer = messageList?.parentElement
    if (!scrollContainer) return

    const updateAutoScroll = () => {
      const distanceFromBottom =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
      shouldAutoScrollRef.current = distanceFromBottom <= 24
    }

    updateAutoScroll()
    scrollContainer.addEventListener('scroll', updateAutoScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', updateAutoScroll)
  }, [messages.length])

  // Follow new content only while the user is already at the bottom.
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Keep the latest streamed content visible without taking over manual scrolling.
  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => {
      if (shouldAutoScrollRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }, 300)
    return () => clearInterval(interval)
  }, [isStreaming])

  // 内容清空时回到单行态
  useEffect(() => {
    if (input === '' && isMultiline) {
      const ta = textareaRef.current
      if (ta) {
        ta.style.height = '56px'
        setIsMultiline(false)
      }
    }
  }, [input, isMultiline])

  function handleInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = input.trim()
    if (!text || isStreaming) return
    onSend(text)
    setInput('')
  }

  if (messages.length === 0) {
    return (
      <div className="w-full min-h-full flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl">
          {/* 引导文字：一行布局 */}
          <div className="text-center mb-8">
            <h2
              className="text-content-primary"
              style={{
                fontFamily: "'PingFang Ultralight', 'PingFang SC', -apple-system, BlinkMacSystemFont, sans-serif",
                fontWeight: 100,
                fontSize: '32px',
                lineHeight: 1.2,
                letterSpacing: '0.02em',
              }}
            >
              {getGreeting()}，今天能为你做些什么？
            </h2>
          </div>

          {/* 输入框：单行 flex / 多行自动扩展 + 按钮沉底 */}
          <div
            className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden"
            style={{
              position: 'relative',
              height: isMultiline ? undefined : '56px',
            }}
          >
            {/* 顶栏：单行时内联flex居中，多行时隐藏 */}
            <div
              className="flex items-center gap-2 px-3"
              style={{
                height: '56px',
                display: isMultiline ? 'none' : 'flex',
              }}
            >
              <ModelSelector
                models={models}
                selectedModel={selectedModel}
                onModelChange={onModelChange}
              />
              <div className="w-px h-7 bg-line shrink-0" />
              <textarea
                key="single"
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="输入问题..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-content-primary placeholder:text-content-muted
                  resize-none focus:outline-none border-0 m-0"
                style={{
                  height: '56px',
                  padding: '0',
                  lineHeight: '56px',
                  verticalAlign: 'middle',
                }}
                onInput={(e) => {
                  const target = e.currentTarget
                  target.style.height = 'auto'
                  target.style.height = `${target.scrollHeight}px`
                  setIsMultiline(target.scrollHeight > 58)
                }}
              />
              <button
                onClick={submit}
                disabled={!input.trim() || isStreaming}
                aria-label="发送"
                className={cn(
                  'shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-colors',
                  input.trim() && !isStreaming
                    ? 'bg-accent text-white hover:bg-accent/90'
                    : 'bg-surface-subtle text-content-muted cursor-not-allowed'
                )}
              >
                <ArrowUp className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* 多行态：textarea 自扩展 + 底部工具栏 */}
            <div
              className="flex flex-col"
              style={{ display: isMultiline ? 'flex' : 'none' }}
            >
              <textarea
                key="multi"
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="输入问题..."
                rows={1}
                className="block w-full bg-transparent text-sm text-content-primary placeholder:text-content-muted
                  resize-none focus:outline-none border-0 m-0 px-4 pt-4"
                style={{
                  minHeight: '36px',
                  paddingBottom: '64px',
                  lineHeight: '24px',
                }}
                onInput={(e) => {
                  const target = e.currentTarget
                  target.style.height = 'auto'
                  target.style.height = `${target.scrollHeight}px`
                  setIsMultiline(target.scrollHeight > 38)
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2.5">
                <ModelSelector
                  models={models}
                  selectedModel={selectedModel}
                  onModelChange={onModelChange}
                />
                <button
                  onClick={submit}
                  disabled={!input.trim() || isStreaming}
                  aria-label="发送"
                  className={cn(
                    'shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-colors',
                    input.trim() && !isStreaming
                      ? 'bg-accent text-white hover:bg-accent/90'
                      : 'bg-surface-subtle text-content-muted cursor-not-allowed'
                  )}
                >
                  <ArrowUp className="w-[18px] h-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Find the last assistant message index (computed once)
  let lastAssistantIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i
      break
    }
  }

  return (
    <div ref={containerRef} className={cn('w-full min-h-full overflow-x-hidden', className)}>
      <div className="max-w-2xl mx-auto overflow-x-hidden">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isStreaming}
            isLastAssistant={index === lastAssistantIndex}
            canRegenerate={!isStreaming && !!onRegenerate}
            onRegenerate={onRegenerate}
            canEdit={!isStreaming && !!onEditMessage}
            onEdit={onEditMessage}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
