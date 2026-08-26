'use client'

import { Scale, Loader2, Sparkles, ChevronRight } from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'
import { getAllModels } from '@/lib/ai/registry'
import { cn } from '@/lib/utils'
import { OpponentLane } from '@/components/explore/OpponentLane'
import { UserLane } from '@/components/explore/UserLane'
import { AssistantPanel } from '@/components/explore/AssistantPanel'
import { FactCheckModal } from '@/components/explore/FactCheckModal'
import { TruthSummary } from '@/components/explore/TruthSummary'
import { ModelSelector } from '@/components/explore/ModelSelector'

// 辩题类型
interface Topic {
  id: string
  title: string
  description: string
  proLabel: string
  conLabel: string
}

// 默认辩题库
const DEFAULT_TOPICS: Topic[] = [
  {
    id: 'short-video',
    title: '短视频对青少年利大于弊',
    description: '讨论短视频对青少年学习、生活、认知的影响',
    proLabel: '正方：利大于弊',
    conLabel: '反方：弊大于利',
  },
  {
    id: 'ai-creativity',
    title: 'AI 创作能否超越人类创造力',
    description: '探讨人工智能在艺术、文学等创意领域的潜力',
    proLabel: '正方：AI 能超越',
    conLabel: '反方：AI 不能超越',
  },
  {
    id: 'social-media',
    title: '社交媒体让人更孤独',
    description: '分析社交媒体对人际关系和心理健康的影响',
    proLabel: '正方：让人更孤独',
    conLabel: '反方：让人更连接',
  },
]

// 发言类型
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  citations?: Citation[]
  factCheckResult?: FactCheckResult
}

interface Citation {
  title: string
  url: string
  snippet: string
  source: 'google' | 'baidu'
}

interface FactCheckResult {
  claim: string
  status: 'verified' | 'disputed' | 'unverifiable' | 'false'
  details: string[]
  suggestion?: string
}

// 对手发言
interface OpponentMessage {
  id: string
  content: string
  timestamp: Date
}

// 当前状态
interface DebateState {
  topic: Topic | null
  userMessages: Message[]
  opponentMessages: OpponentMessage[]
  round: number
  status: 'idle' | 'user_turn' | 'opponent_turn' | 'finished'
  exhaustionDetected: boolean
}

const initialState: DebateState = {
  topic: null,
  userMessages: [],
  opponentMessages: [],
  round: 0,
  status: 'idle',
  exhaustionDetected: false,
}

