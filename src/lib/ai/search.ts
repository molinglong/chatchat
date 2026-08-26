import { tool } from "ai"
import { z } from "zod"
import { executeQianfanSearch, type QianfanSearchResult } from "./search-engines/qianfan"

/**
 * 百度千帆联网搜索工具
 * 使用百度千帆平台的搜索 API，为 AI 模型提供实时联网搜索能力。
 *
 * 官方文档: https://cloud.baidu.com/doc/qianfan-api/s/Wmbq4z7e5
 * 鉴权方式: AppBuilder API Key（独立于文心模型 Key）
 * 实际执行逻辑抽离到 ./search-engines/qianfan.ts，便于被 /api/search/test 等其他模块复用。
 */

type SearchResultItem = QianfanSearchResult

/**
 * 格式化搜索结果供 AI 模型阅读
 */
function formatSearchResults(
  query: string,
  results: SearchResultItem[]
): string {
  if (results.length === 0) {
    return `搜索「${query}」未找到相关结果。`
  }

  const lines = [
    `以下是关于「${query}」的搜索结果（共 ${results.length} 条）：`,
    "",
  ]

  results.forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.title}`)
    if (r.url) lines.push(`    链接: ${r.url}`)
    if (r.snippet) lines.push(`    摘要: ${r.snippet}`)
    lines.push("")
  })

  lines.push(
    "请基于以上搜索结果回答用户的问题，并在回答中引用相关来源。如果搜索结果不充分或信息已过时，请如实告知用户。"
  )

  return lines.join("\n")
}

/**
 * 创建百度千帆联网搜索工具（AI SDK tool）
 *
 * @param apiKey - 百度千帆 AppBuilder API Key（联网搜索独立 Key，与模型 Key 分开配置）
 * @returns AI SDK tool 对象
 */
export function createWebSearchTool(apiKey: string) {
  return tool({
    description: `联网搜索工具。当需要获取实时信息、最新新闻、当前事件、或用户明确要求搜索时使用。
输入中文或英文搜索关键词，工具会返回百度搜索结果（标题、链接、摘要）。
搜索结果会包含网页标题、URL 和内容摘要，请基于这些信息回答用户问题并注明来源。`,
    inputSchema: z.object({
      query: z
        .string()
        .describe("搜索关键词，使用用户提问的语言，尽量简洁准确"),
    }),
    execute: async ({ query }) => {
      try {
        const results = await executeQianfanSearch(query, apiKey, 5)
        return formatSearchResults(query, results)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "未知搜索错误"
        console.error("[qianfan-search]", message)
        return `联网搜索失败: ${message}。请基于你已有的知识回答用户问题，并告知用户搜索暂时不可用。`
      }
    },
  })
}