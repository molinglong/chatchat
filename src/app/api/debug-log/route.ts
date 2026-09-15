/**
 * 开发调试专用:接收客户端「错误捕手」上报,追加写入 .next/client-errors.log
 * - 生产环境直接 404(仅存在于开发流程)
 * - 日志文件在 .next 内(已被 gitignore),随缓存清理自动消失
 * 排查完与 ErrorSink 组件一起删除。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('not found', { status: 404 })
  }
  try {
    const body = await req.json()
    const line = JSON.stringify(body ?? {}) + '\n'
    const file = path.join(process.cwd(), '.next', 'client-errors.log')
    await fs.appendFile(file, line, 'utf8')
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
