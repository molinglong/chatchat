'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { CodeBlock } from './CodeBlock'
import { cn } from '@/lib/utils'

const MermaidBlock = dynamic(() => import('./MermaidBlock').then(m => m.MermaidBlock), { ssr: false })
const ChartBlock = dynamic(() => import('./ChartBlock').then(m => m.ChartBlock), { ssr: false })
import type { Components } from 'react-markdown'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const codeString = String(children).replace(/\n$/, '')

    // Block code (has language class or is multi-line)
    const isBlock = match || codeString.includes('\n')

    if (isBlock) {
      const lang = match?.[1]?.toLowerCase() || ''

      // Route mermaid code blocks to MermaidBlock
      if (lang === 'mermaid') {
        return <MermaidBlock code={codeString} />
      }

      // Route chart code blocks to ChartBlock
      if (lang === 'chart') {
        return <ChartBlock code={codeString} />
      }

      // Route preview code blocks to inline HTML preview
      if (lang === 'preview' || lang === 'html-preview') {
        return (
          <div dangerouslySetInnerHTML={{ __html: codeString }} className="my-3 rounded-lg border border-line overflow-hidden" />
        )
      }

      // Regular code block
      return (
        <CodeBlock
          language={match?.[1]}
          code={codeString}
        />
      )
    }

    // Inline code
    return (
      <code
        className={cn(
          'px-1.5 py-0.5 rounded text-sm font-mono',
          'bg-surface-muted text-content-secondary',
          className
        )}
        {...props}
      >
        {children}
      </code>
    )
  },
  pre({ children }) {
    return <>{children}</>
  },
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-content-primary underline underline-offset-2 hover:text-content-secondary break-all"
        {...props}
      >
        {children}
      </a>
    )
  },
  img({ src, alt, ...props }) {
    return (
      <img
        src={src}
        alt={alt || "图片"}
        loading="lazy"
        title="点击查看原图"
        className="max-w-full h-auto max-h-[420px] rounded-lg border border-line bg-surface-muted my-3 cursor-zoom-in shadow-sm"
        onClick={() => {
          if (src) window.open(src, "_blank", "noopener")
        }}
        onError={(e) => {
          e.currentTarget.style.display = "none"
        }}
        {...props}
      />
    )
  },
  table({ children, ...props }) {
    return (
      <div className="overflow-x-auto my-3">
        <table
          className="min-w-full divide-y divide-line border border-line rounded"
          {...props}
        >
          {children}
        </table>
      </div>
    )
  },
  th({ children, ...props }) {
    return (
      <th
        className="px-3 py-2 bg-surface-muted text-left text-sm font-semibold text-content-primary"
        {...props}
      >
        {children}
      </th>
    )
  },
  td({ children, ...props }) {
    return (
      <td
        className="px-3 py-2 text-sm text-content-secondary border-t border-line"
        {...props}
      >
        {children}
      </td>
    )
  },
  ul({ children, ...props }) {
    return (
      <ul className="list-disc list-inside my-2 space-y-1" {...props}>
        {children}
      </ul>
    )
  },
  ol({ children, ...props }) {
    return (
      <ol className="list-decimal list-inside my-2 space-y-1" {...props}>
        {children}
      </ol>
    )
  },
  p({ children, ...props }) {
    return (
      <p className="my-2 leading-relaxed break-words" {...props}>
        {children}
      </p>
    )
  },
  h1({ children, ...props }) {
    return <h1 className="text-xl font-bold my-3" {...props}>{children}</h1>
  },
  h2({ children, ...props }) {
    return <h2 className="text-lg font-bold my-3" {...props}>{children}</h2>
  },
  h3({ children, ...props }) {
    return <h3 className="text-base font-bold my-2" {...props}>{children}</h3>
  },
  blockquote({ children, ...props }) {
    return (
      <blockquote
        className="border-l-4 border-line-strong pl-4 pr-3 py-2 my-3 text-content-secondary bg-surface-muted"
        {...props}
      >
        {children}
      </blockquote>
    )
  },
  hr(props) {
    return <hr className="my-4 border-line" {...props} />
  },
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  // Note: PreviewBlock handles its own preview logic
  return (
    <div className={cn('prose-sm max-w-none break-words overflow-hidden text-content-primary', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})