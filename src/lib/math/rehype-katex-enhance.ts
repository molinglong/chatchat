/**
 * rehype 插件:在 rehype-katex 输出之后,把每个 .katex / .katex-display
 * 元素打上 data-math-src 属性,值为原始 LaTeX 字符串。
 *
 * 实现思路:
 *  - rehype-katex 默认会输出 MathML(.katex-mathml > annotation),
 *    annotation 节点的 value 就是 LaTeX 源码。
 *  - 我们把 annotation 的 value 写到 .katex 自身的 data-math-src 上,
 *    客户端 JS 即可统一读取。
 *
 * 注意事项:
 *  - 必须配置在 rehypePlugins 里 rehype-katex 之后,否则找不到 katex 节点。
 *  - 不修改 DOM 结构,只增属性;体积零负担。
 *  - 这里不依赖任何 hast 类型断言,全部走 runtime guard,
 *    以兼容 rehype-katex 不同小版本 / 不同 MathML 输出。
 */

import type { Plugin } from 'unified'
import type { Root } from 'hast'

// 把任意节点当作普通对象操作,避开 hast 类型对小版本变化敏感的问题
type AnyNode = {
  type?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: unknown[]
  value?: unknown
}

function asNode(n: unknown): AnyNode | null {
  if (!n || typeof n !== 'object') return null
  return n as AnyNode
}

function classNames(node: AnyNode): string {
  const raw = node.properties?.className
  if (!raw) return ''
  if (Array.isArray(raw)) return raw.filter(Boolean).join(' ')
  return String(raw)
}

function isKatexNode(node: AnyNode): boolean {
  if (node.type !== 'element') return false
  return classNames(node).split(/\s+/).includes('katex')
}

/** 安全访问 children 数组 */
function getChildren(node: AnyNode): AnyNode[] {
  const ch = node.children
  if (!Array.isArray(ch)) return []
  return ch.map(asNode).filter((n): n is AnyNode => n !== null)
}

/** 递归收集节点内的纯文本(深度优先) */
function collectText(node: unknown): string {
  const n = asNode(node)
  if (!n) return ''

  // hast text 节点 / annotation 节点的 value 字段直接是文本
  if (typeof n.value === 'string') return n.value

  let out = ''
  for (const child of getChildren(n)) {
    if (child.type === 'text' && typeof child.value === 'string') {
      out += child.value
    } else if (child.type === 'element') {
      out += collectText(child)
    }
  }
  return out
}

/**
 * 从 .katex 节点中找出 LaTeX 源码。
 * 优先从 .katex-mathml > annotation 的 value 取。
 */
function readLatexFromKatex(node: AnyNode): string | null {
  const children = getChildren(node)

  // 1) 找 .katex-mathml
  const mathml = children.find(
    (c) => classNames(c).split(/\s+/).includes('katex-mathml')
  )
  if (!mathml) return null

  // 2) 找 annotation 子节点
  const annotation = getChildren(mathml).find(
    (c) => c.type === 'element' && c.tagName === 'annotation'
  )
  if (!annotation) return null

  // 3) 优先读 annotation.value
  if (typeof annotation.value === 'string' && annotation.value.trim()) {
    return annotation.value
  }

  // 4) 兜底:拼接 annotation 内部文本
  const text = collectText(annotation)
  return text.trim() ? text : null
}

function visit(tree: unknown, cb: (n: AnyNode) => void): void {
  const root = asNode(tree)
  if (!root) return

  const walk = (node: AnyNode) => {
    if (node.type === 'element') cb(node)
    for (const child of getChildren(node)) {
      walk(child)
    }
  }

  walk(root)
}

export const rehypeKatexEnhance: Plugin<[], Root> = () => (tree) => {
  // 用宽松遍历,避开类型边界问题
  visit(tree, (node) => {
    if (!isKatexNode(node)) return

    // 跳过已经被增强过的(防止反复合并时报错)
    const existing = node.properties?.dataMathSrc
    if (existing && String(existing).trim()) return

    const latex = readLatexFromKatex(node)
    if (!latex) return

    node.properties = node.properties || {}
    node.properties.dataMathSrc = latex
  })
}
