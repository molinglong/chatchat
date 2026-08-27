import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 限量分页: ?limit=20&offset=0,limit 上限 100;?q=关键词支持按标题搜索
  const { searchParams } = new URL(req.url)
  const parsedLimit = parseInt(searchParams.get('limit') ?? '20', 10)
  const parsedOffset = parseInt(searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20, 100)
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0
  const q = (searchParams.get('q') ?? '').trim()

  const where = {
    userId: session.user.id,
    ...(q ? { title: { contains: q } } : {}),
  }

  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        model: true,
        mode: true,
        updatedAt: true,
      },
      skip: offset,
      take: limit,
    }),
  ])

  return NextResponse.json({
    items: conversations,
    total,
    hasMore: offset + conversations.length < total,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))

  // 另存为新对话: 从对比会话克隆(用户消息 + 所选模型的回答)
  if (body.cloneFrom) {
    const source = await prisma.conversation.findFirst({
      where: { id: body.cloneFrom, userId: session.user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!source) {
      return NextResponse.json({ error: 'Source conversation not found' }, { status: 404 })
    }
    const targetModel = body.model || source.model
    // 纯单聊消息(无 groupId)全部保留;对比泳道消息仅保留所选模型
    const cloneMessages = source.messages.filter(
      (m) => m.role === 'user' || m.groupId == null || m.model === targetModel
    )
    const conversation = await prisma.conversation.create({
      data: {
        userId: session.user.id,
        title: body.title || source.title || '新对话',
        model: targetModel,
        styleOffset: source.styleOffset,
        messages: {
          create: cloneMessages.map((m) => ({
            role: m.role,
            content: m.content,
            reasoning: m.reasoning,
            model: m.role === 'assistant' ? m.model : null,
            // 保留 token 统计(克隆的对话沿用原消耗记录)
            promptTokens: m.role === 'assistant' ? m.promptTokens : null,
            completionTokens: m.role === 'assistant' ? m.completionTokens : null,
          })),
        },
      },
    })
    return NextResponse.json(conversation, { status: 201 })
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      title: body.title || '新对话',
      model: body.model || 'gpt-4o',
      styleOffset:
        typeof body.styleOffset === 'number' && Number.isFinite(body.styleOffset)
          ? Math.max(0, Math.min(100, Math.round(body.styleOffset)))
          : 50,
      ...(body.mode === 'compare' ? { mode: 'compare' } : {}),
      ...(body.compareModels ? { compareModels: JSON.stringify(body.compareModels) } : {}),
    },
  })

  return NextResponse.json(conversation, { status: 201 })
}
