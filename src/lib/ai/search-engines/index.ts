/**
 * 支持的联网搜索引擎配置。
 * 与模型 Key 体系独立，需单独申请。
 */
export const SEARCH_ENGINES = {
  qianfan: {
    id: "qianfan",
    name: "百度千帆",
    description: "百度千帆搜索 API，需单独申请，与模型服务商 Key 无关",
    docsUrl: "https://cloud.baidu.com/doc/QIANFAN/s/3l6bavkfm",
  },
} as const

export type SearchEngineId = keyof typeof SEARCH_ENGINES
