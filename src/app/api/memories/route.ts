import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [memories, user] = await Promise.all([
    prisma.memory.findMany({
      where: { userId: session.user.id },
      orderBy: [{ source: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { memoryEnabled: true },
    }),
  ])

  return NextResponse.json({
    memories,
    memoryEnabled: user?.memoryEnabled ?? true,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const content = (body.content ?? "").toString().trim()
  if (!content) {
    return NextResponse.json({ error: "内容不能为空" }, { status: 400 })
  }
  if (content.length > 200) {
    return NextResponse.json({ error: "内容过长（最多 200 字）" }, { status: 400 })
  }

  // 与已有记忆去重
  const existing = await prisma.memory.findMany({
    where: { userId: session.user.id },
    select: { content: true },
  })
  if (existing.some((e) => e.content.includes(content) || content.includes(e.content))) {
    return NextResponse.json({ error: "已存在相同或相似的记忆" }, { status: 409 })
  }

  const memory = await prisma.memory.create({
    data: {
      userId: session.user.id,
      category: (body.category ?? "manual").toString() || "manual",
      content,
      source: "manual",
    },
  })

  return NextResponse.json(memory, { status: 201 })
}
