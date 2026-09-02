'use client';

import {
  ArrowDown, ArrowUp, Bot, Brush, Check, ChevronDown, CircleHelp, Download,
  Eraser, Eye, EyeOff, Hand, ImagePlus, Layers3, MousePointer2, Plus, Redo2,
  Merge, Sparkles, Trash2, Undo2, WandSparkles, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Tool = 'select' | 'brush' | 'eraser' | 'pan';
type Layer = { id: string; name: string; visible: boolean; opacity: number; blend: GlobalCompositeOperation; swatch: string; ai?: boolean };
type Selection = { x: number; y: number; width: number; height: number };
type Activity = { id: number; title: string; detail: string; time: string };
type PendingEdit = { id: string; prompt: string; source: Selection; selection: Selection; createdAt: number };
type WebMCPTool = { name: string; title?: string; description: string; inputSchema?: Record<string, unknown>; execute: (input: Record<string, unknown>, options?: ToolExecutionOptions) => Promise<unknown> | unknown };
type ToolExecutionOptions = { signal: AbortSignal };
type SavedProjectLayer = Omit<Layer, 'blend'> & { blend: string; pixels: string };
type LayerSnapshot = { layers: Layer[]; activeLayer: string; pixels: Array<{ id: string; image: ImageData }> };
type HistoryEntry =
  | { kind: 'pixels'; layerId: string; image: ImageData }
  | { kind: 'layers'; before: LayerSnapshot; after: LayerSnapshot };
type DuetProject = {
  format: 'duet'; version: 1; exportedAt: string;
  canvas: { width: number; height: number; finalImage: string };
  document: { activeLayer: string; selection: Selection; prompt: string; tool: Tool; brushSize: number; brushColor: string; zoom: number };
  layers: SavedProjectLayer[];
};

declare global {
  interface Document {
    modelContext?: { registerTool: (tool: WebMCPTool, options?: { signal?: AbortSignal }) => Promise<void> };
  }
}

const WIDTH = 960;
const HEIGHT = 640;
const MIN_SELECTION_SIZE = 4;
const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const MAX_PROJECT_LAYERS = 64;
const acceptedBlends = new Set<GlobalCompositeOperation>(['source-over', 'multiply', 'screen', 'overlay', 'soft-light']);
const initialLayers: Layer[] = [
  { id: 'ai-light', name: 'AI — warm window light', visible: true, opacity: 78, blend: 'soft-light', swatch: 'linear-gradient(135deg,#ffb86b,#9159e8)', ai: true },
  { id: 'portrait', name: 'Studio portrait', visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#e5b58a,#5a3254)' },
  { id: 'backdrop', name: 'Backdrop', visible: true, opacity: 100, blend: 'source-over', swatch: '#d9d1c8' },
];
const toolMeta: Array<{ id: Tool; label: string; icon: typeof Brush; key: string }> = [
  { id: 'select', label: 'Select region', icon: MousePointer2, key: 'V' },
  { id: 'brush', label: 'Brush', icon: Brush, key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'pan', label: 'Pan canvas', icon: Hand, key: 'H' },
];

function response(value: unknown) { return { content: [{ type: 'text', text: JSON.stringify(value) }] }; }
function makeCanvas() { const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT; return canvas; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function boundedNumber(value: unknown, fallback: number, min: number, max: number) { const number = typeof value === 'number' ? value : Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
function safeSelection(value: unknown): Selection {
  if (!isRecord(value)) return { x: 0, y: 0, width: WIDTH, height: HEIGHT };
  const x = boundedNumber(value.x, 0, 0, WIDTH - 1); const y = boundedNumber(value.y, 0, 0, HEIGHT - 1);
  return { x, y, width: boundedNumber(value.width, WIDTH, 1, WIDTH - x), height: boundedNumber(value.height, HEIGHT, 1, HEIGHT - y) };
}
function hasUsableSelection(tool: Tool, selection: Selection) {
  return tool === 'select' && selection.width > MIN_SELECTION_SIZE && selection.height > MIN_SELECTION_SIZE;
}
function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function Duet() {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const layerCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const thumbnailRefs = useRef(new Map<string, HTMLCanvasElement>());
  const initialized = useRef(false);
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const selectionStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const panning = useRef(false);
  const zoomRef = useRef(82);
  const zoomFrame = useRef<number | null>(null);
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const pendingEdits = useRef(new Map<string, PendingEdit>());
  const actionsRef = useRef<Record<string, (...args: any[]) => any>>({});

  const [layers, setLayers] = useState(initialLayers);
  const [activeLayer, setActiveLayer] = useState('ai-light');
  const [tool, setTool] = useState<Tool>('select');
  const [brushSize, setBrushSize] = useState(28);
  const [brushColor, setBrushColor] = useState('#ff6b5f');
  const [zoom, setZoom] = useState(82);
  const [selection, setSelection] = useState<Selection>({ x: 490, y: 155, width: 300, height: 330 });
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [webMcp, setWebMcp] = useState<'ready' | 'fallback'>('fallback');
  const [activities, setActivities] = useState<Activity[]>([
    { id: 1, title: 'Agent added a layer', detail: 'Warm window light', time: 'now' },
    { id: 2, title: 'Region selected', detail: '300 × 330 px', time: '1m' },
  ]);
  const changeTool = useCallback((next: Tool) => {
    setTool(next);
    if (next !== 'select') {
      setSelection({ x: 0, y: 0, width: 0, height: 0 });
    }
  }, []);

  const zoomAt = useCallback((requestedZoom: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;
    const nextZoom = Math.max(25, Math.min(400, Math.round(requestedZoom * 10) / 10));
    if (nextZoom === zoomRef.current) return;

    const viewportRect = viewport.getBoundingClientRect();
    const before = stage.getBoundingClientRect();
    const focusX = clientX ?? viewportRect.left + viewportRect.width / 2;
    const focusY = clientY ?? viewportRect.top + viewportRect.height / 2;
    const anchorX = before.width ? (focusX - before.left) / before.width : .5;
    const anchorY = before.height ? (focusY - before.top) / before.height : .5;

    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current);
    zoomFrame.current = requestAnimationFrame(() => {
      const after = stage.getBoundingClientRect();
      viewport.scrollLeft += after.left + anchorX * after.width - focusX;
      viewport.scrollTop += after.top + anchorY * after.height - focusY;
      zoomFrame.current = null;
    });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const limitedDelta = Math.max(-24, Math.min(24, event.deltaY));
        zoomAt(zoomRef.current * Math.exp(-limitedDelta * .012), event.clientX, event.clientY);
        return;
      }
      if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        viewport.scrollLeft += event.deltaY;
      }
    };
    viewport.addEventListener('wheel', wheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', wheel);
      if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current);
    };
  }, [zoomAt]);

  const addActivity = useCallback((title: string, detail: string) => {
    setActivities((items) => [{ id: Date.now(), title, detail, time: 'now' }, ...items.slice(0, 4)]);
  }, []);

  const render = useCallback(() => {
    const ctx = displayRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    [...layers].reverse().forEach((layer) => {
      const source = layerCanvases.current.get(layer.id);
      if (!source || !layer.visible) return;
      ctx.save(); ctx.globalAlpha = layer.opacity / 100; ctx.globalCompositeOperation = layer.blend; ctx.drawImage(source, 0, 0); ctx.restore();
    });
    layers.forEach((layer) => {
      const source = layerCanvases.current.get(layer.id);
      const thumbnail = thumbnailRefs.current.get(layer.id);
      if (!source || !thumbnail) return;
      const thumbnailCtx = thumbnail.getContext('2d');
      if (!thumbnailCtx) return;
      thumbnailCtx.clearRect(0, 0, thumbnail.width, thumbnail.height);
      thumbnailCtx.save();
      thumbnailCtx.globalAlpha = layer.opacity / 100;
      thumbnailCtx.drawImage(source, 0, 0, WIDTH, HEIGHT, 0, 0, thumbnail.width, thumbnail.height);
      thumbnailCtx.restore();
    });
  }, [layers]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const backdrop = makeCanvas();
    const bg = backdrop.getContext('2d')!;
    const bgGradient = bg.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGradient.addColorStop(0, '#d9d1c8'); bgGradient.addColorStop(.55, '#b8aab4'); bgGradient.addColorStop(1, '#776476');
    bg.fillStyle = bgGradient; bg.fillRect(0, 0, WIDTH, HEIGHT);

    const portrait = makeCanvas();
    const ctx = portrait.getContext('2d')!;
    const wall = ctx.createLinearGradient(0, 0, WIDTH, 0);
    wall.addColorStop(0, '#f1cba8'); wall.addColorStop(.48, '#b66d69'); wall.addColorStop(1, '#38283d');
    ctx.fillStyle = wall; ctx.fillRect(44, 42, WIDTH - 88, HEIGHT - 84);
    ctx.fillStyle = 'rgba(255,242,213,.28)'; ctx.fillRect(80, 78, 260, 484);
    ctx.fillStyle = '#e2a37e'; ctx.beginPath(); ctx.ellipse(615, 256, 108, 134, -.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#302230'; ctx.beginPath(); ctx.arc(610, 214, 116, Math.PI * 1.03, Math.PI * 2.12); ctx.lineTo(714, 310); ctx.quadraticCurveTo(695, 125, 610, 105); ctx.fill();
    const shirt = ctx.createLinearGradient(470, 380, 780, 620); shirt.addColorStop(0, '#76536c'); shirt.addColorStop(1, '#292130');
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.moveTo(530, 360); ctx.quadraticCurveTo(605, 325, 690, 365); ctx.quadraticCurveTo(790, 430, 835, 598); ctx.lineTo(395, 598); ctx.quadraticCurveTo(430, 430, 530, 360); ctx.fill();
    ctx.fillStyle = 'rgba(255,224,190,.78)'; ctx.beginPath(); ctx.ellipse(583, 246, 12, 7, 0, 0, Math.PI * 2); ctx.ellipse(650, 238, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(104,48,49,.65)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(620, 290, 28, .15, 2.8); ctx.stroke();
    ctx.fillStyle = 'rgba(38,24,33,.28)'; ctx.fillRect(44, 565, WIDTH - 88, 33);

    const light = makeCanvas();
    const lightCtx = light.getContext('2d')!;
    const glow = lightCtx.createRadialGradient(315, 210, 5, 315, 210, 510);
    glow.addColorStop(0, 'rgba(255,226,147,.88)'); glow.addColorStop(.42, 'rgba(255,160,103,.34)'); glow.addColorStop(1, 'rgba(86,39,111,0)');
    lightCtx.fillStyle = glow; lightCtx.fillRect(0, 0, WIDTH, HEIGHT);
    layerCanvases.current.set('backdrop', backdrop); layerCanvases.current.set('portrait', portrait); layerCanvases.current.set('ai-light', light);
    requestAnimationFrame(render);
  }, [render]);
  useEffect(() => { render(); }, [render]);

  const captureLayerSnapshot = useCallback((layerList: Layer[], selectedId: string): LayerSnapshot => ({
    layers: layerList.map((layer) => ({ ...layer })),
    activeLayer: selectedId,
    pixels: layerList.map((layer) => {
      const canvas = layerCanvases.current.get(layer.id);
      if (!canvas) throw new Error(`Layer “${layer.name}” is missing its pixels.`);
      return { id: layer.id, image: canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT) };
    }),
  }), []);

  const restoreLayerSnapshot = useCallback((snapshot: LayerSnapshot) => {
    layerCanvases.current = new Map(snapshot.pixels.map(({ id, image }) => {
      const canvas = makeCanvas();
      canvas.getContext('2d')!.putImageData(image, 0, 0);
      return [id, canvas] as const;
    }));
    setLayers(snapshot.layers.map((layer) => ({ ...layer })));
    setActiveLayer(snapshot.activeLayer);
  }, []);

  const createLayer = useCallback((name = 'Paint layer') => {
    const id = `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    layerCanvases.current.set(id, makeCanvas());
    setLayers((items) => [{ id, name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#ffffff,#d5d1e8)' }, ...items]);
    setActiveLayer(id); addActivity('Layer created', name); return id;
  }, [addActivity]);

  const compositeCanvas = useCallback(() => {
    const canvas = makeCanvas();
    const ctx = canvas.getContext('2d')!;
    [...layers].reverse().forEach((layer) => {
      const source = layerCanvases.current.get(layer.id);
      if (!source || !layer.visible) return;
      ctx.save(); ctx.globalAlpha = layer.opacity / 100; ctx.globalCompositeOperation = layer.blend; ctx.drawImage(source, 0, 0); ctx.restore();
    });
    return canvas;
  }, [layers]);

  const prepareAiEdit = useCallback((editPrompt = '') => {
    if (!hasUsableSelection(tool, selection)) {
      return {
        ready: false,
        code: 'selection_required',
        message: 'A DUET region must be selected before the agent can read or edit canvas pixels.',
        userInstruction: 'Choose the Region select (arrow) tool, drag over the area to edit, then ask the agent to try again.',
      };
    }
    const cleanPrompt = editPrompt.trim();
    const target = selection;
    const padding = Math.min(96, Math.max(36, Math.round(Math.min(target.width, target.height) * .18)));
    const source: Selection = {
      x: Math.max(0, Math.floor(target.x - padding)),
      y: Math.max(0, Math.floor(target.y - padding)),
      width: 0,
      height: 0,
    };
    source.width = Math.min(WIDTH - source.x, Math.ceil(target.x + target.width + padding) - source.x);
    source.height = Math.min(HEIGHT - source.y, Math.ceil(target.y + target.height + padding) - source.y);

    const crop = (input: HTMLCanvasElement, mimeType: 'image/png' | 'image/jpeg', quality?: number) => {
      const output = document.createElement('canvas'); output.width = source.width; output.height = source.height;
      output.getContext('2d')!.drawImage(input, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
      return output.toDataURL(mimeType, quality);
    };
    const mask = document.createElement('canvas'); mask.width = source.width; mask.height = source.height;
    const maskCtx = mask.getContext('2d')!; maskCtx.fillStyle = '#000'; maskCtx.fillRect(0, 0, mask.width, mask.height);
    maskCtx.fillStyle = '#fff'; maskCtx.fillRect(target.x - source.x, target.y - source.y, target.width, target.height);
    const active = layerCanvases.current.get(activeLayer) || makeCanvas();
    const id = `edit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const pending: PendingEdit = { id, prompt: cleanPrompt, source, selection: { ...target }, createdAt: Date.now() };
    pendingEdits.current.set(id, pending);
    while (pendingEdits.current.size > 6) pendingEdits.current.delete(pendingEdits.current.keys().next().value!);
    addActivity('Edit package ready for agent', cleanPrompt || 'No prompt — visual judgment');
    return {
      editId: id,
      prompt: cleanPrompt || null,
      compositeCrop: { dataUrl: crop(compositeCanvas(), 'image/jpeg', .9), mimeType: 'image/jpeg', width: source.width, height: source.height },
      activeLayerCrop: { dataUrl: crop(active, 'image/png'), mimeType: 'image/png', width: source.width, height: source.height },
      mask: { dataUrl: mask.toDataURL('image/png'), mimeType: 'image/png', width: source.width, height: source.height, whiteMeans: 'editable' },
      selection: { x: target.x - source.x, y: target.y - source.y, width: target.width, height: target.height },
      placement: source,
      outputContract: `Return one PNG or WebP of exactly ${source.width}×${source.height}px representing the complete crop. The app will reveal only the masked selection as a new layer.`,
    };
  }, [activeLayer, addActivity, compositeCanvas, selection, tool]);

  const insertAiResult = useCallback(async (editId: string, imageDataUrl: string, requestedName?: string) => {
    const pending = pendingEdits.current.get(editId);
    if (!pending) throw new Error('Unknown or expired editId. Call prepare_ai_edit again.');
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) { pendingEdits.current.delete(editId); throw new Error('Edit package expired. Call prepare_ai_edit again.'); }
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(imageDataUrl)) throw new Error('imageDataUrl must be a base64 PNG, JPEG, or WebP data URL.');
    if (imageDataUrl.length > 14_000_000) throw new Error('Generated image is larger than the 10 MB MVP limit.');
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Generated image could not be decoded.')); image.src = imageDataUrl; });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('Generated image dimensions are invalid or exceed 4096px.');
    const id = `ai-result-${Date.now()}`; const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!;
    ctx.save(); ctx.beginPath(); ctx.rect(pending.selection.x, pending.selection.y, pending.selection.width, pending.selection.height); ctx.clip();
    ctx.drawImage(image, pending.source.x, pending.source.y, pending.source.width, pending.source.height); ctx.restore();
    layerCanvases.current.set(id, canvas);
    const name = requestedName?.trim() || `AI — ${pending.prompt.slice(0, 34) || 'agent edit'}${pending.prompt.length > 34 ? '…' : ''}`;
    setLayers((items) => [{ id, name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#f28d68,#9a59ee)', ai: true }, ...items]);
    setActiveLayer(id); pendingEdits.current.delete(editId);
    addActivity('Agent image inserted as layer', name);
    return { layerId: id, name, placement: pending.source, clippedToSelection: pending.selection, nextStep: 'Ask the user in chat what they want to edit next.' };
  }, [addActivity]);

  const mergeLayerDown = useCallback(() => {
    const index = layers.findIndex((layer) => layer.id === activeLayer);
    if (index < 0 || index >= layers.length - 1) {
      const error = 'Select a layer with another layer beneath it.';
      addActivity('Merge unavailable', error);
      return { merged: false, error };
    }
    const selected = layers[index];
    const below = layers[index + 1];
    const selectedCanvas = layerCanvases.current.get(selected.id);
    const belowCanvas = layerCanvases.current.get(below.id);
    if (!selectedCanvas || !belowCanvas) {
      const error = 'One of the selected layers is missing its pixels.';
      addActivity('Merge failed', error);
      return { merged: false, error };
    }
    const before = captureLayerSnapshot(layers, activeLayer);

    // Bake both visible layers into one transparent raster, preserving how the
    // pair looked on the canvas while leaving the result fully editable.
    const mergedCanvas = makeCanvas();
    const ctx = mergedCanvas.getContext('2d')!;
    if (below.visible) {
      ctx.save(); ctx.globalAlpha = below.opacity / 100; ctx.globalCompositeOperation = below.blend; ctx.drawImage(belowCanvas, 0, 0); ctx.restore();
    }
    if (selected.visible) {
      ctx.save(); ctx.globalAlpha = selected.opacity / 100; ctx.globalCompositeOperation = selected.blend; ctx.drawImage(selectedCanvas, 0, 0); ctx.restore();
    }

    const mergedName = `${below.name} + ${selected.name}`.slice(0, 80);
    const mergedLayer: Layer = {
      ...below,
      name: mergedName,
      visible: selected.visible || below.visible,
      opacity: 100,
      blend: 'source-over',
      ai: selected.ai || below.ai,
    };
    const nextLayers = [...layers];
    nextLayers.splice(index, 2, mergedLayer);
    layerCanvases.current.set(below.id, mergedCanvas);
    layerCanvases.current.delete(selected.id);
    const after = captureLayerSnapshot(nextLayers, below.id);
    undoStack.current.push({ kind: 'layers', before, after });
    if (undoStack.current.length > 15) undoStack.current.shift();
    redoStack.current = [];
    setLayers(nextLayers);
    setActiveLayer(below.id);
    addActivity('Layers merged', `${selected.name} into ${below.name}`);
    return { merged: true, layerId: below.id, name: mergedName, mergedLayerIds: [selected.id, below.id] };
  }, [activeLayer, addActivity, captureLayerSnapshot, layers]);

  const canEditWithAgent = hasUsableSelection(tool, selection);

  actionsRef.current = {
    getState: () => ({
      canvas: { width: WIDTH, height: HEIGHT, zoom },
      activeTool: tool,
      activeLayer,
      selection,
      agentEdit: canEditWithAgent
        ? { ready: true, nextStep: 'The user has selected a region. You may call prepare_ai_edit to fetch its pixels and mask.' }
        : { ready: false, code: 'selection_required', userInstruction: 'Tell the user to choose the Region select (arrow) tool, drag over the area to edit, then ask you to try again.' },
      layers: layers.map(({ id, name, visible, opacity, ai }) => ({ id, name, visible, opacity, ai: !!ai })),
    }),
    createLayer,
    setTool: (next: Tool) => { changeTool(next); addActivity('Agent changed tool', next); return next; },
    select: (next: Selection) => { const safe = { x: Math.max(0, Math.min(WIDTH - 1, next.x)), y: Math.max(0, Math.min(HEIGHT - 1, next.y)), width: Math.max(1, Math.min(WIDTH, next.width)), height: Math.max(1, Math.min(HEIGHT, next.height)) }; setSelection(safe); addActivity('Agent selected region', `${Math.round(safe.width)} × ${Math.round(safe.height)} px`); return safe; },
    prepareAiEdit,
    insertAiResult,
    mergeLayerDown,
    toggleLayer: (id: string, visible: boolean) => { setLayers((items) => items.map((layer) => layer.id === id ? { ...layer, visible } : layer)); addActivity('Agent updated layer', visible ? 'Shown' : 'Hidden'); return { id, visible }; },
  };

  useEffect(() => {
    const mc = document.modelContext; if (!mc) { setWebMcp('fallback'); return; }
    const controller = new AbortController();
    const tools: WebMCPTool[] = [
      { name: 'get_document_state', title: 'Inspect DUET document', description: 'Returns the canvas, selection, active tool, editable layer stack, and whether a selected region is ready for an agent edit. When agentEdit.ready is false, direct the user to select an area before continuing.', execute: () => response(actionsRef.current.getState()) },
      { name: 'create_layer', title: 'Create an editable layer', description: 'Creates a transparent paint layer and makes it active.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Short layer name' } } }, execute: ({ name }) => response({ layerId: actionsRef.current.createLayer(String(name || 'Agent layer')) }) },
      { name: 'set_active_tool', title: 'Choose an editing tool', description: 'Selects the brush, eraser, region selection, or pan tool.', inputSchema: { type: 'object', properties: { tool: { type: 'string', enum: ['select', 'brush', 'eraser', 'pan'] } }, required: ['tool'] }, execute: ({ tool: next }) => response({ tool: actionsRef.current.setTool(next as Tool) }) },
      { name: 'select_region', title: 'Select a canvas region', description: 'Creates the region that the next AI edit should modify.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }, required: ['x', 'y', 'width', 'height'] }, execute: ({ x, y, width, height }) => response(actionsRef.current.select({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) })) },
      { name: 'prepare_ai_edit', title: 'Prepare pixels for an agent edit', description: 'Returns a composited context crop, active-layer crop, selection mask, placement metadata, and optional prompt under a temporary edit ID. Use this before generating an image. If no active region is selected, it returns selection_required; tell the user to select an area and try again.', inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'Optional visual edit instruction. Omit to let the agent decide.' } } }, execute: ({ prompt: edit }) => response(actionsRef.current.prepareAiEdit(typeof edit === 'string' ? edit : '')) },
      { name: 'insert_ai_result', title: 'Insert an agent-generated image layer', description: 'Accepts a generated PNG, JPEG, or WebP data URL for a prepared edit ID, aligns it to the saved crop, clips it to the original selection, and creates a new editable layer.', inputSchema: { type: 'object', properties: { editId: { type: 'string', description: 'Temporary ID returned by prepare_ai_edit' }, imageDataUrl: { type: 'string', description: 'Base64 image data URL for the complete prepared crop' }, name: { type: 'string', description: 'Optional new layer name' } }, required: ['editId', 'imageDataUrl'] }, execute: async ({ editId, imageDataUrl, name }) => response(await actionsRef.current.insertAiResult(String(editId), String(imageDataUrl), typeof name === 'string' ? name : undefined)) },
      { name: 'merge_layer_down', title: 'Merge the selected layer down', description: 'Flattens the selected layer into the layer directly beneath it and keeps the merged pixels editable as one layer.', execute: () => response(actionsRef.current.mergeLayerDown()) },
      { name: 'set_layer_visibility', title: 'Show or hide a layer', description: 'Changes layer visibility without destroying its pixels.', inputSchema: { type: 'object', properties: { layerId: { type: 'string' }, visible: { type: 'boolean' } }, required: ['layerId', 'visible'] }, execute: ({ layerId, visible }) => response(actionsRef.current.toggleLayer(String(layerId), Boolean(visible))) },
    ];
    Promise.all(tools.map((item) => mc.registerTool(item, { signal: controller.signal }))).then(() => setWebMcp('ready')).catch(() => setWebMcp('fallback'));
    return () => controller.abort();
  }, []);

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT }; };
  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => { const ctx = layerCanvases.current.get(activeLayer)?.getContext('2d'); if (!ctx) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize; ctx.strokeStyle = brushColor; ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore(); render(); };
  const startPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') {
      const viewport = viewportRef.current; if (!viewport) return;
      event.currentTarget.setPointerCapture(event.pointerId); panning.current = true;
      panStart.current = { x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
      return;
    }
    const point = pointer(event); event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'select') { selectionStart.current = point; setSelection({ x: point.x, y: point.y, width: 0, height: 0 }); drawing.current = true; return; }
    const ctx = layerCanvases.current.get(activeLayer)?.getContext('2d'); if (!ctx) return;
    undoStack.current.push({ kind: 'pixels', layerId: activeLayer, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
    drawing.current = true; lastPoint.current = point; drawStroke(point, point);
  };
  const movePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panning.current) {
      const viewport = viewportRef.current; if (!viewport) return;
      viewport.scrollLeft = panStart.current.scrollLeft - (event.clientX - panStart.current.x);
      viewport.scrollTop = panStart.current.scrollTop - (event.clientY - panStart.current.y);
      return;
    }
    if (!drawing.current) return; const point = pointer(event);
    if (tool === 'select') { const start = selectionStart.current; setSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }); return; }
    drawStroke(lastPoint.current, point); lastPoint.current = point;
  };
  const endPointer = () => { if (drawing.current && tool === 'select') addActivity('Region selected', `${Math.round(selection.width)} × ${Math.round(selection.height)} px`); drawing.current = false; panning.current = false; };
  const undo = useCallback(() => {
    const entry = undoStack.current.pop(); if (!entry) return;
    if (entry.kind === 'layers') { restoreLayerSnapshot(entry.before); redoStack.current.push(entry); return; }
    const ctx = layerCanvases.current.get(entry.layerId)?.getContext('2d'); if (!ctx) return;
    redoStack.current.push({ kind: 'pixels', layerId: entry.layerId, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); ctx.putImageData(entry.image, 0, 0); render();
  }, [render, restoreLayerSnapshot]);
  const redo = () => {
    const entry = redoStack.current.pop(); if (!entry) return;
    if (entry.kind === 'layers') { restoreLayerSnapshot(entry.after); undoStack.current.push(entry); return; }
    const ctx = layerCanvases.current.get(entry.layerId)?.getContext('2d'); if (!ctx) return;
    undoStack.current.push({ kind: 'pixels', layerId: entry.layerId, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); ctx.putImageData(entry.image, 0, 0); render();
  };
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; const next = toolMeta.find((item) => item.key.toLowerCase() === event.key.toLowerCase()); if (next) changeTool(next.id); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') { event.preventDefault(); mergeLayerDown(); } if ((event.metaKey || event.ctrlKey) && (event.key === '+' || event.key === '=')) { event.preventDefault(); zoomAt(zoomRef.current * 1.15); } if ((event.metaKey || event.ctrlKey) && event.key === '-') { event.preventDefault(); zoomAt(zoomRef.current / 1.15); } if ((event.metaKey || event.ctrlKey) && event.key === '0') { event.preventDefault(); zoomAt(82); } }; window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown); }, [changeTool, mergeLayerDown, undo, zoomAt]);

  const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('One of the project layers could not be decoded.')); image.src = source; });
  const importRasterImage = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl); const id = `import-${Date.now()}`; const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!;
      const scale = Math.min(WIDTH / image.width, HEIGHT / image.height); const width = image.width * scale; const height = image.height * scale;
      ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
      layerCanvases.current.set(id, canvas); setLayers((items) => [{ id, name: file.name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#93b8cc,#e4b28d)' }, ...items]); setActiveLayer(id); addActivity('Photo imported', file.name);
    } finally { URL.revokeObjectURL(objectUrl); }
  };
  const importProject = async (file: File) => {
    if (file.size > MAX_PROJECT_BYTES) throw new Error('This project is larger than the 64 MB import limit.');
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('This is not a valid DUET project file.'); }
    if (!isRecord(parsed) || (parsed.format !== 'duet' && parsed.format !== 'baby-photoshop') || parsed.version !== 1 || !isRecord(parsed.canvas) || parsed.canvas.width !== WIDTH || parsed.canvas.height !== HEIGHT || typeof parsed.canvas.finalImage !== 'string' || !/^data:image\/png;base64,/i.test(parsed.canvas.finalImage) || !Array.isArray(parsed.layers) || !isRecord(parsed.document)) throw new Error('This project file is unsupported or incomplete.');
    const projectLayers = parsed.layers;
    const projectDocument = parsed.document;
    if (!projectLayers.length || projectLayers.length > MAX_PROJECT_LAYERS) throw new Error(`Projects must contain between 1 and ${MAX_PROJECT_LAYERS} layers.`);
    const knownIds = new Set<string>();
    const restored = await Promise.all(projectLayers.map(async (item, index) => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id || knownIds.has(item.id) || typeof item.pixels !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(item.pixels) || item.pixels.length > 12_000_000) throw new Error(`Layer ${index + 1} is invalid.`);
      knownIds.add(item.id);
      const image = await loadImage(item.pixels);
      if (image.naturalWidth !== WIDTH || image.naturalHeight !== HEIGHT) throw new Error(`Layer ${index + 1} has the wrong canvas dimensions.`);
      const canvas = makeCanvas(); canvas.getContext('2d')!.drawImage(image, 0, 0);
      const blend = typeof item.blend === 'string' && acceptedBlends.has(item.blend as GlobalCompositeOperation) ? item.blend as GlobalCompositeOperation : 'source-over';
      const layer: Layer = {
        id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 80) || `Layer ${index + 1}` : `Layer ${index + 1}`,
        visible: typeof item.visible === 'boolean' ? item.visible : true, opacity: boundedNumber(item.opacity, 100, 0, 100), blend,
        swatch: typeof item.swatch === 'string' && /^(#|linear-gradient\()/i.test(item.swatch) ? item.swatch : '#85808d', ai: item.ai === true,
      };
      return { layer, canvas };
    }));
    const nextTool: Tool = typeof projectDocument.tool === 'string' && ['select', 'brush', 'eraser', 'pan'].includes(projectDocument.tool) ? projectDocument.tool as Tool : 'select';
    const nextActiveLayer = typeof projectDocument.activeLayer === 'string' && restored.some(({ layer }) => layer.id === projectDocument.activeLayer) ? projectDocument.activeLayer : restored[0].layer.id;
    layerCanvases.current = new Map(restored.map(({ layer, canvas }) => [layer.id, canvas]));
    undoStack.current = []; redoStack.current = []; pendingEdits.current.clear();
    setLayers(restored.map(({ layer }) => layer)); setActiveLayer(nextActiveLayer); setSelection(safeSelection(projectDocument.selection));
    changeTool(nextTool);
    setBrushSize(Math.round(boundedNumber(projectDocument.brushSize, 28, 2, 96))); setBrushColor(typeof projectDocument.brushColor === 'string' && /^#[0-9a-f]{6}$/i.test(projectDocument.brushColor) ? projectDocument.brushColor : '#ff6b5f');
    const nextZoom = boundedNumber(projectDocument.zoom, 82, 25, 400); zoomRef.current = nextZoom; setZoom(nextZoom);
    addActivity('Project imported', `${restored.length} editable layers`);
  };
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith('.duet') || file.name.toLowerCase().endsWith('.babyps') || file.type === 'application/x-duet-project+json' || file.type === 'application/x-baby-photoshop+json') await importProject(file);
      else await importRasterImage(file);
    } catch (error) { addActivity('Import failed', error instanceof Error ? error.message : 'Could not read that file.'); }
    finally { event.target.value = ''; }
  };
  const exportImage = () => { render(); const dataUrl = displayRef.current?.toDataURL('image/png'); if (!dataUrl) return; const link = document.createElement('a'); link.download = 'duet-final.png'; link.href = dataUrl; link.click(); addActivity('Final image exported', 'PNG · 960 × 640'); };
  const exportProject = () => {
    try {
      const project: DuetProject = {
        format: 'duet', version: 1, exportedAt: new Date().toISOString(),
        canvas: { width: WIDTH, height: HEIGHT, finalImage: compositeCanvas().toDataURL('image/png') },
        document: { activeLayer, selection, prompt: '', tool, brushSize, brushColor, zoom },
        layers: layers.map((layer) => {
          const canvas = layerCanvases.current.get(layer.id); if (!canvas) throw new Error(`Layer “${layer.name}” is missing its pixels.`);
          return { ...layer, blend: layer.blend, pixels: canvas.toDataURL('image/png') };
        }),
      };
      downloadFile(new Blob([JSON.stringify(project)], { type: 'application/x-duet-project+json' }), `duet-${new Date().toISOString().slice(0, 10)}.duet`);
      addActivity('Project exported', `${layers.length} layers + final PNG`);
    } catch (error) { addActivity('Export failed', error instanceof Error ? error.message : 'Could not package this project.'); }
  };
  const removeActive = () => { if (layers.length <= 1) return; layerCanvases.current.delete(activeLayer); setLayers((items) => { const next = items.filter((layer) => layer.id !== activeLayer); setActiveLayer(next[0]?.id || ''); return next; }); addActivity('Layer removed', 'Canvas preserved'); };
  const moveLayer = (direction: -1 | 1) => setLayers((items) => { const index = items.findIndex((layer) => layer.id === activeLayer); const nextIndex = Math.max(0, Math.min(items.length - 1, index + direction)); if (index < 0 || index === nextIndex) return items; const next = [...items]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; });
  const beginLayerRename = (event: React.MouseEvent, layer: Layer) => {
    event.stopPropagation();
    setActiveLayer(layer.id);
    setEditingLayerId(layer.id);
    setEditingLayerName(layer.name);
  };
  const finishLayerRename = (save: boolean) => {
    if (!editingLayerId) return;
    const layerId = editingLayerId;
    const nextName = editingLayerName.trim().slice(0, 80);
    if (save && nextName) {
      const previousName = layers.find((layer) => layer.id === layerId)?.name;
      setLayers((items) => items.map((layer) => layer.id === layerId ? { ...layer, name: nextName } : layer));
      if (previousName && previousName !== nextName) addActivity('Layer renamed', nextName);
    }
    setEditingLayerId(null);
    setEditingLayerName('');
  };
  const activeOpacity = layers.find((layer) => layer.id === activeLayer)?.opacity ?? 100;

  return <TooltipProvider delay={350}><main className="editor-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><Sparkles size={15} /></div><span>DUET</span><span className="mvp-pill">CREATE WITH AI</span></div>
      <div className="document-title"><span>Untitled portrait</span><ChevronDown size={13} /></div>
      <div className="header-actions"><div className="mcp-status" title={webMcp === 'ready' ? 'Native WebMCP tools are registered' : 'Tools activate in a WebMCP-compatible browser'}><span className={`status-dot ${webMcp === 'ready' ? 'ready' : ''}`} /><Bot size={14} /><span>{webMcp === 'ready' ? 'WebMCP ready' : '8 agent tools'}</span></div><Button variant="ghost" size="sm" className="export-image-button" onClick={exportImage}><Download />Save</Button><Button size="sm" className="export-button" onClick={exportProject}><Download />Export</Button></div>
    </header>
    <section className="workspace">
      <aside className="tool-rail" aria-label="Editing tools">
        {toolMeta.map(({ id, label, icon: Icon, key }) => <Tooltip key={id}><TooltipTrigger aria-label={label} className={`tool-button ${tool === id ? 'active' : ''}`} onClick={() => changeTool(id)}><Icon size={19} strokeWidth={1.8} /></TooltipTrigger><TooltipContent side="right">{label} · {key}</TooltipContent></Tooltip>)}
        <div className="rail-divider" /><label className="color-control" title="Brush color"><input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} /><span style={{ background: brushColor }} /></label>
        <Tooltip><TooltipTrigger aria-label="Import image or project" className="tool-button" onClick={() => fileRef.current?.click()}><ImagePlus size={19} strokeWidth={1.8} /></TooltipTrigger><TooltipContent side="right">Import image or .duet project</TooltipContent></Tooltip><input ref={fileRef} className="hidden" type="file" accept="image/*,.duet,.babyps,application/x-duet-project+json,application/x-baby-photoshop+json" onChange={importFile} />
        <div className="rail-spacer" /><Tooltip><TooltipTrigger aria-label="Help" className="tool-button"><CircleHelp size={18} /></TooltipTrigger><TooltipContent side="right">B brush · E erase · V select</TooltipContent></Tooltip>
      </aside>
      <div className="canvas-column">
        <div className="context-bar"><div className="context-group"><strong>{tool === 'select' ? 'Region select' : tool[0].toUpperCase() + tool.slice(1)}</strong>{(tool === 'brush' || tool === 'eraser') && <><span className="bar-label">Size</span><Slider className="brush-slider" min={2} max={96} value={[brushSize]} onValueChange={(value) => setBrushSize(Array.isArray(value) ? value[0] : Number(value))} /><span className="size-readout">{brushSize}px</span></>}{tool === 'select' && <span className="bar-hint">Drag to focus the next AI edit</span>}</div><div className="history-controls"><Button variant="ghost" size="icon-sm" onClick={undo} aria-label="Undo"><Undo2 /></Button><Button variant="ghost" size="icon-sm" onClick={redo} aria-label="Redo"><Redo2 /></Button></div></div>
        <div ref={viewportRef} className="stage-viewport"><div ref={stageRef} className="canvas-stage" style={{ width: `${zoom}%` }}><div className="canvas-wrap"><canvas ref={displayRef} width={WIDTH} height={HEIGHT} aria-label="Editable image canvas" className={`main-canvas tool-${tool}`} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} />{selection.width > 3 && selection.height > 3 && <div className="selection-box" style={{ left: `${selection.x / WIDTH * 100}%`, top: `${selection.y / HEIGHT * 100}%`, width: `${selection.width / WIDTH * 100}%`, height: `${selection.height / HEIGHT * 100}%` }}><span className="selection-label">AI target</span><i className="handle tl" /><i className="handle tr" /><i className="handle bl" /><i className="handle br" /></div>}</div></div><div className="gesture-hint"><span>{Math.round(zoom)}%</span><span>Pinch to zoom</span><i /> <span>Two-finger drag to pan</span></div><div className="canvas-caption"><span className="live-dot" /> Live document · humans + agents share this canvas</div></div>
      </div>
      <aside className="right-panel">
        <section className="ai-panel"><div className="panel-heading"><div><WandSparkles size={16} /><strong>Agent edit</strong></div><span>{canEditWithAgent ? 'region ready' : 'select a region'}</span></div>{!canEditWithAgent ? <p className="tool-required-hint"><strong>Select an area first.</strong> Choose the Region select arrow, then drag over the part of the canvas you want your agent to read or edit.</p> : <div className="agent-ready-hint"><strong>Region selected — ready in agent chat.</strong><span>Ask your connected agent in chat to edit this selection. It can use WebMCP to fetch the crop; images are sent and received in chat.</span></div>}</section>
        <section className="layers-panel"><div className="panel-heading layer-heading"><div><Layers3 size={16} /><strong>Layers</strong><span className="layer-count">{layers.length}</span></div><div className="layer-actions"><Button variant="ghost" size="icon-xs" aria-label="Move layer up" onClick={() => moveLayer(-1)}><ArrowUp /></Button><Button variant="ghost" size="icon-xs" aria-label="Move layer down" onClick={() => moveLayer(1)}><ArrowDown /></Button><Button variant="ghost" size="icon-xs" aria-label="New layer" onClick={() => createLayer()}><Plus /></Button></div></div><div className="opacity-row"><span>Opacity</span><Slider min={0} max={100} value={[activeOpacity]} onValueChange={(value) => { const opacity = Array.isArray(value) ? value[0] : Number(value); setLayers((items) => items.map((layer) => layer.id === activeLayer ? { ...layer, opacity } : layer)); }} /><span>{Math.round(activeOpacity)}%</span></div><div className="layer-list">{layers.map((layer) => <button key={layer.id} className={`layer-row ${activeLayer === layer.id ? 'active' : ''}`} onClick={() => setActiveLayer(layer.id)}><span className="visibility-toggle" role="button" tabIndex={0} aria-label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(event) => { event.stopPropagation(); setLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item)); }}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</span><canvas ref={(node) => { if (node) thumbnailRefs.current.set(layer.id, node); else thumbnailRefs.current.delete(layer.id); }} width={68} height={50} className="layer-thumb" style={{ background: layer.swatch }} aria-hidden="true" />{editingLayerId === layer.id ? <input autoFocus value={editingLayerName} aria-label="Layer name" className="layer-name-input" onChange={(event) => setEditingLayerName(event.target.value)} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onBlur={() => finishLayerRename(true)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishLayerRename(true); } if (event.key === 'Escape') { event.preventDefault(); finishLayerRename(false); } }} /> : <span className="layer-name" title="Double-click to rename" onDoubleClick={(event) => beginLayerRename(event, layer)}>{layer.name}<small>{layer.ai ? 'AI result · editable' : 'Pixel layer'}</small></span>}{activeLayer === layer.id && <Check size={13} className="active-check" />}</button>)}</div><div className="layer-footer"><div className="layer-footer-main"><Button variant="ghost" size="sm" onClick={() => createLayer()}><Plus />New layer</Button><Button variant="ghost" size="sm" onClick={mergeLayerDown} disabled={layers.findIndex((layer) => layer.id === activeLayer) >= layers.length - 1} title="Merge selected layer into the layer below (⌘E / Ctrl+E)"><Merge className="merge-down-icon" />Merge down</Button></div><Button variant="ghost" size="icon-sm" aria-label="Delete layer" onClick={removeActive} disabled={layers.length <= 1}><Trash2 /></Button></div></section>
        <section className="activity-panel"><div className="panel-heading"><div><Bot size={15} /><strong>Shared activity</strong></div><button aria-label="Close activity"><X size={14} /></button></div><div className="activity-list">{activities.slice(0, 3).map((item) => <div className="activity-row" key={item.id}><span className="activity-icon"><Sparkles size={12} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><time>{item.time}</time></div>)}</div></section>
      </aside>
    </section>
  </main></TooltipProvider>;
}