export default function ExplorePage() {
  const allModels = getAllModels()
  const [userModel, setUserModel] = useState(allModels[0]?.id || 'gpt-4o')
  const [opponentModel, setOpponentModel] = useState(allModels[1]?.id || 'claude-3-5-sonnet')
  const [assistantModel, setAssistantModel] = useState(allModels[0]?.id || 'gpt-4o')

  const [state, setState] = useState<DebateState>(initialState)
  const [customTopic, setCustomTopic] = useState('')
  const [showTopicSelector, setShowTopicSelector] = useState(true)
  const [factCheckTarget, setFactCheckTarget] = useState<{
    content: string
    role: 'user' | 'opponent'
    messageId: string
  } | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [searchingEvidence, setSearchingEvidence] = useState(false)
  const [evidenceResults, setEvidenceResults] = useState<string | null>(null)
  const [assistantAnalysis, setAssistantAnalysis] = useState<string | null>(null)

  const messageListRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [state.userMessages, state.opponentMessages])

  // 选择辩题
  const handleSelectTopic = useCallback(async (topic: Topic | 'custom') => {
    if (topic === 'custom') {
      if (!customTopic.trim()) return
      const newTopic: Topic = {
        id: 'custom-' + Date.now(),
        title: customTopic,
        description: '自定义辩题',
        proLabel: '正方',
        conLabel: '反方',
      }
      setState(prev => ({ ...prev, topic: newTopic }))
    } else {
      setState(prev => ({ ...prev, topic }))
    }
    setShowTopicSelector(false)

    // 对手发表第一轮观点
    await generateOpponentMessage(topic === 'custom' ? customTopic : topic.title)
  }, [customTopic])

  // 生成对手发言
  const generateOpponentMessage = useCallback(async (topicTitle: string) => {
    setState(prev => ({ ...prev, status: 'opponent_turn' }))

    try {
      const res = await fetch('/api/explore/opponent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topicTitle,
          model: opponentModel,
          conversationHistory: state.userMessages.map(m => ({
            role: 'user',
            content: m.content,
          })),
          opponentHistory: state.opponentMessages.map(m => ({
            role: 'assistant',
            content: m.content,
          })),
        }),
      })

      if (!res.ok) throw new Error('生成对手发言失败')

      const data = await res.json()
      const opponentMsg: OpponentMessage = {
        id: `opp-${Date.now()}`,
        content: data.content,
        timestamp: new Date(),
      }

      setState(prev => ({
        ...prev,
        opponentMessages: [...prev.opponentMessages, opponentMsg],
        round: prev.round + 1,
        status: 'user_turn',
      }))
    } catch (err) {
      console.error('Failed to generate opponent message:', err)
      setState(prev => ({ ...prev, status: 'user_turn' }))
    }
  }, [opponentModel, state.userMessages, state.opponentMessages])

  // 用户发送消息
  const handleSendMessage = useCallback(async (content: string) => {
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    }

    setState(prev => ({
      ...prev,
      userMessages: [...prev.userMessages, userMsg],
      status: 'opponent_turn',
    }))

    // 清空助手分析
    setAssistantAnalysis(null)
    setEvidenceResults(null)

    // 对手回应
    await generateOpponentMessage(state.topic?.title || '')
  }, [generateOpponentMessage, state.topic])

  // 搜索论据
  const handleSearchEvidence = useCallback(async (query: string) => {
    if (!query.trim()) return
    setSearchingEvidence(true)
    setEvidenceResults(null)

    try {
      const res = await fetch('/api/explore/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      if (!res.ok) throw new Error('搜索失败')

      const data = await res.json()
      setEvidenceResults(data.results)
    } catch (err) {
      console.error('Failed to search evidence:', err)
      setEvidenceResults('搜索失败，请稍后重试')
    } finally {
      setSearchingEvidence(false)
    }
  }, [])

  // 助手分析
  const handleAssistantAnalysis = useCallback(async (content: string) => {
    setAssistantAnalysis('分析中...')

    try {
      const res = await fetch('/api/explore/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'logic',
          content,
          topic: state.topic?.title,
          model: assistantModel,
          conversationHistory: [
            ...state.opponentMessages.map(m => ({ role: 'assistant', content: m.content })),
            ...state.userMessages.map(m => ({ role: 'user', content: m.content })),
          ],
        }),
      })

      if (!res.ok) throw new Error('分析失败')

      const data = await res.json()
      setAssistantAnalysis(data.analysis)
    } catch (err) {
      console.error('Failed to analyze:', err)
      setAssistantAnalysis('分析失败，请稍后重试')
    }
  }, [assistantModel, state.topic, state.opponentMessages, state.userMessages])

  // 事实核查
  const handleFactCheck = useCallback(async (content: string, role: 'user' | 'opponent', messageId: string) => {
    setFactCheckTarget({ content, role, messageId })
  }, [])

  // 润色发言
  const handlePolishText = useCallback(async (content: string): Promise<string> => {
    try {
      const res = await fetch('/api/explore/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          topic: state.topic?.title,
          model: assistantModel,
        }),
      })

      if (!res.ok) throw new Error('润色失败')

      const data = await res.json()
      return data.polished
    } catch (err) {
      console.error('Failed to polish:', err)
      return content
    }
  }, [assistantModel, state.topic])

  // 结束辩论
  const handleFinishDebate = useCallback(() => {
    setShowSummary(true)
    setState(prev => ({ ...prev, status: 'finished' }))
  }, [])

  // 重置
  const handleReset = useCallback(() => {
    setState(initialState)
    setShowTopicSelector(true)
    setShowSummary(false)
    setFactCheckTarget(null)
    setAssistantAnalysis(null)
    setEvidenceResults(null)
  }, [])

  // 新辩题
  const handleNewTopic = useCallback(() => {
    handleReset()
  }, [handleReset])

  // 辩题选择界面
  if (showTopicSelector) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-4">
              <Scale className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-2xl font-bold mb-2">观点探索</h1>
            <p className="text-content-secondary">选择一个辩题，与 AI 对手展开辩论</p>
          </div>

          {/* 模型选择 */}
          <div className="mb-6 p-4 rounded-xl bg-surface-muted border border-line/60">
            <div className="text-xs text-content-muted mb-3 font-medium">模型配置</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-content-secondary mb-1 block">你的模型</label>
                <ModelSelector
                  models={allModels}
                  value={userModel}
                  onChange={setUserModel}
                />
              </div>
              <div>
                <label className="text-[11px] text-content-secondary mb-1 block">对手模型</label>
                <ModelSelector
                  models={allModels}
                  value={opponentModel}
                  onChange={setOpponentModel}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] text-content-secondary mb-1 block">助手模型</label>
                <ModelSelector
                  models={allModels}
                  value={assistantModel}
                  onChange={setAssistantModel}
                />
              </div>
            </div>
          </div>

          {/* 辩题列表 */}
          <div className="space-y-3">
            {DEFAULT_TOPICS.map((topic) => (
              <button
                key={topic.id}
                onClick={() => handleSelectTopic(topic)}
                className="w-full p-4 rounded-xl border border-line/60 bg-surface hover:bg-surface-subtle hover:border-accent/40 transition-all text-left group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium mb-1 group-hover:text-accent transition-colors">
                      {topic.title}
                    </h3>
                    <p className="text-sm text-content-secondary">{topic.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-content-muted">
                      <span className="text-emerald-600 dark:text-emerald-400">{topic.proLabel}</span>
                      <ChevronRight className="w-3 h-3" />
                      <span className="text-red-600 dark:text-red-400">{topic.conLabel}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-content-muted group-hover:text-accent transition-colors" />
                </div>
              </button>
            ))}

            {/* 自定义辩题 */}
            <div className="p-4 rounded-xl border border-line/60 bg-surface">
              <div className="text-sm font-medium mb-2">自定义辩题</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="输入你的辩题..."
                  className="flex-1 px-3 py-2 rounded-lg bg-surface-muted border border-line/60 text-sm placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customTopic.trim()) {
                      handleSelectTopic('custom')
                    }
                  }}
                />
                <button
                  onClick={() => handleSelectTopic('custom')}
                  disabled={!customTopic.trim()}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    customTopic.trim()
                      ? 'bg-accent text-accent-foreground hover:bg-accent-hover'
                      : 'bg-surface-muted text-content-muted cursor-not-allowed'
                  )}
                >
                  开始
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 真相摘要界面
  if (showSummary && state.topic) {
    return (
      <div className="h-full overflow-y-auto">
        <TruthSummary
          topic={state.topic}
          userMessages={state.userMessages}
          opponentMessages={state.opponentMessages}
          onNewTopic={handleNewTopic}
          onBack={() => {
            setShowSummary(false)
            setState(prev => ({ ...prev, status: 'user_turn' }))
          }}
        />
      </div>
    )
  }

  // 辩论主界面
  return (
    <div className="h-full flex flex-col">
      {/* 顶部栏 */}
      <div className="shrink-0 px-4 py-2 border-b border-line/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="w-4 h-4 text-accent" />
          <div>
            <div className="text-sm font-medium">{state.topic?.title}</div>
            <div className="text-xs text-content-muted">
              第 {state.round} 轮 · 
              <span className={cn(
                'ml-1',
                state.status === 'user_turn' && 'text-emerald-500',
                state.status === 'opponent_turn' && 'text-amber-500',
              )}>
                {state.status === 'user_turn' ? '请发表你的观点' : '对手思考中...'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFinishDebate}
            disabled={state.userMessages.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted hover:bg-surface-subtle border border-line/60 transition-colors disabled:opacity-50"
          >
            真相摘要
          </button>
          <button
            onClick={handleNewTopic}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-muted hover:bg-surface-subtle border border-line/60 transition-colors"
          >
            新辩题
          </button>
        </div>
      </div>

      {/* 模型选择栏（可折叠） */}
      <div className="shrink-0 px-4 py-2 bg-surface-muted/50 border-b border-line/40 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-content-muted">你的模型:</span>
          <ModelSelector
            models={allModels}
            value={userModel}
            onChange={setUserModel}
            compact
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-content-muted">对手模型:</span>
          <ModelSelector
            models={allModels}
            value={opponentModel}
            onChange={setOpponentModel}
            compact
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-content-muted">助手模型:</span>
          <ModelSelector
            models={allModels}
            value={assistantModel}
            onChange={setAssistantModel}
            compact
          />
        </div>
      </div>

      {/* 对手泳道（只读） */}
      <OpponentLane
        messages={state.opponentMessages}
        isLoading={state.status === 'opponent_turn'}
        onFactCheck={(content, id) => handleFactCheck(content, 'opponent', id)}
      />

      {/* 分隔线 */}
      <div className="shrink-0 px-4 py-1 flex items-center gap-2 bg-surface-muted/30">
        <div className="flex-1 h-px bg-line/40" />
        <span className="text-[10px] text-content-muted uppercase tracking-wider">你的发言</span>
        <div className="flex-1 h-px bg-line/40" />
      </div>

      {/* 用户泳道 + 助手面板 */}
      <div className="flex-1 flex min-h-0">
        {/* 用户泳道 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <UserLane
            messages={state.userMessages}
            onSend={handleSendMessage}
            onPolish={handlePolishText}
            onFactCheck={(content, id) => handleFactCheck(content, 'user', id)}
            disabled={state.status !== 'user_turn'}
            isPolishing={false}
          />
        </div>

        {/* 助手面板 */}
        <AssistantPanel
          topic={state.topic?.title}
          userMessage={state.userMessages[state.userMessages.length - 1]?.content}
          opponentMessage={state.opponentMessages[state.opponentMessages.length - 1]?.content}
          onSearch={handleSearchEvidence}
          onAnalyze={handleAssistantAnalysis}
          searching={searchingEvidence}
          analysis={assistantAnalysis}
          evidenceResults={evidenceResults}
        />
      </div>

      {/* 事实核查弹窗 */}
      {factCheckTarget && (
        <FactCheckModal
          content={factCheckTarget.content}
          role={factCheckTarget.role}
          topic={state.topic?.title}
          onClose={() => setFactCheckTarget(null)}
        />
      )}
    </div>
  )
}
