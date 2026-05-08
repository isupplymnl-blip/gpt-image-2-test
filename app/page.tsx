'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  Node,
  Connection,
  NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import JSZip from 'jszip';
import { toPng } from 'html-to-image';

import UploadNode        from './components/nodes/UploadNode';
import PromptNode        from './components/nodes/PromptNode';
import OutputNode        from './components/nodes/OutputNode';
import ModelCreationNode from './components/nodes/ModelCreationNode';
import CarouselPromptNode from './components/nodes/CarouselPromptNode';
import SettingNode        from './components/nodes/SettingNode';
import GradientEdge      from './components/edges/GradientEdge';
import WelcomeDialog     from './components/WelcomeDialog';
import { ErrorBoundary }  from './components/ErrorBoundary';
import { StudioContext, SavedImage, NodeSettings, CarouselSlide } from './context/StudioContext';
import { useBatchHistory, GeneratedImage } from './hooks/useBatchHistory';
import { useGenerationQueue, GenerationJob } from './hooks/useGenerationQueue';
import ChatDrawer from './components/chat/ChatDrawer';
import ChatFab from './components/chat/ChatFab';
import AutomateButton from './components/chat/AutomateButton';
import { useCanvasAccess } from './hooks/useCanvasAccess';

// Module-level constants — never re-registered between renders
const nodeTypes = { uploadNode: UploadNode, promptNode: PromptNode, outputNode: OutputNode, modelCreationNode: ModelCreationNode, carouselNode: CarouselPromptNode, settingNode: SettingNode };
const edgeTypes = { gradient: GradientEdge };
const mkEdge = (id: string, src: string, tgt: string): Edge => ({ id, source: src, target: tgt, type: 'gradient', animated: true });

