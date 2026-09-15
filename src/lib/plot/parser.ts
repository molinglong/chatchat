/**
 * PlotBlock 块语法解析器
 *
 * 把 AI 输出的 ```plot 代码块转成 function-plot options。
 *
 * 支持语法（每行一条）：
 *   y = sin(x)
 *   y = cos(x), dashed
 *   y = ln(x), dotted
 *   y = x^2, color: #ff0000
 *   y = tan(x), range: [-1.5, 1.5]
 *
 *   range: [-π, 2π]                 ← 全局 x 范围,π / e / sqrt 等常量允许
 *   yrange: [-2, 5]                 ← 全局 y 范围(可选)
 *
 *   mark: (π/2, 1) "极大值"          ← 标注点
 *   mark: (0, 0) "原点"              ← 多标注
 *
 *   title: "三角函数"                ← 标题
 *   grid: true                      ← 显示网格(默认 true)
 *   zoom: false                     ← 禁用鼠标滚轮缩放(默认 false)
 *
 * 注释：以 # 开头的行会被忽略。
 *
 * 实现要点：
 *  - 不做严格数学解析,只是行级 pattern 提取。
 *  - "y = sin(x), dashed" 这种"逗号修饰符"在函数行末尾任意顺序追加。
 *  - 数学常量 / 函数名直接透传给 function-plot(它自带 math.js,识别 sin/cos/pi/e 等)。
 *  - 解析失败抛 ParseError,让上层展示错误。
 */

export interface PlotSeriesSpec {
  /** 函数表达式,如 "sin(x)" "x^2-2x+1" */
  fn: string
  /** 曲线样式 */
  graphType: 'polyline' | 'scatter' | 'interval'
  /** 颜色,hex */
  color?: string
  /** 该曲线的局部 x 范围 */
  range?: [number, number]
}

export interface PlotMarkSpec {
  x: number
  y: number
  label?: string
}

export interface PlotOptions {
  data: PlotSeriesSpec[]
  xAxis?: { domain?: [number, number] }
  yAxis?: { domain?: [number, number] }
  title?: string
  grid?: boolean
  zoom?: boolean
  marks: PlotMarkSpec[]
  /** 源字符串里所有非空行,用于错误回显 */
  rawLines: string[]
}

export class PlotParseError extends Error {
  constructor(public line: number, message: string) {
    super(`第 ${line} 行: ${message}`)
    this.name = 'PlotParseError'
  }
}

/**
 * 安全求值一个数学字面量：支持 π / e / 数字 / 简单算式（+ - * / ( )）。
 * 比 eval 安全很多——只识别数字 / 常量 / 四则运算 / 括号 / 空格。
 */
