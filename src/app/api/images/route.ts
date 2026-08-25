import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { generateImage } from "@/lib/ai/image"

export const maxDuration = 60 // seconds

/**
 * GET /api/images
 * Query: ?limit=&offset=
 * 返回当前用户的生图历史(按时间倒序)
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") ?? 24)))
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0))

  const [items, total] = await Promise.all([
    prisma.generatedImage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.generatedImage.count({ where: { userId } }),
  ])

  return NextResponse.json({ items, total, limit, offset })
}

/**
 * POST /api/images
 * Body: { prompt: string, source?: "workspace"|"chat" }
 * 调用对应的生图模型生成图片并入库。
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  let body: { prompt?: string; source?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const prompt = (body.prompt ?? "").trim()
  if (!prompt) {
    return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 })
  }
  if (prompt.length > 500) {
    return NextResponse.json({ error: "prompt 不能超过 500 字" }, { status: 400 })
  }

  const source = body.source === "chat" ? "chat" : "workspace"

  // 读取用户当前的生图模型和尺寸
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { imageModel: true, imageSize: true },
  })
  const modelId = user?.imageModel ?? "builtin:wanx2.1-t2i-turbo"
  const size = user?.imageSize ?? "1024*1024"

  try {
    const result = await generateImage(userId, modelId, prompt, size)
    const record = await prisma.generatedImage.create({
      data: {
        userId,
        prompt,
        url: result.url,
        model: result.model,
        width: result.width,
        height: result.height,
        size,
        source,
      },
    })
    return NextResponse.json(record)
  } catch (err) {
    const message = err instanceof Error ? err.message : "图片生成失败"
    console.error("[images] Generate failed:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
