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

    const interval = setInterval(() => {
      setRevealedLength((prev) => {
        const target = fullTextRef.current.length
        if (prev >= target) return prev

        const gap = target - prev
        const step = gap > 30 ? 8 : 1
        return Math.min(prev + step, target)
      })
    }, 8)

    return () => clearInterval(interval)
  }, [enabled])

  const displayText = enabled ? fullText.slice(0, revealedLength) : fullText
  const isTyping = enabled && revealedLength < fullText.length

  return { displayText, isTyping }
}
