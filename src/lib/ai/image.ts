import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { nanoid } from "nanoid"

// 通义万相文生图(旧版异步接口,无需工作空间,普通百炼 API Key 直连)
const WANX_BASE = "https://dashscope.aliyuncs.com/api/v1"
const WANX_MODEL = "wanx2.1-t2i-turbo" // 极速版:几秒出图,性价比高
const MAX_WAIT_MS = 45_000 // 最长等待 45s,避免拖垮整个请求
const POLL_INTERVAL_MS = 2_000

/** 图片生成标记:模型输出 [IMG:描述词] 触发生图 */
export const IMG_MARKER_REGEX = /\[IMG:([^\]]+)\]/g

interface WanxCreateOutput {
  task_id?: string
  message?: string
  code?: string
}

interface WanxTaskOutput {
  task_status?: string
  message?: string
  code?: string
  results?: { url?: string }[]
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 调用通义万相生成一张图片并转存到 public/uploads。
 * 官方返回的图片链接 24 小时失效,必须下载到本地才能保证历史记录长期可看。
 */
export async function generateImage(prompt: string, apiKey: string): Promise<string> {
  // 1. 创建异步生图任务
  const createRes = await fetch(`${WANX_BASE}/services/aigc/text2image/image-synthesis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: WANX_MODEL,
      input: { prompt: prompt.slice(0, 500) },
      parameters: { size: "1024*1024", n: 1 },
    }),
  })

  const createJson = (await createRes.json().catch(() => ({}))) as {
    output?: WanxCreateOutput
    message?: string
  }
  const taskId = createJson.output?.task_id
  if (!createRes.ok || !taskId) {
    const msg = createJson.output?.message || createJson.message || `HTTP ${createRes.status}`
    throw new Error(`创建图片任务失败: ${msg}`)
  }

  // 2. 轮询任务结果: PENDING → RUNNING → SUCCEEDED / FAILED
  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const pollRes = await fetch(`${WANX_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const pollJson = (await pollRes.json().catch(() => ({}))) as { output?: WanxTaskOutput }
    const status = pollJson.output?.task_status

    if (status === "SUCCEEDED") {
      const url = pollJson.output?.results?.[0]?.url
      if (!url) throw new Error("图片生成成功,但未返回图片链接")
      return await downloadAndSave(url)
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      const reason = pollJson.output?.message || pollJson.output?.code || "未知原因"
      throw new Error(`图片生成失败: ${reason}`)
    }
    // PENDING / RUNNING → 继续等待
  }
  throw new Error("图片生成超时,请稍后重试")
}

/** 下载远程图片并转存到 public/uploads */
async function downloadAndSave(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载生成图片失败: HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const name = `wanx-${nanoid(12)}.png`
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
    const prompt = m[1].trim()
    if (prompt) prompts.push(prompt)
  }
  return prompts
}
