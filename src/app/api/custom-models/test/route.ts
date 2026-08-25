import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  resolveApiKey,
  createCustomLanguageModel,
  type CustomModelRow,
} from "@/lib/ai/custom-model"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { id } = body

  const userId = session.user.id
  let cmRecord: CustomModelRow

  try {
    if (id) {
      // 测试已保存的模型
      const saved = await prisma.customModel.findFirst({
        where: { id, userId },
      })
      if (!saved) {
        return NextResponse.json({ error: "模型不存在" }, { status: 404 })
      }
      cmRecord = saved
    } else {
      // 测试未保存的字段（直接来自表单）
      const { name, modelId, baseURL, protocol, apiKey, keyProvider } = body
      if (!modelId) {
        return NextResponse.json({ error: "模型 ID 是必填项" }, { status: 400 })
      }
      if (!baseURL && !keyProvider) {
        return NextResponse.json(
          { error: "Base URL 必填（复用服务商 Key 时可留空）" },
          { status: 400 }
        )
      }
      // 模拟构建 CustomModelRow，无需数据库
      cmRecord = {
        id: "test",
        userId,
        name: name || "",
        modelId,
        baseURL: baseURL || "",
        protocol: protocol || "auto",
        apiKey: apiKey || null,
        keyProvider: keyProvider || null,
        contextWindow: 32768,
        supportsVision: false,
        supportsFiles: false,
        supportsReasoning: false,
      }
    }

    const apiKeyResolved = await resolveApiKey(userId, cmRecord)
    const model = createCustomLanguageModel(cmRecord, apiKeyResolved)
    const result = await import("ai").then((ai) =>
      ai.generateText({
        model,
        prompt: "ping",
        maxOutputTokens: 8,
      })
    )

    if (result.response || result.text) {
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json(
      { ok: false, error: "服务器无响应" },
      { status: 502 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误"
    const details = err && typeof err === "object" && "responseBody" in err
      ? String(err.responseBody)
      : undefined
    const statusCode = err && typeof err === "object" && "statusCode" in err
      ? Number(err.statusCode)
      : undefined
    const error = details && !message.includes(details) ? `${message}: ${details}` : message
    console.error("[custom-model] Test error:", err)
    return NextResponse.json(
      { ok: false, error },
      { status: statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 502 }
    )
  }
}
