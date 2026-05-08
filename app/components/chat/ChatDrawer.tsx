'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StudioContext } from '../../context/StudioContext';
import {
  buildCanvasSummary,
  buildRefsSummary,
  dispatchTool,
  formatToolResultForClaude,
  type CanvasAccess,
} from '../../lib/chatToolBridge';
import type { Chat, ImageAttachment, Message as Msg, ToolUseRecord } from '../../lib/chatStore';
import type { Batch } from '../../hooks/useBatchHistory';
import {
  loadChats,
  newChat,
  saveChats,
  titleFromText,
  uid,
} from '../../lib/chatStore';
import AttachmentBar from './AttachmentBar';
import type { ConvertingFile } from './AttachmentBar';
import ChatWindow from './ChatWindow';
import Composer, { type ComposerHandle } from './Composer';
import ModelPicker, { DEFAULT_MODEL } from './ModelPicker';
import LLMUpstreamPicker, { DEFAULT_UPSTREAM } from './LLMUpstreamPicker';
import type { LLMAdapterId } from '../../lib/llm/types';
import type { BuildRequest } from './DirectorBlockActions';
import { parseDirectorOutput } from '../../lib/directorParser';
import ProviderSelector from '../ProviderSelector';
import type { ProviderType } from '../../lib/providers/types';
import { isImage, isTextLike, readImageBase64, readText } from '../../lib/chatFiles';

interface Props {
  open: boolean;
  onClose: () => void;
  canvasAccess: CanvasAccess;
  activeBatchId: string | null;
  onSwitchBatch: (batchId: string) => void;
  onCreateBatch: (name: string) => Batch;
  initialAutomateMode?: boolean;
}

interface ClientContext {
  canvasSummary?: string;
  refsSummary?: string;
  brandContext?: string;
  workflowMode?: 'isupply' | 'api-direct' | 'ai-studio' | 'generic';
  skipGates?: string[];
  extraInstruction?: string;
  automationEnabled?: boolean;
  provider?: ProviderType;
  shootBrief?: string;
}

interface StreamEvent {
  type: 'text' | 'tool_use' | 'usage' | 'done' | 'error' | 'thinking_start' | 'thinking_status' | 'thinking_end';
  delta?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  message?: string;
  stop_reason?: string;
  input_tokens?: number;
  output_tokens?: number;
  elapsedMs?: number;
  chars?: number;
}

