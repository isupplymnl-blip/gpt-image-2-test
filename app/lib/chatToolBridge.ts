import type { StudioContextType } from '../context/StudioContext';
import type { ToolResult } from './chatTools';
import { uid } from './chatStore';

export interface UploadedRef {
  id: string;
  name: string;
  tags: string[];
  url: string;
  mime?: string;
}

export interface CanvasAccess {
  nodes: unknown[];
  edges: unknown[];
  addNode: (type: string, data: Record<string, unknown>, position?: { x: number; y: number }) => string;
  addEdge: (sourceId: string, targetId: string) => void;
  triggerGenerate: (nodeId: string) => Promise<void>;
  getUploadedRefs: () => UploadedRef[];
  getBrandContext: () => string | null;
  runTool?: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
  getRecentlyGeneratedImages?: () => string[];
}

interface NodeLike {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

interface EdgeLike {
  id: string;
  source: string;
  target: string;
}

function asNode(n: unknown): NodeLike {
  return n as NodeLike;
}

function strInput(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function normalizePrompt(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/  +/g, ' ')
    .trim();
}

function numInput(v: unknown, fallback: number | undefined): number | undefined {
  return typeof v === 'number' ? v : fallback;
}

function numInputRequired(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

function arrInput<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function buildNodeSettings(input: Record<string, unknown>, provider?: string, defaultTemp = 0.9): Record<string, unknown> {
  if (provider === 'openai') {
    return {
      provider: 'openai',
      model: strInput(input.model, 'gpt-image-2') || 'gpt-image-2',
      quality: strInput(input.quality, 'medium') || 'medium',
      size: strInput(input.size, '1024x1024') || '1024x1024',
      output_format: strInput(input.output_format, 'png') || 'png',
      background: strInput(input.background, 'auto') || 'auto',
      moderation: 'auto',
    };
  }
  return {
    provider: 'gemini',
    temperature: numInputRequired(input.temperature, defaultTemp),
    topP: numInputRequired(input.topP, 0.95),
    topK: numInputRequired(input.topK, 40),
    seed: numInput(input.seed, undefined),
    model: strInput(input.model, '') || undefined,
  };
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  canvas: CanvasAccess,
  studio: StudioContextType,
  provider?: string,
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'list_canvas': {
        const data = canvas.nodes.map((raw) => {
          const n = asNode(raw);
          return {
            id: n.id,
            type: n.type,
            dataSummary: JSON.stringify(n.data ?? {}).slice(0, 200),
          };
        });
        return { success: true, data };
      }

      case 'list_uploaded_refs': {
        const data = canvas.getUploadedRefs();
        return { success: true, data };
      }

      case 'read_brand_context': {
        const text = canvas.getBrandContext();
        return { success: true, data: text };
      }

      case 'create_model_node': {
        const nodeId = canvas.addNode('modelCreationNode', {
          description: strInput(input.description),
          settings: buildNodeSettings(input, provider, 0.9),
        });
        return { success: true, nodeId };
      }

      case 'create_setting_node': {
        const nodeId = canvas.addNode('settingNode', {
          description: strInput(input.description),
          settings: {
            ...buildNodeSettings(input, provider, 0.6),
            compositeMode: (input.compositeMode as 'single' | 'multi-angle' | undefined) ?? 'single',
            compositeAngles: arrInput<string>(input.compositeAngles),
          },
        });
        return { success: true, nodeId };
      }

      case 'create_prompt_node': {
        const nodeId = canvas.addNode('promptNode', {
          prompt: normalizePrompt(strInput(input.masterPrompt) || strInput(input.prompt)),
          settings: buildNodeSettings(input, provider, 0.9),
        });
        const connectFrom = arrInput<string>(input.connectFrom);
        for (const fromId of connectFrom) canvas.addEdge(fromId, nodeId);
        const autoTypes = new Set(['modelCreationNode', 'settingNode', 'uploadNode']);
        for (const n of canvas.nodes as Array<{ id: string; type?: string }>) {
          if (autoTypes.has(n.type ?? '') && !connectFrom.includes(n.id)) {
            canvas.addEdge(n.id, nodeId);
          }
        }
        const outputId = canvas.addNode('outputNode', { label: 'Output' });
        canvas.addEdge(nodeId, outputId);
        return { success: true, nodeId };
      }

      case 'create_carousel_node': {
        const slidesIn = arrInput<Record<string, unknown>>(input.slides);
        const slides = slidesIn.map((s) => {
          const outputId = canvas.addNode('outputNode', { label: 'Output' });
          return {
            id: uid(),
            prompt: normalizePrompt(strInput(s.prompt)),
            plateFlag: strInput(s.plateFlag, 'PRIMARY') as 'PRIMARY' | 'OVERRIDE' | 'NEW',
            outputNodeId: outputId,
          };
        });
        const nodeId = canvas.addNode('carouselNode', {
          slides,
          settings: buildNodeSettings(input, provider, 0.9),
        });
        for (const slide of slides) canvas.addEdge(nodeId, slide.outputNodeId);
        const connectFrom2 = arrInput<string>(input.connectFrom);
        for (const fromId of connectFrom2) canvas.addEdge(fromId, nodeId);
        const autoTypesC = new Set(['modelCreationNode', 'settingNode', 'uploadNode']);
        for (const n of canvas.nodes as Array<{ id: string; type?: string }>) {
          if (autoTypesC.has(n.type ?? '') && !connectFrom2.includes(n.id)) {
            canvas.addEdge(n.id, nodeId);
          }
        }
        return { success: true, nodeId };
      }

      case 'connect_nodes': {
        const sourceId = strInput(input.sourceId);
        const targetId = strInput(input.targetId);
        if (!sourceId || !targetId) {
          return { success: false, error: 'connect_nodes requires sourceId and targetId' };
        }
        canvas.addEdge(sourceId, targetId);
        return { success: true };
      }

      case 'generate_node': {
        const nodeId = strInput(input.nodeId);
        if (!nodeId) return { success: false, error: 'generate_node requires nodeId' };
        await canvas.triggerGenerate(nodeId);
        // Keep studio available for potential future direct dispatch paths.
        void studio;
        return { success: true, nodeId };
      }

      case 'save_reference_asset': {
        const imageData = strInput(input.imageData);
        const imageUrl = strInput(input.imageUrl);
        const name = strInput(input.name);
        const tags = arrInput<string>(input.tags);

        if ((!imageData && !imageUrl) || !name) {
          return { success: false, error: 'save_reference_asset requires (imageData or imageUrl) and name' };
        }

        try {
          const response = await fetch('/api/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData: imageData || undefined, imageUrl: imageUrl || undefined, name, tags }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: `Failed to save asset: ${errorText}` };
          }

          const result = await response.json();
          return {
            success: true,
            data: {
              assetId: result.assetId,
              url: result.url,
              message: result.message || 'Asset saved successfully',
            },
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { success: false, error: `Failed to save asset: ${msg}` };
        }
      }

      case 'create_upload_node': {
        const name = strInput(input.name);
        const url = strInput(input.url);
        const tags = arrInput<string>(input.tags);

        if (!name || !url) {
          return { success: false, error: 'create_upload_node requires name and url' };
        }

        const nodeId = canvas.addNode('uploadNode', {
          name,
          url,
          tags,
          savedImage: { id: url, name, url, tags },
        });

        return { success: true, nodeId };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

export function formatToolResultForClaude(result: ToolResult): string {
  if (!result.success) {
    return `ERROR: ${result.error ?? 'unknown error'}`;
  }
  const payload: Record<string, unknown> = { success: true };
  if (result.nodeId !== undefined) payload.nodeId = result.nodeId;
  if (result.data !== undefined) payload.data = result.data;
  try {
    return JSON.stringify(payload);
  } catch {
    return `{"success":true,"nodeId":${JSON.stringify(result.nodeId ?? null)}}`;
  }
}

const MAX_CANVAS_SUMMARY = 2000;

export function buildCanvasSummary(nodes: unknown[], edges: unknown[]): string {
  const nodeList = nodes as NodeLike[];
  const edgeList = edges as EdgeLike[];
  if (nodeList.length === 0) return 'Canvas is empty.';

  const incomingByNode: Record<string, string[]> = {};
  for (const e of edgeList) {
    if (!e || typeof e.target !== 'string' || typeof e.source !== 'string') continue;
    if (!incomingByNode[e.target]) incomingByNode[e.target] = [];
    incomingByNode[e.target].push(e.source);
  }

  const lines: string[] = [];
  for (const n of nodeList) {
    const type = n.type ?? 'unknown';
    const data = n.data ?? {};
    let preview = '';
    const candidate = (data as Record<string, unknown>).prompt
      ?? (data as Record<string, unknown>).description
      ?? (data as Record<string, unknown>).name;
    if (typeof candidate === 'string') {
      preview = candidate;
    } else {
      preview = JSON.stringify(data);
    }
    if (preview.length > 100) preview = preview.slice(0, 100) + '…';
    const incoming = incomingByNode[n.id];
    const fromPart = incoming && incoming.length > 0 ? ` ← from ${incoming.join(', ')}` : '';
    lines.push(`Node ${n.id} (${type}): ${preview}${fromPart}`);

    const joined = lines.join('\n');
    if (joined.length > MAX_CANVAS_SUMMARY) {
      return joined.slice(0, MAX_CANVAS_SUMMARY - 3) + '…';
    }
  }
  return lines.join('\n');
}

export function buildRefsSummary(refs: UploadedRef[]): string {
  if (refs.length === 0) return 'No uploaded references.';
  const lines = refs.map((r) => {
    const tags = r.tags && r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : '';
    const mime = r.mime ? ` (${r.mime})` : '';
    return `${r.id}: ${r.name}${tags}${mime}`;
  });
  return lines.join('\n');
}
