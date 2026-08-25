'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Save, Trash2, Loader2, CheckCircle, AlertCircle, Key, Eye, EyeOff, Zap, ExternalLink, Brain, Plus, Settings2, HelpCircle, Info, MessageSquare, GitBranch, Cpu, Wrench, BarChart3, ChevronUp, ChevronDown, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/store/chat-store'
import { StyleSlider } from '@/components/chat/StyleSlider'
import { getStyleLabel } from '@/lib/ai/style'

const STYLE_OFFSET_STORAGE_KEY = 'chat:styleOffset'

interface ProviderInfo {
  id: string
  name: string
  models: string[]
}

interface KeyInfo {
  id: string
  provider: string
  maskedKey: string
  updatedAt: string
}

interface MemoryInfo {
  id: string
  category: string
  content: string
  source: string
  updatedAt: string
}

interface UsageStats {
  totals: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    messages: number
  }
  byModel: {
    model: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    messages: number
  }[]
  byDay: { date: string; totalTokens: number }[]
}

// Custom model types
const CUSTOM_MODEL_PRESETS = [
  { name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1' },
  { name: 'SiliconFlow', baseURL: 'https://api.siliconflow.cn/v1' },
  { name: 'Ollama 本地', baseURL: 'http://localhost:11434/v1' },
  { name: 'LM Studio', baseURL: 'http://localhost:1234/v1' },
  { name: 'vLLM', baseURL: 'http://localhost:8000/v1' },
] as const

// 自定义模型小圆点颜色 (与 ModelSelector 保持一致)
const CUSTOM_MODEL_DOT = 'bg-gray-400'

interface CustomModelForm {
  id?: string | null // editing existing
  name: string
  modelId: string
  baseURL: string
  protocol: 'auto' | 'chat' | 'responses' | 'anthropic'
  keySource: 'own' | 'provider' | 'none'
  apiKey: string
  provider?: string // for keySource='provider'
  contextWindow: number
  supportsVision: boolean
  supportsFiles: boolean
  supportsReasoning: boolean
}

interface SavedCustomModel {
  id: string // custom:xxx (ModelSelector 用)
  dbId: string // 数据库真实 id (编辑/删除用)
  hasApiKey: boolean
  keySource: 'own' | 'provider' | 'none'
  providerKey?: string | null
  name: string
  modelId: string
  baseURL: string
  protocol: 'auto' | 'chat' | 'responses' | 'anthropic'
  contextWindow: number
  supportsVision: boolean
  supportsFiles: boolean
  supportsReasoning: boolean
  updatedAt: string
}

const MEMORY_CATEGORY_LABELS: Record<string, string> = {
  user_info: '身份',
  preference: '偏好',
  habit: '习惯',
  project: '项目',
  skill: '技能',
  manual: '手动',
  other: '其他',
  general: '其他',
}

const PROVIDER_URL: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com',
  deepseek: 'https://platform.deepseek.com',
  qianwen: 'https://dashscope.aliyun.com',
  wenxin: 'https://cloud.baidu.com/product/qianfan',
  google: 'https://aistudio.google.com/apikey',
  mistral: 'https://console.mistral.ai/api-keys',
  xai: 'https://console.x.ai/',
  groq: 'https://console.groq.com/keys',
  moonshot: 'https://platform.moonshot.cn/console/api-keys',
  zhipu: 'https://open.bigmodel.cn/console/apikey/index',
  doubao: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  yi: 'https://platform.lingyiwanwu.com/apikeys',
}

type SectionId = 'providers' | 'memory' | 'general' | 'help' | 'about' | 'customModels' | 'usage'

type ThemeChoice = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const NAV_ITEMS: { id: SectionId; label: string; icon: typeof Key }[] = [
  { id: 'providers', label: '服务商', icon: Key },
  { id: 'memory', label: '记忆', icon: Brain },
  { id: 'customModels', label: '自定义模型', icon: Cpu },
  { id: 'usage', label: '用量统计', icon: BarChart3 },
  { id: 'general', label: '通用', icon: Settings2 },
  { id: 'help', label: '帮助', icon: HelpCircle },
  { id: 'about', label: '关于', icon: Info },
]

