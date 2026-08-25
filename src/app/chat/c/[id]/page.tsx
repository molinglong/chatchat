import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { getAllModels } from '@/lib/ai/registry'
import type { Attachment } from '@/lib/attachment-types'
import type { UIMessage } from 'ai'

interface ConversationPageProps {
  params: { id: string }
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const { id } = params

  // Load conversation with messages, verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!conversation) {
    notFound()
  }

  // Convert DB messages to UIMessage format
  const toUIMessage = (msg: (typeof conversation.messages)[number]): UIMessage => {
    const parts: UIMessage['parts'] = []
    // Include reasoning parts if the message has saved reasoning
    if (msg.reasoning) {
      parts.push({ type: 'reasoning' as const, text: msg.reasoning, state: 'done' as const })
    }
    parts.push({ type: 'text' as const, text: msg.content, state: 'done' as const })
    // 解析附件 JSON,挂在 UIMessage 上供气泡渲染(useChat 会原样保留自定义字段)
    let attachments: Attachment[] | undefined
    if (msg.attachments) {
      try {
        const parsed = JSON.parse(msg.attachments)
        if (Array.isArray(parsed)) {
          attachments = parsed.filter(
            (a): a is Attachment =>
              !!a && typeof a.url === 'string' && typeof a.name === 'string'
          )
        }
      } catch {
        // 忽略损坏的 JSON
      }
    }
    return {
      id: msg.id,
      role: msg.role as 'user' | 'assistant' | 'system',
      parts,
      ...(attachments ? { attachments } : {}),
    } as UIMessage
  }

  const mode = conversation.mode ?? 'single'

  // 单聊模式: 隐藏其他模型的历史回答(对比会话原地转换后,库中仍保留它们)
  // 纯单聊消息无 groupId,始终显示;带 groupId 的(对比泳道产生)仅显示当前模型
  const visibleMessages =
    mode === 'compare'
      ? conversation.messages
      : conversation.messages.filter(
          (m) => m.role === 'user' || m.groupId == null || m.model === conversation.model
        )
  const initialMessages: UIMessage[] = visibleMessages.map(toUIMessage)

  // 对比模式: 解析模型列表并按泳道拆分消息(每泳道 = 共享用户消息 + 本模型回答)
  let compareModels: string[] = []
  if (mode === 'compare' && conversation.compareModels) {
    try {
      compareModels = JSON.parse(conversation.compareModels)
    } catch {
      compareModels = []
    }
  }
  const laneInitialMessages: UIMessage[][] = compareModels.map((modelId) =>
    conversation.messages
      .filter((m) => m.role === 'user' || m.model === modelId)
      .map(toUIMessage)
  )

  const allModels = getAllModels()

  return (
    <ChatPanel
      key={conversation.id}
      conversationId={conversation.id}
      conversationTitle={conversation.title}
      initialMessages={initialMessages}
      initialModel={conversation.model}
      allModels={allModels}
      mode={mode}
      compareModels={compareModels.length >= 2 ? compareModels : undefined}
      laneInitialMessages={laneInitialMessages}
      initialStyleOffset={conversation.styleOffset}
    />
  )
}