function batchTag(chat: Chat, activeBatchId: string | null): string {
  if (!chat.automateBatchId) return '—';
  if (chat.automateBatchId === activeBatchId) return 'this batch';
  return `Batch ${chat.automateBatchId.slice(0, 6)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ChatDrawer({
  open,
  onClose,
  canvasAccess,
  activeBatchId,
  onSwitchBatch,
  onCreateBatch,
  initialAutomateMode = false,
}: Props) {
  const studio = useContext(StudioContext);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [upstream, setUpstream] = useState<LLMAdapterId>(DEFAULT_UPSTREAM);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [hoverChatId, setHoverChatId] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [dragHover, setDragHover] = useState(false);
  const [convertingFiles, setConvertingFiles] = useState<ConvertingFile[]>([]);
  const dragCounterRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ComposerHandle>(null);

  // Hydrate chats on first open
  useEffect(() => {
    const loaded = loadChats();
    if (loaded.length === 0) {
      const c = newChat({ title: 'New conversation', automateBatchId: activeBatchId ?? undefined });
      setChats([c]);
      setActiveId(c.id);
    } else {
      setChats(loaded);
      setActiveId(loaded[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chats.length > 0) saveChats(chats);
  }, [chats]);

  const active: Chat | null = useMemo(
    () => chats.find((c) => c.id === activeId) ?? null,
    [chats, activeId],
  );

  const lastBlocks = useMemo(() => {
    if (!active) return [];
    const msgs = [...active.messages].reverse();
    const lastAssistant = msgs.find((m) => m.role === 'assistant' && m.content);
    if (!lastAssistant?.content) return [];
    const blocks = parseDirectorOutput(lastAssistant.content);

    // Inject image_reference blocks for any uploaded images in ANY user message
    const allImages: ImageAttachment[] = [];
    for (const msg of active.messages) {
      if (msg.role === 'user' && msg.images) {
        allImages.push(...msg.images);
      }
    }

    console.log('[lastBlocks] Found', allImages.length, 'total images in chat');
    if (allImages.length > 0) {
      for (const img of allImages) {
        console.log('[lastBlocks] Adding image_reference:', img.name);
        blocks.push({
          kind: 'image_reference',
          heading: `Image Reference: ${img.name}`,
          body: `Uploaded ${img.kind} reference`,
          imageData: img.data,
          imageName: img.name,
          imageTags: [img.kind, 'reference'],
        });
      }
    }

    return blocks;
  }, [active]);

  const patchActive = useCallback(
    (fn: (c: Chat) => Chat) => {
      setChats((prev) => prev.map((c) => (c.id === activeId ? fn(c) : c)));
    },
    [activeId],
  );

  const patchMessage = useCallback(
    (messageId: string, fn: (m: Msg) => Msg) => {
      patchActive((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId ? fn(m) : m)),
        updatedAt: Date.now(),
      }));
    },
    [patchActive],
  );

  const buildClientContext = useCallback((): ClientContext => {
    const canvasSummary = buildCanvasSummary(canvasAccess.nodes, canvasAccess.edges);
    const refs = canvasAccess.getUploadedRefs();
    const refsSummary = buildRefsSummary(refs);
    const brandContext = canvasAccess.getBrandContext() ?? undefined;

    // Build shoot brief from all form answer messages in this chat
    const formAnswers = (active?.messages ?? [])
      .filter(m => m.role === 'user' && m.content?.trim().startsWith('Form answers:'))
      .map(m => m.content.trim());
    const shootBrief = formAnswers.length > 0 ? formAnswers.join('\n\n') : undefined;

    const base: ClientContext = {
      workflowMode: 'isupply',
      canvasSummary,
      refsSummary,
      brandContext,
      automationEnabled: false,
      provider: active?.provider ?? 'gemini',
      shootBrief,
    };
    return base;
  }, [canvasAccess, active]);

  const setChatProvider = useCallback(
    (provider: ProviderType) => {
      patchActive((c) => ({ ...c, provider, updatedAt: Date.now() }));
    },
    [patchActive],
  );

  const toApiMessages = useCallback((msgs: Msg[]) => {
    return msgs.map((m) => ({
      role: m.role,
      content: m.content,
      images: m.images,
      toolUses: m.toolUses?.map((t) => ({ id: t.id, name: t.name, input: t.input })),
      toolResults: m.toolResults,
    }));
  }, []);

  const runStreamTurn = useCallback(
    async (
      workingMessages: Msg[],
      assistantMsgId: string,
      signal: AbortSignal,
    ): Promise<{ stopReason: string | null; toolUses: ToolUseRecord[] }> => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          upstream,
          messages: toApiMessages(workingMessages),
          clientContext: buildClientContext(),
        }),
        signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        patchMessage(assistantMsgId, (m) => ({
          ...m,
          content: (m.content ?? '') + `\n\n_Error: ${res.status} ${text.slice(0, 200)}_`,
        }));
        return { stopReason: 'error', toolUses: [] };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let stopReason: string | null = null;
      const collectedToolUses: ToolUseRecord[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: StreamEvent;
          try {
            evt = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (evt.type === 'text' && evt.delta) {
            patchMessage(assistantMsgId, (m) => ({
              ...m,
              content: (m.content ?? '') + evt.delta,
              thinking: undefined, // text streaming → thinking done
            }));
          } else if (evt.type === 'thinking_start') {
            patchMessage(assistantMsgId, (m) => ({
              ...m,
              thinking: { active: true, elapsedMs: 0, chars: 0 },
            }));
          } else if (evt.type === 'thinking_status') {
            patchMessage(assistantMsgId, (m) => ({
              ...m,
              thinking: { active: true, elapsedMs: evt.elapsedMs ?? 0, chars: evt.chars ?? 0 },
            }));
          } else if (evt.type === 'thinking_end') {
            patchMessage(assistantMsgId, (m) => ({
              ...m,
              thinking: { active: false, elapsedMs: evt.elapsedMs ?? 0, chars: evt.chars ?? 0 },
            }));
          } else if (evt.type === 'tool_use' && evt.id && evt.name) {
            const record: ToolUseRecord = {
              id: evt.id,
              name: evt.name,
              input: evt.input ?? {},
              status: 'running',
            };
            collectedToolUses.push(record);
            patchMessage(assistantMsgId, (m) => ({
              ...m,
              toolUses: [...(m.toolUses ?? []), record],
            }));
          } else if (evt.type === 'done' && evt.stop_reason) {
            stopReason = evt.stop_reason;
          } else if (evt.type === 'error') {
            patchMessage(assistantMsgId, (m) => ({
              ...m,
              content: (m.content ?? '') + `\n\n_Error: ${evt.message ?? 'unknown'}_`,
            }));
            stopReason = 'error';
          }
        }
      }

      return { stopReason, toolUses: collectedToolUses };
    },
    [model, buildClientContext, patchMessage, toApiMessages],
  );

  const executeToolUses = useCallback(
    async (assistantMsgId: string, toolUses: ToolUseRecord[]) => {
      const results: Array<{ tool_use_id: string; content: string; is_error?: boolean }> = [];
      for (const t of toolUses) {
        try {
          const r = await dispatchTool(t.name, t.input, canvasAccess, studio, active?.provider);
          const record: ToolUseRecord = {
            id: t.id,
            name: t.name,
            input: t.input,
            status: r.success ? 'success' : 'error',
            result: r.success ? r : undefined,
            errorMsg: r.success ? undefined : r.error,
          };
          patchMessage(assistantMsgId, (m) => ({
            ...m,
            toolUses: (m.toolUses ?? []).map((x) => (x.id === t.id ? record : x)),
          }));
          results.push({
            tool_use_id: t.id,
            content: formatToolResultForClaude(r),
            is_error: !r.success,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          patchMessage(assistantMsgId, (m) => ({
            ...m,
            toolUses: (m.toolUses ?? []).map((x) =>
              x.id === t.id ? { ...x, status: 'error', errorMsg: msg } : x,
            ),
          }));
          results.push({ tool_use_id: t.id, content: msg, is_error: true });
        }
      }
      return results;
    },
    [canvasAccess, patchMessage, studio, active],
  );

  const handleSubmit = useCallback(
    async (text?: string) => {
      if (streaming) return;
      if (!active) return;
      const raw = (text ?? composerRef.current?.getValue() ?? '').trim();
      if (!raw && pendingImages.length === 0) return;

      const userMsg: Msg = {
        id: uid(),
        role: 'user',
        content: raw,
        createdAt: Date.now(),
        images: pendingImages.length > 0 ? pendingImages : undefined,
      };
      const assistantMsg: Msg = {
        id: uid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };

      const baseMessages = [...active.messages, userMsg];

      // Snapshot of images that need saving — done AFTER the analysis turn completes
      // so the asset is registered alongside Claude's interpretation. Skip any image
      // that already has a `url` (came from Library — already in assets.json).
      const userMsgId = userMsg.id;
      const imagesToSave = pendingImages.filter(img =>
        !img.url && img.data && (img.kind === 'product' || img.kind === 'style' || img.kind === 'model' || img.kind === 'file'),
      );

      patchActive((c) => ({
        ...c,
        title: c.messages.length === 0 ? titleFromText(raw || 'New chat') : c.title,
        messages: [...c.messages, userMsg, assistantMsg],
        updatedAt: Date.now(),
      }));
      composerRef.current?.clear();
      setPendingImages([]);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        let working = baseMessages;
        const assistantId = assistantMsg.id;
        for (let turn = 0; turn < 8; turn += 1) {
          const { stopReason, toolUses } = await runStreamTurn(
            working,
            assistantId,
            ctrl.signal,
          );
          if (stopReason !== 'tool_use') break;
          if (toolUses.length === 0) break;

          const results = await executeToolUses(assistantId, toolUses);

          working = [
            ...working,
            {
              id: assistantId,
              role: 'assistant',
              content: '',
              createdAt: Date.now(),
              toolUses,
            },
            {
              id: uid(),
              role: 'user',
              content: '',
              createdAt: Date.now(),
              toolResults: results,
            },
          ];
        }

        // Auto-save to library AFTER analysis completes. Fire-and-forget; on success,
        // attach saved URL back onto the user message so future turns reference it
        // instead of re-uploading base64.
        if (imagesToSave.length > 0) {
          imagesToSave.forEach(img => {
            const tags = [img.kind, 'reference', 'chat-upload'];
            dispatchTool('save_reference_asset', {
              imageData: img.data,
              name: img.name,
              tags,
            }, canvasAccess, studio)
              .then(result => {
                if (result.success && result.data) {
                  const savedUrl = (result.data as { url?: string }).url ?? '';
                  patchMessage(userMsgId, m => ({
                    ...m,
                    images: m.images?.map(i =>
                      i.id === img.id ? { ...i, url: savedUrl } : i
                    ),
                  }));
                }
              })
              .catch(() => {/* non-critical */});
          });
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          patchMessage(assistantMsg.id, (m) => ({
            ...m,
            content: (m.content ?? '') + '\n\n_Stopped._',
          }));
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          patchMessage(assistantMsg.id, (m) => ({
            ...m,
            content: (m.content ?? '') + `\n\n_Error: ${msg}_`,
          }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [active, pendingImages, streaming, patchActive, patchMessage, runStreamTurn, executeToolUses, canvasAccess, studio],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleNewChat = useCallback(() => {
    setShowBatchModal(true);
  }, []);

  const handleBatchChoice = useCallback((createNewBatch: boolean) => {
    setShowBatchModal(false);
    let batchId: string | undefined;
    if (createNewBatch) {
      const batch = onCreateBatch(`Chat Batch ${Date.now()}`);
      batchId = batch.id;
    } else {
      batchId = activeBatchId ?? undefined;
    }
    const c = newChat({
      title: 'New conversation',
      automateBatchId: batchId,
    });
    setChats((prev) => [c, ...prev]);
    setActiveId(c.id);
  }, [activeBatchId, onCreateBatch]);

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      setActiveId(chat.id);
      if (chat.automateBatchId && chat.automateBatchId !== activeBatchId) {
        onSwitchBatch(chat.automateBatchId);
      }
    },
    [activeBatchId, onSwitchBatch],
  );

  const handleDeleteChat = useCallback(
    (id: string) => {
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (activeId === id) {
          setActiveId(next[0]?.id ?? null);
        }
        if (next.length === 0) {
          const fresh = newChat({
            title: 'New conversation',
            automateBatchId: activeBatchId ?? undefined,
          });
          setActiveId(fresh.id);
          return [fresh];
        }
        return next;
      });
    },
    [activeId, activeBatchId],
  );

  const handleRename = useCallback(
    (id: string, title: string) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, title: title.trim() || c.title, updatedAt: Date.now() } : c,
        ),
      );
      setRenamingId(null);
    },
    [],
  );

  const handleQuickReply = useCallback(
    (description: string) => {
      if (streaming) return;
      void handleSubmit(description);
    },
    [handleSubmit, streaming],
  );

  const handleCreateNode = useCallback(
    async (req: BuildRequest): Promise<string | null> => {
      try {
        let toolName: string;
        let input: Record<string, unknown>;

        // Merge API config into settings if present (provider-aware)
        const provider = active?.provider ?? 'gemini';
        const settings = req.apiConfig ? (
          provider === 'openai' ? {
            provider: 'openai',
            model: req.apiConfig.model,
            quality: req.apiConfig.quality,
            size: req.apiConfig.size,
            output_format: req.apiConfig.output_format,
            background: req.apiConfig.background,
          } : {
            provider: 'gemini',
            model: req.apiConfig.model,
            temperature: req.apiConfig.temperature,
            topP: req.apiConfig.topP,
            topK: req.apiConfig.topK,
            seed: req.apiConfig.seed,
          }
        ) : {};

        switch (req.kind) {
          case 'model':
            toolName = 'create_model_node';
            input = {
              description: req.body,
              ...settings,
            };
            break;
          case 'setting':
            toolName = 'create_setting_node';
            input = {
              description: req.body,
              ...settings,
            };
            break;
          case 'prompt':
            toolName = 'create_prompt_node';
            input = {
              masterPrompt: req.body,
              ...settings,
            };
            break;
          case 'carousel':
            toolName = 'create_carousel_node';
            input = {
              slides: (req.slides ?? []).map((p) => ({ prompt: p, plateFlag: 'PRIMARY' as const })),
              ...settings,
            };
            break;
          case 'image_reference':
            // First save to assets, then create upload node
            console.log('[handleCreateNode] image_reference:', {
              hasImageData: !!req.imageData,
              imageName: req.imageName,
              imageTags: req.imageTags,
            });

            if (!req.imageData || !req.imageName) {
              console.error('[handleCreateNode] Missing imageData or imageName in request');
              return null;
            }

            const saveResult = await dispatchTool('save_reference_asset', {
              imageData: req.imageData,
              name: req.imageName,
              tags: req.imageTags ?? [],
            }, canvasAccess, studio);

            if (!saveResult.success) {
              console.error('[handleCreateNode] save_reference_asset failed:', saveResult.error);
              return null;
            }

            // Now create upload node with the saved asset
            const assetData = saveResult.data as { assetId: string; url: string };
            toolName = 'create_upload_node';
            input = {
              name: req.imageName,
              url: assetData.url,
              tags: req.imageTags ?? [],
            };
            break;
          default:
            return null;
        }
        const result = await dispatchTool(toolName, input, canvasAccess, studio, active?.provider);
        if (result.success && 'nodeId' in result && typeof result.nodeId === 'string') {
          return result.nodeId;
        }
        return null;
      } catch (e) {
        console.error('[handleCreateNode]', e);
        return null;
      }
    },
    [canvasAccess, studio, active],
  );

  // Sort chats by updatedAt desc
  const orderedChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  );

  // Memoize message window so it doesn't re-render on input keystrokes
  const messageWindow = useMemo(
    () => (
      <ChatWindow
        messages={active?.messages ?? []}
        streaming={streaming}
        onQuickReply={handleQuickReply}
      />
    ),
    [active?.messages, streaming, handleQuickReply],
  );

  // Memoize sidebar chat list so it doesn't re-render on input keystrokes
  const sidebarChatList = useMemo(
    () =>
      orderedChats.map((c) => {
        const isActive = c.id === activeId;
        const isHover = hoverChatId === c.id;
        const tag = batchTag(c, activeBatchId);
        const tagColor =
          c.automateBatchId === activeBatchId && c.automateBatchId
            ? 'var(--studio-accent)'
            : 'var(--studio-text-muted)';
        return (
          <div
            key={c.id}
            onMouseEnter={() => setHoverChatId(c.id)}
            onMouseLeave={() => setHoverChatId((id) => (id === c.id ? null : id))}
            onClick={() => handleSelectChat(c)}
            style={{
              position: 'relative',
              padding: '7px 8px',
              borderRadius: 7,
              marginBottom: 4,
              cursor: 'pointer',
              background: isActive ? 'var(--studio-elevated)' : 'transparent',
              border: `1px solid ${
                isActive
                  ? 'color-mix(in srgb, var(--studio-accent) 45%, transparent)'
                  : 'transparent'
              }`,
              transition: 'background 0.12s, border-color 0.12s',
            }}
          >
            {renamingId === c.id ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => handleRename(c.id, renameVal)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(c.id, renameVal);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  background: 'var(--studio-bg)',
                  border: '1px solid var(--studio-accent)',
                  borderRadius: 4,
                  padding: '3px 6px',
                  color: 'var(--studio-text)',
                  fontSize: 11,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <>
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(c.id);
                    setRenameVal(c.title);
                  }}
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive
                      ? 'var(--studio-text)'
                      : 'var(--studio-text-sec)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingRight: isHover ? 16 : 0,
                  }}
                >
                  {c.title || 'Untitled'}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    marginTop: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--studio-text-muted)',
                    }}
                  >
                    {formatTime(c.updatedAt)}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: 20,
                      background: 'var(--studio-bg)',
                      border: '1px solid var(--studio-border)',
                      color: tagColor,
                      maxWidth: 88,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tag}
                  </span>
                </div>
                {isHover && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChat(c.id);
                    }}
                    title="Delete chat"
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 4,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--studio-text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </>
            )}
          </div>
        );
      }),
    [orderedChats, activeId, hoverChatId, activeBatchId, renamingId, renameVal, handleSelectChat, handleRename],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed right-0 top-0 z-50 flex h-full w-full flex-col sm:w-[640px]"
            style={{
              background: 'var(--studio-bg)',
              color: 'var(--studio-text)',
              borderLeft: '1px solid var(--studio-border)',
              boxShadow: '-20px 0 40px rgba(0,0,0,0.6)',
            }}
          >
            {/* Collapse tab on left edge */}
            <button
              type="button"
              onClick={onClose}
              title="Collapse panel"
              style={{
                position: 'absolute',
                left: -28,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 28,
                height: 56,
                borderRadius: '8px 0 0 8px',
                border: '1px solid var(--studio-border)',
                borderRight: 'none',
                background: 'var(--studio-surface)',
                color: 'var(--studio-text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
              }}
              aria-label="Collapse chat panel"
            >
              ›
            </button>
            {/* ── Header ── */}
            <header
              className="flex items-center justify-between"
              style={{
                padding: '10px 14px',
                background: 'var(--studio-surface)',
                borderBottom: '1px solid var(--studio-border)',
                flexShrink: 0,
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ fontSize: 18 }}>🍌</span>
                <div className="min-w-0">
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--studio-text)',
                      lineHeight: 1.2,
                    }}
                  >
                    Nano Banana Director
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--studio-text-muted)',
                      letterSpacing: '0.04em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 260,
                    }}
                  >
                    {active?.title ?? 'New conversation'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <ModelPicker value={model} onChange={setModel} />
                <LLMUpstreamPicker value={upstream} onChange={setUpstream} disabled={streaming} />
                <div style={{ minWidth: 160 }}>
                  <ProviderSelector
                    value={active?.provider ?? 'gemini'}
                    onChange={setChatProvider}
                    showLabel={false}
                    disabled={streaming}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleNewChat}
                  title="New chat"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    border: '1px solid var(--studio-border)',
                    background: 'var(--studio-elevated)',
                    color: 'var(--studio-text-sec)',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close chat"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    border: '1px solid var(--studio-border)',
                    background: 'var(--studio-elevated)',
                    color: 'var(--studio-text-sec)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </header>

            {/* ── Body row ── */}
            <div className="flex flex-1 overflow-hidden">
              {/* Messages + composer column */}
              <div
                className="flex flex-col flex-1 min-w-0 overflow-hidden relative"
                style={{ background: 'var(--studio-bg)' }}
                onDragEnter={(e) => {
                  if (!e.dataTransfer?.types?.includes('Files')) return;
                  e.preventDefault();
                  dragCounterRef.current += 1;
                  setDragHover(true);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer?.types?.includes('Files')) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDragLeave={(e) => {
                  if (!e.dataTransfer?.types?.includes('Files')) return;
                  dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
                  if (dragCounterRef.current === 0) setDragHover(false);
                }}
                onDrop={async (e) => {
                  if (!e.dataTransfer?.files?.length) return;
                  e.preventDefault();
                  dragCounterRef.current = 0;
                  setDragHover(false);
                  const files = Array.from(e.dataTransfer.files);
                  for (const f of files) {
                    if (isImage(f)) {
                      if (f.size > 15 * 1024 * 1024) { alert(`Skipped ${f.name}: > 15 MB`); continue; }
                      const cid = uid();
                      setConvertingFiles((prev) => [...prev, { id: cid, name: f.name, kind: 'style' }]);
                      try {
                        const { data, mime } = await readImageBase64(f);
                        setPendingImages((prev) => [...prev, { id: uid(), kind: 'style', name: f.name.replace(/\.(heic|heif)$/i, '.png'), mime, data, size: f.size }]);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        alert(`Failed to load ${f.name}: ${msg}`);
                      } finally {
                        setConvertingFiles((prev) => prev.filter((c) => c.id !== cid));
                      }
                    } else if (isTextLike(f)) {
                      if (f.size > 5 * 1024 * 1024) { alert(`Skipped ${f.name}: > 5 MB`); continue; }
                      const content = await readText(f);
                      patchActive((c) => ({ ...c, brandDna: { name: f.name, content, size: f.size }, updatedAt: Date.now() }));
                    } else {
                      if (f.size > 15 * 1024 * 1024) { alert(`Skipped ${f.name}: > 15 MB`); continue; }
                      const cid = uid();
                      setConvertingFiles((prev) => [...prev, { id: cid, name: f.name, kind: 'file' }]);
                      try {
                        const { data, mime } = await readImageBase64(f);
                        setPendingImages((prev) => [...prev, { id: uid(), kind: 'file', name: f.name, mime: mime || 'application/octet-stream', data, size: f.size }]);
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        alert(`Failed to load ${f.name}: ${msg}`);
                      } finally {
                        setConvertingFiles((prev) => prev.filter((c) => c.id !== cid));
                      }
                    }
                  }
                }}
              >
                {dragHover && (
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
                    style={{
                      background: 'color-mix(in srgb, var(--studio-accent) 12%, transparent)',
                      border: '2px dashed var(--studio-accent)',
                      borderRadius: 8,
                      backdropFilter: 'blur(2px)',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--studio-elevated)',
                        border: '1px solid var(--studio-accent)',
                        borderRadius: 12,
                        padding: '14px 22px',
                        color: 'var(--studio-accent)',
                        fontSize: 13,
                        fontWeight: 600,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                      }}
                    >
                      Drop images, files, or brand DNA to attach
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {messageWindow}
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--studio-border)',
                    background: 'var(--studio-surface)',
                    paddingTop: 6,
                    flexShrink: 0,
                  }}
                >
                  <AttachmentBar
                    brandDna={active?.brandDna ?? null}
                    pendingImages={pendingImages}
                    convertingFiles={convertingFiles}
                    onSetBrandDna={(b) =>
                      patchActive((c) => ({
                        ...c,
                        brandDna: b ?? undefined,
                        updatedAt: Date.now(),
                      }))
                    }
                    onAddImage={(img) => setPendingImages((prev) => [...prev, img])}
                    onRemoveImage={(id) =>
                      setPendingImages((prev) => prev.filter((i) => i.id !== id))
                    }
                    onAddConverting={(f) => setConvertingFiles((prev) => [...prev, f])}
                    onRemoveConverting={(id) => setConvertingFiles((prev) => prev.filter((c) => c.id !== id))}
                    buildBlocks={lastBlocks}
                    onBuildNode={handleCreateNode}
                    buildDisabled={streaming}
                  />
                  <div style={{ padding: '0 12px 12px' }}>
                    <Composer
                      ref={composerRef}
                      onSubmit={() => handleSubmit()}
                      onStop={handleStop}
                      streaming={streaming}
                      canStop={streaming}
                      hasAttachments={pendingImages.length > 0}
                    />
                  </div>
                </div>
              </div>

              {/* Sidebar — history on the right */}
              <aside
                className="flex flex-col"
                style={{
                  width: 200,
                  flexShrink: 0,
                  background: 'var(--studio-surface)',
                  borderLeft: '1px solid var(--studio-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '10px 10px 8px',
                    borderBottom: '1px solid var(--studio-border)',
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleNewChat}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: '1px solid color-mix(in srgb, var(--studio-accent) 35%, transparent)',
                      background: 'color-mix(in srgb, var(--studio-accent) 15%, transparent)',
                      color: 'var(--studio-accent)',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} /> New Chat
                  </button>
                </div>

                <div
                  className="flex-1"
                  style={{
                    overflowY: 'auto',
                    padding: '8px 8px 12px',
                  }}
                >
                  {sidebarChatList}
                </div>
              </aside>
            </div>

            {/* Batch choice modal */}
            {showBatchModal && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 100,
                }}
                onClick={() => setShowBatchModal(false)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'var(--studio-elevated)',
                    border: '1px solid var(--studio-border)',
                    borderRadius: 12,
                    padding: 20,
                    width: 340,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--studio-text)' }}>
                    Create a new batch canvas?
                  </h3>
                  <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--studio-text-sec)', lineHeight: 1.5 }}>
                    New batch = Fresh canvas<br />
                    Same batch = Current canvas
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleBatchChoice(false)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 7,
                        border: '1px solid var(--studio-border)',
                        background: 'var(--studio-surface)',
                        color: 'var(--studio-text-sec)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Same Batch
                    </button>
                    <button
                      onClick={() => handleBatchChoice(true)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 7,
                        border: 'none',
                        background: 'linear-gradient(135deg, #7C3AED, #0D9488)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      New Batch
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
