'use client'

/**
 * PlotAxes —— 居中坐标系十字轴（教科书风格）
 *
 * 独立于 function-plot 的原生轴线，专门画穿过数据原点 (0,0) 的两条粗线。
 * 浮在 chart 上层。
 *
 * Props 里只保留比例尺和颜色；宽高从 overlay 元素自己读，不用 props 传。
 */
import type { ScaleLinear } from 'd3-scale'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface PlotAxesProps {
  overlay: SVGSVGElement
  xScale: ScaleLinear<number, number>
  yScale: ScaleLinear<number, number>
  margin: { left: number; right: number; top: number; bottom: number }
  /** 轴线颜色，默认 #6b7280 */
  color?: string
  /** 轴线粗细，默认 1.5 */
  strokeWidth?: number
  /** 是否在原点画一个小十字标记，默认 true */
  showOrigin?: boolean
}

export function PlotAxes({
  overlay,
  xScale,
  yScale,
  margin,
  color = '#6b7280',
  strokeWidth = 1.5,
  showOrigin = true,
}: PlotAxesProps) {
  // 从 overlay SVG 自己读尺寸，不依赖外部传入
  const svgW = Number(overlay.getAttribute('width')) || 0
  const svgH = Number(overlay.getAttribute('height')) || 0

  // x=0 / y=0 在 SVG 内的像素位置（像素坐标）
  const zeroX = margin.left + xScale(0)
  const zeroY = margin.top + yScale(0)

  // 垂直轴（穿过 x=0，从 SVG 顶画到底）
  const yAxis = document.createElementNS(SVG_NS, 'line')
  yAxis.setAttribute('x1', String(zeroX))
  yAxis.setAttribute('y1', '0')
  yAxis.setAttribute('x2', String(zeroX))
  yAxis.setAttribute('y2', String(svgH))
  yAxis.setAttribute('stroke', color)
  yAxis.setAttribute('stroke-width', String(strokeWidth))
  yAxis.setAttribute('class', 'plot-axis plot-axis-y')
  overlay.appendChild(yAxis)

  // 水平轴（穿过 y=0，从 SVG 左画到右）
  const xAxis = document.createElementNS(SVG_NS, 'line')
  xAxis.setAttribute('x1', '0')
  xAxis.setAttribute('y1', String(zeroY))
  xAxis.setAttribute('x2', String(svgW))
  xAxis.setAttribute('y2', String(zeroY))
  xAxis.setAttribute('stroke', color)
  xAxis.setAttribute('stroke-width', String(strokeWidth))
  xAxis.setAttribute('class', 'plot-axis plot-axis-x')
  overlay.appendChild(xAxis)

  // 原点小十字
  if (showOrigin) {
    const crossSize = 4
    const cross = document.createElementNS(SVG_NS, 'path')
    cross.setAttribute(
      'd',
      `M${zeroX - crossSize},${zeroY} h${crossSize * 2}` +
      `M${zeroX},${zeroY - crossSize} v${crossSize * 2}`,
    )
    cross.setAttribute('stroke', color)
    cross.setAttribute('stroke-width', String(strokeWidth))
    cross.setAttribute('class', 'plot-axis-origin')
    overlay.appendChild(cross)
  }
}
