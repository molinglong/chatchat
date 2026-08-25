import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { nanoid } from "nanoid"
import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import {
  BUILTIN_IMAGE_MODELS,
  type BuiltinImageModel,
  type ImageProvider,
} from "./image-models.config"

// 兼容旧调用方
export const BUILTIN_MODELS = BUILTIN_IMAGE_MODELS

export type BuiltinModelId = string
export type { BuiltinImageModel, ImageProvider }

export function getBuiltinModel(id: string): BuiltinImageModel | undefined {
  return BUILTIN_IMAGE_MODELS.find((m) => m.id === id)
}

export const IMG_MARKER_REGEX = /\[IMG:([^\]]+)\]/g

const MAX_WAIT_MS = 45_000
const POLL_INTERVAL_MS = 2_000
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// 统一返回类型
export interface GenerationResult {
  url: string
  model: string
  width: number
  height: number
}

/** 根据 modelId 判断 provider 类型 */
function getProviderType(modelId: string): "builtin" | "custom" {
  return modelId.startsWith("builtin:") ? "builtin" : "custom"
}

// ─── 通义万相 (qianwen) ────────────────────────────────────────────────────────
async function generateWanx(
  prompt: string,
  apiKey: string,
  modelId: string,
  size: string
): Promise<GenerationResult> {
  const BASE = "https://dashscope.aliyuncs.com/api/v1"
  const selectedSize = size || "1024*1024"
  const [width, height] = selectedSize.split("*").map(Number)

  const createRes = await fetch(`${BASE}/services/aigc/text2image/image-synthesis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: modelId,
      input: { prompt: prompt.slice(0, 500) },
      parameters: { size: selectedSize, n: 1 },
    }),
  })

  const createJson = (await createRes.json().catch(() => ({}))) as {
    output?: { task_id?: string; message?: string }
    message?: string
  }
  const taskId = createJson.output?.task_id
  if (!createRes.ok || !taskId) {
    const msg = createJson.output?.message || createJson.message || `HTTP ${createRes.status}`
    throw new Error(`创建图片任务失败: ${msg}`)
  }

  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const pollRes = await fetch(`${BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const pollJson = (await pollRes.json().catch(() => ({}))) as {
      output?: { task_status?: string; results?: { url?: string }[]; message?: string; code?: string }
    }
    const status = pollJson.output?.task_status
    if (status === "SUCCEEDED") {
      const url = pollJson.output?.results?.[0]?.url
      if (!url) throw new Error("图片生成成功,但未返回图片链接")
      const saved = await downloadAndSave(url)
      return { url: saved, model: modelId, width, height }
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw new Error(`图片生成失败: ${pollJson.output?.message || pollJson.output?.code || "未知原因"}`)
    }
  }
  throw new Error("图片生成超时,请稍后重试")
}

// ─── OpenAI 兼容端点 (DALL-E / SDXL / 自定义) ─────────────────────────────────
async function generateOpenAICompatible(
  prompt: string,
  apiKey: string,
  modelId: string,
  baseURL: string,
  size: string
): Promise<GenerationResult> {
  // 统一格式: size → width x height
  const sizeMap: Record<string, { width: number; height: number }> = {
    "1024*1024": { width: 1024, height: 1024 },
    "720*1280": { width: 720, height: 1280 },
    "1280*720": { width: 1280, height: 720 },
    "1024x1024": { width: 1024, height: 1024 },
    "1024x1792": { width: 1024, height: 1792 },
    "1792x1024": { width: 1792, height: 1024 },
    "256x256": { width: 256, height: 256 },
    "512x512": { width: 512, height: 512 },
    "1152x896": { width: 1152, height: 896 },
    "1216x832": { width: 1216, height: 832 },
    "1344x768": { width: 1344, height: 768 },
    "1536x640": { width: 1536, height: 640 },
  }
  const sizeKey = size || "1024*1024"
  const { width, height } = sizeMap[sizeKey] ?? { width: 1024, height: 1024 }

  // DALL-E / gpt-image-* 用 size 字段；SDXL / Stable Diffusion 等用 width/height
  const isDalle = modelId.startsWith("dall-e")
  const isGptImage = modelId.startsWith("gpt-image")
  const useSize = isDalle || isGptImage
  const endpoint = baseURL.replace(/\/$/, "") + "/images/generations"

  const body: Record<string, unknown> = {
    model: modelId,
    prompt: prompt.slice(0, 4000),
    n: 1,
  }

  if (useSize) {
    // DALL-E / gpt-image: 用 size 字段
    body.size = sizeKey.replace("*", "x")
  } else {
    // SDXL / Stable Diffusion 等: 用 width/height
    body.width = width
    body.height = height
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as {
    data?: { url?: string; b64_json?: string }[]
    error?: { message?: string }
  }
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`)
  }
  const item = json.data?.[0]
  if (!item) throw new Error("图片生成成功但无返回数据")

  if (item.url) {
    const saved = await downloadAndSave(item.url)
    return { url: saved, model: modelId, width, height }
  }
  if (item.b64_json) {
    const saved = await saveBase64(item.b64_json)
    return { url: saved, model: modelId, width, height }
  }
  throw new Error("图片生成成功但无 URL 或 base64 数据")
}

// ─── Stability AI ──────────────────────────────────────────────────────────────
async function generateStability(
  prompt: string,
  apiKey: string,
  modelId: string,
  size: string
): Promise<GenerationResult> {
  const sizeMap: Record<string, { width: number; height: number }> = {
    "1024x1024": { width: 1024, height: 1024 },
    "1152x896": { width: 1152, height: 896 },
    "1216x832": { width: 1216, height: 832 },
    "1344x768": { width: 1344, height: 768 },
    "1536x640": { width: 1536, height: 640 },
  }
  const sizeKey = size || "1024x1024"
  const { width, height } = sizeMap[sizeKey] ?? { width: 1024, height: 1024 }

  const res = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      text_prompts: [{ text: prompt.slice(0, 4000) }],
      cfg_scale: 7,
      height,
      width,
      samples: 1,
      steps: 30,
    }),
  })

  const json = (await res.json().catch(() => ({}))) as {
    artifacts?: { base64?: string; finishReason?: string }[]
    error?: { message?: string }
  }
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`)
  }
  const artifact = json.artifacts?.[0]
  if (!artifact?.base64) throw new Error("图片生成失败或无返回")
  const saved = await saveBase64(artifact.base64)
  return { url: saved, model: modelId, width, height }
}

