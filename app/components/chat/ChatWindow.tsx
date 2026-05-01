'use client';

import { useEffect, useRef } from 'react';
import type { Message as Msg } from '../../lib/chatStore';
import Message from './Message';

interface Props {
  messages: Msg[];
  streaming: boolean;
  onCopy?: (text: string) => void;
  onQuickReply?: (description: string) => void;
}

export default function ChatWindow({ messages, streaming, onQuickReply }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-y-auto"
      style={{ background: 'var(--studio-bg)' }}
    >
      <div
        className="max-w-3xl mx-auto px-2 py-4 space-y-1"
        style={{ background: 'var(--studio-bg)' }}
      >
        {messages.map((m) => (
          <Message
            key={m.id}
            message={m}
            streaming={streaming && m.id === lastId && m.role === 'assistant'}
            onQuickReply={onQuickReply}
          />
        ))}
      </div>
    </div>
  );
}
