'use client';

import {
  ArrowDown, ArrowUp, Bot, Brush, Check, ChevronDown, CircleHelp, Download,
  Eraser, Eye, EyeOff, Hand, ImagePlus, Layers3, MousePointer2, Plus, Redo2,
  Sparkles, Trash2, Undo2, WandSparkles, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Tool = 'select' | 'brush' | 'eraser' | 'pan';
type Layer = { id: string; name: string; visible: boolean; opacity: number; blend: GlobalCompositeOperation; swatch: string; ai?: boolean };
type Selection = { x: number; y: number; width: number; height: number };
type Activity = { id: number; title: string; detail: string; time: string };
type WebMCPTool = { name: string; title?: string; description: string; inputSchema?: Record<string, unknown>; execute: (input: Record<string, unknown>) => Promise<unknown> | unknown };

declare global {
  interface Document {
    modelContext?: { registerTool: (tool: WebMCPTool, options?: { signal?: AbortSignal }) => Promise<void> };
  }
}

const WIDTH = 960;
const HEIGHT = 640;
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

export function BabyPhotoshop() {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const layerCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const initialized = useRef(false);
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const selectionStart = useRef({ x: 0, y: 0 });
  const undoStack = useRef<Array<{ layerId: string; image: ImageData }>>([]);
  const redoStack = useRef<Array<{ layerId: string; image: ImageData }>>([]);
  const actionsRef = useRef<Record<string, (...args: any[]) => any>>({});

  const [layers, setLayers] = useState(initialLayers);
  const [activeLayer, setActiveLayer] = useState('ai-light');
  const [tool, setTool] = useState<Tool>('select');
  const [brushSize, setBrushSize] = useState(28);
  const [brushColor, setBrushColor] = useState('#ff6b5f');
  const [zoom, setZoom] = useState(82);
  const [selection, setSelection] = useState<Selection>({ x: 490, y: 155, width: 300, height: 330 });
  const [prompt, setPrompt] = useState('Soften the background and add warm, late-afternoon light');
  const [busy, setBusy] = useState(false);
  const [webMcp, setWebMcp] = useState<'ready' | 'fallback'>('fallback');
  const [saved, setSaved] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    { id: 1, title: 'Agent added a layer', detail: 'Warm window light', time: 'now' },
    { id: 2, title: 'Region selected', detail: '300 × 330 px', time: '1m' },
  ]);

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

  const createLayer = useCallback((name = 'Paint layer') => {
    const id = `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    layerCanvases.current.set(id, makeCanvas());
    setLayers((items) => [{ id, name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#ffffff,#d5d1e8)' }, ...items]);
    setActiveLayer(id); addActivity('Layer created', name); return id;
  }, [addActivity]);

  const runAiEdit = useCallback(async (editPrompt = prompt) => {
    const clean = editPrompt.trim(); if (!clean || busy) return null;
    setBusy(true); addActivity('Agent is editing', clean); await new Promise((resolve) => setTimeout(resolve, 900));
    const id = `ai-${Date.now()}`; const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!;
    const target = selection.width > 4 && selection.height > 4 ? selection : { x: 0, y: 0, width: WIDTH, height: HEIGHT };
    ctx.save(); ctx.beginPath(); ctx.rect(target.x, target.y, target.width, target.height); ctx.clip();
    const warm = /warm|sun|gold|orange/i.test(clean); const cool = /cool|blue|night|moon/i.test(clean);
    const a = warm ? 'rgba(255,197,96,.68)' : cool ? 'rgba(85,156,255,.56)' : 'rgba(176,102,255,.52)';
    const b = warm ? 'rgba(255,92,92,0)' : cool ? 'rgba(99,76,190,0)' : 'rgba(255,126,171,0)';
    const g = ctx.createRadialGradient(target.x + target.width * .34, target.y + target.height * .3, 0, target.x + target.width * .5, target.y + target.height * .5, Math.max(target.width, target.height) * .8);
    g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(target.x, target.y, target.width, target.height);
    if (/soft|blur|dream/i.test(clean)) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(target.x, target.y, target.width, target.height); }
    ctx.restore(); layerCanvases.current.set(id, canvas);
    const name = `AI — ${clean.slice(0, 34)}${clean.length > 34 ? '…' : ''}`;
    setLayers((items) => [{ id, name, visible: true, opacity: 84, blend: 'soft-light', swatch: warm ? 'linear-gradient(135deg,#ffc560,#ff5c5c)' : cool ? 'linear-gradient(135deg,#559cff,#634cbe)' : 'linear-gradient(135deg,#b066ff,#ff7eab)', ai: true }, ...items]);
    setActiveLayer(id); setBusy(false); addActivity('AI result added as layer', clean); return id;
  }, [addActivity, busy, prompt, selection]);

  actionsRef.current = {
    getState: () => ({ canvas: { width: WIDTH, height: HEIGHT, zoom }, activeTool: tool, activeLayer, selection, layers: layers.map(({ id, name, visible, opacity, ai }) => ({ id, name, visible, opacity, ai: !!ai })) }),
    createLayer,
    setTool: (next: Tool) => { setTool(next); addActivity('Agent changed tool', next); return next; },
    select: (next: Selection) => { const safe = { x: Math.max(0, Math.min(WIDTH - 1, next.x)), y: Math.max(0, Math.min(HEIGHT - 1, next.y)), width: Math.max(1, Math.min(WIDTH, next.width)), height: Math.max(1, Math.min(HEIGHT, next.height)) }; setSelection(safe); addActivity('Agent selected region', `${Math.round(safe.width)} × ${Math.round(safe.height)} px`); return safe; },
    aiEdit: runAiEdit,
    toggleLayer: (id: string, visible: boolean) => { setLayers((items) => items.map((layer) => layer.id === id ? { ...layer, visible } : layer)); addActivity('Agent updated layer', visible ? 'Shown' : 'Hidden'); return { id, visible }; },
  };

  useEffect(() => {
    const mc = document.modelContext; if (!mc) { setWebMcp('fallback'); return; }
    const controller = new AbortController();
    const tools: WebMCPTool[] = [
      { name: 'get_document_state', title: 'Inspect Baby Photoshop document', description: 'Returns the canvas, selection, active tool, and editable layer stack.', execute: () => response(actionsRef.current.getState()) },
      { name: 'create_layer', title: 'Create an editable layer', description: 'Creates a transparent paint layer and makes it active.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Short layer name' } } }, execute: ({ name }) => response({ layerId: actionsRef.current.createLayer(String(name || 'Agent layer')) }) },
      { name: 'set_active_tool', title: 'Choose an editing tool', description: 'Selects the brush, eraser, region selection, or pan tool.', inputSchema: { type: 'object', properties: { tool: { type: 'string', enum: ['select', 'brush', 'eraser', 'pan'] } }, required: ['tool'] }, execute: ({ tool: next }) => response({ tool: actionsRef.current.setTool(next as Tool) }) },
      { name: 'select_region', title: 'Select a canvas region', description: 'Creates the region that the next AI edit should modify.', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }, required: ['x', 'y', 'width', 'height'] }, execute: ({ x, y, width, height }) => response(actionsRef.current.select({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) })) },
      { name: 'apply_ai_edit', title: 'Apply an AI edit as a layer', description: 'Applies a non-destructive local preview edit to the selected region and returns a new layer.', inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'Visual edit instruction' } }, required: ['prompt'] }, execute: async ({ prompt: edit }) => response({ layerId: await actionsRef.current.aiEdit(String(edit)) }) },
      { name: 'set_layer_visibility', title: 'Show or hide a layer', description: 'Changes layer visibility without destroying its pixels.', inputSchema: { type: 'object', properties: { layerId: { type: 'string' }, visible: { type: 'boolean' } }, required: ['layerId', 'visible'] }, execute: ({ layerId, visible }) => response(actionsRef.current.toggleLayer(String(layerId), Boolean(visible))) },
    ];
    Promise.all(tools.map((item) => mc.registerTool(item, { signal: controller.signal }))).then(() => setWebMcp('ready')).catch(() => setWebMcp('fallback'));
    return () => controller.abort();
  }, []);

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT }; };
  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => { const ctx = layerCanvases.current.get(activeLayer)?.getContext('2d'); if (!ctx) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize; ctx.strokeStyle = brushColor; ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore(); render(); };
  const startPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') return; const point = pointer(event); event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'select') { selectionStart.current = point; setSelection({ x: point.x, y: point.y, width: 0, height: 0 }); drawing.current = true; return; }
    const ctx = layerCanvases.current.get(activeLayer)?.getContext('2d'); if (!ctx) return;
    undoStack.current.push({ layerId: activeLayer, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); if (undoStack.current.length > 15) undoStack.current.shift(); redoStack.current = [];
    drawing.current = true; lastPoint.current = point; drawStroke(point, point);
  };
  const movePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return; const point = pointer(event);
    if (tool === 'select') { const start = selectionStart.current; setSelection({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) }); return; }
    drawStroke(lastPoint.current, point); lastPoint.current = point;
  };
  const endPointer = () => { if (drawing.current && tool === 'select') addActivity('Region selected', `${Math.round(selection.width)} × ${Math.round(selection.height)} px`); drawing.current = false; };
  const undo = useCallback(() => { const entry = undoStack.current.pop(); if (!entry) return; const ctx = layerCanvases.current.get(entry.layerId)?.getContext('2d'); if (!ctx) return; redoStack.current.push({ layerId: entry.layerId, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); ctx.putImageData(entry.image, 0, 0); render(); }, [render]);
  const redo = () => { const entry = redoStack.current.pop(); if (!entry) return; const ctx = layerCanvases.current.get(entry.layerId)?.getContext('2d'); if (!ctx) return; undoStack.current.push({ layerId: entry.layerId, image: ctx.getImageData(0, 0, WIDTH, HEIGHT) }); ctx.putImageData(entry.image, 0, 0); render(); };
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; const next = toolMeta.find((item) => item.key.toLowerCase() === event.key.toLowerCase()); if (next) setTool(next.id); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); } }; window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown); }, [undo]);

  const importImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; const image = new Image();
    image.onload = () => { const id = `import-${Date.now()}`; const canvas = makeCanvas(); const ctx = canvas.getContext('2d')!; const scale = Math.min(WIDTH / image.width, HEIGHT / image.height); const width = image.width * scale; const height = image.height * scale; ctx.drawImage(image, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height); layerCanvases.current.set(id, canvas); setLayers((items) => [{ id, name: file.name, visible: true, opacity: 100, blend: 'source-over', swatch: 'linear-gradient(135deg,#93b8cc,#e4b28d)' }, ...items]); setActiveLayer(id); addActivity('Photo imported', file.name); URL.revokeObjectURL(image.src); }; image.src = URL.createObjectURL(file); event.target.value = '';
  };
  const exportImage = () => { render(); const link = document.createElement('a'); link.download = 'baby-photoshop-export.png'; link.href = displayRef.current?.toDataURL('image/png') || ''; link.click(); addActivity('Canvas exported', 'PNG · 960 × 640'); };
  const removeActive = () => { if (layers.length <= 1) return; layerCanvases.current.delete(activeLayer); setLayers((items) => { const next = items.filter((layer) => layer.id !== activeLayer); setActiveLayer(next[0]?.id || ''); return next; }); addActivity('Layer removed', 'Canvas preserved'); };
  const moveLayer = (direction: -1 | 1) => setLayers((items) => { const index = items.findIndex((layer) => layer.id === activeLayer); const nextIndex = Math.max(0, Math.min(items.length - 1, index + direction)); if (index < 0 || index === nextIndex) return items; const next = [...items]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; });
  const activeOpacity = layers.find((layer) => layer.id === activeLayer)?.opacity ?? 100;

  return <TooltipProvider delay={350}><main className="editor-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><Sparkles size={15} /></div><span>baby photoshop</span><span className="mvp-pill">MVP</span></div>
      <div className="document-title"><span>Untitled portrait</span><ChevronDown size={13} /></div>
      <div className="header-actions"><div className="mcp-status" title={webMcp === 'ready' ? 'Native WebMCP tools are registered' : 'Tools activate in a WebMCP-compatible browser'}><span className={`status-dot ${webMcp === 'ready' ? 'ready' : ''}`} /><Bot size={14} /><span>{webMcp === 'ready' ? 'WebMCP ready' : '6 agent tools'}</span></div><Button variant="ghost" size="sm" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1400); }}>{saved && <Check />}{saved ? 'Saved' : 'Save'}</Button><Button size="sm" className="export-button" onClick={exportImage}><Download />Export</Button></div>
    </header>
    <section className="workspace">
      <aside className="tool-rail" aria-label="Editing tools">
        {toolMeta.map(({ id, label, icon: Icon, key }) => <Tooltip key={id}><TooltipTrigger aria-label={label} className={`tool-button ${tool === id ? 'active' : ''}`} onClick={() => setTool(id)}><Icon size={19} strokeWidth={1.8} /></TooltipTrigger><TooltipContent side="right">{label} · {key}</TooltipContent></Tooltip>)}
        <div className="rail-divider" /><label className="color-control" title="Brush color"><input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} /><span style={{ background: brushColor }} /></label>
        <Tooltip><TooltipTrigger aria-label="Import image" className="tool-button" onClick={() => fileRef.current?.click()}><ImagePlus size={19} strokeWidth={1.8} /></TooltipTrigger><TooltipContent side="right">Import image</TooltipContent></Tooltip><input ref={fileRef} className="hidden" type="file" accept="image/*" onChange={importImage} />
        <div className="rail-spacer" /><Tooltip><TooltipTrigger aria-label="Help" className="tool-button"><CircleHelp size={18} /></TooltipTrigger><TooltipContent side="right">B brush · E erase · V select</TooltipContent></Tooltip>
      </aside>
      <div className="canvas-column">
        <div className="context-bar"><div className="context-group"><strong>{tool === 'select' ? 'Region select' : tool[0].toUpperCase() + tool.slice(1)}</strong>{(tool === 'brush' || tool === 'eraser') && <><span className="bar-label">Size</span><Slider className="brush-slider" min={2} max={96} value={[brushSize]} onValueChange={(value) => setBrushSize(Array.isArray(value) ? value[0] : Number(value))} /><span className="size-readout">{brushSize}px</span></>}{tool === 'select' && <span className="bar-hint">Drag to focus the next AI edit</span>}</div><div className="history-controls"><Button variant="ghost" size="icon-sm" onClick={undo} aria-label="Undo"><Undo2 /></Button><Button variant="ghost" size="icon-sm" onClick={redo} aria-label="Redo"><Redo2 /></Button></div></div>
        <div className="stage-viewport"><div className="canvas-stage" style={{ width: `${zoom}%` }}><div className="canvas-wrap"><canvas ref={displayRef} width={WIDTH} height={HEIGHT} aria-label="Editable image canvas" className={`main-canvas tool-${tool}`} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} />{selection.width > 3 && selection.height > 3 && <div className="selection-box" style={{ left: `${selection.x / WIDTH * 100}%`, top: `${selection.y / HEIGHT * 100}%`, width: `${selection.width / WIDTH * 100}%`, height: `${selection.height / HEIGHT * 100}%` }}><span className="selection-label">AI target</span><i className="handle tl" /><i className="handle tr" /><i className="handle bl" /><i className="handle br" /></div>}</div></div><div className="zoom-control"><Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => setZoom((v) => Math.max(36, v - 10))}><ZoomOut /></Button><span>{zoom}%</span><Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => setZoom((v) => Math.min(150, v + 10))}><ZoomIn /></Button></div><div className="canvas-caption"><span className="live-dot" /> Live document · humans + agents share this canvas</div></div>
      </div>
      <aside className="right-panel">
        <section className="ai-panel"><div className="panel-heading"><div><WandSparkles size={16} /><strong>AI edit</strong></div><span>non-destructive</span></div><Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void runAiEdit(); }} placeholder="Describe the change…" aria-label="AI edit prompt" className="prompt-input" /><div className="prompt-meta"><span><MousePointer2 size={12} /> Selected region</span><span>{Math.round(selection.width)} × {Math.round(selection.height)}</span></div><Button className="ai-button" onClick={() => void runAiEdit()} disabled={busy || !prompt.trim()}>{busy ? <span className="spinner" /> : <Sparkles />}{busy ? 'Making a new layer…' : 'Generate edit'}{!busy && <kbd>⌘↵</kbd>}</Button><p className="demo-note">MVP uses an instant local visual treatment. Connect your image model in one server action later.</p></section>
        <section className="layers-panel"><div className="panel-heading layer-heading"><div><Layers3 size={16} /><strong>Layers</strong><span className="layer-count">{layers.length}</span></div><div className="layer-actions"><Button variant="ghost" size="icon-xs" aria-label="Move layer up" onClick={() => moveLayer(-1)}><ArrowUp /></Button><Button variant="ghost" size="icon-xs" aria-label="Move layer down" onClick={() => moveLayer(1)}><ArrowDown /></Button><Button variant="ghost" size="icon-xs" aria-label="New layer" onClick={() => createLayer()}><Plus /></Button></div></div><div className="opacity-row"><span>Opacity</span><Slider min={0} max={100} value={[activeOpacity]} onValueChange={(value) => { const opacity = Array.isArray(value) ? value[0] : Number(value); setLayers((items) => items.map((layer) => layer.id === activeLayer ? { ...layer, opacity } : layer)); }} /><span>{Math.round(activeOpacity)}%</span></div><div className="layer-list">{layers.map((layer) => <button key={layer.id} className={`layer-row ${activeLayer === layer.id ? 'active' : ''}`} onClick={() => setActiveLayer(layer.id)}><span className="visibility-toggle" role="button" tabIndex={0} aria-label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(event) => { event.stopPropagation(); setLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item)); }}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</span><span className="layer-thumb" style={{ background: layer.swatch }}>{layer.ai && <Sparkles size={10} />}</span><span className="layer-name">{layer.name}<small>{layer.ai ? 'AI result · editable' : 'Pixel layer'}</small></span>{activeLayer === layer.id && <Check size={13} className="active-check" />}</button>)}</div><div className="layer-footer"><Button variant="ghost" size="sm" onClick={() => createLayer()}><Plus />New layer</Button><Button variant="ghost" size="icon-sm" aria-label="Delete layer" onClick={removeActive} disabled={layers.length <= 1}><Trash2 /></Button></div></section>
        <section className="activity-panel"><div className="panel-heading"><div><Bot size={15} /><strong>Shared activity</strong></div><button aria-label="Close activity"><X size={14} /></button></div><div className="activity-list">{activities.slice(0, 3).map((item) => <div className="activity-row" key={item.id}><span className="activity-icon"><Sparkles size={12} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><time>{item.time}</time></div>)}</div></section>
      </aside>
    </section>
  </main></TooltipProvider>;
}
