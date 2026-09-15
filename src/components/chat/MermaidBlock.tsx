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
// 缓存最近一次成功渲染的 SVG:同代码的第二个实例(如 MessageBubble 的离屏 HTML 镜像)
// 直接复用缓存,否则会因早退守卫而永久停留在 loading 状态
let lastRenderedSvg = ''

/** 校验 mermaid.render 返回值是否是真正的 SVG(避免把错误文本当成 SVG 渲染) */
function isValidSvg(svg: unknown): svg is string {
  return typeof svg === 'string' && /<svg[\s>]/i.test(svg)
}

// ── macOS-style header bar ──────────────────────────────────────────
function MacHeader({
  onExpand,
  disabled,
}: {
  onExpand: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-code-header border-b border-line">
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="w-2 h-2 rounded-full bg-[#ff5f57] border border-[#e0443e]" />
        <span className="w-2 h-2 rounded-full bg-[#febc2e] border border-[#dea123]" />
        <span className="w-2 h-2 rounded-full bg-[#28c840] border border-[#1eaa33]" />
      </div>
      <button
        onClick={onExpand}
        disabled={disabled}
        title={disabled ? '内容尚未就绪' : '全屏查看'}
        aria-label="全屏查看"
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded transition-colors',
          disabled
            ? 'opacity-30 cursor-not-allowed'
            : 'text-content-muted hover:text-content-primary hover:bg-surface-subtle/60 cursor-pointer active:scale-95'
        )}
      >
        <Maximize2 className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Fullscreen modal ────────────────────────────────────────────────
function FullscreenModal({
  svg,
  code,
  error,
  onClose,
}: {
  svg: string
  code: string
  error?: string
  onClose: () => void
}) {
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

  // 锁定 body 滚动,防止背景在 modal 打开时被滚动
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const hasValidSvg = isValidSvg(svg)

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-code-bg">
      {/* Top bar */}
      <div className="flex items-center px-3 py-1.5 bg-code-header border-b border-line shrink-0">
        <button
          onClick={onClose}
          title="关闭 (Esc)"
          className="flex items-center justify-center w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] hover:brightness-90 transition-all"
          aria-label="关闭"
        >
          <X className="w-2 h-2 text-[#820000] opacity-0 hover:opacity-100 transition-opacity" />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-8">
        {hasValidSvg ? (
          <div
            className="transition-transform duration-150 ease-out origin-center"
            style={{ transform: `scale(${zoom})` }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="max-w-4xl w-full">
            {error ? (
              <div className="flex items-center gap-2 text-red-500 dark:text-red-400 mb-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">Mermaid 语法错误</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400 mb-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium">无法渲染为图表,显示原始代码</span>
              </div>
            )}
            <pre className="text-xs text-content-secondary whitespace-pre-wrap break-words overflow-x-auto bg-surface-muted p-4 rounded-lg border border-line font-mono">
              {code}
            </pre>
          </div>
        )}
      </div>

      {/* Bottom zoom bar */}
      <div className="flex items-center justify-center gap-3 py-3 bg-code-header border-t border-line shrink-0">
        <button
          onClick={zoomOut}
          disabled={!hasValidSvg || zoom <= zoomMin}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-surface border border-line-strong text-content-secondary hover:bg-surface-subtle disabled:opacity-30 disabled:cursor-default transition-colors"
          aria-label="缩小"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={resetZoom}
          disabled={!hasValidSvg}
          className="text-[11px] text-content-secondary font-mono min-w-[3rem] text-center hover:text-content-primary transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={!hasValidSvg || zoom >= zoomMax}
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

    // 缓存命中(如离屏镜像实例):直接复用已渲染结果,无需等待/重复渲染
    if (code === lastRenderedCode && lastRenderedSvg) {
      setSvg(lastRenderedSvg)
      setError('')
      setLoading(false)
      return
    }

    const timer = setTimeout(async () => {
      if (cancelled) return
      // 等待期间其他实例已完成渲染 → 同样复用缓存,避免重复渲染与 loading 卡死
      if (code === lastRenderedCode && lastRenderedSvg) {
        setSvg(lastRenderedSvg)
        setError('')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')
        setSvg('')

        const mermaid = (await import('mermaid')).default

        // 收集 mermaid 内部的 console.error,渲染失败时给出更有用的提示
        const errorMessages: string[] = []
        const originalError = console.error
        console.error = (...args: unknown[]) => {
          const msg = args.map((a) => String(a || '')).join(' ')
          if (
            msg.toLowerCase().includes('mermaid') ||
            msg.includes('Syntax error') ||
            msg.includes('syntax')
          ) {
            errorMessages.push(msg)
            return
          }
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

          if (cancelled) return

          // 关键:必须是真正的 SVG 标签,否则视为渲染失败
          // (mermaid 在无法解析时会返回原始文本,需要识别这种情况)
          if (isValidSvg(renderedSvg)) {
            lastRenderedCode = code
            lastRenderedSvg = renderedSvg
            setSvg(renderedSvg)
            setError('')
          } else {
            const fallbackErr =
              errorMessages.length > 0
                ? errorMessages.join('; ').slice(0, 500)
                : '渲染结果不是有效的 SVG,可能缺少 diagram 类型声明(例如 timeline / flowchart / sequenceDiagram)'
            setError(fallbackErr)
          }
          setLoading(false)
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

  const hasValidSvg = isValidSvg(svg)

  // 任何已结束的状态(成功/失败)都可以进入全屏:
  // 成功 → 看大图;失败 → 看错误/代码
  const openFullscreen = useCallback(() => {
    if (!loading) setFullscreen(true)
  }, [loading])

  if (loading) {
    return (
      <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
        <MacHeader onExpand={openFullscreen} disabled />
        <div className="flex items-center justify-center py-8 bg-code-bg">
          <span className="text-xs text-content-muted">渲染图表中...</span>
        </div>
      </div>
    )
  }

  if (error || !hasValidSvg) {
    return (
      <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
        <MacHeader onExpand={openFullscreen} />
        <div className="bg-code-bg p-4">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">Mermaid 语法错误</span>
          </div>
          {error && (
            <p className="mt-2 text-xs text-content-secondary break-words">{error}</p>
          )}
          <pre className="mt-2 text-xs text-content-secondary whitespace-pre-wrap break-words overflow-x-auto">
            {code}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
        <MacHeader onExpand={openFullscreen} />
        <div
          ref={containerRef}
          className="flex justify-center p-4 bg-code-bg overflow-x-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {fullscreen && (
        <FullscreenModal
          svg={svg}
          code={code}
          error={error}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  )
}