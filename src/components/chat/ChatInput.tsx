'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent, ChangeEvent } from 'react'
import { Send, Square, X, Plus, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileUpload, deleteUploadedFile, type Attachment } from './FileUpload'
import { ModelSelector } from './ModelSelector'
import type { ModelDefinition } from '@/lib/ai/types'

export interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void
  onStop: () => void
  isLoading: boolean
  className?: string
  models: ModelDefinition[]
  selectedModel: string
  onModelChange: (modelId: string) => void
  deepThink: boolean
  onDeepThinkChange: (enabled: boolean) => void
  // 对比模式
  compareMode?: boolean
  compareModeAvailable?: boolean
  onCompareModeChange?: (enabled: boolean) => void
  compareModels?: string[]
  onCompareModelsChange?: (models: string[]) => void
}

export function ChatInput({
  onSend,
  onStop,
  isLoading,
  className,
  models,
  selectedModel,
  onModelChange,
  deepThink,
  onDeepThinkChange,
  compareMode = false,
  compareModeAvailable = false,
  onCompareModeChange,
  compareModels,
  onCompareModelsChange,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [input, adjustHeight])

  // Reset height when loading finishes
  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus()
    }
  }, [isLoading])

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = input.trim()
    if ((!trimmed && attachments.length === 0) || isLoading) return

    // 图片附件需要视觉模型:拦截不支持视觉的模型,给出明确指引
    if (attachments.some((a) => a.type.startsWith('image/'))) {
      const visionModels = models.filter((m) => m.supportsVision)
      if (compareMode && compareModels) {
        const blind = compareModels.filter(
          (id) => !models.find((m) => m.id === id)?.supportsVision
        )
        if (blind.length > 0) {
          const blindNames = blind
            .map((id) => models.find((m) => m.id === id)?.name ?? id)
            .join('、')
          setSendError(
            `对比模式中的 ${blindNames} 不支持图片识别` +
              (visionModels.length > 0
                ? `，请换成支持视觉的模型（如 ${visionModels.slice(0, 2).map((m) => m.name).join('、')}）`
                : '')
          )
          return
        }
      } else {
        const current = models.find((m) => m.id === selectedModel)
        if (current && !current.supportsVision) {
          setSendError(
            `当前模型 ${current.name} 不支持图片识别` +
              (visionModels.length > 0
                ? `，请切换到 ${visionModels.slice(0, 2).map((m) => m.name).join(' 或 ')} 后重试`
                : '，请先选择支持视觉的模型')
          )
          return
        }
      }
    }

    setSendError(null)
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setInput('')
    setAttachments([])
    // Reset height after send
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }, 0)
  }

  // 对比模式: 更换某个位置的模型(若与列表内其他位置重复则交换)
  function handleCompareModelChange(index: number, modelId: string) {
    if (!compareModels || !onCompareModelsChange) return
    const next = [...compareModels]
    const existingIdx = next.indexOf(modelId)
    if (existingIdx !== -1 && existingIdx !== index) {
      next[existingIdx] = next[index]
    }
    next[index] = modelId
    onCompareModelsChange(next)
  }

  function handleAddCompareModel() {
    if (!compareModels || !onCompareModelsChange || compareModels.length >= 3) return
    const next = models.find((m) => !compareModels.includes(m.id))
    if (next) onCompareModelsChange([...compareModels, next.id])
  }

  function handleRemoveCompareModel(index: number) {
    if (!compareModels || !onCompareModelsChange || compareModels.length <= 2) return
    onCompareModelsChange(compareModels.filter((_, i) => i !== index))
  }

  return (
    <div className={cn('relative z-20 px-3 pb-2 pt-1', className)}>
      <div className="max-w-2xl mx-auto">
        <div
          className={cn(
            'relative flex flex-col rounded-xl border z-20',
            'border-line/60',
            'bg-surface-glass backdrop-blur-xl',
            'shadow-lg focus-within:border-line-strong',
            'transition-all'
          )}
        >
          {/* Attachments preview row */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              {attachments.map((att, idx) => (
                <div
                  key={att.url + idx}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg border',
                    'border-line bg-surface-muted',
                    'px-2 py-1.5 max-w-[200px]'
                  )}
                >
                  {att.type.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={att.url} alt={att.name} className="w-5 h-5 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded bg-surface-subtle flex items-center justify-center shrink-0 text-[8px] text-content-secondary">
                      {att.type.split('/')[1]?.toUpperCase().slice(0, 3) || 'FILE'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-content-primary truncate">{att.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      const removed = attachments[idx]
                      setAttachments((prev) => prev.filter((_, i) => i !== idx))
                      // 移除未发送的附件时同步删除服务端文件
                      if (removed) deleteUploadedFile(removed.url)
                    }}
                    className="shrink-0 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 transition-opacity"
                    aria-label="移除"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 发送前校验错误提示 */}
          {sendError && (
            <div className="flex items-start gap-1.5 px-4 pt-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-500 leading-relaxed flex-1 min-w-0">{sendError}</p>
              <button
                onClick={() => setSendError(null)}
                className="shrink-0 p-0.5 rounded text-content-muted hover:text-content-primary transition-colors"
                aria-label="关闭提示"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Textarea */}
          <div className="px-4 pt-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              disabled={isLoading}
              rows={1}
              className={cn(
                'w-full resize-none bg-transparent text-sm',
                'text-content-primary',
                'placeholder:text-content-muted',
                'focus:outline-none disabled:opacity-50',
                'min-h-[24px] max-h-[200px]'
              )}
            />
          </div>

          {/* 对比模式: 多模型选择行(移动端隐藏) */}
          {compareMode && compareModels && onCompareModelsChange && (
            <div className="hidden md:flex items-center justify-end gap-1 px-3 pt-1.5">
              {compareModels.map((modelId, index) => (
                <div key={modelId} className="flex items-center gap-0.5">
                  <ModelSelector
                    models={models}
                    selectedModel={modelId}
                    onModelChange={(id) => handleCompareModelChange(index, id)}
                    compact
                  />
                  {compareModels.length > 2 && (
                    <button
                      onClick={() => handleRemoveCompareModel(index)}
                      className="shrink-0 p-1 rounded-md text-content-muted hover:text-red-500 hover:bg-surface-subtle transition-colors"
                      aria-label="移除模型"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
              {compareModels.length < 3 && (
                <button
                  onClick={handleAddCompareModel}
                  className="flex items-center gap-0.5 h-7 px-2 rounded-full text-[11px] font-medium
                    border border-dashed border-line text-content-secondary
                    hover:bg-surface-subtle transition-colors shrink-0"
                  title="添加对比模型"
                  aria-label="添加对比模型"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Bottom controls row */}
          <div className="flex items-center justify-between px-3 pb-2 pt-1.5">
            {/* Left: attachment + deep think toggle */}
            <div className="flex items-center gap-1">
              <FileUpload
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                disabled={isLoading}
                hideAttachmentsPreview
              />
              <button
                onClick={() => onDeepThinkChange(!deepThink)}
                className={cn(
                  'h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors',
                  deepThink
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-surface-muted hover:bg-surface-subtle text-content-secondary'
                )}
                title="深度思考"
                aria-label="深度思考"
                aria-pressed={deepThink}
              >
                深度思考
              </button>
              {compareModeAvailable && onCompareModeChange && (
                <button
                  onClick={() => onCompareModeChange(!compareMode)}
                  disabled={isLoading}
                  className={cn(
                    'hidden md:inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors',
                    compareMode
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-surface-muted hover:bg-surface-subtle text-content-secondary',
                    isLoading && 'opacity-50 cursor-not-allowed'
                  )}
                  title="对比模式"
                  aria-label="对比模式"
                  aria-pressed={compareMode}
                >
                  对比
                </button>
              )}
            </div>

            {/* Right: model selector + send button */}
            <div className="flex items-center gap-1">
              {!compareMode && (
                <ModelSelector
                  models={models}
                  selectedModel={selectedModel}
                  onModelChange={onModelChange}
                  compact
                />
              )}
              {isLoading ? (
                <button
                  onClick={onStop}
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-full transition-colors shrink-0',
                    'bg-accent text-accent-foreground hover:bg-accent-hover'
                  )}
                  aria-label="停止生成"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && attachments.length === 0}
                  className={cn(
                    'h-7 w-7 flex items-center justify-center rounded-full transition-colors shrink-0',
                    (input.trim() || attachments.length > 0)
                      ? 'bg-accent text-accent-foreground hover:bg-accent-hover'
                      : 'bg-surface-muted text-content-muted cursor-not-allowed'
                  )}
                  aria-label="发送消息"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}