export function SettingsModal() {
  const {
    settingsOpen,
    setSettingsOpen,
    currentConversationId,
    conversationStyleOffset,
    setConversationStyleOffset,
  } = useChatStore()
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [keys, setKeys] = useState<KeyInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<Record<string, 'success' | 'error'>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
  const [memories, setMemories] = useState<MemoryInfo[]>([])
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [memorySaving, setMemorySaving] = useState(false)
  const [memoryDeleting, setMemoryDeleting] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('providers')
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('system')

  // Custom model state
  const [customModels, setCustomModels] = useState<SavedCustomModel[]>([])
  const [cmForm, setCmForm] = useState<CustomModelForm>({
    id: null,
    name: '',
    modelId: '',
    baseURL: 'https://',
    protocol: 'auto',
    keySource: 'own',
    apiKey: '',
    provider: '',
    contextWindow: 32768,
    supportsVision: false,
    supportsFiles: false,
    supportsReasoning: false,
  })
  const [cmSaving, setCmSaving] = useState(false)
  const [cmTesting, setCmTesting] = useState<string | null>(null)
  const [cmTestResult, setCmTestResult] = useState<{ [id: string]: 'success' | 'error' }>({})
  const [cmDeleting, setCmDeleting] = useState<string | null>(null)
  const [cmFormResult, setCmFormResult] = useState<'success' | 'error' | null>(null)

  // Usage stats state
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)

  // Provider section collapse states and display filter
  const [configuredCollapsed, setConfiguredCollapsed] = useState(false)
  const [unconfiguredCollapsed, setUnconfiguredCollapsed] = useState(true)
  const [showOnlyConfigured, setShowOnlyConfigured] = useState(true)

  // Fetch data when modal opens
  useEffect(() => {
    if (!settingsOpen) return
    setLoading(true)
    Promise.all([
      fetch('/api/providers').then((r) => r.json()),
      fetch('/api/keys').then((r) => r.json()),
      fetch('/api/memories').then((r) => r.json()),
      fetch('/api/custom-models').then((r) => r.json()),
      fetch('/api/usage').then((r) => r.json()).catch(() => null),
    ])
      .then(([provs, keyList, memoryData, cmList, usageData]) => {
        setProviders(provs)
        setKeys(keyList)
        setMemories(memoryData?.memories ?? [])
        setMemoryEnabled(memoryData?.memoryEnabled ?? true)
        setUsageStats(usageData?.totals ? usageData : null)
        // Parse custom models: assume cmList is already ModelDefinition format from API
        if (Array.isArray(cmList)) {
          setCustomModels(
            cmList.map((m: SavedCustomModel) => ({
              ...m,
              updatedAt: new Date().toISOString(),
            }))
          )
        }
      })
      .catch(() => setMessage({ type: 'error', text: '加载数据失败' }))
      .finally(() => setLoading(false))
  }, [settingsOpen])

  // Close on Escape
  useEffect(() => {
    if (!settingsOpen) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [settingsOpen, setSettingsOpen])

  // Restore the last selected style for new chats. Existing chats are initialized by ChatPanel.
  useEffect(() => {
    if (!currentConversationId) {
      const stored = Number(localStorage.getItem(STYLE_OFFSET_STORAGE_KEY))
      if (Number.isFinite(stored)) {
        setConversationStyleOffset(Math.max(0, Math.min(100, stored)))
      }
    }
  }, [currentConversationId, setConversationStyleOffset])

  // Init theme choice from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('theme')
    setThemeChoice(stored === 'light' || stored === 'dark' ? stored : 'system')
  }, [])

  function applyTheme(choice: ThemeChoice) {
    setThemeChoice(choice)
    if (choice === 'system') {
      localStorage.removeItem('theme')
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', dark)
    } else {
      localStorage.setItem('theme', choice)
      document.documentElement.classList.toggle('dark', choice === 'dark')
    }
  }

  const getKeyForProvider = useCallback(
    (providerId: string) => keys.find((k) => k.provider === providerId),
    [keys]
  )

  // Sort configured providers by update time (newest first)
  const sortedConfigured = useMemo(() => {
    const conf = providers.filter((p) => keys.some((k) => k.provider === p.id))
    return conf.sort((a, b) => {
      const keyA = keys.find((k) => k.provider === a.id)
      const keyB = keys.find((k) => k.provider === b.id)
      if (!keyA && !keyB) return 0
      if (!keyA) return 1
      if (!keyB) return -1
      return new Date(keyB.updatedAt).getTime() - new Date(keyA.updatedAt).getTime()
    })
  }, [providers, keys])

  async function handleSave(providerId: string) {
    const value = draftKeys[providerId]?.trim()
    if (!value) return
    setSaving((s) => ({ ...s, [providerId]: true }))
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '保存失败')
      }
      setDraftKeys((d) => ({ ...d, [providerId]: '' }))
      setMessage({ type: 'success', text: `${providerId} API Key 已保存` })
      const newKeys = await fetch('/api/keys').then((r) => r.json())
      setKeys(newKeys)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error && err.message ? err.message : '保存失败，请重试' })
    } finally {
      setSaving((s) => ({ ...s, [providerId]: false }))
    }
  }

  async function handleDelete(providerId: string) {
    if (!confirm(`确定要删除 ${providerId} 的 API Key 吗？`)) return
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId }),
      })
      if (!res.ok) throw new Error('删除失败')
      setKeys((prev) => prev.filter((k) => k.provider !== providerId))
      setMessage({ type: 'success', text: `${providerId} API Key 已删除` })
    } catch {
      setMessage({ type: 'error', text: '删除失败，请重试' })
    }
  }

  async function handleTest(providerId: string) {
    setTesting((t) => ({ ...t, [providerId]: true }))
    setTestResult((r) => {
      const next = { ...r }
      delete next[providerId]
      return next
    })
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: providers.find((p) => p.id === providerId)?.models[0] ?? '',
          messages: [{ role: 'user', content: 'Hi' }],
          testOnly: true,
        }),
      })
      if (res.ok || res.status === 200) {
        setTestResult((r) => ({ ...r, [providerId]: 'success' }))
      } else {
        setTestResult((r) => ({ ...r, [providerId]: 'error' }))
      }
    } catch {
      setTestResult((r) => ({ ...r, [providerId]: 'error' }))
    } finally {
      setTesting((t) => ({ ...t, [providerId]: false }))
    }
  }

  async function handleToggleMemory(enabled: boolean) {
    setMemoryEnabled(enabled)
    try {
      const res = await fetch('/api/memories/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error()
      setMessage({ type: 'success', text: enabled ? '跨对话记忆已开启' : '跨对话记忆已关闭' })
    } catch {
      setMemoryEnabled(!enabled)
      setMessage({ type: 'error', text: '切换失败，请重试' })
    }
  }

  async function handleAddMemory() {
    const content = memoryDraft.trim()
    if (!content) return
    setMemorySaving(true)
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '添加失败')
      setMemoryDraft('')
      setMemories((prev) => [data, ...prev])
      setMessage({ type: 'success', text: '记忆已添加' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error && err.message ? err.message : '添加失败，请重试' })
    } finally {
      setMemorySaving(false)
    }
  }

  async function handleDeleteMemory(id: string) {
    setMemoryDeleting(id)
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch {
      setMessage({ type: 'error', text: '删除失败，请重试' })
    } finally {
      setMemoryDeleting(null)
    }
  }

  // Custom model handlers
  function applyPreset(preset: typeof CUSTOM_MODEL_PRESETS[number]) {
    setCmForm((f) => ({ ...f, baseURL: preset.baseURL }))
  }

  async function handleCmSave() {
    const { name, modelId, baseURL } = cmForm
    // 'https://' 是占位默认值，视为未填
    const cleanBaseURL = baseURL && baseURL.trim() !== 'https://' ? baseURL.trim() : ''
    if (!name || !modelId) {
      setMessage({ type: 'error', text: '名称和模型 ID 是必填项' })
      return
    }
    if (cmForm.keySource === 'provider' && !cmForm.provider) {
      setMessage({ type: 'error', text: '请选择要复用的服务商' })
      return
    }
    if (cmForm.keySource !== 'provider' && !cleanBaseURL) {
      setMessage({ type: 'error', text: 'Base URL 是必填项（复用服务商 Key 时可留空）' })
      return
    }
    setCmSaving(true)
    try {
      const body = {
        ...cmForm,
        baseURL: cleanBaseURL,
        keyProvider: cmForm.keySource === 'provider' ? cmForm.provider : undefined,
        apiKey: cmForm.keySource === 'own' ? cmForm.apiKey : '',
      }
      const res = await fetch('/api/custom-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('保存失败')
      const data = await res.json()
      setCustomModels((prev) => (
        cmForm.id ? prev.map((m) => (m.dbId === cmForm.id ? { ...data, updatedAt: new Date().toISOString() } as SavedCustomModel : m)) : [...prev, { ...data, updatedAt: new Date().toISOString() } as SavedCustomModel]
      ))
      setCmForm({ id: null, name: '', modelId: '', baseURL: 'https://', protocol: 'auto', keySource: 'own', apiKey: '', provider: '', contextWindow: 32768, supportsVision: false, supportsFiles: false, supportsReasoning: false })
      setCmFormResult(null)
      setMessage({ type: 'success', text: '自定义模型已保存' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败' })
    } finally {
      setCmSaving(false)
    }
  }

  async function handleCmDelete(dbId: string) {
    if (!confirm('确定要删除此自定义模型吗？')) return
    setCmDeleting(dbId)
    try {
      await fetch(`/api/custom-models/${dbId}`, { method: 'DELETE' })
      setCustomModels((prev) => prev.filter((m) => m.dbId !== dbId))
      setMessage({ type: 'success', text: '模型已删除' })
      if (cmForm.id === dbId) {
        setCmForm({ id: null, name: '', modelId: '', baseURL: 'https://', protocol: 'auto', keySource: 'own', apiKey: '', provider: '', contextWindow: 32768, supportsVision: false, supportsFiles: false, supportsReasoning: false })
        setCmFormResult(null)
      }
    } catch {
      setMessage({ type: 'error', text: '删除失败' })
    } finally {
      setCmDeleting(null)
    }
  }

  async function handleCmTest(id?: string) {
    const targetId = id || `${Date.now()}` // temp id for testing draft
    setCmTesting(targetId)
    setCmFormResult(null)
    setCmTestResult((r) => {
      const next = { ...r }
      delete next[targetId]
      return next
    })
    try {
      const body = id ? { id } : {
        ...cmForm,
        keyProvider: cmForm.keySource === 'provider' ? cmForm.provider : undefined,
        apiKey: cmForm.keySource === 'own' ? cmForm.apiKey : '',
      }
      const res = await fetch('/api/custom-models/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (json.ok) {
        setCmTestResult((r) => ({ ...r, [targetId]: 'success' }))
        setCmFormResult('success')
        setMessage({ type: 'success', text: '连接测试成功' })
      } else {
        setCmTestResult((r) => ({ ...r, [targetId]: 'error' }))
        setCmFormResult('error')
        setMessage({ type: 'error', text: json.error || `测试失败（HTTP ${res.status}）` })
      }
    } catch (err) {
      setCmTestResult((r) => ({ ...r, [targetId]: 'error' }))
      setCmFormResult('error')
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '测试请求失败' })
    } finally {
      setCmTesting(null)
    }
  }

  function startEdit(model: SavedCustomModel) {
    setCmForm({
      id: model.dbId,
      name: model.name,
      modelId: model.modelId,
      baseURL: model.baseURL,
      protocol: model.protocol || 'auto',
      keySource: model.keySource,
      apiKey: '',
      provider: model.providerKey || '',
      contextWindow: model.contextWindow,
      supportsVision: model.supportsVision,
      supportsFiles: model.supportsFiles,
      supportsReasoning: model.supportsReasoning,
    })
    setCmFormResult(null)
  }

  if (!settingsOpen) return null

  const configured = providers.filter((p) => keys.some((k) => k.provider === p.id))
  const unconfigured = providers.filter((p) => !keys.some((k) => k.provider === p.id))
  
  // Use the pre-calculated sorted configured list
  const sortedConfiguredList = sortedConfigured

  const sectionTitle = NAV_ITEMS.find((i) => i.id === activeSection)?.label

  const renderProviderCard = (provider: ProviderInfo) => {
    const existingKey = getKeyForProvider(provider.id)
    const draft = draftKeys[provider.id] ?? ''
    const isSaving = saving[provider.id] ?? false
    const isTesting = testing[provider.id] ?? false
    const result = testResult[provider.id]
    const isPasswordVisible = showPassword[provider.id] ?? false
    const url = PROVIDER_URL[provider.id]

    return (
      <div
        key={provider.id}
        className={cn(
          'rounded-xl border px-3.5 py-3 space-y-2.5 transition-colors',
          'border-line/60',
          'bg-surface/60',
          existingKey && 'bg-surface-muted/80'
        )}
      >
        {/* Header: dot + name + status badge + date */}
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-2 h-2 rounded-full shrink-0',
            existingKey ? 'bg-green-500' : 'bg-content-muted/40'
          )} />
          <span className="text-sm font-medium text-content-primary flex-1 truncate">
            {provider.name}
          </span>
          {existingKey ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium shrink-0">
              已配置
            </span>
          ) : (
            <span className="text-[11px] text-content-muted shrink-0">
              {provider.models.length} 个模型
            </span>
          )}
          {existingKey && (
            <span className="text-[10px] text-content-muted shrink-0 whitespace-nowrap">
              {new Date(existingKey.updatedAt).toLocaleDateString('zh-CN').replace(/年/g, '-').replace(/月/g, '-')}
            </span>
          )}
        </div>

        {/* Saved key display + actions */}
        {existingKey && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface-muted/80 border border-line/40">
              <Key className="w-3.5 h-3.5 text-content-muted shrink-0" />
              <code className="text-xs text-content-secondary truncate">
                {existingKey.maskedKey}
              </code>
            </div>
            <button
              onClick={() => handleTest(provider.id)}
              disabled={isTesting}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-surface-subtle transition-colors shrink-0"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : result === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              ) : result === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">测试</span>
            </button>
            <button
              onClick={() => handleDelete(provider.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500/70 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">删除</span>
            </button>
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={isPasswordVisible ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraftKeys((d) => ({ ...d, [provider.id]: e.target.value }))}
              placeholder={existingKey ? '输入新 Key 替换...' : '粘贴 API Key...'}
              className={cn(
                'w-full rounded-lg border px-2.5 py-1.5 pr-8 text-xs',
                'border-line/60',
                'bg-surface',
                'text-content-primary',
                'placeholder:text-content-muted',
                'focus:outline-none focus:ring-2 focus:ring-line-strong/30',
                'focus:border-line-strong'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-content-muted hover:text-content-primary transition-colors"
              tabIndex={-1}
            >
              {isPasswordVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            onClick={() => handleSave(provider.id)}
            disabled={!draft.trim() || isSaving}
            className={cn(
              'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0',
              draft.trim() && !isSaving
                ? 'bg-accent text-accent-foreground hover:bg-accent-hover active:scale-[0.97]'
                : 'bg-surface-muted text-content-muted cursor-not-allowed'
            )}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存
          </button>
        </div>

        {/* Get key link */}
        {url && !existingKey && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-content-muted hover:text-content-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            获取 Key
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={() => setSettingsOpen(false)}
      />

      {/* Modal card */}
      <div className="relative w-[42rem] max-w-[calc(100vw-2rem)] h-[36rem] max-h-[calc(100vh-2rem)] flex flex-col rounded-xl border border-line/60 bg-surface-glass backdrop-blur-xl shadow-2xl">
        {/* Header with macOS red dot */}
        <div className="relative flex items-center px-4 pt-3 pb-2.5 border-b border-line/60 shrink-0">
          <button
            onClick={() => setSettingsOpen(false)}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors group flex items-center justify-center shrink-0 mr-3"
            aria-label="关闭"
          >
            <svg className="w-1.5 h-1.5 text-red-950 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-content-primary">设置</h2>
        </div>

        {/* Body: sidebar nav + content */}
        <div className="flex-1 min-h-0 flex">
          {/* Sidebar */}
          <nav className="m-2 mr-0 w-44 shrink-0 rounded-xl border border-line/60 bg-surface-muted/50 p-1.5 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-left transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-content-secondary hover:bg-surface-subtle/60'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.id === 'providers' && keys.length > 0 && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0',
                      active
                        ? 'bg-accent-foreground/20'
                        : 'bg-surface-subtle/80 text-content-muted'
                    )}>
                      {keys.length}
                    </span>
                  )}
                  {item.id === 'memory' && memories.length > 0 && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0',
                      active
                        ? 'bg-accent-foreground/20'
                        : 'bg-surface-subtle/80 text-content-muted'
                    )}>
                      {memories.length}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-content-muted" />
              </div>
            ) : (
              <>
                {/* Toast message */}
                {message && (
                  <div
                    className={cn(
                      'mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2',
                      message.type === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200/60 dark:border-green-800/60'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200/60 dark:border-red-800/60'
                    )}
                  >
                    {message.type === 'success' ? (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    {message.text}
                  </div>
                )}

                {/* Section title */}
                <h3 className="text-sm font-semibold text-content-primary mb-2.5 text-left">
                  {sectionTitle}
                </h3>

                {/* 服务商 */}
                {activeSection === 'providers' && (
                  <div className="space-y-3">
                    {/* Filter button to show only configured providers */}
                    {configured.length > 0 && unconfigured.length > 0 && (
                      <div className="flex items-center justify-end gap-2 pr-0.5">
                        <button
                          onClick={() => setShowOnlyConfigured(!showOnlyConfigured)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
                            showOnlyConfigured
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-surface-muted text-content-secondary hover:bg-surface-subtle'
                          )}
                        >
                          <Filter className="w-3 h-3" />
                          {showOnlyConfigured ? '显示全部' : '仅已配置'}
                        </button>
                      </div>
                    )}

                    {/* Configured providers section */}
                    {(showOnlyConfigured ? configured : [...configured, ...unconfigured]).length > 0 && (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => setConfiguredCollapsed(!configuredCollapsed)}
                          className={cn(
                            'flex items-center gap-1.5 w-full px-0.5 py-1 rounded-lg transition-colors',
                            configuredCollapsed ? 'hover:bg-surface-subtle/60' : ''
                          )}
                        >
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="text-[11px] font-medium text-content-secondary">已配置</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-mono shrink-0">
                              {configured.length}
                            </span>
                          </div>
                          {configuredCollapsed ? (
                            <ChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0" />
                          ) : (
                            <ChevronUp className="w-3.5 h-3.5 text-content-muted shrink-0" />
                          )}
                        </button>

                        {!configuredCollapsed && (
                          <div className="space-y-2 mt-2">
                            {sortedConfiguredList.map((provider) => (
                              <div key={provider.id} className="animate-in fade-in slide-in-from-top-2 duration-300">
                                {renderProviderCard(provider)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Unconfigured providers section */}
                    {!showOnlyConfigured && unconfigured.length > 0 && (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => setUnconfiguredCollapsed(!unconfiguredCollapsed)}
                          className={cn(
                            'flex items-center gap-1.5 w-full px-0.5 py-1 rounded-lg transition-colors',
                            unconfiguredCollapsed ? 'hover:bg-surface-subtle/60' : ''
                          )}
                        >
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="text-[11px] font-medium text-content-secondary">待配置</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle/80 text-content-muted font-mono shrink-0">
                              {unconfigured.length}
                            </span>
                          </div>
                          {unconfiguredCollapsed ? (
                            <ChevronDown className="w-3.5 h-3.5 text-content-muted shrink-0" />
                          ) : (
                            <ChevronUp className="w-3.5 h-3.5 text-content-muted shrink-0" />
                          )}
                        </button>

                        {!unconfiguredCollapsed && (
                          <div className="space-y-2 mt-2">
                            {unconfigured.map((provider) => (
                              <div key={provider.id} className="animate-in fade-in slide-in-from-top-2 duration-300">
                                {renderProviderCard(provider)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 自定义模型 */}
                {activeSection === 'customModels' && (
                  <div className="space-y-3">
                    {/* Form for add/edit */}
                    <div className="rounded-xl border border-line/60 bg-surface/60 px-3.5 py-3 space-y-2.5">
                      <h4 className="text-sm font-semibold text-content-primary">{cmForm.id ? '编辑自定义模型' : '添加自定义模型'}</h4>
                      
                      {/* Presets */}
                      <div className="flex flex-wrap gap-1.5">
                        {CUSTOM_MODEL_PRESETS.map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => applyPreset(preset)}
                            className="px-2.5 py-1 rounded-lg text-[11px] bg-surface-muted text-content-secondary hover:bg-surface-subtle transition-colors"
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>

                      {/* Name & model id */}
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={cmForm.name}
                          onChange={(e) => setCmForm({ ...cmForm, name: e.target.value })}
                          placeholder="显示名称 (如：我的 DeepSeek)"
                          className="w-full rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                        />
                        <input
                          type="text"
                          value={cmForm.modelId}
                          onChange={(e) => setCmForm({ ...cmForm, modelId: e.target.value })}
                          placeholder="模型 ID (如：deepseek-chat)"
                          className="w-full rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                        />
                      </div>

                      {/* 重复模型提示 */}
                      {(() => {
                        const mid = cmForm.modelId.trim()
                        const pid = cmForm.keySource === 'provider' ? cmForm.provider : ''
                        const builtinHit = !!(pid && mid && providers.find(p => p.id === pid)?.models.includes(mid))
                        const ownHit = !!(mid && customModels.some(m => m.modelId === mid && (!cmForm.id || m.dbId !== cmForm.id)))
                        if (builtinHit) return (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 text-left flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" /> 该模型 ID 已在内置列表中，通常无需重复添加
                          </p>
                        )
                        if (ownHit) return (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 text-left flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" /> 已存在相同模型 ID 的自定义模型，保存会失败
                          </p>
                        )
                        return null
                      })()}

                      {/* Base URL */}
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={cmForm.baseURL}
                          onChange={(e) => setCmForm({ ...cmForm, baseURL: e.target.value })}
                          placeholder={cmForm.keySource === 'provider'
                            ? 'Base URL (可选：留空使用服务商官方接口)'
                            : 'Base URL (OpenAI 兼容，如：https://api.siliconflow.cn/v1)'}
                          className="w-full rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                        />
                        {cmForm.keySource === 'provider' && (
                          <p className="text-[10px] text-content-muted text-left">
                            留空将直接调用所选服务商官方接口（适合添加该服务商未内置的新模型）；也可填写代理或网关地址覆盖。
                          </p>
                        )}
                      </div>

                      {/* API protocol selector */}
                      <div className="flex items-center gap-2">
                        <select
                          value={cmForm.protocol}
                          onChange={(e) => setCmForm({ ...cmForm, protocol: e.target.value as CustomModelForm['protocol'] })}
                          className="flex-1 rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                        >
                          <option value="auto">自动识别接口协议</option>
                          <option value="chat">Chat Completions (/chat/completions)</option>
                          <option value="responses">OpenAI Responses (/responses)</option>
                          <option value="anthropic">Anthropic (/messages)</option>
                        </select>
                      </div>

                      {/* Key source selector */}
                      <div className="flex items-center gap-2">
                        <select
                          value={cmForm.keySource}
                          onChange={(e) => {
                            const v = e.target.value as 'own' | 'provider' | 'none'
                            setCmForm({
                              ...cmForm,
                              keySource: v,
                              // 复用服务商时清空 Base URL（留空走服务商原生接口）
                              baseURL: v === 'provider' ? '' : (cmForm.baseURL || 'https://'),
                            })
                          }}
                          className="flex-1 rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                        >
                          <option value="own">使用独立 API Key</option>
                          <option value="provider">复用已有服务商 Key</option>
                          <option value="none">无需鉴权 (本地)</option>
                        </select>
                      </div>

                      {/* Conditional key fields */}
                      {(cmForm.keySource === 'own' || cmForm.keySource === 'provider') && (
                        <div className="space-y-1.5">
                          {cmForm.keySource === 'own' && (
                            <input
                              type="password"
                              value={cmForm.apiKey}
                              onChange={(e) => setCmForm({ ...cmForm, apiKey: e.target.value })}
                              placeholder="API Key"
                              className="w-full rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                            />
                          )}
                          {cmForm.keySource === 'provider' && (
                            <select
                              value={cmForm.provider || ''}
                              onChange={(e) => setCmForm({ ...cmForm, provider: e.target.value })}
                              className="w-full rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                            >
                              <option value="">选择服务商...</option>
                              {keys.map((k) => (
                                <option key={k.provider} value={k.provider}>{k.provider}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {/* Context window */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-content-secondary shrink-0">上下文窗口</span>
                        <input
                          type="number"
                          value={cmForm.contextWindow}
                          onChange={(e) => setCmForm({ ...cmForm, contextWindow: Number(e.target.value) })}
                          className="flex-1 rounded-lg border border-line/60 bg-surface px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:ring-2 focus:ring-line-strong/30"
                        />
                      </div>

                      {/* Toggles */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-muted text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cmForm.supportsVision}
                            onChange={(e) => setCmForm({ ...cmForm, supportsVision: e.target.checked })}
                            className="accent-accent"
                          />
                          <span>支持视觉</span>
                        </label>
                        <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-muted text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cmForm.supportsFiles}
                            onChange={(e) => setCmForm({ ...cmForm, supportsFiles: e.target.checked })}
                            className="accent-accent"
                          />
                          <span>支持文件</span>
                        </label>
                        <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-muted text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cmForm.supportsReasoning}
                            onChange={(e) => setCmForm({ ...cmForm, supportsReasoning: e.target.checked })}
                            className="accent-accent"
                          />
                          <span>支持推理</span>
                        </label>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCmTest(cmForm.id || undefined)}
                          disabled={cmTesting !== null}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted text-content-secondary hover:bg-surface-subtle transition-colors shrink-0"
                        >
                          {cmTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          {cmForm.id ? '测试连接' : '保存前测试'}
                        </button>
                        {cmFormResult === 'success' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                        {cmFormResult === 'error' && <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
                        <button
                          onClick={handleCmSave}
                          disabled={cmSaving || cmForm.keySource === 'own' && !cmForm.apiKey}
                          className={cn(
                            'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0',
                            !(cmSaving || (cmForm.keySource === 'own' && !cmForm.apiKey))
                              ? 'bg-accent text-accent-foreground hover:bg-accent-hover'
                              : 'bg-surface-muted text-content-muted cursor-not-allowed'
                          )}
                        >
                          {cmSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          保存
                        </button>
                      </div>
                    </div>

                    {/* List of existing models */}
                    {customModels.length > 0 ? (
                      <ul className="space-y-1.5">
                        {customModels.map((model) => (
                          <li
                            key={model.id}
                            className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface/60 border border-line/60"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn('w-1.5 h-1.5 rounded-full', CUSTOM_MODEL_DOT)} />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-content-primary truncate">{model.name}</p>
                                <p className="text-[11px] text-content-muted truncate">{model.modelId} @ {model.baseURL ? model.baseURL.replace(/^https?:\/\//, '') : (model.providerKey || '服务商官方接口')}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {cmTestResult[model.dbId] === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                              {cmTestResult[model.dbId] === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                              <button
                                onClick={() => startEdit(model)}
                                className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-subtle transition-colors"
                              >
                                <Wrench className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCmDelete(model.dbId)}
                                disabled={cmDeleting === model.dbId}
                                className="p-1.5 rounded-lg text-red-500/70 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              >
                                {cmDeleting === model.dbId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-content-muted text-left py-1">
                        暂无自定义模型。您可以添加 OpenAI 兼容端点（如 OpenRouter、SiliconFlow、Ollama 等）。
                      </p>
                    )}
                  </div>
                )}

                {/* 用量统计 */}
                {activeSection === 'usage' && (
                  <div className="space-y-3">
                    {!usageStats ? (
                      <p className="text-[11px] text-content-muted text-left py-1">
                        暂无统计数据。发起对话后，每次回复的 Token 消耗会自动记录在这里。
                      </p>
                    ) : (
                      <>
                        {/* 总览卡片 */}
                        <div className="rounded-xl border border-line/60 bg-surface/60 px-3.5 py-3 space-y-2.5">
                          <div className="flex items-end justify-between gap-3">
                            <div className="text-left">
                              <p className="text-[11px] text-content-muted">累计消耗 Token</p>
                              <p className="text-xl font-semibold text-content-primary font-mono leading-tight">
                                {usageStats.totals.totalTokens.toLocaleString()}
                              </p>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-muted text-content-muted font-mono shrink-0 mb-0.5">
                              {usageStats.totals.messages.toLocaleString()} 条回复
                            </span>
                          </div>
                          {/* 输入/输出拆分条 */}
                          <div className="space-y-1.5">
                            {(() => {
                              const t = usageStats.totals
                              const pct = t.totalTokens > 0
                                ? Math.round((t.promptTokens / t.totalTokens) * 100)
                                : 0
                              return (
                                <>
                                  <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden flex">
                                    <div
                                      className="h-full bg-accent/70"
                                      style={{ width: `${pct}%` }}
                                      title={`输入 ${t.promptTokens.toLocaleString()}`}
                                    />
                                    <div
                                      className="h-full bg-content-muted/40 flex-1"
                                      title={`输出 ${t.completionTokens.toLocaleString()}`}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-content-secondary flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-accent/70 inline-block" />
                                      输入 {t.promptTokens.toLocaleString()}
                                    </span>
                                    <span className="text-content-muted flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-content-muted/40 inline-block" />
                                      输出 {t.completionTokens.toLocaleString()}
                                    </span>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        </div>

                        {/* 最近 30 天柱状图 */}
                        {usageStats.byDay.length > 0 && (
                          <div className="rounded-xl border border-line/60 bg-surface/60 px-3.5 py-3">
                            <p className="text-[11px] font-medium text-content-secondary mb-2 text-left">
                              最近 30 天
                            </p>
                            {(() => {
                              const max = Math.max(...usageStats.byDay.map((d) => d.totalTokens), 1)
                              const sum30 = usageStats.byDay.reduce((s, d) => s + d.totalTokens, 0)
                              return (
                                <>
                                  <div className="flex items-end gap-[3px] h-20">
                                    {usageStats.byDay.map((d) => (
                                      <div
                                        key={d.date}
                                        className="flex-1 flex items-end h-full group"
                                        title={`${d.date.slice(5)} · ${d.totalTokens.toLocaleString()} tokens`}
                                      >
                                        <div
                                          className={cn(
                                            'w-full rounded-t-[3px] transition-colors',
                                            d.totalTokens > 0
                                              ? 'bg-accent/70 group-hover:bg-accent'
                                              : 'bg-surface-subtle/60'
                                          )}
                                          style={{
                                            height: d.totalTokens > 0
                                              ? `${Math.max((d.totalTokens / max) * 100, 4)}%`
                                              : '4px',
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-content-muted font-mono">
                                    <span>{usageStats.byDay[0].date.slice(5)}</span>
                                    <span>{sum30.toLocaleString()} tokens</span>
                                    <span>{usageStats.byDay[usageStats.byDay.length - 1].date.slice(5)}</span>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        )}

                        {/* 按模型统计 */}
                        {usageStats.byModel.length > 0 && (
                          <div className="rounded-xl border border-line/60 bg-surface/60 px-3.5 py-3">
                            <p className="text-[11px] font-medium text-content-secondary mb-2 text-left">
                              按模型
                            </p>
                            <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                              {usageStats.byModel.map((m) => {
                                const pct = usageStats.totals.totalTokens > 0
                                  ? Math.round((m.totalTokens / usageStats.totals.totalTokens) * 100)
                                  : 0
                                return (
                                  <li
                                    key={m.model}
                                    className="rounded-lg bg-surface-muted/60 border border-line/40 px-2.5 py-2"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-content-primary truncate">
                                        {m.model}
                                      </span>
                                      <span className="text-xs font-mono text-content-secondary shrink-0">
                                        {m.totalTokens.toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <div className="flex-1 h-1 rounded-full bg-surface-subtle overflow-hidden">
                                        <div
                                          className="h-full rounded-full bg-accent/70"
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] text-content-muted font-mono shrink-0 w-9 text-right">
                                        {pct}%
                                      </span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-[10px] text-content-muted">
                                      <span>输入 {m.promptTokens.toLocaleString()} · 输出 {m.completionTokens.toLocaleString()}</span>
                                      <span>{m.messages} 条</span>
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 记忆 */}
                {activeSection === 'memory' && (
                  <div className="space-y-2.5">
                    {/* 开关 */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-left min-w-0">
                        <p className="text-xs text-content-secondary">记忆功能</p>
                        <p className="text-[11px] text-content-muted truncate">换新对话时 AI 仍记得关于你的信息</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={memoryEnabled}
                        onClick={() => handleToggleMemory(!memoryEnabled)}
                        className={cn(
                          'relative w-9 h-5 rounded-full transition-colors shrink-0',
                          memoryEnabled ? 'bg-accent' : 'bg-surface-subtle'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-surface transition-transform',
                            memoryEnabled && 'translate-x-4'
                          )}
                        />
                      </button>
                    </div>

                    {/* 手动添加 */}
                    <div className="flex gap-2 pt-2 border-t border-line/40">
                      <input
                        type="text"
                        value={memoryDraft}
                        onChange={(e) => setMemoryDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault()
                            handleAddMemory()
                          }
                        }}
                        placeholder="手动添加一条记忆，如：用户喜欢简洁的设计"
                        className={cn(
                          'flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-xs',
                          'border-line/60',
                          'bg-surface',
                          'text-content-primary',
                          'placeholder:text-content-muted',
                          'focus:outline-none focus:ring-2 focus:ring-line-strong/30',
                          'focus:border-line-strong'
                        )}
                      />
                      <button
                        onClick={handleAddMemory}
                        disabled={!memoryDraft.trim() || memorySaving}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 shrink-0',
                          memoryDraft.trim() && !memorySaving
                            ? 'bg-accent text-accent-foreground hover:bg-accent-hover active:scale-[0.97]'
                            : 'bg-surface-muted text-content-muted cursor-not-allowed'
                        )}
                      >
                        {memorySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        添加
                      </button>
                    </div>

                    {/* 记忆列表 */}
                    {memories.length === 0 ? (
                      <p className="text-[11px] text-content-muted text-left py-1">
                        暂无记忆。聊天中告诉 AI 你的喜好，它会自动记下来。
                      </p>
                    ) : (
                      <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                        {memories.map((m) => (
                          <li
                            key={m.id}
                            className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-surface-muted/60 border border-line/40"
                          >
                            <div className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-subtle/80 text-content-muted shrink-0">
                                  {MEMORY_CATEGORY_LABELS[m.category] ?? '其他'}
                                </span>
                                {m.source === 'manual' && (
                                  <span className="text-[10px] text-content-muted shrink-0">手动添加</span>
                                )}
                              </div>
                              <p className="text-xs text-content-secondary break-words leading-relaxed">
                                {m.content}
                              </p>
                            </div>
                            <button
                              onClick={() => handleDeleteMemory(m.id)}
                              disabled={memoryDeleting === m.id}
                              className="shrink-0 p-1 rounded-md text-content-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              aria-label="删除记忆"
                            >
                              {memoryDeleting === m.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* 通用 */}
                {activeSection === 'general' && (
                  <div className="rounded-xl border border-line/60 bg-surface/60 px-3.5 py-3 space-y-2.5">
                    {/* Style Settings */}
                    <div className="text-left">
                      <p className="text-xs text-content-secondary">AI 风格</p>
                      <p className="text-[11px] text-content-muted">调节 AI 的幽默程度或严肃程度</p>
                    </div>
                    <StyleSlider
                      value={conversationStyleOffset}
                      onChange={(offset) => {
                        setConversationStyleOffset(offset)
                        // Auto-save to localStorage and DB
                        localStorage.setItem(STYLE_OFFSET_STORAGE_KEY, String(offset))
                        if (currentConversationId) {
                          fetch(`/api/conversations/${currentConversationId}/style`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ styleOffset: offset }),
                          }).then((res) => {
                            if (!res.ok) throw new Error('Failed to persist style')
                            setMessage({ type: 'success', text: `对话风格已调整为${getStyleLabel(offset)}` })
                          }).catch((err) => {
                            console.error('Failed to persist style:', err)
                            setMessage({ type: 'error', text: '对话风格保存失败，请重试' })
                          })
                        } else {
                          setMessage({ type: 'success', text: `对话风格已调整为${getStyleLabel(offset)}` })
                        }
                      }}
                      label="对话风格"
                    />

                    <div className="text-left pt-2 border-t border-line/60">
                      <p className="text-xs text-content-secondary">外观</p>
                      <p className="text-[11px] text-content-muted">选择界面明暗主题</p>
                    </div>
                    <div className="flex rounded-lg bg-surface-muted p-0.5 gap-0.5">
                      {THEME_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => applyTheme(opt.value)}
                          className={cn(
                            'flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                            themeChoice === opt.value
                              ? 'bg-accent text-accent-foreground shadow-sm'
                              : 'text-content-muted hover:text-content-primary'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 帮助 */}
                {activeSection === 'help' && (
                  <div className="space-y-2.5">
                    <p className="text-xs text-content-secondary text-left leading-relaxed">
                      在下方服务商官网注册并创建 API Key，然后粘贴到「服务商」分类中即可开始使用。
                    </p>
                    <div className="rounded-xl border border-line/60 bg-surface/60 p-3.5">
                      <ul className="text-[11px] space-y-1.5">
                        {providers.map((provider) => {
                          const url = PROVIDER_URL[provider.id]
                          if (!url) return null
                          return (
                            <li key={provider.id} className="flex items-center gap-2">
                              <span className="text-content-secondary shrink-0 min-w-[5rem]">{provider.name}</span>
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-content-primary hover:underline truncate">
                                {url.replace('https://', '')}
                              </a>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                )}

                {/* 关于 */}
                {activeSection === 'about' && (
                  <div className="space-y-2.5">
                    {/* App identity */}
                    <div className="rounded-xl border border-line/60 bg-surface/60 px-3.5 py-4 flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                        <MessageSquare className="w-6 h-6 text-accent-foreground" />
                      </div>
                      <p className="text-sm font-semibold text-content-primary">八号产房</p>
                      <p className="text-[11px] text-content-muted">AI 多模型对话助手 · v0.1.0</p>
                    </div>

                    {/* Info rows */}
                    <div className="rounded-xl border border-line/60 bg-surface/60 px-3.5 py-2.5 divide-y divide-line/40">
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-xs text-content-secondary shrink-0">版本</span>
                        <span className="text-xs text-content-primary text-right">0.1.0</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-xs text-content-secondary shrink-0">技术栈</span>
                        <span className="text-xs text-content-primary text-right">Next.js · Prisma · NextAuth</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-xs text-content-secondary shrink-0">数据存储</span>
                        <span className="text-xs text-content-primary text-right">本地 SQLite / Turso</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-xs text-content-secondary shrink-0">部署平台</span>
                        <span className="text-xs text-content-primary text-right">Vercel</span>
                      </div>
                    </div>

                    {/* GitHub */}
                    <a
                      href="https://github.com/molinglong"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-line/60 bg-surface/60 text-xs text-content-primary hover:border-line-strong transition-colors"
                    >
                      <GitBranch className="w-4 h-4 text-content-muted shrink-0" />
                      GitHub · molinglong
                      <ExternalLink className="w-3 h-3 text-content-muted ml-auto shrink-0" />
                    </a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer status bar */}
        <div className="shrink-0 px-4 py-2 border-t border-line/60 flex items-center gap-2">
          <span className="text-[10px] text-content-muted">
            {keys.length} 个服务商已配置 · {memories.length} 条记忆
          </span>
          <kbd className="ml-auto text-[10px] text-content-muted px-1.5 py-0.5 rounded border border-line bg-surface-muted font-mono">ESC</kbd>
        </div>
      </div>
    </div>
  )
}
