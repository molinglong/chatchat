import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * Token 消耗统计接口
 * 返回: 总用量、按模型分组、按天分组(最近 30 天,北京时间)
 * 统计来源: 每条 assistant 消息保存的 promptTokens / completionTokens
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  // 取该用户所有带 token 记录的助手消息(仅取聚合所需字段)
  const messages = await prisma.message.findMany({
    where: {
      role: "assistant",
      conversation: { userId },
      OR: [
        { promptTokens: { not: null } },
        { completionTokens: { not: null } },
      ],
    },
    select: {
      model: true,
      promptTokens: true,
      completionTokens: true,
      createdAt: true,
    },
  })

  // ---- 聚合 ----
  let totalPrompt = 0
  let totalCompletion = 0

  const modelMap = new Map<
    string,
    { promptTokens: number; completionTokens: number; messages: number }
  >()
  const dayMap = new Map<string, number>()

  // 最近 30 天日期序列(北京时间),保证无数据的天也出现在结果中
  const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
  const dayKeyOf = (d: Date) =>
    new Date(d.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10)
  const today = new Date()
  const recentDays: string[] = []
  for (let i = 29; i >= 0; i--) {
    recentDays.push(dayKeyOf(new Date(today.getTime() - i * 24 * 60 * 60 * 1000)))
  }
  const recentDaySet = new Set(recentDays)
  for (const day of recentDays) dayMap.set(day, 0)

  for (const m of messages) {
    const prompt = m.promptTokens ?? 0
    const completion = m.completionTokens ?? 0
    totalPrompt += prompt
    totalCompletion += completion

    const modelKey = m.model || "未知模型"
    const entry = modelMap.get(modelKey) ?? {
      promptTokens: 0,
      completionTokens: 0,
      messages: 0,
    }
    entry.promptTokens += prompt
    entry.completionTokens += completion
    entry.messages += 1
    modelMap.set(modelKey, entry)

    const day = dayKeyOf(m.createdAt)
    if (recentDaySet.has(day)) {
      dayMap.set(day, (dayMap.get(day) ?? 0) + prompt + completion)
    }
  }

  const byModel = Array.from(modelMap.entries())
    .map(([model, v]) => ({
      model,
      promptTokens: v.promptTokens,
      completionTokens: v.completionTokens,
      totalTokens: v.promptTokens + v.completionTokens,
      messages: v.messages,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens)

  const byDay = recentDays.map((date) => ({
    date,
    totalTokens: dayMap.get(date) ?? 0,
  }))

  return NextResponse.json({
    totals: {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      messages: messages.length,
    },
    byModel,
    byDay,
  })
}
