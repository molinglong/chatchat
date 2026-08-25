function SkeletonMessage({ isUser, width }: { isUser: boolean; width: string }) {
  return (
    <div className={`flex gap-2.5 py-2 px-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent animate-pulse mt-0.5" />}
      <div className={`min-w-0 ${isUser ? 'max-w-[80%]' : 'flex-1 max-w-full'}`}>
        <div
          className={`animate-pulse ${
            isUser
              ? 'bg-accent rounded-lg rounded-br-sm'
              : 'bg-surface-muted rounded-lg'
          }`}
          style={{ width, height: isUser ? '36px' : '64px' }}
        />
      </div>
    </div>
  )
}

export default function ConversationLoading() {
  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Messages skeleton - varied widths to look natural */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-2xl mx-auto">
          <SkeletonMessage isUser={false} width="80%" />
          <SkeletonMessage isUser={true} width="45%" />
          <SkeletonMessage isUser={false} width="70%" />
          <SkeletonMessage isUser={true} width="55%" />
          <SkeletonMessage isUser={false} width="65%" />
        </div>
      </div>

      {/* Input skeleton */}
      <div className="px-3 pb-2 pt-1">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-line bg-surface-muted animate-pulse">
            <div className="px-4 pt-3">
              <div className="h-4 w-32 rounded bg-surface-subtle" />
            </div>
            <div className="flex justify-between items-center px-3 pb-2 pt-1.5">
              <div className="w-5 h-5 rounded bg-surface-subtle" />
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-20 rounded-full bg-surface-subtle" />
                <div className="w-8 h-8 rounded-full bg-surface-subtle" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
