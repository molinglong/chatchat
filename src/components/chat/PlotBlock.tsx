'use client'

import {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, Maximize2, X, Minus, Plus, Copy, Check, Download } from 'lucide-react'
import {
  parsePlotBlock,
  PlotOptions,
  PlotParseError,
} from '@/lib/plot/parser'
import { PLOT_THEMES, getActiveTheme, PlotTheme } from '@/lib/plot/theme-tokens'
import { PlotAxes } from './PlotAxes'

interface PlotBlockProps {
  code: string
  className?: string
}

// ── 小工具:把 SVG 转成 PNG 下载 ──────────────────────────────────────
async function downloadSVGAsPNG(svgEl: SVGSVGElement, filename: string) {
  // 克隆一份干净 SVG 出来,加显式 xmlns,否则外部渲染器认不出来
  const cloned = svgEl.cloneNode(true) as SVGSVGElement
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  // 强制设置一个白底,因为 SVG 自带背景可能在暗模式下不显示
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bgRect.setAttribute('width', '100%')
  bgRect.setAttribute('height', '100%')
  bgRect.setAttribute('fill', '#ffffff')
  cloned.insertBefore(bgRect, cloned.firstChild)

  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(cloned)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  return new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2 // 2x 输出更清晰
      canvas.width = svgEl.clientWidth * scale
      canvas.height = svgEl.clientHeight * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas 不可用'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => {
        if (!b) {
          reject(new Error('toBlob 失败'))
          return
        }
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        resolve()
      }, 'image/png')
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

// ── macOS-style header ──────────────────────────────────────────────
function MacHeader({
  title,
  onExpand,
  code,
  onDownload,
}: {
  title?: string
  onExpand: () => void
  code: string
  onDownload: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 忽略
    }
  }, [code])

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-code-header border-b border-line">
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] border border-[#e0443e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e] border border-[#dea123]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840] border border-[#1eaa33]" />
      </div>
      <span className="text-[11px] text-content-muted font-mono select-none truncate">
        {title || 'plot'}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={copyCode}
          title={copied ? '已复制' : '复制源码'}
          aria-label={copied ? '已复制' : '复制源码'}
          className="flex items-center justify-center w-6 h-6 rounded text-content-muted hover:text-content-primary hover:bg-surface-subtle/60 cursor-pointer active:scale-95 transition-all"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
        <button
          onClick={onDownload}
          title="下载为 PNG"
          aria-label="下载为 PNG"
          className="flex items-center justify-center w-6 h-6 rounded text-content-muted hover:text-content-primary hover:bg-surface-subtle/60 cursor-pointer active:scale-95 transition-all"
        >
          <Download className="w-3 h-3" />
        </button>
        <button
          onClick={onExpand}
          title="全屏查看"
          aria-label="全屏查看"
          className="flex items-center justify-center w-6 h-6 rounded text-content-muted hover:text-content-primary hover:bg-surface-subtle/60 cursor-pointer active:scale-95 transition-all"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ── Fullscreen modal ────────────────────────────────────────────────
function FullscreenModal({
  plotOptions,
  theme,
  onClose,
}: {
  plotOptions: PlotOptions
  theme: PlotTheme
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1.4)
  const zoomMin = 0.5
  const zoomMax = 4
  const zoomStep = 0.25

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(z + zoomStep, zoomMax)),
    []
  )
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(z - zoomStep, zoomMin)),
    []
  )
  const resetZoom = useCallback(() => setZoom(1.4), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => Math.max(zoomMin, Math.min(zoomMax, z - e.deltaY * 0.005)))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-code-bg">
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

      <div className="flex-1 flex items-center justify-center overflow-auto p-8">
        <div
          className="transition-transform duration-150 ease-out origin-center"
          style={{ transform: `scale(${zoom})` }}
        >
          <PlotCanvas plotOptions={plotOptions} theme={theme} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 py-3 bg-code-header border-t border-line shrink-0">
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

// ── Canvas: 真正调 function-plot + 叠加标注点 ────────────────────────

/**
 * 把任意 domain 强制改成以 0 为中心对称。
 * 比如 [-6, 4] → [-6, 6]，[2, 5] → [-5, 5]，[0, 5] → [-5, 5]。
 * 这样 (0,0) 才能落在画布视觉中心，符合教科书坐标轴画法。
 */
function symmetricDomain([lo, hi]: [number, number]): [number, number] {
  const r = Math.max(Math.abs(lo), Math.abs(hi))
  return [-r, r]
}

