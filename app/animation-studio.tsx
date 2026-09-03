'use client';

import { Brush, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, Droplets, Eraser, Eye, EyeOff, Film, Focus, Ghost, GripHorizontal, Hand, ImagePlus, Lock, Music2, Pause, Pipette, Play, Plus, Redo2, Scissors, SkipBack, SkipForward, Sparkles, Trash2, Type as TypeIcon, Undo2, Unlock, Video } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const WIDTH = 960;
const HEIGHT = 640;
const PX = 8;
const MIN_TIMELINE = 96;
const FRAME_EDITOR_DEFAULT_HEIGHT = 328;
const FRAME_EDITOR_MIN_HEIGHT = 178;
const FRAME_EDITOR_ONE_TRACK_HEIGHT = 232;
type AnimationTool = 'brush' | 'eraser' | 'smudge' | 'blur' | 'text' | 'eyedropper' | 'pan';
type TextFont = 'sans' | 'serif' | 'mono' | 'rounded';
type TextDraft = { x: number; y: number; value: string };
type EyedropperPreview = { x: number; y: number; color: string };
type SharedPhotoAsset = { id: string; name: string; dataUrl: string; width: number; height: number; createdAt: number };
type IllustrationSource = { id: string; name: string };
type Track = { id: string; name: string; kind: 'visual' | 'audio'; visible: boolean; locked: boolean };
type CelClip = { id: string; type: 'cel'; trackId: string; name: string; start: number; duration: number; opacity: number; exposure: number; finalHold: number; frameIds: string[] };
type StillClip = { id: string; type: 'still'; trackId: string; name: string; start: number; duration: number; opacity: number };
type VideoClip = { id: string; type: 'video'; trackId: string; name: string; start: number; duration: number; opacity: number; volume: number; url: string; sourceOffset: number };
type AudioClip = { id: string; type: 'audio'; trackId: string; name: string; start: number; duration: number; volume: number; url: string };
type Clip = CelClip | StillClip | VideoClip | AudioClip;
type ClipDrag = { id: string; mode: 'move' | 'start' | 'end'; clientX: number; start: number; duration: number; sourceOffset: number };
type FrameEditorResize = { pointerId: number; startY: number; startHeight: number };
type Props = {
  active: boolean;
  documentName: string;
  onModeChange: (mode: 'illustration' | 'animation') => void;
  exportProject: () => void;
  getIllustrationImage: (drawingId?: string) => ImageData | null;
  illustrations: IllustrationSource[];
  photoLibrary: SharedPhotoAsset[];
  importSharedPhoto: (file: File) => Promise<SharedPhotoAsset>;
};
export type AnimationStudioHandle = { exportWorkspace: () => Promise<void> };
function makeCanvas() { const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT; return canvas; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function getMaxFrameEditorHeight() { return typeof window === 'undefined' ? FRAME_EDITOR_DEFAULT_HEIGHT : Math.max(FRAME_EDITOR_MIN_HEIGHT, Math.min(560, window.innerHeight - 250)); }
function rgbToHex(r: number, g: number, b: number) { return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`; }
function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function safeName(name: string) { return name.trim().replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').slice(0, 80) || 'Untitled animation'; }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500); }
function seekVideo(video: HTMLVideoElement, time: number) { return new Promise<void>((resolve) => { const target = clamp(time, 0, Number.isFinite(video.duration) ? Math.max(0, video.duration - .001) : time); if (video.readyState >= 2 && Math.abs(video.currentTime - target) < .01) { resolve(); return; } let settled = false; const finish = () => { if (settled) return; settled = true; video.removeEventListener('seeked', finish); video.removeEventListener('loadeddata', retry); window.clearTimeout(timeout); resolve(); }; const retry = () => { try { video.currentTime = target; } catch { finish(); } }; const timeout = window.setTimeout(finish, 1200); video.addEventListener('seeked', finish, { once: true }); if (video.readyState >= 1) retry(); else video.addEventListener('loadeddata', retry, { once: true }); }); }
function celDuration(frameCount: number, exposure: number, finalHold = 0) { return Math.max(1, frameCount * exposure + finalHold); }
function overlaps(start: number, duration: number, other: Clip) { return start < other.start + other.duration && start + duration > other.start; }
function trackBlockers(items: Clip[], trackId: string, excludeId?: string) { return items.filter((clip) => clip.trackId === trackId && clip.id !== excludeId).sort((a, b) => a.start - b.start); }
function findForwardSlot(items: Clip[], trackId: string, preferredStart: number, duration: number, excludeId?: string) { const blockers = trackBlockers(items, trackId, excludeId); let start = Math.max(0, preferredStart); for (;;) { const collision = blockers.find((clip) => overlaps(start, duration, clip)); if (!collision) return start; start = collision.start + collision.duration; } }
function findBackwardSlot(items: Clip[], trackId: string, preferredStart: number, duration: number, excludeId?: string) { const blockers = trackBlockers(items, trackId, excludeId); let start = Math.max(0, preferredStart); for (;;) { const collisions = blockers.filter((clip) => overlaps(start, duration, clip)); if (!collisions.length) return start; const next = collisions[collisions.length - 1].start - duration; if (next < 0) return findForwardSlot(items, trackId, 0, duration, excludeId); start = next; } }
function pushFollowingClips(items: Clip[], changedId: string) { const changed = items.find((clip) => clip.id === changedId); if (!changed) return items; let nextStart = changed.start + changed.duration; const moved = new Map<string, number>(); trackBlockers(items, changed.trackId, changed.id).filter((clip) => clip.start >= changed.start).forEach((clip) => { const start = Math.max(clip.start, nextStart); moved.set(clip.id, start); nextStart = start + clip.duration; }); return items.map((clip) => moved.has(clip.id) ? { ...clip, start: moved.get(clip.id)! } : clip); }

const initialTracks: Track[] = [
  { id: 'track-character', name: 'Character', kind: 'visual', visible: true, locked: false },
  { id: 'track-background', name: 'Background', kind: 'visual', visible: true, locked: false },
  { id: 'track-audio', name: 'Audio', kind: 'audio', visible: true, locked: false },
];
const initialClips: Clip[] = [{ id: 'clip-main', type: 'cel', trackId: 'track-character', name: 'Main flipbook', start: 0, duration: 2, opacity: 100, exposure: 2, finalHold: 0, frameIds: ['animation-frame-1'] }];
const textFonts: Array<{ id: TextFont; label: string; family: string }> = [
  { id: 'sans', label: 'Sans', family: 'Arial, Helvetica, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', family: '"Courier New", monospace' },
  { id: 'rounded', label: 'Rounded', family: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif' },
];
const animationToolMeta: Array<{ id: AnimationTool; label: string; icon: typeof Brush }> = [
  { id: 'brush', label: 'Brush', icon: Brush },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'smudge', label: 'Smudge', icon: Droplets },
  { id: 'blur', label: 'Blur', icon: Focus },
  { id: 'text', label: 'Text', icon: TypeIcon },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette },
  { id: 'pan', label: 'Pan canvas', icon: Hand },
];

export const AnimationStudio = forwardRef<AnimationStudioHandle, Props>(function AnimationStudio({ active, documentName, onModeChange, exportProject, getIllustrationImage, illustrations, photoLibrary, importSharedPhoto }, ref) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const canvasStageRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const assetMenuRef = useRef<HTMLDivElement>(null);
  const textEntryRef = useRef<HTMLTextAreaElement>(null);
  const frameCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const stillCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const videoElements = useRef(new Map<string, HTMLVideoElement>());
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const assetUrls = useRef(new Set<string>());
  const thumbnailRefs = useRef(new Map<string, HTMLCanvasElement>());
  const undoStacks = useRef(new Map<string, ImageData[]>());
  const redoStacks = useRef(new Map<string, ImageData[]>());
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const panning = useRef(false);
  const zoomRef = useRef(82);
  const zoomFrame = useRef<number | null>(null);
  const smudgeBufferRef = useRef<HTMLCanvasElement | null>(null);
  const eyedropperColor = useRef<string | null>(null);
  const drag = useRef<ClipDrag | null>(null);
  const frameEditorResize = useRef<FrameEditorResize | null>(null);
  const initialized = useRef(false);
  const playbackFrame = useRef<number | null>(null);
  const playbackOrigin = useRef({ time: 0, frame: 0 });
  const playheadRef = useRef(0);
  const [tracks, setTracks] = useState(initialTracks);
  const [clips, setClips] = useState(initialClips);
  const [activeTrackId, setActiveTrackId] = useState('track-character');
  const [activeClipId, setActiveClipId] = useState('clip-main');
  const [activeFrameId, setActiveFrameId] = useState('animation-frame-1');
  const [playhead, setPlayhead] = useState(0);
  const [tool, setTool] = useState<AnimationTool>('brush');
  const [brushSize, setBrushSize] = useState(18);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [brushColor, setBrushColor] = useState('#ff6b5f');
  const [effectStrength, setEffectStrength] = useState(55);
  const [textFont, setTextFont] = useState<TextFont>('sans');
  const [textSize, setTextSize] = useState(48);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [eyedropperPreview, setEyedropperPreview] = useState<EyedropperPreview | null>(null);
  const [zoom, setZoom] = useState(82);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [onionSkin, setOnionSkin] = useState(true);
  const [fps, setFps] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [frameEditorHeight, setFrameEditorHeight] = useState(FRAME_EDITOR_DEFAULT_HEIGHT);
  const [timelineManuallyCollapsed, setTimelineManuallyCollapsed] = useState(false);
  const [bottomDrawerCollapsed, setBottomDrawerCollapsed] = useState(false);

  const activeClip = clips.find((clip) => clip.id === activeClipId) || null;
  const activeTrack = tracks.find((track) => track.id === activeClip?.trackId) || null;
  const selectedTrack = tracks.find((track) => track.id === activeTrackId) || null;
  const selectedTrackIndex = tracks.findIndex((track) => track.id === activeTrackId);
  const activeFrames = activeClip?.type === 'cel' ? activeClip.frameIds : [];
  const foundFrameIndex = activeFrames.indexOf(activeFrameId);
  const activeFrameIndex = foundFrameIndex < 0 ? 0 : foundFrameIndex;
  const timelineFrames = Math.max(MIN_TIMELINE, ...clips.map((clip) => clip.start + clip.duration + fps));
  const seconds = useMemo(() => Array.from({ length: Math.ceil(timelineFrames / fps) + 1 }, (_, index) => index), [fps, timelineFrames]);
  const timelineCollapsed = timelineManuallyCollapsed || frameEditorHeight < FRAME_EDITOR_ONE_TRACK_HEIGHT;

  const zoomAt = useCallback((requestedZoom: number, clientX?: number, clientY?: number) => {
    const viewport = stageViewportRef.current;
    const stage = canvasStageRef.current;
    if (!viewport || !stage) return;
    const nextZoom = clamp(Math.round(requestedZoom * 10) / 10, 25, 400);
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
    const viewport = stageViewportRef.current;
    if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const limitedDelta = clamp(event.deltaY, -24, 24);
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

  const clipSource = useCallback((clip: Clip, at: number) => {
    if (clip.type === 'still') return stillCanvases.current.get(clip.id) || null;
    if (clip.type === 'video') { const video = videoElements.current.get(clip.id); return video && video.readyState >= 2 ? video : null; }
    if (clip.type !== 'cel') return null;
    const local = clamp(at - clip.start, 0, Math.max(0, clip.duration - 1));
    return frameCanvases.current.get(clip.frameIds[clamp(Math.floor(local / clip.exposure), 0, clip.frameIds.length - 1)]) || null;
  }, []);
  const drawAt = useCallback((ctx: CanvasRenderingContext2D, at: number, onion = false) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    tracks.filter((track) => track.kind === 'visual' && track.visible).reverse().forEach((track) => {
      clips.filter((clip) => clip.trackId === track.id && at >= clip.start && at < clip.start + clip.duration).forEach((clip) => {
        if (clip.type === 'audio') return;
        if (onion && clip.id === activeClipId && clip.type === 'cel') {
          const index = clip.frameIds.indexOf(activeFrameId); const previous = index > 0 ? frameCanvases.current.get(clip.frameIds[index - 1]) : null;
          if (previous) { ctx.save(); ctx.globalAlpha = .18; ctx.drawImage(previous, 0, 0); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = '#dd72f5'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.restore(); }
        }
        const source = clipSource(clip, at); if (!source) return; ctx.save(); ctx.globalAlpha = clip.opacity / 100; if (clip.type === 'video') { const video = source as HTMLVideoElement; const width = video.videoWidth || WIDTH; const height = video.videoHeight || HEIGHT; const scale = Math.min(WIDTH / width, HEIGHT / height); ctx.drawImage(video, (WIDTH - width * scale) / 2, (HEIGHT - height * scale) / 2, width * scale, height * scale); } else ctx.drawImage(source, 0, 0); ctx.restore();
      });
    });
  }, [activeClipId, activeFrameId, clipSource, clips, tracks]);
  const render = useCallback(() => {
    const ctx = displayRef.current?.getContext('2d'); if (ctx) drawAt(ctx, playhead, onionSkin && !playing && activeClip?.type === 'cel');
    clips.forEach((clip) => { if (clip.type !== 'cel') return; clip.frameIds.forEach((frameId) => { const thumbnail = thumbnailRefs.current.get(frameId); const source = frameCanvases.current.get(frameId); if (!thumbnail || !source) return; const thumbCtx = thumbnail.getContext('2d')!; thumbCtx.clearRect(0, 0, thumbnail.width, thumbnail.height); thumbCtx.drawImage(source, 0, 0, WIDTH, HEIGHT, 0, 0, thumbnail.width, thumbnail.height); }); });
  }, [activeClip?.type, clips, drawAt, onionSkin, playhead, playing]);

  const selectClip = (clip: Clip) => { setPlaying(false); setActiveTrackId(clip.trackId); setActiveClipId(clip.id); setPlayhead(clip.start); if (clip.type === 'cel') setActiveFrameId(clip.frameIds[0]); };
  const selectTrack = (trackId: string) => { setPlaying(false); setActiveTrackId(trackId); setActiveClipId(''); };
  const selectFrame = (frameId: string, index: number) => { if (activeClip?.type !== 'cel') return; setPlaying(false); setActiveFrameId(frameId); setPlayhead(activeClip.start + index * activeClip.exposure); };
  const selectOffset = (offset: number) => { if (!activeFrames.length) return; const index = clamp(activeFrameIndex + offset, 0, activeFrames.length - 1); selectFrame(activeFrames[index], index); };
  const pushUndo = () => { const canvas = frameCanvases.current.get(activeFrameId); if (!canvas) return; const stack = undoStacks.current.get(activeFrameId) || []; stack.push(canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT)); undoStacks.current.set(activeFrameId, stack.slice(-30)); redoStacks.current.set(activeFrameId, []); };
  const undo = () => { const canvas = frameCanvases.current.get(activeFrameId); const stack = undoStacks.current.get(activeFrameId) || []; const image = stack.pop(); if (!canvas || !image) return; const ctx = canvas.getContext('2d')!; const redoStack = redoStacks.current.get(activeFrameId) || []; redoStack.push(ctx.getImageData(0, 0, WIDTH, HEIGHT)); redoStacks.current.set(activeFrameId, redoStack.slice(-30)); ctx.putImageData(image, 0, 0); render(); };
  const redo = () => { const canvas = frameCanvases.current.get(activeFrameId); const stack = redoStacks.current.get(activeFrameId) || []; const image = stack.pop(); if (!canvas || !image) return; const ctx = canvas.getContext('2d')!; const undoStack = undoStacks.current.get(activeFrameId) || []; undoStack.push(ctx.getImageData(0, 0, WIDTH, HEIGHT)); undoStacks.current.set(activeFrameId, undoStack.slice(-30)); ctx.putImageData(image, 0, 0); render(); };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height }; };
  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => { if (activeClip?.type !== 'cel' || activeTrack?.locked) return; const ctx = frameCanvases.current.get(activeFrameId)?.getContext('2d'); if (!ctx) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize; ctx.globalAlpha = tool === 'brush' ? brushOpacity / 100 : 1; ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.strokeStyle = brushColor; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x + .01, to.y + .01); ctx.stroke(); ctx.restore(); render(); };
  const beginSmudge = (at: { x: number; y: number }) => { const source = frameCanvases.current.get(activeFrameId); if (!source) return; const size = Math.max(8, Math.ceil(brushSize)); const buffer = document.createElement('canvas'); buffer.width = size; buffer.height = size; const ctx = buffer.getContext('2d')!; ctx.save(); ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(source, at.x - size / 2, at.y - size / 2, size, size, 0, 0, size, size); ctx.restore(); smudgeBufferRef.current = buffer; };
  const smudgeStamp = (at: { x: number; y: number }) => { const canvas = frameCanvases.current.get(activeFrameId); const buffer = smudgeBufferRef.current; if (!canvas || !buffer) return; const size = buffer.width; const x = at.x - size / 2; const y = at.y - size / 2; const ctx = canvas.getContext('2d')!; ctx.save(); ctx.beginPath(); ctx.arc(at.x, at.y, size / 2, 0, Math.PI * 2); ctx.clip(); ctx.globalAlpha = .12 + effectStrength / 100 * .68; ctx.drawImage(buffer, x, y); ctx.restore(); const fresh = document.createElement('canvas'); fresh.width = size; fresh.height = size; fresh.getContext('2d')!.drawImage(canvas, x, y, size, size, 0, 0, size, size); const bufferCtx = buffer.getContext('2d')!; bufferCtx.save(); bufferCtx.globalAlpha = .24; bufferCtx.drawImage(fresh, 0, 0); bufferCtx.restore(); };
  const blurStamp = (at: { x: number; y: number }) => { const canvas = frameCanvases.current.get(activeFrameId); if (!canvas) return; const radius = Math.max(4, brushSize / 2); const blurRadius = 1 + effectStrength / 100 * 15; const padding = Math.ceil(radius + blurRadius * 2); const size = padding * 2; const source = document.createElement('canvas'); source.width = size; source.height = size; source.getContext('2d')!.drawImage(canvas, at.x - padding, at.y - padding, size, size, 0, 0, size, size); const softened = document.createElement('canvas'); softened.width = size; softened.height = size; const softenedCtx = softened.getContext('2d')!; softenedCtx.filter = `blur(${blurRadius}px)`; softenedCtx.drawImage(source, 0, 0); const ctx = canvas.getContext('2d')!; ctx.save(); ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.clip(); ctx.globalAlpha = .35 + effectStrength / 100 * .6; ctx.drawImage(softened, at.x - padding, at.y - padding); ctx.restore(); };
  const applyEffectStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => { const distance = Math.hypot(to.x - from.x, to.y - from.y); const steps = Math.max(1, Math.ceil(distance / Math.max(2, Math.max(8, brushSize) * .18))); for (let index = 1; index <= steps; index += 1) { const ratio = index / steps; const at = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }; if (tool === 'smudge') smudgeStamp(at); else blurStamp(at); } render(); };
  const previewEyedropper = (at: { x: number; y: number }) => { const ctx = displayRef.current?.getContext('2d'); if (!ctx) return; const pixel = ctx.getImageData(clamp(Math.floor(at.x), 0, WIDTH - 1), clamp(Math.floor(at.y), 0, HEIGHT - 1), 1, 1).data; if (!pixel[3]) return; const color = rgbToHex(pixel[0], pixel[1], pixel[2]); eyedropperColor.current = color; setEyedropperPreview({ ...at, color }); };
  const commitText = (save = true) => { const draft = textDraft; setTextDraft(null); if (!save || !draft || activeClip?.type !== 'cel') return; const value = draft.value.trim(); if (!value) return; const ctx = frameCanvases.current.get(activeFrameId)?.getContext('2d'); if (!ctx) return; pushUndo(); const font = textFonts.find((option) => option.id === textFont) || textFonts[0]; ctx.save(); ctx.fillStyle = brushColor; ctx.globalAlpha = brushOpacity / 100; ctx.textBaseline = 'top'; ctx.font = `${textSize}px ${font.family}`; value.split(/\r?\n/).forEach((line, index) => ctx.fillText(line, draft.x, draft.y + index * textSize * 1.18, Math.max(1, WIDTH - draft.x))); ctx.restore(); render(); };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { if (tool === 'pan') { const viewport = stageViewportRef.current; if (!viewport) return; event.currentTarget.setPointerCapture(event.pointerId); panning.current = true; panStart.current = { x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop }; return; } if (playing || activeClip?.type !== 'cel' || activeTrack?.locked) return; const at = point(event); if (tool === 'text') { if (!textDraft) { setTextDraft({ x: clamp(at.x, 0, WIDTH - 12), y: clamp(at.y, 0, HEIGHT - textSize), value: '' }); requestAnimationFrame(() => textEntryRef.current?.focus()); } return; } event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; lastPoint.current = at; if (tool === 'eyedropper') { previewEyedropper(at); return; } pushUndo(); if (tool === 'smudge') beginSmudge(at); else if (tool === 'blur') applyEffectStroke(at, at); else drawLine(at, at); };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { if (panning.current) { const viewport = stageViewportRef.current; if (!viewport) return; viewport.scrollLeft = panStart.current.scrollLeft - (event.clientX - panStart.current.x); viewport.scrollTop = panStart.current.scrollTop - (event.clientY - panStart.current.y); return; } if (!drawing.current) return; const next = point(event); if (tool === 'eyedropper') previewEyedropper(next); else if (tool === 'smudge' || tool === 'blur') applyEffectStroke(lastPoint.current, next); else drawLine(lastPoint.current, next); lastPoint.current = next; };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => { if (tool === 'eyedropper' && eyedropperColor.current) { setBrushColor(eyedropperColor.current); setTool('brush'); } drawing.current = false; panning.current = false; smudgeBufferRef.current = null; eyedropperColor.current = null; setEyedropperPreview(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); render(); };

  const addFrame = (duplicate = false) => { if (activeClip?.type !== 'cel') return; const id = uid('frame'); const canvas = makeCanvas(); const source = frameCanvases.current.get(activeFrameId); if (duplicate && source) canvas.getContext('2d')!.drawImage(source, 0, 0); frameCanvases.current.set(id, canvas); const index = activeFrameIndex + 1; setClips((items) => { const updated = items.map((clip) => { if (clip.id !== activeClip.id || clip.type !== 'cel') return clip; const frameIds = [...clip.frameIds.slice(0, index), id, ...clip.frameIds.slice(index)]; return { ...clip, frameIds, duration: celDuration(frameIds.length, clip.exposure, clip.finalHold) }; }); return pushFollowingClips(updated, activeClip.id); }); setActiveFrameId(id); setPlayhead(activeClip.start + index * activeClip.exposure); };
  const deleteFrame = () => { if (activeClip?.type !== 'cel') return; if (activeClip.frameIds.length === 1) { pushUndo(); frameCanvases.current.get(activeFrameId)?.getContext('2d')!.clearRect(0, 0, WIDTH, HEIGHT); render(); return; } const next = activeClip.frameIds.filter((id) => id !== activeFrameId); frameCanvases.current.delete(activeFrameId); setClips((items) => items.map((clip) => clip.id === activeClip.id && clip.type === 'cel' ? { ...clip, frameIds: next, duration: celDuration(next.length, clip.exposure, clip.finalHold) } : clip)); const index = clamp(activeFrameIndex, 0, next.length - 1); setActiveFrameId(next[index]); setPlayhead(activeClip.start + index * activeClip.exposure); };
  const addVisualTrack = () => { const track: Track = { id: uid('track'), name: `Visual ${tracks.filter((item) => item.kind === 'visual').length + 1}`, kind: 'visual', visible: true, locked: false }; setTracks((items) => [track, ...items]); setActiveTrackId(track.id); setActiveClipId(''); };
  const addCelClip = () => { if (!selectedTrack || selectedTrack.kind !== 'visual' || selectedTrack.locked) return; const frameId = uid('frame'); const duration = 2; const start = findForwardSlot(clips, selectedTrack.id, playhead, duration); frameCanvases.current.set(frameId, makeCanvas()); const clip: CelClip = { id: uid('cel'), type: 'cel', trackId: selectedTrack.id, name: `Cel ${clips.filter((item) => item.type === 'cel').length + 1}`, start, duration, opacity: 100, exposure: 2, finalHold: 0, frameIds: [frameId] }; setClips((items) => [...items, clip]); setActiveClipId(clip.id); setActiveFrameId(frameId); setPlayhead(start); };
  const insertImageIntoActiveCel = (source: CanvasImageSource, sourceWidth: number, sourceHeight: number) => { if (activeClip?.type !== 'cel' || activeTrack?.locked) return false; const canvas = frameCanvases.current.get(activeFrameId); if (!canvas || sourceWidth <= 0 || sourceHeight <= 0) return false; const scale = Math.min(WIDTH / sourceWidth, HEIGHT / sourceHeight); const width = sourceWidth * scale; const height = sourceHeight * scale; pushUndo(); canvas.getContext('2d')!.drawImage(source, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height); setAssetMenuOpen(false); render(); return true; };
  const placeSharedPhoto = (asset: SharedPhotoAsset) => new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => { if (insertImageIntoActiveCel(image, image.naturalWidth, image.naturalHeight)) resolve(); else reject(new Error('Select an unlocked cel before inserting a photo.')); }; image.onerror = () => reject(new Error('The photo could not be decoded.')); image.src = asset.dataUrl; });
  const importStill = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file?.type.startsWith('image/')) return; try { const asset = await importSharedPhoto(file); await placeSharedPhoto(asset); } catch { /* Invalid image imports leave the selected cel unchanged. */ } };
  const importIllustration = (drawing: IllustrationSource) => { const image = getIllustrationImage(drawing.id); if (!image) return; const canvas = makeCanvas(); canvas.getContext('2d')!.putImageData(image, 0, 0); insertImageIntoActiveCel(canvas, WIDTH, HEIGHT); };
  const importAudio = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file?.type.startsWith('audio/')) return; const url = URL.createObjectURL(file); assetUrls.current.add(url); const audio = new Audio(url); const existingTrack = selectedTrack?.kind === 'audio' ? selectedTrack : tracks.find((track) => track.kind === 'audio'); const track: Track = existingTrack || { id: uid('track-audio'), name: 'Audio', kind: 'audio', visible: true, locked: false }; if (!existingTrack) setTracks((items) => [...items, track]); const id = uid('audio'); audioElements.current.set(id, audio); audio.onloadedmetadata = () => { const duration = Math.max(1, Math.ceil(audio.duration * fps)); const start = findForwardSlot(clips, track.id, playhead, duration); const clip: AudioClip = { id, type: 'audio', trackId: track.id, name: file.name.replace(/\.[^.]+$/, ''), start, duration, volume: 100, url }; setClips((items) => [...items, clip]); setActiveTrackId(track.id); setActiveClipId(id); setPlayhead(start); }; };
  const importVideo = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || (!/\.(mov|webm)$/i.test(file.name) && !['video/quicktime', 'video/webm'].includes(file.type))) return; const track = selectedTrack?.kind === 'visual' && !selectedTrack.locked ? selectedTrack : null; if (!track) { setMediaNotice({ tone: 'error', text: 'Select an unlocked visual track before importing a video.' }); return; } const url = URL.createObjectURL(file); assetUrls.current.add(url); const video = document.createElement('video'); const id = uid('video'); video.preload = 'auto'; video.playsInline = true; video.muted = true; video.src = url; videoElements.current.set(id, video); video.onloadedmetadata = () => { if (!Number.isFinite(video.duration) || video.duration <= 0) { setMediaNotice({ tone: 'error', text: 'This video has no readable duration.' }); return; } const duration = Math.max(1, Math.ceil(video.duration * fps)); const start = findForwardSlot(clips, track.id, playhead, duration); const clip: VideoClip = { id, type: 'video', trackId: track.id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Video', start, duration, opacity: 100, volume: 100, url, sourceOffset: 0 }; setClips((items) => [...items, clip]); setActiveTrackId(track.id); setActiveClipId(id); setPlayhead(start); setMediaNotice({ tone: 'success', text: `${file.name} was added to ${track.name}.` }); void seekVideo(video, 0).then(render); }; video.onerror = () => { videoElements.current.delete(id); assetUrls.current.delete(url); URL.revokeObjectURL(url); setMediaNotice({ tone: 'error', text: 'This browser could not decode that video. WebM works best; some MOV codecs are unsupported.' }); }; video.load(); };
  const duplicateClip = () => { if (!activeClip) return; const id = uid(activeClip.type); const start = findForwardSlot(clips, activeClip.trackId, activeClip.start + activeClip.duration, activeClip.duration, activeClip.id); let copy: Clip; if (activeClip.type === 'cel') { const frameIds = activeClip.frameIds.map((sourceId) => { const frameId = uid('frame'); const canvas = makeCanvas(); const source = frameCanvases.current.get(sourceId); if (source) canvas.getContext('2d')!.drawImage(source, 0, 0); frameCanvases.current.set(frameId, canvas); return frameId; }); copy = { ...activeClip, id, name: `${activeClip.name} copy`, start, frameIds }; } else if (activeClip.type === 'still') { const canvas = makeCanvas(); const source = stillCanvases.current.get(activeClip.id); if (source) canvas.getContext('2d')!.drawImage(source, 0, 0); stillCanvases.current.set(id, canvas); copy = { ...activeClip, id, name: `${activeClip.name} copy`, start }; } else if (activeClip.type === 'video') { const video = document.createElement('video'); video.preload = 'auto'; video.playsInline = true; video.muted = true; video.src = activeClip.url; videoElements.current.set(id, video); copy = { ...activeClip, id, name: `${activeClip.name} copy`, start }; } else { audioElements.current.set(id, new Audio(activeClip.url)); copy = { ...activeClip, id, name: `${activeClip.name} copy`, start }; } setClips((items) => [...items, copy]); setActiveClipId(id); setPlayhead(start); if (copy.type === 'cel') setActiveFrameId(copy.frameIds[0]); };
  const splitClip = () => { if (!activeClip || activeClip.type === 'audio' || playhead <= activeClip.start || playhead >= activeClip.start + activeClip.duration) return; const id = uid(activeClip.type); const leftDuration = playhead - activeClip.start; const rightDuration = activeClip.duration - leftDuration; if (activeClip.type === 'cel') { if (activeClip.frameIds.length < 2) return; const split = clamp(Math.ceil(leftDuration / activeClip.exposure), 1, activeClip.frameIds.length - 1); const leftFrames = activeClip.frameIds.slice(0, split); const rightFrames = activeClip.frameIds.slice(split); const splitAt = activeClip.start + leftFrames.length * activeClip.exposure; const left: CelClip = { ...activeClip, duration: celDuration(leftFrames.length, activeClip.exposure), finalHold: 0, frameIds: leftFrames }; const right: CelClip = { ...activeClip, id, name: `${activeClip.name} part 2`, start: splitAt, duration: celDuration(rightFrames.length, activeClip.exposure, activeClip.finalHold), frameIds: rightFrames }; setClips((items) => [...items.filter((clip) => clip.id !== activeClip.id), left, right]); setActiveClipId(id); setActiveFrameId(right.frameIds[0]); setPlayhead(splitAt); } else if (activeClip.type === 'video') { const video = document.createElement('video'); video.preload = 'auto'; video.playsInline = true; video.muted = true; video.src = activeClip.url; videoElements.current.set(id, video); const right: VideoClip = { ...activeClip, id, name: `${activeClip.name} part 2`, start: playhead, duration: rightDuration, sourceOffset: activeClip.sourceOffset + leftDuration / fps }; setClips((items) => [...items.map((clip) => clip.id === activeClip.id ? { ...activeClip, duration: leftDuration } : clip), right]); setActiveClipId(id); } else { const source = stillCanvases.current.get(activeClip.id); if (source) stillCanvases.current.set(id, source); const right: StillClip = { ...activeClip, id, name: `${activeClip.name} part 2`, start: playhead, duration: rightDuration }; setClips((items) => [...items.map((clip) => clip.id === activeClip.id ? { ...activeClip, duration: leftDuration } : clip), right]); setActiveClipId(id); } };
  const deleteClip = () => { if (!activeClip) return; if (activeClip.type === 'audio') { audioElements.current.get(activeClip.id)?.pause(); audioElements.current.delete(activeClip.id); } else if (activeClip.type === 'video') { videoElements.current.get(activeClip.id)?.pause(); videoElements.current.delete(activeClip.id); } setClips((items) => items.filter((clip) => clip.id !== activeClip.id)); const fallback = clips.find((clip) => clip.id !== activeClip.id) || null; setActiveClipId(fallback?.id || ''); if (fallback?.type === 'cel') setActiveFrameId(fallback.frameIds[0]); };
  const deleteTrack = () => { if (!selectedTrack) return; const removed = clips.filter((clip) => clip.trackId === selectedTrack.id); removed.forEach((clip) => { if (clip.type === 'cel') clip.frameIds.forEach((frameId) => { frameCanvases.current.delete(frameId); undoStacks.current.delete(frameId); redoStacks.current.delete(frameId); }); else if (clip.type === 'still') stillCanvases.current.delete(clip.id); else if (clip.type === 'video') { videoElements.current.get(clip.id)?.pause(); videoElements.current.delete(clip.id); } else { audioElements.current.get(clip.id)?.pause(); audioElements.current.delete(clip.id); } }); const nextTracks = tracks.filter((track) => track.id !== selectedTrack.id); const nextClips = clips.filter((clip) => clip.trackId !== selectedTrack.id); const fallbackTrack = nextTracks.find((track) => track.kind === 'visual') || nextTracks[0] || null; const fallbackClip = fallbackTrack ? nextClips.find((clip) => clip.trackId === fallbackTrack.id) || null : null; setTracks(nextTracks); setClips(nextClips); setActiveTrackId(fallbackTrack?.id || ''); setActiveClipId(fallbackClip?.id || ''); if (fallbackClip?.type === 'cel') setActiveFrameId(fallbackClip.frameIds[0]); };
  const moveTrack = (offset: -1 | 1) => setTracks((items) => { const index = items.findIndex((track) => track.id === activeTrackId); const destination = index + offset; if (index < 0 || destination < 0 || destination >= items.length) return items; const reordered = [...items]; [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]]; return reordered; });
  const updateActive = (patch: Partial<Clip>) => setClips((items) => items.map((clip) => clip.id === activeClipId ? { ...clip, ...patch } as Clip : clip));
  const updateClipDuration = (duration: number) => setClips((items) => pushFollowingClips(items.map((clip) => clip.id === activeClipId ? { ...clip, duration } : clip), activeClipId));
  const updateCelTiming = (patch: Partial<Pick<CelClip, 'exposure' | 'finalHold'>>) => setClips((items) => { const updated = items.map((clip) => { if (clip.id !== activeClipId || clip.type !== 'cel') return clip; const exposure = patch.exposure ?? clip.exposure; const finalHold = patch.finalHold ?? clip.finalHold; return { ...clip, ...patch, exposure, finalHold, duration: celDuration(clip.frameIds.length, exposure, finalHold) }; }); return pushFollowingClips(updated, activeClipId); });
  const toggleTrack = (id: string, field: 'visible' | 'locked') => setTracks((items) => items.map((track) => track.id === id ? { ...track, [field]: !track[field] } : track));
  const beginDrag = (event: React.PointerEvent<HTMLElement>, clip: Clip, mode: ClipDrag['mode']) => { if (tracks.find((track) => track.id === clip.trackId)?.locked) return; event.stopPropagation(); const host = event.currentTarget.closest('button'); host?.setPointerCapture(event.pointerId); drag.current = { id: clip.id, mode, clientX: event.clientX, start: clip.start, duration: clip.duration, sourceOffset: clip.type === 'video' ? clip.sourceOffset : 0 }; selectClip(clip); };
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => { const current = drag.current; if (!current) return; const delta = Math.round((event.clientX - current.clientX) / PX); setClips((items) => items.map((clip) => { if (clip.id !== current.id) return clip; const blockers = trackBlockers(items, clip.trackId, clip.id); if (current.mode === 'move') { const preferred = Math.max(0, current.start + delta); const start = delta < 0 ? findBackwardSlot(items, clip.trackId, preferred, clip.duration, clip.id) : findForwardSlot(items, clip.trackId, preferred, clip.duration, clip.id); return { ...clip, start }; } if (current.mode === 'start') { const fixedEnd = current.start + current.duration; const previousEnd = Math.max(0, ...blockers.filter((other) => other.start < current.start).map((other) => other.start + other.duration)); const start = clamp(Math.max(previousEnd, current.start + delta), 0, fixedEnd - 1); const resized = { ...clip, start, duration: fixedEnd - start }; return clip.type === 'video' ? { ...resized, sourceOffset: Math.max(0, current.sourceOffset + (start - current.start) / fps) } : resized; } const nextStart = Math.min(...blockers.filter((other) => other.start >= current.start + current.duration).map((other) => other.start), Number.POSITIVE_INFINITY); return { ...clip, duration: Math.max(1, Math.min(current.duration + delta, nextStart - current.start)) }; })); };
  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const beginFrameEditorResize = (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); frameEditorResize.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: frameEditorHeight }; };
  const resizeFrameEditor = (event: React.PointerEvent<HTMLButtonElement>) => { const current = frameEditorResize.current; if (!current || current.pointerId !== event.pointerId) return; const nextHeight = current.startHeight + current.startY - event.clientY; setFrameEditorHeight(clamp(nextHeight, FRAME_EDITOR_MIN_HEIGHT, getMaxFrameEditorHeight())); };
  const endFrameEditorResize = (event: React.PointerEvent<HTMLButtonElement>) => { if (frameEditorResize.current?.pointerId !== event.pointerId) return; frameEditorResize.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  const resizeFrameEditorWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => { if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return; event.preventDefault(); const delta = event.key === 'ArrowUp' ? 18 : -18; setFrameEditorHeight((height) => clamp(height + delta, FRAME_EDITOR_MIN_HEIGHT, getMaxFrameEditorHeight())); };
  const toggleTimeline = () => { if (frameEditorHeight < FRAME_EDITOR_ONE_TRACK_HEIGHT) { setFrameEditorHeight(Math.min(FRAME_EDITOR_DEFAULT_HEIGHT, getMaxFrameEditorHeight())); setTimelineManuallyCollapsed(false); return; } setTimelineManuallyCollapsed((collapsed) => !collapsed); };
  const setPlayheadFromLane = (event: React.PointerEvent<HTMLDivElement>, trackId: string) => { if (event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); setPlaying(false); setActiveTrackId(trackId); setActiveClipId(''); setPlayhead(clamp(Math.floor((event.clientX - rect.left) / PX), 0, timelineFrames - 1)); };
  const useIllustration = () => { if (activeClip?.type !== 'cel') return; const image = getIllustrationImage(); const canvas = frameCanvases.current.get(activeFrameId); if (!image || !canvas) return; pushUndo(); canvas.getContext('2d')!.putImageData(image, 0, 0); render(); };
  const saveFrame = () => { const canvas = makeCanvas(); drawAt(canvas.getContext('2d')!, playhead); canvas.toBlob((blob) => { if (blob) download(blob, `${safeName(documentName)}-frame-${playhead + 1}.png`); }, 'image/png'); };
  const exportAnimation = async () => {
    if (exporting) return;
    setExporting(true);
    setPlaying(false);
    audioElements.current.forEach((audio) => audio.pause());
    videoElements.current.forEach((video) => video.pause());

    let audioContext: AudioContext | null = null;
    let mediaStream: MediaStream | null = null;
    const scheduledSources: AudioBufferSourceNode[] = [];

    try {
      const canvas = makeCanvas();
      const context = canvas.getContext('2d')!;
      drawAt(context, 0);

      if (!('MediaRecorder' in window) || typeof canvas.captureStream !== 'function') {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) download(blob, `${safeName(documentName)}-frame.png`);
        return;
      }

      const audibleClips = clips.filter((clip): clip is AudioClip | VideoClip => {
        const track = tracks.find((item) => item.id === clip.trackId);
        return (clip.type === 'audio' || clip.type === 'video') && Boolean(track?.visible) && clip.volume > 0;
      });
      const exportVideos = clips.flatMap((clip) => { if (clip.type !== 'video' || !tracks.find((track) => track.id === clip.trackId)?.visible || clip.opacity <= 0) return []; const video = videoElements.current.get(clip.id); return video ? [{ clip, video }] : []; });
      await Promise.all(exportVideos.map(async ({ clip, video }) => { video.pause(); video.muted = true; await seekVideo(video, clip.sourceOffset); }));
      const canvasStream = canvas.captureStream(0);
      const canvasTrack = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const streamTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
      let audioStartAt = 0;

      if (audibleClips.length) {
        audioContext = new AudioContext();
        await audioContext.resume();
        const destination = audioContext.createMediaStreamDestination();
        const decodedClips: { clip: AudioClip | VideoClip; buffer: AudioBuffer }[] = [];

        for (const clip of audibleClips) {
          try {
            const response = await fetch(clip.url);
            if (!response.ok) continue;
            const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
            decodedClips.push({ clip, buffer });
          } catch {
            // A bad audio asset should not prevent the visual timeline from exporting.
          }
        }

        audioStartAt = audioContext.currentTime + 0.1;
        decodedClips.forEach(({ clip, buffer }) => {
          const source = audioContext!.createBufferSource();
          const gain = audioContext!.createGain();
          const offset = clip.type === 'video' ? clip.sourceOffset : 0;
          const duration = Math.max(0, Math.min(buffer.duration - offset, clip.duration / fps));
          if (!duration) return;
          source.buffer = buffer;
          gain.gain.value = clip.volume / 100;
          source.connect(gain).connect(destination);
          source.start(audioStartAt + clip.start / fps, offset, duration);
          scheduledSources.push(source);
        });
        streamTracks.push(...destination.stream.getAudioTracks());
      }

      mediaStream = new MediaStream(streamTracks);
      const mime = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
      const recorder = new MediaRecorder(mediaStream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 5_000_000,
        audioBitsPerSecond: 192_000,
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      recorder.start();
      if (audioContext && audioStartAt > audioContext.currentTime) {
        await new Promise((resolve) => window.setTimeout(resolve, (audioStartAt - audioContext!.currentTime) * 1000));
      }
      const exportStartedAt = performance.now();
      for (let frame = 0; frame < timelineFrames; frame += 1) {
        drawAt(context, frame);
        canvasTrack.requestFrame();
        await Promise.all(exportVideos.filter(({ clip }) => clip.start === frame).map(async ({ video }) => { try { await video.play(); } catch { /* Unsupported video playback leaves this clip transparent. */ } }));
        const nextFrameAt = exportStartedAt + (frame + 1) * 1000 / fps;
        const delay = Math.max(0, nextFrameAt - performance.now());
        await new Promise((resolve) => window.setTimeout(resolve, delay));
        exportVideos.filter(({ clip }) => clip.start + clip.duration <= frame + 1).forEach(({ video }) => video.pause());
      }
      recorder.stop();
      await stopped;
      download(new Blob(chunks, { type: mime || 'video/webm' }), `${safeName(documentName)}.webm`);
    } finally {
      scheduledSources.forEach((source) => { try { source.stop(); } catch {} });
      videoElements.current.forEach((video) => video.pause());
      mediaStream?.getTracks().forEach((track) => track.stop());
      if (audioContext) await audioContext.close();
      setExporting(false);
    }
  };
  const exportWorkspace = async () => {
    if (exporting) return;
    exportProject();
    await exportAnimation();
  };
  useImperativeHandle(ref, () => ({ exportWorkspace }));

  useEffect(() => { if (initialized.current) return; initialized.current = true; frameCanvases.current.set('animation-frame-1', makeCanvas()); }, []);
  useEffect(() => { const fitFrameEditor = () => setFrameEditorHeight((height) => clamp(height, FRAME_EDITOR_MIN_HEIGHT, getMaxFrameEditorHeight())); fitFrameEditor(); window.addEventListener('resize', fitFrameEditor); return () => window.removeEventListener('resize', fitFrameEditor); }, []);
  useEffect(() => { const closeAssetMenu = (event: PointerEvent) => { if (assetMenuRef.current && !assetMenuRef.current.contains(event.target as Node)) setAssetMenuOpen(false); }; document.addEventListener('pointerdown', closeAssetMenu); return () => document.removeEventListener('pointerdown', closeAssetMenu); }, []);
  useEffect(() => { if (activeClip?.type !== 'cel' || activeTrack?.locked) setAssetMenuOpen(false); }, [activeClip?.type, activeTrack?.locked]);
  useEffect(() => { requestAnimationFrame(render); }, [render]);
  useEffect(() => { playheadRef.current = playhead; }, [playhead]);
  useEffect(() => { if (!playing) { if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current); playbackFrame.current = null; return; } playbackOrigin.current = { time: performance.now(), frame: playheadRef.current }; const loop = (time: number) => { const elapsed = Math.floor((time - playbackOrigin.current.time) / 1000 * fps); setPlayhead((playbackOrigin.current.frame + elapsed) % timelineFrames); playbackFrame.current = requestAnimationFrame(loop); }; playbackFrame.current = requestAnimationFrame(loop); return () => { if (playbackFrame.current !== null) cancelAnimationFrame(playbackFrame.current); playbackFrame.current = null; }; }, [fps, playing, timelineFrames]);
  useEffect(() => { videoElements.current.forEach((video, id) => { const clip = clips.find((item) => item.id === id); const track = clip && tracks.find((item) => item.id === clip.trackId); if (!clip || clip.type !== 'video' || !track?.visible || playhead < clip.start || playhead >= clip.start + clip.duration) { video.pause(); return; } const target = clip.sourceOffset + (playhead - clip.start) / fps; video.volume = clip.volume / 100; if (!playing) { video.pause(); video.muted = true; void seekVideo(video, target).then(render); return; } video.muted = false; if (Math.abs(video.currentTime - target) > .3) video.currentTime = target; if (video.paused) void video.play().catch(() => undefined); }); }, [clips, fps, playhead, playing, render, tracks]);
  useEffect(() => { audioElements.current.forEach((audio, id) => { const clip = clips.find((item) => item.id === id); const track = clip && tracks.find((item) => item.id === clip.trackId); if (!playing || !clip || clip.type !== 'audio' || !track?.visible || playhead < clip.start || playhead >= clip.start + clip.duration) { audio.pause(); return; } audio.volume = clip.volume / 100; if (audio.paused) { audio.currentTime = (playhead - clip.start) / fps; void audio.play().catch(() => undefined); } }); }, [clips, fps, playhead, playing, tracks]);
  useEffect(() => { if (!active) return; const keydown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); } else if ((event.metaKey || event.ctrlKey) && (event.key === '+' || event.key === '=')) { event.preventDefault(); zoomAt(zoomRef.current * 1.15); } else if ((event.metaKey || event.ctrlKey) && event.key === '-') { event.preventDefault(); zoomAt(zoomRef.current / 1.15); } else if ((event.metaKey || event.ctrlKey) && event.key === '0') { event.preventDefault(); zoomAt(82); } else if (event.key.toLowerCase() === 'h' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { setTool('pan'); } else if (event.key === ' ') { event.preventDefault(); setPlaying((value) => !value); } else if (event.key === 'ArrowLeft') { event.preventDefault(); setPlaying(false); setPlayhead((value) => Math.max(0, value - 1)); } else if (event.key === 'ArrowRight') { event.preventDefault(); setPlaying(false); setPlayhead((value) => Math.min(timelineFrames - 1, value + 1)); } }; window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown); });
  useEffect(() => () => { audioElements.current.forEach((audio) => audio.pause()); videoElements.current.forEach((video) => video.pause()); assetUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  return <main className={`animator-shell ${active ? '' : 'mode-hidden'}`} aria-hidden={!active}>
    <header className="topbar animator-topbar"><div className="animator-brand"><div className="brand-mark"><Sparkles size={15} /></div><strong>DUET</strong><span>ANIMATOR</span></div><div className="header-center"><div className="mode-switch" aria-label="Workspace mode"><button onClick={() => { setPlaying(false); onModeChange('illustration'); }}>Illustrate</button><button className="active">Animate</button></div><span className="header-document-name" aria-hidden="true" /></div><div className="header-actions"><Button variant="ghost" size="sm" className="header-save-button" onClick={saveFrame} aria-label="Save animation frame" title="Save frame"><Download /><span className="header-action-full">Save frame</span><span className="header-action-short">Save</span></Button><Button variant="ghost" size="sm" className="header-export-button" onClick={() => void exportAnimation()} disabled={exporting} aria-label="Export animation as WebM" title="Export WebM"><Download /><span className="header-action-full">{exporting ? 'Rendering…' : 'Export WebM'}</span><span className="header-action-short">{exporting ? 'Rendering…' : 'Export'}</span></Button><Button size="sm" className="export-button export-workspace-button" onClick={() => void exportWorkspace()} disabled={exporting} title="Download the animation and editable DUET project" aria-label="Export workspace"><Download /><span className="header-action-full">Export workspace</span><span className="header-action-short">Workspace</span></Button></div></header>
    <section className="animator-workspace"><aside className="animation-tool-rail" aria-label="Animation drawing tools">{animationToolMeta.map(({ id, label, icon: Icon }) => <button key={id} className={tool === id ? 'active' : ''} onClick={() => { setTool(id); setTextDraft(null); setEyedropperPreview(null); }} aria-label={`Animation ${label.toLowerCase()}`} title={label}><Icon /></button>)}<span className="animation-rail-divider" /><label className="animation-color" title="Brush colour" aria-label="Brush colour"><input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} /><span style={{ background: brushColor }} /></label><div ref={assetMenuRef} className="animation-asset-control"><button className={assetMenuOpen ? 'active' : ''} onClick={() => setAssetMenuOpen((open) => !open)} aria-label="Open shared image library" title={activeClip?.type === 'cel' && !activeTrack?.locked ? 'Insert a photo or illustration into this cel' : 'Select an unlocked cel first'} disabled={activeClip?.type !== 'cel' || activeTrack?.locked}><ImagePlus /></button>{assetMenuOpen && <div className="animation-asset-menu"><div className="import-menu-heading"><strong>Images</strong><span>Insert into selected cel</span></div><button className="import-action" onClick={() => imageInputRef.current?.click()}><ImagePlus />Upload and insert photo</button>{photoLibrary.length ? <div className="photo-library">{photoLibrary.map((photo) => <button key={photo.id} title={`Insert ${photo.name} into the selected cel`} onClick={() => void placeSharedPhoto(photo)}><span className="animation-asset-thumb" style={{ backgroundImage: `url(${photo.dataUrl})` }} /><span>{photo.name}</span></button>)}</div> : <p className="photo-library-empty">Photos imported in Illustrate will appear here too.</p>}<div className="import-menu-divider" /><div className="import-menu-heading compact"><strong>Illustrations</strong><span>Flattened into selected cel</span></div><div className="illustration-library">{illustrations.map((drawing) => <button key={drawing.id} onClick={() => importIllustration(drawing)}><span><Sparkles />{drawing.name}</span><small>960 × 640</small></button>)}</div></div>}</div></aside>
      <div className="animation-main hybrid" style={{ gridTemplateRows: `40px minmax(160px, 1fr) ${bottomDrawerCollapsed ? 22 : frameEditorHeight}px` }}><div className="animation-context-bar"><strong>{tool === 'pan' ? 'Hand' : tool[0].toUpperCase() + tool.slice(1)}</strong>{(['brush', 'eraser', 'smudge', 'blur'] as AnimationTool[]).includes(tool) && <><span>Size</span><Slider min={tool === 'smudge' || tool === 'blur' ? 8 : 2} max={tool === 'smudge' || tool === 'blur' ? 160 : 96} value={[tool === 'smudge' || tool === 'blur' ? Math.max(8, brushSize) : brushSize]} onValueChange={(value) => setBrushSize(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><code>{tool === 'smudge' || tool === 'blur' ? Math.max(8, brushSize) : brushSize}px</code></>}{tool === 'brush' && <><span>Opacity</span><Slider min={1} max={100} value={[brushOpacity]} onValueChange={(value) => setBrushOpacity(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><code>{brushOpacity}%</code></>}{(tool === 'smudge' || tool === 'blur') && <><span>Strength</span><Slider min={1} max={100} value={[effectStrength]} onValueChange={(value) => setEffectStrength(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><code>{effectStrength}%</code></>}{tool === 'text' && <><span>Font</span><select value={textFont} onChange={(event) => setTextFont(event.target.value as TextFont)}>{textFonts.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select><span>Size</span><Slider min={10} max={180} value={[textSize]} onValueChange={(value) => setTextSize(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><code>{textSize}px</code><em>Click the cel, type, then click away</em></>}{tool === 'eyedropper' && <em>Press and drag over the canvas · release to choose</em>}{tool === 'pan' && <em>Drag the canvas to move around</em>}<span className="animation-context-spacer" /><Button variant="ghost" size="icon-sm" onClick={undo} aria-label="Undo frame stroke"><Undo2 /></Button><Button variant="ghost" size="icon-sm" onClick={redo} aria-label="Redo frame stroke"><Redo2 /></Button></div>
        <div ref={stageViewportRef} className="animation-stage"><div ref={canvasStageRef} className="animation-canvas-stage" style={{ width: `${zoom}%` }}><div className="animation-canvas-wrap"><canvas ref={displayRef} width={WIDTH} height={HEIGHT} className={`animation-canvas tool-${tool} ${playing || activeClip?.type !== 'cel' ? 'playing' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />{textDraft && <textarea ref={textEntryRef} className="text-entry" aria-label="Text to add to this animation cel" placeholder="Type here…" spellCheck value={textDraft.value} style={{ left: `${textDraft.x / WIDTH * 100}%`, top: `${textDraft.y / HEIGHT * 100}%`, color: brushColor, fontFamily: (textFonts.find((font) => font.id === textFont) || textFonts[0]).family, fontSize: `${textSize / WIDTH * 100}cqw` }} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })} onBlur={() => commitText(true)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); commitText(false); } if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />}{eyedropperPreview && <div className="eyedropper-preview" style={{ left: `${eyedropperPreview.x / WIDTH * 100}%`, top: `${eyedropperPreview.y / HEIGHT * 100}%` }}><span className="eyedropper-colour" style={{ background: eyedropperPreview.color }}><Pipette size={15} /></span></div>}</div></div><div className="frame-counter">{Math.floor(playhead / fps)}:{String(playhead % fps).padStart(2, '0')} · frame {playhead + 1}</div></div>
        <div className={`animation-bottom-drawer ${bottomDrawerCollapsed ? 'collapsed' : ''}`}>{bottomDrawerCollapsed ? <button className="drawer-expand-button" onClick={() => setBottomDrawerCollapsed(false)} aria-label="Expand playback and frame editor"><ChevronUp />Show playback and frames</button> : <><button type="button" className="frame-editor-resizer" aria-label="Resize playback and frame editor. Drag or use the arrow keys." title="Drag to resize · Double-click to reset" onPointerDown={beginFrameEditorResize} onPointerMove={resizeFrameEditor} onPointerUp={endFrameEditorResize} onPointerCancel={endFrameEditorResize} onKeyDown={resizeFrameEditorWithKeyboard} onDoubleClick={() => setFrameEditorHeight(Math.min(FRAME_EDITOR_DEFAULT_HEIGHT, getMaxFrameEditorHeight()))}><GripHorizontal /></button><div className="playback-bar"><button className="drawer-collapse-button" onClick={() => { setPlaying(false); setBottomDrawerCollapsed(true); }} aria-label="Collapse playback and frame editor"><ChevronDown /></button><button onClick={() => { setPlaying(false); setPlayhead(0); }} aria-label="Timeline start"><SkipBack /></button><button onClick={() => { setPlaying(false); setPlayhead((value) => Math.max(0, value - 1)); }} aria-label="Previous timeline frame"><ChevronLeft /></button><button className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause /> : <Play />}</button><button onClick={() => { setPlaying(false); setPlayhead((value) => Math.min(timelineFrames - 1, value + 1)); }} aria-label="Next timeline frame"><ChevronRight /></button><button onClick={() => { setPlaying(false); setPlayhead(timelineFrames - 1); }} aria-label="Timeline end"><SkipForward /></button><span className="playback-separator" /><label>FPS <input type="number" min={1} max={24} value={fps} onChange={(event) => setFps(clamp(Number(event.target.value) || 1, 1, 24))} /></label><button className={onionSkin ? 'active' : ''} onClick={() => setOnionSkin((value) => !value)}><Ghost />Onion skin</button></div>
        <div className={`hybrid-timeline ${timelineCollapsed ? 'timeline-collapsed' : ''}`}>
          <div className="flipbook-strip"><div className="flipbook-heading"><span><Brush /><strong>{activeClip?.type === 'cel' ? activeClip.name : 'Select a cel clip'}</strong></span>{activeClip?.type === 'cel' && <span><button onClick={() => selectOffset(-1)} disabled={activeFrameIndex === 0}><ChevronLeft /></button><button onClick={() => addFrame(true)}><Copy />Duplicate cel</button><button onClick={deleteFrame}><Trash2 /></button><button onClick={() => addFrame(false)}><Plus />New cel</button></span>}</div>{activeClip?.type === 'cel' ? <div className="cel-track">{activeClip.frameIds.map((frameId, index) => <button key={frameId} className={frameId === activeFrameId ? 'active' : ''} onClick={() => selectFrame(frameId, index)}><canvas ref={(node) => { if (node) thumbnailRefs.current.set(frameId, node); else thumbnailRefs.current.delete(frameId); }} width={96} height={64} /><span>{index + 1}</span></button>)}</div> : <p>Select a cel clip below to draw its individual frames.</p>}</div>
          <div className={`sequence-timeline ${timelineCollapsed ? 'collapsed' : ''}`}><div className="sequence-toolbar"><span><button className="timeline-collapse-button" onClick={toggleTimeline} aria-label={timelineCollapsed ? 'Expand timeline' : 'Collapse timeline'} aria-expanded={!timelineCollapsed}>{timelineCollapsed ? <ChevronUp /> : <ChevronDown />}</button><Film /><strong>Timeline</strong><small>{(timelineFrames / fps).toFixed(1)}s</small></span><span><button onClick={addVisualTrack} title="Add visual track"><Plus />Track</button><button onClick={deleteTrack} disabled={!selectedTrack} title="Delete selected track"><Trash2 />Track</button><button onClick={() => moveTrack(-1)} disabled={selectedTrackIndex <= 0} title="Move selected track up" aria-label="Move selected track up"><ChevronUp /></button><button onClick={() => moveTrack(1)} disabled={selectedTrackIndex < 0 || selectedTrackIndex >= tracks.length - 1} title="Move selected track down" aria-label="Move selected track down"><ChevronDown /></button><button onClick={addCelClip} disabled={!selectedTrack || selectedTrack.kind !== 'visual' || selectedTrack.locked} title={!selectedTrack ? 'Select a visual track first' : selectedTrack.kind !== 'visual' ? 'Cel clips need a visual track' : selectedTrack.locked ? 'Unlock this track to add a cel clip' : `Add cel clip to ${selectedTrack.name}`}><Plus />Cel clip</button><button onClick={() => videoInputRef.current?.click()} disabled={!selectedTrack || selectedTrack.kind !== 'visual' || selectedTrack.locked} title={!selectedTrack ? 'Select a visual track first' : selectedTrack.kind !== 'visual' ? 'Videos need a visual track' : selectedTrack.locked ? 'Unlock this track to import video' : `Import MOV or WebM to ${selectedTrack.name}`}><Video />Video</button><button onClick={() => audioInputRef.current?.click()}><Music2 />Audio</button><button onClick={splitClip} disabled={!activeClip || activeClip.type === 'audio' || (activeClip.type === 'cel' && activeClip.frameIds.length < 2)}><Scissors />Split</button><button onClick={duplicateClip} disabled={!activeClip}><Copy /></button><button onClick={deleteClip} disabled={!activeClip} title="Delete selected clip"><Trash2 /></button></span></div><div className="sequence-scroll"><div className="sequence-grid" style={{ width: timelineFrames * PX + 132 }}><div className="time-ruler" style={{ marginLeft: 132, width: timelineFrames * PX }}>{seconds.map((second) => <span key={second} style={{ left: second * fps * PX }}>{second}s</span>)}</div>{tracks.map((track) => <div className={`track-row ${track.id === activeTrackId ? 'active' : ''}`} key={track.id}><div className="track-label"><button onClick={() => toggleTrack(track.id, 'visible')} aria-label={track.visible ? `Hide ${track.name}` : `Show ${track.name}`}>{track.visible ? <Eye /> : <EyeOff />}</button><button onClick={() => toggleTrack(track.id, 'locked')} aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}>{track.locked ? <Lock /> : <Unlock />}</button><button className="track-name" onClick={() => selectTrack(track.id)} aria-pressed={track.id === activeTrackId} title={`Select ${track.name} track`}>{track.kind === 'audio' ? <Music2 /> : <Film />}<span>{track.name}</span></button></div><div className="track-lane" style={{ width: timelineFrames * PX }} onPointerDown={(event) => setPlayheadFromLane(event, track.id)}>{clips.filter((clip) => clip.trackId === track.id).map((clip) => <button key={clip.id} className={`sequence-clip ${clip.type} ${clip.id === activeClipId ? 'active' : ''}`} style={{ left: clip.start * PX, width: Math.max(clip.duration * PX, 20) }} onPointerDown={(event) => beginDrag(event, clip, 'move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title={clip.type === 'cel' ? `${clip.frameIds.length} cels · length follows cel timing` : clip.type === 'video' ? `${clip.name} · MOV/WebM video` : undefined}>{clip.type !== 'cel' && <i className="clip-handle start" onPointerDown={(event) => beginDrag(event, clip, 'start')} />}<span>{clip.type === 'audio' ? <Music2 /> : clip.type === 'video' ? <Video /> : clip.type === 'cel' ? <Brush /> : <ImagePlus />}{clip.name}</span>{clip.type === 'audio' && <b className="audio-wave">▂▅▃▇▄▆▂▅▃▆▂▇</b>}{clip.type !== 'cel' && <i className="clip-handle end" onPointerDown={(event) => beginDrag(event, clip, 'end')} />}</button>)}</div></div>)}<i className="timeline-playhead" style={{ left: 132 + playhead * PX }} /></div></div></div>
        </div></>}</div>
      </div>
      <aside className="animation-panel"><div className="animation-panel-heading"><Film /><div><strong>Hybrid timeline</strong><span>{documentName}</span></div></div><p>Arrange cels, video, and audio in tracks. Higher tracks draw on top. Clips on one track snap apart instead of overlapping. Photos and illustrations are inserted into the selected cel.</p>{mediaNotice && <div className={`animation-media-notice ${mediaNotice.tone}`} role="status">{mediaNotice.text}</div>}{activeClip?.type === 'cel' && <button className="illustration-frame-button" onClick={useIllustration}><ImagePlus />Use illustration as cel</button>}<div className="animation-stat"><span>Playhead</span><strong>{(playhead / fps).toFixed(2)}s</strong></div><div className="animation-stat"><span>Track</span><strong>{selectedTrack?.name || 'None'}</strong></div><div className="animation-stat"><span>Clip</span><strong>{activeClip?.name || 'None'}</strong></div>{activeClip && activeClip.type !== 'audio' && <label className="clip-property"><span>Opacity</span><Slider min={0} max={100} value={[activeClip.opacity]} onValueChange={(value) => updateActive({ opacity: Math.round(Array.isArray(value) ? value[0] : Number(value)) })} /><strong>{activeClip.opacity}%</strong></label>}{activeClip?.type === 'still' && <label className="clip-property"><span>Duration</span><input type="number" min={1} value={activeClip.duration} onChange={(event) => updateClipDuration(Math.max(1, Number(event.target.value) || 1))} /><strong>frames</strong></label>}{activeClip?.type === 'cel' && <><div className="clip-property calculated explained"><span>Length on track</span><output>{activeClip.frameIds.length} cels × {activeClip.exposure} + {activeClip.finalHold}</output><strong>{activeClip.duration} fr</strong></div><p className="cel-setting-help">Total frames this cel clip occupies on its track.</p><label className="clip-property explained" aria-describedby="cel-hold-help"><span>Cel hold</span><input type="number" min={1} max={12} value={activeClip.exposure} onChange={(event) => updateCelTiming({ exposure: clamp(Number(event.target.value) || 1, 1, 12) })} /><strong>fr/cel</strong></label><p id="cel-hold-help" className="cel-setting-help">Frames each cel remains visible before the next cel.</p><label className="clip-property explained" aria-describedby="end-hold-help"><span>End hold</span><input type="number" min={0} max={240} value={activeClip.finalHold} onChange={(event) => updateCelTiming({ finalHold: clamp(Number(event.target.value) || 0, 0, 240) })} /><strong>fr</strong></label><p id="end-hold-help" className="cel-setting-help">Extra frames the final cel remains visible before this clip ends.</p></>}{(activeClip?.type === 'audio' || activeClip?.type === 'video') && <label className="clip-property"><span>Volume</span><Slider min={0} max={100} value={[activeClip.volume]} onValueChange={(value) => updateActive({ volume: Math.round(Array.isArray(value) ? value[0] : Number(value)) })} /><strong>{activeClip.volume}%</strong></label>}<div className="animation-shortcuts"><strong>Shortcuts</strong><span>Space · Play / pause</span><span>← → · Move playhead</span><span>⌘Z · Undo cel stroke</span></div></aside>
      <input ref={imageInputRef} className="hidden" type="file" accept="image/*" onChange={importStill} /><input ref={videoInputRef} className="hidden" type="file" accept=".mov,.webm,video/quicktime,video/webm" onChange={importVideo} /><input ref={audioInputRef} className="hidden" type="file" accept="audio/*" onChange={importAudio} />
    </section>
  </main>;
});
