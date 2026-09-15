/**
 * 数学公式复制 / 截图工具集
 *
 * 关键点:
 *  - html2canvas 包大,只在用户点击「复制 PNG」时才动态加载
 *  - LaTeX 源字符串由 rehype-katex-enhance 写到元素的 data-math-src 属性里
 *  - 复制 PNG 走 Clipboard API (image/png),不支持时降级到下载
 */

type AnyEl = HTMLElement | SVGElement

/**
 * 读 KaTeX 元素上的 LaTeX 源码。
 * - 优先读 data-math-src(rehype 插件注入)
 * - 兜底从 .katex-mathml annotation 里抓
 */
export function readLatexFromElement(el: AnyEl): string | null {
  const direct = (el as HTMLElement).getAttribute?.('data-math-src')
  if (direct && direct.trim()) return direct

  const ann = (el as HTMLElement).querySelector?.('annotation')
  if (ann?.textContent) return ann.textContent

  return null
}

/** 复制纯文本到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 降级到 textarea
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    ta.style.pointerEvents = 'none'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** 把一个 DOM 元素截图成 PNG 并复制到剪贴板 */
export async function copyPngFromElement(el: Element): Promise<boolean> {
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(el as HTMLElement, {
    backgroundColor: null,
    scale: 2,
    logging: false,
    useCORS: true,
  })

  // 优先用 Clipboard API
  try {
    if (navigator.clipboard && 'ClipboardItem' in window) {
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), 'image/png')
      )
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        return true
      }
    }
  } catch {
    // 继续降级到下载
  }

  // 降级:触发下载
  const link = document.createElement('a')
  link.download = `formula-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  return true
}

/** 把外层 wrapper 转成"含公式副本"的 SVG 字符串,用于导出文件 */
export function exportSvgFromElement(_el: Element): string {
  // 简化版:让用户用「复制 PNG」即可,SVG 路径复杂后续再补
  return ''
}
