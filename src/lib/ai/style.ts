/**
 * AI 对话风格参数配置
 */

export interface StyleConfig {
  offset: number; // 0-100 (0=正式严肃，50=平衡中性，100=幽默风趣)
}

/**
 * 根据风格偏移量生成对应的 System Prompt
 * @param offset 风格偏移量 0-100
 */
export function getStylePrompt(offset: number = 50): string {
  const normalized = Math.max(0, Math.min(100, offset))
  
  // 0-30: 偏向正式严肃
  // 30-70: 平衡中性 (默认 50)
  // 70-100: 偏向幽默风趣
  
  if (normalized <= 30) {
    // 正式模式
    return [
      '## 对话风格：正式严肃',
      '以专业、严谨的方式进行对话:',
      '- 语言简洁准确，避免口语化表达',
      '- 使用规范的专业术语',
      '- 注重事实准确性和逻辑严密性',
      '- 保持客观中立，不随意添加玩笑或调侃',
      '- 结构化表达，条理清晰',
      '- 适合工作场景和专业讨论',
    ].join('\n')
  } else if (normalized >= 70) {
    // 幽默模式
    return [
      '## 对话风格：幽默风趣',
      '让对话轻松有趣，但不失专业性:',
      '- 适当使用网络流行语、梗和幽默表达',
      '- 语气活泼，可以加入适度的调侃',
      '- 用生动的例子和比喻解释概念',
      '- 在严肃话题外可以开点小玩笑',
      '- 保持友好亲切，拉近距离感',
      '- 但要注意分寸，不降低回答质量',
    ].join('\n')
  } else {
    // 30-70: 平衡模式 (接近线性插值)
    return [
      '## 对话风格：平衡自然',
      '保持专业友好的对话方式:',
      '- 语言自然流畅，不过于正式也不过度随意',
      '- 适度使用轻松的表达方式',
      '- 注重实用性和可读性',
      '- 在专业内容外可以有适度的亲和力',
    ].join('\n')
  }
}

/**
 * 获取风格的可视化标签
 * @param offset 风格偏移量
 */
export function getStyleLabel(offset: number = 50): string {
  if (offset <= 30) {
    return '严肃'
  } else if (offset >= 70) {
    return '幽默'
  } else {
    return '平衡'
  }
}
