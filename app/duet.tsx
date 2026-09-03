'use client';

import {
  ArrowDown, ArrowUp, Bot, Brush, Check, ChevronDown, CircleHelp, Copy, Download,
  Droplets, Eraser, Eye, EyeOff, Focus, Hand, ImagePlus, LassoSelect, Layers3, MousePointer2, Move, Paintbrush,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pipette, Plus, Redo2, Merge,
  Send, Sparkles, SquareDashed, Trash2, Type as TypeIcon, Undo2, WandSparkles, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AnimationStudio, type AnimationStudioHandle } from './animation-studio';

type Tool = 'select' | 'layer-lasso' | 'transform' | 'brush' | 'eraser' | 'smudge' | 'blur' | 'text' | 'eyedropper' | 'pan';
type SelectionMode = 'rectangle' | 'brush' | 'lasso';
type TextFont = 'sans' | 'serif' | 'mono' | 'rounded';
type TextDraft = { x: number; y: number; value: string };
type Layer = { id: string; name: string; visible: boolean; opacity: number; blend: GlobalCompositeOperation; swatch: string; ai?: boolean };
type Selection = { x: number; y: number; width: number; height: number };
type Activity = { id: number; title: string; detail: string; time: string };
type AgentBundleStatus = 'draft' | 'sent';
type AgentSelectionItem = {
  id: string;
  name: string;
  drawingId: string;
  layerId: string;
  layerName: string;
  source: Selection;
  selection: Selection;
  mask: ImageData;
  compositeCrop: string;
  activeLayerCrop: string;
  maskDataUrl: string;
  contextImage: string;
  previewDataUrl: string;
  createdAt: number;
};
type AgentBundleSnapshot = { items: AgentSelectionItem[]; targetId: string | null; status: AgentBundleStatus; bundleId: string | null; sentAt: number | null };
type PendingEdit = { id: string; bundleId: string; drawingId: string; prompt: string; source: Selection; selection: Selection; mask: ImageData; contextCount: number; createdAt: number };
type WebMCPTool = { name: string; title?: string; description: string; inputSchema?: Record<string, unknown>; execute: (input: Record<string, unknown>, options?: ToolExecutionOptions) => Promise<unknown> | unknown };
type ToolExecutionOptions = { signal: AbortSignal };
type SavedProjectLayer = Omit<Layer, 'blend'> & { blend: string; pixels: string };
type LayerSnapshot = { layers: Layer[]; activeLayer: string; pixels: Array<{ id: string; image: ImageData }> };
type SavedLayerSelection = { layerId: string; base: ImageData; pixels: ImageData; pixelWidth: number; pixelHeight: number; source: Selection; bounds: Selection };
type DrawingState = {
  snapshot: LayerSnapshot;
  selection: Selection;
  selectionMask: ImageData;
  selectionMode: SelectionMode;
  selectionBrushSize: number;
  layerSelection: SavedLayerSelection | null;
  tool: Tool;
  brushSize: number;
  brushOpacity: number;
  brushColor: string;
  effectStrength: number;
  textFont: TextFont;
  textSize: number;
  zoom: number;
  viewport: { scrollLeft: number; scrollTop: number };
  chrome: { leftSidebarOpen: boolean; rightSidebarOpen: boolean; showBranding: boolean };
  agentBundle: AgentBundleSnapshot;
  activities: Activity[];
  undo: HistoryEntry[];
  redo: HistoryEntry[];
};
type WorkspaceDrawing = { id: string; name: string; state?: DrawingState };
type PhotoAsset = { id: string; name: string; dataUrl: string; width: number; height: number; createdAt: number };
type HistoryEntry =
  | { kind: 'pixels'; layerId: string; image: ImageData }
  | { kind: 'layers'; before: LayerSnapshot; after: LayerSnapshot };
