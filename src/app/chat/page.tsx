import { ChatPanel } from '@/components/chat/ChatPanel'
import { getAllModels } from '@/lib/ai/registry'

export default function NewChatPage() {
  const allModels = getAllModels()
  const defaultModel = allModels[0]?.id || 'gpt-4o'

  console.log('[NewChatPage] Generated allModels:', allModels?.map(m => ({ id: m.id, name: m.name })))
  console.log('[NewChatPage] Default model:', defaultModel)

  return (
    <ChatPanel
      key="new-chat"
      initialMessages={[]}
      initialModel={defaultModel}
      allModels={allModels}
    />
  )
}
