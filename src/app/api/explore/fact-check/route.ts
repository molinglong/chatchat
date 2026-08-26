/**
 * 事实核查 API
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { getProviderForModel, createProviderInstance } from '@/lib/ai/registry'
import { executeQianfanSearch } from '@/lib/ai/search-engines/qianfan'
import { executeTavilySearch } from '@/lib/ai/search-engines/tavily'
import { generateText } from 'ai'

interface FactCheckResult {
  status: 'verified' | 'disputed' | 'unverifiable' | 'false'
  claims: {
    text: string
    status: 'verified' | 'disputed' | 'unverifiable' | 'false'
    verification?: string
    source?: string
  }[]
  suggestions?: string[]
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content, topic } = await request.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const userId = session.user.id

    // 获取默认模型进行核查
    const modelId = 'gpt-4o'
    const provider = getProviderForModel(modelId)

    let keyRecord: { encryptedKey: string } | null = null
    if (provider) {
      keyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId, provider: provider.id } },
      })
    }

    // 尝试获取搜索结果
    let searchResults = ''
    const searchErrors: string[] = []

    try {
      const [qianfanKeyRecord, tavilyKeyRecord] = await Promise.all([
        prisma.apiKey.findUnique({ where: { userId_provider: { userId, provider: 'qianfan' } } }),
        prisma.apiKey.findUnique({ where: { userId_provider: { userId, provider: 'tavily' } } }),
      ])

      const results: string[] = []
      const searchPromises: Promise<void>[] = []

      if (qianfanKeyRecord?.encryptedKey) {
        const apiKey = decrypt(qianfanKeyRecord.encryptedKey)
        searchPromises.push(
          executeQianfanSearch(content, apiKey, 3)
            .then(res => {
              if (res.length > 0) {
                results.push('【百度搜索】')
                res.forEach((item, i) => {
                  results.push(`${i + 1}. ${item.title}: ${item.snippet}`)
                })
              }
            })
            .catch((err: Error) => {
              searchErrors.push(`百度: ${err.message}`)
            })
        )
      }

      if (tavilyKeyRecord?.encryptedKey) {
        const apiKey = decrypt(tavilyKeyRecord.encryptedKey)
        searchPromises.push(
          executeTavilySearch(content, apiKey, 3)
            .then(res => {
              if (res.length > 0) {
                results.push('【Tavily搜索】')
                res.forEach((item, i) => {
                  results.push(`${i + 1}. ${item.title}: ${item.snippet}`)
                })
              }
            })
            .catch((err: Error) => {
              searchErrors.push(`Tavily: ${err.message}`)
            })
        )
      }

      await Promise.all(searchPromises)
      searchResults = results.length > 0 ? results.join('\n') : ''
    } catch {
      // 搜索失败不影响核查
    }

    // 使用 AI 进行事实核查
    let factCheckResult: FactCheckResult

    if (keyRecord?.encryptedKey && provider) {
      const apiKey = decrypt(keyRecord.encryptedKey)

      const systemPrompt = `你是一个严格的事实核查员。
给定一段文本，你需要：
1. 识别其中的关键声明（尤其是涉及数据、统计、研究结论的）
2. 根据搜索结果判断每个声明的可信度
3. 给出明确的核查结论

核查结论类型：
- verified: 有可靠来源支持
- disputed: 来源之间存在矛盾
- unverifiable: 无法找到足够证据
- false: 与已知事实不符

请以 JSON 格式返回结果，格式如下：
{
  "status": "verified/disputed/unverifiable/false",
  "claims": [
    {
      "text": "声明内容",
      "status": "verified/disputed/unverifiable/false",
      "verification": "核查说明",
      "source": "来源（如果有）"
    }
  ],
  "suggestions": ["建议1", "建议2"]
}`

      const userPrompt = `待核查文本：\n${content}\n\n${topic ? `辩论主题：${topic}\n` : ''}${searchResults ? `搜索结果：\n${searchResults}` : ''}`

      const aiProvider = createProviderInstance(modelId, apiKey)
      const result = await generateText({
        model: aiProvider(modelId),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      try {
        // 尝试解析 JSON
        const jsonMatch = result.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          factCheckResult = JSON.parse(jsonMatch[0])
        } else {
          // 如果无法解析 JSON，返回基于文本的结果
          factCheckResult = {
            status: 'unverifiable',
            claims: [{
              text: content,
              status: 'unverifiable',
              verification: result.text,
            }],
            suggestions: ['建议查阅权威来源进行核实'],
          }
        }
      } catch {
        factCheckResult = {
          status: 'unverifiable',
          claims: [{
            text: content,
            status: 'unverifiable',
            verification: result.text || '无法完成自动核查',
          }],
          suggestions: ['建议查阅权威来源进行核实'],
        }
      }
    } else {
      // 没有 API Key，返回基础结果
      factCheckResult = {
        status: 'unverifiable',
        claims: [{
          text: content,
          status: 'unverifiable',
          verification: '未配置 AI API Key，无法进行自动核查',
        }],
        suggestions: ['请在设置中配置 AI API Key 以启用事实核查功能'],
      }
    }

    return NextResponse.json({
      result: factCheckResult,
    })
  } catch (error) {
    console.error('[explore/fact-check] Error:', error)
    return NextResponse.json(
      { error: 'Fact check failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
