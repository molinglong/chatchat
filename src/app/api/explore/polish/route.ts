/**
 * 润色 API
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { getProviderForModel, createProviderInstance } from '@/lib/ai/registry'
import { generateText } from 'ai'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content, topic, model: modelId } = await request.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const userId = session.user.id

    // 获取模型对应的 API Key
    const model = modelId || 'gpt-4o'
    const provider = getProviderForModel(model)

    let keyRecord: { encryptedKey: string } | null = null
    if (provider) {
      keyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId, provider: provider.id } },
      })
    }

    if (!keyRecord?.encryptedKey || !provider) {
      // 没有 API Key 时返回原文
      return NextResponse.json({ polished: content })
    }

    const apiKey = decrypt(keyRecord.encryptedKey)

    const systemPrompt = `你是一位写作润色专家，负责帮助用户优化辩论发言。
请在保持原意的基础上，让文字更加：
1. 逻辑清晰
2. 表达有力
3. 有说服力
4. 避免情绪化用语

请直接给出润色后的版本，不要过多解释。如果原文已经很好，可以稍作调整即可。`

    const userPrompt = topic ? `辩论主题：${topic}\n\n原文：\n${content}` : `原文：\n${content}`

    const aiProvider = createProviderInstance(model, apiKey)
    const result = await generateText({
      model: aiProvider(model),
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    return NextResponse.json({
      polished: result.text.trim(),
    })
  } catch (error) {
    console.error('[explore/polish] Error:', error)
    return NextResponse.json(
      { error: 'Polish failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