// ─── Main canvas component ────────────────────────────────────────────────────
function StudioCanvas() {
  const { batches, activeBatch, activeBatchId, globalLibrary, saveCurrentBatch, switchBatch, newBatch, newAutomatedBatch, renameBatch, deleteBatch, addGeneratedImage, addGeneratedImageToBatch, removeGeneratedImage, removeFromGlobalLibrary, updateGeneratedImageSource } = useBatchHistory();
  const libraryImages = globalLibrary;

  const [nodes, setNodes] = useState<Node[]>(activeBatch?.nodes ?? []);
  const [edges, setEdges] = useState<Edge[]>(activeBatch?.edges ?? []);

  // Welcome dialog — show on every page load
  const [showWelcome, setShowWelcome] = useState(true);

  // Carousel slide count picker state
  const [carouselPicker, setCarouselPicker] = useState<{ visible: boolean; count: number }>({ visible: false, count: 6 });

  // Sidebar batch-type dropdown
  const [showBatchTypeMenu, setShowBatchTypeMenu] = useState(false);
  // Provider dropdown
  const [showProviderMenu, setShowProviderMenu] = useState(false);

  // Left sidebar collapse
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);

  // Chat + Automate UI state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatAutomateMode, setChatAutomateMode] = useState(false);

  // Sync nodes/edges when active batch changes
  const prevBatchId = useRef(activeBatchId);
  useEffect(() => {
    if (activeBatchId !== prevBatchId.current) {
      setNodes(activeBatch?.nodes ?? []);
      setEdges(activeBatch?.edges ?? []);
      prevBatchId.current = activeBatchId;
    }
  }, [activeBatchId, activeBatch]);

  // Cmd/Ctrl+A opens Automate modal (unless focused in a text field)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'a') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      e.preventDefault();
      setChatOpen(true);
      setChatAutomateMode(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-save canvas state every 3s
  useEffect(() => {
    const t = setInterval(() => saveCurrentBatch(nodes, edges), 3000);
    return () => clearInterval(t);
  }, [nodes, edges, saveCurrentBatch]);

  // ── Provider & credits state ──────────────────────────────────────────────
  const [activeProvider, setActiveProvider] = useState<'gemini' | 'ecco' | 'pudding' | 'openai' | 'pudding-openai' | 'ithink-openai' | 'grsai'>('gemini');
  const [eccoCredits, setEccoCredits] = useState<number | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const activeProviderRef = useRef<'gemini' | 'ecco' | 'pudding' | 'openai' | 'pudding-openai' | 'ithink-openai' | 'grsai'>('gemini');
  activeProviderRef.current = activeProvider;
  const activeBatchIdRef = useRef(activeBatchId);
  activeBatchIdRef.current = activeBatchId;
  // Map outputNodeId → prompt text for background-completed jobs
  const pendingPromptsRef = useRef(new Map<string, string>());

  useEffect(() => {
    // localStorage override takes priority over server env var
    const saved = localStorage.getItem('isupply-provider') as 'gemini' | 'ecco' | 'pudding' | 'openai' | null;
    if (saved) {
      setActiveProvider(saved);
    } else {
      fetch('/api/config')
        .then(r => r.json())
        .then(d => { setActiveProvider(d.provider ?? 'gemini'); })
        .catch(() => {});
    }
    const savedCredits = localStorage.getItem('isupply-ecco-credits');
    if (savedCredits !== null) setEccoCredits(parseFloat(savedCredits));

    // Load theme
    const savedTheme = localStorage.getItem('isupply-theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    }
  }, []);

  const toggleProvider = useCallback(() => {
    const cycle: Array<'gemini' | 'ecco' | 'pudding' | 'openai'> = ['gemini', 'openai', 'ecco', 'pudding'];
    const idx = cycle.indexOf(activeProvider as 'gemini' | 'ecco' | 'pudding' | 'openai');
    const next = cycle[(idx >= 0 ? idx + 1 : 1) % cycle.length];
    setActiveProvider(next);
    localStorage.setItem('isupply-provider', next);
  }, [activeProvider]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
        document.body.setAttribute('data-theme', next);
      }
      localStorage.setItem('isupply-theme', next);
      return next;
    });
  }, []);

  // Ensure theme attribute stays synced across renders (e.g. after localStorage load)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const edgesRef = useRef<Edge[]>(edges);
  edgesRef.current = edges;
  const nodesRef = useRef<Node[]>(nodes);
  nodesRef.current = nodes;

  // ── EccoAPI generation queue ──────────────────────────────────────────────

  const handleJobComplete = useCallback((job: GenerationJob) => {
    const imageUrl = job.imageUrl!;
    const prompt = pendingPromptsRef.current.get(job.nodeId) ?? '';
    pendingPromptsRef.current.delete(job.nodeId);

    // Update canvas node only if the batch is still active
    if (job.batchId === activeBatchIdRef.current) {
      setNodes(nds => nds.map(n =>
        n.id === job.nodeId ? { ...n, data: { ...n.data, isLoading: false, imageUrl, error: undefined } } : n
      ));
    }
    addGeneratedImageToBatch(job.batchId, {
      id: `img-${Date.now()}`,
      url: imageUrl,
      prompt,
      nodeId: job.nodeId,
      createdAt: new Date().toISOString(),
    });
    if (job.remaining_credits !== undefined) {
      setEccoCredits(job.remaining_credits);
      localStorage.setItem('isupply-ecco-credits', String(job.remaining_credits));
    }
  }, [addGeneratedImageToBatch]);

  const handleJobError = useCallback((job: GenerationJob) => {
    if (job.batchId === activeBatchIdRef.current) {
      setNodes(nds => nds.map(n =>
        n.id === job.nodeId ? { ...n, data: { ...n.data, isLoading: false, error: job.error ?? 'Generation failed' } } : n
      ));
    }
  }, []);

  const { jobs, addJob, markBatchSeen } = useGenerationQueue({
    onJobComplete: handleJobComplete,
    onJobError:    handleJobError,
  });

  const callEccoGenerate = useCallback(async (
    outputNodeId: string,
    body: Record<string, unknown>,
  ) => {
    const currentBatchId = activeBatchIdRef.current;
    const promptText = (body.prompt as string) ?? '';
    pendingPromptsRef.current.set(outputNodeId, promptText);
    setNodes(nds => nds.map(n =>
      n.id === outputNodeId ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));

    // Helper to handle completed image
    const handleSuccess = (imageUrl: string, remaining_credits?: number) => {
      const prompt = pendingPromptsRef.current.get(outputNodeId) ?? '';
      pendingPromptsRef.current.delete(outputNodeId);
      setNodes(nds => nds.map(n =>
        n.id === outputNodeId ? { ...n, data: { ...n.data, isLoading: false, imageUrl, error: undefined, lastPrompt: prompt } } : n
      ));
      addGeneratedImageToBatch(currentBatchId, { id: `img-${Date.now()}`, url: imageUrl, prompt, nodeId: outputNodeId, createdAt: new Date().toISOString() });
      if (remaining_credits !== undefined) {
        setEccoCredits(remaining_credits);
        localStorage.setItem('isupply-ecco-credits', String(remaining_credits));
      }
    };

    try {
      const res = await fetch('/api/ecco/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, batchId: currentBatchId }),
      });

      if (res.status === 200) {
        const data = await res.json() as { imageUrl?: string; error?: string; remaining_credits?: number };
        if (!data.imageUrl) throw new Error(data.error ?? 'EccoAPI returned no image');
        handleSuccess(data.imageUrl, data.remaining_credits);
      } else if (res.status === 202) {
        const data = await res.json() as { jobId?: string; error?: string };
        if (!data.jobId) throw new Error(data.error ?? 'EccoAPI request failed');
        addJob({ id: data.jobId, nodeId: outputNodeId, batchId: currentBatchId });
      } else {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `EccoAPI error ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      pendingPromptsRef.current.delete(outputNodeId);
      setNodes(nds => nds.map(n =>
        n.id === outputNodeId ? { ...n, data: { ...n.data, isLoading: false, error: msg, lastPrompt: promptText } } : n
      ));
    }
  }, [addJob, addGeneratedImageToBatch]);

  /** SSE streaming variant for Ecco — keeps connection alive during sync Ecco API call */
  const callEccoGenerateStream = useCallback(async (
    outputNodeId: string,
    body: Record<string, unknown>,
  ) => {
    const currentBatchId = activeBatchIdRef.current;
    const promptText = (body.prompt as string) ?? '';
    pendingPromptsRef.current.set(outputNodeId, promptText);
    setNodes(nds => nds.map(n =>
      n.id === outputNodeId ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));

    let lastError = '';
    for (let retry = 0; retry < 3; retry++) {
      if (retry > 0) await new Promise(r => setTimeout(r, 1500 * retry));
      try {
        const res = await fetch('/api/ecco/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, batchId: currentBatchId, useStreaming: true }),
        });
        if (!res.ok || !res.body) throw new Error(`Streaming request failed: ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const block of events) {
            if (!block.trim()) continue;
            let eventType = 'message';
            let eventData = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              if (line.startsWith('data: '))  eventData = line.slice(6).trim();
            }
            if (!eventData) continue;
            const parsed = JSON.parse(eventData) as { imageUrl?: string; error?: string; remaining_credits?: number };

            if (eventType === 'complete' && parsed.imageUrl) {
              const prompt = pendingPromptsRef.current.get(outputNodeId) ?? '';
              pendingPromptsRef.current.delete(outputNodeId);
              setNodes(nds => nds.map(n =>
                n.id === outputNodeId ? { ...n, data: { ...n.data, isLoading: false, imageUrl: parsed.imageUrl, error: undefined, lastPrompt: prompt } } : n
              ));
              addGeneratedImageToBatch(currentBatchId, { id: `img-${Date.now()}`, url: parsed.imageUrl, prompt, nodeId: outputNodeId, createdAt: new Date().toISOString() });
              if (parsed.remaining_credits !== undefined) {
                setEccoCredits(parsed.remaining_credits);
                localStorage.setItem('isupply-ecco-credits', String(parsed.remaining_credits));
              }
              return;
            }
            if (eventType === 'error') throw new Error(parsed.error ?? 'Streaming generation failed');
          }
        }
        return; // stream ended cleanly
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Generation failed';
        if (retry < 2) continue;
      }
      break;
    }

    pendingPromptsRef.current.delete(outputNodeId);
    setNodes(nds => nds.map(n =>
      n.id === outputNodeId ? { ...n, data: { ...n.data, isLoading: false, error: lastError, lastPrompt: promptText } } : n
    ));
  }, [addGeneratedImageToBatch]);

  // UI state
  const [selectedNodeId,    setSelectedNodeId]   = useState<string | null>(null);
  const [selectedNodeType,  setSelectedNodeType] = useState<string | null>(null);
  const [connectingFromId,  setConnectingFromId] = useState<string | null>(null);
  const [modalGallery, setModalGallery] = useState<{ items: { url: string; id?: string; name?: string }[]; index: number } | null>(null);
  const openSingleImage = useCallback((url: string) => setModalGallery({ items: [{ url }], index: 0 }), []);
  const [contextMenu,       setContextMenu]      = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [isExporting,       setIsExporting]      = useState(false);
  const [leftTab,  setLeftTab]  = useState<'batches' | 'assets' | 'library'>('batches');
  const [librarySubTab, setLibrarySubTab] = useState<'local' | 'hosted'>('local');
  const [lockCarouselNodes, setLockCarouselNodes] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [assetsList,       setAssetsList]       = useState<Array<{ id: string; name: string; url: string; tags: string[] }>>([]);
  const [selectedAssetId,  setSelectedAssetId]  = useState<string | null>(null);
  const [editAssetName,    setEditAssetName]    = useState('');
  const [editAssetTags,    setEditAssetTags]    = useState('');
  const [isSavingAsset,    setIsSavingAsset]    = useState(false);
  const [selectedLibImgId, setSelectedLibImgId] = useState<string | null>(null);

  const refreshAssets = () =>
    fetch('/api/assets')
      .then(r => r.json())
      .then(data => setAssetsList(Array.isArray(data) ? data : []))
      .catch(() => setAssetsList([]));

  // Fetch assets whenever Assets tab is opened
  useEffect(() => {
    if (leftTab !== 'assets') return;
    refreshAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftTab]);

  const handleSelectAsset = (id: string) => {
    const a = assetsList.find(x => x.id === id);
    if (!a) return;
    setSelectedAssetId(id);
    setEditAssetName(a.name);
    setEditAssetTags(a.tags.join(', '));
    // Clear node selection so right panel shows asset editor
    setSelectedNodeId(null);
    setSelectedNodeType(null);
  };

  const handleSaveAsset = async () => {
    if (!selectedAssetId) return;
    setIsSavingAsset(true);
    const tags = editAssetTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    await fetch(`/api/assets/${selectedAssetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editAssetName, tags }),
    });
    await refreshAssets();
    setIsSavingAsset(false);
  };

  const handleRemoveAsset = async (id: string) => {
    await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    if (selectedAssetId === id) setSelectedAssetId(null);
    await refreshAssets();
  };
  const [renameVal,  setRenameVal]  = useState('');
  const [newBatchName, setNewBatchName] = useState('');

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;

  // ── React Flow handlers ──────────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (lockCarouselNodes) {
      // When a carousel output node moves, propagate delta to all sibling output nodes in the same carousel group
      const posChanges = changes.filter(c => c.type === 'position' && c.dragging && c.position);
      if (posChanges.length > 0) {
        setNodes(nds => {
          let result = applyNodeChanges(changes, nds);
          for (const change of posChanges) {
            if (change.type !== 'position' || !change.position) continue;
            const movedNode = nds.find(n => n.id === change.id);
            if (!movedNode || movedNode.type !== 'outputNode') continue;
            // Find which carousel owns this output node
            const carouselEdge = edgesRef.current.find(e => e.target === change.id);
            if (!carouselEdge) continue;
            const carouselId = carouselEdge.source;
            // Find all sibling output nodes
            const siblingIds = edgesRef.current
              .filter(e => e.source === carouselId && e.target !== change.id)
              .map(e => e.target);
            if (!siblingIds.length) continue;
            const dx = change.position.x - movedNode.position.x;
            const dy = change.position.y - movedNode.position.y;
            result = result.map(n =>
              siblingIds.includes(n.id)
                ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
                : n
            );
          }
          return result;
        });
        return;
      }
    }
    setNodes(nds => applyNodeChanges(changes, nds));
  }, [lockCarouselNodes]);
  const onEdgesChange = useCallback((changes: Parameters<typeof applyEdgeChanges>[0]) =>
    setEdges(eds => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params: Connection) =>
    setEdges(eds => addEdge({ ...params, type: 'gradient', animated: true }, eds)), []);
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeType(null);
    setConnectingFromId(null);
    setContextMenu(null);
  }, []);

  // Right-click context menu on nodes
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
  }, []);

  // ── Studio context callbacks ─────────────────────────────────────────────

  const onSelectNode = useCallback((nodeId: string, nodeType: string) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeType(nodeType);
    setSelectedAssetId(null);
    setSelectedLibImgId(null);
  }, []);

  const onSaveImage = useCallback((nodeId: string, image: SavedImage) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, savedImage: image } } : n));
  }, []);

  const onUpdateSettings = useCallback((nodeId: string, settings: Partial<NodeSettings>) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, settings: { ...(n.data as { settings?: NodeSettings }).settings, ...settings } } } : n
    ));
  }, []);

  const onAddToLibrary = useCallback((image: Omit<GeneratedImage, 'id'>) => {
    addGeneratedImage({ ...image, id: `img-${Date.now()}` });
  }, [addGeneratedImage]);

  const onDeleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) { setSelectedNodeId(null); setSelectedNodeType(null); }
    setConnectingFromId(prev => prev === nodeId ? null : prev);
  }, [selectedNodeId]);

  const onStartConnect = useCallback((nodeId: string) => {
    setConnectingFromId(nodeId);
  }, []);

  // Duplicate a node (offset by 60px, clear generated content)
  const onDuplicateNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newId = `${node.type}-${Date.now()}`;
    setNodes(nds => [...nds, {
      ...node, id: newId,
      position: { x: node.position.x + 60, y: node.position.y + 60 },
      selected: false,
      data: { ...node.data, imageUrl: '', isLoading: false, error: undefined, promptHistory: [] },
    }]);
    setContextMenu(null);
  }, [nodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setConnectingFromId(null); setContextMenu(null); }
      if (e.key === 'Delete' && selectedNodeId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
        setEdges(eds => eds.filter(ed => ed.source !== selectedNodeId && ed.target !== selectedNodeId));
        setSelectedNodeId(null); setSelectedNodeType(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedNodeId) {
        e.preventDefault();
        onDuplicateNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, onDuplicateNode]);

  // Download all library images as ZIP
  const handleDownloadAll = useCallback(async () => {
    if (!libraryImages.length) return;
    const zip  = new JSZip();
    const folder = zip.folder('library')!;
    for (const img of libraryImages) {
      try {
        const res  = await fetch(img.url);
        const blob = await res.blob();
        folder.file(`${img.id}.png`, blob);
      } catch { /* skip */ }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `library-${Date.now()}.zip`;
    a.click();
  }, [libraryImages]);

  // Export canvas as PNG
  const handleExportCanvas = useCallback(async () => {
    const el = document.querySelector('.react-flow') as HTMLElement | null;
    if (!el) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(el, { backgroundColor: 'var(--studio-bg)', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `canvas-${Date.now()}.png`;
      a.click();
    } finally {
      setIsExporting(false);
    }
  }, []);

  // Export batch images to Supabase Storage
  const [isExportingSupabase, setIsExportingSupabase] = useState(false);
  const handleExportToSupabase = useCallback(async () => {
    const imageUrls = (activeBatch?.generatedImages ?? []).map(img => img.url).filter(Boolean);
    if (!imageUrls.length) { alert('No generated images in this batch to export.'); return; }
    const bucket = prompt('Supabase bucket name:', 'generated-images') ?? 'generated-images';
    const folder = prompt('Folder path (optional, leave blank for root):', `batch-${activeBatchId ?? Date.now()}`) ?? '';
    setIsExportingSupabase(true);
    try {
      const res  = await fetch('/api/supabase/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls, bucket, folder }),
      });
      const data = await res.json() as { uploaded?: Array<{ localUrl: string; supabaseUrl: string }>; errors?: Array<{ localUrl: string; error: string }>; error?: string };
      if (!res.ok) { alert(`Export failed: ${data.error ?? 'Unknown error'}`); return; }
      const uploaded = data.uploaded?.length ?? 0;
      const failed   = data.errors?.length   ?? 0;
      // Mark uploaded images as supabase-hosted in library
      data.uploaded?.forEach(({ localUrl, supabaseUrl }) => updateGeneratedImageSource(localUrl, supabaseUrl));
      alert(`Exported ${uploaded} image${uploaded !== 1 ? 's' : ''} to Supabase.${failed ? `\n${failed} failed — check the console for details.` : ''}`);
      if (data.errors?.length) console.error('[supabase/export] errors:', data.errors);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : 'Network error'}`);
    } finally {
      setIsExportingSupabase(false);
    }
  }, [activeBatch, activeBatchId, updateGeneratedImageSource]);

  const onCompleteConnect = useCallback((targetNodeId: string) => {
    setConnectingFromId(prev => {
      if (!prev || prev === targetNodeId) return null;
      const newEdge: Edge = {
        id: `e-${prev}-${targetNodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        source: prev,
        target: targetNodeId,
        type: 'gradient',
        animated: true,
      };
      setEdges(eds => [...eds, newEdge]);
      return null;
    });
  }, []);

  const callGenerate = useCallback(async (
    outputNodeIds: string[],
    body: Record<string, unknown>,
  ): Promise<{ thoughtSignature?: string } | undefined> => {
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));
    const promptText = body.prompt as string;
    const origSettings = (body.settings ?? {}) as Record<string, unknown>;
    const hadSearch = Boolean(origSettings.useGoogleSearch) || Boolean(origSettings.useImageSearch);
    const attempts: Record<string, unknown>[] = hadSearch
      ? [body, { ...body, settings: { ...origSettings, useGoogleSearch: false, useImageSearch: false } }]
      : [body];

    // Route to correct API — settings.providerOverride wins over global activeProvider
    const resolvedProvider = (origSettings.providerOverride as string | undefined) ?? activeProviderRef.current;
    const apiEndpoint = resolvedProvider === 'openai'
      ? '/api/generate-openai'
      : resolvedProvider === 'pudding-openai'
      ? '/api/pudding-openai'
      : resolvedProvider === 'ithink-openai'
      ? '/api/ithink-openai'
      : resolvedProvider === 'grsai'
      ? '/api/grsai'
      : '/api/generate';

    let lastError = '';
    for (const attempt of attempts) {
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) await new Promise(r => setTimeout(r, 1500 * retry));
        try {
          const res  = await fetch(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
          const data = await res.json() as { imageUrl?: string; error?: string; thoughtSignature?: string };
          if (!res.ok || !data.imageUrl) {
            const msg = data.error ?? 'No image returned';
            // Retry on 500/503
            if ((res.status === 500 || res.status === 503) && retry < 2) { lastError = msg; continue; }
            throw new Error(msg);
          }
          const historyEntry = { prompt: promptText, ts: new Date().toISOString() };
          setNodes(nds => nds.map(n => {
            if (outputNodeIds.includes(n.id))
              return { ...n, data: { ...n.data, isLoading: false, imageUrl: data.imageUrl, lastPrompt: promptText, lastSettings: body.settings, error: undefined } };
            if (body.type === 'slide' && n.id === body.nodeId) {
              type H = { prompt: string; ts: string };
              const prev = (n.data as { promptHistory?: H[] }).promptHistory ?? [];
              return { ...n, data: { ...n.data, promptHistory: [historyEntry, ...prev].slice(0, 10) } };
            }
            return n;
          }));
          addGeneratedImage({ id: `img-${Date.now()}`, url: data.imageUrl, prompt: promptText, nodeId: outputNodeIds[0], createdAt: new Date().toISOString() });
          return { thoughtSignature: data.thoughtSignature };
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Generation failed';
          if (retry < 2) continue;
        }
        break;
      }
    }
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: false, error: lastError, lastPrompt: promptText } } : n
    ));
    return undefined;
  }, [addGeneratedImage]);

  const callPuddingGenerate = useCallback(async (
    outputNodeIds: string[],
    body: Record<string, unknown>,
  ) => {
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));
    const promptText = body.prompt as string;
    const origSettings = (body.settings ?? {}) as Record<string, unknown>;
    const hadSearch = Boolean(origSettings.useGoogleSearch) || Boolean(origSettings.useImageSearch);
    const attempts: Record<string, unknown>[] = hadSearch
      ? [body, { ...body, settings: { ...origSettings, useGoogleSearch: false, useImageSearch: false } }]
      : [body];

    let lastError = '';
    for (const attempt of attempts) {
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) await new Promise(r => setTimeout(r, 1500 * retry));
        try {
          const res  = await fetch('/api/pudding/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
          const data = await res.json() as { imageUrl?: string; error?: string };
          if (!res.ok || !data.imageUrl) {
            const msg = data.error ?? 'No image returned';
            if ((res.status === 500 || res.status === 503) && retry < 2) { lastError = msg; continue; }
            throw new Error(msg);
          }
          const historyEntry = { prompt: promptText, ts: new Date().toISOString() };
          setNodes(nds => nds.map(n => {
            if (outputNodeIds.includes(n.id))
              return { ...n, data: { ...n.data, isLoading: false, imageUrl: data.imageUrl, lastPrompt: promptText, lastSettings: body.settings, error: undefined } };
            if (body.type === 'slide' && n.id === body.nodeId) {
              type H = { prompt: string; ts: string };
              const prev = (n.data as { promptHistory?: H[] }).promptHistory ?? [];
              return { ...n, data: { ...n.data, promptHistory: [historyEntry, ...prev].slice(0, 10) } };
            }
            return n;
          }));
          addGeneratedImage({ id: `img-${Date.now()}`, url: data.imageUrl, prompt: promptText, nodeId: outputNodeIds[0], createdAt: new Date().toISOString() });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Generation failed';
          if (retry < 2) continue;
        }
        break;
      }
    }
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: false, error: lastError, lastPrompt: promptText } } : n
    ));
  }, [addGeneratedImage]);

  const callPuddingGenerateStream = useCallback(async (
    outputNodeIds: string[],
    body: Record<string, unknown>,
  ) => {
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));
    const promptText = body.prompt as string;
    const origSettings = (body.settings ?? {}) as Record<string, unknown>;
    const hadSearch = Boolean(origSettings.useGoogleSearch) || Boolean(origSettings.useImageSearch);
    const attempts: Record<string, unknown>[] = hadSearch
      ? [body, { ...body, settings: { ...origSettings, useGoogleSearch: false, useImageSearch: false } }]
      : [body];

    let lastError = '';

    for (const attempt of attempts) {
      try {
        const res = await fetch('/api/pudding/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...attempt, useStreaming: true }),
        });
        if (!res.ok || !res.body) throw new Error(`Streaming request failed: ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by \n\n
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const block of events) {
            if (!block.trim()) continue;
            let eventType = 'message';
            let eventData = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              if (line.startsWith('data: '))  eventData = line.slice(6).trim();
            }
            if (!eventData) continue;

            const parsed = JSON.parse(eventData) as { imageUrl?: string; error?: string };

            if (eventType === 'complete' && parsed.imageUrl) {
              const historyEntry = { prompt: promptText, ts: new Date().toISOString() };
              setNodes(nds => nds.map(n => {
                if (outputNodeIds.includes(n.id))
                  return { ...n, data: { ...n.data, isLoading: false, imageUrl: parsed.imageUrl, lastPrompt: promptText, lastSettings: attempt.settings, error: undefined } };
                if (attempt.type === 'slide' && n.id === attempt.nodeId) {
                  type H = { prompt: string; ts: string };
                  const prev = (n.data as { promptHistory?: H[] }).promptHistory ?? [];
                  return { ...n, data: { ...n.data, promptHistory: [historyEntry, ...prev].slice(0, 10) } };
                }
                return n;
              }));
              addGeneratedImage({ id: `img-${Date.now()}`, url: parsed.imageUrl, prompt: promptText, nodeId: outputNodeIds[0], createdAt: new Date().toISOString() });
              return; // success — exit the function entirely
            }
            if (eventType === 'error') {
              throw new Error(parsed.error ?? 'Streaming generation failed');
            }
            // heartbeat — ignore, just keeps the connection alive
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Generation failed';
      }
    }

    // All attempts exhausted
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: false, error: lastError, lastPrompt: promptText } } : n
    ));
  }, [addGeneratedImage]);

  const callPuddingOpenaiGenerateStream = useCallback(async (
    outputNodeIds: string[],
    body: Record<string, unknown>,
  ) => {
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));
    const promptText = body.prompt as string;
    let lastError = '';

    try {
      const res = await fetch('/api/pudding-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, useStreaming: true }),
      });
      if (!res.ok || !res.body) throw new Error(`Streaming request failed: ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const block of events) {
          if (!block.trim()) continue;
          let eventType = 'message';
          let eventData = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: '))  eventData = line.slice(6).trim();
          }
          if (!eventData) continue;

          const parsed = JSON.parse(eventData) as { imageUrl?: string; error?: string; revisedPrompt?: string };

          if (eventType === 'complete' && parsed.imageUrl) {
            const historyEntry = { prompt: promptText, ts: new Date().toISOString() };
            setNodes(nds => nds.map(n => {
              if (outputNodeIds.includes(n.id))
                return { ...n, data: { ...n.data, isLoading: false, imageUrl: parsed.imageUrl, lastPrompt: promptText, lastSettings: body.settings, error: undefined } };
              if (body.type === 'slide' && n.id === body.nodeId) {
                type H = { prompt: string; ts: string };
                const prev = (n.data as { promptHistory?: H[] }).promptHistory ?? [];
                return { ...n, data: { ...n.data, promptHistory: [historyEntry, ...prev].slice(0, 10) } };
              }
              return n;
            }));
            addGeneratedImage({ id: `img-${Date.now()}`, url: parsed.imageUrl, prompt: promptText, nodeId: outputNodeIds[0], createdAt: new Date().toISOString() });
            return;
          }
          if (eventType === 'error') {
            throw new Error(parsed.error ?? 'Streaming generation failed');
          }
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Generation failed';
    }

    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: false, error: lastError, lastPrompt: promptText } } : n
    ));
  }, [addGeneratedImage]);

  /** Generic SSE streaming for any OpenAI-compatible endpoint (ithink-openai, grsai, etc.) */
  const callOpenAICompatibleStream = useCallback(async (
    endpoint: string,
    outputNodeIds: string[],
    body: Record<string, unknown>,
  ) => {
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));
    const promptText = body.prompt as string;
    let lastError = '';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, useStreaming: true }),
      });
      if (!res.ok || !res.body) throw new Error(`Streaming request failed: ${res.status}`);
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const block of events) {
          if (!block.trim()) continue;
          let eventType = 'message';
          let eventData = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: '))  eventData = line.slice(6).trim();
          }
          if (!eventData) continue;
          const parsed = JSON.parse(eventData) as { imageUrl?: string; error?: string };
          if (eventType === 'complete' && parsed.imageUrl) {
            const historyEntry = { prompt: promptText, ts: new Date().toISOString() };
            setNodes(nds => nds.map(n => {
              if (outputNodeIds.includes(n.id))
                return { ...n, data: { ...n.data, isLoading: false, imageUrl: parsed.imageUrl, lastPrompt: promptText, lastSettings: body.settings, error: undefined } };
              if (body.type === 'slide' && n.id === body.nodeId) {
                type H = { prompt: string; ts: string };
                const prev = (n.data as { promptHistory?: H[] }).promptHistory ?? [];
                return { ...n, data: { ...n.data, promptHistory: [historyEntry, ...prev].slice(0, 10) } };
              }
              return n;
            }));
            addGeneratedImage({ id: `img-${Date.now()}`, url: parsed.imageUrl, prompt: promptText, nodeId: outputNodeIds[0], createdAt: new Date().toISOString() });
            return;
          }
          if (eventType === 'error') throw new Error(parsed.error ?? 'Streaming generation failed');
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Generation failed';
    }
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: false, error: lastError, lastPrompt: promptText } } : n
    ));
  }, [addGeneratedImage]);

  /** SSE streaming variant for the Gemini direct route — mirrors callPuddingGenerateStream */
  const callGeminiGenerateStream = useCallback(async (
    outputNodeIds: string[],
    body: Record<string, unknown>,
  ): Promise<{ thoughtSignature?: string } | undefined> => {
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n
    ));
    const promptText = body.prompt as string;
    const origSettings = (body.settings ?? {}) as Record<string, unknown>;
    const hadSearch = Boolean(origSettings.useGoogleSearch) || Boolean(origSettings.useImageSearch);
    const attempts: Record<string, unknown>[] = hadSearch
      ? [body, { ...body, settings: { ...origSettings, useGoogleSearch: false, useImageSearch: false } }]
      : [body];

    let lastError = '';
    for (const attempt of attempts) {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...attempt, useStreaming: true }),
        });
        if (!res.ok || !res.body) throw new Error(`Streaming request failed: ${res.status}`);

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const block of events) {
            if (!block.trim()) continue;
            let eventType = 'message';
            let eventData = '';
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              if (line.startsWith('data: '))  eventData = line.slice(6).trim();
            }
            if (!eventData) continue;
            const parsed = JSON.parse(eventData) as { imageUrl?: string; error?: string; thoughtSignature?: string };
            if (eventType === 'complete' && parsed.imageUrl) {
              const historyEntry = { prompt: promptText, ts: new Date().toISOString() };
              setNodes(nds => nds.map(n => {
                if (outputNodeIds.includes(n.id))
                  return { ...n, data: { ...n.data, isLoading: false, imageUrl: parsed.imageUrl, lastPrompt: promptText, lastSettings: attempt.settings, error: undefined } };
                if (attempt.type === 'slide' && n.id === attempt.nodeId) {
                  type H = { prompt: string; ts: string };
                  const prev = (n.data as { promptHistory?: H[] }).promptHistory ?? [];
                  return { ...n, data: { ...n.data, promptHistory: [historyEntry, ...prev].slice(0, 10) } };
                }
                return n;
              }));
              addGeneratedImage({ id: `img-${Date.now()}`, url: parsed.imageUrl, prompt: promptText, nodeId: outputNodeIds[0], createdAt: new Date().toISOString() });
              return { thoughtSignature: parsed.thoughtSignature };
            }
            if (eventType === 'error') {
              throw new Error(parsed.error ?? 'Streaming generation failed');
            }
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Generation failed';
      }
    }
    setNodes(nds => nds.map(n =>
      outputNodeIds.includes(n.id) ? { ...n, data: { ...n.data, isLoading: false, error: lastError, lastPrompt: promptText } } : n
    ));
    return undefined;
  }, [addGeneratedImage]);

  /** Collect reference images (url + name + referenceType) from connected nodes, sorted by role order */
  const getConnectedUploadRefs = useCallback((nodeId: string): Array<{ url: string; name: string; referenceType: string }> => {
    const REF_ORDER: Record<string, number> = {
      'product': 0,
      'model-ref': 1,
      'setting-plate': 2,
      'style-ref': 3,
      'other': 4,
    };

    const refs = edgesRef.current
      .filter(e => e.target === nodeId)
      .map(e => nodesRef.current.find(n => n.id === e.source))
      .filter(n => n?.type === 'uploadNode' || n?.type === 'settingNode' || n?.type === 'modelCreationNode')
      .map(n => {
        if (n?.type === 'uploadNode') {
          const saved = (n.data as { savedImage?: { url: string; name: string }; settings?: { referenceType?: string } })?.savedImage;
          const refType = (n.data as { settings?: { referenceType?: string } })?.settings?.referenceType ?? 'product';
          if (saved?.url) return { url: saved.url, name: saved.name || (n.data as { label?: string })?.label || 'reference', referenceType: refType };
        }
        if (n?.type === 'settingNode') {
          const ndata = n.data as { imageUrl?: string; settings?: { uploadedSettingUrl?: string; uploadedSettingName?: string }; label?: string };
          const url = ndata.settings?.uploadedSettingUrl || ndata.imageUrl;
          const name = ndata.settings?.uploadedSettingName || ndata.label || 'setting-plate';
          if (url) return { url, name, referenceType: 'setting-plate' };
        }
        if (n?.type === 'modelCreationNode') {
          const ndata = n.data as { imageUrl?: string; settings?: { uploadedModelUrl?: string; uploadedModelName?: string }; label?: string };
          const url = ndata.settings?.uploadedModelUrl || ndata.imageUrl;
          const name = ndata.settings?.uploadedModelName || ndata.label || 'model-reference';
          if (url) return { url, name, referenceType: 'model-ref' };
        }
        return undefined;
      })
      .filter((ref): ref is { url: string; name: string; referenceType: string } => !!ref)
      .sort((a, b) => (REF_ORDER[a.referenceType] ?? 4) - (REF_ORDER[b.referenceType] ?? 4));

    console.log(`[getConnectedUploadRefs] nodeId=${nodeId}, sorted refs:`, refs.map((r, i) => `Image ${i+1}: ${r.referenceType} — ${r.name}`));
    return refs;
  }, []);

  const onGenerateSlide = useCallback(async (promptNodeId: string, prompt: string, settings?: NodeSettings) => {
    const count = Math.max(1, settings?.count ?? 1);
    const existingOutIds = edgesRef.current.filter(e => e.source === promptNodeId).map(e => e.target);
    const allOutIds = [...existingOutIds];

    if (count > existingOutIds.length) {
      const promptNode = nodesRef.current.find(n => n.id === promptNodeId);
      const baseX = (promptNode?.position.x ?? 440) + 440;
      const baseY = promptNode?.position.y ?? 60;
      const outputCount = nodesRef.current.filter(n => n.type === 'outputNode').length;
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      for (let i = existingOutIds.length; i < count; i++) {
        const oid = `output-${Date.now()}-${i}`;
        const slideNum = outputCount + (i - existingOutIds.length) + 1;
        newNodes.push({ id: oid, type: 'outputNode', position: { x: baseX, y: baseY + (i - existingOutIds.length) * 320 }, data: { label: `Output ${slideNum}`, slideNumber: slideNum, isLoading: false, imageUrl: '' } });
        newEdges.push(mkEdge(`e-${promptNodeId}-${oid}`, promptNodeId, oid));
        allOutIds.push(oid);
      }
      setNodes(nds => [...nds, ...newNodes]);
      setEdges(eds => [...eds, ...newEdges]);
    }

    if (!allOutIds.length) return;

    const referenceImages = getConnectedUploadRefs(promptNodeId);
    const referenceUrls = referenceImages.map(r => r.url);
    console.log('[onGenerateSlide] referenceImages:', referenceImages.map(r => r.name));

    const effectiveProvider = settings?.providerOverride ?? activeProviderRef.current;
    if (effectiveProvider === 'ecco') {
      const model = (settings?.eccoModel as string | undefined) ?? 'nanobanana31';
      const aspectRatio = settings?.aspectRatio ?? '4:5';
      const imageSize = settings?.imageSize ?? '1K';
      const eccoFn = settings?.useStreaming ? callEccoGenerateStream : callEccoGenerate;
      await Promise.all(allOutIds.map(outId =>
        eccoFn(outId, {
          prompt, nodeId: promptNodeId, model, aspectRatio, imageSize,
          useGoogleSearch:  settings?.useGoogleSearch  ?? false,
          useImageSearch:   settings?.useImageSearch   ?? false,
          temperature:      settings?.temperature      ?? 1.0,
          includeThoughts:  settings?.includeThoughts  ?? true,
          mediaResolution:  settings?.mediaResolution  ?? 'media_resolution_high',
          safetyThreshold:  settings?.safetyThreshold  ?? 'BLOCK_MEDIUM_AND_ABOVE',
          useAsync:         settings?.useStreaming ? false : (settings?.useAsync ?? false),
          referenceUrls,
        })
      ));
    } else if (effectiveProvider === 'pudding') {
      const puddingFn = settings?.useStreaming ? callPuddingGenerateStream : callPuddingGenerate;
      await Promise.all(allOutIds.map(outId =>
        puddingFn([outId], { prompt, nodeId: promptNodeId, type: 'slide', settings: settings ?? {}, referenceUrls })
      ));
    } else if (effectiveProvider === 'openai') {
      await Promise.all(allOutIds.map(outId =>
        callGenerate([outId], { prompt, nodeId: promptNodeId, type: 'slide', settings: { ...(settings ?? {}), providerOverride: 'openai' }, referenceImages })
      ));
    } else if (effectiveProvider === 'pudding-openai') {
      await Promise.all(allOutIds.map(outId =>
        callPuddingOpenaiGenerateStream([outId], { prompt, nodeId: promptNodeId, type: 'slide', settings: settings ?? {}, referenceUrls })
      ));
    } else if (effectiveProvider === 'ithink-openai') {
      await Promise.all(allOutIds.map(outId =>
        callOpenAICompatibleStream('/api/ithink-openai', [outId], { prompt, nodeId: promptNodeId, type: 'slide', settings: settings ?? {}, referenceImages })
      ));
    } else if (effectiveProvider === 'grsai') {
      await Promise.all(allOutIds.map(outId =>
        callOpenAICompatibleStream('/api/grsai', [outId], { prompt, nodeId: promptNodeId, type: 'slide', settings: settings ?? {}, referenceImages })
      ));
    } else {
      const geminiFn = settings?.useStreaming ? callGeminiGenerateStream : callGenerate;
      await Promise.all(allOutIds.map(outId =>
        geminiFn([outId], { prompt, nodeId: promptNodeId, type: 'slide', settings: settings ?? {}, referenceImages })
      ));
    }
  }, [callGenerate, callGeminiGenerateStream, callPuddingGenerate, callPuddingGenerateStream, callPuddingOpenaiGenerateStream, callOpenAICompatibleStream, callEccoGenerate, getConnectedUploadRefs]);

  const onRegenerate = useCallback(async (outputNodeId: string, lastPrompt: string, settings?: NodeSettings) => {
    const referenceImages = getConnectedUploadRefs(outputNodeId);
    const referenceUrls = referenceImages.map(r => r.url);
    const effectiveProvider = settings?.providerOverride ?? activeProviderRef.current;
    if (effectiveProvider === 'ecco') {
      const model = (settings?.eccoModel as string | undefined) ?? 'nanobanana31';
      const eccoFn = settings?.useStreaming ? callEccoGenerateStream : callEccoGenerate;
      await eccoFn(outputNodeId, {
        prompt: lastPrompt, nodeId: outputNodeId, model,
        aspectRatio:      settings?.aspectRatio     ?? '4:5',
        imageSize:        settings?.imageSize       ?? '1K',
        useGoogleSearch:  settings?.useGoogleSearch ?? false,
        useImageSearch:   settings?.useImageSearch  ?? false,
        temperature:      settings?.temperature     ?? 1.0,
        includeThoughts:  settings?.includeThoughts ?? true,
        mediaResolution:  settings?.mediaResolution ?? 'media_resolution_high',
        safetyThreshold:  settings?.safetyThreshold ?? 'BLOCK_MEDIUM_AND_ABOVE',
        useAsync:         settings?.useStreaming ? false : (settings?.useAsync ?? false),
        referenceUrls,
      });
    } else if (effectiveProvider === 'pudding') {
      const puddingFn = settings?.useStreaming ? callPuddingGenerateStream : callPuddingGenerate;
      await puddingFn([outputNodeId], { prompt: lastPrompt, nodeId: outputNodeId, type: 'slide', settings: settings ?? {}, referenceUrls });
    } else if (effectiveProvider === 'openai') {
      await callGenerate([outputNodeId], { prompt: lastPrompt, nodeId: outputNodeId, type: 'slide', settings: { ...(settings ?? {}), providerOverride: 'openai' }, referenceImages });
    } else if (effectiveProvider === 'pudding-openai') {
      await callPuddingOpenaiGenerateStream([outputNodeId], { prompt: lastPrompt, nodeId: outputNodeId, type: 'slide', settings: settings ?? {}, referenceUrls });
    } else if (effectiveProvider === 'ithink-openai') {
      await callOpenAICompatibleStream('/api/ithink-openai', [outputNodeId], { prompt: lastPrompt, nodeId: outputNodeId, type: 'slide', settings: settings ?? {}, referenceImages });
    } else if (effectiveProvider === 'grsai') {
      await callOpenAICompatibleStream('/api/grsai', [outputNodeId], { prompt: lastPrompt, nodeId: outputNodeId, type: 'slide', settings: settings ?? {}, referenceImages });
    } else {
      const geminiFn = settings?.useStreaming ? callGeminiGenerateStream : callGenerate;
      await geminiFn([outputNodeId], { prompt: lastPrompt, nodeId: outputNodeId, type: 'slide', settings: settings ?? {}, referenceImages });
    }
  }, [callGenerate, callGeminiGenerateStream, callPuddingGenerate, callPuddingGenerateStream, callPuddingOpenaiGenerateStream, callOpenAICompatibleStream, callEccoGenerate, getConnectedUploadRefs]);

  // Carousel generation — parallel for all providers except Gemini direct
  // (Gemini threads thoughtSignature slide-to-slide for character consistency)
  const onGenerateCarousel = useCallback(async (nodeId: string, slides: CarouselSlide[], settings?: NodeSettings) => {
    const pending = slides.filter(s => s.prompt.trim() && s.outputNodeId);
    const referenceImages = getConnectedUploadRefs(nodeId);
    const referenceUrls = referenceImages.map(r => r.url);
    const effectiveProvider = settings?.providerOverride ?? activeProviderRef.current;

    if (effectiveProvider === 'gemini' || effectiveProvider === 'pudding') {
      // Sequential — Gemini threads thoughtSignature; Pudding follows same pattern
      let thoughtSignature: string | undefined;
      for (const slide of pending) {
        if (effectiveProvider === 'pudding') {
          const puddingFn = settings?.useStreaming ? callPuddingGenerateStream : callPuddingGenerate;
          await puddingFn([slide.outputNodeId], { prompt: slide.prompt.trim(), nodeId, type: 'slide', settings: settings ?? {}, referenceUrls });
        } else {
          const geminiFn = settings?.useStreaming ? callGeminiGenerateStream : callGenerate;
          const result = await geminiFn([slide.outputNodeId], {
            prompt: slide.prompt.trim(), nodeId, type: 'slide',
            settings: settings ?? {},
            referenceImages,
            ...(thoughtSignature ? { thoughtSignature } : {}),
          });
          thoughtSignature = result?.thoughtSignature;
        }
      }
    } else {
      // Parallel for all OpenAI-compatible providers and Ecco
      await Promise.all(pending.map(slide => {
        if (effectiveProvider === 'ecco') {
          const model = (settings?.eccoModel as string | undefined) ?? 'nanobanana31';
          const eccoFn = settings?.useStreaming ? callEccoGenerateStream : callEccoGenerate;
          return eccoFn(slide.outputNodeId, {
            prompt: slide.prompt.trim(), nodeId, model,
            aspectRatio:      settings?.aspectRatio     ?? '4:5',
            imageSize:        settings?.imageSize       ?? '1K',
            useGoogleSearch:  settings?.useGoogleSearch ?? false,
            useImageSearch:   settings?.useImageSearch  ?? false,
            temperature:      settings?.temperature     ?? 1.0,
            includeThoughts:  settings?.includeThoughts ?? true,
            mediaResolution:  settings?.mediaResolution ?? 'media_resolution_high',
            safetyThreshold:  settings?.safetyThreshold ?? 'BLOCK_MEDIUM_AND_ABOVE',
            useAsync:         settings?.useStreaming ? false : (settings?.useAsync ?? false),
            referenceUrls,
          });
        } else if (effectiveProvider === 'openai') {
          return callGenerate([slide.outputNodeId], { prompt: slide.prompt.trim(), nodeId, type: 'slide', settings: { ...(settings ?? {}), providerOverride: 'openai' }, referenceImages });
        } else if (effectiveProvider === 'pudding-openai') {
          return callPuddingOpenaiGenerateStream([slide.outputNodeId], { prompt: slide.prompt.trim(), nodeId, type: 'slide', settings: settings ?? {}, referenceUrls });
        } else if (effectiveProvider === 'ithink-openai') {
          return callOpenAICompatibleStream('/api/ithink-openai', [slide.outputNodeId], { prompt: slide.prompt.trim(), nodeId, type: 'slide', settings: settings ?? {}, referenceImages });
        } else {
          return callOpenAICompatibleStream('/api/grsai', [slide.outputNodeId], { prompt: slide.prompt.trim(), nodeId, type: 'slide', settings: settings ?? {}, referenceImages });
        }
      }));
    }
  }, [callGenerate, callGeminiGenerateStream, callPuddingGenerate, callPuddingGenerateStream, callPuddingOpenaiGenerateStream, callOpenAICompatibleStream, callEccoGenerate, callEccoGenerateStream, getConnectedUploadRefs]);

  const onUpdateData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    ));
  }, []);

  const onCreateModel = useCallback(async (nodeId: string, description: string, settings: NodeSettings) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n));

    // Shared model count + prompt builder
    const lower = description.toLowerCase();
    let modelCount: 1 | 2 | 3 = 1;
    if (/\b(three models?|3 models?|three people|3 people|3 persons?|three persons?)\b/.test(lower)) modelCount = 3;
    else if (/\b(two models?|2 models?|both models?|model 1\b[\s\S]{0,80}\bmodel 2\b|(male|man|boy)[\s\S]{0,80}(female|woman|girl)|(female|woman|girl)[\s\S]{0,80}(male|man|boy)|first model\b[\s\S]{0,80}\bsecond model\b)\b/.test(lower)) modelCount = 2;

    const aspectRatio = modelCount >= 2 ? '21:9' : '16:9';
    const style  = (settings?.style      as string | undefined) ?? 'realistic commercial photography';
    const light  = (settings?.lighting   as string | undefined) ?? 'professional studio lighting';
    const bg     = (settings?.background as string | undefined) ?? 'pure white';

    const compositePrompt = modelCount === 3
      ? `Create a professional fashion photograph of THREE models standing together in a single ultra-wide 21:9 frame. ` +
        `Each model is shown in a complete head-to-toe full-body pose. All three visible simultaneously, evenly spaced, facing forward. ` +
        `Models: ${description}. Style: ${style}. Lighting: ${light}. Background: ${bg}. ` +
        `Ultra high quality, sharp details, professional fashion photography. Do not split into panels or multiple images.`
      : modelCount === 2
      ? `Create a professional fashion photograph of TWO models standing side by side in a single ultra-wide 21:9 frame. ` +
        `Each model is shown in a complete head-to-toe full-body pose, both fully visible. ` +
        `Models: ${description}. Style: ${style}. Lighting: ${light}. Background: ${bg}. ` +
        `Ultra high quality, sharp details, professional fashion photography. Do not split into panels or multiple images.`
      : `Create a professional full-body fashion portrait of a model in a 16:9 frame. ` +
        `Complete head-to-toe figure, elegant upright pose, full profile visible. ` +
        `Model: ${description}. Style: ${style}. Lighting: ${light}. Background: ${bg}. ` +
        `Ultra high quality, sharp details, professional fashion photography.`;

    if (activeProviderRef.current === 'ecco') {
      const referenceUrls = getConnectedUploadRefs(nodeId).map(r => r.url);
      const eccoFn = settings?.useStreaming ? callEccoGenerateStream : callEccoGenerate;
      await eccoFn(nodeId, {
        prompt: compositePrompt,
        nodeId,
        model:           (settings?.eccoModel as string | undefined) ?? 'nanobananapro',
        aspectRatio,
        imageSize:       settings?.imageSize       ?? '1K',
        useGoogleSearch: settings?.useGoogleSearch ?? false,
        useImageSearch:  settings?.useImageSearch  ?? false,
        temperature:     settings?.temperature     ?? 1.0,
        includeThoughts: settings?.includeThoughts ?? true,
        mediaResolution: settings?.mediaResolution ?? 'media_resolution_high',
        safetyThreshold: settings?.safetyThreshold ?? 'BLOCK_MEDIUM_AND_ABOVE',
        useAsync:        settings?.useStreaming ? false : (settings?.useAsync ?? false),
        referenceUrls,
      });
    } else if (activeProviderRef.current === 'pudding') {
      const puddingFn = settings?.useStreaming ? callPuddingGenerateStream : callPuddingGenerate;
      await puddingFn([nodeId], { prompt: description, nodeId, type: 'model-creation', settings });
    } else {
      // Gemini — use retry loop
      let lastError = '';
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) await new Promise(r => setTimeout(r, 1500 * retry));
        try {
          const fn = settings?.useStreaming ? callGeminiGenerateStream : callGenerate;
          const result = await fn([nodeId], { prompt: description, nodeId, type: 'model-creation', settings });
          if (result !== undefined || !settings?.useStreaming) return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Generation failed';
          if (retry < 2) continue;
        }
        break;
      }
      if (lastError) {
        setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isLoading: false, error: lastError } } : n));
      }
    }
  }, [addGeneratedImage, callPuddingGenerate, callPuddingGenerateStream, callEccoGenerate, callEccoGenerateStream, callGenerate, callGeminiGenerateStream, getConnectedUploadRefs]);

  const SETTING_QUALITY_TAIL = 'no people — no products — background plate only — photorealistic';

  const onGenerateSetting = useCallback(async (nodeId: string, text: string, settings: NodeSettings) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isLoading: true, error: undefined } } : n));

    const isComposite = settings.compositeMode === 'multi-angle';
    const angles = settings.compositeAngles ?? [];
    const effectiveCount = angles.length >= 2 ? angles.length : 4;
    const compositeRatio = effectiveCount <= 2 ? '16:9' : '21:9';

    let fullPrompt: string;
    if (isComposite && angles.length >= 2) {
      const panelList = angles.map((a, i) => a.trim() || `Angle ${i + 1}`).join(' · ');
      fullPrompt = `Create a professional composite image with ${effectiveCount} panels in a single ${compositeRatio} frame showing the same location from ${effectiveCount} camera angles. Same lighting, same time of day, same environment across all panels. Panels layout (left to right): ${panelList}. ${text.trim()}. ${SETTING_QUALITY_TAIL}`;
    } else {
      fullPrompt = `${text.trim()}\n\n${SETTING_QUALITY_TAIL}`;
    }

    // Enforce temperature within plate-safe range
    const clampedSettings: NodeSettings = {
      ...settings,
      temperature: Math.min(0.7, Math.max(0.5, settings.temperature ?? 0.6)),
      ...(isComposite && angles.length >= 2 ? { aspectRatio: compositeRatio } : {}),
    };

    if (activeProviderRef.current === 'ecco') {
      const eccoFn = settings?.useStreaming ? callEccoGenerateStream : callEccoGenerate;
      await eccoFn(nodeId, {
        prompt: fullPrompt,
        nodeId,
        model:           (settings?.eccoModel as string | undefined) ?? 'nanobananapro',
        aspectRatio:     '16:9',
        imageSize:       settings?.imageSize       ?? '1K',
        useGoogleSearch: false,
        useImageSearch:  false,
        temperature:     clampedSettings.temperature,
        includeThoughts: settings?.includeThoughts ?? true,
        mediaResolution: settings?.mediaResolution ?? 'media_resolution_high',
        safetyThreshold: settings?.safetyThreshold ?? 'BLOCK_MEDIUM_AND_ABOVE',
        useAsync:        false,
        referenceUrls:   [],
      });
    } else if (activeProviderRef.current === 'pudding') {
      const puddingFn = settings?.useStreaming ? callPuddingGenerateStream : callPuddingGenerate;
      await puddingFn([nodeId], { prompt: fullPrompt, nodeId, type: 'slide', settings: clampedSettings });
    } else {
      let lastError = '';
      for (let retry = 0; retry < 3; retry++) {
        if (retry > 0) await new Promise(r => setTimeout(r, 1500 * retry));
        try {
          const fn = settings?.useStreaming ? callGeminiGenerateStream : callGenerate;
          const result = await fn([nodeId], { prompt: fullPrompt, nodeId, type: 'slide', settings: clampedSettings });
          if (result !== undefined || !settings?.useStreaming) return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Generation failed';
          if (retry < 2) continue;
        }
        break;
      }
      if (lastError) {
        setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isLoading: false, error: lastError } } : n));
      }
    }
  }, [callPuddingGenerate, callPuddingGenerateStream, callEccoGenerate, callEccoGenerateStream, callGenerate, callGeminiGenerateStream]);

  const onAddCarouselSlide = useCallback((carouselNodeId: string) => {
    const outCount = nodesRef.current.filter(n => n.type === 'outputNode').length;
    const carouselNode = nodesRef.current.find(n => n.id === carouselNodeId);
    if (!carouselNode) return;

    // Place new output node below existing linked output nodes
    const linkedOutIds = edgesRef.current.filter(e => e.source === carouselNodeId).map(e => e.target);
    const linkedOuts = nodesRef.current.filter(n => linkedOutIds.includes(n.id));
    const maxY = linkedOuts.length
      ? Math.max(...linkedOuts.map(n => n.position.y))
      : carouselNode.position.y;
    const newOutX = linkedOuts.length ? linkedOuts[0].position.x : (carouselNode.position.x + 460);

    const newOutId = `output-${Date.now()}`;
    const newSlide: CarouselSlide = { id: `cs-${Date.now()}`, prompt: '', outputNodeId: newOutId };
    const newOutNode: Node = {
      id: newOutId, type: 'outputNode',
      position: { x: newOutX, y: maxY + 320 },
      data: { label: `Output ${outCount + 1}`, slideNumber: outCount + 1, isLoading: false, imageUrl: '' },
    };

    setNodes(nds => {
      // Append slide to carousel node data
      const updated = nds.map(n => {
        if (n.id !== carouselNodeId) return n;
        const slides = [...((n.data as { slides?: CarouselSlide[] }).slides ?? []), newSlide];
        return { ...n, data: { ...n.data, slides } };
      });
      return [...updated, newOutNode];
    });
    setEdges(eds => [...eds, mkEdge(`e-${carouselNodeId}-${newOutId}`, carouselNodeId, newOutId)]);
  }, []);

  const onRemoveCarouselSlide = useCallback((carouselNodeId: string, slideIndex: number) => {
    const carouselNode = nodesRef.current.find(n => n.id === carouselNodeId);
    if (!carouselNode) return;
    const slides: CarouselSlide[] = (carouselNode.data as { slides?: CarouselSlide[] }).slides ?? [];
    if (slides.length <= 1) return; // keep at least 1
    const removedSlide = slides[slideIndex];
    if (!removedSlide) return;

    setNodes(nds => {
      const updated = nds
        .filter(n => n.id !== removedSlide.outputNodeId) // remove output node
        .map(n => {
          if (n.id !== carouselNodeId) return n;
          const newSlides = slides.filter((_, i) => i !== slideIndex);
          return { ...n, data: { ...n.data, slides: newSlides } };
        });
      return updated;
    });
    setEdges(eds => eds.filter(e => !(e.source === carouselNodeId && e.target === removedSlide.outputNodeId)));
  }, []);

  const studioCtx = useMemo(() => ({
    onSaveImage, onGenerateSlide, onGenerateCarousel, onRegenerate, onCreateModel, onGenerateSetting,
    onUpdateSettings, onUpdateData, onSelectNode, onAddToLibrary,
    onDeleteNode, onAddCarouselSlide, onRemoveCarouselSlide,
    connectingFromId, onStartConnect, onCompleteConnect,
    activeProvider,
  }), [onSaveImage, onGenerateSlide, onGenerateCarousel, onRegenerate, onCreateModel, onGenerateSetting,
      onUpdateSettings, onUpdateData, onSelectNode, onAddToLibrary,
      onDeleteNode, onAddCarouselSlide, onRemoveCarouselSlide,
      connectingFromId, onStartConnect, onCompleteConnect, activeProvider]);

  // ── Node helpers ─────────────────────────────────────────────────────────
  // Approx node dimensions per type for collision detection
  const NODE_SIZE: Record<string, { w: number; h: number }> = {
    uploadNode:        { w: 280, h: 300 },
    promptNode:        { w: 360, h: 280 },
    outputNode:        { w: 340, h: 320 },
    modelCreationNode: { w: 320, h: 320 },
    settingNode:       { w: 320, h: 340 },
    carouselNode:      { w: 380, h: 400 },
  };

  const rectsOverlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    !(a.x + a.w + 20 < b.x || b.x + b.w + 20 < a.x || a.y + a.h + 20 < b.y || b.y + b.h + 20 < a.y);

  // Find first non-overlapping slot near anchor x, scanning downward then in columns
  const findFreeSlot = (nds: Node[], type: string, anchorX: number): { x: number; y: number } => {
    const size = NODE_SIZE[type] ?? { w: 340, h: 300 };
    const occupied = nds.map(n => {
      const s = NODE_SIZE[n.type ?? ''] ?? { w: 340, h: 300 };
      return { x: n.position.x, y: n.position.y, w: s.w, h: s.h };
    });
    // Try columns offsetted from anchorX, then scan Y downward in each column
    for (let col = 0; col < 6; col++) {
      const x = anchorX + col * (size.w + 40);
      for (let y = 80; y < 8000; y += size.h + 30) {
        const candidate = { x, y, w: size.w, h: size.h };
        if (!occupied.some(o => rectsOverlap(candidate, o))) return { x, y };
      }
    }
    // Fallback: stack below lowest node
    const maxY = nds.length ? Math.max(...nds.map(n => n.position.y)) : 0;
    return { x: anchorX, y: maxY + size.h + 40 };
  };

  const addUploadNode = () => setNodes(nds => {
    const pos = findFreeSlot(nds, 'uploadNode', 60);
    return [...nds, { id: `upload-${Date.now()}`, type: 'uploadNode', position: pos, data: { label: `Reference ${nds.filter(n => n.type === 'uploadNode').length + 1}` } }];
  });
  const addPromptNode = () => {
    const pid = `prompt-${Date.now()}`; const oid = `output-${Date.now() + 1}`;
    setNodes(nds => {
      const c = nds.filter(n => n.type === 'promptNode').length;
      const promptPos = findFreeSlot(nds, 'promptNode', 440);
      const withPrompt = [...nds, { id: pid, type: 'promptNode', position: promptPos, data: { label: `Slide ${c + 1}`, slideNumber: c + 1 } }];
      const outputPos = findFreeSlot(withPrompt, 'outputNode', promptPos.x + 440);
      // Keep output roughly aligned with prompt row
      const alignedOutput = { x: outputPos.x, y: promptPos.y };
      const outputSize = NODE_SIZE.outputNode;
      const outputConflicts = withPrompt.some(n => {
        const s = NODE_SIZE[n.type ?? ''] ?? { w: 340, h: 300 };
        return rectsOverlap({ x: alignedOutput.x, y: alignedOutput.y, w: outputSize.w, h: outputSize.h }, { x: n.position.x, y: n.position.y, w: s.w, h: s.h });
      });
      return [...withPrompt, { id: oid, type: 'outputNode', position: outputConflicts ? outputPos : alignedOutput, data: { label: `Output ${c + 1}`, slideNumber: c + 1, isLoading: false, imageUrl: '' } }];
    });
    const autoEdges = nodesRef.current
      .filter(n => n.type === 'settingNode' || n.type === 'uploadNode' || n.type === 'modelCreationNode')
      .filter(n => !edgesRef.current.some(e => e.source === n.id && e.target === pid))
      .map(n => mkEdge(`e-auto-${n.id}-${pid}`, n.id, pid));
    setEdges(eds => [...eds, mkEdge(`e-${pid}-${oid}`, pid, oid), ...autoEdges]);
  };
  const addModelNode   = () => setNodes(nds => [...nds, { id: `model-${Date.now()}`,   type: 'modelCreationNode', position: findFreeSlot(nds, 'modelCreationNode', 200), data: { label: 'Model' } }]);
  const addSettingNode = () => setNodes(nds => [...nds, { id: `setting-${Date.now()}`, type: 'settingNode',       position: findFreeSlot(nds, 'settingNode',       200), data: { label: 'Setting' } }]);

  // Opens the count picker — actual creation happens in createCarouselNode
  const addCarouselSlide = () => setCarouselPicker({ visible: true, count: 6 });

  const createCarouselNode = (count: number) => {
    const cid    = `carousel-${Date.now()}`;
    const carouselPos = findFreeSlot(nodesRef.current, 'carouselNode', 440);
    const baseY  = carouselPos.y;
    const outCount = nodesRef.current.filter(n => n.type === 'outputNode').length;

    // Start output nodes below the last existing output node to avoid overlap
    const existingOutNodes = nodesRef.current.filter(n => n.type === 'outputNode');
    const existingMaxY = existingOutNodes.length
      ? Math.max(...existingOutNodes.map(n => n.position.y))
      : baseY - 320;
    const outStartY = Math.max(baseY, existingMaxY + 340);
    const outX = carouselPos.x + 460;

    const outputNodes: Node[] = Array.from({ length: count }, (_, i) => ({
      id: `output-${Date.now()}-${i}`,
      type: 'outputNode',
      position: { x: outX, y: outStartY + i * 320 },
      data: { label: `Output ${outCount + i + 1}`, slideNumber: outCount + i + 1, isLoading: false, imageUrl: '' },
    }));

    const slides: CarouselSlide[] = outputNodes.map((on, i) => ({
      id: `cs-${Date.now()}-${i}`,
      prompt: '',
      outputNodeId: on.id,
    }));

    const carouselNode: Node = {
      id: cid, type: 'carouselNode',
      position: carouselPos,
      data: { label: 'Carousel', slides },
    };

    const newEdges = outputNodes.map(on => mkEdge(`e-${cid}-${on.id}`, cid, on.id));
    const autoEdges = nodesRef.current
      .filter(n => n.type === 'settingNode' || n.type === 'uploadNode' || n.type === 'modelCreationNode')
      .filter(n => !edgesRef.current.some(e => e.source === n.id && e.target === cid))
      .map(n => mkEdge(`e-auto-${n.id}-${cid}`, n.id, cid));
    setNodes(nds => [...nds, carouselNode, ...outputNodes]);
    setEdges(eds => [...eds, ...newEdges, ...autoEdges]);
    setCarouselPicker({ visible: false, count: 6 });
  };

  // ── Batch UI helpers ─────────────────────────────────────────────────────
  const getBatchJobStatus = (batchId: string): 'polling' | 'error' | 'completed' | null => {
    const batchJobs = jobs.filter(j => j.batchId === batchId);
    if (batchJobs.some(j => j.status === 'polling'))                      return 'polling';
    if (batchJobs.some(j => j.status === 'error'     && !j.seen))         return 'error';
    if (batchJobs.some(j => j.status === 'completed' && !j.seen))         return 'completed';
    return null;
  };

  const handleSwitchBatch = (id: string) => {
    saveCurrentBatch(nodes, edges);
    switchBatch(id, nodes, edges);
    setSelectedNodeId(null);
    markBatchSeen(id);
  };
  const handleNewBatch = () => {
    const name = newBatchName.trim() || `Batch ${batches.length + 1}`;
    newBatch(name, nodes, edges);
    setNewBatchName('');
    setShowBatchTypeMenu(false);
  };
  const handleNewAutomatedBatch = () => {
    const name = `Auto Batch ${batches.length + 1}`;
    newAutomatedBatch(name, nodes, edges);
    setNewBatchName('');
    setShowBatchTypeMenu(false);
  };

  // ── Welcome dialog actions ────────────────────────────────────────────────
  const handleWelcomeOpenBatch = (id: string) => {
    handleSwitchBatch(id);
    setShowWelcome(false);
  };
  const handleWelcomeNewBatch = () => {
    const name = `Batch ${batches.length + 1}`;
    newBatch(name, nodes, edges);
    setShowWelcome(false);
  };
  const handleWelcomeNewAutomated = (slideCount: number) => {
    // Create the automated batch then immediately pre-add a carousel node
    const name = `Auto Batch ${batches.length + 1}`;
    newAutomatedBatch(name, nodes, edges);
    setShowWelcome(false);
    // Trigger the carousel node creation after the batch is switched
    setTimeout(() => createCarouselNode(slideCount), 50);
  };

  // ── Right sidebar content (context-sensitive) ────────────────────────────
  const settingsOf = (selectedNode?.data as { settings?: NodeSettings })?.settings ?? {};
  const effectiveSidebarProvider = (settingsOf.providerOverride as string | undefined) ?? activeProvider;

  const setSetting = (key: keyof NodeSettings, val: unknown) => {
    if (!selectedNodeId) return;
    onUpdateSettings(selectedNodeId, { [key]: val });
  };

  // Exposed to Chat + Automate so the agent can mutate the canvas.
  const canvasAccess = useCanvasAccess({
    nodes,
    edges,
    setNodes: setNodes as (updater: (prev: unknown[]) => unknown[]) => void,
    setEdges: setEdges as (updater: (prev: unknown[]) => unknown[]) => void,
    studio: studioCtx,
  });

  return (
    <StudioContext.Provider value={studioCtx}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--studio-bg)', color: 'var(--studio-text)', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <header style={{ height: 50, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', background: 'var(--studio-surface)', borderBottom: '1px solid var(--studio-border)', zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #7C3AED, #0D9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, color: '#fff' }}>iS</div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--studio-text)' }}>iSupply AI Studio</span>
            <span style={{ fontSize: 9, color: 'var(--studio-text-muted)', background: 'var(--studio-elevated)', padding: '2px 7px', borderRadius: 20, border: '1px solid var(--studio-border)' }}>Beta</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--studio-text-sec)' }}>
            {activeProvider === 'ecco' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: eccoCredits !== null && eccoCredits < 2 ? '#F59E0B' : 'var(--studio-text-sec)' }}>
                {eccoCredits !== null && eccoCredits < 2 && <span title="Low credits">⚠</span>}
                {eccoCredits !== null
                  ? `${eccoCredits < 2 ? 'Low credits' : 'Credits'}: $${eccoCredits.toFixed(2)}`
                  : 'Credits: —'}
              </span>
            )}
            {/* Provider dropdown */}
            {(() => {
              type ProviderEntry = { value: 'gemini' | 'ecco' | 'pudding' | 'openai' | 'pudding-openai' | 'ithink-openai' | 'grsai'; label: string; short: string; color: string; group: string };
              const PROVIDERS: ProviderEntry[] = [
                { value: 'gemini',  label: 'Gemini (Direct)',  short: 'Gemini',  color: '#0D9488', group: 'Gemini' },
                { value: 'ecco',    label: 'EccoAPI (Gemini)', short: 'EccoAPI', color: '#A78BFA', group: 'Gemini' },
                { value: 'pudding', label: 'Pudding (Gemini)', short: 'Pudding', color: '#FB923C', group: 'Gemini' },
                { value: 'openai',  label: 'OpenAI (Direct)',  short: 'OpenAI',  color: '#10B981', group: 'OpenAI' },
                { value: 'pudding-openai', label: 'Pudding (OpenAI)', short: 'Pudding-AI', color: '#F59E0B', group: 'OpenAI' },
                { value: 'ithink-openai',  label: 'iThink (OpenAI)',  short: 'iThink-AI',  color: '#06B6D4', group: 'OpenAI' },
                { value: 'grsai',          label: 'GrsAI (OpenAI)',   short: 'GrsAI',      color: '#8B5CF6', group: 'OpenAI' },
              ];
              const current = PROVIDERS.find(p => p.value === activeProvider) ?? PROVIDERS[0];
              return (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowProviderMenu(v => !v)}
                    title="Switch API provider"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                      border: `1px solid ${current.color}44`,
                      background: `${current.color}11`,
                      color: current.color,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: current.color, display: 'inline-block' }} />
                    {current.short}
                    <span style={{ fontSize: 8, opacity: 0.7 }}>{showProviderMenu ? '▲' : '▼'}</span>
                  </button>
                  {showProviderMenu && (
                    <>
                      <div onClick={() => setShowProviderMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                        background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)',
                        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        zIndex: 1000, minWidth: 170, overflow: 'hidden',
                      }}>
                        {(['Gemini', 'OpenAI'] as const).map(group => (
                          <div key={group}>
                            <div style={{ padding: '7px 10px 3px', fontSize: 9, color: 'var(--studio-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                              {group}
                            </div>
                            {PROVIDERS.filter(p => p.group === group).map(p => (
                              <button key={p.value}
                                onClick={() => { setActiveProvider(p.value); localStorage.setItem('isupply-provider', p.value); setShowProviderMenu(false); }}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                                  padding: '7px 10px', border: 'none', cursor: 'pointer', fontSize: 11,
                                  background: p.value === activeProvider ? `${p.color}18` : 'transparent',
                                  color: p.value === activeProvider ? p.color : 'var(--studio-text-sec)',
                                  fontWeight: p.value === activeProvider ? 600 : 400,
                                  textAlign: 'left',
                                }}
                                onMouseEnter={e => { if (p.value !== activeProvider) e.currentTarget.style.background = 'var(--studio-surface)'; }}
                                onMouseLeave={e => { if (p.value !== activeProvider) e.currentTarget.style.background = 'transparent'; }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
                                {p.label}
                                {p.value === activeProvider && <span style={{ marginLeft: 'auto', fontSize: 9 }}>✓</span>}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <span>Active batch:</span>
            <span style={{ color: 'var(--studio-text)', fontWeight: 600 }}>{activeBatch?.name}</span>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
              style={{
                width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--studio-border)', background: 'var(--studio-elevated)',
                color: 'var(--studio-text-sec)', fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </header>

        {/* ── Main row ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── Left panel ── */}
          <aside style={{ width: leftSidebarOpen ? 230 : 36, flexShrink: 0, background: 'var(--studio-surface)', borderRight: '1px solid var(--studio-border)', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', overflow: 'hidden' }}>
            {/* Collapse toggle */}
            <button
              onClick={() => setLeftSidebarOpen(v => !v)}
              title={leftSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              style={{
                flexShrink: 0, height: 36, border: 'none', borderBottom: '1px solid var(--studio-border)',
                background: 'var(--studio-surface)', color: 'var(--studio-text-muted)', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: leftSidebarOpen ? 'flex-end' : 'center',
                paddingRight: leftSidebarOpen ? 10 : 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--studio-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--studio-text-muted)'; }}
            >
              {leftSidebarOpen ? '‹' : '›'}
            </button>

            {/* Tabs */}
            {leftSidebarOpen && <div style={{ display: 'flex', borderBottom: '1px solid var(--studio-border)', flexShrink: 0 }}>
              {(['batches', 'assets', 'library'] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab)}
                  style={{ flex: 1, padding: '9px 4px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', textTransform: 'capitalize', background: leftTab === tab ? 'var(--studio-elevated)' : 'transparent', color: leftTab === tab ? 'var(--studio-text)' : 'var(--studio-text-muted)', borderBottom: leftTab === tab ? '2px solid #7C3AED' : '2px solid transparent' }}>
                  {tab === 'library' ? 'Library' : tab === 'assets' ? 'Assets' : 'Batches'}
                </button>
              ))}
            </div>}

            {leftSidebarOpen && <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>

              {/* ── Batches tab ── */}
              {leftTab === 'batches' && (
                <>
                  {/* New batch with dropdown */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <input value={newBatchName} onChange={e => setNewBatchName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleNewBatch()}
                        placeholder="Batch name…"
                        style={{ flex: 1, background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', minWidth: 0 }} />
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                          onClick={() => setShowBatchTypeMenu(v => !v)}
                          style={{ padding: '5px 10px', background: 'var(--studio-accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          + ▾
                        </button>
                        {showBatchTypeMenu && (
                          <>
                            <div onClick={() => setShowBatchTypeMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 8, overflow: 'hidden', zIndex: 51, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                              <button onClick={handleNewBatch}
                                style={{ display: 'block', width: '100%', padding: '8px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', color: 'var(--studio-text)', cursor: 'pointer', borderBottom: '1px solid var(--studio-border)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--studio-surface)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                ✦ Create Batch
                              </button>
                              <button onClick={handleNewAutomatedBatch}
                                style={{ display: 'block', width: '100%', padding: '8px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', color: '#A78BFA', cursor: 'pointer' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--studio-surface)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                ⚡ Create Automated Batch
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {batches.map(b => (
                    <div key={b.id} onClick={() => handleSwitchBatch(b.id)}
                      style={{ background: b.id === activeBatchId ? 'var(--studio-elevated)' : 'transparent', border: `1px solid ${b.id === activeBatchId ? 'color-mix(in srgb, var(--studio-accent) 27%, transparent)' : 'var(--studio-border)'}`, borderRadius: 8, padding: '8px 10px', marginBottom: 5, cursor: 'pointer', transition: 'all 0.15s' }}>
                      {renamingId === b.id ? (
                        <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => { renameBatch(b.id, renameVal.trim() || b.name); setRenamingId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { renameBatch(b.id, renameVal.trim() || b.name); setRenamingId(null); } }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', background: 'var(--studio-surface)', border: '1px solid #7C3AED', borderRadius: 4, padding: '2px 6px', color: 'var(--studio-text)', fontSize: 11, outline: 'none' }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {/* Batch job status dot (EccoAPI background generation) */}
                          {(() => {
                            const st = getBatchJobStatus(b.id);
                            if (!st) return null;
                            const dotColor = st === 'polling' ? '#F59E0B' : st === 'error' ? '#F43F5E' : '#10B981';
                            return (
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, boxShadow: `0 0 4px ${dotColor}`, flexShrink: 0, animation: st === 'polling' ? 'pulse 1s infinite' : 'none' }} title={st === 'polling' ? 'Generating…' : st === 'error' ? 'Error' : 'Done'} />
                            );
                          })()}
                          <span style={{ flex: 1, fontSize: 11, color: b.id === activeBatchId ? 'var(--studio-text)' : 'var(--studio-text-sec)', fontWeight: b.id === activeBatchId ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                          <button onClick={e => { e.stopPropagation(); setRenamingId(b.id); setRenameVal(b.name); }} style={{ background: 'none', border: 'none', color: 'var(--studio-text-muted)', cursor: 'pointer', padding: '0 2px', fontSize: 11 }} title="Rename">✎</button>
                          {batches.length > 1 && (
                            <button onClick={e => { e.stopPropagation(); deleteBatch(b.id, nodes, edges); }} style={{ background: 'none', border: 'none', color: 'var(--studio-text-muted)', cursor: 'pointer', padding: '0 2px', fontSize: 11 }} title="Delete">✕</button>
                          )}
                        </div>
                      )}
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 3 }}>{new Date(b.createdAt).toLocaleDateString()} · {b.generatedImages.length} images</p>
                    </div>
                  ))}
                </>
              )}

              {/* ── Assets tab ── */}
              {leftTab === 'assets' && (
                assetsList.length === 0
                  ? <p style={{ fontSize: 11, color: 'var(--studio-text-muted)', lineHeight: 1.6 }}>No saved reference images yet. Upload one using an Image Reference node.</p>
                  : assetsList.map(a => (
                      <div key={a.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify(a)); e.dataTransfer.effectAllowed = 'copy'; }}
                        onClick={() => handleSelectAsset(a.id)}
                        style={{ background: selectedAssetId === a.id ? '#1E1E2A' : 'var(--studio-elevated)', border: `1px solid ${selectedAssetId === a.id ? 'color-mix(in srgb, var(--studio-accent) 53%, transparent)' : '#0D948840'}`, borderRadius: 8, padding: 8, marginBottom: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                        <div style={{ position: 'relative', marginBottom: 5 }}>
                          <img src={a.url} alt={a.name} draggable={false} style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 5, display: 'block' }} />
                          {/* Open / Remove overlay */}
                          <div
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                            style={{ position: 'absolute', inset: 0, borderRadius: 5, background: 'rgba(10,10,11,0.82)', display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                          >
                            <button onClick={e => { e.stopPropagation(); openSingleImage(a.url); }}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: 'none', background: 'var(--studio-accent)', color: '#fff', cursor: 'pointer' }}>
                              Open
                            </button>
                            <button onClick={e => { e.stopPropagation(); handleRemoveAsset(a.id); }}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: 'none', background: '#F43F5E', color: '#fff', cursor: 'pointer' }}>
                              Remove
                            </button>
                          </div>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--studio-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {a.tags.map(t => (
                            <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 20, background: '#0D948818', color: '#0D9488', border: '1px solid #0D948840' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    ))
              )}

              {/* ── Image Library tab ── */}
              {leftTab === 'library' && (
                <>
                  {/* Sub-tabs: Local / Hosted */}
                  <div style={{ display: 'flex', marginBottom: 10, borderBottom: '1px solid var(--studio-border)' }}>
                    {(['local', 'hosted'] as const).map(sub => (
                      <button key={sub} onClick={() => setLibrarySubTab(sub)}
                        style={{ flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', background: 'transparent', color: librarySubTab === sub ? 'var(--studio-text)' : 'var(--studio-text-muted)', borderBottom: librarySubTab === sub ? '2px solid #0D9488' : '2px solid transparent', textTransform: 'capitalize' }}>
                        {sub === 'hosted' ? '☁ Hosted' : '⬡ Local'}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const filtered = libraryImages.filter(img =>
                      librarySubTab === 'hosted' ? img.source === 'supabase' : img.source !== 'supabase'
                    );
                    if (filtered.length === 0) return (
                      <p style={{ fontSize: 11, color: 'var(--studio-text-muted)', lineHeight: 1.6 }}>
                        {librarySubTab === 'hosted'
                          ? 'No hosted images yet. Use ☁ Supabase to upload generated images.'
                          : 'Generated images appear here. Click ⊕ on any output node to save.'}
                      </p>
                    );
                    return filtered.map(img => (
                      <div key={img.id}
                        onClick={() => {
                          setSelectedLibImgId(img.id);
                          setSelectedNodeId(null);
                          setSelectedNodeType(null);
                          setSelectedAssetId(null);
                          setModalGallery({
                            items: filtered.map(i => ({ url: librarySubTab === 'hosted' && (i as typeof img).supabaseUrl ? (i as typeof img).supabaseUrl! : i.url, id: i.id, name: i.prompt?.slice(0, 40) })),
                            index: filtered.findIndex(i => i.id === img.id),
                          });
                        }}
                        style={{ marginBottom: 8, cursor: 'pointer', borderRadius: 8, border: `1px solid ${selectedLibImgId === img.id ? 'color-mix(in srgb, var(--studio-accent) 53%, transparent)' : 'transparent'}`, padding: 4 }}>
                        <div style={{ position: 'relative' }}>
                          <img src={librarySubTab === 'hosted' && img.supabaseUrl ? img.supabaseUrl : img.url} alt="generated" style={{ width: '100%', borderRadius: 5, display: 'block' }} />
                          {librarySubTab === 'hosted' && (
                            <span style={{ position: 'absolute', top: 4, right: 4, fontSize: 8, padding: '2px 5px', borderRadius: 10, background: '#0D948888', color: '#fff', fontWeight: 700 }}>☁</span>
                          )}
                          <div
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                            style={{ position: 'absolute', inset: 0, borderRadius: 5, background: 'rgba(10,10,11,0.82)', display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                          >
                            <button onClick={e => { e.stopPropagation(); openSingleImage(librarySubTab === 'hosted' && img.supabaseUrl ? img.supabaseUrl : img.url); }}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: 'none', background: 'var(--studio-accent)', color: '#fff', cursor: 'pointer' }}>
                              Open
                            </button>
                            <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(img.prompt); }}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: 'none', background: '#0D9488', color: '#fff', cursor: 'pointer' }}>
                              Copy
                            </button>
                            <button onClick={e => { e.stopPropagation(); removeFromGlobalLibrary(img.id); if (selectedLibImgId === img.id) setSelectedLibImgId(null); }}
                              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: 'none', background: '#F43F5E', color: '#fff', cursor: 'pointer' }}>
                              Remove
                            </button>
                          </div>
                        </div>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.prompt.slice(0, 55)}{img.prompt.length > 55 ? '…' : ''}</p>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)' }}>{new Date(img.createdAt).toLocaleString()}</p>
                      </div>
                    ));
                  })()}
                </>
              )}
            </div>}
          </aside>

          {/* ── Canvas area ── */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'var(--studio-surface)', borderBottom: '1px solid var(--studio-border)', flexWrap: 'wrap' }}>
              <TB onClick={addUploadNode}>+ Image Reference</TB>
              <TB onClick={addPromptNode}>+ Image Prompt</TB>
              <Div />
              <TB onClick={addCarouselSlide} accent>+ Carousel Slide</TB>
              <TB
                onClick={() => setLockCarouselNodes(v => !v)}
                title={lockCarouselNodes ? 'Unlock carousel nodes' : 'Lock carousel nodes (move together)'}
                accent={lockCarouselNodes}
              >
                {lockCarouselNodes ? '⛓ Locked' : '⛓ Lock'}
              </TB>
              <Div />
              <AutomateButton variant="toolbar" onClick={() => { setChatOpen(true); setChatAutomateMode(true); }} />
              <Div />
              <TB onClick={addModelNode} coral>+ Model</TB>
              <TB onClick={addSettingNode} accent>+ Setting</TB>
              <Div />
              <TB onClick={handleExportCanvas}>{isExporting ? 'Exporting…' : '↓ PNG'}</TB>
              {libraryImages.length > 0 && <TB onClick={handleDownloadAll}>↓ ZIP</TB>}
              {(activeBatch?.generatedImages?.length ?? 0) > 0 && (
                <TB onClick={handleExportToSupabase} title="Upload batch images to Supabase Storage">
                  {isExportingSupabase ? 'Uploading…' : '☁ Supabase'}
                </TB>
              )}
              {activeBatch?.batchType === 'automated' && (
                <span style={{ fontSize: 9, color: 'var(--studio-accent)', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'color-mix(in srgb, var(--studio-accent) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--studio-accent) 27%, transparent)', marginLeft: 4 }}>
                  ⚡ Automated
                </span>
              )}
            </div>

            {/* React Flow canvas — wrapped in ErrorBoundary so a broken node doesn't crash the studio */}
            <div style={{ flex: 1, width: '100%' }}>
              <ErrorBoundary>
                <ReactFlow
                  nodes={nodes} edges={edges}
                  onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                  onPaneClick={onPaneClick} onNodeContextMenu={onNodeContextMenu}
                  nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                  fitView fitViewOptions={{ padding: 0.15 }}
                  minZoom={0.05} maxZoom={8}
                  connectionRadius={60}
                  attributionPosition="bottom-right"
                >
                  <Background variant={BackgroundVariant.Dots} color="var(--studio-dot)" gap={24} size={1} />
                  <Controls />
                  <MiniMap nodeColor={() => 'var(--studio-accent)'} maskColor="var(--studio-minimap-mask)" />
                </ReactFlow>
              </ErrorBoundary>
            </div>

            {/* Carousel count picker modal */}
            {carouselPicker.visible && (
              <div onClick={() => setCarouselPicker(p => ({ ...p, visible: false }))}
                style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                <div onClick={e => e.stopPropagation()}
                  style={{ background: 'var(--studio-surface)', border: '1px solid var(--studio-border)', borderRadius: 14, padding: 28, width: 360, boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--studio-text)', marginBottom: 6 }}>How many slides?</p>
                  <p style={{ fontSize: 11, color: 'var(--studio-text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
                    Creates a single carousel node with {carouselPicker.count} prompt slots and {carouselPicker.count} connected output nodes.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                    <button onClick={() => setCarouselPicker(p => ({ ...p, count: Math.max(2, p.count - 1) }))}
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--studio-border)', background: 'var(--studio-elevated)', color: 'var(--studio-text-sec)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <span style={{ fontSize: 38, fontWeight: 800, color: 'var(--studio-accent)' }}>{carouselPicker.count}</span>
                      <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', margin: 0 }}>slides</p>
                    </div>
                    <button onClick={() => setCarouselPicker(p => ({ ...p, count: Math.min(20, p.count + 1) }))}
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--studio-border)', background: 'var(--studio-elevated)', color: 'var(--studio-text-sec)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 18, flexWrap: 'wrap' }}>
                    {[3, 4, 5, 6, 8, 10, 12].map(n => (
                      <button key={n} onClick={() => setCarouselPicker(p => ({ ...p, count: n }))}
                        style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${carouselPicker.count === n ? 'var(--studio-accent)' : 'var(--studio-border)'}`, background: carouselPicker.count === n ? 'var(--studio-accent)' : 'var(--studio-elevated)', color: carouselPicker.count === n ? '#fff' : 'var(--studio-text-sec)' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setCarouselPicker(p => ({ ...p, visible: false }))}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--studio-border)', background: 'var(--studio-elevated)', color: 'var(--studio-text-sec)', fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={() => createCarouselNode(carouselPicker.count)}
                      style={{ flex: 2, padding: '9px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7C3AED, #0D9488)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ⚡ Create {carouselPicker.count}-Slide Carousel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* ── Right panel (context-sensitive) ── */}
          <aside style={{ width: 250, flexShrink: 0, background: 'var(--studio-surface)', borderLeft: '1px solid var(--studio-border)', overflowY: 'auto', padding: 14 }}>

            {/* ── Asset editor ── */}
            {selectedAssetId && leftTab === 'assets' && (() => {
              const asset = assetsList.find(a => a.id === selectedAssetId);
              if (!asset) return null;
              return (
                <>
                  <SideLabel>Reference Image</SideLabel>
                  <img src={asset.url} alt={asset.name} style={{ width: '100%', borderRadius: 7, marginBottom: 10, display: 'block' }} />
                  <Sec label="Name">
                    <input value={editAssetName} onChange={e => setEditAssetName(e.target.value)}
                      style={{ width: '100%', background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  </Sec>
                  <Sec label="Tags (comma-separated)">
                    <textarea rows={3} value={editAssetTags} onChange={e => setEditAssetTags(e.target.value)}
                      placeholder="earbuds, white, pro-2, stem-style"
                      style={{ width: '100%', background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
                      {editAssetTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).map(t => (
                        <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 20, background: '#0D948818', color: '#0D9488', border: '1px solid #0D948840' }}>{t}</span>
                      ))}
                    </div>
                  </Sec>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                    <button onClick={handleSaveAsset} disabled={isSavingAsset}
                      style={{ flex: 1, padding: '6px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', background: isSavingAsset ? 'var(--studio-border)' : 'linear-gradient(135deg,#7C3AED,#0D9488)', color: isSavingAsset ? 'var(--studio-text-muted)' : '#fff', cursor: isSavingAsset ? 'not-allowed' : 'pointer' }}>
                      {isSavingAsset ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => openSingleImage(asset.url)}
                      style={{ flex: 1, padding: '6px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--studio-accent) 27%, transparent)', background: 'color-mix(in srgb, var(--studio-accent) 7%, transparent)', color: 'var(--studio-accent)', cursor: 'pointer' }}>
                      Open Image
                    </button>
                    <button onClick={() => handleRemoveAsset(asset.id)}
                      style={{ flex: 1, padding: '6px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: '1px solid #F43F5E44', background: '#F43F5E11', color: '#F43F5E', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                </>
              );
            })()}

            {/* ── Library image viewer ── */}
            {selectedLibImgId && leftTab === 'library' && (() => {
              const img = libraryImages.find(i => i.id === selectedLibImgId);
              if (!img) return null;
              return (
                <>
                  <SideLabel>Generated Image</SideLabel>
                  <img src={img.url} alt="generated" style={{ width: '100%', borderRadius: 7, marginBottom: 10, display: 'block' }} />
                  <Sec label="Prompt">
                    <p style={{ fontSize: 10, color: 'var(--studio-text-sec)', lineHeight: 1.6 }}>{img.prompt}</p>
                  </Sec>
                  <Sec label="Created">
                    <p style={{ fontSize: 10, color: 'var(--studio-text-muted)' }}>{new Date(img.createdAt).toLocaleString()}</p>
                  </Sec>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => openSingleImage(img.url)}
                      style={{ flex: 1, padding: '6px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--studio-accent) 27%, transparent)', background: 'color-mix(in srgb, var(--studio-accent) 7%, transparent)', color: 'var(--studio-accent)', cursor: 'pointer' }}>
                      Open Image
                    </button>
                    <button onClick={() => { removeFromGlobalLibrary(img.id); setSelectedLibImgId(null); }}
                      style={{ flex: 1, padding: '6px', fontSize: 10, fontWeight: 600, borderRadius: 6, border: '1px solid #F43F5E44', background: '#F43F5E11', color: '#F43F5E', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                </>
              );
            })()}

            {/* ── Node settings (only when no asset/library item is selected) ── */}
            {!selectedAssetId && !selectedLibImgId && !selectedNodeId && <GlobalSettings activeProvider={activeProvider} />}

            {!selectedAssetId && !selectedLibImgId && selectedNodeType === 'uploadNode' && (
              <>
                <SideLabel>Image Reference Settings</SideLabel>
                <Sec label="Node">
                  <p style={{ fontSize: 11, color: 'var(--studio-text-sec)' }}>
                    {(selectedNode?.data as { savedImage?: SavedImage })?.savedImage
                      ? `Saved as "${(selectedNode?.data as { savedImage: SavedImage }).savedImage.name}"`
                      : 'Not saved yet'}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', marginTop: 5 }}>Upload the image on the node, add tags that describe the product (e.g. earbuds, white, pro-2), then click Save Reference.</p>
                </Sec>
                <Sec label="Tag Tips">
                  <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', lineHeight: 1.6 }}>Tags are matched against prompt text. Use descriptive single words: <span style={{ color: '#0D9488' }}>earbuds, white, charging-case, red, stem-style</span></p>
                </Sec>
              </>
            )}

            {!selectedAssetId && !selectedLibImgId && selectedNodeType === 'promptNode' && (
              <>
                <SideLabel>Image Prompt Settings</SideLabel>
                {(effectiveSidebarProvider !== 'openai' && effectiveSidebarProvider !== 'pudding-openai' && effectiveSidebarProvider !== 'ithink-openai' && effectiveSidebarProvider !== 'grsai') && <>
                <Sec label="⚡ Paste API Config">
                  <textarea
                    rows={4}
                    placeholder={'Paste Agent 5 output here:\n{ "temperature": 1.0, "top_k": 40,\n  "seed": 67, "top_p": 0.97 }'}
                    onPaste={e => {
                      const text = e.clipboardData.getData('text');
                      const temp = (() => { const m = /temperature["']?\s*:\s*([\d.]+)/i.exec(text); return m ? parseFloat(m[1]) : undefined; })();
                      const topP = (() => { const m = /top[_\s-]?p["']?\s*:\s*([\d.]+)/i.exec(text); return m ? parseFloat(m[1]) : undefined; })();
                      const topK = (() => { const m = /top[_\s-]?k["']?\s*:\s*([\d.]+)/i.exec(text); return m ? Math.round(parseFloat(m[1])) : undefined; })();
                      const seed = (() => { const m = /seed["']?\s*:\s*([\d]+)/i.exec(text); return m ? parseInt(m[1], 10) : undefined; })();
                      const modelM = /"?model"?\s*:\s*["']?([^"',}\s]+)["']?/i.exec(text);
                      const model = modelM?.[1]?.includes('pro') ? 'Pro' : modelM?.[1]?.includes('standard') ? 'Standard' : modelM?.[1] ? 'Flash' : undefined;
                      if (temp  !== undefined) setSetting('temperature', temp);
                      if (topP  !== undefined) setSetting('topP', topP);
                      if (topK  !== undefined) setSetting('topK', topK);
                      if (seed  !== undefined) setSetting('seed', seed);
                      if (model !== undefined) setSetting('model', model);
                    }}
                    style={{
                      width: '100%', background: '#0D0D0F', border: '1px solid #0D948844',
                      borderRadius: 6, padding: '6px 8px', color: 'var(--studio-text-sec)', fontSize: 10,
                      outline: 'none', resize: 'none', boxSizing: 'border-box',
                      fontFamily: 'monospace', lineHeight: 1.5,
                    }}
                  />
                  <p style={{ fontSize: 9, color: '#0D9488', marginTop: 4 }}>Paste the JSON block from Agent 5 — temperature, top_p, top_k, seed, model auto-fill instantly</p>
                </Sec>
                <Sec label={`Temperature — ${(settingsOf.temperature ?? 1.0).toFixed(1)}`}>
                  <SliderRow value={settingsOf.temperature ?? 1.0} min={0} max={2} step={0.05} onChange={v => setSetting('temperature', v)} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Google recommends 1.0 for image models — lower values degrade reference adherence</p>
                </Sec>
                <Sec label={`Guidance Scale — ${settingsOf.guidanceScale ?? 7}`}>
                  <SliderRow value={settingsOf.guidanceScale ?? 7} min={1} max={15} step={1} onChange={v => setSetting('guidanceScale', v)} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Higher = follows prompt more strictly</p>
                </Sec>
                <Sec label="Safety Threshold">
                  <Chips opts={['Off', 'Low Block', 'Medium', 'High Block']} value={
                    settingsOf.safetyThreshold === 'BLOCK_NONE'          ? 'Off' :
                    settingsOf.safetyThreshold === 'BLOCK_ONLY_HIGH'     ? 'Low Block' :
                    settingsOf.safetyThreshold === 'BLOCK_LOW_AND_ABOVE' ? 'High Block' : 'Medium'
                  } onChange={v => setSetting('safetyThreshold',
                    v === 'Off'        ? 'BLOCK_NONE' :
                    v === 'Low Block'  ? 'BLOCK_ONLY_HIGH' :
                    v === 'High Block' ? 'BLOCK_LOW_AND_ABOVE' :
                                        'BLOCK_MEDIUM_AND_ABOVE'
                  )} cols={2} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Lower = fewer false-positive blocks on safe product images</p>
                </Sec>
                <Sec label="Thinking Mode">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input type="checkbox" checked={settingsOf.includeThoughts !== false} onChange={e => setSetting('includeThoughts', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                    <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable (improves reference adherence)</span>
                  </label>
                </Sec>
                <Sec label="Media Resolution">
                  <Chips opts={['High', 'Medium', 'Low']} value={
                    settingsOf.mediaResolution === 'media_resolution_low'    ? 'Low' :
                    settingsOf.mediaResolution === 'media_resolution_medium' ? 'Medium' : 'High'
                  } onChange={v => setSetting('mediaResolution',
                    v === 'Low' ? 'media_resolution_low' : v === 'Medium' ? 'media_resolution_medium' : 'media_resolution_high'
                  )} cols={3} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>High = more input tokens for reference image details</p>
                </Sec>
                <Sec label="Seed (empty = random)">
                  <input type="number" min={0} step={1} placeholder="e.g. 42" value={settingsOf.seed ?? ''} onChange={e => setSetting('seed', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                    style={{ width: '100%', background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Variants: +1 minor pose, +2 hair/wind, +7 background, +13 lighting</p>
                </Sec>
                <Sec label="Negative Prompt">
                  <textarea rows={3} value={settingsOf.negativePrompt ?? ''} onChange={e => setSetting('negativePrompt', e.target.value)}
                    placeholder="blur, noise, artifacts, low quality…"
                    style={{ width: '100%', background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
                </Sec>
                </>}
                {(effectiveSidebarProvider === 'openai' || effectiveSidebarProvider === 'pudding-openai' || effectiveSidebarProvider === 'ithink-openai' || effectiveSidebarProvider === 'grsai') ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['gpt-image-2', 'gpt-image-1']} value={settingsOf.model ?? 'gpt-image-2'} onChange={v => setSetting('model', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 = latest · flexible sizes up to 4K · no transparent bg</p>
                    </Sec>
                    <Sec label="Quality">
                      <Chips opts={['Low', 'Medium', 'High']} value={
                        settingsOf.quality === 'low' ? 'Low' : settingsOf.quality === 'high' ? 'High' : 'Medium'
                      } onChange={v => setSetting('quality', v.toLowerCase() as 'low' | 'medium' | 'high')} cols={3} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Low = $0.006 · Medium = $0.053 · High = $0.211 per image</p>
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['auto', '1024×1024', '1536×1024', '1024×1536', '2048×1152', '3840×2160']} value={settingsOf.size ?? 'auto'} onChange={v => setSetting('size', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>auto = model decides · gpt-image-2 supports up to 4K flexible sizes</p>
                    </Sec>
                    <Sec label="Output Format">
                      <Chips opts={['PNG', 'JPEG', 'WebP']} value={(settingsOf.output_format ?? 'png').toUpperCase()} onChange={v => setSetting('output_format', v.toLowerCase())} cols={3} />
                    </Sec>
                    <Sec label="Background">
                      <Chips opts={['Auto', 'Opaque']} value={settingsOf.background === 'opaque' ? 'Opaque' : 'Auto'} onChange={v => setSetting('background', v === 'Opaque' ? 'opaque' : 'auto')} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 doesn't support transparent — Auto or Opaque only</p>
                    </Sec>
                    <Sec label="Moderation">
                      <Chips opts={['Auto', 'Low']} value={settingsOf.moderation === 'low' ? 'Low' : 'Auto'} onChange={v => setSetting('moderation', v.toLowerCase() as 'auto' | 'low')} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Auto = standard safety · Low = fewer false-positive refusals</p>
                    </Sec>
                    {effectiveSidebarProvider === 'pudding-openai' && (
                      <Sec label="Streaming Mode">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#10B981' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get 524 timeout errors</p>
                      </Sec>
                    )}
                  </>
                ) : effectiveSidebarProvider === 'ecco' ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['NanoBanana 3.1', 'NanaBanana Pro']} value={settingsOf.eccoModel === 'nanobananapro' ? 'NanaBanana Pro' : 'NanoBanana 3.1'} onChange={v => setSetting('eccoModel', v === 'NanaBanana Pro' ? 'nanobananapro' : 'nanobanana31')} cols={2} />
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['1K', '2K', '4K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={3} />
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                    <Sec label="Async Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useAsync ?? false} onChange={e => setSetting('useAsync', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use async queue (off = sync)</span>
                      </label>
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Sync mode (default) waits for the result directly — avoids model swapping and reference image stripping in async queues</p>
                    </Sec>
                  </>
                ) : effectiveSidebarProvider === 'pudding' ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['Flash', 'Pro']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Flash = Nano banana 2 · Pro = Nano banana pro</p>
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['1K', '2K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>PuddingAPI bills per resolution — 4K not available</p>
                    </Sec>
                    <Sec label="Streaming Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#FB923C' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                      </label>
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get 524 timeout errors — keeps Cloudflare connection alive during generation</p>
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                    {settingsOf.useGoogleSearch && (
                      <Sec label="Image Search">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useImageSearch ?? false} onChange={e => setSetting('useImageSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Include image results</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Returns image bytes from web search (Flash Image model only)</p>
                      </Sec>
                    )}
                  </>
                ) : (
                  <>
                    <Sec label="Model">
                      <Chips opts={['Flash', 'Pro', 'Standard']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={3} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Flash = gemini-3.1-flash-image-preview</p>
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['1K', '2K', '4K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={3} />
                    </Sec>
                    <Sec label={`Top-P — ${(settingsOf.topP ?? 1).toFixed(2)}`}>
                      <SliderRow value={settingsOf.topP ?? 1} min={0} max={1} step={0.01} onChange={v => setSetting('topP', v)} />
                    </Sec>
                    <Sec label={`Top-K — ${settingsOf.topK ?? 40}`}>
                      <SliderRow value={settingsOf.topK ?? 40} min={1} max={100} step={1} onChange={v => setSetting('topK', v)} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Vocabulary breadth — beach/lifestyle: 40 · studio: 30 · urban: 50</p>
                    </Sec>
                    <Sec label="Streaming Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#0D9488' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                      </label>
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get timeout errors — keeps the connection alive during long generations</p>
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                    {settingsOf.useGoogleSearch && (
                      <Sec label="Image Search">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useImageSearch ?? false} onChange={e => setSetting('useImageSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Include image results</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Returns image bytes from web search (Flash Image model only)</p>
                      </Sec>
                    )}
                  </>
                )}
                <Sec label="Generation Count">
                  <Chips opts={['1', '2', '3', '4']} value={String(settingsOf.count ?? 1)} onChange={v => setSetting('count', Number(v))} cols={4} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Creates extra output nodes as needed</p>
                </Sec>
                <Sec label="Provider Override">
                  <Chips
                    opts={['Inherit', 'Gemini', 'EccoAPI', 'Pudding', 'OpenAI']}
                    value={settingsOf.providerOverride === 'gemini' ? 'Gemini' : settingsOf.providerOverride === 'ecco' ? 'EccoAPI' : settingsOf.providerOverride === 'pudding' ? 'Pudding' : settingsOf.providerOverride === 'openai' ? 'OpenAI' : 'Inherit'}
                    onChange={v => setSetting('providerOverride', v === 'Inherit' ? undefined : v === 'EccoAPI' ? 'ecco' : v === 'OpenAI' ? 'openai' : v.toLowerCase() as 'gemini' | 'pudding')}
                    cols={2}
                  />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Force this node to use a specific provider — overrides the global toolbar toggle</p>
                </Sec>
                {/* Prompt history */}
                {(() => {
                  type H = { prompt: string; ts: string };
                  const history = (selectedNode?.data as { promptHistory?: H[] })?.promptHistory ?? [];
                  if (!history.length) return null;
                  return (
                    <Sec label="Generation History">
                      {history.map((h, i) => (
                        <div key={i} style={{ background: '#0D0D0F', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '6px 8px', marginBottom: 5 }}>
                          <p style={{ fontSize: 10, color: 'var(--studio-text-sec)', lineHeight: 1.5, marginBottom: 4 }}>{h.prompt.slice(0, 90)}{h.prompt.length > 90 ? '…' : ''}</p>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => navigator.clipboard.writeText(h.prompt.replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " ").trim())}
                              style={{ flex: 1, padding: '3px 0', fontSize: 9, fontWeight: 600, borderRadius: 4, border: '1px solid var(--studio-border)', background: 'var(--studio-elevated)', color: 'var(--studio-text-sec)', cursor: 'pointer' }}>
                              Copy
                            </button>
                            <p style={{ fontSize: 8, color: 'var(--studio-text-muted)', lineHeight: '22px', margin: 0 }}>{new Date(h.ts).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))}
                    </Sec>
                  );
                })()}
              </>
            )}

            {/* ── Carousel node settings (same as prompt but shows slide count info) ── */}
            {!selectedAssetId && !selectedLibImgId && selectedNodeType === 'carouselNode' && (() => {
              const slides = (selectedNode?.data as { slides?: CarouselSlide[] })?.slides ?? [];
              return (
                <>
                  <SideLabel>Carousel Settings</SideLabel>
                  <Sec label="Slides">
                    <p style={{ fontSize: 11, color: 'var(--studio-text-sec)' }}>{slides.length} slides · {slides.filter(s => s.prompt.trim()).length} filled</p>
                    <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', marginTop: 4, lineHeight: 1.5 }}>Settings below apply to all slides in this carousel.</p>
                  </Sec>
                  {(effectiveSidebarProvider !== 'openai' && effectiveSidebarProvider !== 'pudding-openai' && effectiveSidebarProvider !== 'ithink-openai' && effectiveSidebarProvider !== 'grsai') && <>
                  <Sec label="⚡ Paste API Config">
                    <textarea
                      rows={4}
                      placeholder={'Paste Agent 5 output here:\n{ "temperature": 1.0, "top_k": 40,\n  "seed": 67, "top_p": 0.97 }'}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        const temp = (() => { const m = /temperature["']?\s*:\s*([\d.]+)/i.exec(text); return m ? parseFloat(m[1]) : undefined; })();
                        const topP = (() => { const m = /top[_\s-]?p["']?\s*:\s*([\d.]+)/i.exec(text); return m ? parseFloat(m[1]) : undefined; })();
                        const topK = (() => { const m = /top[_\s-]?k["']?\s*:\s*([\d.]+)/i.exec(text); return m ? Math.round(parseFloat(m[1])) : undefined; })();
                        const seed = (() => { const m = /seed["']?\s*:\s*([\d]+)/i.exec(text); return m ? parseInt(m[1], 10) : undefined; })();
                        const modelM = /"?model"?\s*:\s*["']?([^"',}\s]+)["']?/i.exec(text);
                        const model = modelM?.[1]?.includes('pro') ? 'Pro' : modelM?.[1]?.includes('standard') ? 'Standard' : modelM?.[1] ? 'Flash' : undefined;
                        if (temp  !== undefined) setSetting('temperature', temp);
                        if (topP  !== undefined) setSetting('topP', topP);
                        if (topK  !== undefined) setSetting('topK', topK);
                        if (seed  !== undefined) setSetting('seed', seed);
                        if (model !== undefined) setSetting('model', model);
                      }}
                      style={{
                        width: '100%', background: '#0D0D0F', border: '1px solid #0D948844',
                        borderRadius: 6, padding: '6px 8px', color: 'var(--studio-text-sec)', fontSize: 10,
                        outline: 'none', resize: 'none', boxSizing: 'border-box',
                        fontFamily: 'monospace', lineHeight: 1.5,
                      }}
                    />
                    <p style={{ fontSize: 9, color: '#0D9488', marginTop: 4 }}>Paste the JSON block from Agent 5 — applies to all slides</p>
                  </Sec>
                  <Sec label={`Temperature — ${(settingsOf.temperature ?? 1.0).toFixed(1)}`}>
                    <SliderRow value={settingsOf.temperature ?? 1.0} min={0} max={2} step={0.05} onChange={v => setSetting('temperature', v)} />
                    <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Google recommends 1.0 for image models</p>
                  </Sec>
                  <Sec label={`Guidance Scale — ${settingsOf.guidanceScale ?? 7}`}>
                    <SliderRow value={settingsOf.guidanceScale ?? 7} min={1} max={15} step={1} onChange={v => setSetting('guidanceScale', v)} />
                  </Sec>
                  <Sec label="Safety Threshold">
                    <Chips opts={['Off', 'Low Block', 'Medium', 'High Block']} value={
                      settingsOf.safetyThreshold === 'BLOCK_NONE'          ? 'Off' :
                      settingsOf.safetyThreshold === 'BLOCK_ONLY_HIGH'     ? 'Low Block' :
                      settingsOf.safetyThreshold === 'BLOCK_LOW_AND_ABOVE' ? 'High Block' : 'Medium'
                    } onChange={v => setSetting('safetyThreshold',
                      v === 'Off'        ? 'BLOCK_NONE' :
                      v === 'Low Block'  ? 'BLOCK_ONLY_HIGH' :
                      v === 'High Block' ? 'BLOCK_LOW_AND_ABOVE' :
                                          'BLOCK_MEDIUM_AND_ABOVE'
                    )} cols={2} />
                    <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Lower = fewer false-positive blocks on safe product images</p>
                  </Sec>
                  <Sec label="Thinking Mode">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input type="checkbox" checked={settingsOf.includeThoughts !== false} onChange={e => setSetting('includeThoughts', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                      <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable (improves reference adherence)</span>
                    </label>
                  </Sec>
                  <Sec label="Media Resolution">
                    <Chips opts={['High', 'Medium', 'Low']} value={
                      settingsOf.mediaResolution === 'media_resolution_low'    ? 'Low' :
                      settingsOf.mediaResolution === 'media_resolution_medium' ? 'Medium' : 'High'
                    } onChange={v => setSetting('mediaResolution',
                      v === 'Low' ? 'media_resolution_low' : v === 'Medium' ? 'media_resolution_medium' : 'media_resolution_high'
                    )} cols={3} />
                    <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>High = more input tokens for reference image details</p>
                  </Sec>
                  <Sec label="Seed (one seed for all slides)">
                    <input type="number" min={0} step={1} placeholder="e.g. 42" value={settingsOf.seed ?? ''} onChange={e => setSetting('seed', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                      style={{ width: '100%', background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                    <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Same seed across all slides — thoughtSignature handles character consistency</p>
                  </Sec>
                  <Sec label="Negative Prompt">
                    <textarea rows={3} value={settingsOf.negativePrompt ?? ''} onChange={e => setSetting('negativePrompt', e.target.value)}
                      placeholder="blur, noise, artifacts…"
                      style={{ width: '100%', background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }} />
                  </Sec>
                  </>}
                  {(effectiveSidebarProvider === 'openai' || effectiveSidebarProvider === 'pudding-openai' || effectiveSidebarProvider === 'ithink-openai' || effectiveSidebarProvider === 'grsai') ? (
                    <>
                      <Sec label="Model">
                        <Chips opts={['gpt-image-2', 'gpt-image-1']} value={settingsOf.model ?? 'gpt-image-2'} onChange={v => setSetting('model', v)} cols={2} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 = latest · flexible sizes up to 4K · no transparent bg</p>
                      </Sec>
                      <Sec label="Quality">
                        <Chips opts={['Low', 'Medium', 'High']} value={
                          settingsOf.quality === 'low' ? 'Low' : settingsOf.quality === 'high' ? 'High' : 'Medium'
                        } onChange={v => setSetting('quality', v.toLowerCase() as 'low' | 'medium' | 'high')} cols={3} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Low = $0.006 · Medium = $0.053 · High = $0.211 per image</p>
                      </Sec>
                      <Sec label="Image Size">
                        <Chips opts={['auto', '1024×1024', '1536×1024', '1024×1536', '2048×1152', '3840×2160']} value={settingsOf.size ?? 'auto'} onChange={v => setSetting('size', v)} cols={2} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>auto = model decides · gpt-image-2 supports up to 4K flexible sizes</p>
                      </Sec>
                      <Sec label="Output Format">
                        <Chips opts={['PNG', 'JPEG', 'WebP']} value={(settingsOf.output_format ?? 'png').toUpperCase()} onChange={v => setSetting('output_format', v.toLowerCase())} cols={3} />
                      </Sec>
                      <Sec label="Background">
                        <Chips opts={['Auto', 'Opaque']} value={settingsOf.background === 'opaque' ? 'Opaque' : 'Auto'} onChange={v => setSetting('background', v === 'Opaque' ? 'opaque' : 'auto')} cols={2} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 doesn't support transparent — Auto or Opaque only</p>
                      </Sec>
                      <Sec label="Moderation">
                        <Chips opts={['Auto', 'Low']} value={settingsOf.moderation === 'low' ? 'Low' : 'Auto'} onChange={v => setSetting('moderation', v.toLowerCase() as 'auto' | 'low')} cols={2} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Auto = standard safety · Low = fewer false-positive refusals</p>
                      </Sec>
                    </>
                  ) : effectiveSidebarProvider === 'ecco' ? (
                    <>
                      <Sec label="Model">
                        <Chips opts={['NanoBanana 3.1', 'NanaBanana Pro']} value={settingsOf.eccoModel === 'nanobananapro' ? 'NanaBanana Pro' : 'NanoBanana 3.1'} onChange={v => setSetting('eccoModel', v === 'NanaBanana Pro' ? 'nanobananapro' : 'nanobanana31')} cols={2} />
                      </Sec>
                      <Sec label="Image Size">
                        <Chips opts={['1K', '2K', '4K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={3} />
                      </Sec>
                      <Sec label="Google Search Grounding">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                        </label>
                      </Sec>
                      <Sec label="Async Mode">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useAsync ?? false} onChange={e => setSetting('useAsync', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use async queue (off = sync)</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Sync mode (default) waits for the result directly — avoids model swapping and reference image stripping in async queues</p>
                      </Sec>
                    </>
                  ) : effectiveSidebarProvider === 'pudding' ? (
                    <>
                      <Sec label="Model">
                        <Chips opts={['Flash', 'Pro']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={2} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Flash = Nano banana 2 · Pro = Nano banana pro</p>
                      </Sec>
                      <Sec label="Image Size">
                        <Chips opts={['1K', '2K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={2} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>PuddingAPI bills per resolution — 4K not available</p>
                      </Sec>
                      <Sec label="Streaming Mode">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#FB923C' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get 524 timeout errors — keeps Cloudflare connection alive during generation</p>
                      </Sec>
                      <Sec label="Google Search Grounding">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                        </label>
                      </Sec>
                      {settingsOf.useGoogleSearch && (
                        <Sec label="Image Search">
                          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                            <input type="checkbox" checked={settingsOf.useImageSearch ?? false} onChange={e => setSetting('useImageSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                            <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Include image results</span>
                          </label>
                          <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Returns image bytes from web search (Flash Image model only)</p>
                        </Sec>
                      )}
                    </>
                  ) : (
                    <>
                      <Sec label="Model">
                        <Chips opts={['Flash', 'Pro', 'Standard']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={3} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Flash = gemini-3.1-flash-image-preview</p>
                      </Sec>
                      <Sec label="Image Size">
                        <Chips opts={['1K', '2K', '4K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={3} />
                      </Sec>
                      <Sec label={`Top-P — ${(settingsOf.topP ?? 1).toFixed(2)}`}>
                        <SliderRow value={settingsOf.topP ?? 1} min={0} max={1} step={0.01} onChange={v => setSetting('topP', v)} />
                      </Sec>
                      <Sec label={`Top-K — ${settingsOf.topK ?? 40}`}>
                        <SliderRow value={settingsOf.topK ?? 40} min={1} max={100} step={1} onChange={v => setSetting('topK', v)} />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Vocabulary breadth — beach/lifestyle: 40 · studio: 30 · urban: 50</p>
                      </Sec>
                      <Sec label="Streaming Mode">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#0D9488' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get timeout errors on slow carousel generations</p>
                      </Sec>
                      <Sec label="Google Search Grounding">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                        </label>
                      </Sec>
                      {settingsOf.useGoogleSearch && (
                        <Sec label="Image Search">
                          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                            <input type="checkbox" checked={settingsOf.useImageSearch ?? false} onChange={e => setSetting('useImageSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                            <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Include image results</span>
                          </label>
                          <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Returns image bytes from web search (Flash Image model only)</p>
                        </Sec>
                      )}
                    </>
                  )}
                  <Sec label="Provider Override">
                    <Chips
                      opts={['Inherit', 'Gemini', 'EccoAPI', 'Pudding', 'OpenAI']}
                      value={settingsOf.providerOverride === 'gemini' ? 'Gemini' : settingsOf.providerOverride === 'ecco' ? 'EccoAPI' : settingsOf.providerOverride === 'pudding' ? 'Pudding' : settingsOf.providerOverride === 'openai' ? 'OpenAI' : 'Inherit'}
                      onChange={v => setSetting('providerOverride', v === 'Inherit' ? undefined : v === 'EccoAPI' ? 'ecco' : v === 'OpenAI' ? 'openai' : v.toLowerCase() as 'gemini' | 'pudding')}
                      cols={2}
                    />
                    <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Force this carousel to use a specific provider — overrides the global toolbar toggle</p>
                  </Sec>
                </>
              );
            })()}

            {!selectedAssetId && !selectedLibImgId && selectedNodeType === 'outputNode' && (
              <>
                <SideLabel>Image Output Settings</SideLabel>
                <Sec label="Resolution">
                  <Chips opts={['512px', '1K', '2K', '4K']} value={settingsOf.resolution ?? '1K'} onChange={v => setSetting('resolution', v)} cols={4} />
                </Sec>
                <Sec label="Aspect Ratio">
                  <Chips opts={['4:5', '1:1', '16:9', '9:16', 'Auto']} value={settingsOf.aspectRatio ?? '4:5'} onChange={v => setSetting('aspectRatio', v)} cols={3} />
                </Sec>
                <Sec label="Format">
                  <Chips opts={['PNG', 'JPEG']} value={settingsOf.format ?? 'PNG'} onChange={v => setSetting('format', v)} />
                </Sec>
                <Sec label="Generation Count">
                  <Chips opts={['1', '2', '3', '4']} value={String(settingsOf.count ?? 1)} onChange={v => setSetting('count', Number(v))} cols={4} />
                </Sec>
                <Sec label="Actions">
                  {(selectedNode?.data as { imageUrl?: string })?.imageUrl && (
                    <a href={(selectedNode?.data as { imageUrl: string }).imageUrl} download={`output-${Date.now()}.png`}
                      style={{ display: 'block', textAlign: 'center', padding: '6px', borderRadius: 6, background: 'var(--studio-accent)', color: '#fff', fontSize: 11, fontWeight: 600, textDecoration: 'none', marginBottom: 6 }}>
                      ↓ Download Image
                    </a>
                  )}
                </Sec>
              </>
            )}

            {!selectedAssetId && !selectedLibImgId && selectedNodeType === 'modelCreationNode' && (
              <>
                <SideLabel>Model Creation Settings</SideLabel>
                <Sec label="Output">
                  <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', lineHeight: 1.6 }}>Generates a full-profile portrait — one model in 16:9, two or three models together in 21:9. No angle panels, just complete head-to-toe shots.</p>
                </Sec>
                {(effectiveSidebarProvider !== 'openai' && effectiveSidebarProvider !== 'pudding-openai' && effectiveSidebarProvider !== 'ithink-openai' && effectiveSidebarProvider !== 'grsai') && <>
                <Sec label={`Temperature — ${(settingsOf.temperature ?? 1.0).toFixed(1)}`}>
                  <SliderRow value={settingsOf.temperature ?? 1.0} min={0} max={2} step={0.05} onChange={v => setSetting('temperature', v)} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Google recommends 1.0 for image models</p>
                </Sec>
                <Sec label="Safety Threshold">
                  <Chips opts={['Off', 'Low Block', 'Medium', 'High Block']} value={
                    settingsOf.safetyThreshold === 'BLOCK_NONE'          ? 'Off' :
                    settingsOf.safetyThreshold === 'BLOCK_ONLY_HIGH'     ? 'Low Block' :
                    settingsOf.safetyThreshold === 'BLOCK_LOW_AND_ABOVE' ? 'High Block' : 'Medium'
                  } onChange={v => setSetting('safetyThreshold',
                    v === 'Off'        ? 'BLOCK_NONE' :
                    v === 'Low Block'  ? 'BLOCK_ONLY_HIGH' :
                    v === 'High Block' ? 'BLOCK_LOW_AND_ABOVE' :
                                        'BLOCK_MEDIUM_AND_ABOVE'
                  )} cols={2} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Lower = fewer false-positive blocks on safe content</p>
                </Sec>
                <Sec label="Thinking Mode">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input type="checkbox" checked={settingsOf.includeThoughts !== false} onChange={e => setSetting('includeThoughts', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                    <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable (improves consistency)</span>
                  </label>
                </Sec>
                <Sec label="Media Resolution">
                  <Chips opts={['High', 'Medium', 'Low']} value={
                    settingsOf.mediaResolution === 'media_resolution_low'    ? 'Low' :
                    settingsOf.mediaResolution === 'media_resolution_medium' ? 'Medium' : 'High'
                  } onChange={v => setSetting('mediaResolution',
                    v === 'Low' ? 'media_resolution_low' : v === 'Medium' ? 'media_resolution_medium' : 'media_resolution_high'
                  )} cols={3} />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>High = more input tokens for reference image details</p>
                </Sec>
                </>}
                {(effectiveSidebarProvider === 'openai' || effectiveSidebarProvider === 'pudding-openai' || effectiveSidebarProvider === 'ithink-openai' || effectiveSidebarProvider === 'grsai') ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['gpt-image-2', 'gpt-image-1']} value={settingsOf.model ?? 'gpt-image-2'} onChange={v => setSetting('model', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 = latest · flexible sizes up to 4K · no transparent bg</p>
                    </Sec>
                    <Sec label="Quality">
                      <Chips opts={['Low', 'Medium', 'High']} value={
                        settingsOf.quality === 'low' ? 'Low' : settingsOf.quality === 'high' ? 'High' : 'Medium'
                      } onChange={v => setSetting('quality', v.toLowerCase() as 'low' | 'medium' | 'high')} cols={3} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Low = $0.006 · Medium = $0.053 · High = $0.211 per image</p>
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['auto', '1024×1024', '1536×1024', '1024×1536', '2048×1152', '3840×2160']} value={settingsOf.size ?? 'auto'} onChange={v => setSetting('size', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>auto = model decides · gpt-image-2 supports up to 4K flexible sizes</p>
                    </Sec>
                    <Sec label="Output Format">
                      <Chips opts={['PNG', 'JPEG', 'WebP']} value={(settingsOf.output_format ?? 'png').toUpperCase()} onChange={v => setSetting('output_format', v.toLowerCase())} cols={3} />
                    </Sec>
                    <Sec label="Background">
                      <Chips opts={['Auto', 'Opaque']} value={settingsOf.background === 'opaque' ? 'Opaque' : 'Auto'} onChange={v => setSetting('background', v === 'Opaque' ? 'opaque' : 'auto')} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 doesn't support transparent — Auto or Opaque only</p>
                    </Sec>
                    <Sec label="Moderation">
                      <Chips opts={['Auto', 'Low']} value={settingsOf.moderation === 'low' ? 'Low' : 'Auto'} onChange={v => setSetting('moderation', v.toLowerCase() as 'auto' | 'low')} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Auto = standard safety · Low = fewer false-positive refusals</p>
                    </Sec>
                    {effectiveSidebarProvider === 'pudding-openai' && (
                      <Sec label="Streaming Mode">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#10B981' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get 524 timeout errors</p>
                      </Sec>
                    )}
                  </>
                ) : effectiveSidebarProvider === 'ecco' ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['NanoBanana 3.1', 'NanaBanana Pro']} value={settingsOf.eccoModel === 'nanobananapro' ? 'NanaBanana Pro' : 'NanoBanana 3.1'} onChange={v => setSetting('eccoModel', v === 'NanaBanana Pro' ? 'nanobananapro' : 'nanobanana31')} cols={2} />
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['1K', '2K', '4K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={3} />
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                    <Sec label="Async Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useAsync ?? false} onChange={e => setSetting('useAsync', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use async queue (off = sync)</span>
                      </label>
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Sync mode (default) waits for the result directly — avoids model swapping in async queues</p>
                    </Sec>
                  </>
                ) : effectiveSidebarProvider === 'pudding' ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['Flash', 'Pro']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Flash = Nano banana 2 · Pro = Nano banana pro</p>
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['1K', '2K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>PuddingAPI bills per resolution — 4K not available</p>
                    </Sec>
                    <Sec label="Streaming Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#FB923C' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                      </label>
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get 524 timeout errors — keeps Cloudflare connection alive during generation</p>
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                    {settingsOf.useGoogleSearch && (
                      <Sec label="Image Search">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useImageSearch ?? false} onChange={e => setSetting('useImageSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Include image results</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Returns image bytes from web search (Flash Image model only)</p>
                      </Sec>
                    )}
                  </>
                ) : (
                  <>
                    <Sec label="Model">
                      <Chips opts={['Flash', 'Pro', 'Standard']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={3} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Flash = gemini-3.1-flash-image-preview</p>
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['1K', '2K', '4K']} value={settingsOf.imageSize ?? '1K'} onChange={v => setSetting('imageSize', v)} cols={3} />
                    </Sec>
                    <Sec label={`Top-P — ${(settingsOf.topP ?? 1).toFixed(2)}`}>
                      <SliderRow value={settingsOf.topP ?? 1} min={0} max={1} step={0.01} onChange={v => setSetting('topP', v)} />
                    </Sec>
                    <Sec label="Streaming Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#0D9488' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                      </label>
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                  </>
                )}
                <Sec label="Provider Override">
                  <Chips
                    opts={['Inherit', 'Gemini', 'EccoAPI', 'Pudding', 'OpenAI']}
                    value={settingsOf.providerOverride === 'gemini' ? 'Gemini' : settingsOf.providerOverride === 'ecco' ? 'EccoAPI' : settingsOf.providerOverride === 'pudding' ? 'Pudding' : settingsOf.providerOverride === 'openai' ? 'OpenAI' : 'Inherit'}
                    onChange={v => setSetting('providerOverride', v === 'Inherit' ? undefined : v === 'EccoAPI' ? 'ecco' : v === 'OpenAI' ? 'openai' : v.toLowerCase() as 'gemini' | 'pudding')}
                    cols={2}
                  />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Force this node to use a specific provider — overrides the global toolbar toggle</p>
                </Sec>
                <Sec label="Style">
                  <Chips opts={['Realistic', 'Editorial', 'Commercial', 'Artistic']} value={settingsOf.style ?? 'Realistic'} onChange={v => setSetting('style', v)} cols={2} />
                </Sec>
                <Sec label="Lighting">
                  <Chips opts={['Studio White', 'Natural', 'Dramatic', 'Soft Box']} value={settingsOf.lighting ?? 'Studio White'} onChange={v => setSetting('lighting', v)} cols={2} />
                </Sec>
                <Sec label="Background">
                  <Chips opts={['Pure White', 'Light Gray', 'Gradient', 'Scene']} value={settingsOf.background ?? 'Pure White'} onChange={v => setSetting('background', v)} cols={2} />
                </Sec>
                <Sec label="How it works">
                  <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', lineHeight: 1.6 }}>This node is text-to-image only — no reference images. Describe the model in detail in the node's text area, then click "Create Model".</p>
                </Sec>
              </>
            )}

            {!selectedAssetId && !selectedLibImgId && selectedNodeType === 'settingNode' && (
              <>
                <SideLabel>Setting / Background Plate</SideLabel>
                <Sec label="Output">
                  <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', lineHeight: 1.6 }}>Generates a 16:9 background plate (single mode) or 21:9 multi-angle composite.</p>
                </Sec>
                {(effectiveSidebarProvider !== 'openai' && effectiveSidebarProvider !== 'pudding-openai' && effectiveSidebarProvider !== 'ithink-openai' && effectiveSidebarProvider !== 'grsai') && (
                  <>
                    <Sec label={`Temperature — ${(settingsOf.temperature ?? 0.6).toFixed(1)}`}>
                      <SliderRow value={settingsOf.temperature ?? 0.6} min={0.5} max={0.7} step={0.01} onChange={v => setSetting('temperature', v)} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Lower temp for consistent backgrounds (0.5–0.7 range)</p>
                    </Sec>
                    <Sec label="Seed">
                      <input
                        type="number"
                        placeholder="Random"
                        value={settingsOf.seed ?? ''}
                        onChange={e => setSetting('seed', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
                        style={{
                          width: '100%',
                          background: 'var(--studio-surface)',
                          border: '1px solid var(--studio-border)',
                          borderRadius: 6,
                          padding: '6px 9px',
                          color: 'var(--studio-text)',
                          fontSize: 11,
                          outline: 'none',
                        }}
                      />
                    </Sec>
                  </>
                )}
                {(effectiveSidebarProvider === 'openai' || effectiveSidebarProvider === 'pudding-openai' || effectiveSidebarProvider === 'ithink-openai' || effectiveSidebarProvider === 'grsai') ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['gpt-image-2', 'gpt-image-1']} value={settingsOf.model ?? 'gpt-image-2'} onChange={v => setSetting('model', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 = latest · flexible sizes up to 4K · no transparent bg</p>
                    </Sec>
                    <Sec label="Quality">
                      <Chips opts={['Low', 'Medium', 'High']} value={
                        settingsOf.quality === 'low' ? 'Low' : settingsOf.quality === 'high' ? 'High' : 'Medium'
                      } onChange={v => setSetting('quality', v.toLowerCase() as 'low' | 'medium' | 'high')} cols={3} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Low = $0.006 · Medium = $0.053 · High = $0.211 per image</p>
                    </Sec>
                    <Sec label="Image Size">
                      <Chips opts={['auto', '1024×1024', '1536×1024', '1024×1536', '2048×1152', '3840×2160']} value={settingsOf.size ?? 'auto'} onChange={v => setSetting('size', v)} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>auto = model decides · gpt-image-2 supports up to 4K flexible sizes</p>
                    </Sec>
                    <Sec label="Output Format">
                      <Chips opts={['PNG', 'JPEG', 'WebP']} value={(settingsOf.output_format ?? 'png').toUpperCase()} onChange={v => setSetting('output_format', v.toLowerCase())} cols={3} />
                    </Sec>
                    <Sec label="Background">
                      <Chips opts={['Auto', 'Opaque']} value={settingsOf.background === 'opaque' ? 'Opaque' : 'Auto'} onChange={v => setSetting('background', v === 'Opaque' ? 'opaque' : 'auto')} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>gpt-image-2 doesn't support transparent — Auto or Opaque only</p>
                    </Sec>
                    <Sec label="Moderation">
                      <Chips opts={['Auto', 'Low']} value={settingsOf.moderation === 'low' ? 'Low' : 'Auto'} onChange={v => setSetting('moderation', v.toLowerCase() as 'auto' | 'low')} cols={2} />
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Auto = standard safety · Low = fewer false-positive refusals</p>
                    </Sec>
                    {effectiveSidebarProvider === 'pudding-openai' && (
                      <Sec label="Streaming Mode">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#10B981' }} />
                          <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                        </label>
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get 524 timeout errors</p>
                      </Sec>
                    )}
                  </>
                ) : effectiveSidebarProvider === 'ecco' ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['NanoBanana 3.1', 'NanaBanana Pro']} value={settingsOf.eccoModel === 'nanobananapro' ? 'NanaBanana Pro' : 'NanoBanana 3.1'} onChange={v => setSetting('eccoModel', v === 'NanaBanana Pro' ? 'nanobananapro' : 'nanobanana31')} cols={2} />
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                  </>
                ) : effectiveSidebarProvider === 'pudding' ? (
                  <>
                    <Sec label="Model">
                      <Chips opts={['Flash', 'Pro']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={2} />
                    </Sec>
                    <Sec label="Streaming Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#FB923C' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                      </label>
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get 524 timeout errors</p>
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                  </>
                ) : (
                  <>
                    <Sec label="Model">
                      <Chips opts={['Flash', 'Pro', 'Standard']} value={settingsOf.model ?? 'Flash'} onChange={v => setSetting('model', v)} cols={3} />
                    </Sec>
                    <Sec label="Streaming Mode">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useStreaming ?? true} onChange={e => setSetting('useStreaming', e.target.checked)} style={{ accentColor: '#0D9488' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Use SSE streaming</span>
                      </label>
                      <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Enable if you get timeout errors</p>
                    </Sec>
                    <Sec label="Google Search Grounding">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="checkbox" checked={settingsOf.useGoogleSearch ?? false} onChange={e => setSetting('useGoogleSearch', e.target.checked)} style={{ accentColor: 'var(--studio-accent)' }} />
                        <span style={{ fontSize: 10, color: 'var(--studio-text-sec)' }}>Enable real-time search</span>
                      </label>
                    </Sec>
                  </>
                )}
                <Sec label="Provider Override">
                  <Chips
                    opts={['Inherit', 'Gemini', 'EccoAPI', 'Pudding', 'OpenAI']}
                    value={settingsOf.providerOverride === 'gemini' ? 'Gemini' : settingsOf.providerOverride === 'ecco' ? 'EccoAPI' : settingsOf.providerOverride === 'pudding' ? 'Pudding' : settingsOf.providerOverride === 'openai' ? 'OpenAI' : 'Inherit'}
                    onChange={v => setSetting('providerOverride', v === 'Inherit' ? undefined : v === 'EccoAPI' ? 'ecco' : v === 'OpenAI' ? 'openai' : v.toLowerCase() as 'gemini' | 'pudding')}
                    cols={2}
                  />
                  <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>Force this node to use a specific provider — overrides the global toolbar toggle</p>
                </Sec>
                <Sec label="Mode">
                  <Chips opts={['Single Plate', 'Multi-angle']} value={settingsOf.compositeMode === 'multi-angle' ? 'Multi-angle' : 'Single Plate'} onChange={v => {
                    const patch: { compositeMode: 'single' | 'multi-angle'; compositeAngles?: string[] } = { compositeMode: v === 'Multi-angle' ? 'multi-angle' : 'single' };
                    if (v === 'Multi-angle' && (settingsOf.compositeAngles?.length ?? 0) < 2) patch.compositeAngles = ['', '', '', ''];
                    setSetting('compositeMode', patch.compositeMode!);
                    if (patch.compositeAngles) setSetting('compositeAngles', patch.compositeAngles);
                  }} cols={2} />
                </Sec>
                {settingsOf.compositeMode === 'multi-angle' && (() => {
                  const angles = settingsOf.compositeAngles ?? ['', '', '', ''];
                  const count = angles.length === 2 ? 2 : angles.length === 3 ? 3 : 4;
                  return (
                    <>
                      <Sec label="Panels">
                        <Chips
                          opts={['2 · 16:9', '3 · 21:9', '4 · 21:9']}
                          value={count === 2 ? '2 · 16:9' : count === 3 ? '3 · 21:9' : '4 · 21:9'}
                          onChange={v => {
                            const n = v.startsWith('2') ? 2 : v.startsWith('3') ? 3 : 4;
                            setSetting('compositeAngles', [...angles, '', '', '', ''].slice(0, n));
                          }}
                          cols={3}
                        />
                        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 4 }}>2-panel = 16:9 · 3 or 4-panel = 21:9 composite</p>
                      </Sec>
                      {Array.from({ length: count }).map((_, i) => (
                        <Sec key={i} label={`Panel ${i + 1} Angle`}>
                          <input
                            type="text"
                            placeholder={(['Interior inward', 'Interior outward', 'Exterior', 'Detail / overhead'])[i] ?? `Angle ${i + 1}`}
                            value={angles[i] ?? ''}
                            onChange={e => {
                              const next = [...angles, '', '', '', ''].slice(0, count) as string[];
                              next[i] = e.target.value;
                              setSetting('compositeAngles', next);
                            }}
                            style={{ width: '100%', background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--studio-text)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                          />
                        </Sec>
                      ))}
                    </>
                  );
                })()}
                <Sec label="How it works">
                  <p style={{ fontSize: 10, color: 'var(--studio-text-muted)', lineHeight: 1.6 }}>Describe the environment, lighting, and atmosphere. Connect to PromptNode as background reference. All settings controlled from this sidebar.</p>
                </Sec>
              </>
            )}
          </aside>
        </div>
      </div>

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <div
          onClick={() => setContextMenu(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: contextMenu.y, left: contextMenu.x,
              background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', borderRadius: 8,
              padding: 4, zIndex: 201, minWidth: 140,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {[
              { label: 'Duplicate  Ctrl+D', action: () => onDuplicateNode(contextMenu.nodeId) },
              { label: 'Delete  Del', action: () => { onDeleteNode(contextMenu.nodeId); setContextMenu(null); }, red: true },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                style={{ display: 'block', width: '100%', padding: '7px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', color: item.red ? '#F43F5E' : 'var(--studio-text-sec)', cursor: 'pointer', borderRadius: 5 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--studio-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >{item.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Image preview modal ── */}
      {modalGallery && (
        <ImageModal
          items={modalGallery.items}
          initialIndex={modalGallery.index}
          onClose={() => setModalGallery(null)}
          onIndexChange={(i) => {
            const cur = modalGallery.items[i];
            if (cur?.id) setSelectedLibImgId(cur.id);
          }}
        />
      )}

      {/* ── Welcome dialog ── */}
      {showWelcome && (
        <WelcomeDialog
          batches={batches}
          onOpenBatch={handleWelcomeOpenBatch}
          onNewBatch={handleWelcomeNewBatch}
          onNewAutomatedBatch={handleWelcomeNewAutomated}
          onDismiss={() => setShowWelcome(false)}
        />
      )}

      {/* ── Chat ── */}
      <ChatFab onClick={() => setChatOpen(v => !v)} />
      <ChatDrawer
        open={chatOpen}
        onClose={() => { setChatOpen(false); setChatAutomateMode(false); }}
        canvasAccess={canvasAccess}
        activeBatchId={activeBatchId}
        onSwitchBatch={handleSwitchBatch}
        onCreateBatch={(name) => newAutomatedBatch(name, nodes, edges)}
        initialAutomateMode={chatAutomateMode}
      />

    </StudioContext.Provider>
  );
}

// ─── Global (no selection) settings panel ────────────────────────────────────
function GlobalSettings({ activeProvider }: { activeProvider: 'gemini' | 'ecco' | 'pudding' | 'openai' | 'pudding-openai' | 'ithink-openai' | 'grsai' }) {
  return (
    <>
      <SideLabel>Global Defaults</SideLabel>
      <p style={{ fontSize: 11, color: 'var(--studio-text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
        Click any node on the canvas to see and configure its settings here.
      </p>
      <Sec label="How to get started">
        <ol style={{ paddingLeft: 14, color: 'var(--studio-text-sec)', fontSize: 11, lineHeight: 1.8, margin: 0 }}>
          <li>Add an <strong style={{ color: 'var(--studio-text)' }}>Image Reference</strong> node and upload a product photo with tags</li>
          <li>Add an <strong style={{ color: 'var(--studio-text)' }}>Image Prompt</strong> node and write your scene description</li>
          <li>Connect them with an edge, then hit <strong style={{ color: 'var(--studio-accent)' }}>Generate Slide</strong></li>
          <li>View the result in the connected <strong style={{ color: 'var(--studio-text)' }}>Image Output</strong> node</li>
        </ol>
      </Sec>
      <Sec label="Provider">
        <p style={{ fontSize: 11, color: activeProvider === 'ecco' ? '#A78BFA' : activeProvider === 'pudding' ? '#FB923C' : activeProvider === 'openai' ? '#10B981' : activeProvider === 'pudding-openai' ? '#F59E0B' : activeProvider === 'ithink-openai' ? '#06B6D4' : activeProvider === 'grsai' ? '#8B5CF6' : '#0D9488' }}>
          {activeProvider === 'ecco' ? 'EccoAPI (Nano Banana)' : activeProvider === 'pudding' ? 'PuddingAPI (Gemini-compatible)' : activeProvider === 'openai' ? 'OpenAI (GPT-Image-2)' : activeProvider === 'pudding-openai' ? 'Pudding (OpenAI proxy)' : activeProvider === 'ithink-openai' ? 'iThink (OpenAI proxy)' : activeProvider === 'grsai' ? 'GrsAI (OpenAI proxy)' : 'Google Gemini'}
        </p>
        <p style={{ fontSize: 9, color: 'var(--studio-text-muted)', marginTop: 3 }}>
          {activeProvider === 'ecco' ? 'nk_live_... key configured' : activeProvider === 'pudding' ? 'PUDDING_API_KEY configured' : activeProvider === 'openai' ? 'OPENAI_API_KEY configured' : activeProvider === 'pudding-openai' ? 'PUDDING_API_KEY configured' : activeProvider === 'ithink-openai' ? 'ITHINK_OPENAI_API_KEY configured' : activeProvider === 'grsai' ? 'GRSAI_API_KEY configured' : 'GEMINI_API_KEY configured'}
        </p>
      </Sec>
      <Sec label="Keyboard Shortcuts">
        {[
          ['Del', 'Delete selected node'],
          ['Ctrl+D', 'Duplicate selected node'],
          ['Esc', 'Cancel connect / close menu'],
          ['Right-click node', 'Context menu'],
        ].map(([k, d]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3, background: 'var(--studio-elevated)', border: '1px solid var(--studio-border)', color: 'var(--studio-text-sec)', fontFamily: 'monospace' }}>{k}</span>
            <span style={{ fontSize: 9, color: 'var(--studio-text-muted)' }}>{d}</span>
          </div>
        ))}
      </Sec>
    </>
  );
}

// ─── Micro helpers ────────────────────────────────────────────────────────────
function TB({ onClick, children, accent, coral, title }: { onClick: () => void; children: React.ReactNode; accent?: boolean; coral?: boolean; title?: string }) {
  const bg    = accent ? 'color-mix(in srgb, var(--studio-accent) 13%, transparent)' : coral ? '#F43F5E22' : 'var(--studio-elevated)';
  const color = accent ? 'var(--studio-accent)'   : coral ? '#F43F5E'   : 'var(--studio-text-sec)';
  const border= accent ? 'color-mix(in srgb, var(--studio-accent) 27%, transparent)' : coral ? '#F43F5E44' : 'var(--studio-border)';
  return <button onClick={onClick} title={title} style={{ padding: '5px 11px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${border}`, background: bg, color, cursor: 'pointer', whiteSpace: 'nowrap' }}>{children}</button>;
}
function Div() { return <div style={{ width: 1, height: 14, background: 'var(--studio-border)', margin: '0 2px' }} />; }
function SideLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--studio-text-muted)', marginBottom: 12 }}>{children}</p>;
}
function Sec({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 14 }}><p style={{ fontSize: 10, color: 'var(--studio-text-sec)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>{children}</div>;
}
function SliderRow({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--studio-accent)', cursor: 'pointer' }} />;
}
function Chips({ opts, value, onChange, cols = 3 }: { opts: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
      {opts.map(o => {
        const active = value === o || value.toLowerCase() === o.toLowerCase();
        return <button key={o} onClick={() => onChange(o)} style={{ padding: '4px 0', fontSize: 9, borderRadius: 5, border: `1px solid ${active ? 'var(--studio-accent)' : 'var(--studio-border)'}`, background: active ? 'var(--studio-accent)' : 'var(--studio-elevated)', color: active ? '#fff' : 'var(--studio-text-sec)', cursor: 'pointer' }}>{o}</button>;
      })}
    </div>
  );
}

// ─── Image preview modal ─────────────────────────────────────────────────────
function ImageModal({
  items,
  initialIndex,
  onClose,
  onIndexChange,
}: {
  items: { url: string; id?: string; name?: string }[];
  initialIndex: number;
  onClose: () => void;
  onIndexChange?: (i: number) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);

  const go = useCallback((next: number) => {
    const i = ((next % items.length) + items.length) % items.length;
    setIndex(i);
    onIndexChange?.(i);
  }, [items.length, onIndexChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  go(index - 1);
      if (e.key === 'ArrowRight') go(index + 1);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, go, index]);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  const cur = items[index];
  const multi = items.length > 1;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {/* Main image */}
        <div style={{ position: 'relative' }}>
          {multi && (
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600, color: '#fff' }}>
              {index + 1} / {items.length}
            </div>
          )}
          <img
            src={cur.url}
            alt="preview"
            style={{ maxWidth: '90vw', maxHeight: '78vh', borderRadius: 10, display: 'block', objectFit: 'contain', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}
          />
          {/* Close */}
          <button onClick={onClose} style={{
            position: 'absolute', top: -14, right: -14,
            width: 30, height: 30, borderRadius: '50%',
            border: '1px solid var(--studio-border)', background: 'var(--studio-surface)', color: 'var(--studio-text)',
            cursor: 'pointer', fontSize: 16, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}>×</button>
          {/* Download */}
          <a href={cur.url} download={`image-${Date.now()}.png`} onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 10, right: 10,
              padding: '5px 12px', borderRadius: 6, background: '#111113cc',
              color: 'var(--studio-text-sec)', fontSize: 11, fontWeight: 600, textDecoration: 'none',
              border: '1px solid var(--studio-border)',
            }}>
            ↓ Download
          </a>
          <p style={{ position: 'absolute', bottom: 10, left: 10, fontSize: 10, color: 'var(--studio-text-muted)', margin: 0 }}>
            Click outside or press Esc to close
          </p>
          {/* Prev arrow */}
          {multi && (
            <button
              onClick={e => { e.stopPropagation(); go(index - 1); }}
              style={{
                position: 'absolute', left: -42, top: '50%', transform: 'translateY(-50%)',
                width: 34, height: 34, borderRadius: '50%',
                border: '1px solid var(--studio-border)', background: 'var(--studio-surface)', color: 'var(--studio-text)',
                cursor: 'pointer', fontSize: 20, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >‹</button>
          )}
          {/* Next arrow */}
          {multi && (
            <button
              onClick={e => { e.stopPropagation(); go(index + 1); }}
              style={{
                position: 'absolute', right: -42, top: '50%', transform: 'translateY(-50%)',
                width: 34, height: 34, borderRadius: '50%',
                border: '1px solid var(--studio-border)', background: 'var(--studio-surface)', color: 'var(--studio-text)',
                cursor: 'pointer', fontSize: 20, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >›</button>
          )}
        </div>

        {/* Thumbnail strip */}
        {multi && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '90vw', padding: '4px 4px 6px' }}>
            {items.map((item, i) => {
              const active = i === index;
              return (
                <button
                  key={i}
                  ref={active ? activeThumbRef : null}
                  onClick={e => { e.stopPropagation(); go(i); }}
                  style={{
                    flexShrink: 0,
                    width: 56, height: 56,
                    padding: 0, border: `2px solid ${active ? 'var(--studio-accent)' : 'var(--studio-border)'}`,
                    borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                    opacity: active ? 1 : 0.6,
                    transition: 'border-color 0.12s, opacity 0.12s',
                    background: 'var(--studio-elevated)',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
                >
                  <img
                    src={item.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function Page() {
  return (
    <ReactFlowProvider>
      <StudioCanvas />
    </ReactFlowProvider>
  );
}