function PlotCanvas({
  plotOptions,
  theme,
}: {
  plotOptions: PlotOptions
  theme: PlotTheme
}) {
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const target = innerRef.current

    ;(async () => {
      try {
        const mod = await import('function-plot')
        const functionPlot = mod.default

        if (!innerRef.current || cancelled) return

        const seriesColors = theme.seriesColors
        const data: Array<Record<string, unknown>> = plotOptions.data.map((s, i) => {
          const item: Record<string, unknown> = {
            fn: s.fn,
            graphType: s.graphType,
            color: s.color || seriesColors[i % seriesColors.length],
          }
          if (s.range) item.range = s.range
          return item
        })

        // function-plot 的 d.ts 期望 FunctionPlotOptions;此处放宽为 any
        const fpOptions: Record<string, unknown> = {
          target,
          width: 720,           // 加宽,从 600 提到 720 看起来更舒展
          height: 420,          // 比例 ~ 1.7
          data,
          grid: plotOptions.grid,
          disableZoom: !plotOptions.zoom,
          xAxis: { domain: symmetricDomain(plotOptions.xAxis?.domain ?? [-6, 6]) },
          yAxis: { domain: symmetricDomain(plotOptions.yAxis?.domain ?? [-4, 4]) },
          fontFamily: 'inherit',
        }
        if (plotOptions.title) fpOptions.title = plotOptions.title

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chart = functionPlot(fpOptions as any) as any

        // 等 chart 渲染完毕,叠加标注点
        requestAnimationFrame(() => {
          if (!innerRef.current || cancelled) return

          const xScale = chart.meta?.xScale
          const yScale = chart.meta?.yScale
          const margin = chart.meta?.margin ?? { left: 40, right: 20, top: 20, bottom: 20 }
          if (!xScale || !yScale) return

          // 在 innerRef 内追加 overlay SVG,覆盖在整个 chart 上
          let overlay = innerRef.current.querySelector('.mark-overlay') as SVGSVGElement | null
          const chartW = chart.meta.width + margin.left + margin.right
          const chartH = chart.meta.height + margin.top + margin.bottom
          if (!overlay) {
            overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            overlay.setAttribute('class', 'mark-overlay')
            // 写死 chart 全尺寸，绕开 CSS max-width:100% 对百分比宽度的约束
            overlay.setAttribute('width', String(chartW))
            overlay.setAttribute('height', String(chartH))
            overlay.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;overflow:visible;`
            innerRef.current.style.position = 'relative'
            innerRef.current.appendChild(overlay)
          } else {
            overlay.innerHTML = ''
          }

          // ── 画居中的坐标系十字轴（独立组件）─────────────────────
          // overlay 有显式 width/height，直接拿来算坐标系位置
          PlotAxes({
            overlay: overlay!,
            xScale,
            yScale,
            margin,
            color: theme.markColor ?? '#6b7280',
          })
          })

          const xDomain = symmetricDomain(plotOptions.xAxis?.domain ?? [-6, 6])
          const xMid = (xDomain[0] + xDomain[1]) / 2
          const SVG_NS = 'http://www.w3.org/2000/svg'

          for (const mark of plotOptions.marks) {
            const cx = margin.left + xScale(mark.x)
            const cy = margin.top + yScale(mark.y)

            // label 文本:"顶点 (π/2, 1)" 风格
            const yStr = Number.isInteger(mark.y) ? String(mark.y) : mark.y.toFixed(2)
            const xStr = Number.isInteger(mark.x) ? String(mark.x) : formatNumber(mark.x)
            const labelText = mark.label
              ? `${mark.label} (${xStr}, ${yStr})`
              : `(${xStr}, ${yStr})`

            // 估算药丸宽度 —— 不用 getBBox 避免布局抖动
            const approxCharW = 6.5
            const padX = 8
            const pillW = labelText.length * approxCharW + padX * 2
            const pillH = 22

            // 决定药丸摆在点的左 / 右,避免出界
            const onRight = mark.x <= xMid
            const labelX = onRight ? cx + 9 : cx - 9 - pillW
            const labelY = cy - pillH / 2

            const g = document.createElementNS(SVG_NS, 'g')
            g.setAttribute('class', 'plot-mark')

            // 药丸背景
            const rect = document.createElementNS(SVG_NS, 'rect')
            rect.setAttribute('x', String(labelX))
            rect.setAttribute('y', String(labelY))
            rect.setAttribute('width', String(pillW))
            rect.setAttribute('height', String(pillH))
            rect.setAttribute('rx', String(pillH / 2))
            rect.setAttribute('ry', String(pillH / 2))
            rect.setAttribute('fill', theme.markPillBg)
            rect.setAttribute('stroke', theme.markPillBorder)
            rect.setAttribute('stroke-width', '1')
            rect.setAttribute('class', 'plot-mark-pill')
            g.appendChild(rect)

            // 药丸里的红点
            const dotInPill = document.createElementNS(SVG_NS, 'circle')
            dotInPill.setAttribute('cx', String(labelX + padX))
            dotInPill.setAttribute('cy', String(labelY + pillH / 2))
            dotInPill.setAttribute('r', '3')
            dotInPill.setAttribute('fill', theme.markColor)
            g.appendChild(dotInPill)

            // 药丸文字
            const text = document.createElementNS(SVG_NS, 'text')
            text.setAttribute('x', String(labelX + padX + 8))
            text.setAttribute('y', String(labelY + pillH / 2 + 4))
            text.setAttribute('fill', theme.markColor)
            text.setAttribute('font-size', '11')
            text.setAttribute('font-weight', '600')
            text.setAttribute('font-family', 'inherit')
            text.setAttribute('dominant-baseline', 'middle')
            text.textContent = labelText
            g.appendChild(text)

            // 从药丸一侧拉一条虚线指向数据点(横向)
            const lineStartX = onRight ? labelX : labelX + pillW
            const lineEndX = onRight ? cx : cx
            const line = document.createElementNS(SVG_NS, 'line')
            line.setAttribute('x1', String(lineStartX))
            line.setAttribute('x2', String(lineEndX))
            line.setAttribute('y1', String(cy))
            line.setAttribute('y2', String(cy))
            line.setAttribute('stroke', theme.markColor)
            line.setAttribute('stroke-width', '1')
            line.setAttribute('stroke-dasharray', '2 2')
            line.setAttribute('opacity', '0.5')
            g.appendChild(line)

            // 数据点本身的小红圆(呼吸动画)
            const dot = document.createElementNS(SVG_NS, 'circle')
            dot.setAttribute('cx', String(cx))
            dot.setAttribute('cy', String(cy))
            dot.setAttribute('r', '5')
            dot.setAttribute('fill', theme.markColor)
            dot.setAttribute('stroke', theme.markPillBg)
            dot.setAttribute('stroke-width', '2')
            dot.setAttribute('class', 'dot-pulse')
            g.appendChild(dot)

            overlay!.appendChild(g)
          }
      } catch (err) {
        console.warn('[PlotBlock] function-plot 渲染失败:', err)
      }
    })()

    return () => {
      cancelled = true
      // function-plot 会渲染 SVG,挂在 target 下,我们清理时把它清掉即可
      try {
        while (target.firstChild) target.removeChild(target.firstChild)
      } catch {
        // ignore
      }
    }
  }, [plotOptions, theme])

  return (
    <div
      ref={innerRef}
      className="plot-canvas relative inline-block"
      style={{ minWidth: 360 }}
    />
  )
}

// 显示数学表达式 — 函数-plot 内部用的是数字,我们从原 code 里再提取一次
function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  if (Math.abs(n - Math.PI) < 1e-4) return 'π'
  if (Math.abs(n - Math.PI / 2) < 1e-4) return 'π/2'
  if (Math.abs(n + Math.PI / 2) < 1e-4) return '-π/2'
  if (Math.abs(n - 2 * Math.PI) < 1e-4) return '2π'
  if (Math.abs(n + 2 * Math.PI) < 1e-4) return '-2π'
  if (Math.abs(n - Math.E) < 1e-4) return 'e'
  return n.toFixed(2)
}

// ── Main component ──────────────────────────────────────────────────
export function PlotBlock({ code, className }: PlotBlockProps) {
  const [isDark, setIsDark] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  const theme = useMemo(
    () => (isDark ? PLOT_THEMES.dark : PLOT_THEMES.light),
    [isDark]
  )

  // 解析代码 - 用 useMemo 保证只在 code 变化时重算
  const parsed = useMemo<{
    options: PlotOptions | null
    error: string | null
  }>(() => {
    try {
      return { options: parsePlotBlock(code), error: null }
    } catch (err) {
      const msg =
        err instanceof PlotParseError
          ? err.message
          : err instanceof Error
          ? err.message
          : '未知解析错误'
      return { options: null, error: msg }
    }
  }, [code])

  const handleDownload = useCallback(() => {
    // 找到当前 plot 的 SVG
    const svg = document.querySelector('.plot-canvas svg') as SVGSVGElement | null
    if (!svg) return
    downloadSVGAsPNG(svg, `plot-${Date.now()}.png`).catch((e) => {
      console.warn('[PlotBlock] 下载失败:', e)
    })
  }, [])

  if (!parsed.options) {
    return (
      <div className={cn(
        'my-3 rounded-lg overflow-hidden border border-line plot-block-card',
        className
      )}>
        <MacHeader
          title="plot"
          onExpand={() => {}}
          code={code}
          onDownload={handleDownload}
        />
        <div className="bg-code-bg p-4">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">Plot 语法错误</span>
          </div>
          {parsed.error && (
            <p className="mt-2 text-xs text-content-secondary break-words">{parsed.error}</p>
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
      <div className={cn(
        'my-3 rounded-lg overflow-hidden border border-line plot-block-card',
        className
      )}>
        <MacHeader
          title={parsed.options.title || `plot · ${parsed.options.data.length} 曲线`}
          onExpand={() => setFullscreen(true)}
          code={code}
          onDownload={handleDownload}
        />
        <div className="bg-code-bg p-3 flex justify-center">
          <PlotCanvas plotOptions={parsed.options} theme={theme} />
        </div>
      </div>

      {fullscreen && (
        <FullscreenModal
          plotOptions={parsed.options}
          theme={theme}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  )
}

// 保留这个 export 备用,避免有人想直接拿到主题
export { getActiveTheme }