// ─── 统一入口 ─────────────────────────────────────────────────────────────────

/**
 * 根据 modelId 加载模型配置，解析 API Key，然后按 adapter 分发。
 *
 * 内置模型配置来自 image-models.config.ts,新增模型无需改动本函数。
 * 自定义模型按 baseURL 自动选择 adapter。
 */
export async function generateImage(
  userId: string,
  modelId: string,
  prompt: string,
  size?: string
): Promise<GenerationResult> {
  const providerType = getProviderType(modelId)

  let apiKey: string | undefined
  let actualModelId: string
  let baseURL: string | undefined
  let adapter: ImageAdapter
  let providerKey: string

  if (providerType === "builtin") {
    const builtin = getBuiltinModel(modelId)
    if (!builtin) throw new Error(`未知的内置模型: ${modelId}`)
    actualModelId = builtin.modelId
    baseURL = builtin.baseURL
    adapter = builtin.adapter
    providerKey = builtin.provider

    apiKey = await resolveProviderKey(userId, providerKey)
    if (!apiKey) throw new Error(`未配置 ${providerKey} API Key，请先在设置中配置`)
  } else {
    // custom: 从数据库加载用户自定义模型配置
    // custom:xxxx 里的 xxxx 是 ImageModel 表的主键 id
    const dbId = modelId.startsWith("custom:") ? modelId.slice(7) : modelId
    const customModel = await prisma.imageModel.findFirst({
      where: { id: dbId, userId },
    })
    if (!customModel) throw new Error(`未找到自定义模型配置: ${modelId}`)

    actualModelId = customModel.modelId
    baseURL = customModel.baseURL

    // 解析 API Key
    if (customModel.apiKeySource === "own" && customModel.apiKey) {
      apiKey = decrypt(customModel.apiKey)
    } else if (customModel.keyProvider) {
      apiKey = await resolveProviderKey(userId, customModel.keyProvider)
    }
    if (!apiKey) throw new Error("未找到有效的 API Key，请检查模型配置")

    // 自定义模型按 baseURL 自动选 adapter
    if (baseURL.toLowerCase().includes("stability")) {
      adapter = "stability"
    } else {
      adapter = "openai"
    }
    providerKey = customModel.keyProvider ?? "custom"
  }

  // 按 adapter 分发(查表式,新增 adapter 只需加一条)
  return dispatchAdapter({
    adapter,
    prompt,
    apiKey,
    actualModelId,
    baseURL,
    size,
    providerKey,
  })
}

/** 查 Key:数据库优先,环境变量兜底 */
async function resolveProviderKey(
  userId: string,
  provider: string
): Promise<string | undefined> {
  const keyRec = await prisma.apiKey.findUnique({
    where: { userId_provider: { userId, provider } },
  })
  if (keyRec) return decrypt(keyRec.encryptedKey)
  const envMap: Record<string, string | undefined> = {
    qianwen: process.env.API_KEY_DASHSCOPE,
    openai: process.env.OPENAI_API_KEY,
    stability: process.env.STABILITY_API_KEY,
  }
  return envMap[provider] || undefined
}

/** adapter 路由表 —— 新增 provider 时只需在这里加一项 */
async function dispatchAdapter(args: {
  adapter: ImageAdapter
  prompt: string
  apiKey: string
  actualModelId: string
  baseURL?: string
  size?: string
  providerKey: string
}): Promise<GenerationResult> {
  const { adapter, prompt, apiKey, actualModelId, baseURL, size } = args

  switch (adapter) {
    case "qianwen":
      return generateWanx(prompt, apiKey, actualModelId, size)
    case "openai": {
      if (!baseURL) throw new Error("OpenAI 兼容端点缺少 baseURL")
      return generateOpenAICompatible(prompt, apiKey, actualModelId, baseURL, size)
    }
    case "stability":
      return generateStability(prompt, apiKey, actualModelId, size)
    default: {
      const _exhaustive: never = adapter
      throw new Error(`不支持的生图 adapter: ${String(_exhaustive)}`)
    }
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
async function downloadAndSave(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载生成图片失败: HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const name = `gen-${nanoid(12)}.png`
  const uploadDir = path.join(process.cwd(), "public", "uploads")
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, name), buffer)
  return `/uploads/${name}`
}

async function saveBase64(b64: string): Promise<string> {
  const buffer = Buffer.from(b64, "base64")
  const name = `gen-${nanoid(12)}.png`
  const uploadDir = path.join(process.cwd(), "public", "uploads")
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, name), buffer)
  return `/uploads/${name}`
}

/** 从文本中提取所有 [IMG:...] 标记内的提示词 */
export function extractImagePrompts(text: string): string[] {
  const prompts: string[] = []
  const re = new RegExp(IMG_MARKER_REGEX.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim()
    if (p) prompts.push(p)
  }
  return prompts
}
