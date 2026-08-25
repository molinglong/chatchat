/**
 * 自定义模型公共逻辑模块
 * - 构建 ModelDefinition 供 UI 使用
 * - 解析 API Key（独立 key / 复用已有 provider key）
 * - 创建 OpenAI 兼容的 provider 实例
 */

import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { providers } from "./registry"
import type { ModelDefinition } from "./types"

// 数据库行类型
export interface CustomModelRow {
  id: string
  userId: string
  name: string
  modelId: string
  baseURL: string
  protocol?: string | null
  apiKey?: string | null // encrypted
  keyProvider?: string | null
  contextWindow: number
  supportsVision: boolean
  supportsFiles: boolean
  supportsReasoning: boolean
}

// 从 DB 行构建 ModelDefinition（用于 ModelSelector）
export function buildCustomModelDefinition(cm: CustomModelRow): ModelDefinition {
  return {
    id: `custom:${cm.id}`,
    name: cm.name,
    provider: "custom",
    contextWindow: cm.contextWindow,
    supportsVision: cm.supportsVision,
    supportsFiles: cm.supportsFiles,
    supportsReasoning: cm.supportsReasoning,
  }
}

// 解析 API key（返回明文）
// 优先级：独立 apiKey > keyProvider 对应已配置 key > undefined(某些本地服务无需鉴权)
export async function resolveApiKey(userId: string, cm: CustomModelRow): Promise<string | undefined> {
  if (cm.apiKey) {
    try {
      return decrypt(cm.apiKey)
    } catch (err) {
      console.error("[custom-model] Failed to decrypt own apiKey:", err)
    }
  }
  if (cm.keyProvider) {
    const rec = await prisma.apiKey.findFirst({
      where: { userId, provider: cm.keyProvider },
    })
    if (rec) {
      try {
        return decrypt(rec.encryptedKey)
      } catch (err) {
        console.error(`[custom-model] Failed to decrypt ${cm.keyProvider} key:`, err)
      }
    }
  }
  return undefined // 免鉴权模式，本地 Ollama/LM Studio 等常用密钥 "local"
}

// 创建自定义模型的 provider 实例
// 复用服务商 Key 且未填 Base URL → 直接用该服务商原生实例（支持任意该服务商模型 ID）
// 其余情况 → OpenAI 兼容协议实例（需要 Base URL）
export type CustomModelProtocol = "chat" | "responses" | "anthropic"

export function getCustomModelProtocol(cm: Pick<CustomModelRow, "modelId" | "baseURL" | "protocol">): CustomModelProtocol {
  if (cm.protocol === "responses" || cm.protocol === "chat" || cm.protocol === "anthropic") return cm.protocol
  if (cm.modelId.toLowerCase() === "gpt-5.4-pro") {
    return "responses"
  }
  return "chat"
}

function normalizeCustomBaseURL(value: string | undefined) {
  if (!value || value.trim() === "") return undefined
  const input = value.trim().replace(/\/+$/, "")
  try {
    const url = new URL(input)
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/v1"
    }
    return url.toString().replace(/\/$/, "")
  } catch {
    return input
  }
}

export function createCustomProviderInstance(cm: CustomModelRow, apiKey: string | undefined) {
  const baseURL = normalizeCustomBaseURL(cm.baseURL)

  if (!baseURL && cm.keyProvider) {
    const builtin = providers[cm.keyProvider]
    if (builtin) {
      const key = apiKey && apiKey.trim() !== "" ? apiKey : "local"
      return builtin.createProvider(key)
    }
  }

  const opts: Parameters<typeof createOpenAI>[0] = {}
  if (apiKey && apiKey.trim() !== "") {
    opts.apiKey = apiKey
  } else {
    // 很多本地服务需要 apiKey 参数但不真正验证
    opts.apiKey = "local"
  }
  if (baseURL) {
    opts.baseURL = baseURL
  }
  return createOpenAI(opts)
}

export function createCustomLanguageModel(cm: CustomModelRow, apiKey: string | undefined) {
  const protocol = getCustomModelProtocol(cm)
  if (protocol === "anthropic") {
    const baseURL = normalizeCustomBaseURL(cm.baseURL)
    const provider = createAnthropic({
      apiKey: apiKey && apiKey.trim() !== "" ? apiKey : "local",
      ...(baseURL ? { baseURL } : {}),
    })
    return provider(cm.modelId)
  }

  const provider = createCustomProviderInstance(cm, apiKey) as ReturnType<typeof createOpenAI>
  if (protocol === "chat") {
    if (!provider.chat) {
      throw new Error("当前 AI SDK 不支持 Chat Completions API，请升级 @ai-sdk/openai")
    }
    return provider.chat(cm.modelId)
  }

  if (!provider.responses) {
    throw new Error("当前 AI SDK 不支持 Responses API，请升级 @ai-sdk/openai")
  }
  return provider.responses(cm.modelId)
}

// 测试连接（仅调用生成文本，不持久化）
export async function testCustomModelConnection(
  userId: string,
  cm: CustomModelRow
): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKey = await resolveApiKey(userId, cm)
    const model = createCustomLanguageModel(cm, apiKey)
    const result = await import("ai").then((ai) =>
      ai.generateText({
        model,
        prompt: "ping",
        maxOutputTokens: 8,
      })
    )
    // AI SDK v7 returns 'response' not 'responseId'
    if (result.response || result.text) {
      return { ok: true }
    }
    return { ok: false, error: "服务器无响应" }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误"
    return { ok: false, error: msg }
  }
}
