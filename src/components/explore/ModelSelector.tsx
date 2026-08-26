'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelDefinition } from '@/lib/ai/types'

interface ModelSelectorProps {
  models: ModelDefinition[]
  value: string
  onChange: (modelId: string) => void
  compact?: boolean
}

export function ModelSelector({ models, value, onChange, compact = false }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const currentModel = models.find(m => m.id === value)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  if (compact) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 px-2 py-1 rounded text-content-secondary hover:text-content-primary hover:bg-surface-muted transition-colors"
        >
          <span className="text-xs font-medium max-w-[100px] truncate">
            {currentModel?.name || value}
          </span>
          <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 w-56 max-h-60 overflow-y-auto bg-surface border border-line/60 rounded-lg shadow-xl z-50 py-1">
            {models.map(model => (
              <button
                key={model.id}
                onClick={() => { onChange(model.id); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-subtle transition-colors',
                  model.id === value && 'bg-accent/10 text-accent'
                )}
              >
                <span className="flex-1 truncate">{model.name}</span>
                {model.id === value && <Check className="w-3 h-3 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-muted border border-line/60 hover:bg-surface-subtle transition-colors"
      >
        <span className="text-sm truncate">{currentModel?.name || value}</span>
        <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-surface border border-line/60 rounded-lg shadow-xl z-50 py-1">
          {models.map(model => (
            <button
              key={model.id}
              onClick={() => { onChange(model.id); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-surface-subtle transition-colors',
                model.id === value && 'bg-accent/10 text-accent'
              )}
            >
              <span className="flex-1 truncate">{model.name}</span>
              {model.id === value && <Check className="w-3 h-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
