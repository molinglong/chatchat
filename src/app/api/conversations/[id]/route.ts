import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { deleteReferencedFiles } from '@/lib/uploads'

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().min(1).optional(),
  compareModels: z.array(z.string().min(1)).optional(),
  // 转换为单聊时 mode='single'
  mode: z.enum(['single', 'compare']).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const updated = await prisma.conversation.update({
    where: { id },
    data: {
      title: parsed.data.title,
      model: parsed.data.model,
      mode: parsed.data.mode,
      ...(parsed.data.compareModels
        ? { compareModels: JSON.stringify(parsed.data.compareModels) }
        : {}),
      // 转为单聊时清除对比模型列表
      ...(parsed.data.mode === 'single' ? { compareModels: null } : {}),
    },
    select: { id: true, title: true, model: true, mode: true, updatedAt: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params

  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 删除前收集会话内消息引用的附件文件(消息会随会话级联删除)
  const messages = await prisma.message.findMany({
    where: { conversationId: id, attachments: { not: null } },
    select: { attachments: true },
  })

  await prisma.conversation.delete({ where: { id } })

  // 库删除完成后清理磁盘文件
  for (const m of messages) {
    await deleteReferencedFiles(m.attachments)
  }

  return NextResponse.json({ success: true })
}
