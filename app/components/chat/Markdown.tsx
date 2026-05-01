'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ className, children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children ?? '').replace(/\n$/, '');
  // react-markdown v9+ removed the `inline` prop. Detect block vs inline from the
  // language className OR the presence of newlines in the payload.
  const isBlock = !!match || code.includes('\n');

  if (!isBlock) {
    return (
      <code
        className={className}
        style={{
          padding: '1px 5px',
          borderRadius: 3,
          background: 'var(--studio-elevated)',
          border: '1px solid var(--studio-border)',
          color: 'var(--studio-text)',
          fontSize: '0.88em',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", monospace',
        }}
        {...props}
      >
        {children}
      </code>
    );
  }

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <span
      className="relative group my-3 block rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--studio-border)' }}
    >
      <span
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          background: 'var(--studio-surface)',
          fontSize: 10,
          color: 'var(--studio-text-muted)',
        }}
      >
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {match?.[1] || 'text'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 px-2 py-0.5 rounded"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--studio-text-sec)',
            cursor: 'pointer',
            fontSize: 10,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
      <pre
        style={{
          margin: 0,
          padding: '0.85rem 1rem',
          background: 'var(--studio-bg)',
          color: 'var(--studio-text)',
          fontSize: 11.5,
          lineHeight: 1.55,
          overflowX: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <code>{code}</code>
      </pre>
    </span>
  );
}

function sanitizeForMarkdown(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src.startsWith('```', i)) {
      const end = src.indexOf('```', i + 3);
      if (end === -1) {
        out += src.slice(i);
        break;
      }
      out += src.slice(i, end + 3);
      i = end + 3;
      continue;
    }
    if (src[i] === '`') {
      const nl = src.indexOf('\n', i + 1);
      const close = src.indexOf('`', i + 1);
      if (close !== -1 && (nl === -1 || close < nl)) {
        out += src.slice(i, close + 1);
        i = close + 1;
        continue;
      }
    }
    const ch = src[i];
    if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else out += ch;
    i++;
  }
  return out;
}

export default function Markdown({ content }: { content: string }) {
  const safe = sanitizeForMarkdown(content);
  return (
    <div className="prose prose-sm prose-invert max-w-none leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          code: CodeBlock as unknown as React.ComponentType<CodeBlockProps>,
          // Unwrap <pre> since CodeBlock already provides its own container.
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {safe}
      </ReactMarkdown>
    </div>
  );
}
