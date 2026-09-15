'use client'

import { useEffect } from 'react'
import {
  copyText,
  copyPngFromElement,
  readLatexFromElement,
} from '@/lib/math/latex-copy'

interface MathToolbarEnhancerProps {
  /** 监听这个 ref 内的 .katex 元素;不传则监听整个 document */
  rootRef?: React.RefObject<HTMLElement | null>
}

const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`

const IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`

const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(text: string, kind: 'ok' | 'err' = 'ok') {
  if (typeof document === 'undefined') return
  let el = document.getElementById('math-toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'math-toast'
    el.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(8px);
      z-index: 9999;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s, transform 0.2s;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    `
    document.body.appendChild(el)
  }

  const isDark = document.documentElement.classList.contains('dark')
  el.style.background = isDark ? '#2c2c2e' : '#1f1f23'
  el.style.color = '#ffffff'
  el.textContent = text
  if (kind === 'ok') {
    const checkSpan = document.createElement('span')
    checkSpan.innerHTML = CHECK_SVG
    el.prepend(checkSpan)
  }

  // 显示
  requestAnimationFrame(() => {
    el!.style.opacity = '1'
    el!.style.transform = 'translateX(-50%) translateY(0)'
  })

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el!.style.opacity = '0'
    el!.style.transform = 'translateX(-50%) translateY(8px)'
  }, 1500)
}

function buildToolbarFor(el: HTMLElement): HTMLSpanElement {
  const bar = document.createElement('span')
  bar.className = 'math-toolbar'
  bar.setAttribute('contenteditable', 'false')
  bar.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 6px;
    padding: 2px 4px;
    border-radius: 6px;
    background: var(--math-toolbar-bg, rgba(255,255,255,0.95));
    color: var(--math-toolbar-color, #39393c);
    box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
    vertical-align: middle;
    line-height: 0;
    position: relative;
    top: -1px;
  `

  function makeButton(
    title: string,
    svg: string,
    onClick: () => Promise<void> | void
  ): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.title = title
    btn.setAttribute('aria-label', title)
    btn.innerHTML = svg
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      border: none;
      background: transparent;
      cursor: pointer;
      color: inherit;
      transition: background 0.1s ease;
      pointer-events: auto;
    `
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(0,0,0,0.06)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent'
    })
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    btn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      await onClick()
    })
    return btn
  }

  const copyBtn = makeButton('复制 LaTeX 源码', COPY_SVG, async () => {
    const src = readLatexFromElement(el)
    if (!src) {
      showToast('未能读取 LaTeX 源码', 'err')
      return
    }
    const ok = await copyText(src)
    showToast(ok ? '已复制 LaTeX' : '复制失败', ok ? 'ok' : 'err')
  })

  const pngBtn = makeButton('复制为 PNG', IMAGE_SVG, async () => {
    try {
      const ok = await copyPngFromElement(el)
      showToast(ok ? '已复制 PNG' : '截图失败', ok ? 'ok' : 'err')
    } catch (err) {
      console.error('[MathToolbar] copyPng 失败', err)
      showToast('截图失败', 'err')
    }
  })

  bar.appendChild(copyBtn)
  bar.appendChild(pngBtn)
  return bar
}

/**
 * 给根节点下所有 .katex[data-math-src] 挂悬浮工具栏。
 * 用 MutationObserver 持续监听新出现的公式节点。
 */
export function MathToolbarEnhancer({ rootRef }: MathToolbarEnhancerProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const getRoot = () => rootRef?.current ?? document.body

    const processed = new WeakSet<HTMLElement>()

    const attachAll = () => {
      const root = getRoot()
      if (!root) return
      const nodes = root.querySelectorAll<HTMLElement>('.katex[data-math-src]')
      nodes.forEach((el) => {
        if (processed.has(el)) return
        // 跳过 .katex-display 内部的子 .katex（display 才会被标记,但保险起见）
        if (el.closest('.math-toolbar')) return
        processed.add(el)
        attachOne(el)
      })
    }

    const attachOne = (el: HTMLElement) => {
      // 在 el 后插入一个兄弟 span
      const toolbar = buildToolbarFor(el)
      el.parentElement?.appendChild(toolbar)

      let hover = false
      const show = () => {
        toolbar.style.opacity = '1'
        toolbar.style.pointerEvents = 'auto'
      }
      const hide = () => {
        toolbar.style.opacity = '0'
        toolbar.style.pointerEvents = 'none'
      }
      const onElEnter = () => {
        hover = true
        show()
      }
      const onElLeave = () => {
        hover = false
        // 给按钮一点时间接收 mouseleave
        setTimeout(() => {
          if (!hover) hide()
        }, 60)
      }
      const onBarEnter = () => {
        hover = true
        show()
      }
      const onBarLeave = () => {
        hover = false
        hide()
      }

      el.addEventListener('mouseenter', onElEnter)
      el.addEventListener('mouseleave', onElLeave)
      toolbar.addEventListener('mouseenter', onBarEnter)
      toolbar.addEventListener('mouseleave', onBarLeave)

      // 暗色样式：通过 CSS 变量自动切换
      const updateTheme = () => {
        const isDark = document.documentElement.classList.contains('dark')
        toolbar.style.setProperty(
          '--math-toolbar-bg',
          isDark ? 'rgba(44,44,46,0.95)' : 'rgba(255,255,255,0.95)'
        )
        toolbar.style.setProperty(
          '--math-toolbar-color',
          isDark ? '#e8e8ed' : '#39393c'
        )
      }
      updateTheme()

      const themeObserver = new MutationObserver(updateTheme)
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
    }

    attachAll()
    const root = getRoot()
    if (!root) return

    const observer = new MutationObserver(() => attachAll())
    observer.observe(root, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [rootRef])

  return null
}
