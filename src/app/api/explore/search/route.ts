/**
 * 联网搜索 API - 百度千帆 + Tavily 双引擎并行
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { executeQianfanSearch } from '@/lib/ai/search-engines/qianfan'
import { executeTavilySearch } from '@/lib/ai/search-engines/tavily'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query } = await request.json()
    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const userId = session.user.id
    const results: string[] = []
    const errors: string[] = []

    // 获取两个引擎的 API Key
    const [qianfanKeyRecord, tavilyKeyRecord] = await Promise.all([
      prisma.apiKey.findUnique({ where: { userId_provider: { userId, provider: 'qianfan' } } }),
      prisma.apiKey.findUnique({ where: { userId_provider: { userId, provider: 'tavily' } } }),
    ])

    // 并行执行两个搜索
    const searchPromises: Promise<void>[] = []

    // 百度千帆搜索
    if (qianfanKeyRecord?.encryptedKey) {
      const apiKey = decrypt(qianfanKeyRecord.encryptedKey)
      searchPromises.push(
        executeQianfanSearch(query, apiKey, 5)
          .then(res => {
            if (res.length > 0) {
              results.push('【百度搜索结果】')
              res.forEach((item, i) => {
                results.push(`[${i + 1}] ${item.title}`)
                results.push(`   链接: ${item.url}`)
                results.push(`   摘要: ${item.snippet}`)
              })
            }
          })
          .catch(err => {
            errors.push(`百度搜索: ${err instanceof Error ? err.message : '未知错误'}`)
          })
      )
    } else {
      errors.push('百度搜索: 未配置 API Key')
    }

    // Tavily 搜索
    if (tavilyKeyRecord?.encryptedKey) {
      const apiKey = decrypt(tavilyKeyRecord.encryptedKey)
      searchPromises.push(
        executeTavilySearch(query, apiKey, 5)
          .then(res => {
            if (res.length > 0) {
              results.push('【Tavily 搜索结果】')
              res.forEach((item, i) => {
                results.push(`[${i + 1}] ${item.title}`)
                results.push(`   链接: ${item.url}`)
                results.push(`   摘要: ${item.snippet}`)
              })
            }
          })
          .catch(err => {
            errors.push(`Tavily 搜索: ${err instanceof Error ? err.message : '未知错误'}`)
          })
      )
    } else {
      errors.push('Tavily 搜索: 未配置 API Key')
    }

    await Promise.all(searchPromises)

    if (results.length === 0) {
      return NextResponse.json({
        results: `未找到搜索结果。${errors.length > 0 ? '\n\n错误信息:\n' + errors.join('\n') : ''}`,
      })
    }

    if (errors.length > 0) {
      results.push('\n【部分搜索失败】')
      errors.forEach(err => results.push(`· ${err}`))
    }

    return NextResponse.json({
      results: results.join('\n'),
    })
  } catch (error) {
    console.error('[explore/search] Error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