function evalNumber(expr: string): number {
  const cleaned = expr
    .replace(/π/g, 'Math.PI')
    .replace(/π/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/√\s*([\d.]+)/g, 'Math.sqrt($1)')
    .replace(/(\d)\s*\^/g, '$1**') // x^2 → x**2 (function-plot 用 ^ 也行,但 ^ 优先级很奇怪)
    .trim()

  // 只允许数字 / Math.PI / Math.E / 算术符号 / 括号 / 小数点 / 空格
  if (!/^[\d\s+\-*/().MathPIEe]+$/.test(cleaned)) {
    throw new PlotParseError(-1, `无法解析数字 "${expr}"`)
  }

  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${cleaned})`)()
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new PlotParseError(-1, `"${expr}" 不是有限数字`)
    }
    return v
  } catch (err) {
    throw new PlotParseError(-1, `无法求值 "${expr}": ${(err as Error).message}`)
  }
}

/** 提取函数行末尾的修饰符（dashed / dotted / range: [...] / color: #xxx），返回剩下的 fn 表达式 */
function parseFunctionLine(
  line: string,
  lineNumber: number
): PlotSeriesSpec {
  // 期望："y = <expr>" 可选 " , 修饰符1, 修饰符2, ..."
  const trimmed = line.trim()
  if (!/^y\s*=/i.test(trimmed)) {
    throw new PlotParseError(lineNumber, '函数行必须以 "y =" 开头')
  }

  const afterEq = trimmed.replace(/^y\s*=\s*/i, '')

  // 按逗号拆分,保留每个 token
  const tokens = splitTopLevelCommas(afterEq)

  if (tokens.length === 0 || !tokens[0].trim()) {
    throw new PlotParseError(lineNumber, '"y =" 后面缺少表达式')
  }

  const fn = tokens[0].trim()
  let graphType: PlotSeriesSpec['graphType'] = 'polyline'
  let color: string | undefined
  let range: [number, number] | undefined

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i].trim()
    if (t === 'dashed') graphType = 'scatter'
    else if (t === 'dotted') graphType = 'scatter'
    else if (/^range\s*:/i.test(t)) {
      const arr = extractRange(t.replace(/^range\s*:\s*/i, ''), lineNumber)
      range = [evalNumber(arr[0]), evalNumber(arr[1])]
    } else if (/^color\s*:/i.test(t)) {
      color = t.replace(/^color\s*:\s*/i, '').trim()
      if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) {
        throw new PlotParseError(lineNumber, `color 必须是 hex,如 #ff5f57`)
      }
    } else {
      throw new PlotParseError(lineNumber, `未知修饰符 "${t}"`)
    }
  }

  const spec: PlotSeriesSpec = { fn, graphType }

  // 规范化幂运算:AI 喜欢写 x^2,但 math.js 里 ^ 是按位异或,必须改成 ** 才对。
  // 把 "变量^数字" 替换成 "变量**数字"，如 x^2 → x**2, x^3 → x**3。
  // 不动函数参数里的 ^ (如 sin(x^2) 静默保留,让 function-plot 自己处理)。
  spec.fn = spec.fn.replace(/(?<![a-z0-9)\]])\^(\d+(?:\.\d+)?)/gi, '**$1')

  if (color) spec.color = color
  if (range) spec.range = range
  return spec
}

/** 简单 split:只对不在括号 / 方括号内的逗号切分 */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}

/** 提取 "[a, b]" 返回 [a, b] */
function extractRange(s: string, lineNumber: number): [string, string] {
  const m = /^\[(.+)\]$/.exec(s.trim())
  if (!m) throw new PlotParseError(lineNumber, 'range 必须是 [a, b] 形式')
  const inner = m[1].split(',').map((x) => x.trim())
  if (inner.length !== 2) {
    throw new PlotParseError(lineNumber, 'range 必须有两个数,如 [-1, 1]')
  }
  return [inner[0], inner[1]]
}

/** 解析 "mark: (a, b) \"label\"" */
function parseMarkLine(line: string, lineNumber: number): PlotMarkSpec {
  const m = /^mark\s*:\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)(?:\s*"([^"]*)")?$/i.exec(
    line.trim()
  )
  if (!m) {
    throw new PlotParseError(lineNumber, 'mark 格式应为 mark: (x, y) "label"')
  }
  return {
    x: evalNumber(m[1]),
    y: evalNumber(m[2]),
    ...(m[3] ? { label: m[3] } : {}),
  }
}

