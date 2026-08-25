'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Loader2, Sparkles, Trash2, Download, Copy, X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GeneratedImage {
  id: string
  prompt: string
  url: string
  model: string
  width: number
  height: number
  source: string
  createdAt: string
}

const PAGE_SIZE = 24
// 推荐的提示词(快捷填充,降低首次使用门槛)
const PROMPT_PRESETS = [
  '赛博朋克风格的城市夜景,霓虹灯,雨后街道',
  '一只可爱的橘猫坐在窗台,水彩画风格',
  '日系治愈系插画,少女,樱花飘落,柔和光线',
  '极简几何风格的山脉海报,扁平设计',
]

export default function ImagesPage() {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [preview, setPreview] = useState<GeneratedImage | null>(null)
  const [imageSettings, setImageSettings] = useState({
    model: 'builtin:wanx2.1-t2i-turbo',
    size: '1024*1024',
    builtinModels: [] as Record<string, unknown>[],
    customModels: [] as Record<string, unknown>[],
  })
  // 视图模式: gallery(网格缩略图) | preview(刚生成完的大图预览)
  const [viewMode, setViewMode] = useState<'gallery' | 'preview'>('gallery')
  const [latestGeneratedId, setLatestGeneratedId] = useState<string | null>(null)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [switchingModel, setSwitchingModel] = useState(false)
  const [switchingSize, setSwitchingSize] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const modelDropRef = useRef<HTMLDivElement | null>(null)

  // 点击外部关闭模型下拉
  useEffect(() => {
    if (!modelDropdownOpen) return
    function onPointerDown(e: PointerEvent) {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [modelDropdownOpen])

  // 自动撑高 textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }, [prompt])

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    const res = await fetch(`/api/images?limit=${PAGE_SIZE}&offset=${offset}`)
    if (!res.ok) throw new Error('加载历史失败')
    const data = await res.json()
    setTotal(data.total ?? 0)
    setHasMore(offset + (data.items?.length ?? 0) < (data.total ?? 0))
    setImages((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []))
  }, [])

  useEffect(() => {
    setLoadingList(true)
    fetchPage(0, false).catch((err) => {
      console.error(err)
      setError(err instanceof Error ? err.message : '加载失败')
    }).finally(() => setLoadingList(false))
  }, [fetchPage])

  // 加载生图设置
  useEffect(() => {
    fetch('/api/image-settings')
      .then((r) => r.json())
      .then((data) => {
        setImageSettings({
          model: data.settings?.imageModel ?? 'builtin:wanx2.1-t2i-turbo',
          size: data.settings?.imageSize ?? '1024*1024',
          builtinModels: data.builtinModels ?? [],
          customModels: data.customModels ?? [],
        })
      })
      .catch(() => {})
  }, [])

  // 滚动到底部自动加载更多
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      const first = entries[0]
      if (first.isIntersecting && hasMore && !loadingMore && !loadingList) {
        setLoadingMore(true)
        fetchPage(images.length, true)
          .catch((err) => console.error(err))
          .finally(() => setLoadingMore(false))
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadingList, images.length, fetchPage])

  async function handleGenerate() {
    const text = prompt.trim()
    if (!text || generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, source: 'workspace' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `生成失败 (HTTP ${res.status})`)
      }
      const record: GeneratedImage = await res.json()
      setImages((prev) => [record, ...prev])
      setTotal((n) => n + 1)
      setLatestGeneratedId(record.id)
      setViewMode('preview')
      setPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这张图片吗?')) return
    try {
      const res = await fetch(`/api/images/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      setImages((prev) => prev.filter((img) => img.id !== id))
      setTotal((n) => Math.max(0, n - 1))
      setLatestGeneratedId((prev) => (prev === id ? null : prev))
      setViewMode((prev) => (prev === 'preview' && latestGeneratedId === id ? 'gallery' : prev))
      if (preview?.id === id) setPreview(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  function handleCopyPrompt(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      // ignore
    })
  }

  function handleDownload(img: GeneratedImage) {
    const a = document.createElement('a')
    a.href = img.url
    a.download = `wanx-${img.id}.png`
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleGenerate()
    }
  }

  function handleSwitchModel(modelId: string) {
    setSwitchingModel(true)
    fetch('/api/image-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { imageModel: modelId } }),
    })
      .then((r) => r.json())
      .then(() => {
        setImageSettings((s) => ({ ...s, model: modelId }))
        setModelDropdownOpen(false)
      })
      .catch(() => {})
      .finally(() => setSwitchingModel(false))
  }

  function handleSwitchSize(size: string) {
    if (size === imageSettings.size || switchingSize) return
    setSwitchingSize(true)
    fetch('/api/image-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { imageSize: size } }),
    })
      .then((r) => r.json())
      .then(() => {
        setImageSettings((s) => ({ ...s, size }))
      })
      .catch(() => {})
      .finally(() => setSwitchingSize(false))
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部标题栏 */}
      <div className="px-4 py-3 border-b border-line/50 flex items-center gap-2 shrink-0 relative">
        <Sparkles className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold">生图工作台</h2>
        {/* 模型选择器 */}
        <div className="ml-auto relative" ref={modelDropRef}>
          <button
            onClick={() => setModelDropdownOpen((o) => !o)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-surface-muted hover:bg-surface-subtle text-content-secondary transition-colors border border-line/60"
          >
            {switchingModel ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            <span className="max-w-[120px] truncate">
              {(() => {
                const allModels = [...imageSettings.builtinModels, ...imageSettings.customModels]
                const current = allModels.find((m) => m.id === imageSettings.model)
                return current ? (current.name as string) : imageSettings.model
              })()}
            </span>
            <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform', modelDropdownOpen && 'rotate-180')} />
          </button>

          {modelDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 bg-surface border border-line/60 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
              {imageSettings.builtinModels.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] text-content-muted font-medium uppercase tracking-wide">
                    内置模型
                  </div>
                  {imageSettings.builtinModels.map((m) => {
                    const isActive = m.id === imageSettings.model
                    return (
                      <button
                        key={m.id as string}
                        onClick={() => handleSwitchModel(m.id as string)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-surface-subtle transition-colors',
                          isActive && 'bg-accent/10 text-accent'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{(m as Record<string, unknown>).name as string}</div>
                          <div className="text-[10px] text-content-muted mt-0.5 truncate">
                            {((m as Record<string, unknown>).desc as string) || ((m as Record<string, unknown>).modelId as string)}
                          </div>
                        </div>
                        {isActive && <Check className="w-3 h-3 shrink-0 text-accent" />}
                      </button>
                    )
                  })}
                </>
              )}
              {imageSettings.customModels.length > 0 && (
                <>
                  <div className="mx-3 my-1 border-t border-line/40" />
                  <div className="px-3 py-1.5 text-[11px] text-content-muted font-medium uppercase tracking-wide">
                    自定义模型
                  </div>
                  {imageSettings.customModels.map((m) => {
                    const isActive = m.id === imageSettings.model
                    return (
                      <button
                        key={m.id as string}
                        onClick={() => handleSwitchModel(m.id as string)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-surface-subtle transition-colors',
                          isActive && 'bg-accent/10 text-accent'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{(m as Record<string, unknown>).name as string}</div>
                          <div className="text-[10px] text-content-muted mt-0.5 truncate">
                            {((m as Record<string, unknown>).modelId as string) || ((m as Record<string, unknown>).baseURL as string)}
                          </div>
                        </div>
                        {isActive && <Check className="w-3 h-3 shrink-0 text-accent" />}
                      </button>
                    )
                  })}
                </>
              )}
              {imageSettings.builtinModels.length === 0 && imageSettings.customModels.length === 0 && (
                <div className="px-3 py-4 text-xs text-content-muted text-center">
                  加载中...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[40%_1fr] min-h-0 overflow-hidden">
        {/* 左侧:输入栏 */}
        <aside className="w-full shrink-0 border-b lg:border-b-0 lg:border-r border-line/50 p-4 flex flex-col gap-3 overflow-y-auto">
          <div>
            <label className="text-xs text-content-secondary font-medium">提示词</label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想生成的图片,例如:一只在窗台看雨的猫,水彩风格"
              maxLength={500}
              className={cn(
                'mt-1.5 w-full min-h-28 max-h-60 px-3 py-2 rounded-lg resize-none',
                'bg-surface-subtle border border-line/60 text-sm leading-relaxed',
                'placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40',
                'transition-shadow'
              )}
            />
            <div className="flex items-center justify-between mt-1 text-[11px] text-content-muted">
              <span>{prompt.length}/500</span>
              <span>Cmd/Ctrl + Enter 生成</span>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium',
              'bg-accent text-accent-foreground hover:bg-accent-hover',
              'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            )}
          >
            {generating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                生成图片
              </>
            )}
          </button>

          {/* 图片尺寸选择 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-content-secondary font-medium">图片尺寸</label>
              <span className="text-[11px] text-content-muted">
                {imageSettings.size.replace('*', '×')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { value: '1024*1024', label: '正方形' },
                { value: '720*1280', label: '竖向' },
                { value: '1280*720', label: '横向' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSwitchSize(opt.value)}
                  disabled={switchingSize}
                  className={cn(
                    'px-2 py-1.5 rounded-md text-xs border transition-colors',
                    imageSettings.size === opt.value
                      ? 'bg-accent/10 border-accent/40 text-accent font-medium'
                      : 'bg-surface-subtle border-line/60 text-content-secondary hover:bg-surface-muted'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <div className="text-xs text-content-secondary font-medium mb-1.5">试试这些</div>
            <div className="flex flex-col gap-1.5">
              {PROMPT_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrompt(p)}
                  className="text-left text-xs px-2.5 py-1.5 rounded-md border border-line/60 hover:bg-surface-subtle text-content-secondary hover:text-content-primary transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-3 border-t border-line/40 text-[11px] text-content-muted leading-relaxed">
            <p>· 每张图片需数秒生成,稍安勿躁</p>
            <p>· 首次使用请在「设置 → 服务商」配置千问/百炼密钥</p>
            <p>· 模型和尺寸可在工作台顶部直接切换</p>
            <p>· 对话中用 [IMG:描述] 触发的图片也会自动归档到这里</p>
          </div>
        </aside>

        {/* 右侧:历史画廊 */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-content-secondary">
              历史记录 <span className="text-content-muted">({total})</span>
            </h3>
          </div>

          {loadingList ? (
            <div className="flex items-center justify-center h-40 text-content-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-content-muted text-sm gap-2">
              <Sparkles className="w-8 h-8 opacity-40" />
              <p>还没有生图记录,左侧输入提示词开始吧</p>
            </div>
          ) : viewMode === 'preview' && latestGeneratedId ? (
            // 大图预览模式:生成完毕或用户切到此模式时显示
            (() => {
              const target = images.find((img) => img.id === latestGeneratedId) ?? images[0]
              return target ? (
                <PreviewView
                  image={target}
                  onClose={() => setViewMode('gallery')}
                  onDelete={() => handleDelete(target.id)}
                  onCopyPrompt={() => handleCopyPrompt(target.prompt)}
                  onPreview={() => setPreview(target)}
                />
              ) : null
            })()
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {images.map((img) => (
                <ImageCard
                  key={img.id}
                  image={img}
                  onPreview={() => setPreview(img)}
                  onDelete={() => handleDelete(img.id)}
                  onCopyPrompt={() => handleCopyPrompt(img.prompt)}
                />
              ))}
            </div>
          )}

          {/* 加载更多触发器 */}
          <div ref={sentinelRef} className="h-8 mt-2 flex items-center justify-center text-xs text-content-muted">
            {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {!hasMore && images.length > 0 && <span>已经到底了</span>}
          </div>
        </div>
      </div>

      {/* 预览弹窗 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-surface rounded-xl border border-line/60 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-line/50">
              <span className="text-xs text-content-muted">
                {new Date(preview.createdAt).toLocaleString()}
              </span>
              <button
                onClick={() => setPreview(null)}
                className="p-1 rounded-md hover:bg-surface-subtle"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex flex-col md:flex-row gap-4 max-h-[80vh]">
              <div className="flex-1 min-w-0 flex items-center justify-center bg-surface-muted rounded-lg overflow-hidden">
                <Image
                  src={preview.url}
                  alt={preview.prompt}
                  width={preview.width}
                  height={preview.height}
                  className="max-w-full max-h-[70vh] w-auto h-auto object-contain"
                  unoptimized
                />
              </div>
              <div className="md:w-64 shrink-0 flex flex-col gap-2 text-sm">
                <div>
                  <div className="text-xs text-content-muted mb-1">提示词</div>
                  <div className="text-content-primary leading-relaxed">{preview.prompt}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <button
                    onClick={() => handleCopyPrompt(preview.prompt)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-line/60 hover:bg-surface-subtle"
                  >
                    <Copy className="w-3 h-3" /> 复制提示词
                  </button>
                  <button
                    onClick={() => handleDownload(preview)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-line/60 hover:bg-surface-subtle"
                  >
                    <Download className="w-3 h-3" /> 下载
                  </button>
                  <button
                    onClick={() => { setPreview(null); handleDelete(preview.id) }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3" /> 删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 大图预览视图:mac 红绿灯风格标题栏,红点 = 关闭返回网格
function PreviewView({
  image,
  onClose,
  onDelete,
  onCopyPrompt,
  onPreview,
}: {
  image: GeneratedImage
  onClose: () => void
  onDelete: () => void
  onCopyPrompt: () => void
  onPreview: () => void
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-line/60 bg-surface shadow-sm">
      {/* 模拟 mac 标题栏:红/黄/绿三圆点 */}
      <div className="flex items-center px-3 py-2 bg-surface-subtle border-b border-line/60">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-90 transition flex items-center justify-center group"
            title="返回画廊"
            aria-label="关闭预览,返回画廊视图"
          >
            <X className="w-2 h-2 text-black/60 opacity-0 group-hover:opacity-100 transition" strokeWidth={3} />
          </button>
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 mx-4 text-xs text-content-muted truncate text-center">
          {image.prompt}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopyPrompt}
            className="p-1.5 rounded-md hover:bg-surface text-content-muted hover:text-content-primary"
            title="复制提示词"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-surface text-content-muted hover:text-red-500"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 图片主体 */}
      <div
        className="bg-surface-muted flex items-center justify-center cursor-zoom-in min-h-[50vh] max-h-[70vh] p-4"
        onClick={onPreview}
      >
        <Image
          src={image.url}
          alt={image.prompt}
          width={image.width}
          height={image.height}
          className="max-w-full max-h-[68vh] w-auto h-auto object-contain"
          unoptimized
        />
      </div>
    </div>
  )
}

function ImageCard({
  image,
  onPreview,
  onDelete,
  onCopyPrompt,
}: {
  image: GeneratedImage
  onPreview: () => void
  onDelete: () => void
  onCopyPrompt: () => void
}) {
  return (
    <div
      className="group relative aspect-square rounded-lg overflow-hidden bg-surface-muted border border-line/60 cursor-pointer"
      onClick={onPreview}
    >
      <Image
        src={image.url}
        alt={image.prompt}
        width={image.width}
        height={image.height}
        className="w-full h-full object-cover"
        unoptimized
      />
      {/* 悬浮操作 */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent',
          'opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2'
        )}
      >
        <div className="text-[11px] text-white line-clamp-2 mb-1.5">{image.prompt}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onCopyPrompt() }}
            className="p-1 rounded bg-white/15 hover:bg-white/25 text-white"
            title="复制提示词"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded bg-white/15 hover:bg-red-500/40 text-white ml-auto"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
