/**
 * PlotBlock 的暗 / 亮色色板
 * 与项目 Tailwind 暗色 class 同步,所有色值集中在此避免散落。
 */

export interface PlotTheme {
  /** 坐标轴本身的颜色 (网格原色) */
  axisColor: string
  /** 坐标轴刻度文字的颜色 */
  axisLabelColor: string
  /** 网格线 */
  gridColor: string
  /** 原点 / 标签兜底文字 */
  textColor: string
  /** tip 提示框 */
  tipBackground: string
  tipColor: string
  /** 曲线系列色循环 */
  seriesColors: string[]
  /** 标注点(小圆点 + 标签)主题色 */
  markColor: string
  /** 标注点标签药丸的填充背景 */
  markPillBg: string
  /** 标注点标签药丸的边框 */
  markPillBorder: string
  /** 标题色 */
  titleColor: string
  /** canvas 背景(暗模式下稍稍提亮) */
  canvasBg: string
}

export const PLOT_THEMES: Record<'light' | 'dark', PlotTheme> = {
  light: {
    axisColor: '#39393c',
    axisLabelColor: '#6e6e73',
    gridColor: '#eaeaec',
    textColor: '#1f1f23',
    tipBackground: '#1f1f23',
    tipColor: '#ffffff',
    // 用更具品牌感的 indigo / pink 组合,避免一身 blue
    seriesColors: [
      '#4f46e5',
      '#db2777',
      '#ea580c',
      '#059669',
      '#0891b2',
      '#7c3aed',
      '#dc2626',
      '#65a30d',
    ],
    markColor: '#dc2626',
    markPillBg: '#ffffff',
    markPillBorder: '#fecaca',
    titleColor: '#1f1f23',
    canvasBg: '#ffffff',
  },
  dark: {
    axisColor: '#c8c8d0',
    axisLabelColor: '#98989d',
    gridColor: '#3a3a3f',
    textColor: '#e8e8ed',
    tipBackground: '#2c2c2e',
    tipColor: '#f5f5f7',
    seriesColors: [
      '#a5b4fc',
      '#f9a8d4',
      '#fdba74',
      '#6ee7b7',
      '#67e8f9',
      '#c4b5fd',
      '#fca5a5',
      '#bef264',
    ],
    markColor: '#ff7a7a',
    markPillBg: '#1f1f23',
    markPillBorder: '#5c2a2a',
    titleColor: '#f5f5f7',
    canvasBg: 'transparent',
  },
}

/** 读取当前文档的暗色状态(由 Tailwind dark: 加在 <html> 上) */
export function getActiveTheme(): PlotTheme {
  if (typeof document === 'undefined') return PLOT_THEMES.light
  return document.documentElement.classList.contains('dark')
    ? PLOT_THEMES.dark
    : PLOT_THEMES.light
}