export function parsePlotBlock(code: string): PlotOptions {
  const rawLines = code.split(/\r?\n/)
  const opts: PlotOptions = {
    data: [],
    marks: [],
    rawLines,
  }

  rawLines.forEach((raw, idx) => {
    const line = raw.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '')
    const lineNumber = idx + 1
    if (!line || line.startsWith('#')) return

    if (/^y\s*=/i.test(line)) {
      opts.data.push(parseFunctionLine(line, lineNumber))
      return
    }

    if (/^range\s*:/i.test(line)) {
      const body = line.replace(/^range\s*:\s*/i, '')
      const [a, b] = extractRange(body, lineNumber)
      opts.xAxis = {
        domain: [evalNumber(a), evalNumber(b)],
      }
      return
    }

    if (/^yrange\s*:/i.test(line)) {
      const body = line.replace(/^yrange\s*:\s*/i, '')
      const [a, b] = extractRange(body, lineNumber)
      opts.yAxis = { domain: [evalNumber(a), evalNumber(b)] }
      return
    }

    if (/^mark\s*:/i.test(line)) {
      opts.marks.push(parseMarkLine(line, lineNumber))
      return
    }

    if (/^title\s*:/i.test(line)) {
      opts.title = line.replace(/^title\s*:\s*/i, '').trim()
      return
    }

    if (/^grid\s*:/i.test(line)) {
      const v = line.replace(/^grid\s*:\s*/i, '').trim().toLowerCase()
      if (v === 'true' || v === '1' || v === 'yes') opts.grid = true
      else if (v === 'false' || v === '0' || v === 'no') opts.grid = false
      else throw new PlotParseError(lineNumber, `grid 值必须 true / false`)
      return
    }

    if (/^zoom\s*:/i.test(line)) {
      const v = line.replace(/^zoom\s*:\s*/i, '').trim().toLowerCase()
      opts.zoom = v === 'true' || v === '1' || v === 'yes'
      return
    }

    throw new PlotParseError(lineNumber, `无法识别的指令 "${line}"`)
  })

  if (opts.data.length === 0) {
    throw new PlotParseError(0, '块内没有任何函数,至少需要一行 "y = ..."')
  }

  // 默认 grid = true
  if (opts.grid === undefined) opts.grid = true
  // 默认 zoom = false (避免意外)
  if (opts.zoom === undefined) opts.zoom = false

  // ── 智能默认 domain ─────────────────────────────────────────────────
  // AI 经常懒得写 range/yrange;function-plot 默认 x=[-6,6],y=[-3.33,3.33],
  // 看 sin/cos/tan 这种 2π 周期的函数会非常局促。这里按函数特征推断一个合理默认:
  //   - 出现 sin/cos/tan → x=[-2π, 2π], y=[-2, 2]
  //   - 出现 log/ln → x=[0.01, 10], y 按函数
  //   - 出现 exp → x=[-3, 3], y=[-1, 10]
  //   - 多项式(没有 trig)→ x=[-5, 5], y=[-5, 5]
  //   - 其它兜底 → x=[-6, 6], y=[-4, 4]
  // AI 显式写了 range/yrange 仍然优先用 AI 的值(上面 if 分支已经写过了)。
  if (!opts.xAxis) {
    opts.xAxis = { domain: inferXDomain(opts.data) }
  }
  if (!opts.yAxis) {
    opts.yAxis = { domain: inferYDomain(opts.data, opts.xAxis.domain) }
  }

  return opts
}

/** 从函数列表推测 x domain */
function inferXDomain(series: PlotSeriesSpec[]): [number, number] {
  const blob = series.map((s) => s.fn).join(' ').toLowerCase()
  if (/\b(sin|cos|tan|csc|sec|cot)\b/.test(blob)) {
    // 三角函数给 [-2π, 2π] 才能看到两个周期
    return [-2 * Math.PI, 2 * Math.PI]
  }
  if (/\b(log|ln|log10|log2)\b/.test(blob)) {
    return [0.01, 10]
  }
  if (/\bexp\b/.test(blob)) {
    return [-3, 3]
  }
  // 多项式 / 其它 → [-5, 5]
  return [-5, 5]
}

/** 从函数列表 + x domain 推测 y domain。粗略估算:1.2 倍最大波动,圆形对称。 */
function inferYDomain(
  series: PlotSeriesSpec[],
  xDomain: [number, number]
): [number, number] {
  const blob = series.map((s) => s.fn).join(' ').toLowerCase()
  // 三角函数 y 在 [-1, 1], 留点 buffer
  if (/\b(sin|cos|csc|sec|cot)\b/.test(blob)) {
    return [-1.5, 1.5]
  }
  // tan 在 (-π/2, π/2) 外爆炸,给 [-4, 4]
  if (/\btan\b/.test(blob)) {
    return [-4, 4]
  }
  // 对数 / 指数 / 其它兜底 —— 按 x 范围等比
  const halfRange = ((xDomain[1] - xDomain[0]) / 2) * 0.8
  return [-halfRange, halfRange]
}
