'use client'

import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query'

/**
 * 创建一个新的 QueryClient。
 *
 * 这里集中所有 staleTime / gcTime / retry 等策略默认值,而不是每个 useQuery 调用
 * 各传各的——这样切页时缓存能稳定命中,体感是"切换上一秒看过的会话立刻就出来了"。
 *
 * 个别查询可以覆盖默认 staleTime(见 STALE 预设)。
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 默认 stale 时间。允许 staleTime: Infinity 表示"只手工 invalidate"。
        staleTime: 30 * 1000,
        // 切会话/列表翻页这种高频场景,gcTime 要够长,避免来回重新拉。
        gcTime: 5 * 60 * 1000,
        // 网络抖动重试:乐观一些,2 次重试 + 指数退避
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // 切回标签页时不自动 refetch——避免 stale tab 回来时一连串请求闪屏
        refetchOnWindowFocus: false,
        // 复用旧数据,后台静默刷新,避免整页 spinner
        refetchOnMount: true,
      },
      dehydrate: {
        // 支持 dehydrate 包含 pending queries(SSR streaming 用,这里预埋)
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  })
}

let browserClient: QueryClient | undefined

/**
 * 单例 browser QueryClient。
 *
 * Next.js 在浏览器里多次渲染(如 HMR)会重建模块,我们用 globalThis 持一个实例,
 * 避免每次重建时丢失缓存——否则用户切会话后又切回来还要重新 fetch,等于白优化了。
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // 服务端每次新 build 独立实例即可——SSR 取完数据用 dehydrate 序列化
    return makeQueryClient()
  }
  if (!browserClient) browserClient = makeQueryClient()
  return browserClient
}
