/**
 * 助手分析 API - 逻辑审查、论据搜索辅助、文本润色
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

    const { type, content, topic, model: modelId, conversationHistory } = await request.json()

    if (!type || !content?.trim()) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 })
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
      return NextResponse.json({ error: 'No API key available' }, { status: 401 })
    }

    const apiKey = decrypt(keyRecord.encryptedKey)

    // 根据类型构建提示
    let systemPrompt = ''
    const userPrompt = content

    switch (type) {
      case 'logic':
        systemPrompt = `你是一位辩论教练，负责审查用户的辩论论点。
请从以下几个维度进行审查：
1. 逻辑谬误（滑坡论证、人身攻击、稻草人谬误、虚假两难等）
2. 证据充分性（是否有数据、研究支撑？）
3. 论点一致性（是否自相矛盾？）
4. 可预见的反驳点（对方可能如何攻击你的论点？）

请用简洁、专业的语言给出反馈。`
        break

      case 'polish':
        systemPrompt = `你是一位写作润色专家，负责帮助用户优化辩论发言。
请在保持原意的基础上，让文字更加：
1. 逻辑清晰
2. 表达有力
3. 有说服力
4. 避免情绪化用语

请直接给出润色后的版本，不要过多解释。`
        break

      case 'evidence-suggestion':
        systemPrompt = `你是一位研究助手，负责帮助用户找到支撑论点的论据。
基于用户提供的论点，建议一些可以搜索的关键词或角度。
请用简洁的语言给出建议。`
        break

      default:
        return NextResponse.json({ error: 'Unknown analysis type' }, { status: 400 })
    }

    // 构建消息
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = []

    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      // 添加上下文
      messages.push({
        role: 'system',
        content: `辩论主题：${topic || '未指定'}`,
      })
      messages.push({
        role: 'system',
        content: `辩论历史：\n${conversationHistory.map((m: { role: string; content: string }, i: number) => 
          `${i + 1}. [${m.role}] ${m.content}`
        ).join('\n')}`,
      })
    }

    messages.push({ role: 'user', content: userPrompt })

    // 生成分析
    const aiProvider = createProviderInstance(model, apiKey)
    const result = await generateText({
      model: aiProvider(model),
      system: systemPrompt,
      messages,
    })

    return NextResponse.json({
      analysis: result.text,
    })
  } catch (error) {
    console.error('[explore/assistant] Error:', error)
    return NextResponse.json(
      { error: 'Analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
