import { NextRequest } from "next/server"
import {
  streamText,
  wrapLanguageModel,
  extractReasoningMiddleware,
  toUIMessageStream,
  createUIMessageStreamResponse,
  APICallError,
  type ModelMessage,
  type UIMessageChunk,
} from "ai"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { createProviderInstance, getModel } from "@/lib/ai/registry"
import { buildCustomModelDefinition, resolveApiKey, createCustomLanguageModel } from "@/lib/ai/custom-model"
import { buildMemorySystemPrompt, getRelevantMemories, extractAndSaveMemories } from "@/lib/memory"
import { generateImage, extractImagePrompts, IMG_MARKER_REGEX } from "@/lib/ai/image"
import { generateConversationTitle } from "@/lib/ai/title-generator"
import { getStylePrompt } from "@/lib/ai/style"
import { splitReasoningTail } from "@/lib/utils"
import type { Attachment } from "@/lib/attachment-types"
import { sanitizeUploadName, readUploadFile, readUploadAsDataUrl } from "@/lib/uploads"
import type { ModelDefinition } from "@/lib/ai/types"

export const maxDuration = 60 // seconds – Vercel Pro allows up to 300

interface ChatRequestBody {
  model: string
  messages: IncomingMessage[]
  conversationId?: string
  deepThink?: boolean
  groupId?: string
  attachments?: Attachment[]
  styleOffset?: number // 0-100, default 50 if not provided
}

/** 客户端传入的消息（UIMessage 格式的结构化子集） */
interface IncomingPart {
  type: string
  text?: string
}

interface IncomingMessage {
  role: string
  content?: string | IncomingPart[]
  parts?: IncomingPart[]
  text?: string
}

/**
 * Convert incoming UIMessage format (from @ai-sdk/react useChat) to ModelMessage format
 * that streamText expects. UIMessages use `parts` array; ModelMessages use `content`.
 */
function convertToModelMessages(messages: IncomingMessage[]): ModelMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
    .map((m) => {
      // If message already has string content, use it directly
      if (typeof m.content === "string" && m.content) {
        return { role: m.role, content: m.content } as ModelMessage
      }
      // If content is a valid array of content parts, use it
      if (Array.isArray(m.content) && m.content.length > 0) {
        return { role: m.role, content: m.content } as unknown as ModelMessage
      }
      // AI SDK v7 UIMessage format: extract text from `parts`
      if (Array.isArray(m.parts)) {
        const textParts = m.parts
          .filter((p: IncomingPart) => p.type === "text")
          .map((p: IncomingPart) => p.text ?? "")
          .join("")
        if (textParts) {
          return { role: m.role, content: textParts } as ModelMessage
        }
      }
      // Fallback: use content or empty string
      return { role: m.role, content: String(m.content ?? m.text ?? "") } as ModelMessage
    })
    .filter((m) => m.content !== "")
}

const IMG_PREFIX = "[IMG:"
const IMG_PLACEHOLDER = "\n\n> 🎨 正在生成图片…\n\n"

/**
 * 过滤流式输出中的 [IMG:...] 标记(跨 chunk 安全),替换为占位提示。
 * 最终正文在 onFinish 中统一替换为真实图片后入库,
 * 客户端收到 finish 事件时会拉取库中最终内容覆盖显示。
 */
function createImgMarkerFilterStream(): TransformStream<UIMessageChunk, UIMessageChunk> {
  let pending = ""

  // 计算 buf 末尾与 IMG_PREFIX 前缀的最长重叠长度(标记可能被 chunk 截断)
  const longestPrefixAtEnd = (s: string): number => {
    for (let len = IMG_PREFIX.length; len > 0; len--) {
      if (s.endsWith(IMG_PREFIX.slice(0, len))) return len
    }
    return 0
  }

  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type !== "text-delta") {
        controller.enqueue(chunk)
        return
      }
      let buf = pending + chunk.delta
      pending = ""

      // 逐个替换完整的 [IMG:...] 标记;未闭合的标记挂起等待后续 chunk
      while (true) {
        const startIdx = buf.indexOf(IMG_PREFIX)
        if (startIdx === -1) {
          const hold = longestPrefixAtEnd(buf)
          if (hold > 0) {
            pending = buf.slice(buf.length - hold)
            buf = buf.slice(0, buf.length - hold)
          }
          break
        }
        const endIdx = buf.indexOf("]", startIdx)
        if (endIdx === -1) {
          pending = buf.slice(startIdx)
          buf = buf.slice(0, startIdx)
          break
        }
        buf = buf.slice(0, startIdx) + IMG_PLACEHOLDER + buf.slice(endIdx + 1)
      }

      if (buf) {
        controller.enqueue({ type: "text-delta", id: chunk.id, delta: buf })
      }
    },
    flush() {
      // 流结束时仍有未闭合标记(模型输出被截断),直接丢弃;
      // 最终入库内容在 onFinish 中会同样清理残留标记。
    },
  })
}

