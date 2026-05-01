'use client';

import { useCallback, useMemo } from 'react';
import type { StudioContextType, NodeSettings, CarouselSlide } from '../context/StudioContext';
import type { CanvasAccess, UploadedRef } from '../lib/chatToolBridge';
import { dispatchTool } from '../lib/chatToolBridge';

interface NodeLike {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

interface EdgeLike {
  id: string;
  source: string;
  target: string;
}

const BRAND_CONTEXT_KEY = 'nbs-brand-context';

function randSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function useCanvasAccess(params: {
  nodes: unknown[];
  edges: unknown[];
  setNodes: (updater: (prev: unknown[]) => unknown[]) => void;
  setEdges: (updater: (prev: unknown[]) => unknown[]) => void;
  studio: StudioContextType;
}): CanvasAccess {
  const { nodes, edges, setNodes, setEdges, studio } = params;

  const addNode = useCallback(
    (type: string, data: Record<string, unknown>, position?: { x: number; y: number }): string => {
      const id = `${type}-${Date.now()}-${randSuffix()}`;
      setNodes((prev) => {
        const pos = position ?? {
          x: (prev.length % 5) * 400 + 100,
          y: Math.floor(prev.length / 5) * 300 + 100,
        };
        const node: NodeLike = { id, type, data, position: pos };
        return [...prev, node];
      });
      return id;
    },
    [setNodes],
  );

  const addEdge = useCallback(
    (sourceId: string, targetId: string): void => {
      setEdges((prev) => {
        const edge: EdgeLike = {
          id: `e-${sourceId}-${targetId}-${randSuffix()}`,
          source: sourceId,
          target: targetId,
        };
        return [...prev, edge];
      });
    },
    [setEdges],
  );

  const triggerGenerate = useCallback(
    async (nodeId: string): Promise<void> => {
      const nodeList = nodes as NodeLike[];
      const node = nodeList.find((n) => n.id === nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      const data = (node.data ?? {}) as Record<string, unknown>;
      const settings = (data.settings as NodeSettings | undefined) ?? {};
      switch (node.type) {
        case 'promptNode': {
          const prompt = typeof data.prompt === 'string' ? data.prompt : '';
          await studio.onGenerateSlide(nodeId, prompt, settings);
          return;
        }
        case 'carouselNode': {
          const slides = (data.slides as CarouselSlide[] | undefined) ?? [];
          await studio.onGenerateCarousel(nodeId, slides, settings);
          return;
        }
        case 'modelCreationNode': {
          const description = typeof data.description === 'string' ? data.description : '';
          await studio.onCreateModel(nodeId, description, settings);
          return;
        }
        case 'settingNode': {
          const text = typeof data.description === 'string' ? data.description : '';
          await studio.onGenerateSetting(nodeId, text, settings);
          return;
        }
        default:
          throw new Error(`generate_node: unsupported node type '${node.type}'`);
      }
    },
    [nodes, studio],
  );

  const getUploadedRefs = useCallback((): UploadedRef[] => {
    const nodeList = nodes as NodeLike[];
    return nodeList
      .filter((n) => n.type === 'uploadNode')
      .map((n) => {
        const d = (n.data ?? {}) as Record<string, unknown>;
        const name = typeof d.name === 'string' ? d.name : n.id;
        const tags = Array.isArray(d.tags) ? (d.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [];
        const url = typeof d.url === 'string' ? d.url : '';
        const mime = typeof d.mime === 'string' ? d.mime : undefined;
        return { id: n.id, name, tags, url, mime };
      });
  }, [nodes]);

  const getBrandContext = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(BRAND_CONTEXT_KEY);
    } catch {
      return null;
    }
  }, []);

  const getRecentlyGeneratedImages = useCallback((): string[] => {
    const nodeList = nodes as NodeLike[];
    const urls: string[] = [];
    for (const n of nodeList) {
      if (n.type !== 'outputNode') continue;
      const d = (n.data ?? {}) as Record<string, unknown>;
      const url = typeof d.url === 'string' ? d.url : typeof d.imageUrl === 'string' ? d.imageUrl : '';
      if (url) urls.push(url);
    }
    return urls;
  }, [nodes]);

  const access: CanvasAccess = useMemo(
    () => ({
      nodes,
      edges,
      addNode,
      addEdge,
      triggerGenerate,
      getUploadedRefs,
      getBrandContext,
      getRecentlyGeneratedImages,
    }),
    [nodes, edges, addNode, addEdge, triggerGenerate, getUploadedRefs, getBrandContext, getRecentlyGeneratedImages],
  );

  const runTool = useCallback(
    async (name: string, input: Record<string, unknown>) => {
      return dispatchTool(name, input, access, studio);
    },
    [access, studio],
  );

  return useMemo<CanvasAccess>(
    () => ({ ...access, runTool }),
    [access, runTool],
  );
}
