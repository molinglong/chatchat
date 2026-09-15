/**
 * TanStack Query 中央化 query keys + 常用 staleTime 预设。
 *
 * 集中管理的目的:
 * 1) 避免散落在各页面里的字符串拼写不一致导致缓存失效(bug 难查)
 * 2) 改 key 形式时一处改、全部生效
 * 3) 配合 invalidate / setQueryData 时,可以做到精细控制——例如
 *    拉单条会话后,只让列表里的这一条 refetch,而不是整个列表
 *
 * 这个文件被 .client.ts / .server.ts 双向引用,因此保持纯 ES module,
 * 不加 'use client' 指令——具体 provider 放在 QueryProvider.tsx 里。
 */

export const STALE = {
  /** 模型/服务商列表:变化不频繁,缓存 5 分钟 */
  providers: 5 * 60 * 1000,
  /** 自定义模型:同 providers */
  customModels: 5 * 60 * 1000,
  /** 会话详情:用户当前会话的"新鲜度",切回时立刻显示,后台静默刷新 */
  conversation: 10 * 1000,
  /** 会话列表 */
  conversationList: 30 * 1000,
  /** 生图列表 */
  images: 60 * 1000,
  /** 图片设置 */
  imageSettings: 5 * 60 * 1000,
} as const

export const queryKeys = {
  all: ['app'] as const,

  providers: () => [...queryKeys.all, 'providers'] as const,
  customModels: () => [...queryKeys.all, 'customModels'] as const,

  conversations: {
    list: (limit: number, offset: number) =>
      [...queryKeys.all, 'conversations', 'list', { limit, offset }] as const,
    detail: (id: string) =>
      [...queryKeys.all, 'conversations', 'detail', id] as const,
    messages: (id: string, limit: number) =>
      [...queryKeys.all, 'conversations', id, 'messages', { limit }] as const,
  },

  explore: {
    topics: () => [...queryKeys.all, 'explore', 'topics'] as const,
  },
  images: {
    list: (limit: number, offset: number) =>
      [...queryKeys.all, 'images', 'list', { limit, offset }] as const,
    settings: () => [...queryKeys.all, 'image-settings'] as const,
  },
  search: {
    keys: () => [...queryKeys.all, 'search', 'keys'] as const,
  },
} as const

export type QueryKeyOf<T extends readonly unknown[]> = T
