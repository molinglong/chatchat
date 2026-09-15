'use client'

/**
 * 开发期「错误捕手」——临时诊断组件(排查 Maximum update depth 循环用)
 *
 * 作用:拦截 console.error / window.onerror / unhandledrejection,
 * 把完整错误文本(含 React 组件调用栈)POST 到 /api/debug-log,
 * 由服务端追加写入 .next/client-errors.log,供直接读取分析。
 *
 * 注意:
 * - 仅开发环境生效(NODE_ENV=production 时本组件不挂任何监听)
 * - 发送失败静默吞掉(绝不能反过来再触发 console.error,否则会自激循环)
 * - 2 秒内重复错误去重 + 单次会话最多 100 条,防止报错刷屏时打爆网络
 * - 排查完删除本组件 + 对应 API route 即可,零业务影响
 */
import { useEffect } from 'react'

export function ErrorSink() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return

    let sent = 0
    let lastKey = ''
    let lastAt = 0

    const serialize = (args: unknown[]): string =>
      args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`
          if (typeof a === 'string') return a
          try {
            return JSON.stringify(a, null, 2)
          } catch {
            return String(a)
          }
        })
        .join('\n')

    const send = (kind: string, text: string) => {
      if (!text || sent >= 100) return
      const key = `${kind}|${text.slice(0, 200)}`
      const now = Date.now()
      if (key === lastKey && now - lastAt < 2000) return
      lastKey = key
      lastAt = now
      sent += 1
      try {
        fetch('/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            at: new Date().toISOString(),
            url: typeof location !== 'undefined' ? location.href : '',
            text: text.slice(0, 30000),
          }),
        }).catch(() => {})
      } catch {
        /* 静默 */
      }
    }

    const origConsoleError = console.error
    console.error = (...args: unknown[]) => {
      try {
        send('console.error', serialize(args))
      } catch {
        /* 静默 */
      }
      origConsoleError(...args)
    }

    const onWindowError = (e: ErrorEvent) => {
      send('window.error', `${e.message}\n${e.error?.stack ?? ''}`)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      send(
        'unhandledrejection',
        r instanceof Error ? `${r.name}: ${r.message}\n${r.stack ?? ''}` : String(r)
      )
    }

    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onRejection)
    console.info('[ErrorSink] 错误捕手已挂载 (dev only)')

    return () => {
      console.error = origConsoleError
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
