'use client';

import {
  Brush, ChevronLeft, ChevronRight, Copy, Download, Eraser, Film, Ghost,
  ImagePlus, Pause, Play, Plus, Redo2, SkipBack, SkipForward, Sparkles,
  Trash2, Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const WIDTH = 960;
const HEIGHT = 640;
type AnimationTool = 'brush' | 'eraser';
type AnimationFrame = { id: string; name: string };
type AnimationStudioProps = {
  active: boolean;
  documentName: string;
  onModeChange: (mode: 'illustration' | 'animation') => void;
  getIllustrationImage: () => ImageData | null;
};

function makeFrameCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

function safeFileName(name: string) {
  return name.trim().replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').slice(0, 80) || 'Untitled animation';
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function AnimationStudio({ active, documentName, onModeChange, getIllustrationImage }: AnimationStudioProps) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const frameCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const thumbnailRefs = useRef(new Map<string, HTMLCanvasElement>());
  const undoStacks = useRef(new Map<string, ImageData[]>());
  const redoStacks = useRef(new Map<string, ImageData[]>());
  const drawing = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const initialized = useRef(false);
  const [frames, setFrames] = useState<AnimationFrame[]>([{ id: 'animation-frame-1', name: 'Frame 1' }]);
  const [activeFrameId, setActiveFrameId] = useState('animation-frame-1');
  const [tool, setTool] = useState<AnimationTool>('brush');
  const [brushSize, setBrushSize] = useState(18);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [brushColor, setBrushColor] = useState('#ff6b5f');
  const [onionSkin, setOnionSkin] = useState(true);
  const [fps, setFps] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeIndex = Math.max(0, frames.findIndex((frame) => frame.id === activeFrameId));

  const renderFrame = useCallback((frameId = activeFrameId, includeOnion = onionSkin && !playing) => {
    const display = displayRef.current;
    if (!display) return;
    const ctx = display.getContext('2d')!;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const index = frames.findIndex((frame) => frame.id === frameId);
    if (includeOnion && index > 0) {
      const previous = frameCanvases.current.get(frames[index - 1].id);
      if (previous) {
        ctx.save();
        ctx.globalAlpha = .2;
        ctx.drawImage(previous, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#da6ef5';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
      }
    }
    const current = frameCanvases.current.get(frameId);
    if (current) ctx.drawImage(current, 0, 0);
    frames.forEach((frame) => {
      const thumbnail = thumbnailRefs.current.get(frame.id);
      const source = frameCanvases.current.get(frame.id);
      if (!thumbnail || !source) return;
      const thumbCtx = thumbnail.getContext('2d')!;
      thumbCtx.clearRect(0, 0, thumbnail.width, thumbnail.height);
      thumbCtx.drawImage(source, 0, 0, WIDTH, HEIGHT, 0, 0, thumbnail.width, thumbnail.height);
    });
  }, [activeFrameId, frames, onionSkin, playing]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    frameCanvases.current.set('animation-frame-1', makeFrameCanvas());
  }, []);
  useEffect(() => { requestAnimationFrame(() => renderFrame()); }, [renderFrame]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveFrameId((current) => {
        const index = frames.findIndex((frame) => frame.id === current);
        return frames[(index + 1) % frames.length].id;
      });
    }, 1000 / fps);
    return () => window.clearInterval(timer);
  }, [fps, frames, playing]);
  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height };
  };
  const pushUndo = () => {
    const canvas = frameCanvases.current.get(activeFrameId);
    if (!canvas) return;
    const stack = undoStacks.current.get(activeFrameId) || [];
    stack.push(canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT));
    undoStacks.current.set(activeFrameId, stack.slice(-30));
    redoStacks.current.set(activeFrameId, []);
  };
  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = frameCanvases.current.get(activeFrameId)?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = tool === 'brush' ? brushOpacity / 100 : 1;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = brushColor;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + .01, to.y + .01);
    ctx.stroke();
    ctx.restore();
    renderFrame();
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (playing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = pointFromEvent(event);
    pushUndo();
    drawLine(lastPoint.current, lastPoint.current);
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const point = pointFromEvent(event);
    drawLine(lastPoint.current, point);
    lastPoint.current = point;
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    renderFrame();
  };

  const undo = () => {
    const canvas = frameCanvases.current.get(activeFrameId);
    const stack = undoStacks.current.get(activeFrameId) || [];
    const previous = stack.pop();
    if (!canvas || !previous) return;
    const ctx = canvas.getContext('2d')!;
    const redoStack = redoStacks.current.get(activeFrameId) || [];
    redoStack.push(ctx.getImageData(0, 0, WIDTH, HEIGHT));
    redoStacks.current.set(activeFrameId, redoStack.slice(-30));
    ctx.putImageData(previous, 0, 0);
    renderFrame();
  };
  const redo = () => {
    const canvas = frameCanvases.current.get(activeFrameId);
    const stack = redoStacks.current.get(activeFrameId) || [];
    const next = stack.pop();
    if (!canvas || !next) return;
    const ctx = canvas.getContext('2d')!;
    const undoStack = undoStacks.current.get(activeFrameId) || [];
    undoStack.push(ctx.getImageData(0, 0, WIDTH, HEIGHT));
    undoStacks.current.set(activeFrameId, undoStack.slice(-30));
    ctx.putImageData(next, 0, 0);
    renderFrame();
  };
  const selectOffset = (offset: number) => {
    setActiveFrameId(frames[Math.max(0, Math.min(frames.length - 1, activeIndex + offset))].id);
  };
  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        selectOffset(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        selectOffset(1);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  const addFrame = (duplicate = false) => {
    const id = `animation-frame-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const canvas = makeFrameCanvas();
    if (duplicate) {
      const source = frameCanvases.current.get(activeFrameId);
      if (source) canvas.getContext('2d')!.drawImage(source, 0, 0);
    }
    frameCanvases.current.set(id, canvas);
    const next = [...frames];
    next.splice(activeIndex + 1, 0, { id, name: `Frame ${frames.length + 1}` });
    setFrames(next);
    setActiveFrameId(id);
    setPlaying(false);
  };
  const deleteFrame = () => {
    if (frames.length === 1) {
      pushUndo();
      frameCanvases.current.get(activeFrameId)?.getContext('2d')!.clearRect(0, 0, WIDTH, HEIGHT);
      renderFrame();
      return;
    }
    const next = frames.filter((frame) => frame.id !== activeFrameId);
    frameCanvases.current.delete(activeFrameId);
    undoStacks.current.delete(activeFrameId);
    redoStacks.current.delete(activeFrameId);
    setFrames(next);
    setActiveFrameId(next[Math.min(activeIndex, next.length - 1)].id);
  };
  const moveFrame = (offset: number) => {
    const destination = Math.max(0, Math.min(frames.length - 1, activeIndex + offset));
    if (destination === activeIndex) return;
    const next = [...frames];
    const [frame] = next.splice(activeIndex, 1);
    next.splice(destination, 0, frame);
    setFrames(next);
  };
  const useIllustration = () => {
    const image = getIllustrationImage();
    const canvas = frameCanvases.current.get(activeFrameId);
    if (!image || !canvas) return;
    pushUndo();
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    renderFrame();
  };
  const saveFrame = () => {
    const canvas = frameCanvases.current.get(activeFrameId);
    canvas?.toBlob((blob) => { if (blob) downloadBlob(blob, `${safeFileName(documentName)}-frame-${activeIndex + 1}.png`); }, 'image/png');
  };
  const exportAnimation = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const canvas = makeFrameCanvas();
      const context = canvas.getContext('2d')!;
      if (!('MediaRecorder' in window) || typeof canvas.captureStream !== 'function') {
        const sheet = document.createElement('canvas');
        sheet.width = WIDTH * frames.length; sheet.height = HEIGHT;
        const sheetContext = sheet.getContext('2d')!;
        frames.forEach((frame, index) => { const source = frameCanvases.current.get(frame.id); if (source) sheetContext.drawImage(source, index * WIDTH, 0); });
        const blob = await new Promise<Blob | null>((resolve) => sheet.toBlob(resolve, 'image/png'));
        if (blob) downloadBlob(blob, `${safeFileName(documentName)}-frames.png`);
        return;
      }
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
      recorder.start();
      for (const frame of frames) {
        context.clearRect(0, 0, WIDTH, HEIGHT);
        const source = frameCanvases.current.get(frame.id);
        if (source) context.drawImage(source, 0, 0);
        track.requestFrame();
        await new Promise((resolve) => window.setTimeout(resolve, 1000 / fps));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((item) => item.stop());
      downloadBlob(new Blob(chunks, { type: mimeType }), `${safeFileName(documentName)}.webm`);
    } finally { setExporting(false); }
  };

  return <main className={`animator-shell ${active ? '' : 'mode-hidden'}`} aria-hidden={!active}>
    <header className="topbar animator-topbar">
      <div className="animator-brand"><div className="brand-mark"><Sparkles size={15} /></div><strong>DUET</strong><span>ANIMATOR</span></div>
      <div className="mode-switch" aria-label="Workspace mode"><button onClick={() => { setPlaying(false); onModeChange('illustration'); }}>Illustrate</button><button className="active" onClick={() => onModeChange('animation')}>Animate</button></div>
      <div className="header-actions"><Button variant="ghost" size="sm" onClick={saveFrame}><Download />Save frame</Button><Button size="sm" className="export-button" onClick={() => void exportAnimation()} disabled={exporting}><Download />{exporting ? 'Rendering…' : 'Export WebM'}</Button></div>
    </header>
    <section className="animator-workspace">
      <aside className="animation-tool-rail" aria-label="Animation drawing tools">
        <button className={tool === 'brush' ? 'active' : ''} onClick={() => setTool('brush')} aria-label="Animation brush"><Brush /></button>
        <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')} aria-label="Animation eraser"><Eraser /></button>
        <span className="animation-rail-divider" />
        <label className="animation-color" title="Brush colour" aria-label="Brush colour"><input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} /><span style={{ background: brushColor }} /></label>
      </aside>
      <div className="animation-main">
        <div className="animation-context-bar">
          <strong>{tool === 'brush' ? 'Brush' : 'Eraser'}</strong><span>Size</span><Slider min={2} max={96} value={[brushSize]} onValueChange={(value) => setBrushSize(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><code>{brushSize}px</code>
          {tool === 'brush' && <><span>Opacity</span><Slider min={1} max={100} value={[brushOpacity]} onValueChange={(value) => setBrushOpacity(Math.round(Array.isArray(value) ? value[0] : Number(value)))} /><code>{brushOpacity}%</code></>}
          <span className="animation-context-spacer" /><Button variant="ghost" size="icon-sm" onClick={undo} aria-label="Undo frame stroke"><Undo2 /></Button><Button variant="ghost" size="icon-sm" onClick={redo} aria-label="Redo frame stroke"><Redo2 /></Button>
        </div>
        <div className="animation-stage"><div className="animation-canvas-wrap"><canvas ref={displayRef} width={WIDTH} height={HEIGHT} className={`animation-canvas ${playing ? 'playing' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} /></div><div className="frame-counter">Frame {activeIndex + 1} of {frames.length}</div></div>
        <div className="playback-bar"><button onClick={() => setActiveFrameId(frames[0].id)} aria-label="First frame"><SkipBack /></button><button onClick={() => selectOffset(-1)} aria-label="Previous frame"><ChevronLeft /></button><button className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause /> : <Play />}</button><button onClick={() => selectOffset(1)} aria-label="Next frame"><ChevronRight /></button><button onClick={() => setActiveFrameId(frames[frames.length - 1].id)} aria-label="Last frame"><SkipForward /></button><span className="playback-separator" /><label>FPS <input type="number" min={1} max={24} value={fps} onChange={(event) => setFps(Math.max(1, Math.min(24, Number(event.target.value) || 1)))} /></label><button className={onionSkin ? 'active' : ''} onClick={() => setOnionSkin((value) => !value)}><Ghost />Onion skin</button></div>
        <div className="timeline"><div className="timeline-heading"><div><Film /><strong>Timeline</strong><span>{frames.length} frame{frames.length === 1 ? '' : 's'}</span></div><div><button onClick={() => moveFrame(-1)} disabled={activeIndex === 0}><ChevronLeft />Move</button><button onClick={() => moveFrame(1)} disabled={activeIndex === frames.length - 1}>Move<ChevronRight /></button><button onClick={() => addFrame(true)}><Copy />Duplicate</button><button onClick={deleteFrame}><Trash2 />Delete</button></div></div><div className="timeline-track">{frames.map((frame, index) => <button key={frame.id} className={`timeline-frame ${frame.id === activeFrameId ? 'active' : ''}`} onClick={() => { setPlaying(false); setActiveFrameId(frame.id); }}><canvas ref={(node) => { if (node) thumbnailRefs.current.set(frame.id, node); else thumbnailRefs.current.delete(frame.id); }} width={144} height={96} /><span>{index + 1}</span></button>)}<button className="timeline-add" onClick={() => addFrame(false)}><Plus /><span>Add frame</span></button></div></div>
      </div>
      <aside className="animation-panel"><div className="animation-panel-heading"><Film /><div><strong>Flipbook</strong><span>{documentName}</span></div></div><p>Draw frame by frame, preview motion, and use onion skin to line up your next pose.</p><button className="illustration-frame-button" onClick={useIllustration}><ImagePlus />Use illustration as frame</button><div className="animation-stat"><span>Current frame</span><strong>{activeIndex + 1}</strong></div><div className="animation-stat"><span>Playback speed</span><strong>{fps} fps</strong></div><div className="animation-stat"><span>Onion skin</span><strong>{onionSkin ? 'On' : 'Off'}</strong></div><div className="animation-shortcuts"><strong>Shortcuts</strong><span>Space · Play / pause</span><span>← → · Change frame</span><span>⌘Z · Undo</span></div></aside>
    </section>
  </main>;
}
