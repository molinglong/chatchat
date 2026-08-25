import { tool } from "ai"
import { z } from "zod"

/**
 * 百度千帆联网搜索工具
 * 使用百度千帆平台的搜索 API，为 AI 模型提供实时联网搜索能力。
 *
 * 千帆搜索 API 文档: https://cloud.baidu.com/doc/QIANFAN/s/...
 * 鉴权方式: 与文心一言共用千帆 API Key（Bearer Token）
 */

interface SearchResultItem {
  title: string
  url: string
  snippet: string
}

interface QianfanSearchResponse {
  results?: Array<{
    title?: string
    url?: string
    content?: string
    abstract?: string
    snippet?: string
  }>
  error_code?: number
  error_msg?: string
}

/**
 * 调用百度千帆搜索 API 执行联网搜索
 */
async function executeQianfanSearch(
  query: string,
  apiKey: string
): Promise<SearchResultItem[]> {
  // 千帆搜索 API 端点（v2 兼容模式）
  const response = await fetch("https://qianfan.baidubce.com/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      top_n: 5,
    }),
  })

  if (!response.ok) {
    throw new Error(`百度搜索请求失败 (HTTP ${response.status})`)
  }

  const data: QianfanSearchResponse = await response.json()

  if (data.error_code) {
    throw new Error(
      `百度搜索 API 错误: ${data.error_msg || "未知错误"} (code: ${data.error_code})`
    )
  }

  const results = data.results ?? []
  return results.map((r) => ({
    title: r.title || "无标题",
    url: r.url || "",
    snippet: r.snippet || r.content || r.abstract || "",
  }))
}

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
 * @param apiKey - 千帆平台 API Key（与文心一言共用）
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
        const results = await executeQianfanSearch(query, apiKey)
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