'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, Maximize2, Minus, Plus, X } from 'lucide-react'

interface MermaidBlockProps {
  code: string
  className?: string
}

// Track last rendered code to avoid re-rendering the same content
let lastRenderedCode = ''

// ── macOS-style header bar ──────────────────────────────────────────
function MacHeader({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-line">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] border border-[#e0443e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e] border border-[#dea123]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840] border border-[#1eaa33]" />
      </div>
      <span className="text-[11px] text-content-muted font-mono select-none">mermaid</span>
      <button
        onClick={onExpand}
        className="flex items-center gap-1 text-[11px] text-content-muted hover:text-content-primary transition-colors"
        aria-label="全屏查看"
      >
        <Maximize2 className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Fullscreen modal ────────────────────────────────────────────────
function FullscreenModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(2.5)
  const zoomMin = 0.25
  const zoomMax = 4
  const zoomStep = 0.25

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + zoomStep, zoomMax)), [])
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - zoomStep, zoomMin)), [])
  const resetZoom = useCallback(() => setZoom(2.5), [])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Scroll wheel zoom (any scroll, no modifier key needed)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.max(zoomMin, Math.min(zoomMax, z - e.deltaY * 0.005)))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-code-bg"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-line shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="flex items-center justify-center w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] hover:brightness-90 transition-all"
          aria-label="关闭"
        >
          <X className="w-2 h-2 text-[#820000] opacity-0 hover:opacity-100 transition-opacity" />
        </button>
        <span className="text-[11px] text-content-muted font-mono select-none">mermaid</span>
        <div className="w-3" />
      </div>

      {/* SVG area */}
      <div
        className="flex-1 flex items-center justify-center overflow-auto p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="transition-transform duration-150 ease-out origin-center"
          style={{ transform: `scale(${zoom})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Bottom zoom bar */}
      <div
        className="flex items-center justify-center gap-3 py-3 bg-code-header border-t border-line shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={zoomOut}
          disabled={zoom <= zoomMin}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-surface border border-line-strong text-content-secondary hover:bg-surface-subtle disabled:opacity-30 disabled:cursor-default transition-colors"
          aria-label="缩小"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={resetZoom}
          className="text-[11px] text-content-secondary font-mono min-w-[3rem] text-center hover:text-content-primary transition-colors"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={zoom >= zoomMax}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-surface border border-line-strong text-content-secondary hover:bg-surface-subtle disabled:opacity-30 disabled:cursor-default transition-colors"
          aria-label="放大"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────
export function MermaidBlock({ code, className }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (code === lastRenderedCode) return

    const timer = setTimeout(async () => {
      if (cancelled) return
      if (code === lastRenderedCode) return

      try {
        setLoading(true)
        setError('')

        const mermaid = (await import('mermaid')).default

        const originalError = console.error
        console.error = (...args: unknown[]) => {
          const msg = String(args[0] || '')
          if (msg.includes('mermaid') || msg.includes('Syntax error')) return
          originalError.apply(console, args)
        }

        try {
          const isDark = document.documentElement.classList.contains('dark')

          mermaid.initialize({
            startOnLoad: false,
            theme: isDark ? 'dark' : 'neutral',
            securityLevel: 'loose',
            fontFamily: 'inherit',
            suppressErrorRendering: true,
          })

          const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const { svg: renderedSvg } = await mermaid.render(id, code)

          if (!cancelled) {
            lastRenderedCode = code
            setSvg(renderedSvg)
            setLoading(false)
          }
        } finally {
          console.error = originalError
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Mermaid 渲染失败')
          setLoading(false)
        }
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code])

  if (loading) {
    return (
      <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
        <MacHeader onExpand={() => {}} />
        <div className="flex items-center justify-center py-8 bg-code-bg">
          <span className="text-xs text-content-muted">渲染图表中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
        <MacHeader onExpand={() => {}} />
        <div className="bg-code-bg p-4">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">Mermaid 语法错误</span>
          </div>
          <pre className="mt-2 text-xs text-content-secondary whitespace-pre-wrap break-words overflow-x-auto">{code}</pre>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
        <MacHeader onExpand={() => setFullscreen(true)} />
        <div
          ref={containerRef}
          className="flex justify-center p-4 bg-code-bg overflow-x-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {fullscreen && (
        <FullscreenModal svg={svg} onClose={() => setFullscreen(false)} />
      )}
    </>
  )
}