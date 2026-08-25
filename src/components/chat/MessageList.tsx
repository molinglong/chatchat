'use client'

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { MessageBubble } from './MessageBubble'
import type { UIMessage } from 'ai'

interface MessageListProps {
  messages: UIMessage[]
  isStreaming: boolean
  className?: string
  onRegenerate?: () => void
  onEditMessage?: (messageId: string, newText: string) => void
}

export function MessageList({ messages, isStreaming, className, onRegenerate, onEditMessage }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

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

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <div className="max-w-2xl text-center space-y-1.5">
          <h2 className="text-lg font-semibold text-content-primary">
            开始新对话
          </h2>
          <p className="text-content-muted text-sm">
            选择模型，输入问题，开始对话。
          </p>
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
