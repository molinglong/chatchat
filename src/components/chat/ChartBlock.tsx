'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartBlockProps {
  code: string
  className?: string
}

interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'area'
  data: Record<string, string | number>[]
  xKey?: string
  yKeys?: string[]
  title?: string
  colors?: string[]
}

interface ChartJsDataset {
  label?: string
  data: number[]
}

interface ChartJsFormat {
  type: string
  data: {
    labels: string[]
    datasets: ChartJsDataset[]
  }
  title?: string
}

const DEFAULT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#ef4444', '#84cc16',
]

// ── macOS-style header ──────────────────────────────────────────────
function MacHeader({ title }: { title?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-line">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] border border-[#e0443e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e] border border-[#dea123]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840] border border-[#1eaa33]" />
      </div>
      <span className="text-[11px] text-content-muted font-mono select-none">
        {title || 'chart'}
      </span>
      <div className="w-3" />
    </div>
  )
}

// ── Format conversion ───────────────────────────────────────────────
function convertChartJsToRecharts(raw: ChartJsFormat): ChartConfig {
  const { labels, datasets } = raw.data
  const xKey = 'name'

  const data = labels.map((label, i) => {
    const row: Record<string, string | number> = { [xKey]: label }
    for (const ds of datasets) {
      const key = ds.label || 'value'
      row[key] = ds.data[i] ?? 0
    }
    return row
  })

  const yKeys = datasets.map((ds) => ds.label || 'value')

  return {
    type: raw.type as ChartConfig['type'],
    data,
    xKey,
    yKeys,
    title: raw.title,
  }
}

function parseChartConfig(code: string): ChartConfig | null {
  try {
    const raw = JSON.parse(code)

    if (!raw.type || !raw.data) return null

    if (Array.isArray(raw.data)) {
      return raw as ChartConfig
    }

    if (raw.data.labels && raw.data.datasets && Array.isArray(raw.data.labels)) {
      return convertChartJsToRecharts(raw as ChartJsFormat)
    }

    return null
  } catch {
    return null
  }
}

// ── Main component ──────────────────────────────────────────────────
export function ChartBlock({ code, className }: ChartBlockProps) {
  const config = useMemo(() => parseChartConfig(code), [code])
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // ── Error state ──────────────────────────────────────────────────
  if (!config) {
    return (
      <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
        <MacHeader title="chart" />
        <div className="bg-code-bg p-4">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">图表 JSON 格式错误</span>
          </div>
          <pre className="mt-2 text-xs text-content-secondary whitespace-pre-wrap break-words overflow-x-auto">{code}</pre>
        </div>
      </div>
    )
  }

  const colors = config.colors || DEFAULT_COLORS
  const yKeys = config.yKeys || Object.keys(config.data[0] || {}).filter(
    (k) => k !== config.xKey && typeof config.data[0]?.[k] === 'number'
  )

  // ── Theme-aware recharts props ────────────────────────────────────
  const gridStroke = isDark ? '#39393c' : '#e3e3e6'
  const axisStroke = isDark ? '#70707a' : '#98989d'
  const tooltipBg = isDark ? '#2c2c2e' : '#ffffff'
  const tooltipBorder = isDark ? '#4a4a4e' : '#c9c9ce'
  const legendColor = isDark ? '#a0a0a8' : '#6e6e73'
  const chartMargin = { top: 10, right: 20, left: 0, bottom: 5 }

  const renderChart = () => {
    switch (config.type) {
      case 'line':
        return (
          <LineChart data={config.data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 11 }} stroke={axisStroke} />
            <YAxis tick={{ fontSize: 11 }} stroke={axisStroke} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, borderColor: tooltipBorder }} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: legendColor }} />}
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        )
      case 'bar':
        return (
          <BarChart data={config.data} margin={chartMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 11 }} stroke={axisStroke} />
            <YAxis tick={{ fontSize: 11 }} stroke={axisStroke} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, borderColor: tooltipBorder }} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: legendColor }} />}
            {yKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={config.data}
              dataKey={yKeys[0] || 'value'}
              nameKey={config.xKey || 'name'}
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }) =>
                `${name} ${((percent || 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {config.data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, borderColor: tooltipBorder }} />
          </PieChart>
        )
      case 'area':
        return (
          <AreaChart data={config.data} margin={chartMargin}>
            <defs>
              {yKeys.map((key, i) => (
                <linearGradient key={key} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey={config.xKey} tick={{ fontSize: 11 }} stroke={axisStroke} />
            <YAxis tick={{ fontSize: 11 }} stroke={axisStroke} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, background: tooltipBg, borderColor: tooltipBorder }} />
            {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: legendColor }} />}
            {yKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[i % colors.length]}
                strokeWidth={2}
                fill={`url(#gradient-${i})`}
              />
            ))}
          </AreaChart>
        )
      default:
        return null
    }
  }

  // ── Success state ─────────────────────────────────────────────────
  return (
    <div className={cn('my-3 rounded-lg overflow-hidden border border-line', className)}>
      <MacHeader title={config.title || 'chart'} />
      <div className="bg-code-bg p-4">
        <div className="w-full max-w-2xl mx-auto">
          <ResponsiveContainer width="100%" height={300}>
            {renderChart() as React.ReactElement}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}