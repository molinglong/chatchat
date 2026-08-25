'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { ModelDefinition } from '@/lib/ai/types'

export const PROVIDER_DOT: Record<string, string> = {
  openai: 'bg-emerald-500',
  anthropic: 'bg-orange-500',
  deepseek: 'bg-blue-500',
  qianwen: 'bg-purple-500',
  wenxin: 'bg-red-500',
  google: 'bg-sky-500',
  mistral: 'bg-amber-500',
  xai: 'bg-slate-600',
  groq: 'bg-violet-500',
  moonshot: 'bg-indigo-500',
  zhipu: 'bg-cyan-500',
  doubao: 'bg-teal-500',
  yi: 'bg-fuchsia-500',
  custom: 'bg-gray-400', // 自定义模型
}

export const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  qianwen: '通义千问',
  wenxin: '文心一言',
  google: 'Google Gemini',
  mistral: 'Mistral',
  xai: 'xAI Grok',
  groq: 'Groq',
  moonshot: 'Moonshot (Kimi)',
  zhipu: '智谱 GLM',
  doubao: '字节豆包',
  yi: '零一万物 Yi',
  custom: '自定义', // 自定义模型
}

interface ModelSelectorProps {
  models: ModelDefinition[]
  selectedModel: string
  onModelChange: (modelId: string) => void
  className?: string
  compact?: boolean
}

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
  className,
  compact = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch configured providers on mount
  useEffect(() => {
    fetch('/api/keys')
      .then((r) => r.json())
      .then((keys: { provider: string }[]) => {
        setConfiguredProviders(new Set(keys.map((k) => k.provider)))
      })
      .catch(() => {})
  }, [])

  // Re-fetch when dropdown opens (in case settings changed)
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/keys')
      .then((r) => r.json())
      .then((keys: { provider: string }[]) => {
        setConfiguredProviders(new Set(keys.map((k) => k.provider)))
      })
      .catch(() => {})
  }, [isOpen])

  // Group models by provider (only configured ones; custom always shown)
  const grouped = models.reduce<Record<string, { providerName: string; models: ModelDefinition[] }>>(
    (acc, model) => {
      // Skip providers that aren't configured (custom always shown)
      if (!configuredProviders.has(model.provider) && model.provider !== 'custom') return acc

      if (!acc[model.provider]) {
        acc[model.provider] = {
          providerName: PROVIDER_NAMES[model.provider] || model.provider,
          models: [],
        }
      }
      acc[model.provider].models.push(model)
      return acc
    },
    {}
  )

  const selected = models.find((m) => m.id === selectedModel)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          compact
            ? 'flex items-center h-7 px-2.5 rounded-full text-[11px] font-medium bg-surface-muted hover:bg-surface-subtle text-content-secondary'
            : 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-surface-subtle text-content-secondary',
          'transition-colors'
        )}
      >
        <span className={cn(compact ? 'max-w-[100px]' : 'max-w-[160px]', 'truncate')}>{selected?.name || selectedModel}</span>
      </button>

      {isOpen && (
        <div
          className={cn(
            compact
              ? 'absolute bottom-full left-0 mb-1 z-50'
              : 'absolute top-full left-0 mt-1 z-50',
            'min-w-[180px] max-h-[260px] overflow-y-auto',
            'bg-surface-glass backdrop-blur-xl rounded-lg shadow-lg',
            'border border-line/60',
            'py-1'
          )}
        >
          {Object.keys(grouped).length > 0 ? (
            Object.entries(grouped).map(([providerId, { providerName, models: providerModels }]) => (
              <div key={providerId}>
                <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold text-content-muted uppercase tracking-wider">
                  <span className={cn('w-1.5 h-1.5 rounded-full', PROVIDER_DOT[providerId] ?? 'bg-content-muted')} />
                  {providerName}
                </div>
                {providerModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onModelChange(model.id)
                      setIsOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1 text-xs transition-colors',
                      'hover:bg-surface-subtle',
                      model.id === selectedModel
                        ? 'text-content-primary font-medium bg-accent-soft'
                        : 'text-content-secondary'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{model.name}</span>
                      <div className="flex items-center gap-1">
                        {model.supportsReasoning && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-accent-soft text-content-secondary">
                            Reasoning
                          </span>
                        )}
                        {model.supportsVision && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-surface-muted text-content-muted">
                            Vision
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-xs text-content-muted">
              请先在设置中配置 API Key
            </div>
          )}
        </div>
      )}
    </div>
  )
}