type TransformMode = 'move' | 'tl' | 'tr' | 'bl' | 'br';
type ActiveTransform = { source: Selection; image: ImageData; pointer: { x: number; y: number }; mode: TransformMode };
type LayerSelectionData = { layerId: string; base: ImageData; pixels: HTMLCanvasElement; source: Selection; bounds: Selection };
type ActiveLayerSelectionTransform = { start: Selection; pointer: { x: number; y: number }; mode: TransformMode };
type DuetProject = {
  format: 'duet'; version: 1; exportedAt: string;
  canvas: { width: number; height: number; finalImage: string };
  document: { name?: string; activeLayer: string; selection: Selection; prompt: string; tool: Tool; brushSize: number; brushOpacity?: number; brushColor: string; effectStrength?: number; textFont?: TextFont; textSize?: number; zoom: number };
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
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const PHOTO_LIBRARY_DB = 'duet-workspace';
const PHOTO_LIBRARY_STORE = 'photos';
const acceptedBlends = new Set<GlobalCompositeOperation>(['source-over', 'multiply', 'screen', 'overlay', 'soft-light']);
const initialLayers: Layer[] = [
  { id: 'ai-light', name: 'AI — warm window light', visible: true, opacity: 78, blend: 'soft-light', swatch: 'linear-gradient(135deg,#ffb86b,#9159e8)', ai: true },
  { id: 'portrait', name: 'Studio portrait', visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#e5b58a,#5a3254)' },
  { id: 'backdrop', name: 'Backdrop', visible: true, opacity: 100, blend: 'source-over', swatch: '#d9d1c8' },
];
const toolMeta: Array<{ id: Tool; label: string; icon: typeof Brush; key: string }> = [
  { id: 'select', label: 'Select region', icon: MousePointer2, key: 'V' },
  { id: 'layer-lasso', label: 'Layer lasso', icon: LassoSelect, key: 'L' },
  { id: 'transform', label: 'Transform layer', icon: Move, key: 'T' },
  { id: 'brush', label: 'Brush', icon: Brush, key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'smudge', label: 'Smudge', icon: Droplets, key: 'S' },
  { id: 'blur', label: 'Blur', icon: Focus, key: 'U' },
  { id: 'text', label: 'Text', icon: TypeIcon, key: 'A' },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette, key: 'I' },
  { id: 'pan', label: 'Pan canvas', icon: Hand, key: 'H' },
];
const textFonts: Array<{ id: TextFont; label: string; family: string }> = [
  { id: 'sans', label: 'Sans', family: 'Arial, Helvetica, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', family: '"Courier New", monospace' },
  { id: 'rounded', label: 'Rounded', family: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif' },
];

type HsvColor = { h: number; s: number; v: number };
type EyedropperPreview = { x: number; y: number; color: string };
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function hexToRgb(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return { r: 255, g: 107, b: 95 };
  const value = Number.parseInt(match[1], 16);
  return { r: value >> 16, g: (value >> 8) & 255, b: value & 255 };
}
function rgbToHex(r: number, g: number, b: number) { return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`; }
function hsvToHex({ h, s, v }: HsvColor) {
  const chroma = (v / 100) * (s / 100); const segment = ((h % 360) + 360) % 360 / 60; const second = chroma * (1 - Math.abs(segment % 2 - 1));
  const [r, g, b] = segment < 1 ? [chroma, second, 0] : segment < 2 ? [second, chroma, 0] : segment < 3 ? [0, chroma, second] : segment < 4 ? [0, second, chroma] : segment < 5 ? [second, 0, chroma] : [chroma, 0, second];
  const base = v / 100 - chroma;
  return rgbToHex((r + base) * 255, (g + base) * 255, (b + base) * 255);
}
function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(hex); const red = r / 255; const green = g / 255; const blue = b / 255;
  const max = Math.max(red, green, blue); const min = Math.min(red, green, blue); const delta = max - min;
  let h = 0;
  if (delta) h = max === red ? 60 * (((green - blue) / delta) % 6) : max === green ? 60 * ((blue - red) / delta + 2) : 60 * ((red - green) / delta + 4);
  return { h: (h + 360) % 360, s: max ? delta / max * 100 : 0, v: max * 100 };
}

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
function contentBounds(canvas: HTMLCanvasElement): Selection | null {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT);
  let left = WIDTH; let top = HEIGHT; let right = -1; let bottom = -1;
  for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    if (data[(y * WIDTH + x) * 4 + 3] < 2) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
const agentEditPolicy = {
  requirement: 'For every requested document edit, use this page\'s WebMCP tools. Do not use browser clicks, pointer drags, keyboard shortcuts, or the visible canvas controls as an alternative editing route.',
  whenBlocked: 'If preparing, sending, or generating the frozen edit target and context pixels is blocked by a privacy policy, missing permission, or unavailable capability, do not modify the document in any way. State the exact blocker and either request the needed permission or tell the user the edit cannot continue.',
  forbiddenFallbacks: ['manual brush or eraser strokes', 'local canvas edits', 'creating or changing layers as a substitute', 'a different visual edit than the requested one'],
};
function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function fileStem(name: string) {
  return name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').slice(0, 80) || 'Untitled artwork';
}
function openPhotoLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PHOTO_LIBRARY_DB, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(PHOTO_LIBRARY_STORE)) request.result.createObjectStore(PHOTO_LIBRARY_STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('Photo library could not be opened.'));
  });
}
async function readPhotoLibrary() {
  const database = await openPhotoLibrary();
  try {
    return await new Promise<PhotoAsset[]>((resolve, reject) => {
      const request = database.transaction(PHOTO_LIBRARY_STORE, 'readonly').objectStore(PHOTO_LIBRARY_STORE).getAll();
      request.onsuccess = () => resolve((request.result as PhotoAsset[]).sort((a, b) => b.createdAt - a.createdAt)); request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}
async function savePhotoAsset(asset: PhotoAsset) {
  const database = await openPhotoLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(PHOTO_LIBRARY_STORE, 'readwrite').objectStore(PHOTO_LIBRARY_STORE).put(asset);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export function Duet() {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const selectionMaskRef = useRef<HTMLCanvasElement | null>(null);
  const selectionOverlayRef = useRef<HTMLCanvasElement>(null);
  const lassoPoints = useRef<Array<{ x: number; y: number }>>([]);
  const layerSelectionOverlayRef = useRef<HTMLCanvasElement>(null);
  const layerLassoPoints = useRef<Array<{ x: number; y: number }>>([]);
  const layerSelectionRef = useRef<LayerSelectionData | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const documentMenuRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const colorSquareRef = useRef<HTMLDivElement>(null);
  const hueSliderRef = useRef<HTMLDivElement>(null);
  const colorDrag = useRef<'hue' | 'sv' | null>(null);
  const skipInitialColorHistorySave = useRef(true);
  const eyedropperColor = useRef<string | null>(null);
  const smudgeBufferRef = useRef<HTMLCanvasElement | null>(null);
  const layerCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const thumbnailRefs = useRef(new Map<string, HTMLCanvasElement>());
  const initialized = useRef(false);
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const selectionStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const panning = useRef(false);
  const activeTransform = useRef<ActiveTransform | null>(null);
  const activeLayerSelectionTransform = useRef<ActiveLayerSelectionTransform | null>(null);
  const zoomRef = useRef(82);
  const zoomFrame = useRef<number | null>(null);
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const pendingEdits = useRef(new Map<string, PendingEdit>());
  const actionsRef = useRef<Record<string, (...args: any[]) => any>>({});
  const animationStudioRef = useRef<AnimationStudioHandle>(null);

  const [layers, setLayers] = useState(initialLayers);
  const [activeLayer, setActiveLayer] = useState('ai-light');
  const [tool, setTool] = useState<Tool>('select');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('rectangle');
  const [selectionBrushSize, setSelectionBrushSize] = useState(52);
  const [brushSize, setBrushSize] = useState(28);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [effectStrength, setEffectStrength] = useState(55);
  const [brushColor, setBrushColor] = useState('#ff6b5f');
  const [textFont, setTextFont] = useState<TextFont>('sans');
  const [textSize, setTextSize] = useState(48);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [colorHistory, setColorHistory] = useState<string[]>([]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv('#ff6b5f'));
  const [hexDraft, setHexDraft] = useState('#ff6b5f');
  const [eyedropperPreview, setEyedropperPreview] = useState<EyedropperPreview | null>(null);
  const [zoom, setZoom] = useState(82);
  const [selection, setSelection] = useState<Selection>({ x: 490, y: 155, width: 300, height: 330 });
  const [layerSelectionBounds, setLayerSelectionBounds] = useState<Selection | null>(null);
  const [transformBounds, setTransformBounds] = useState<Selection | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [webMcp, setWebMcp] = useState<'ready' | 'fallback'>('fallback');
  const [agentSelections, setAgentSelections] = useState<AgentSelectionItem[]>([]);
  const [agentTargetId, setAgentTargetId] = useState<string | null>(null);
  const [agentBundleStatus, setAgentBundleStatus] = useState<AgentBundleStatus>('draft');
  const [agentBundleId, setAgentBundleId] = useState<string | null>(null);
  const [agentBundleSentAt, setAgentBundleSentAt] = useState<number | null>(null);
  const [draggingAgentItemId, setDraggingAgentItemId] = useState<string | null>(null);
  const [agentDropZone, setAgentDropZone] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState('Untitled portrait');
  const [editingDocumentName, setEditingDocumentName] = useState(false);
  const [documentNameDraft, setDocumentNameDraft] = useState('Untitled portrait');
  const [documentMenuOpen, setDocumentMenuOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [photoLibrary, setPhotoLibrary] = useState<PhotoAsset[]>([]);
  const [currentDrawingId, setCurrentDrawingId] = useState('drawing-initial');
  const [workspaceDrawings, setWorkspaceDrawings] = useState<WorkspaceDrawing[]>([{ id: 'drawing-initial', name: 'Untitled portrait' }]);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [showBranding, setShowBranding] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<'illustration' | 'animation'>('illustration');
  const [activities, setActivities] = useState<Activity[]>([
    { id: 1, title: 'Agent added a layer', detail: 'Warm window light', time: 'now' },
    { id: 2, title: 'Region selected', detail: '300 × 330 px', time: '1m' },
  ]);
  const changeTool = useCallback((next: Tool) => {
    setTool(next);
    if (next !== 'smudge') smudgeBufferRef.current = null;
    if (next !== 'eyedropper') { eyedropperColor.current = null; setEyedropperPreview(null); }
    if (next !== 'select') {
      setSelection({ x: 0, y: 0, width: 0, height: 0 });
      const mask = selectionMaskRef.current; if (mask) mask.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
      selectionOverlayRef.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
      lassoPoints.current = [];
    }
    if (next !== 'layer-lasso') {
      layerSelectionRef.current = null; layerLassoPoints.current = []; setLayerSelectionBounds(null);
      layerSelectionOverlayRef.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
    }
  }, []);

  const setColor = useCallback((next: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(next)) return;
    const color = next.toLowerCase();
    setBrushColor(color);
    setHsv(hexToHsv(color));
    setHexDraft(color);
  }, []);
  const rememberUsedColor = useCallback(() => {
    setColorHistory((items) => [brushColor, ...items.filter((item) => item !== brushColor)].slice(0, 12));
  }, [brushColor]);
  const setColorFromHsv = useCallback((next: HsvColor) => {
    const safe = { h: ((next.h % 360) + 360) % 360, s: clamp(next.s, 0, 100), v: clamp(next.v, 0, 100) };
    setHsv(safe);
    setColor(hsvToHex(safe));
  }, [setColor]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('duet-used-colours-v2');
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color));
        if (valid.length) setColorHistory([...new Set(valid.map((color) => color.toLowerCase()))].slice(0, 12));
      }
    } catch { /* Recent colours are optional local convenience data. */ }
  }, []);
  useEffect(() => {
    if (skipInitialColorHistorySave.current) { skipInitialColorHistorySave.current = false; return; }
    try { window.localStorage.setItem('duet-used-colours-v2', JSON.stringify(colorHistory)); } catch { /* Ignore blocked storage. */ }
  }, [colorHistory]);
  useEffect(() => {
    const closePicker = (event: PointerEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) setColorPickerOpen(false);
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) setImportMenuOpen(false);
      if (documentMenuRef.current && !documentMenuRef.current.contains(event.target as Node)) setDocumentMenuOpen(false);
    };
    document.addEventListener('pointerdown', closePicker);
    return () => document.removeEventListener('pointerdown', closePicker);
  }, []);
  useEffect(() => {
    readPhotoLibrary().then(setPhotoLibrary).catch(() => { /* IndexedDB can be blocked by browser privacy settings. */ });
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

  const renderLayerList = useCallback((layerList: Layer[]) => {
    const ctx = displayRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    [...layerList].reverse().forEach((layer) => {
      const source = layerCanvases.current.get(layer.id);
      if (!source || !layer.visible) return;
      ctx.save(); ctx.globalAlpha = layer.opacity / 100; ctx.globalCompositeOperation = layer.blend; ctx.drawImage(source, 0, 0); ctx.restore();
    });
    layerList.forEach((layer) => {
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
  }, []);
  const render = useCallback(() => renderLayerList(layers), [layers, renderLayerList]);

  const redrawSelectionOverlay = useCallback(() => {
    const overlay = selectionOverlayRef.current; const mask = selectionMaskRef.current;
    if (!overlay || !mask) return;
    const ctx = overlay.getContext('2d')!; ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save(); ctx.globalAlpha = .3; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#8d65ff'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.restore();
    if (lassoPoints.current.length > 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.beginPath();
      lassoPoints.current.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.stroke(); ctx.restore();
    }
  }, []);
  const redrawLayerSelectionOverlay = useCallback(() => {
    const overlay = layerSelectionOverlayRef.current; if (!overlay) return;
    const ctx = overlay.getContext('2d')!; ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const selected = layerSelectionRef.current;
    if (selected) {
      ctx.save(); ctx.globalAlpha = .34;
      ctx.drawImage(selected.pixels, 0, 0, selected.pixels.width, selected.pixels.height, selected.bounds.x, selected.bounds.y, selected.bounds.width, selected.bounds.height);
      ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#65d9ff'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.restore();
    }
    if (layerLassoPoints.current.length > 1) {
      ctx.save(); ctx.strokeStyle = 'rgba(128,221,255,.98)'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.beginPath();
      layerLassoPoints.current.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.stroke(); ctx.restore();
    }
  }, []);
  const clearLayerSelection = useCallback(() => {
    layerSelectionRef.current = null; layerLassoPoints.current = []; activeLayerSelectionTransform.current = null; setLayerSelectionBounds(null);
    layerSelectionOverlayRef.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
  }, []);
  const finishLayerLasso = useCallback(() => {
    const points = layerLassoPoints.current; const source = layerCanvases.current.get(activeLayer);
    if (!source || points.length < 3) { clearLayerSelection(); return null; }
    const mask = makeCanvas(); const maskCtx = mask.getContext('2d')!; maskCtx.fillStyle = '#fff'; maskCtx.beginPath();
    points.forEach((point, index) => index ? maskCtx.lineTo(point.x, point.y) : maskCtx.moveTo(point.x, point.y)); maskCtx.closePath(); maskCtx.fill();
    const bounds = contentBounds(mask); if (!bounds || bounds.width < MIN_SELECTION_SIZE || bounds.height < MIN_SELECTION_SIZE) { clearLayerSelection(); return null; }
    const pixels = document.createElement('canvas'); pixels.width = bounds.width; pixels.height = bounds.height;
    const pixelsCtx = pixels.getContext('2d')!; pixelsCtx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    pixelsCtx.globalCompositeOperation = 'destination-in'; pixelsCtx.drawImage(mask, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    const baseCanvas = makeCanvas(); const baseCtx = baseCanvas.getContext('2d')!; baseCtx.drawImage(source, 0, 0); baseCtx.globalCompositeOperation = 'destination-out'; baseCtx.drawImage(mask, 0, 0);
    const selected: LayerSelectionData = { layerId: activeLayer, base: baseCtx.getImageData(0, 0, WIDTH, HEIGHT), pixels, source: bounds, bounds: { ...bounds } };
    layerSelectionRef.current = selected; layerLassoPoints.current = []; setLayerSelectionBounds({ ...bounds }); redrawLayerSelectionOverlay(); return bounds;
  }, [activeLayer, clearLayerSelection, redrawLayerSelectionOverlay]);
  const redrawLayerSelectionTransform = useCallback((transform: ActiveLayerSelectionTransform, point: { x: number; y: number }) => {
    const selected = layerSelectionRef.current; if (!selected) return;
    const canvas = layerCanvases.current.get(selected.layerId); if (!canvas) return;
    const start = transform.start; let next: Selection;
    if (transform.mode === 'move') {
      const dx = point.x - transform.pointer.x; const dy = point.y - transform.pointer.y;
      next = { x: Math.max(-start.width + 8, Math.min(WIDTH - 8, start.x + dx)), y: Math.max(-start.height + 8, Math.min(HEIGHT - 8, start.y + dy)), width: start.width, height: start.height };
    } else {
      const anchorX = transform.mode.includes('l') ? start.x + start.width : start.x; const anchorY = transform.mode.includes('t') ? start.y + start.height : start.y;
      const rawX = transform.mode.includes('l') ? point.x : start.x; const rawY = transform.mode.includes('t') ? point.y : start.y;
      const width = Math.max(12, Math.abs(anchorX - rawX)); const height = Math.max(12, Math.abs(anchorY - rawY));
      next = { x: Math.min(anchorX, rawX), y: Math.min(anchorY, rawY), width, height };
    }
    const ctx = canvas.getContext('2d')!; ctx.putImageData(selected.base, 0, 0); ctx.drawImage(selected.pixels, 0, 0, selected.pixels.width, selected.pixels.height, next.x, next.y, next.width, next.height);
    selected.bounds = next; setLayerSelectionBounds(next); redrawLayerSelectionOverlay(); render();
  }, [redrawLayerSelectionOverlay, render]);
  const clearSelection = useCallback(() => {
    const mask = selectionMaskRef.current; if (mask) mask.getContext('2d')!.clearRect(0, 0, WIDTH, HEIGHT);
    lassoPoints.current = []; setSelection({ x: 0, y: 0, width: 0, height: 0 }); redrawSelectionOverlay();
  }, [redrawSelectionOverlay]);
  const applyRectangleSelection = useCallback((rect: Selection) => {
    const mask = selectionMaskRef.current; if (!mask) return;
    const safe = safeSelection(rect); const ctx = mask.getContext('2d')!; ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = '#fff'; ctx.fillRect(safe.x, safe.y, safe.width, safe.height);
    setSelection(safe); redrawSelectionOverlay();
  }, [redrawSelectionOverlay]);
  const updateSelectionFromMask = useCallback(() => {
    const mask = selectionMaskRef.current; const bounds = mask ? contentBounds(mask) : null;
    const next = bounds || { x: 0, y: 0, width: 0, height: 0 }; setSelection(next); redrawSelectionOverlay(); return next;
  }, [redrawSelectionOverlay]);
  const paintSelectionStroke = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mask = selectionMaskRef.current; if (!mask) return;
    const ctx = mask.getContext('2d')!; ctx.save(); ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = selectionBrushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.beginPath(); ctx.arc(to.x, to.y, selectionBrushSize / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const radius = selectionBrushSize / 2; const strokeLeft = Math.max(0, Math.min(from.x, to.x) - radius); const strokeTop = Math.max(0, Math.min(from.y, to.y) - radius); const strokeRight = Math.min(WIDTH, Math.max(from.x, to.x) + radius); const strokeBottom = Math.min(HEIGHT, Math.max(from.y, to.y) + radius);
    setSelection((current) => current.width > 0 && current.height > 0 ? { x: Math.min(current.x, strokeLeft), y: Math.min(current.y, strokeTop), width: Math.max(current.x + current.width, strokeRight) - Math.min(current.x, strokeLeft), height: Math.max(current.y + current.height, strokeBottom) - Math.min(current.y, strokeTop) } : { x: strokeLeft, y: strokeTop, width: strokeRight - strokeLeft, height: strokeBottom - strokeTop });
    redrawSelectionOverlay();
  }, [redrawSelectionOverlay, selectionBrushSize]);
  const finishLassoSelection = useCallback(() => {
    const mask = selectionMaskRef.current; const points = lassoPoints.current; if (!mask || points.length < 3) { clearSelection(); return { x: 0, y: 0, width: 0, height: 0 }; }
    const ctx = mask.getContext('2d')!; ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = '#fff'; ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); ctx.fill(); lassoPoints.current = [];
    return updateSelectionFromMask();
  }, [clearSelection, updateSelectionFromMask]);
  const changeSelectionMode = useCallback((next: SelectionMode) => { setSelectionMode(next); clearSelection(); }, [clearSelection]);

  useEffect(() => {
    if (selectionMaskRef.current) return;
    const mask = makeCanvas(); const ctx = mask.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(selection.x, selection.y, selection.width, selection.height); selectionMaskRef.current = mask;
    requestAnimationFrame(redrawSelectionOverlay);
  }, [redrawSelectionOverlay, selection]);

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
  useEffect(() => {
    if (tool !== 'transform') { setTransformBounds(null); return; }
    const canvas = layerCanvases.current.get(activeLayer);
    setTransformBounds(canvas ? contentBounds(canvas) : null);
  }, [activeLayer, layers, tool]);
  useEffect(() => {
    const selected = layerSelectionRef.current;
    if (selected && selected.layerId !== activeLayer) clearLayerSelection();
  }, [activeLayer, clearLayerSelection]);

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

  const captureDrawingState = useCallback((): DrawingState => {
    const mask = selectionMaskRef.current || makeCanvas(); const selected = layerSelectionRef.current; const viewport = viewportRef.current;
    const layerSelection: SavedLayerSelection | null = selected ? {
      layerId: selected.layerId, base: selected.base, pixels: selected.pixels.getContext('2d')!.getImageData(0, 0, selected.pixels.width, selected.pixels.height),
      pixelWidth: selected.pixels.width, pixelHeight: selected.pixels.height, source: { ...selected.source }, bounds: { ...selected.bounds },
    } : null;
    return {
      snapshot: captureLayerSnapshot(layers, activeLayer), selection: { ...selection }, selectionMask: mask.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT), selectionMode, selectionBrushSize, layerSelection,
      tool, brushSize, brushOpacity, brushColor, effectStrength, textFont, textSize, zoom,
      viewport: { scrollLeft: viewport?.scrollLeft || 0, scrollTop: viewport?.scrollTop || 0 }, chrome: { leftSidebarOpen, rightSidebarOpen, showBranding },
      agentBundle: { items: agentSelections.map((item) => ({ ...item, source: { ...item.source }, selection: { ...item.selection } })), targetId: agentTargetId, status: agentBundleStatus, bundleId: agentBundleId, sentAt: agentBundleSentAt },
      activities: activities.map((activity) => ({ ...activity })), undo: [...undoStack.current], redo: [...redoStack.current],
    };
  }, [activeLayer, activities, agentBundleId, agentBundleSentAt, agentBundleStatus, agentSelections, agentTargetId, brushColor, brushOpacity, brushSize, captureLayerSnapshot, effectStrength, layers, leftSidebarOpen, rightSidebarOpen, selection, selectionBrushSize, selectionMode, showBranding, textFont, textSize, tool, zoom]);
  const restoreDrawingState = useCallback((state: DrawingState) => {
    restoreLayerSnapshot(state.snapshot); clearLayerSelection(); changeTool(state.tool); setBrushSize(state.brushSize); setBrushOpacity(state.brushOpacity); setColor(state.brushColor); setEffectStrength(state.effectStrength); setTextFont(state.textFont); setTextSize(state.textSize);
    setSelectionMode(state.selectionMode); setSelectionBrushSize(state.selectionBrushSize); setSelection({ ...state.selection });
    const mask = selectionMaskRef.current || makeCanvas(); mask.getContext('2d')!.putImageData(state.selectionMask, 0, 0); selectionMaskRef.current = mask;
    if (state.layerSelection) {
      const pixels = document.createElement('canvas'); pixels.width = state.layerSelection.pixelWidth; pixels.height = state.layerSelection.pixelHeight; pixels.getContext('2d')!.putImageData(state.layerSelection.pixels, 0, 0);
      layerSelectionRef.current = { layerId: state.layerSelection.layerId, base: state.layerSelection.base, pixels, source: { ...state.layerSelection.source }, bounds: { ...state.layerSelection.bounds } };
      setLayerSelectionBounds({ ...state.layerSelection.bounds });
    }
    const nextZoom = clamp(state.zoom, 25, 400); zoomRef.current = nextZoom; setZoom(nextZoom); setLeftSidebarOpen(state.chrome.leftSidebarOpen); setRightSidebarOpen(state.chrome.rightSidebarOpen); setShowBranding(state.chrome.showBranding);
    setActivities(state.activities.map((activity) => ({ ...activity }))); undoStack.current = [...state.undo]; redoStack.current = [...state.redo]; pendingEdits.current.clear();
    setAgentSelections(state.agentBundle.items.map((item) => ({ ...item, source: { ...item.source }, selection: { ...item.selection } })));
    setAgentTargetId(state.agentBundle.targetId); setAgentBundleStatus(state.agentBundle.status); setAgentBundleId(state.agentBundle.bundleId); setAgentBundleSentAt(state.agentBundle.sentAt); setDraggingAgentItemId(null); setAgentDropZone(null); setTextDraft(null);
    renderLayerList(state.snapshot.layers);
    requestAnimationFrame(() => { redrawSelectionOverlay(); redrawLayerSelectionOverlay(); renderLayerList(state.snapshot.layers); requestAnimationFrame(() => { const viewport = viewportRef.current; if (viewport) { viewport.scrollLeft = state.viewport.scrollLeft; viewport.scrollTop = state.viewport.scrollTop; } }); });
  }, [changeTool, clearLayerSelection, redrawLayerSelectionOverlay, redrawSelectionOverlay, renderLayerList, restoreLayerSnapshot, setColor]);
  const createBlankDrawing = useCallback(() => {
    const currentState = captureDrawingState(); const id = `drawing-${Date.now()}-${Math.random().toString(16).slice(2)}`; const name = `Untitled drawing ${workspaceDrawings.length + 1}`;
    setWorkspaceDrawings((items) => [...items.map((drawing) => drawing.id === currentDrawingId ? { ...drawing, name: documentName, state: currentState } : drawing), { id, name }]);
    const layerId = `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`; layerCanvases.current = new Map([[layerId, makeCanvas()]]);
    setLayers([{ id: layerId, name: 'Paint layer', visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#ffffff,#d5d1e8)' }]); setActiveLayer(layerId);
    setCurrentDrawingId(id); setDocumentName(name); setDocumentNameDraft(name); setDocumentMenuOpen(false); clearSelection(); clearLayerSelection(); changeTool('brush'); setTextDraft(null);
    const defaultZoom = 82; zoomRef.current = defaultZoom; setZoom(defaultZoom); undoStack.current = []; redoStack.current = []; pendingEdits.current.clear(); setAgentSelections([]); setAgentTargetId(null); setAgentBundleStatus('draft'); setAgentBundleId(null); setAgentBundleSentAt(null); setActivities([{ id: Date.now(), title: 'New drawing created', detail: name, time: 'now' }]);
    requestAnimationFrame(() => { render(); const viewport = viewportRef.current; if (viewport) { viewport.scrollLeft = 0; viewport.scrollTop = 0; } });
  }, [captureDrawingState, changeTool, clearLayerSelection, clearSelection, currentDrawingId, documentName, render, workspaceDrawings.length]);
  const switchDrawing = useCallback((drawingId: string) => {
    if (drawingId === currentDrawingId) { setDocumentMenuOpen(false); return; }
    const target = workspaceDrawings.find((drawing) => drawing.id === drawingId); if (!target?.state) return;
    const currentState = captureDrawingState();
    setWorkspaceDrawings((items) => items.map((drawing) => drawing.id === currentDrawingId ? { ...drawing, name: documentName, state: currentState } : drawing));
    restoreDrawingState(target.state); setCurrentDrawingId(target.id); setDocumentName(target.name); setDocumentNameDraft(target.name); setDocumentMenuOpen(false); addActivity('Drawing switched', target.name);
  }, [addActivity, captureDrawingState, currentDrawingId, documentName, restoreDrawingState, workspaceDrawings]);

  const createLayer = useCallback((name = 'Paint layer') => {
    const id = `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    layerCanvases.current.set(id, makeCanvas());
    setLayers((items) => [{ id, name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#ffffff,#d5d1e8)' }, ...items]);
    setActiveLayer(id); addActivity('Layer created', name); return id;
  }, [addActivity]);

  const cloneLayerSelection = useCallback(() => {
    const selected = layerSelectionRef.current; if (!selected || selected.layerId !== activeLayer) return;
    const before = captureLayerSnapshot(layers, activeLayer);
    const id = `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`; const canvas = makeCanvas();
    canvas.getContext('2d')!.drawImage(selected.pixels, 0, 0, selected.pixels.width, selected.pixels.height, selected.bounds.x, selected.bounds.y, selected.bounds.width, selected.bounds.height);
    layerCanvases.current.set(id, canvas);
    const activeIndex = Math.max(0, layers.findIndex((layer) => layer.id === activeLayer));
    const sourceName = layers[activeIndex]?.name || 'Layer';
    const clone: Layer = { id, name: `${sourceName} selection copy`.slice(0, 80), visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#80ddff,#7657d7)' };
    const nextLayers = [...layers]; nextLayers.splice(activeIndex, 0, clone);
    const after = captureLayerSnapshot(nextLayers, id); undoStack.current.push({ kind: 'layers', before, after }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
    const blank = makeCanvas().getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT);
    layerSelectionRef.current = { ...selected, layerId: id, base: blank, bounds: { ...selected.bounds } };
    setLayers(nextLayers); setActiveLayer(id); setLayerSelectionBounds({ ...selected.bounds }); redrawLayerSelectionOverlay(); addActivity('Selection cloned', `New layer · ${clone.name}`);
  }, [activeLayer, addActivity, captureLayerSnapshot, layers, redrawLayerSelectionOverlay]);

  const deleteLayerSelection = useCallback(() => {
    const selected = layerSelectionRef.current; const canvas = selected && layerCanvases.current.get(selected.layerId); if (!selected || !canvas || selected.layerId !== activeLayer) return;
    const ctx = canvas.getContext('2d')!; undoStack.current.push({ kind: 'pixels', layerId: activeLayer, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
    ctx.putImageData(selected.base, 0, 0); clearLayerSelection(); render(); addActivity('Selected pixels deleted', 'Undo available');
  }, [activeLayer, addActivity, clearLayerSelection, render]);

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

  const readCanvasColor = useCallback((point: { x: number; y: number }) => {
    const ctx = displayRef.current?.getContext('2d');
    if (!ctx) return null;
    const pixel = ctx.getImageData(clamp(Math.floor(point.x), 0, WIDTH - 1), clamp(Math.floor(point.y), 0, HEIGHT - 1), 1, 1).data;
    return pixel[3] === 0 ? null : rgbToHex(pixel[0], pixel[1], pixel[2]);
  }, []);
  const previewEyedropperColor = useCallback((point: { x: number; y: number }) => {
    const color = readCanvasColor(point); if (!color) return;
    eyedropperColor.current = color;
    setEyedropperPreview({ x: point.x, y: point.y, color });
  }, [readCanvasColor]);

  const captureAgentSelection = useCallback((): AgentSelectionItem | null => {
    if (!hasUsableSelection(tool, selection)) return null;
    const target = { ...selection };
    const padding = Math.min(96, Math.max(36, Math.round(Math.min(target.width, target.height) * .18)));
    const source: Selection = { x: Math.max(0, Math.floor(target.x - padding)), y: Math.max(0, Math.floor(target.y - padding)), width: 0, height: 0 };
    source.width = Math.min(WIDTH - source.x, Math.ceil(target.x + target.width + padding) - source.x);
    source.height = Math.min(HEIGHT - source.y, Math.ceil(target.y + target.height + padding) - source.y);
    const crop = (input: HTMLCanvasElement, mimeType: 'image/png' | 'image/jpeg', quality?: number) => {
      const output = document.createElement('canvas'); output.width = source.width; output.height = source.height;
      output.getContext('2d')!.drawImage(input, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
      return output.toDataURL(mimeType, quality);
    };
    const selectionCrop = document.createElement('canvas'); selectionCrop.width = source.width; selectionCrop.height = source.height;
    const selectionMask = selectionMaskRef.current;
    if (selectionMask) selectionCrop.getContext('2d')!.drawImage(selectionMask, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);
    else { const fallback = selectionCrop.getContext('2d')!; fallback.fillStyle = '#fff'; fallback.fillRect(target.x - source.x, target.y - source.y, target.width, target.height); }
    const mask = document.createElement('canvas'); mask.width = source.width; mask.height = source.height;
    const maskCtx = mask.getContext('2d')!; maskCtx.fillStyle = '#000'; maskCtx.fillRect(0, 0, mask.width, mask.height); maskCtx.drawImage(selectionCrop, 0, 0);
    const composite = compositeCanvas();
    const context = document.createElement('canvas'); context.width = source.width; context.height = source.height;
    const contextCtx = context.getContext('2d')!; contextCtx.drawImage(composite, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height); contextCtx.globalCompositeOperation = 'destination-in'; contextCtx.drawImage(selectionCrop, 0, 0);
    const preview = document.createElement('canvas'); preview.width = 144; preview.height = 92;
    const previewScale = Math.min(preview.width / source.width, preview.height / source.height);
    const previewWidth = source.width * previewScale; const previewHeight = source.height * previewScale;
    preview.getContext('2d')!.drawImage(context, (preview.width - previewWidth) / 2, (preview.height - previewHeight) / 2, previewWidth, previewHeight);
    const layerName = layers.find((layer) => layer.id === activeLayer)?.name || 'Active layer';
    return {
      id: `selection-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: `Region ${agentSelections.length + 1}`,
      drawingId: currentDrawingId,
      layerId: activeLayer,
      layerName,
      source,
      selection: target,
      mask: selectionCrop.getContext('2d')!.getImageData(0, 0, source.width, source.height),
      compositeCrop: crop(composite, 'image/jpeg', .9),
      activeLayerCrop: crop(layerCanvases.current.get(activeLayer) || makeCanvas(), 'image/png'),
      maskDataUrl: mask.toDataURL('image/png'),
      contextImage: context.toDataURL('image/png'),
      previewDataUrl: preview.toDataURL('image/png'),
      createdAt: Date.now(),
    };
  }, [activeLayer, agentSelections.length, compositeCanvas, currentDrawingId, layers, selection, tool]);

  const markAgentBundleDraft = useCallback(() => {
    setAgentBundleStatus('draft'); setAgentBundleId(null); setAgentBundleSentAt(null); pendingEdits.current.clear();
  }, []);
  const addSelectionToAgentBundle = useCallback(() => {
    if (agentBundleStatus === 'sent') return;
    if (agentSelections.length >= 12) { addActivity('Agent bundle is full', 'Remove a region before adding another'); return; }
    const item = captureAgentSelection(); if (!item) return;
    setAgentSelections((items) => [...items, item]);
    if (!agentTargetId) setAgentTargetId(item.id);
    markAgentBundleDraft(); clearSelection();
    addActivity(agentTargetId ? 'Context region added' : 'Edit target added', `${Math.round(item.selection.width)} × ${Math.round(item.selection.height)} px`);
  }, [addActivity, agentBundleStatus, agentSelections.length, agentTargetId, captureAgentSelection, clearSelection, markAgentBundleDraft]);
  const removeAgentSelection = useCallback((itemId: string) => {
    setAgentSelections((items) => {
      const remaining = items.filter((item) => item.id !== itemId);
      if (agentTargetId === itemId) setAgentTargetId(remaining[0]?.id || null);
      return remaining;
    });
    markAgentBundleDraft();
  }, [agentTargetId, markAgentBundleDraft]);
  const dropAgentSelection = useCallback((itemId: string, zone: string | null) => {
    if (!zone || agentBundleStatus === 'sent') return;
    if (zone === `context:${itemId}`) return;
    if (zone === 'target') {
      if (itemId !== agentTargetId) { setAgentTargetId(itemId); markAgentBundleDraft(); addActivity('Edit target changed', 'Previous target moved to context'); }
      return;
    }
    if (itemId === agentTargetId) return;
    setAgentSelections((items) => {
      const targetItem = items.find((item) => item.id === agentTargetId);
      const contexts = items.filter((item) => item.id !== agentTargetId && item.id !== itemId);
      const moved = items.find((item) => item.id === itemId); if (!moved) return items;
      const beforeId = zone.startsWith('context:') ? zone.slice('context:'.length) : null;
      const index = beforeId ? contexts.findIndex((item) => item.id === beforeId) : contexts.length;
      contexts.splice(index < 0 ? contexts.length : index, 0, moved);
      return targetItem ? [targetItem, ...contexts] : contexts;
    });
    markAgentBundleDraft();
  }, [addActivity, agentBundleStatus, agentTargetId, markAgentBundleDraft]);
  const sendAgentBundle = useCallback(() => {
    const target = agentSelections.find((item) => item.id === agentTargetId); if (!target) return;
    const id = `bundle-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setAgentBundleId(id); setAgentBundleSentAt(Date.now()); setAgentBundleStatus('sent'); pendingEdits.current.clear();
    addActivity('Edit bundle sent to agent', `1 target + ${agentSelections.length - 1} context`);
  }, [addActivity, agentSelections, agentTargetId]);

  const prepareAiEdit = useCallback((editPrompt = '') => {
    const target = agentSelections.find((item) => item.id === agentTargetId);
    if (agentBundleStatus !== 'sent' || !agentBundleId || !target) {
      return {
        ready: false,
        code: 'bundle_required',
        message: 'Add at least one region to the Agent edit panel and press Send to agent before requesting pixels.',
        userInstruction: 'Ask the user to add a selection as the edit target, optionally add context regions, then press Send to agent.',
        agentPolicy: agentEditPolicy,
      };
    }
    if (target.drawingId !== currentDrawingId) {
      return { ready: false, code: 'drawing_mismatch', message: 'The sent edit target belongs to another drawing.', userInstruction: 'Ask the user to switch back to the drawing that contains the sent edit bundle.', agentPolicy: agentEditPolicy };
    }
    const cleanPrompt = editPrompt.trim();
    const contexts = agentSelections.filter((item) => item.id !== target.id);
    const id = `edit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const pending: PendingEdit = { id, bundleId: agentBundleId, drawingId: target.drawingId, prompt: cleanPrompt, source: { ...target.source }, selection: { ...target.selection }, mask: target.mask, contextCount: contexts.length, createdAt: Date.now() };
    pendingEdits.current.set(id, pending);
    while (pendingEdits.current.size > 6) pendingEdits.current.delete(pendingEdits.current.keys().next().value!);
    addActivity('Edit package ready for agent', `${contexts.length} context reference${contexts.length === 1 ? '' : 's'}`);
    const relativeSelection = { x: target.selection.x - target.source.x, y: target.selection.y - target.source.y, width: target.selection.width, height: target.selection.height };
    const targetPayload = {
      id: target.id,
      name: target.name,
      layer: { id: target.layerId, name: target.layerName },
      compositeCrop: { dataUrl: target.compositeCrop, mimeType: 'image/jpeg', width: target.source.width, height: target.source.height },
      activeLayerCrop: { dataUrl: target.activeLayerCrop, mimeType: 'image/png', width: target.source.width, height: target.source.height },
      mask: { dataUrl: target.maskDataUrl, mimeType: 'image/png', width: target.source.width, height: target.source.height, whiteMeans: 'editable' },
      selection: relativeSelection,
      placement: target.source,
    };
    return {
      editId: id,
      bundleId: agentBundleId,
      prompt: cleanPrompt || null,
      target: targetPayload,
      context: contexts.map((item, index) => ({ id: item.id, order: index, name: item.name, role: 'context', image: { dataUrl: item.contextImage, mimeType: 'image/png', width: item.source.width, height: item.source.height }, selection: item.selection, placement: item.source })),
      compositeCrop: targetPayload.compositeCrop,
      activeLayerCrop: targetPayload.activeLayerCrop,
      mask: targetPayload.mask,
      selection: relativeSelection,
      placement: target.source,
      outputContract: `Return one PNG or WebP of exactly ${target.source.width}×${target.source.height}px representing the complete target crop. Context images are references only. The app will reveal only the target mask as a new layer.`,
      agentPolicy: agentEditPolicy,
    };
  }, [addActivity, agentBundleId, agentBundleStatus, agentSelections, agentTargetId, currentDrawingId]);

  const insertAiResult = useCallback(async (editId: string, imageDataUrl: string, requestedName?: string) => {
    const pending = pendingEdits.current.get(editId);
    if (!pending) throw new Error('Unknown or expired editId. Call prepare_ai_edit again.');
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) { pendingEdits.current.delete(editId); throw new Error('Edit package expired. Call prepare_ai_edit again.'); }
    if (pending.drawingId !== currentDrawingId) throw new Error('Switch back to the drawing that contains this edit target before inserting the result.');
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(imageDataUrl)) throw new Error('imageDataUrl must be a base64 PNG, JPEG, or WebP data URL.');
    if (imageDataUrl.length > 14_000_000) throw new Error('Generated image is larger than the 10 MB MVP limit.');
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Generated image could not be decoded.')); image.src = imageDataUrl; });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('Generated image dimensions are invalid or exceed 4096px.');
    const id = `ai-result-${Date.now()}`; const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, pending.source.x, pending.source.y, pending.source.width, pending.source.height);
    const resultMask = document.createElement('canvas'); resultMask.width = pending.source.width; resultMask.height = pending.source.height; resultMask.getContext('2d')!.putImageData(pending.mask, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(resultMask, pending.source.x, pending.source.y); ctx.restore();
    layerCanvases.current.set(id, canvas);
    const name = requestedName?.trim() || `AI — ${pending.prompt.slice(0, 34) || 'agent edit'}${pending.prompt.length > 34 ? '…' : ''}`;
    setLayers((items) => [{ id, name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#f28d68,#9a59ee)', ai: true }, ...items]);
    setActiveLayer(id); pendingEdits.current.delete(editId);
    addActivity('Agent image inserted as layer', name);
    return { layerId: id, name, bundleId: pending.bundleId, placement: pending.source, clippedToSelection: pending.selection, contextReferencesUsed: pending.contextCount, nextStep: 'Ask the user in chat what they want to edit next.' };
  }, [addActivity, currentDrawingId]);

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
  const agentTarget = agentSelections.find((item) => item.id === agentTargetId) || null;
  const agentContexts = agentSelections.filter((item) => item.id !== agentTargetId);
  const agentBundleReady = agentBundleStatus === 'sent' && !!agentBundleId && !!agentTarget;

  actionsRef.current = {
    getState: () => ({
      canvas: { width: WIDTH, height: HEIGHT, zoom },
      activeTool: tool,
      activeLayer,
      toolSettings: { brushSize, brushOpacity, brushColor, effectStrength, textFont, textSize },
      selection,
      agentPolicy: agentEditPolicy,
      agentEdit: agentBundleReady
        ? { ready: true, bundleId: agentBundleId, target: { id: agentTarget.id, name: agentTarget.name, selection: agentTarget.selection, layerId: agentTarget.layerId }, context: agentContexts.map((item, index) => ({ id: item.id, name: item.name, order: index, selection: item.selection })), nextStep: 'Call prepare_ai_edit to fetch the frozen target pixels, mask, and ordered context references. Insert the result only through insert_ai_result.' }
        : { ready: false, code: agentSelections.length ? 'bundle_not_sent' : 'bundle_required', draft: { targetId: agentTargetId, contextCount: agentContexts.length, currentSelectionReady: canEditWithAgent }, userInstruction: agentSelections.length ? 'Tell the user to review the Agent edit bundle and press Send to agent.' : 'Tell the user to select an area, add it to the Agent edit panel, then press Send to agent. Do not substitute another edit.' },
      layers: layers.map(({ id, name, visible, opacity, ai }) => ({ id, name, visible, opacity, ai: !!ai })),
    }),
    createLayer,
    setTool: (next: Tool) => { changeTool(next); addActivity('Agent changed tool', next); return next; },
    select: (next: Selection) => { const safe = { x: Math.max(0, Math.min(WIDTH - 1, next.x)), y: Math.max(0, Math.min(HEIGHT - 1, next.y)), width: Math.max(1, Math.min(WIDTH, next.width)), height: Math.max(1, Math.min(HEIGHT, next.height)) }; changeTool('select'); setSelectionMode('rectangle'); applyRectangleSelection(safe); addActivity('Agent selected region', `${Math.round(safe.width)} × ${Math.round(safe.height)} px`); return safe; },
    prepareAiEdit,
    insertAiResult,
    mergeLayerDown,
    toggleLayer: (id: string, visible: boolean) => { setLayers((items) => items.map((layer) => layer.id === id ? { ...layer, visible } : layer)); addActivity('Agent updated layer', visible ? 'Shown' : 'Hidden'); return { id, visible }; },
  };

  useEffect(() => {
    const mc = document.modelContext; if (!mc) { setWebMcp('fallback'); return; }
    const controller = new AbortController();
    const tools: WebMCPTool[] = [
      { name: 'get_document_state', title: 'Inspect DUET document — WebMCP-only editing policy', description: 'Returns the canvas, current selection, editable layers, and the sent Agent edit bundle. When agentEdit.ready is true, call prepare_ai_edit to receive its one edit target and ordered context references. Never use browser controls, clicks, drags, or local canvas drawing as a fallback.', execute: () => response(actionsRef.current.getState()) },
      { name: 'get_animation_state', title: 'Inspect DUET animation and Agent target request', description: 'Returns the animation canvas, tracks, selected cel-clip target range, adaptive sample manifest, supported coloured vector shapes, and whether the user pressed Send sampled frames. This call returns metadata only. If aiClipRequest.ready is false, ask the user to choose the Agent target arrow, select a cel range, and send it; do not insert anything.', execute: () => response(animationStudioRef.current?.getAgentAnimationState() || { mode: 'animation', aiClipRequest: { ready: false, userInstruction: 'Open Animate, choose the Agent target arrow, select a cel range, and press Send sampled frames.' } }) },
      { name: 'create_layer', title: 'Create an editable layer', description: 'Creates a transparent paint layer and makes it active. This is not a fallback for a blocked AI edit: if pixel transfer, permission, or generation is blocked, leave the document unchanged and report the blocker.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Short layer name' } } }, execute: ({ name }) => response({ layerId: actionsRef.current.createLayer(String(name || 'Agent layer')) }) },
      { name: 'set_active_tool', title: 'Choose an editing tool', description: 'Selects the transform, layer lasso, brush, eraser, smudge, blur, text, eyedropper, region selection, or pan tool through WebMCP. Do not use it or the browser UI to make a substitute manual edit when the requested AI edit is blocked.', inputSchema: { type: 'object', properties: { tool: { type: 'string', enum: ['select', 'layer-lasso', 'transform', 'brush', 'eraser', 'smudge', 'blur', 'text', 'eyedropper', 'pan'] } }, required: ['tool'] }, execute: ({ tool: next }) => response({ tool: actionsRef.current.setTool(next as Tool) }) },
      { name: 'select_region', title: 'Select a canvas region', description: 'Creates the region that the next AI edit should modify. It does not authorize a browser-control or manual-canvas fallback.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }, required: ['x', 'y', 'width', 'height'] }, execute: ({ x, y, width, height }) => response(actionsRef.current.select({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) })) },
      { name: 'prepare_ai_edit', title: 'Prepare the sent Agent edit bundle', description: 'Returns the frozen edit target crop, active-layer crop, mask, placement, and every ordered context reference under a temporary edit ID. Context images are reference-only and must never become edit destinations. If the user has not sent a bundle, ask them to add selections and press Send to agent; do not make a substitute edit.', inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'Optional visual edit instruction. Omit to let the agent decide.' } } }, execute: ({ prompt: edit }) => response(actionsRef.current.prepareAiEdit(typeof edit === 'string' ? edit : '')) },
      { name: 'insert_ai_result', title: 'Insert an agent-generated image layer', description: 'Accepts a generated PNG, JPEG, or WebP data URL for a prepared bundle edit, aligns it to the saved target crop, clips it only to the target mask, and creates a new editable layer. Context references are never modified. Call only after prepare_ai_edit succeeds.', inputSchema: { type: 'object', properties: { editId: { type: 'string', description: 'Temporary ID returned by prepare_ai_edit' }, imageDataUrl: { type: 'string', description: 'Base64 image data URL for the complete prepared target crop' }, name: { type: 'string', description: 'Optional new layer name' } }, required: ['editId', 'imageDataUrl'] }, execute: async ({ editId, imageDataUrl, name }) => response(await actionsRef.current.insertAiResult(String(editId), String(imageDataUrl), typeof name === 'string' ? name : undefined)) },
      { name: 'prepare_animation_edit', title: 'Prepare the sent Agent animation target frames', description: 'Returns the frozen adaptively sampled target-cel images, a few composite scene context frames, complete cel timing, source agent recipe when available, and exact output placement. Requires the requestId from get_animation_state. Call before insert_ai_cel_clip.', inputSchema: { type: 'object', properties: { requestId: { type: 'string', description: 'Exact ready request ID from get_animation_state.' } }, required: ['requestId'] }, execute: (input) => response(animationStudioRef.current?.prepareAgentAnimationEdit(input) || { prepared: false, error: 'Animation workspace is unavailable.' }) },
      { name: 'insert_ai_cel_clip', title: 'Insert an Agent vector animation as editable cels', description: 'Validates a constrained coloured-shape and keyframe recipe, renders it into ordinary editable canvas cels for exactly the selected target duration, and inserts it nondestructively on a new visual track directly above the target. Requires prepare_animation_edit with the exact requestId first. Never submit scripts, SVG markup, URLs, or raster images.', inputSchema: { type: 'object', properties: {
        requestId: { type: 'string', description: 'Exact ready request ID from get_animation_state.' },
        name: { type: 'string', description: 'Short clip name.' },
        durationSeconds: { type: 'number', minimum: .01, maximum: 12, description: 'Optional compatibility hint. The selected target range always determines the exact output duration.' },
        celFps: { type: 'number', minimum: 1, maximum: 24, description: 'Desired cel rate. DUET may lower it for longer targets so the result stays at or below 48 generated cels, while preserving the exact target duration with holds.' },
        objects: { type: 'array', minItems: 1, maxItems: 48, items: { type: 'object', properties: {
          id: { type: 'string' }, type: { type: 'string', enum: ['line', 'path', 'rectangle', 'circle', 'polygon'] },
          x: { type: 'number', description: 'Rectangle or circle centre x.' }, y: { type: 'number', description: 'Rectangle or circle centre y.' }, width: { type: 'number' }, height: { type: 'number' }, radius: { type: 'number' },
          points: { type: 'array', maxItems: 160, description: 'Canvas-coordinate points for a line, path, or polygon.', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
          closed: { type: 'boolean', description: 'Close a path so it may be filled.' }, fillColor: { type: 'string', description: 'Hex colour such as #FF6B5F, or none.' }, strokeColor: { type: 'string', description: 'Hex colour such as #2D1638, or none.' }, strokeWidth: { type: 'number', minimum: 0, maximum: 96 }, opacity: { type: 'number', minimum: 0, maximum: 1 },
          keyframes: { type: 'array', maxItems: 32, items: { type: 'object', properties: { frame: { type: 'number', minimum: 0, description: 'Zero-based cel frame.' }, translateX: { type: 'number' }, translateY: { type: 'number' }, scale: { type: 'number', minimum: .01, maximum: 20 }, rotation: { type: 'number', description: 'Rotation in degrees.' }, opacity: { type: 'number', minimum: 0, maximum: 1 }, easing: { type: 'string', enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] } }, required: ['frame'] } },
        }, required: ['type'] } },
      }, required: ['requestId', 'celFps', 'objects'] }, execute: (input) => response(animationStudioRef.current?.insertAgentCelClip(input) || { inserted: false, error: 'Animation workspace is unavailable.' }) },
      { name: 'merge_layer_down', title: 'Merge the selected layer down', description: 'Flattens the selected layer into the layer directly beneath it and keeps the merged pixels editable as one layer.', execute: () => response(actionsRef.current.mergeLayerDown()) },
      { name: 'set_layer_visibility', title: 'Show or hide a layer', description: 'Changes layer visibility without destroying its pixels.', inputSchema: { type: 'object', properties: { layerId: { type: 'string' }, visible: { type: 'boolean' } }, required: ['layerId', 'visible'] }, execute: ({ layerId, visible }) => response(actionsRef.current.toggleLayer(String(layerId), Boolean(visible))) },
    ];
    Promise.all(tools.map((item) => mc.registerTool(item, { signal: controller.signal }))).then(() => setWebMcp('ready')).catch(() => setWebMcp('fallback'));
    return () => controller.abort();
  }, []);

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT }; };
  const updateColorField = (event: React.PointerEvent<HTMLDivElement>, mode: 'hue' | 'sv') => {
    const target = mode === 'hue' ? hueSliderRef.current : colorSquareRef.current; if (!target) return;
    const rect = target.getBoundingClientRect(); const x = clamp((event.clientX - rect.left) / rect.width, 0, 1); const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    if (mode === 'hue') setColorFromHsv({ ...hsv, h: (360 - y * 360) % 360 });
    else setColorFromHsv({ ...hsv, s: x * 100, v: (1 - y) * 100 });
  };
  const startColorField = (event: React.PointerEvent<HTMLDivElement>, mode: 'hue' | 'sv') => {
    colorDrag.current = mode;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateColorField(event, mode);
  };
  const moveColorField = (event: React.PointerEvent<HTMLDivElement>) => { if (colorDrag.current) updateColorField(event, colorDrag.current); };
  const endColorField = () => { colorDrag.current = null; };
  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => { const ctx = layerCanvases.current.get(activeLayer)?.getContext('2d'); if (!ctx) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize; ctx.strokeStyle = brushColor; ctx.globalAlpha = tool === 'brush' ? brushOpacity / 100 : 1; ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore(); render(); };
  const beginSmudge = (point: { x: number; y: number }) => {
    const source = layerCanvases.current.get(activeLayer); if (!source) return;
    const size = Math.max(8, Math.ceil(brushSize)); const buffer = document.createElement('canvas'); buffer.width = size; buffer.height = size;
    const ctx = buffer.getContext('2d')!; ctx.save(); ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(source, point.x - size / 2, point.y - size / 2, size, size, 0, 0, size, size); ctx.restore(); smudgeBufferRef.current = buffer;
  };
  const smudgeStamp = (point: { x: number; y: number }) => {
    const canvas = layerCanvases.current.get(activeLayer); const buffer = smudgeBufferRef.current; if (!canvas || !buffer) return;
    const size = buffer.width; const x = point.x - size / 2; const y = point.y - size / 2; const ctx = canvas.getContext('2d')!;
    ctx.save(); ctx.beginPath(); ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2); ctx.clip(); ctx.globalAlpha = .12 + effectStrength / 100 * .68; ctx.drawImage(buffer, x, y); ctx.restore();
    const fresh = document.createElement('canvas'); fresh.width = size; fresh.height = size; fresh.getContext('2d')!.drawImage(canvas, x, y, size, size, 0, 0, size, size);
    const bufferCtx = buffer.getContext('2d')!; bufferCtx.save(); bufferCtx.globalAlpha = .24; bufferCtx.drawImage(fresh, 0, 0); bufferCtx.restore();
  };
  const blurStamp = (point: { x: number; y: number }) => {
    const canvas = layerCanvases.current.get(activeLayer); if (!canvas) return;
    const radius = Math.max(4, brushSize / 2); const blurRadius = 1 + effectStrength / 100 * 15; const padding = Math.ceil(radius + blurRadius * 2); const size = padding * 2;
    const source = document.createElement('canvas'); source.width = size; source.height = size;
    source.getContext('2d')!.drawImage(canvas, point.x - padding, point.y - padding, size, size, 0, 0, size, size);
    const softened = document.createElement('canvas'); softened.width = size; softened.height = size;
    const softenedCtx = softened.getContext('2d')!; softenedCtx.filter = `blur(${blurRadius}px)`; softenedCtx.drawImage(source, 0, 0);
    const ctx = canvas.getContext('2d')!; ctx.save(); ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.clip(); ctx.globalAlpha = .35 + effectStrength / 100 * .6; ctx.drawImage(softened, point.x - padding, point.y - padding); ctx.restore();
  };
  const applyEffectStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y); const steps = Math.max(1, Math.ceil(distance / Math.max(2, Math.max(8, brushSize) * .18)));
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps; const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      if (tool === 'smudge') smudgeStamp(point); else blurStamp(point);
    }
    render();
  };
  const commitText = (save = true) => {
    const draft = textDraft; setTextDraft(null); if (!save || !draft) return;
    const value = draft.value.trim(); if (!value) return;
    const before = captureLayerSnapshot(layers, activeLayer); const id = `text-${Date.now()}-${Math.random().toString(16).slice(2)}`; const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!;
    const font = textFonts.find((option) => option.id === textFont) || textFonts[0]; const lines = value.split(/\r?\n/); const lineHeight = textSize * 1.18;
    ctx.fillStyle = brushColor; ctx.globalAlpha = brushOpacity / 100; ctx.textBaseline = 'top'; ctx.font = `${textSize}px ${font.family}`;
    lines.forEach((line, index) => ctx.fillText(line, draft.x, draft.y + index * lineHeight, Math.max(1, WIDTH - draft.x)));
    layerCanvases.current.set(id, canvas);
    const layerName = `Text — ${value.replace(/\s+/g, ' ').slice(0, 28)}${value.length > 28 ? '…' : ''}`;
    const nextLayers: Layer[] = [{ id, name: layerName, visible: true, opacity: 100, blend: 'source-over', swatch: brushColor }, ...layers];
    const after = captureLayerSnapshot(nextLayers, id); undoStack.current.push({ kind: 'layers', before, after }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
    setLayers(nextLayers); setActiveLayer(id); rememberUsedColor(); addActivity('Text layer created', layerName); render();
  };
  const transformModeAtPoint = (bounds: Selection, point: { x: number; y: number }): TransformMode => {
    const edge = 18;
    const left = Math.abs(point.x - bounds.x) < edge; const right = Math.abs(point.x - (bounds.x + bounds.width)) < edge;
    const top = Math.abs(point.y - bounds.y) < edge; const bottom = Math.abs(point.y - (bounds.y + bounds.height)) < edge;
    if (left && top) return 'tl'; if (right && top) return 'tr'; if (left && bottom) return 'bl'; if (right && bottom) return 'br';
    return 'move';
  };
  const redrawTransformedLayer = (transform: ActiveTransform, point: { x: number; y: number }) => {
    const canvas = layerCanvases.current.get(activeLayer); if (!canvas) return;
    const source = makeCanvas(); source.getContext('2d')!.putImageData(transform.image, 0, 0);
    const ctx = canvas.getContext('2d')!; const bounds = transform.source;
    let next: Selection;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    if (transform.mode === 'move') {
      const dx = point.x - transform.pointer.x; const dy = point.y - transform.pointer.y;
      next = { x: Math.max(-bounds.width + 8, Math.min(WIDTH - 8, bounds.x + dx)), y: Math.max(-bounds.height + 8, Math.min(HEIGHT - 8, bounds.y + dy)), width: bounds.width, height: bounds.height };
      ctx.drawImage(source, next.x - bounds.x, next.y - bounds.y);
    } else {
      const anchorX = transform.mode.includes('l') ? bounds.x + bounds.width : bounds.x;
      const anchorY = transform.mode.includes('t') ? bounds.y + bounds.height : bounds.y;
      const rawX = transform.mode.includes('l') ? point.x : bounds.x;
      const rawY = transform.mode.includes('t') ? point.y : bounds.y;
      const width = Math.max(12, Math.abs(anchorX - rawX)); const height = Math.max(12, Math.abs(anchorY - rawY));
      next = { x: Math.min(anchorX, rawX), y: Math.min(anchorY, rawY), width, height };
      ctx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, next.x, next.y, next.width, next.height);
    }
    setTransformBounds(next); render();
  };
  const startPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') {
      const viewport = viewportRef.current; if (!viewport) return;
      event.currentTarget.setPointerCapture(event.pointerId); panning.current = true;
      panStart.current = { x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
      return;
    }
    const point = pointer(event);
    if (tool === 'text') {
      if (!textDraft) setTextDraft({ x: clamp(point.x, 0, WIDTH - 12), y: clamp(point.y, 0, HEIGHT - textSize), value: '' });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'select') {
      if (selectionMode === 'rectangle') { clearSelection(); selectionStart.current = point; }
      if (selectionMode === 'brush') { lastPoint.current = point; paintSelectionStroke(point, point); }
      if (selectionMode === 'lasso') { clearSelection(); lassoPoints.current = [point]; redrawSelectionOverlay(); }
      drawing.current = true; return;
    }
    if (tool === 'layer-lasso') {
      const selected = layerSelectionRef.current; const bounds = selected?.bounds;
      const inside = !!bounds && point.x >= bounds.x - 18 && point.x <= bounds.x + bounds.width + 18 && point.y >= bounds.y - 18 && point.y <= bounds.y + bounds.height + 18;
      if (selected && selected.layerId === activeLayer && bounds && inside) {
        const ctx = layerCanvases.current.get(activeLayer)?.getContext('2d'); if (!ctx) return;
        undoStack.current.push({ kind: 'pixels', layerId: activeLayer, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
        activeLayerSelectionTransform.current = { start: { ...bounds }, pointer: point, mode: transformModeAtPoint(bounds, point) };
      } else {
        clearLayerSelection(); layerLassoPoints.current = [point]; redrawLayerSelectionOverlay();
      }
      drawing.current = true; return;
    }
    if (tool === 'eyedropper') { previewEyedropperColor(point); drawing.current = true; return; }
    const ctx = layerCanvases.current.get(activeLayer)?.getContext('2d'); if (!ctx) return;
    if (tool === 'transform') {
      const bounds = transformBounds || contentBounds(ctx.canvas);
      if (!bounds) { addActivity('Transform unavailable', 'The selected layer is empty'); return; }
      undoStack.current.push({ kind: 'pixels', layerId: activeLayer, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
      activeTransform.current = { source: bounds, image: ctx.getImageData(0, 0, WIDTH, HEIGHT), pointer: point, mode: transformModeAtPoint(bounds, point) };
      drawing.current = true;
      return;
    }
    if (tool === 'smudge' || tool === 'blur') {
      undoStack.current.push({ kind: 'pixels', layerId: activeLayer, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
      drawing.current = true; lastPoint.current = point;
      if (tool === 'smudge') beginSmudge(point); else applyEffectStroke(point, point);
      return;
    }
    if (tool === 'brush') rememberUsedColor();
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
    if (tool === 'select') {
      if (selectionMode === 'rectangle') { const start = selectionStart.current; applyRectangleSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }); }
      if (selectionMode === 'brush') { paintSelectionStroke(lastPoint.current, point); lastPoint.current = point; }
      if (selectionMode === 'lasso') {
        const points = lassoPoints.current; const previous = points[points.length - 1];
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 2) points.push(point);
        if (points.length) { const xs = points.map((item) => item.x); const ys = points.map((item) => item.y); setSelection({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }); }
        redrawSelectionOverlay();
      }
      return;
    }
    if (tool === 'layer-lasso') {
      if (activeLayerSelectionTransform.current) redrawLayerSelectionTransform(activeLayerSelectionTransform.current, point);
      else {
        const points = layerLassoPoints.current; const previous = points[points.length - 1];
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 2) points.push(point);
        redrawLayerSelectionOverlay();
      }
      return;
    }
    if (tool === 'eyedropper') { previewEyedropperColor(point); return; }
    if (tool === 'transform' && activeTransform.current) { redrawTransformedLayer(activeTransform.current, point); return; }
    if (tool === 'smudge' || tool === 'blur') { applyEffectStroke(lastPoint.current, point); lastPoint.current = point; return; }
    drawStroke(lastPoint.current, point); lastPoint.current = point;
  };
  const endPointer = (cancelled = false) => {
    if (drawing.current && tool === 'select') {
      const finalSelection = cancelled && selectionMode === 'lasso' ? (clearSelection(), { x: 0, y: 0, width: 0, height: 0 }) : selectionMode === 'lasso' ? finishLassoSelection() : updateSelectionFromMask();
      if (finalSelection.width > MIN_SELECTION_SIZE && finalSelection.height > MIN_SELECTION_SIZE) addActivity('Region selected', `${selectionMode === 'rectangle' ? 'Rectangle' : selectionMode === 'brush' ? 'Brush mask' : 'Lasso'} · ${Math.round(finalSelection.width)} × ${Math.round(finalSelection.height)} px`);
    }
    if (drawing.current && tool === 'layer-lasso') {
      if (activeLayerSelectionTransform.current) addActivity('Selected pixels transformed', 'Move or resize · undoable');
      else if (cancelled) clearLayerSelection();
      else {
        const bounds = finishLayerLasso();
        if (bounds) addActivity('Layer pixels selected', `${Math.round(bounds.width)} × ${Math.round(bounds.height)} px`);
      }
    }
    if (drawing.current && tool === 'transform') addActivity('Layer transformed', 'Move or resize · undoable');
    if (drawing.current && tool === 'smudge') addActivity('Layer smudged', `${brushSize}px · ${effectStrength}% strength`);
    if (drawing.current && tool === 'blur') addActivity('Layer blurred', `${brushSize}px · ${effectStrength}% strength`);
    if (drawing.current && tool === 'eyedropper') {
      const color = eyedropperColor.current;
      if (!cancelled && color) { setColor(color); addActivity('Colour picked', color.toUpperCase()); changeTool('brush'); }
      eyedropperColor.current = null; setEyedropperPreview(null);
    }
    drawing.current = false; smudgeBufferRef.current = null; activeTransform.current = null; activeLayerSelectionTransform.current = null; panning.current = false;
  };
  const undo = useCallback(() => {
    const entry = undoStack.current.pop(); if (!entry) return;
    clearLayerSelection();
    if (entry.kind === 'layers') { restoreLayerSnapshot(entry.before); redoStack.current.push(entry); return; }
    const ctx = layerCanvases.current.get(entry.layerId)?.getContext('2d'); if (!ctx) return;
    redoStack.current.push({ kind: 'pixels', layerId: entry.layerId, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); ctx.putImageData(entry.image, 0, 0); render();
  }, [clearLayerSelection, render, restoreLayerSnapshot]);
  const redo = () => {
    const entry = redoStack.current.pop(); if (!entry) return;
    clearLayerSelection();
    if (entry.kind === 'layers') { restoreLayerSnapshot(entry.after); undoStack.current.push(entry); return; }
    const ctx = layerCanvases.current.get(entry.layerId)?.getContext('2d'); if (!ctx) return;
    undoStack.current.push({ kind: 'pixels', layerId: entry.layerId, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); ctx.putImageData(entry.image, 0, 0); render();
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const next = toolMeta.find((item) => item.key.toLowerCase() === event.key.toLowerCase()); if (next) changeTool(next.id);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') { event.preventDefault(); mergeLayerDown(); }
      if (tool === 'layer-lasso' && layerSelectionBounds && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); deleteLayerSelection(); }
      if (tool === 'layer-lasso' && layerSelectionBounds && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); cloneLayerSelection(); }
      if (tool === 'layer-lasso' && event.key === 'Escape') clearLayerSelection();
      if ((event.metaKey || event.ctrlKey) && (event.key === '+' || event.key === '=')) { event.preventDefault(); zoomAt(zoomRef.current * 1.15); }
      if ((event.metaKey || event.ctrlKey) && event.key === '-') { event.preventDefault(); zoomAt(zoomRef.current / 1.15); }
      if ((event.metaKey || event.ctrlKey) && event.key === '0') { event.preventDefault(); zoomAt(82); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [changeTool, clearLayerSelection, cloneLayerSelection, deleteLayerSelection, layerSelectionBounds, mergeLayerDown, tool, undo, zoomAt]);

  const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('One of the project layers could not be decoded.')); image.src = source; });
  const fileDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The photo could not be read.')); reader.onerror = () => reject(reader.error || new Error('The photo could not be read.')); reader.readAsDataURL(file); });
  const placePhotoAsset = async (asset: PhotoAsset) => {
    const image = await loadImage(asset.dataUrl); const before = captureLayerSnapshot(layers, activeLayer); const id = `import-${Date.now()}-${Math.random().toString(16).slice(2)}`; const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!;
    const scale = Math.min(WIDTH / image.width, HEIGHT / image.height); const width = image.width * scale; const height = image.height * scale;
    ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height); layerCanvases.current.set(id, canvas);
    const nextLayers: Layer[] = [{ id, name: asset.name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#93b8cc,#e4b28d)' }, ...layers];
    const after = captureLayerSnapshot(nextLayers, id); undoStack.current.push({ kind: 'layers', before, after }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
    setLayers(nextLayers); setActiveLayer(id);
    if (/^Untitled(?: portrait| drawing(?: \d+)?)?$/i.test(documentName)) {
      const nextName = asset.name.replace(/\.[^.]+$/, '') || 'Untitled artwork'; setDocumentName(nextName); setDocumentNameDraft(nextName);
      setWorkspaceDrawings((items) => items.map((drawing) => drawing.id === currentDrawingId ? { ...drawing, name: nextName } : drawing));
    }
    setImportMenuOpen(false); addActivity('Photo placed from library', asset.name);
  };
  const importSharedPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) throw new Error('Choose a supported image file.');
    if (file.size > MAX_PHOTO_BYTES) throw new Error('This photo is larger than the 25 MB import limit.');
    const dataUrl = await fileDataUrl(file); const image = await loadImage(dataUrl);
    const asset: PhotoAsset = { id: `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name.slice(0, 120), dataUrl, width: image.naturalWidth, height: image.naturalHeight, createdAt: Date.now() };
    setPhotoLibrary((items) => [asset, ...items]); savePhotoAsset(asset).catch(() => addActivity('Photo saved for this session', 'Browser storage was unavailable'));
    return asset;
  };
  const importRasterImage = async (file: File) => {
    const asset = await importSharedPhoto(file);
    await placePhotoAsset(asset); addActivity('Photo imported and saved', file.name);
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
    const nextTool: Tool = typeof projectDocument.tool === 'string' && ['select', 'layer-lasso', 'transform', 'brush', 'eraser', 'smudge', 'blur', 'text', 'eyedropper', 'pan'].includes(projectDocument.tool) ? projectDocument.tool as Tool : 'select';
    const nextActiveLayer = typeof projectDocument.activeLayer === 'string' && restored.some(({ layer }) => layer.id === projectDocument.activeLayer) ? projectDocument.activeLayer : restored[0].layer.id;
    layerCanvases.current = new Map(restored.map(({ layer, canvas }) => [layer.id, canvas]));
    undoStack.current = []; redoStack.current = []; pendingEdits.current.clear(); setAgentSelections([]); setAgentTargetId(null); setAgentBundleStatus('draft'); setAgentBundleId(null); setAgentBundleSentAt(null);
    setLayers(restored.map(({ layer }) => layer)); setActiveLayer(nextActiveLayer); applyRectangleSelection(safeSelection(projectDocument.selection)); setSelectionMode('rectangle');
    changeTool(nextTool);
    const importedName = typeof projectDocument.name === 'string' && projectDocument.name.trim() ? projectDocument.name.trim().slice(0, 80) : file.name.replace(/\.(duet|babyps)$/i, '') || 'Untitled artwork';
    setDocumentName(importedName); setDocumentNameDraft(importedName); setWorkspaceDrawings((items) => items.map((drawing) => drawing.id === currentDrawingId ? { ...drawing, name: importedName } : drawing));
    setBrushSize(Math.round(boundedNumber(projectDocument.brushSize, 28, 2, 160))); setBrushOpacity(Math.round(boundedNumber(projectDocument.brushOpacity, 100, 1, 100))); setColor(typeof projectDocument.brushColor === 'string' && /^#[0-9a-f]{6}$/i.test(projectDocument.brushColor) ? projectDocument.brushColor : '#ff6b5f');
    setEffectStrength(Math.round(boundedNumber(projectDocument.effectStrength, 55, 1, 100)));
    setTextFont(typeof projectDocument.textFont === 'string' && textFonts.some((option) => option.id === projectDocument.textFont) ? projectDocument.textFont as TextFont : 'sans');
    setTextSize(Math.round(boundedNumber(projectDocument.textSize, 48, 10, 180)));
    const nextZoom = boundedNumber(projectDocument.zoom, 82, 25, 400); zoomRef.current = nextZoom; setZoom(nextZoom);
    addActivity('Project imported', `${restored.length} editable layers`);
  };
  const importPhotoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { await importRasterImage(file); }
    catch (error) { addActivity('Photo import failed', error instanceof Error ? error.message : 'Could not read that photo.'); }
    finally { event.target.value = ''; }
  };
  const importProjectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { await importProject(file); setImportMenuOpen(false); }
    catch (error) { addActivity('Project import failed', error instanceof Error ? error.message : 'Could not read that project.'); }
    finally { event.target.value = ''; }
  };
  const exportImage = () => { render(); const dataUrl = displayRef.current?.toDataURL('image/png'); if (!dataUrl) return; const link = document.createElement('a'); link.download = `${fileStem(documentName)}.png`; link.href = dataUrl; link.click(); addActivity('Final image exported', `${fileStem(documentName)}.png · 960 × 640`); };
  const exportProject = () => {
    try {
      const project: DuetProject = {
        format: 'duet', version: 1, exportedAt: new Date().toISOString(),
        canvas: { width: WIDTH, height: HEIGHT, finalImage: compositeCanvas().toDataURL('image/png') },
        document: { name: documentName, activeLayer, selection, prompt: '', tool, brushSize, brushOpacity, brushColor, effectStrength, textFont, textSize, zoom },
        layers: layers.map((layer) => {
          const canvas = layerCanvases.current.get(layer.id); if (!canvas) throw new Error(`Layer “${layer.name}” is missing its pixels.`);
          return { ...layer, blend: layer.blend, pixels: canvas.toDataURL('image/png') };
        }),
      };
      downloadFile(new Blob([JSON.stringify(project)], { type: 'application/x-duet-project+json' }), `${fileStem(documentName)}.duet`);
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
  const beginDocumentRename = () => { setDocumentNameDraft(documentName); setEditingDocumentName(true); };
  const finishDocumentRename = (save: boolean) => {
    if (save) {
      const nextName = documentNameDraft.trim().slice(0, 80);
      if (nextName && nextName !== documentName) { setDocumentName(nextName); setWorkspaceDrawings((items) => items.map((drawing) => drawing.id === currentDrawingId ? { ...drawing, name: nextName } : drawing)); addActivity('Document renamed', nextName); }
    }
    setEditingDocumentName(false);
  };
  const activeOpacity = layers.find((layer) => layer.id === activeLayer)?.opacity ?? 100;
  const getIllustrationImage = useCallback((drawingId = currentDrawingId) => {
    if (drawingId === currentDrawingId) return compositeCanvas().getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT);
    const snapshot = workspaceDrawings.find((drawing) => drawing.id === drawingId)?.state?.snapshot;
    if (!snapshot) return null;
    const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!;
    [...snapshot.layers].reverse().forEach((layer) => {
      if (!layer.visible) return;
      const pixels = snapshot.pixels.find((entry) => entry.id === layer.id)?.image; if (!pixels) return;
      const source = makeCanvas(); source.getContext('2d')!.putImageData(pixels, 0, 0);
      ctx.save(); ctx.globalAlpha = layer.opacity / 100; ctx.globalCompositeOperation = layer.blend; ctx.drawImage(source, 0, 0); ctx.restore();
    });
    return ctx.getImageData(0, 0, WIDTH, HEIGHT);
  }, [compositeCanvas, currentDrawingId, workspaceDrawings]);

  const moveAgentContext = (itemId: string, direction: -1 | 1) => {
    if (agentBundleStatus === 'sent') return;
    const index = agentContexts.findIndex((item) => item.id === itemId); const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= agentContexts.length) return;
    const nextContexts = [...agentContexts]; [nextContexts[index], nextContexts[nextIndex]] = [nextContexts[nextIndex], nextContexts[index]];
    setAgentSelections(agentTarget ? [agentTarget, ...nextContexts] : nextContexts); markAgentBundleDraft();
  };
  const agentDropZoneAt = (clientX: number, clientY: number) => (document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-agent-drop-zone]')?.dataset.agentDropZone || null);
  const startAgentPointerDrag = (event: React.PointerEvent<HTMLButtonElement>, itemId: string) => {
    if (agentBundleStatus === 'sent') return;
    event.currentTarget.setPointerCapture(event.pointerId); setDraggingAgentItemId(itemId); setAgentDropZone(null);
  };
  const moveAgentPointerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingAgentItemId) return; setAgentDropZone(agentDropZoneAt(event.clientX, event.clientY));
  };
  const finishAgentPointerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingAgentItemId) return;
    const zone = agentDropZoneAt(event.clientX, event.clientY) || agentDropZone;
    dropAgentSelection(draggingAgentItemId, zone); setDraggingAgentItemId(null); setAgentDropZone(null);
  };
  const renderAgentSelectionCard = (item: AgentSelectionItem, role: 'target' | 'context', index = 0) => <div key={item.id} data-agent-drop-zone={role === 'target' ? 'target' : `context:${item.id}`} className={`agent-selection-card ${role} ${draggingAgentItemId === item.id ? 'dragging' : ''} ${agentDropZone === (role === 'target' ? 'target' : `context:${item.id}`) ? 'drop-active' : ''}`}>
    {role === 'context' ? <button type="button" className="agent-drag-handle" aria-label={`Drag ${item.name}`} title="Drag to reorder or make the edit target" onPointerDown={(event) => startAgentPointerDrag(event, item.id)} onPointerMove={moveAgentPointerDrag} onPointerUp={finishAgentPointerDrag} onPointerCancel={() => { setDraggingAgentItemId(null); setAgentDropZone(null); }}><Move /></button> : <span className="agent-target-icon"><Focus /></span>}
    <span className="agent-selection-thumb" style={{ backgroundImage: `url(${item.previewDataUrl}), repeating-conic-gradient(#35323a 0 25%,#2a282f 0 50%)` }} aria-hidden="true" />
    <span className="agent-selection-copy"><strong>{item.name}</strong><small>{Math.round(item.selection.width)} × {Math.round(item.selection.height)} · {item.layerName}</small></span>
    <span className="agent-card-actions">{role === 'context' && <><button type="button" onClick={() => { setAgentTargetId(item.id); markAgentBundleDraft(); addActivity('Edit target changed', 'Previous target moved to context'); }} title="Make edit target" aria-label={`Make ${item.name} the edit target`}><Focus /></button><button type="button" onClick={() => moveAgentContext(item.id, -1)} disabled={index === 0} title="Move context up" aria-label={`Move ${item.name} up`}><ArrowUp /></button><button type="button" onClick={() => moveAgentContext(item.id, 1)} disabled={index === agentContexts.length - 1} title="Move context down" aria-label={`Move ${item.name} down`}><ArrowDown /></button></>}<button type="button" onClick={() => removeAgentSelection(item.id)} disabled={agentBundleStatus === 'sent'} title="Remove selection" aria-label={`Remove ${item.name}`}><X /></button></span>
  </div>;

  return <TooltipProvider delay={350}><><AnimationStudio ref={animationStudioRef} active={workspaceMode === 'animation'} documentName={documentName} onModeChange={setWorkspaceMode} exportProject={exportProject} getIllustrationImage={getIllustrationImage} illustrations={workspaceDrawings.map(({ id, name }) => ({ id, name }))} photoLibrary={photoLibrary} importSharedPhoto={importSharedPhoto} /><main className={`editor-shell ${workspaceMode === 'illustration' ? '' : 'mode-hidden'}`} aria-hidden={workspaceMode !== 'illustration'}>
    <header className="topbar">
      <div className="brand-area"><Tooltip><TooltipTrigger className="view-toggle" aria-label={leftSidebarOpen ? 'Collapse tools sidebar' : 'Expand tools sidebar'} onClick={() => setLeftSidebarOpen((open) => !open)}>{leftSidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</TooltipTrigger><TooltipContent>{leftSidebarOpen ? 'Hide tools' : 'Show tools'}</TooltipContent></Tooltip>{showBranding && <div className="brand-lockup"><div className="brand-mark"><Sparkles size={15} /></div><span>DUET</span><span className="mvp-pill">CREATE WITH AI</span></div>}<Tooltip><TooltipTrigger className={`view-toggle ${!showBranding ? 'active' : ''}`} aria-label={showBranding ? 'Hide branding and canvas reminders' : 'Show branding and canvas reminders'} onClick={() => setShowBranding((shown) => !shown)}>{showBranding ? <EyeOff /> : <Eye />}</TooltipTrigger><TooltipContent>{showBranding ? 'Hide DUET and canvas reminders' : 'Show DUET and canvas reminders'}</TooltipContent></Tooltip></div>
      <div className="header-center"><div className="mode-switch" aria-label="Workspace mode"><button className="active" onClick={() => setWorkspaceMode('illustration')}>Illustrate</button><button onClick={() => setWorkspaceMode('animation')}>Animate</button></div><div ref={documentMenuRef} className="document-title">{editingDocumentName ? <input autoFocus aria-label="Document name" value={documentNameDraft} maxLength={80} onChange={(event) => setDocumentNameDraft(event.target.value)} onBlur={() => finishDocumentRename(true)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishDocumentRename(true); } if (event.key === 'Escape') { event.preventDefault(); finishDocumentRename(false); } }} /> : <><button type="button" className="document-rename" aria-label="Rename document" title="Click to rename" onClick={beginDocumentRename}><span>{documentName}</span></button><button type="button" className={`document-menu-trigger ${documentMenuOpen ? 'active' : ''}`} aria-label="Switch drawings" aria-expanded={documentMenuOpen} onClick={() => setDocumentMenuOpen((open) => !open)}><ChevronDown size={13} /></button></>}{documentMenuOpen && !editingDocumentName && <div className="document-menu"><button className="new-drawing-button" onClick={createBlankDrawing}><Plus />New blank drawing</button><span className="document-menu-label">Drawings</span>{workspaceDrawings.map((drawing) => <button key={drawing.id} className={drawing.id === currentDrawingId ? 'active' : ''} onClick={() => switchDrawing(drawing.id)}><span>{drawing.name}</span>{drawing.id === currentDrawingId && <Check />}</button>)}</div>}</div></div>
      <div className="header-actions"><Tooltip><TooltipTrigger className="view-toggle" aria-label={rightSidebarOpen ? 'Collapse layers sidebar' : 'Expand layers sidebar'} onClick={() => setRightSidebarOpen((open) => !open)}>{rightSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}</TooltipTrigger><TooltipContent>{rightSidebarOpen ? 'Hide panels' : 'Show panels'}</TooltipContent></Tooltip>{showBranding && <div className="mcp-status" title={webMcp === 'ready' ? 'Native WebMCP tools are registered' : 'Tools activate in a WebMCP-compatible browser'}><span className={`status-dot ${webMcp === 'ready' ? 'ready' : ''}`} /><Bot size={14} /><span>{webMcp === 'ready' ? 'WebMCP ready' : '10 agent tools'}</span></div>}<Button variant="ghost" size="sm" className="export-image-button header-save-button" onClick={exportImage} aria-label="Save final image" title="Save final image"><Download /><span className="header-action-full">Save</span><span className="header-action-short">Save</span></Button><Button variant="ghost" size="sm" className="header-export-button" onClick={exportProject} aria-label="Export editable DUET project" title="Export editable project"><Download /><span className="header-action-full">Export</span><span className="header-action-short">Export</span></Button><Button size="sm" className="export-button export-workspace-button" onClick={() => void animationStudioRef.current?.exportWorkspace()} title="Download the animation and editable DUET project" aria-label="Export workspace"><Download /><span className="header-action-full">Export workspace</span><span className="header-action-short">Workspace</span></Button></div>
    </header>
    <section className={`workspace ${!leftSidebarOpen ? 'left-collapsed' : ''} ${!rightSidebarOpen ? 'right-collapsed' : ''}`}>
      <aside className="tool-rail" aria-label="Editing tools">
        {toolMeta.map(({ id, label, icon: Icon, key }) => <Tooltip key={id}><TooltipTrigger aria-label={label} className={`tool-button ${tool === id ? 'active' : ''}`} onClick={() => changeTool(id)}><Icon size={19} strokeWidth={1.8} /></TooltipTrigger><TooltipContent side="right">{label} · {key}</TooltipContent></Tooltip>)}
        <div className="rail-divider" /><div ref={colorPickerRef} className="color-control" onPointerDown={(event) => event.stopPropagation()}><Tooltip><TooltipTrigger aria-label="Open colour picker" className="color-button" onClick={() => setColorPickerOpen((open) => !open)}><span style={{ background: brushColor }} /></TooltipTrigger><TooltipContent side="right">Colour picker</TooltipContent></Tooltip>{colorPickerOpen && <div className="colour-picker" aria-label="Colour picker"><div className="picker-heading"><strong>Select colour</strong><code>{brushColor.toUpperCase()}</code></div><div className="colour-fields"><div ref={colorSquareRef} className="colour-square" style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }} onPointerDown={(event) => startColorField(event, 'sv')} onPointerMove={moveColorField} onPointerUp={endColorField} onPointerCancel={endColorField}><i className="sv-marker" style={{ left: `clamp(6px, ${hsv.s}%, calc(100% - 6px))`, top: `clamp(6px, ${100 - hsv.v}%, calc(100% - 6px))` }} /></div><div ref={hueSliderRef} className="hue-slider" onPointerDown={(event) => startColorField(event, 'hue')} onPointerMove={moveColorField} onPointerUp={endColorField} onPointerCancel={endColorField}><i className="hue-slider-marker" style={{ top: `clamp(2px, ${hsv.h === 0 ? 0 : (360 - hsv.h) / 360 * 100}%, calc(100% - 2px))` }} /></div></div><div className="hex-row"><span style={{ background: brushColor }} /><input aria-label="Hex colour" value={hexDraft} spellCheck={false} onChange={(event) => setHexDraft(event.target.value)} onBlur={() => { const color = hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`; if (/^#[0-9a-f]{6}$/i.test(color)) setColor(color); else setHexDraft(brushColor); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></div><div className="recent-heading"><span>Recently used</span><button type="button" onClick={() => setColorHistory([])}>Clear</button></div><div className="recent-colours">{colorHistory.length ? colorHistory.map((color) => <button key={color} aria-label={`Use ${color}`} title={color.toUpperCase()} className={color === brushColor ? 'active' : ''} style={{ background: color }} onClick={() => setColor(color)} />) : <span>Paint with a colour to save it here</span>}</div></div>}</div>
        <div ref={importMenuRef} className="import-control"><Tooltip><TooltipTrigger aria-label="Import image or project" className={`tool-button ${importMenuOpen ? 'active' : ''}`} onClick={() => setImportMenuOpen((open) => !open)}><ImagePlus size={19} strokeWidth={1.8} /></TooltipTrigger><TooltipContent side="right">Photos and projects</TooltipContent></Tooltip>{importMenuOpen && <div className="import-menu"><div className="import-menu-heading"><strong>Photos</strong><span>Saved on this device</span></div><button className="import-action" onClick={() => photoFileRef.current?.click()}><ImagePlus />Upload new photo</button>{photoLibrary.length ? <div className="photo-library">{photoLibrary.map((photo) => <button key={photo.id} title={`Add ${photo.name} to this drawing`} onClick={() => { void placePhotoAsset(photo).catch((error) => addActivity('Photo placement failed', error instanceof Error ? error.message : 'Could not place that photo.')); }}><img src={photo.dataUrl} alt="" /><span>{photo.name}</span></button>)}</div> : <p className="photo-library-empty">Photos you upload will stay here for your other drawings.</p>}<div className="import-menu-divider" /><button className="import-action secondary" onClick={() => projectFileRef.current?.click()}><Layers3 />Open DUET project</button></div>}<input ref={photoFileRef} className="hidden" type="file" accept="image/*" onChange={importPhotoFile} /><input ref={projectFileRef} className="hidden" type="file" accept=".duet,.babyps,application/x-duet-project+json,application/x-baby-photoshop+json" onChange={importProjectFile} /></div>
        <div className="rail-spacer" /><Tooltip><TooltipTrigger aria-label="Help" className="tool-button"><CircleHelp size={18} /></TooltipTrigger><TooltipContent side="right">B brush · S smudge · U blur · A text</TooltipContent></Tooltip>
      </aside>
      <div className="canvas-column">
        <div className="context-bar">
          <div className="context-group">
            <strong>{tool === 'select' ? 'Region select' : tool === 'layer-lasso' ? 'Layer lasso' : tool === 'transform' ? 'Transform layer' : tool === 'eyedropper' ? 'Eyedropper' : tool[0].toUpperCase() + tool.slice(1)}</strong>
            {(['brush', 'eraser', 'smudge', 'blur'] as Tool[]).includes(tool) && <><span className="bar-label">Size</span><Slider className="brush-slider" min={tool === 'smudge' || tool === 'blur' ? 8 : 2} max={tool === 'smudge' || tool === 'blur' ? 160 : 96} value={[tool === 'smudge' || tool === 'blur' ? Math.max(8, brushSize) : brushSize]} onValueChange={(value) => setBrushSize(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><span className="size-readout">{tool === 'smudge' || tool === 'blur' ? Math.max(8, brushSize) : brushSize}px</span></>}
            {tool === 'brush' && <><span className="bar-label">Opacity</span><Slider className="brush-opacity-slider" min={1} max={100} value={[brushOpacity]} onValueChange={(value) => setBrushOpacity(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><span className="opacity-readout">{brushOpacity}%</span></>}
            {(tool === 'smudge' || tool === 'blur') && <><span className="bar-label">Strength</span><Slider className="brush-opacity-slider" min={1} max={100} value={[effectStrength]} onValueChange={(value) => setEffectStrength(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><span className="opacity-readout">{effectStrength}%</span></>}
            {tool === 'text' && <><label className="bar-label" htmlFor="text-font">Font</label><select id="text-font" className="font-select" value={textFont} onChange={(event) => setTextFont(event.target.value as TextFont)}>{textFonts.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select><span className="bar-label">Size</span><Slider className="text-size-slider" min={10} max={180} value={[textSize]} onValueChange={(value) => setTextSize(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><span className="size-readout">{textSize}px</span><span className="bar-hint">Click the canvas, type, then click away</span></>}
            {tool === 'select' && <><div className="selection-modes" aria-label="Selection shape"><button className={selectionMode === 'rectangle' ? 'active' : ''} title="Rectangle selection" aria-label="Rectangle selection" onClick={() => changeSelectionMode('rectangle')}><SquareDashed /></button><button className={selectionMode === 'brush' ? 'active' : ''} title="Brush selection" aria-label="Brush selection" onClick={() => changeSelectionMode('brush')}><Paintbrush /></button><button className={selectionMode === 'lasso' ? 'active' : ''} title="Lasso selection" aria-label="Lasso selection" onClick={() => changeSelectionMode('lasso')}><LassoSelect /></button></div>{selectionMode === 'brush' && <><span className="bar-label">Size</span><Slider className="selection-brush-slider" min={8} max={180} value={[selectionBrushSize]} onValueChange={(value) => setSelectionBrushSize(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><span className="size-readout">{selectionBrushSize}px</span></>}<span className="bar-hint">{selectionMode === 'rectangle' ? 'Drag a rectangle' : selectionMode === 'brush' ? 'Paint the area to include' : 'Draw around an area · release to close'}</span><button className="selection-clear" onClick={clearSelection} title="Clear selection" aria-label="Clear selection"><X /></button></>}
            {tool === 'layer-lasso' && <>{layerSelectionBounds ? <div className="layer-lasso-actions"><button onClick={cloneLayerSelection} title="Clone selection to a new layer"><Copy />Clone</button><button onClick={deleteLayerSelection} title="Delete selected pixels"><Trash2 />Delete</button><button className="icon-only" onClick={clearLayerSelection} title="Clear selection" aria-label="Clear layer selection"><X /></button></div> : <span className="bar-hint">Draw around pixels on the active layer</span>}</>}
            {tool === 'transform' && <span className="bar-hint">Drag layer to move · drag a corner to resize</span>}{tool === 'eyedropper' && <span className="bar-hint">Press and drag to preview · release to choose</span>}
          </div>
          <div className="history-controls"><Button variant="ghost" size="icon-sm" onClick={undo} aria-label="Undo"><Undo2 /></Button><Button variant="ghost" size="icon-sm" onClick={redo} aria-label="Redo"><Redo2 /></Button></div>
        </div>
        <div ref={viewportRef} className="stage-viewport"><div ref={stageRef} className="canvas-stage" style={{ width: `${zoom}%` }}><div className="canvas-wrap"><canvas ref={displayRef} width={WIDTH} height={HEIGHT} aria-label="Editable image canvas" className={`main-canvas tool-${tool}`} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={() => endPointer()} onPointerCancel={() => endPointer(true)} /><canvas ref={selectionOverlayRef} width={WIDTH} height={HEIGHT} className="selection-overlay" aria-hidden="true" /><canvas ref={layerSelectionOverlayRef} width={WIDTH} height={HEIGHT} className="layer-selection-overlay" aria-hidden="true" />{textDraft && <textarea autoFocus className="text-entry" aria-label="Text to add on a new layer" placeholder="Type here…" spellCheck value={textDraft.value} style={{ left: `${textDraft.x / WIDTH * 100}%`, top: `${textDraft.y / HEIGHT * 100}%`, color: brushColor, fontFamily: (textFonts.find((font) => font.id === textFont) || textFonts[0]).family, fontSize: `${textSize / WIDTH * 100}cqw` }} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })} onBlur={() => commitText(true)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); commitText(false); } if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />}{eyedropperPreview && <div className="eyedropper-preview" style={{ left: `${eyedropperPreview.x / WIDTH * 100}%`, top: `${eyedropperPreview.y / HEIGHT * 100}%` }}><span className="eyedropper-colour" style={{ background: eyedropperPreview.color }}><Pipette size={15} /></span></div>}{selection.width > 3 && selection.height > 3 && <div className={`selection-box ${selectionMode !== 'rectangle' ? 'freeform' : ''}`} style={{ left: `${selection.x / WIDTH * 100}%`, top: `${selection.y / HEIGHT * 100}%`, width: `${selection.width / WIDTH * 100}%`, height: `${selection.height / HEIGHT * 100}%` }}><span className="selection-label">Current selection</span>{selectionMode === 'rectangle' && <><i className="handle tl" /><i className="handle tr" /><i className="handle bl" /><i className="handle br" /></>}</div>}{tool === 'layer-lasso' && layerSelectionBounds && <div className="layer-selection-box" style={{ left: `${layerSelectionBounds.x / WIDTH * 100}%`, top: `${layerSelectionBounds.y / HEIGHT * 100}%`, width: `${layerSelectionBounds.width / WIDTH * 100}%`, height: `${layerSelectionBounds.height / HEIGHT * 100}%` }}><span className="transform-label">Selected pixels</span><i className="transform-handle tl" /><i className="transform-handle tr" /><i className="transform-handle bl" /><i className="transform-handle br" /></div>}{tool === 'transform' && transformBounds && <div className="transform-box" style={{ left: `${transformBounds.x / WIDTH * 100}%`, top: `${transformBounds.y / HEIGHT * 100}%`, width: `${transformBounds.width / WIDTH * 100}%`, height: `${transformBounds.height / HEIGHT * 100}%` }}><span className="transform-label">{layers.find((layer) => layer.id === activeLayer)?.name}</span><i className="transform-handle tl" /><i className="transform-handle tr" /><i className="transform-handle bl" /><i className="transform-handle br" /></div>}</div></div>{showBranding && <><div className="gesture-hint"><span>{Math.round(zoom)}%</span><span>Pinch to zoom</span><i /> <span>Two-finger drag to pan</span></div><div className="canvas-caption"><span className="live-dot" /> Live document · humans + agents share this canvas</div></>}</div>
      </div>
      <aside className="right-panel">
        <section className="ai-panel agent-bundle-panel">
          <div className="panel-heading"><div><WandSparkles size={16} /><strong>Agent edit</strong></div><span>{agentBundleReady ? 'bundle ready' : agentSelections.length ? 'draft bundle' : canEditWithAgent ? 'selection ready' : 'select a region'}</span></div>
          {agentBundleStatus === 'sent' ? <div className="agent-sent-hint"><strong><Check /> Bundle ready for your agent</strong><span>One edit target and {agentContexts.length} context reference{agentContexts.length === 1 ? '' : 's'} are frozen and available through WebMCP.</span><button type="button" onClick={markAgentBundleDraft}>Edit bundle</button></div> : canEditWithAgent ? <div className="agent-ready-hint"><strong>Selection ready to add.</strong><span>Add this area to the agent request. Nothing is sent yet.</span><Button size="sm" className="agent-add-button" onClick={addSelectionToAgentBundle} disabled={agentSelections.length >= 12}><Plus />{agentSelections.length >= 12 ? 'Bundle full' : 'Add selection'}</Button></div> : <p className="tool-required-hint"><strong>{agentSelections.length ? 'Select another area.' : 'Select an area first.'}</strong>{agentSelections.length ? ' Draw another region to add more visual context.' : ' Choose the Region select arrow, then mark the part of the canvas you want your agent to edit or reference.'}</p>}
          {agentSelections.length > 0 && <div className={`agent-bundle ${agentBundleStatus === 'sent' ? 'locked' : ''}`}>
            <div className="agent-bundle-section agent-target-section"><div className="agent-bundle-label"><span><strong>Edit target</strong><small>The agent edits this region and places the result on a new layer.</small></span><em>1 only</em></div><div data-agent-drop-zone="target" className={`agent-target-drop ${agentDropZone === 'target' ? 'drop-active' : ''}`}>{agentTarget ? renderAgentSelectionCard(agentTarget, 'target') : <span>Drag a region here to make it the edit target</span>}</div></div>
            <div className="agent-bundle-section agent-context-section"><div className="agent-bundle-label"><span><strong>Context references</strong><small>These help the agent understand the image. They will not be edited.</small></span><em>{agentContexts.length}</em></div><div className="agent-context-list">{agentContexts.map((item, index) => renderAgentSelectionCard(item, 'context', index))}<div data-agent-drop-zone="context-end" className={`agent-context-end ${agentDropZone === 'context-end' ? 'drop-active' : ''}`}>{agentContexts.length ? 'Drop to move to the end' : 'Add more selections for context'}</div></div></div>
            <Button size="sm" className="agent-send-button" onClick={sendAgentBundle} disabled={!agentTarget || agentBundleStatus === 'sent'}><Send />Send 1 target + {agentContexts.length} reference{agentContexts.length === 1 ? '' : 's'}</Button>
          </div>}
        </section>
        <section className="layers-panel"><div className="panel-heading layer-heading"><div><Layers3 size={16} /><strong>Layers</strong><span className="layer-count">{layers.length}</span></div><div className="layer-actions"><Button variant="ghost" size="icon-xs" aria-label="Move layer up" onClick={() => moveLayer(-1)}><ArrowUp /></Button><Button variant="ghost" size="icon-xs" aria-label="Move layer down" onClick={() => moveLayer(1)}><ArrowDown /></Button><Button variant="ghost" size="icon-xs" aria-label="New layer" onClick={() => createLayer()}><Plus /></Button></div></div><div className="opacity-row"><span>Opacity</span><Slider min={0} max={100} value={[activeOpacity]} onValueChange={(value) => { const opacity = Array.isArray(value) ? value[0] : Number(value); setLayers((items) => items.map((layer) => layer.id === activeLayer ? { ...layer, opacity } : layer)); }} /><span>{Math.round(activeOpacity)}%</span></div><div className="layer-list">{layers.map((layer) => <button key={layer.id} className={`layer-row ${activeLayer === layer.id ? 'active' : ''}`} onClick={() => setActiveLayer(layer.id)}><span className="visibility-toggle" role="button" tabIndex={0} aria-label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(event) => { event.stopPropagation(); setLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item)); }}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</span><canvas ref={(node) => { if (node) thumbnailRefs.current.set(layer.id, node); else thumbnailRefs.current.delete(layer.id); }} width={68} height={50} className="layer-thumb" style={{ background: layer.swatch }} aria-hidden="true" />{editingLayerId === layer.id ? <input autoFocus value={editingLayerName} aria-label="Layer name" className="layer-name-input" onChange={(event) => setEditingLayerName(event.target.value)} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onBlur={() => finishLayerRename(true)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishLayerRename(true); } if (event.key === 'Escape') { event.preventDefault(); finishLayerRename(false); } }} /> : <span className="layer-name" title="Double-click to rename" onDoubleClick={(event) => beginLayerRename(event, layer)}>{layer.name}<small>{layer.ai ? 'AI result · editable' : 'Pixel layer'}</small></span>}{activeLayer === layer.id && <Check size={13} className="active-check" />}</button>)}</div><div className="layer-footer"><div className="layer-footer-main"><Button variant="ghost" size="sm" onClick={() => createLayer()}><Plus />New layer</Button><Button variant="ghost" size="sm" onClick={mergeLayerDown} disabled={layers.findIndex((layer) => layer.id === activeLayer) >= layers.length - 1} title="Merge selected layer into the layer below (⌘E / Ctrl+E)"><Merge className="merge-down-icon" />Merge down</Button></div><Button variant="ghost" size="icon-sm" aria-label="Delete layer" onClick={removeActive} disabled={layers.length <= 1}><Trash2 /></Button></div></section>
        <section className="activity-panel"><div className="panel-heading"><div><Bot size={15} /><strong>Shared activity</strong></div><button aria-label="Close activity"><X size={14} /></button></div><div className="activity-list">{activities.slice(0, 3).map((item) => <div className="activity-row" key={item.id}><span className="activity-icon"><Sparkles size={12} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><time>{item.time}</time></div>)}</div></section>
      </aside>
    </section>
  </main></></TooltipProvider>;
}
