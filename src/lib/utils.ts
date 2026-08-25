import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 深度思考兜底拆分:当模型把全部内容(含最终答案)都放进 <think> 标签时,
 * 标签抽取后的正文为空。此时从推理文本尾部拆出答案部分作为正文。
 *
 * 拆分优先级:
 * 1. 按 "【答案】" / "答案：" 等标记从最后一个出现位置切分
 * 2. 无标记时取最后一个非空行作为正文
 * 3. 单行无标记时整个推理作为正文(推理置空,等价于模型未用标签)
 */
export function splitReasoningTail(reasoning: string): { head: string; tail: string } {
  const markers = ["【答案】", "答案：", "答案:", "Answer:", "Answer："]
  for (const marker of markers) {
    const idx = reasoning.lastIndexOf(marker)
    if (idx >= 0) {
      const tail = reasoning.slice(idx).trim()
      // 标记后面必须有实际内容才切分,避免切出空正文
      if (tail.length > marker.length) {
        return { head: reasoning.slice(0, idx).trim(), tail }
      }
    }
  }
  const lines = reasoning
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "")
  if (lines.length > 1) {
    const tail = lines.pop()!.trim()
    if (tail) {
      return { head: lines.join("\n").trim(), tail }
    }
  }
  return { head: "", tail: reasoning.trim() }
}