/** Extract plain text from a message (UIMessage or CoreMessage) */
function extractTextContent(msg: IncomingMessage): string {
  if (typeof msg.content === "string" && msg.content) return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p: IncomingPart) => p.type === "text")
      .map((p: IncomingPart) => p.text ?? "")
      .join("\n")
  }
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: IncomingPart) => p.type === "text")
      .map((p: IncomingPart) => p.text ?? "")
      .join("\n")
  }
  return String(msg.content ?? msg.text ?? "")
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const userId = session.user.id

    const body: ChatRequestBody = await req.json()
    const { model: modelId, messages: rawMessages, conversationId, deepThink, groupId } = body
    const attachments = Array.isArray(body.attachments) ? body.attachments : []
    const hasImageAttachments = attachments.some((a) => a.type.startsWith("image/"))

    console.log(`[chat] Processing request for user ${userId}, model: ${modelId}, messages: ${rawMessages?.length || 0}`)

    const requestedStyleOffset =
      typeof body.styleOffset === 'number' && Number.isFinite(body.styleOffset)
        ? Math.max(0, Math.min(100, Math.round(body.styleOffset)))
        : undefined

    let conversationStyleOffset = 50
    if (conversationId) {
      try {
        const conv = await prisma.conversation.findFirst({
          where: { id: conversationId, userId },
          select: { styleOffset: true },
        })
        conversationStyleOffset = conv?.styleOffset ?? 50
      } catch (err) {
        console.error("[chat] Failed to fetch conversation:", err)
      }
    }
    const effectiveStyleOffset = requestedStyleOffset ?? conversationStyleOffset
    console.log(`[chat] Style offset: ${effectiveStyleOffset} (body: ${requestedStyleOffset}, conv: ${conversationStyleOffset})`)

  // Validate model (builtin or custom)
  let modelDef: ModelDefinition
  let apiKey: string | undefined
  let provider: (modelId: string) => ReturnType<typeof createProviderInstance>
  let realModelId = modelId // for builtin models same as input; for custom use modelId from DB

  if (modelId.startsWith("custom:")) {
    const cmId = modelId.slice(7) // strip "custom:" prefix
    const cmRecord = await prisma.customModel.findFirst({ where: { id: cmId, userId } })
    if (!cmRecord) {
      console.error(`[chat] Unknown custom model: ${modelId} for user ${userId}`)
      return new Response(JSON.stringify({ error: `Unknown custom model: ${modelId}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    modelDef = buildCustomModelDefinition(cmRecord)
    realModelId = cmRecord.modelId
    // Resolve API key (own key > provider key > none/local)
    apiKey = await resolveApiKey(userId, cmRecord)
    // Build provider instance (native for provider-key reuse without baseURL; OpenAI-compatible otherwise)
    provider = () => createCustomLanguageModel(cmRecord, apiKey)
  } else {
    const builtinModelDef = getModel(modelId)
    if (!builtinModelDef) {
      console.error(`[chat] Unknown model: ${modelId}`)
      return new Response(JSON.stringify({ error: `Unknown model: ${modelId}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    modelDef = builtinModelDef

    // Fetch and decrypt the user's API key for this provider
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: modelDef.provider,
        },
      },
    })

    // For Qwen/DashScope: fall back to environment variable API key if user hasn't configured one
    // This enables free-tier access without requiring users to manually configure API keys
    if (!apiKeyRecord && modelDef.provider === "qianwen") {
      apiKey = process.env.API_KEY_DASHSCOPE
      if (!apiKey) {
        console.error(`[chat] No DashScope API key configured for user ${userId}`)
        return new Response(
          JSON.stringify({ error: `DashScope API key not configured in server environment variables (API_KEY_DASHSCOPE)` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
      console.log("[chat] Using DashScope env var API key for Qwen models")
    } else if (!apiKeyRecord) {
      console.error(`[chat] No API key configured for ${modelDef.provider} for user ${userId}`)
      return new Response(
        JSON.stringify({ error: `No API key configured for ${modelDef.provider}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    } else {
      try {
        apiKey = decrypt(apiKeyRecord.encryptedKey)
      } catch (err) {
        console.error(`[chat] Failed to decrypt API key for user ${userId}:`, err)
        return new Response(
          JSON.stringify({ error: `Failed to decrypt API key` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      }
    }

    try {
      provider = createProviderInstance(modelId, apiKey)
    } catch (err) {
      console.error(`[chat] Failed to create provider instance for ${modelId}:`, err)
      return new Response(
        JSON.stringify({ error: `Failed to initialize AI provider` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }
  }

  // Convert incoming messages to ModelMessage format for streamText
  const messages = convertToModelMessages(rawMessages)

  // 附件内容注入:图片转多模态 image part(仅视觉模型),文本文件读入正文
  if (attachments.length > 0) {
    const userMsgIdx = messages.map((m) => m.role).lastIndexOf("user")
    if (userMsgIdx !== -1) {
      type ContentPart = { type: string; text?: string; image?: unknown }
      const contentParts: ContentPart[] = []
      for (const att of attachments) {
        const fileName = sanitizeUploadName(att.url)
        if (!fileName) continue
        if (att.type.startsWith("image/")) {
          if (modelDef.supportsVision) {
            const dataUrl = await readUploadAsDataUrl(fileName, att.type)
            if (dataUrl) {
              contentParts.push({ type: "image", image: dataUrl })
            }
          } else {
            contentParts.push({
              type: "text",
              text: `（用户上传了一张图片「${att.name}」，但你无法查看图片内容。请直接告诉用户：你无法查看图片，需要切换到支持视觉的模型后重新发送；不要尝试描述、猜测或生成图片。）`,
            })
          }
        } else if (att.type.startsWith("text/")) {
          const buf = await readUploadFile(fileName)
          if (buf) {
            // 截断超长文本,避免撑爆上下文
            const text = buf.toString("utf-8").slice(0, 20000)
            contentParts.push({ type: "text", text: `【附件 ${att.name}】\n${text}` })
          }
        } else {
          contentParts.push({
            type: "text",
            text: `（用户上传了文件 ${att.name}，当前版本暂不支持解析该类型）`,
          })
        }
      }
      if (contentParts.length > 0) {
        const orig = messages[userMsgIdx].content
        if (typeof orig === "string" && orig) {
          contentParts.push({ type: "text", text: orig })
        }
        messages[userMsgIdx] = {
          role: "user",
          content: contentParts,
        } as ModelMessage
      }
    }
  }

  // Extract text from the last user message for persistence & memory relevance
  const lastRawUserMsg = [...rawMessages].reverse().find((m) => m.role === "user")
  const userContent = lastRawUserMsg ? extractTextContent(lastRawUserMsg) : ""

  // Load the user's long-term memories (if the feature is enabled)
  const memorySettings = await prisma.user.findUnique({
    where: { id: userId },
    select: { memoryEnabled: true, clarifyEnabled: true },
  })
  const memoryEnabled = memorySettings?.memoryEnabled ?? true
  const clarifyEnabled = memorySettings?.clarifyEnabled ?? true

  let memorySystemPrompt = ""
  if (memoryEnabled) {
    const memories = await prisma.memory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    })
    if (memories.length > 0) {
      const relevant = getRelevantMemories(memories, userContent || "")
      memorySystemPrompt = buildMemorySystemPrompt(relevant)
    }
  }

  // 自助反问:告诉模型在缺少关键信息时先提问,而不是直接下结论
  const clarifySystemPrompt = [
    '## 自助反问',
    '用户提出个人决策/推荐类问题（如"我该选哪个""适不适合买 X"）且缺少关键信息时，先提 2-4 个简短问题再作答：编号列表、用用户语言、覆盖预算/场景/现状等关键维度。最多追问两轮、不重复已问的问题，两轮后必须给出结论并说明假设。',
    '事实/知识/代码/翻译类问题，或信息已足够时直接回答，不要反问。',
  ].join('\n')

  // Deep thinking: for non-reasoning models, add a system prompt and extract thinking via middleware
  let model = provider(realModelId)
  const baseModel = model // 保留原始模型引用，用于标题生成等后台任务
  const systemParts: string[] = []
  if (memorySystemPrompt) systemParts.push(memorySystemPrompt)
  if (clarifyEnabled) systemParts.push(clarifySystemPrompt)

  // Style prompt - add conversation style settings
  systemParts.push(getStylePrompt(effectiveStyleOffset))

  // Visualization capabilities — tell the model to auto-use diagrams/charts
  systemParts.push([
    '## 可视化能力',
    '主动用代码块让回答更直观，无需用户要求：',
    '- 流程图/时序图/架构图等用 ```mermaid',
    '- 数据图表用 ```chart 加 JSON：{"type":"bar|line|pie|area","data":{"labels":[],"datasets":[{"label":"","data":[]}]},"title":""}',
    '- 数学公式用 $...$（行内）或 $$...$$（独立行，LaTeX 语法）',
    '比较数据时自动配图表，讲流程时自动配 mermaid，数学内容一律用 LaTeX。',
  ].join('\n'))

  // Image generation — tell the model how to request images
  // 非视觉模型收到图片附件时移除生图能力提示,避免模型被"图片"字眼诱导误触发生图
  if (!(hasImageAttachments && !modelDef.supportsVision)) {
    systemParts.push([
      '## 生图能力',
      '用户想要生成图片时，在图片应出现的位置输出 [IMG:详细描述]（用用户语言描述主体、风格、构图、光线），每条回复最多 2 张；图表/示意图请用上面的 mermaid/chart，不要用 [IMG]。',
    ].join('\n'))
  }

  // Always enable reasoning extraction for models that support it or deepThink is enabled
  const shouldExtractReasoning = deepThink || modelDef.supportsReasoning
  
  if (shouldExtractReasoning) {
    // Add thinking prompt for non-reasoning models
    if (!modelDef.supportsReasoning) {
      systemParts.push(
        [
          'You are a thoughtful AI assistant. You MUST think step by step before giving the final answer.',
          'Format your response EXACTLY as follows:',
          '- Put your ENTIRE reasoning process inside one pair of <think> and </think> tags, with nothing else inside.',
          '- Put your final answer AFTER the closing </think> tag, on its own.',
          '- Do NOT skip the tags, do NOT use any other tag name, and do NOT put reasoning outside the tags.',
          'Example:',
          '<think>First, ... Then, ... Therefore, ...</think>',
          'Final answer here.',
        ].join('\n')
      )
    }

    // Apply reasoning extraction middleware for models that need it (not DeepSeek native)
    // DeepSeek's deepseek-reasoner has NATIVE reasoning_content support via API
    // Third-party providers (Fireworks, Groq, Together, etc.) require extractReasoningMiddleware
    const isDeepSeekNativeReasoning = modelDef.provider === 'deepseek' && modelDef.supportsReasoning
    if (!isDeepSeekNativeReasoning) {
      model = wrapLanguageModel({
        model,
        middleware: extractReasoningMiddleware({ tagName: 'think' }),
      })
    }
  }
  const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined

  // Ensure a conversation exists
  let convId = conversationId
  let isNewConversation = false
  if (!convId) {
    const conv = await prisma.conversation.create({
      data: {
        userId,
        title: userContent.slice(0, 40) || "新对话",
        model: modelId,
        styleOffset: effectiveStyleOffset,
        ...(groupId ? { mode: "compare" } : {}),
      },
    })
    convId = conv.id
    isNewConversation = true
  }

  // Persist the last user message before streaming
  if (userContent) {
    if (groupId) {
      // 对比模式: N 个泳道并发到达,事务内查重防止同一条用户消息入库多次
      await prisma.$transaction(async (tx) => {
        const existing = await tx.message.findFirst({
          where: { conversationId: convId, groupId, role: "user" },
          select: { id: true },
        })
        if (!existing) {
          await tx.message.create({
            data: {
              conversationId: convId,
              role: "user",
              content: userContent,
              groupId,
              ...(attachments.length > 0
                ? { attachments: JSON.stringify(attachments) }
                : {}),
            },
          })
        }
      })
    } else {
      await prisma.message.create({
        data: {
          conversationId: convId,
          role: "user",
          content: userContent,
          ...(attachments.length > 0
            ? { attachments: JSON.stringify(attachments) }
            : {}),
        },
      })
    }
  }

  // Stream the response
  const result = streamText({
    model,
    messages,
    ...(system ? { system } : {}),
    onFinish: async ({ text, reasoningText, finishReason, usage }) => {
      // 流出错且无任何内容时不落库,避免历史中出现空白助手消息
      if (finishReason === 'error' && !text && !reasoningText) return

      // Ensure content is always a non-null string (Prisma schema requires String, not String?)
      let content = text ?? ""
      let savedReasoning = reasoningText ?? null

      // 兜底:模型把全部内容(含最终答案)都放进了 <think> 标签,导致正文为空。
      // 此时从推理尾部拆出答案部分作为正文,避免用户只看到思考过程而没有任何回答。
      if (!content.trim() && savedReasoning?.trim()) {
        const { head, tail } = splitReasoningTail(savedReasoning)
        content = tail
        savedReasoning = head || null
      }

      // 检测 [IMG:...] 标记并调用通义万相生成图片(使用百炼/千问的 Key)
      const imagePrompts = extractImagePrompts(content)
      if (imagePrompts.length > 0) {
        const dashKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId, provider: "qianwen" } },
        })
        if (dashKeyRecord) {
          const dashKey = decrypt(dashKeyRecord.encryptedKey)
          const replacements: string[] = []
          for (const prompt of imagePrompts) {
            try {
              const localUrl = await generateImage(prompt, dashKey)
              replacements.push(`![${prompt}](${localUrl})`)
            } catch (err) {
              const reason = err instanceof Error ? err.message : "未知原因"
              console.error("[chat] Image generation failed:", reason)
              replacements.push(`> ⚠️ 图片生成失败:${reason.replace(/\s+/g, " ")}`)
            }
          }
          let idx = 0
          content = content.replace(IMG_MARKER_REGEX, () => replacements[idx++])
        } else {
          // 未配置通义千问(百炼)Key,静默移除标记
          content = content.replace(IMG_MARKER_REGEX, "")
        }
      }
      // 移除模型输出被截断时残留的未闭合标记(避免原始标记入库)
      content = content.replace(/\[IMG:[^\]]*$/g, "")

      try {
        if (groupId) {
          // 对比模式: 重新生成时先删除本泳道同组旧消息,避免重复入库
          await prisma.message.deleteMany({
            where: { conversationId: convId!, groupId, role: "assistant", model: modelId },
          })
        }
        // Persist assistant response (with reasoning + token usage if available)
        await prisma.message.create({
          data: {
            conversationId: convId!,
            role: "assistant",
            content,
            reasoning: savedReasoning,
            model: modelId,
            // token 消耗统计(某些提供商可能不返回 usage)
            promptTokens: usage?.inputTokens,
            completionTokens: usage?.outputTokens,
            ...(groupId ? { groupId } : {}),
          },
        })
        // Update conversation: timestamp + auto-generate title on first message
        const titleUpdate = isNewConversation
          ? { title: userContent.slice(0, 30) || "新对话" }
          : {}
        await prisma.conversation.update({
          where: { id: convId! },
          data: { updatedAt: new Date(), ...titleUpdate },
        })
        // 新会话: 异步用 AI 生成更精准的标题(不阻塞 onFinish)
        if (isNewConversation && userContent) {
          const convIdCapture = convId!
          generateConversationTitle(userContent, baseModel).then(async (aiTitle) => {
            try {
              await prisma.conversation.update({
                where: { id: convIdCapture },
                data: { title: aiTitle },
              })
            } catch (err) {
              console.error('[chat] Failed to update AI-generated title:', err)
            }
          })
        }
        // Extract long-term memories in the background (never blocks the chat)
        if (memoryEnabled && content) {
          extractAndSaveMemories({
            userId,
            model: provider(realModelId),
            userText: userContent,
            assistantText: content,
          })
        }
      } catch (error) {
        // AI SDK's notify() silently swallows errors from onFinish callbacks,
        // so we must catch and log them ourselves to avoid silent data loss.
        console.error("[chat] Failed to persist assistant message:", error)
      }
    },
  })

  const responseHeaders: Record<string, string> = { "X-Conversation-Id": convId }
  if (isNewConversation) {
    const title = userContent.slice(0, 30) || "新对话"
    responseHeaders["X-Conversation-Title"] = encodeURIComponent(title)
  }

  // 手动构建 UI 消息流：过滤掉 [IMG:...] 标记再发给客户端
  const uiStream = toUIMessageStream({
    stream: result.stream,
    sendReasoning: true,
    sendStart: true,
    sendFinish: true,
    // 默认只给客户端 "An error occurred.",这里把上游真实错误转成可读消息
    onError: (error) => {
      console.error('[chat] Stream error:', error)
      if (error instanceof APICallError) {
        const status: number | undefined = error.statusCode ?? undefined
        if (status === 401) {
          return '服务商鉴权失败 (401),请检查该模型的 API Key 是否有效'
        }
        if (status === 403) {
          return '服务商拒绝请求 (403):额度不足或无权限，请检查账户余额'
        }
        if (status === 429) {
          return '请求过于频繁或超出限额 (429),请稍后重试'
        }
        if (typeof status === 'number' && status >= 500) {
          return `服务商服务器错误 (${status}),请稍后重试`
        }
        return typeof status === 'number'
          ? `服务商请求失败 (HTTP ${status}),请稍后重试`
          : '服务商请求失败，请稍后重试'
      }
      return '生成过程中出错，请重试'
    },
  })

  return createUIMessageStreamResponse({
    headers: responseHeaders,
    stream: uiStream.pipeThrough(createImgMarkerFilterStream()),
  })
  } catch (error) {
    console.error("[chat] Error processing chat request:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  }
}
