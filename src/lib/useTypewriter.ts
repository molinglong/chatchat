'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * Typewriter hook: progressively reveals text character by character.
 *
 * - Adaptive speed: when far behind the target (gap > 30 chars), reveals
 *   8 chars per tick for fast catch-up. When close to the end, reveals
 *   1 char per tick for a visible typing effect.
 * - Detects text reset (new message): if `fullText` shrinks, resets to 0.
 * - When disabled, shows full text immediately.
 *
 * @param fullText  The complete text to reveal
 * @param enabled   Whether typewriter is active (only for assistant messages)
 */
export function useTypewriter(fullText: string, enabled: boolean) {
  /* __RP__ */ if (typeof window !== 'undefined') { const w = window as any; w.__RC = w.__RC || {}; w.__RC['useTypewriter'] = (w.__RC['useTypewriter'] || 0) + 1 }
  const [revealedLength, setRevealedLength] = useState(0)
  const fullTextRef = useRef(fullText)
  const prevLengthRef = useRef(fullText.length)

  // Keep ref updated with latest text (read inside interval callback)
  fullTextRef.current = fullText

  // Detect text reset (new message — text shrank significantly)
  useEffect(() => {
    if (fullText.length < prevLengthRef.current) {
      setRevealedLength(0)
    }
    prevLengthRef.current = fullText.length
  }, [fullText.length])

  useEffect(() => {
    if (!enabled) {
      setRevealedLength(fullText.length)
      return
    }

    // 用 requestAnimationFrame 替代 setInterval(8ms):
    // - 浏览器自动节流(标签页不活跃时不触发),主线程压力小一个数量级
    // - 与显示器刷新率对齐(60fps),视觉上反而比 125fps 更顺滑
    // - 流式追赶时不再以 125fps 抢占主线程,点击事件不再被排队
    let rafId: number

    const tick = () => {
      setRevealedLength((prev) => {
        const target = fullTextRef.current.length
        if (prev >= target) return prev
        const gap = target - prev
        const step = gap > 30 ? 8 : 1
        return Math.min(prev + step, target)
      })
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [enabled])

  const displayText = enabled ? fullText.slice(0, revealedLength) : fullText
  const isTyping = enabled && revealedLength < fullText.length

  return { displayText, isTyping }
}
