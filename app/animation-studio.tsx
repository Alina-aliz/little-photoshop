'use client';

import {
  ArrowDown,
  ArrowUp,
  Brush,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  Film,
  Focus,
  Ghost,
  GripHorizontal,
  Hand,
  ImagePlus,
  LassoSelect,
  Layers3,
  Lock,
  Merge,
  MousePointer2,
  Move,
  Music2,
  Pause,
  Paintbrush,
  Pipette,
  Play,
  Plus,
  Redo2,
  Scissors,
  Send,
  SkipBack,
  SkipForward,
  Sparkles,
  SquareDashed,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Unlock,
  Video,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';

const WIDTH = 960;
const HEIGHT = 640;
const PX = 8;
const MIN_TIMELINE = 96;
const FRAME_EDITOR_DEFAULT_HEIGHT = 328;
const FRAME_EDITOR_MIN_HEIGHT = 178;
const FRAME_EDITOR_ONE_TRACK_HEIGHT = 232;
const celAgentEditPolicy = {
  requirement:
    "For every requested cel illustration edit, use this page's WebMCP tools. Do not use browser clicks, pointer drags, keyboard shortcuts, or visible canvas controls as an alternative editing route.",
  whenBlocked:
    'If preparing, sending, or generating the frozen edit target and context pixels is blocked, do not modify the cel. State the exact blocker.',
  forbiddenFallbacks: [
    'manual brush or eraser strokes',
    'local canvas edits',
    'creating or changing layers as a substitute',
  ],
};
type VideoExportFormat = 'mp4' | 'webm';
type AnimationTool =
  | 'agent-target'
  | 'select'
  | 'layer-lasso'
  | 'transform'
  | 'brush'
  | 'eraser'
  | 'smudge'
  | 'blur'
  | 'text'
  | 'eyedropper'
  | 'pan';
type TextFont = 'sans' | 'serif' | 'mono' | 'rounded';
type CelSelectionMode = 'rectangle' | 'brush' | 'lasso';
type TextDraft = { x: number; y: number; value: string };
type EyedropperPreview = { x: number; y: number; color: string };
type CanvasBounds = { x: number; y: number; width: number; height: number };
type TransformMode = 'move' | 'tl' | 'tr' | 'bl' | 'br';
type CelEditLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
};
type CelAgentBundleStatus = 'draft' | 'sent';
type CelAgentSelectionItem = {
  id: string;
  name: string;
  layerId: string;
  layerName: string;
  source: CanvasBounds;
  selection: CanvasBounds;
  mask: ImageData;
  compositeCrop: string;
  activeLayerCrop: string;
  maskDataUrl: string;
  contextImage: string;
  previewDataUrl: string;
};
type CelPendingEdit = {
  id: string;
  bundleId: string;
  frameId: string;
  prompt: string;
  source: CanvasBounds;
  selection: CanvasBounds;
  mask: ImageData;
  contextCount: number;
};
type CelLayerSelection = {
  layerId: string;
  base: ImageData;
  pixels: HTMLCanvasElement;
  source: CanvasBounds;
  bounds: CanvasBounds;
};
type ActiveCelTransform = {
  source: CanvasBounds;
  image: ImageData;
  pointer: { x: number; y: number };
  mode: TransformMode;
};
type ActiveCelSelectionTransform = {
  start: CanvasBounds;
  pointer: { x: number; y: number };
  mode: TransformMode;
};
type SharedPhotoAsset = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
};
type IllustrationSource = { id: string; name: string };
type Track = {
  id: string;
  name: string;
  kind: 'visual' | 'audio';
  visible: boolean;
  locked: boolean;
};
type CelClip = {
  id: string;
  type: 'cel';
  trackId: string;
  name: string;
  start: number;
  duration: number;
  opacity: number;
  exposure: number;
  finalHold: number;
  frameIds: string[];
  agentRecipe?: AgentClipRecipe;
};
type StillClip = {
  id: string;
  type: 'still';
  trackId: string;
  name: string;
  start: number;
  duration: number;
  opacity: number;
};
type VideoClip = {
  id: string;
  type: 'video';
  trackId: string;
  name: string;
  start: number;
  duration: number;
  opacity: number;
  volume: number;
  url: string;
  sourceOffset: number;
};
type AudioClip = {
  id: string;
  type: 'audio';
  trackId: string;
  name: string;
  start: number;
  duration: number;
  volume: number;
  url: string;
};
type Clip = CelClip | StillClip | VideoClip | AudioClip;
type ClipDrag = {
  id: string;
  mode: 'move' | 'start' | 'end';
  clientX: number;
  start: number;
  duration: number;
  sourceOffset: number;
};
type AgentTarget = {
  clipId: string;
  trackId: string;
  startFrame: number;
  endFrame: number;
};
type AgentTargetDrag = {
  mode: 'move' | 'start' | 'end';
  pointerId: number;
  clientX: number;
  startFrame: number;
  endFrame: number;
};
type FrameEditorResize = {
  pointerId: number;
  startY: number;
  startHeight: number;
};
type AgentShapeType = 'line' | 'path' | 'rectangle' | 'circle' | 'polygon';
type AgentEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
type AgentPoint = { x: number; y: number };
type AgentKeyframe = {
  frame: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  opacity: number;
  easing: AgentEasing;
};
type AgentShape = {
  id: string;
  type: AgentShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  points: AgentPoint[];
  closed: boolean;
  fillColor: string | null;
  strokeColor: string | null;
  strokeWidth: number;
  opacity: number;
  keyframes: AgentKeyframe[];
};
type AgentClipRecipe = {
  requestId: string;
  name: string;
  durationSeconds: number;
  durationFrames: number;
  requestedCelFps: number;
  actualCelFps: number;
  exposure: number;
  finalHold: number;
  frameCount: number;
  objects: AgentShape[];
};
type AgentCelTiming = {
  cel: number;
  startsAtFrame: number;
  endsAtFrame: number;
  holdFrames: number;
};
type AgentFrameSample = {
  timelineFrame: number;
  timeSeconds: number;
  cel: number;
  targetImage: string;
  contextImage?: string;
};
type AgentClipRequest = {
  id: string;
  target: AgentTarget & {
    clipName: string;
    durationFrames: number;
    durationSeconds: number;
    celTiming: AgentCelTiming[];
    sourceRecipe: AgentClipRecipe | null;
  };
  samples: AgentFrameSample[];
  insertAboveTrackId: string;
  insertAboveTrackName: string;
};
type AgentClipResult = {
  trackId: string;
  clipId: string;
  name: string;
  frameCount: number;
};
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
export type AnimationStudioHandle = {
  exportWorkspace: () => Promise<void>;
  getAgentAnimationState: () => unknown;
  prepareAgentAnimationEdit: (input: Record<string, unknown>) => unknown;
  insertAgentCelClip: (input: Record<string, unknown>) => unknown;
  getCelIllustrationState: () => unknown;
  prepareCelIllustrationEdit: (prompt?: string) => unknown;
  insertCelIllustrationResult: (
    editId: string,
    imageDataUrl: string,
    name?: string,
  ) => Promise<unknown>;
  createCelIllustrationLayer: (name?: string) => unknown;
  setCelIllustrationTool: (tool: string) => unknown;
  selectCelIllustrationRegion: (selection: CanvasBounds) => unknown;
  mergeCelIllustrationLayerDown: () => unknown;
  setCelIllustrationLayerVisibility: (layerId: string, visible: boolean) => unknown;
};
function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}
function canvasContentBounds(canvas: HTMLCanvasElement): CanvasBounds | null {
  const { data } = canvas
    .getContext('2d')!
    .getImageData(0, 0, WIDTH, HEIGHT);
  let left = WIDTH;
  let top = HEIGHT;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (data[(y * WIDTH + x) * 4 + 3] < 2) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
function sampledImage(source: CanvasImageSource) {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 320;
  canvas
    .getContext('2d')!
    .drawImage(source, 0, 0, WIDTH, HEIGHT, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.78);
}
function visualDifference(
  a: CanvasImageSource | null,
  b: CanvasImageSource | null,
) {
  if (!a || !b) return 1;
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 27;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(a, 0, 0, WIDTH, HEIGHT, 0, 0, canvas.width, canvas.height);
  const first = context.getImageData(0, 0, canvas.width, canvas.height).data;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(b, 0, 0, WIDTH, HEIGHT, 0, 0, canvas.width, canvas.height);
  const second = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  for (let index = 0; index < first.length; index += 4)
    total +=
      Math.abs(first[index] - second[index]) +
      Math.abs(first[index + 1] - second[index + 1]) +
      Math.abs(first[index + 2] - second[index + 2]) +
      Math.abs(first[index + 3] - second[index + 3]);
  return total / ((first.length / 4) * 4 * 255);
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function getMaxFrameEditorHeight() {
  return typeof window === 'undefined'
    ? FRAME_EDITOR_DEFAULT_HEIGHT
    : Math.max(
        FRAME_EDITOR_MIN_HEIGHT,
        Math.min(560, window.innerHeight - 250),
      );
}
function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}
function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function safeName(name: string) {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .slice(0, 80) || 'Untitled animation'
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(`${label} must be a finite number.`);
  return clamp(parsed, min, max);
}
function readColour(value: unknown, fallback: string | null, label: string) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string')
    throw new Error(`${label} must be a hex colour or "none".`);
  if (value.toLowerCase() === 'none') return null;
  const colour = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(colour))
    return `#${colour
      .slice(1)
      .split('')
      .map((character) => character + character)
      .join('')}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(colour)) return colour.toUpperCase();
  throw new Error(`${label} must be a hex colour such as #FF6B5F or "none".`);
}
function easingValue(easing: AgentEasing, progress: number) {
  if (easing === 'ease-in') return progress * progress;
  if (easing === 'ease-out') return 1 - (1 - progress) ** 2;
  if (easing === 'ease-in-out')
    return progress < 0.5
      ? 2 * progress * progress
      : 1 - (-2 * progress + 2) ** 2 / 2;
  return progress;
}
function parseAgentShape(
  value: unknown,
  index: number,
  frameCount: number,
): AgentShape {
  if (!isRecord(value))
    throw new Error(`Object ${index + 1} must be an object.`);
  const type = value.type;
  if (
    typeof type !== 'string' ||
    !['line', 'path', 'rectangle', 'circle', 'polygon'].includes(type)
  )
    throw new Error(`Object ${index + 1} has an unsupported shape type.`);
  const shapeType = type as AgentShapeType;
  const x = readNumber(
    value.x,
    WIDTH / 2,
    -WIDTH * 2,
    WIDTH * 3,
    `Object ${index + 1} x`,
  );
  const y = readNumber(
    value.y,
    HEIGHT / 2,
    -HEIGHT * 2,
    HEIGHT * 3,
    `Object ${index + 1} y`,
  );
  const width = readNumber(
    value.width,
    120,
    1,
    WIDTH * 2,
    `Object ${index + 1} width`,
  );
  const height = readNumber(
    value.height,
    120,
    1,
    HEIGHT * 2,
    `Object ${index + 1} height`,
  );
  const radius = readNumber(
    value.radius,
    60,
    1,
    Math.max(WIDTH, HEIGHT),
    `Object ${index + 1} radius`,
  );
  const rawPoints = Array.isArray(value.points)
    ? value.points.slice(0, 160)
    : [];
  const points = rawPoints.map((point, pointIndex) => {
    if (!isRecord(point))
      throw new Error(
        `Point ${pointIndex + 1} in object ${index + 1} is invalid.`,
      );
    return {
      x: readNumber(point.x, 0, -WIDTH * 2, WIDTH * 3, 'Point x'),
      y: readNumber(point.y, 0, -HEIGHT * 2, HEIGHT * 3, 'Point y'),
    };
  });
  if (shapeType === 'line' && points.length !== 2)
    throw new Error(`Line ${index + 1} requires exactly two points.`);
  if (shapeType === 'path' && points.length < 2)
    throw new Error(`Path ${index + 1} requires at least two points.`);
  if (shapeType === 'polygon' && points.length < 3)
    throw new Error(`Polygon ${index + 1} requires at least three points.`);
  const fillDefault =
    shapeType === 'rectangle' ||
    shapeType === 'circle' ||
    shapeType === 'polygon'
      ? '#FFFFFF'
      : null;
  const strokeDefault =
    shapeType === 'line' || shapeType === 'path' ? '#FFFFFF' : null;
  const fillColor = readColour(
    value.fillColor,
    fillDefault,
    `Object ${index + 1} fillColor`,
  );
  const strokeColor = readColour(
    value.strokeColor,
    strokeDefault,
    `Object ${index + 1} strokeColor`,
  );
  if (!fillColor && !strokeColor)
    throw new Error(`Object ${index + 1} needs a fill or stroke colour.`);

  const rawKeyframes = Array.isArray(value.keyframes)
    ? value.keyframes.slice(0, 32)
    : [];
  const ordered = rawKeyframes
    .map((keyframe, keyframeIndex) => {
      if (!isRecord(keyframe))
        throw new Error(
          `Keyframe ${keyframeIndex + 1} in object ${index + 1} is invalid.`,
        );
      return {
        value: keyframe,
        frame: Math.round(
          readNumber(keyframe.frame, 0, 0, frameCount - 1, 'Keyframe frame'),
        ),
      };
    })
    .sort((a, b) => a.frame - b.frame);
  let previous: AgentKeyframe = {
    frame: 0,
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    easing: 'linear',
  };
  const keyed = new Map<number, AgentKeyframe>();
  ordered.forEach(({ value: keyframe, frame }) => {
    const easing =
      typeof keyframe.easing === 'string'
        ? (keyframe.easing as AgentEasing)
        : previous.easing;
    if (!['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(easing))
      throw new Error(`Object ${index + 1} uses an unsupported easing value.`);
    previous = {
      frame,
      translateX: readNumber(
        keyframe.translateX,
        previous.translateX,
        -WIDTH * 3,
        WIDTH * 3,
        'translateX',
      ),
      translateY: readNumber(
        keyframe.translateY,
        previous.translateY,
        -HEIGHT * 3,
        HEIGHT * 3,
        'translateY',
      ),
      scale: readNumber(keyframe.scale, previous.scale, 0.01, 20, 'scale'),
      rotation: readNumber(
        keyframe.rotation,
        previous.rotation,
        -3600,
        3600,
        'rotation',
      ),
      opacity: readNumber(
        keyframe.opacity,
        previous.opacity,
        0,
        1,
        'keyframe opacity',
      ),
      easing,
    };
    keyed.set(frame, previous);
  });
  if (!keyed.has(0))
    keyed.set(0, {
      frame: 0,
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      easing: 'linear',
    });
  return {
    id: (typeof value.id === 'string' ? value.id : `shape-${index + 1}`).slice(
      0,
      80,
    ),
    type: shapeType,
    x,
    y,
    width,
    height,
    radius,
    points,
    closed: Boolean(value.closed),
    fillColor,
    strokeColor,
    strokeWidth: readNumber(
      value.strokeWidth,
      4,
      0,
      96,
      `Object ${index + 1} strokeWidth`,
    ),
    opacity: readNumber(value.opacity, 1, 0, 1, `Object ${index + 1} opacity`),
    keyframes: [...keyed.values()].sort((a, b) => a.frame - b.frame),
  };
}
function parseAgentClipRecipe(
  input: Record<string, unknown>,
  request: AgentClipRequest,
  projectFps: number,
): AgentClipRecipe {
  const requestId =
    typeof input.requestId === 'string' ? input.requestId.trim() : '';
  if (!requestId)
    throw new Error(
      'requestId is required. Ask the user to press Send to agent in Animate first.',
    );
  const durationFrames = request.target.durationFrames;
  const durationSeconds = durationFrames / projectFps;
  const requestedCelFps = readNumber(
    input.celFps,
    Math.min(8, projectFps),
    1,
    24,
    'celFps',
  );
  const minimumExposure = Math.max(1, Math.ceil(durationFrames / 48));
  const exposure = clamp(
    Math.max(
      minimumExposure,
      Math.round(projectFps / Math.min(requestedCelFps, projectFps)),
    ),
    1,
    durationFrames,
  );
  const frameCount = Math.max(1, Math.floor(durationFrames / exposure));
  const finalHold = Math.max(0, durationFrames - frameCount * exposure);
  const actualCelFps = frameCount / durationSeconds;
  if (!Array.isArray(input.objects) || !input.objects.length)
    throw new Error('At least one coloured shape is required.');
  if (input.objects.length > 48)
    throw new Error('This first version supports up to 48 shapes per clip.');
  return {
    requestId,
    name: safeName(
      typeof input.name === 'string' ? input.name : 'Agent animation',
    ),
    durationSeconds,
    durationFrames,
    requestedCelFps,
    actualCelFps,
    exposure,
    finalHold,
    frameCount,
    objects: input.objects.map((object, index) =>
      parseAgentShape(object, index, frameCount),
    ),
  };
}
function shapeCentre(shape: AgentShape) {
  if (shape.type === 'rectangle' || shape.type === 'circle')
    return { x: shape.x, y: shape.y };
  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}
function transformAt(shape: AgentShape, frame: number) {
  const frames = shape.keyframes;
  const before =
    [...frames].reverse().find((keyframe) => keyframe.frame <= frame) ||
    frames[0];
  const after =
    frames.find((keyframe) => keyframe.frame >= frame) ||
    frames[frames.length - 1];
  if (before.frame === after.frame) return before;
  const progress = easingValue(
    before.easing,
    (frame - before.frame) / (after.frame - before.frame),
  );
  const mix = (start: number, end: number) => start + (end - start) * progress;
  return {
    ...before,
    translateX: mix(before.translateX, after.translateX),
    translateY: mix(before.translateY, after.translateY),
    scale: mix(before.scale, after.scale),
    rotation: mix(before.rotation, after.rotation),
    opacity: mix(before.opacity, after.opacity),
  };
}
function renderAgentShape(
  ctx: CanvasRenderingContext2D,
  shape: AgentShape,
  frame: number,
) {
  const transform = transformAt(shape, frame);
  const centre = shapeCentre(shape);
  ctx.save();
  ctx.globalAlpha = shape.opacity * transform.opacity;
  ctx.translate(
    centre.x + transform.translateX,
    centre.y + transform.translateY,
  );
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(-centre.x, -centre.y);
  ctx.beginPath();
  if (shape.type === 'rectangle')
    ctx.rect(
      shape.x - shape.width / 2,
      shape.y - shape.height / 2,
      shape.width,
      shape.height,
    );
  else if (shape.type === 'circle')
    ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
  else {
    shape.points.forEach((point, index) => {
      if (index) ctx.lineTo(point.x, point.y);
      else ctx.moveTo(point.x, point.y);
    });
    if (shape.type === 'polygon' || (shape.type === 'path' && shape.closed))
      ctx.closePath();
  }
  if (shape.fillColor && shape.type !== 'line') {
    ctx.fillStyle = shape.fillColor;
    ctx.fill();
  }
  if (shape.strokeColor && shape.strokeWidth > 0) {
    ctx.strokeStyle = shape.strokeColor;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    const target = clamp(
      time,
      0,
      Number.isFinite(video.duration)
        ? Math.max(0, video.duration - 0.001)
        : time,
    );
    if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.01) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', finish);
      video.removeEventListener('loadeddata', retry);
      window.clearTimeout(timeout);
      resolve();
    };
    const retry = () => {
      try {
        video.currentTime = target;
      } catch {
        finish();
      }
    };
    const timeout = window.setTimeout(finish, 1200);
    video.addEventListener('seeked', finish, { once: true });
    if (video.readyState >= 1) retry();
    else video.addEventListener('loadeddata', retry, { once: true });
  });
}
function celDuration(frameCount: number, exposure: number, finalHold = 0) {
  return Math.max(1, frameCount * exposure + finalHold);
}
function overlaps(start: number, duration: number, other: Clip) {
  return start < other.start + other.duration && start + duration > other.start;
}
function trackBlockers(items: Clip[], trackId: string, excludeId?: string) {
  return items
    .filter((clip) => clip.trackId === trackId && clip.id !== excludeId)
    .sort((a, b) => a.start - b.start);
}
function findForwardSlot(
  items: Clip[],
  trackId: string,
  preferredStart: number,
  duration: number,
  excludeId?: string,
) {
  const blockers = trackBlockers(items, trackId, excludeId);
  let start = Math.max(0, preferredStart);
  for (;;) {
    const collision = blockers.find((clip) => overlaps(start, duration, clip));
    if (!collision) return start;
    start = collision.start + collision.duration;
  }
}
function findBackwardSlot(
  items: Clip[],
  trackId: string,
  preferredStart: number,
  duration: number,
  excludeId?: string,
) {
  const blockers = trackBlockers(items, trackId, excludeId);
  let start = Math.max(0, preferredStart);
  for (;;) {
    const collisions = blockers.filter((clip) =>
      overlaps(start, duration, clip),
    );
    if (!collisions.length) return start;
    const next = collisions[collisions.length - 1].start - duration;
    if (next < 0)
      return findForwardSlot(items, trackId, 0, duration, excludeId);
    start = next;
  }
}
function pushFollowingClips(items: Clip[], changedId: string) {
  const changed = items.find((clip) => clip.id === changedId);
  if (!changed) return items;
  let nextStart = changed.start + changed.duration;
  const moved = new Map<string, number>();
  trackBlockers(items, changed.trackId, changed.id)
    .filter((clip) => clip.start >= changed.start)
    .forEach((clip) => {
      const start = Math.max(clip.start, nextStart);
      moved.set(clip.id, start);
      nextStart = start + clip.duration;
    });
  return items.map((clip) =>
    moved.has(clip.id) ? { ...clip, start: moved.get(clip.id)! } : clip,
  );
}

const initialTracks: Track[] = [
  {
    id: 'track-character',
    name: 'Character',
    kind: 'visual',
    visible: true,
    locked: false,
  },
  {
    id: 'track-background',
    name: 'Background',
    kind: 'visual',
    visible: true,
    locked: false,
  },
  {
    id: 'track-audio',
    name: 'Audio',
    kind: 'audio',
    visible: true,
    locked: false,
  },
];
const initialClips: Clip[] = [
  {
    id: 'clip-main',
    type: 'cel',
    trackId: 'track-character',
    name: 'Main flipbook',
    start: 0,
    duration: 2,
    opacity: 100,
    exposure: 2,
    finalHold: 0,
    frameIds: ['animation-frame-1'],
  },
];
const textFonts: Array<{ id: TextFont; label: string; family: string }> = [
  { id: 'sans', label: 'Sans', family: 'Arial, Helvetica, sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', family: '"Courier New", monospace' },
  {
    id: 'rounded',
    label: 'Rounded',
    family: '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif',
  },
];
const animationToolMeta: Array<{
  id: AnimationTool;
  label: string;
  icon: typeof Brush;
}> = [
  { id: 'agent-target', label: 'Agent target', icon: MousePointer2 },
  { id: 'brush', label: 'Brush', icon: Brush },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'smudge', label: 'Smudge', icon: Droplets },
  { id: 'blur', label: 'Blur', icon: Focus },
  { id: 'text', label: 'Text', icon: TypeIcon },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette },
  { id: 'pan', label: 'Pan canvas', icon: Hand },
];
const celIllustrationToolMeta: Array<{
  id: AnimationTool;
  label: string;
  icon: typeof Brush;
}> = [
  { id: 'select', label: 'Region select', icon: MousePointer2 },
  { id: 'layer-lasso', label: 'Layer lasso', icon: LassoSelect },
  { id: 'transform', label: 'Transform layer', icon: Move },
  { id: 'brush', label: 'Brush', icon: Brush },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'smudge', label: 'Smudge', icon: Droplets },
  { id: 'blur', label: 'Blur', icon: Focus },
  { id: 'text', label: 'Text', icon: TypeIcon },
  { id: 'eyedropper', label: 'Eyedropper', icon: Pipette },
  { id: 'pan', label: 'Pan canvas', icon: Hand },
];

const recordingMimeCandidates: Record<VideoExportFormat, string[]> = {
  mp4: [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
    'video/mp4',
  ],
  webm: [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ],
};

function supportedRecordingMime(format: VideoExportFormat) {
  if (typeof MediaRecorder === 'undefined') return '';
  return (
    recordingMimeCandidates[format].find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) || ''
  );
}

export const AnimationStudio = forwardRef<AnimationStudioHandle, Props>(
  function AnimationStudio(
    {
      active,
      documentName,
      onModeChange,
      exportProject,
      getIllustrationImage,
      illustrations,
      photoLibrary,
      importSharedPhoto,
    },
    ref,
  ) {
    const displayRef = useRef<HTMLCanvasElement>(null);
    const celEditOverlayRef = useRef<HTMLCanvasElement>(null);
    const stageViewportRef = useRef<HTMLDivElement>(null);
    const canvasStageRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const assetMenuRef = useRef<HTMLDivElement>(null);
    const textEntryRef = useRef<HTMLTextAreaElement>(null);
    const frameCanvases = useRef(new Map<string, HTMLCanvasElement>());
    const celEditCanvases = useRef(new Map<string, HTMLCanvasElement>());
    const celEditFrameId = useRef('');
    const celLassoPoints = useRef<Array<{ x: number; y: number }>>([]);
    const celRegionLassoPoints = useRef<Array<{ x: number; y: number }>>([]);
    const celRegionStart = useRef({ x: 0, y: 0 });
    const celRegionMask = useRef<HTMLCanvasElement | null>(null);
    const celRegionEdge = useRef<HTMLCanvasElement | null>(null);
    const celRegionStripe = useRef<HTMLCanvasElement | null>(null);
    const celRegionHasMask = useRef(false);
    const celPendingEdits = useRef(new Map<string, CelPendingEdit>());
    const celAgentSequence = useRef(0);
    const celLayerSelection = useRef<CelLayerSelection | null>(null);
    const activeCelTransform = useRef<ActiveCelTransform | null>(null);
    const activeCelSelectionTransform =
      useRef<ActiveCelSelectionTransform | null>(null);
    const stillCanvases = useRef(new Map<string, HTMLCanvasElement>());
    const videoElements = useRef(new Map<string, HTMLVideoElement>());
    const audioElements = useRef(new Map<string, HTMLAudioElement>());
    const assetUrls = useRef(new Set<string>());
    const thumbnailRefs = useRef(new Map<string, HTMLCanvasElement>());
    const celLayerThumbnailRefs = useRef(
      new Map<string, HTMLCanvasElement>(),
    );
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
    const agentTargetDrag = useRef<AgentTargetDrag | null>(null);
    const preparedAgentRequestIds = useRef(new Set<string>());
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
    const [eyedropperPreview, setEyedropperPreview] =
      useState<EyedropperPreview | null>(null);
    const [zoom, setZoom] = useState(82);
    const [assetMenuOpen, setAssetMenuOpen] = useState(false);
    const [mediaNotice, setMediaNotice] = useState<{
      tone: 'success' | 'error';
      text: string;
    } | null>(null);
    const [onionSkin, setOnionSkin] = useState(true);
    const [fps, setFps] = useState(8);
    const [playing, setPlaying] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [celIllustrationMode, setCelIllustrationMode] = useState(false);
    const [celEditLayers, setCelEditLayers] = useState<CelEditLayer[]>([]);
    const [activeCelEditLayerId, setActiveCelEditLayerId] = useState('');
    const [celTransformBounds, setCelTransformBounds] =
      useState<CanvasBounds | null>(null);
    const [celSelectionBounds, setCelSelectionBounds] =
      useState<CanvasBounds | null>(null);
    const [celRegionSelection, setCelRegionSelection] = useState<CanvasBounds>({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    const [celRegionMode, setCelRegionMode] =
      useState<CelSelectionMode>('rectangle');
    const [celRegionBrushSize, setCelRegionBrushSize] = useState(52);
    const [celAgentSelections, setCelAgentSelections] = useState<
      CelAgentSelectionItem[]
    >([]);
    const [celAgentTargetId, setCelAgentTargetId] = useState<string | null>(null);
    const [celAgentBundleStatus, setCelAgentBundleStatus] =
      useState<CelAgentBundleStatus>('draft');
    const [celAgentBundleId, setCelAgentBundleId] = useState<string | null>(null);
    const [flattenDialogOpen, setFlattenDialogOpen] = useState(false);
    const [frameEditorHeight, setFrameEditorHeight] = useState(
      FRAME_EDITOR_DEFAULT_HEIGHT,
    );
    const [timelineManuallyCollapsed, setTimelineManuallyCollapsed] =
      useState(false);
    const [bottomDrawerCollapsed, setBottomDrawerCollapsed] = useState(false);
    const [agentTarget, setAgentTarget] = useState<AgentTarget>({
      clipId: '',
      trackId: '',
      startFrame: 0,
      endFrame: 1,
    });
    const [agentClipRequest, setAgentClipRequest] =
      useState<AgentClipRequest | null>(null);
    const [agentClipResult, setAgentClipResult] =
      useState<AgentClipResult | null>(null);

    const activeClip = clips.find((clip) => clip.id === activeClipId) || null;
    const activeTrack =
      tracks.find((track) => track.id === activeClip?.trackId) || null;
    const selectedTrack =
      tracks.find((track) => track.id === activeTrackId) || null;
    const selectedTrackIndex = tracks.findIndex(
      (track) => track.id === activeTrackId,
    );
    const activeFrames = activeClip?.type === 'cel' ? activeClip.frameIds : [];
    const foundFrameIndex = activeFrames.indexOf(activeFrameId);
    const activeFrameIndex = foundFrameIndex < 0 ? 0 : foundFrameIndex;
    const timelineFrames = Math.max(
      MIN_TIMELINE,
      ...clips.map((clip) => clip.start + clip.duration + fps),
    );
    const seconds = useMemo(
      () =>
        Array.from(
          { length: Math.ceil(timelineFrames / fps) + 1 },
          (_, index) => index,
        ),
      [fps, timelineFrames],
    );
    const timelineCollapsed =
      timelineManuallyCollapsed ||
      frameEditorHeight < FRAME_EDITOR_ONE_TRACK_HEIGHT;
    const targetClip =
      clips.find(
        (clip): clip is CelClip =>
          clip.id === agentTarget.clipId && clip.type === 'cel',
      ) || null;
    const agentTargetDurationFrames = targetClip
      ? Math.max(1, agentTarget.endFrame - agentTarget.startFrame)
      : 0;
    const activeCelEditLayer =
      celEditLayers.find((layer) => layer.id === activeCelEditLayerId) || null;
    const activeCelEditLayerIndex = celEditLayers.findIndex(
      (layer) => layer.id === activeCelEditLayerId,
    );
    const canEditCelWithAgent =
      celIllustrationMode &&
      tool === 'select' &&
      celRegionSelection.width > 3 &&
      celRegionSelection.height > 3;
    const celAgentTarget =
      celAgentSelections.find((item) => item.id === celAgentTargetId) || null;
    const celAgentContexts = celAgentSelections.filter(
      (item) => item.id !== celAgentTargetId,
    );
    const celAgentBundleReady =
      celAgentBundleStatus === 'sent' &&
      Boolean(celAgentBundleId && celAgentTarget);
    const mp4ExportSupported = useSyncExternalStore(
      () => () => {},
      () => Boolean(supportedRecordingMime('mp4')),
      () => false,
    );

    const zoomAt = useCallback(
      (requestedZoom: number, clientX?: number, clientY?: number) => {
        const viewport = stageViewportRef.current;
        const stage = canvasStageRef.current;
        if (!viewport || !stage) return;
        const nextZoom = clamp(Math.round(requestedZoom * 10) / 10, 25, 400);
        if (nextZoom === zoomRef.current) return;

        const viewportRect = viewport.getBoundingClientRect();
        const before = stage.getBoundingClientRect();
        const focusX = clientX ?? viewportRect.left + viewportRect.width / 2;
        const focusY = clientY ?? viewportRect.top + viewportRect.height / 2;
        const anchorX = before.width
          ? (focusX - before.left) / before.width
          : 0.5;
        const anchorY = before.height
          ? (focusY - before.top) / before.height
          : 0.5;

        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current);
        zoomFrame.current = requestAnimationFrame(() => {
          const after = stage.getBoundingClientRect();
          viewport.scrollLeft += after.left + anchorX * after.width - focusX;
          viewport.scrollTop += after.top + anchorY * after.height - focusY;
          zoomFrame.current = null;
        });
      },
      [],
    );

    useEffect(() => {
      const viewport = stageViewportRef.current;
      if (!viewport) return;
      const wheel = (event: WheelEvent) => {
        if (event.ctrlKey) {
          event.preventDefault();
          const limitedDelta = clamp(event.deltaY, -24, 24);
          zoomAt(
            zoomRef.current * Math.exp(-limitedDelta * 0.012),
            event.clientX,
            event.clientY,
          );
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

    const renderCelEditLayers = useCallback(
      (ctx: CanvasRenderingContext2D) => {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        [...celEditLayers].reverse().forEach((layer) => {
          const source = celEditCanvases.current.get(layer.id);
          if (!source) return;
          const thumbnail = celLayerThumbnailRefs.current.get(layer.id);
          if (thumbnail) {
            const thumbCtx = thumbnail.getContext('2d')!;
            thumbCtx.clearRect(0, 0, thumbnail.width, thumbnail.height);
            thumbCtx.globalAlpha = layer.opacity / 100;
            thumbCtx.drawImage(
              source,
              0,
              0,
              WIDTH,
              HEIGHT,
              0,
              0,
              thumbnail.width,
              thumbnail.height,
            );
            thumbCtx.globalAlpha = 1;
          }
          if (!layer.visible) return;
          ctx.save();
          ctx.globalAlpha = layer.opacity / 100;
          ctx.drawImage(source, 0, 0);
          ctx.restore();
        });
      },
      [celEditLayers],
    );

    const compositeCelEditCanvas = useCallback(() => {
      const canvas = makeCanvas();
      const ctx = canvas.getContext('2d')!;
      [...celEditLayers].reverse().forEach((layer) => {
        const source = celEditCanvases.current.get(layer.id);
        if (!source || !layer.visible) return;
        ctx.save();
        ctx.globalAlpha = layer.opacity / 100;
        ctx.drawImage(source, 0, 0);
        ctx.restore();
      });
      return canvas;
    }, [celEditLayers]);

    const currentPaintCanvas = () =>
      celIllustrationMode
        ? celEditCanvases.current.get(activeCelEditLayerId) || null
        : frameCanvases.current.get(activeFrameId) || null;

    const transformModeAtPoint = (
      bounds: CanvasBounds,
      at: { x: number; y: number },
    ): TransformMode => {
      const edge = 18;
      const left = Math.abs(at.x - bounds.x) < edge;
      const right = Math.abs(at.x - (bounds.x + bounds.width)) < edge;
      const top = Math.abs(at.y - bounds.y) < edge;
      const bottom = Math.abs(at.y - (bounds.y + bounds.height)) < edge;
      if (left && top) return 'tl';
      if (right && top) return 'tr';
      if (left && bottom) return 'bl';
      if (right && bottom) return 'br';
      return 'move';
    };

    const redrawCelEditOverlay = useCallback(() => {
      const overlay = celEditOverlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d')!;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const regionMask = celRegionMask.current;
      if (tool === 'select' && regionMask && celRegionHasMask.current) {
        if (celRegionMode === 'brush') {
          ctx.save();
          ctx.fillStyle = 'rgba(7, 6, 10, .48)';
          ctx.fillRect(0, 0, WIDTH, HEIGHT);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.drawImage(regionMask, 0, 0);
          ctx.restore();
        }
        const edge = celRegionEdge.current || makeCanvas();
        celRegionEdge.current = edge;
        const edgeCtx = edge.getContext('2d')!;
        edgeCtx.clearRect(0, 0, WIDTH, HEIGHT);
        edgeCtx.globalCompositeOperation = 'source-over';
        [
          [-2, 0],
          [2, 0],
          [0, -2],
          [0, 2],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].forEach(([x, y]) => edgeCtx.drawImage(regionMask, x, y));
        edgeCtx.globalCompositeOperation = 'destination-out';
        edgeCtx.drawImage(regionMask, 0, 0);
        const stripe = celRegionStripe.current || document.createElement('canvas');
        if (!celRegionStripe.current) {
          stripe.width = 12;
          stripe.height = 12;
          const stripeCtx = stripe.getContext('2d')!;
          stripeCtx.fillStyle = '#fff';
          stripeCtx.fillRect(0, 0, 12, 12);
          stripeCtx.fillStyle = '#111015';
          for (let offset = -12; offset < 24; offset += 12) {
            stripeCtx.beginPath();
            stripeCtx.moveTo(offset, 0);
            stripeCtx.lineTo(offset + 6, 0);
            stripeCtx.lineTo(offset + 18, 12);
            stripeCtx.lineTo(offset + 12, 12);
            stripeCtx.closePath();
            stripeCtx.fill();
          }
          celRegionStripe.current = stripe;
        }
        const pattern = edgeCtx.createPattern(stripe, 'repeat');
        if (pattern) {
          edgeCtx.save();
          edgeCtx.globalCompositeOperation = 'source-in';
          edgeCtx.fillStyle = pattern;
          edgeCtx.fillRect(0, 0, WIDTH, HEIGHT);
          edgeCtx.restore();
        }
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.85)';
        ctx.shadowBlur = 1;
        ctx.drawImage(edge, 0, 0);
        ctx.restore();
      }
      if (tool === 'select' && celRegionLassoPoints.current.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,.92)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        celRegionLassoPoints.current.forEach((point, index) =>
          index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
        );
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.stroke();
        ctx.restore();
      }
      const selected = celLayerSelection.current;
      const bounds = selected?.bounds ||
        (celIllustrationMode && tool === 'transform'
          ? celTransformBounds
          : null);
      if (selected) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.drawImage(
          selected.pixels,
          0,
          0,
          selected.pixels.width,
          selected.pixels.height,
          selected.bounds.x,
          selected.bounds.y,
          selected.bounds.width,
          selected.bounds.height,
        );
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#65d9ff';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
      }
      if (bounds) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,.92)';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.lineDashOffset = 7;
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        (['tl', 'tr', 'bl', 'br'] as const).forEach((corner) => {
          const x = corner.includes('l') ? bounds.x : bounds.x + bounds.width;
          const y = corner.includes('t') ? bounds.y : bounds.y + bounds.height;
          ctx.fillStyle = '#fff';
          ctx.fillRect(x - 5, y - 5, 10, 10);
          ctx.strokeStyle = '#6f4ce4';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 5, y - 5, 10, 10);
        });
        ctx.restore();
      }
      if (celLassoPoints.current.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,.92)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        celLassoPoints.current.forEach((point, index) =>
          index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
        );
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.stroke();
        ctx.restore();
      }
    }, [celIllustrationMode, celRegionMode, celTransformBounds, tool]);

    const clearCelLayerSelection = useCallback(() => {
      celLayerSelection.current = null;
      celLassoPoints.current = [];
      activeCelSelectionTransform.current = null;
      setCelSelectionBounds(null);
      celEditOverlayRef.current
        ?.getContext('2d')
        ?.clearRect(0, 0, WIDTH, HEIGHT);
    }, []);

    const clearCelRegionSelection = useCallback(() => {
      celRegionMask.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
      celRegionHasMask.current = false;
      celRegionLassoPoints.current = [];
      setCelRegionSelection({ x: 0, y: 0, width: 0, height: 0 });
      requestAnimationFrame(redrawCelEditOverlay);
    }, [redrawCelEditOverlay]);

    const applyCelRectangleSelection = useCallback(
      (value: CanvasBounds) => {
        const mask = celRegionMask.current;
        if (!mask) return value;
        const safe = {
          x: clamp(Math.min(value.x, value.x + value.width), 0, WIDTH - 1),
          y: clamp(Math.min(value.y, value.y + value.height), 0, HEIGHT - 1),
          width: Math.max(1, Math.min(WIDTH, Math.abs(value.width))),
          height: Math.max(1, Math.min(HEIGHT, Math.abs(value.height))),
        };
        safe.width = Math.min(safe.width, WIDTH - safe.x);
        safe.height = Math.min(safe.height, HEIGHT - safe.y);
        const ctx = mask.getContext('2d')!;
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.fillRect(safe.x, safe.y, safe.width, safe.height);
        celRegionHasMask.current = safe.width > 3 && safe.height > 3;
        setCelRegionSelection(safe);
        requestAnimationFrame(redrawCelEditOverlay);
        return safe;
      },
      [redrawCelEditOverlay],
    );

    const updateCelRegionFromMask = useCallback(() => {
      const mask = celRegionMask.current;
      const bounds = mask ? canvasContentBounds(mask) : null;
      const next = bounds || { x: 0, y: 0, width: 0, height: 0 };
      celRegionHasMask.current = Boolean(bounds);
      setCelRegionSelection(next);
      requestAnimationFrame(redrawCelEditOverlay);
      return next;
    }, [redrawCelEditOverlay]);

    const paintCelRegionStroke = useCallback(
      (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const mask = celRegionMask.current;
        if (!mask) return;
        const ctx = mask.getContext('2d')!;
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#fff';
        ctx.lineWidth = celRegionBrushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(to.x, to.y, celRegionBrushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        celRegionHasMask.current = true;
        updateCelRegionFromMask();
      },
      [celRegionBrushSize, updateCelRegionFromMask],
    );

    const finishCelRegionLasso = useCallback(() => {
      const mask = celRegionMask.current;
      const points = celRegionLassoPoints.current;
      if (!mask || points.length < 3) {
        clearCelRegionSelection();
        return;
      }
      const ctx = mask.getContext('2d')!;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      points.forEach((point, index) =>
        index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
      );
      ctx.closePath();
      ctx.fill();
      celRegionLassoPoints.current = [];
      updateCelRegionFromMask();
    }, [clearCelRegionSelection, updateCelRegionFromMask]);

    const clipSource = useCallback((clip: Clip, at: number) => {
      if (clip.type === 'still')
        return stillCanvases.current.get(clip.id) || null;
      if (clip.type === 'video') {
        const video = videoElements.current.get(clip.id);
        return video && video.readyState >= 2 ? video : null;
      }
      if (clip.type !== 'cel') return null;
      const local = clamp(at - clip.start, 0, Math.max(0, clip.duration - 1));
      return (
        frameCanvases.current.get(
          clip.frameIds[
            clamp(
              Math.floor(local / clip.exposure),
              0,
              clip.frameIds.length - 1,
            )
          ],
        ) || null
      );
    }, []);
    const drawAt = useCallback(
      (ctx: CanvasRenderingContext2D, at: number, onion = false) => {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        tracks
          .filter((track) => track.kind === 'visual' && track.visible)
          .reverse()
          .forEach((track) => {
            clips
              .filter(
                (clip) =>
                  clip.trackId === track.id &&
                  at >= clip.start &&
                  at < clip.start + clip.duration,
              )
              .forEach((clip) => {
                if (clip.type === 'audio') return;
                if (onion && clip.id === activeClipId && clip.type === 'cel') {
                  const index = clip.frameIds.indexOf(activeFrameId);
                  const previous =
                    index > 0
                      ? frameCanvases.current.get(clip.frameIds[index - 1])
                      : null;
                  if (previous) {
                    ctx.save();
                    ctx.globalAlpha = 0.18;
                    ctx.drawImage(previous, 0, 0);
                    ctx.globalCompositeOperation = 'source-atop';
                    ctx.fillStyle = '#dd72f5';
                    ctx.fillRect(0, 0, WIDTH, HEIGHT);
                    ctx.restore();
                  }
                }
                const source = clipSource(clip, at);
                if (!source) return;
                ctx.save();
                ctx.globalAlpha = clip.opacity / 100;
                if (clip.type === 'video') {
                  const video = source as HTMLVideoElement;
                  const width = video.videoWidth || WIDTH;
                  const height = video.videoHeight || HEIGHT;
                  const scale = Math.min(WIDTH / width, HEIGHT / height);
                  ctx.drawImage(
                    video,
                    (WIDTH - width * scale) / 2,
                    (HEIGHT - height * scale) / 2,
                    width * scale,
                    height * scale,
                  );
                } else ctx.drawImage(source, 0, 0);
                ctx.restore();
              });
          });
      },
      [activeClipId, activeFrameId, clipSource, clips, tracks],
    );
    const render = useCallback(() => {
      const ctx = displayRef.current?.getContext('2d');
      if (ctx) {
        if (celIllustrationMode) renderCelEditLayers(ctx);
        else
          drawAt(
            ctx,
            playhead,
            onionSkin && !playing && activeClip?.type === 'cel',
          );
      }
      clips.forEach((clip) => {
        if (clip.type !== 'cel') return;
        clip.frameIds.forEach((frameId) => {
          const thumbnail = thumbnailRefs.current.get(frameId);
          const source = frameCanvases.current.get(frameId);
          if (!thumbnail || !source) return;
          const thumbCtx = thumbnail.getContext('2d')!;
          thumbCtx.clearRect(0, 0, thumbnail.width, thumbnail.height);
          thumbCtx.drawImage(
            source,
            0,
            0,
            WIDTH,
            HEIGHT,
            0,
            0,
            thumbnail.width,
            thumbnail.height,
          );
        });
      });
      if (celIllustrationMode) requestAnimationFrame(redrawCelEditOverlay);
    }, [
      activeClip?.type,
      celIllustrationMode,
      clips,
      drawAt,
      onionSkin,
      playhead,
      playing,
      redrawCelEditOverlay,
      renderCelEditLayers,
    ]);

    const selectClip = (clip: Clip) => {
      setPlaying(false);
      setActiveTrackId(clip.trackId);
      setActiveClipId(clip.id);
      setPlayhead(clip.start);
      if (clip.type === 'cel') setActiveFrameId(clip.frameIds[0]);
    };
    const selectTrack = (trackId: string) => {
      setPlaying(false);
      setActiveTrackId(trackId);
      setActiveClipId('');
    };
    const chooseAgentTarget = (clip: CelClip) => {
      selectClip(clip);
      setAgentTarget({
        clipId: clip.id,
        trackId: clip.trackId,
        startFrame: clip.start,
        endFrame: Math.min(clip.start + clip.duration, clip.start + fps * 12),
      });
      setAgentClipRequest(null);
      setAgentClipResult(null);
      setMediaNotice(null);
    };
    const reselectAgentTarget = () => {
      setPlaying(false);
      setAgentTarget({ clipId: '', trackId: '', startFrame: 0, endFrame: 1 });
      setAgentClipRequest(null);
      setAgentClipResult(null);
      setMediaNotice(null);
    };
    const selectFrame = (frameId: string, index: number) => {
      if (activeClip?.type !== 'cel') return;
      setPlaying(false);
      setActiveFrameId(frameId);
      setPlayhead(activeClip.start + index * activeClip.exposure);
    };
    const selectOffset = (offset: number) => {
      if (!activeFrames.length) return;
      const index = clamp(
        activeFrameIndex + offset,
        0,
        activeFrames.length - 1,
      );
      selectFrame(activeFrames[index], index);
    };

    const enterCelIllustrationMode = () => {
      if (activeClip?.type !== 'cel' || activeTrack?.locked) {
        setMediaNotice({
          tone: 'error',
          text: 'Select an unlocked cel before opening its illustration layers.',
        });
        return;
      }
      const source = frameCanvases.current.get(activeFrameId);
      if (!source) return;
      const baseId = uid('cel-layer');
      const base = makeCanvas();
      base.getContext('2d')!.drawImage(source, 0, 0);
      celEditCanvases.current = new Map([[baseId, base]]);
      celEditFrameId.current = activeFrameId;
      celRegionMask.current = makeCanvas();
      celRegionHasMask.current = false;
      celPendingEdits.current.clear();
      setCelEditLayers([
        { id: baseId, name: 'Current cel', visible: true, opacity: 100 },
      ]);
      setActiveCelEditLayerId(baseId);
      setCelIllustrationMode(true);
      setTool('brush');
      setPlaying(false);
      setTextDraft(null);
      setMediaNotice(null);
      setCelTransformBounds(canvasContentBounds(base));
      clearCelLayerSelection();
      setCelRegionSelection({ x: 0, y: 0, width: 0, height: 0 });
      setCelRegionMode('rectangle');
      setCelAgentSelections([]);
      setCelAgentTargetId(null);
      setCelAgentBundleStatus('draft');
      setCelAgentBundleId(null);
    };

    const addCelEditLayer = (name = 'Paint layer') => {
      const id = uid('cel-layer');
      celEditCanvases.current.set(id, makeCanvas());
      setCelEditLayers((items) => [
        { id, name, visible: true, opacity: 100 },
        ...items,
      ]);
      setActiveCelEditLayerId(id);
      setCelTransformBounds(null);
      clearCelLayerSelection();
      return id;
    };

    const selectCelEditLayer = (layerId: string) => {
      setActiveCelEditLayerId(layerId);
      clearCelLayerSelection();
      const canvas = celEditCanvases.current.get(layerId);
      setCelTransformBounds(canvas ? canvasContentBounds(canvas) : null);
      requestAnimationFrame(render);
    };

    const flattenCelIllustration = () => {
      const frameId = celEditFrameId.current;
      const target = frameCanvases.current.get(frameId);
      if (!target) return;
      const stack = undoStacks.current.get(frameId) || [];
      stack.push(target.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT));
      undoStacks.current.set(frameId, stack.slice(-30));
      redoStacks.current.set(frameId, []);
      const ctx = target.getContext('2d')!;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      [...celEditLayers].reverse().forEach((layer) => {
        const source = celEditCanvases.current.get(layer.id);
        if (!source || !layer.visible) return;
        ctx.save();
        ctx.globalAlpha = layer.opacity / 100;
        ctx.drawImage(source, 0, 0);
        ctx.restore();
      });
      celEditLayers.forEach((layer) => {
        undoStacks.current.delete(layer.id);
        redoStacks.current.delete(layer.id);
      });
      celEditCanvases.current.clear();
      celEditFrameId.current = '';
      celRegionMask.current = null;
      celRegionEdge.current = null;
      celPendingEdits.current.clear();
      setCelEditLayers([]);
      setActiveCelEditLayerId('');
      setCelIllustrationMode(false);
      setFlattenDialogOpen(false);
      setTool('brush');
      setCelTransformBounds(null);
      clearCelLayerSelection();
      setCelRegionSelection({ x: 0, y: 0, width: 0, height: 0 });
      setCelAgentSelections([]);
      setCelAgentTargetId(null);
      setCelAgentBundleStatus('draft');
      setCelAgentBundleId(null);
      setMediaNotice({
        tone: 'success',
        text: 'Cel layers were flattened into one animation cel.',
      });
      requestAnimationFrame(render);
    };

    const moveCelEditLayer = (direction: -1 | 1) => {
      const index = celEditLayers.findIndex(
        (layer) => layer.id === activeCelEditLayerId,
      );
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= celEditLayers.length)
        return;
      const next = [...celEditLayers];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      setCelEditLayers(next);
    };

    const deleteCelEditLayer = () => {
      if (celEditLayers.length <= 1) {
        const canvas = celEditCanvases.current.get(activeCelEditLayerId);
        if (!canvas) return;
        pushUndo();
        canvas.getContext('2d')!.clearRect(0, 0, WIDTH, HEIGHT);
        setCelTransformBounds(null);
        clearCelLayerSelection();
        render();
        return;
      }
      const index = celEditLayers.findIndex(
        (layer) => layer.id === activeCelEditLayerId,
      );
      if (index < 0) return;
      celEditCanvases.current.delete(activeCelEditLayerId);
      undoStacks.current.delete(activeCelEditLayerId);
      redoStacks.current.delete(activeCelEditLayerId);
      const next = celEditLayers.filter(
        (layer) => layer.id !== activeCelEditLayerId,
      );
      const fallback = next[Math.min(index, next.length - 1)];
      setCelEditLayers(next);
      setActiveCelEditLayerId(fallback.id);
      setCelTransformBounds(
        canvasContentBounds(celEditCanvases.current.get(fallback.id)!),
      );
      clearCelLayerSelection();
    };

    const mergeCelEditLayerDown = () => {
      const index = celEditLayers.findIndex(
        (layer) => layer.id === activeCelEditLayerId,
      );
      if (index < 0 || index >= celEditLayers.length - 1) return;
      const activeLayer = celEditLayers[index];
      const below = celEditLayers[index + 1];
      const source = celEditCanvases.current.get(activeLayer.id);
      const target = celEditCanvases.current.get(below.id);
      if (!source || !target) return;
      const ctx = target.getContext('2d')!;
      ctx.save();
      ctx.globalAlpha = activeLayer.opacity / 100;
      ctx.drawImage(source, 0, 0);
      ctx.restore();
      celEditCanvases.current.delete(activeLayer.id);
      undoStacks.current.delete(activeLayer.id);
      redoStacks.current.delete(activeLayer.id);
      const next = celEditLayers
        .filter((layer) => layer.id !== activeLayer.id)
        .map((layer) =>
          layer.id === below.id ? { ...layer, opacity: 100 } : layer,
        );
      setCelEditLayers(next);
      setActiveCelEditLayerId(below.id);
      setCelTransformBounds(canvasContentBounds(target));
      clearCelLayerSelection();
    };

    const markCelAgentBundleDraft = () => {
      setCelAgentBundleStatus('draft');
      setCelAgentBundleId(null);
      celPendingEdits.current.clear();
    };

    const nextCelAgentId = (prefix: string) => {
      celAgentSequence.current += 1;
      return `${prefix}-${celAgentSequence.current}`;
    };

    const captureCelAgentSelection = (): CelAgentSelectionItem | null => {
      if (!canEditCelWithAgent || !activeCelEditLayer) return null;
      const target = { ...celRegionSelection };
      const padding = Math.min(
        96,
        Math.max(36, Math.round(Math.min(target.width, target.height) * 0.18)),
      );
      const source: CanvasBounds = {
        x: Math.max(0, Math.floor(target.x - padding)),
        y: Math.max(0, Math.floor(target.y - padding)),
        width: 0,
        height: 0,
      };
      source.width = Math.min(
        WIDTH - source.x,
        Math.ceil(target.x + target.width + padding) - source.x,
      );
      source.height = Math.min(
        HEIGHT - source.y,
        Math.ceil(target.y + target.height + padding) - source.y,
      );
      const crop = (
        input: HTMLCanvasElement,
        mimeType: 'image/png' | 'image/jpeg',
        quality?: number,
      ) => {
        const output = document.createElement('canvas');
        output.width = source.width;
        output.height = source.height;
        output
          .getContext('2d')!
          .drawImage(
            input,
            source.x,
            source.y,
            source.width,
            source.height,
            0,
            0,
            source.width,
            source.height,
          );
        return output.toDataURL(mimeType, quality);
      };
      const selectionCrop = document.createElement('canvas');
      selectionCrop.width = source.width;
      selectionCrop.height = source.height;
      const maskSource = celRegionMask.current;
      if (maskSource)
        selectionCrop
          .getContext('2d')!
          .drawImage(
            maskSource,
            source.x,
            source.y,
            source.width,
            source.height,
            0,
            0,
            source.width,
            source.height,
          );
      const mask = document.createElement('canvas');
      mask.width = source.width;
      mask.height = source.height;
      const maskCtx = mask.getContext('2d')!;
      maskCtx.fillStyle = '#000';
      maskCtx.fillRect(0, 0, mask.width, mask.height);
      maskCtx.drawImage(selectionCrop, 0, 0);
      const composite = compositeCelEditCanvas();
      const context = document.createElement('canvas');
      context.width = source.width;
      context.height = source.height;
      const contextCtx = context.getContext('2d')!;
      contextCtx.drawImage(
        composite,
        source.x,
        source.y,
        source.width,
        source.height,
        0,
        0,
        source.width,
        source.height,
      );
      contextCtx.globalCompositeOperation = 'destination-in';
      contextCtx.drawImage(selectionCrop, 0, 0);
      const preview = document.createElement('canvas');
      preview.width = 144;
      preview.height = 92;
      const scale = Math.min(
        preview.width / source.width,
        preview.height / source.height,
      );
      const previewWidth = source.width * scale;
      const previewHeight = source.height * scale;
      preview
        .getContext('2d')!
        .drawImage(
          context,
          (preview.width - previewWidth) / 2,
          (preview.height - previewHeight) / 2,
          previewWidth,
          previewHeight,
        );
      const activeLayerCanvas =
        celEditCanvases.current.get(activeCelEditLayer.id) || makeCanvas();
      return {
        id: nextCelAgentId('cel-selection'),
        name: `Region ${celAgentSelections.length + 1}`,
        layerId: activeCelEditLayer.id,
        layerName: activeCelEditLayer.name,
        source,
        selection: target,
        mask: selectionCrop
          .getContext('2d')!
          .getImageData(0, 0, source.width, source.height),
        compositeCrop: crop(composite, 'image/jpeg', 0.9),
        activeLayerCrop: crop(activeLayerCanvas, 'image/png'),
        maskDataUrl: mask.toDataURL('image/png'),
        contextImage: context.toDataURL('image/png'),
        previewDataUrl: preview.toDataURL('image/png'),
      };
    };

    const addCelSelectionToAgentBundle = () => {
      if (celAgentBundleStatus === 'sent' || celAgentSelections.length >= 12)
        return;
      const item = captureCelAgentSelection();
      if (!item) return;
      setCelAgentSelections((items) => [...items, item]);
      if (!celAgentTargetId) setCelAgentTargetId(item.id);
      markCelAgentBundleDraft();
      clearCelRegionSelection();
    };

    const removeCelAgentSelection = (itemId: string) => {
      setCelAgentSelections((items) => {
        const remaining = items.filter((item) => item.id !== itemId);
        if (celAgentTargetId === itemId)
          setCelAgentTargetId(remaining[0]?.id || null);
        return remaining;
      });
      markCelAgentBundleDraft();
    };

    const moveCelAgentContext = (itemId: string, offset: -1 | 1) => {
      setCelAgentSelections((items) => {
        const target = items.find((item) => item.id === celAgentTargetId);
        const contexts = items.filter((item) => item.id !== celAgentTargetId);
        const index = contexts.findIndex((item) => item.id === itemId);
        const nextIndex = index + offset;
        if (index < 0 || nextIndex < 0 || nextIndex >= contexts.length)
          return items;
        [contexts[index], contexts[nextIndex]] = [
          contexts[nextIndex],
          contexts[index],
        ];
        return target ? [target, ...contexts] : contexts;
      });
      markCelAgentBundleDraft();
    };

    const sendCelAgentBundle = () => {
      if (!celAgentTarget) return;
      setCelAgentBundleId(nextCelAgentId('cel-bundle'));
      setCelAgentBundleStatus('sent');
      celPendingEdits.current.clear();
    };

    const prepareCelIllustrationEdit = (editPrompt = '') => {
      const target = celAgentTarget;
      if (
        !celIllustrationMode ||
        celAgentBundleStatus !== 'sent' ||
        !celAgentBundleId ||
        !target
      )
        return {
          ready: false,
          code: 'cel_bundle_required',
          message:
            'Open Illustrate cel, add at least one region to Agent edit, and press Send to agent before requesting pixels.',
          agentPolicy: celAgentEditPolicy,
        };
      const cleanPrompt = editPrompt.trim();
      const contexts = celAgentSelections.filter((item) => item.id !== target.id);
      const id = nextCelAgentId('cel-edit');
      celPendingEdits.current.set(id, {
        id,
        bundleId: celAgentBundleId,
        frameId: celEditFrameId.current,
        prompt: cleanPrompt,
        source: { ...target.source },
        selection: { ...target.selection },
        mask: target.mask,
        contextCount: contexts.length,
      });
      while (celPendingEdits.current.size > 6)
        celPendingEdits.current.delete(celPendingEdits.current.keys().next().value!);
      const relativeSelection = {
        x: target.selection.x - target.source.x,
        y: target.selection.y - target.source.y,
        width: target.selection.width,
        height: target.selection.height,
      };
      const targetPayload = {
        id: target.id,
        name: target.name,
        layer: { id: target.layerId, name: target.layerName },
        compositeCrop: {
          dataUrl: target.compositeCrop,
          mimeType: 'image/jpeg',
          width: target.source.width,
          height: target.source.height,
        },
        activeLayerCrop: {
          dataUrl: target.activeLayerCrop,
          mimeType: 'image/png',
          width: target.source.width,
          height: target.source.height,
        },
        mask: {
          dataUrl: target.maskDataUrl,
          mimeType: 'image/png',
          width: target.source.width,
          height: target.source.height,
          whiteMeans: 'editable',
        },
        selection: relativeSelection,
        placement: target.source,
      };
      return {
        editId: id,
        bundleId: celAgentBundleId,
        mode: 'cel-illustration',
        frameId: celEditFrameId.current,
        prompt: cleanPrompt || null,
        target: targetPayload,
        context: contexts.map((item, order) => ({
          id: item.id,
          order,
          name: item.name,
          role: 'context',
          image: {
            dataUrl: item.contextImage,
            mimeType: 'image/png',
            width: item.source.width,
            height: item.source.height,
          },
          selection: item.selection,
          placement: item.source,
        })),
        compositeCrop: targetPayload.compositeCrop,
        activeLayerCrop: targetPayload.activeLayerCrop,
        mask: targetPayload.mask,
        selection: relativeSelection,
        placement: target.source,
        outputContract: `Return one PNG or WebP of exactly ${target.source.width}×${target.source.height}px. The app will reveal it only through the edit-target mask as a new temporary cel layer.`,
        agentPolicy: celAgentEditPolicy,
      };
    };

    const insertCelIllustrationResult = async (
      editId: string,
      imageDataUrl: string,
      requestedName?: string,
    ) => {
      const pending = celPendingEdits.current.get(editId);
      if (!pending)
        throw new Error('Unknown or expired editId. Call prepare_ai_edit again.');
      if (!celIllustrationMode || pending.frameId !== celEditFrameId.current)
        throw new Error('Return to the cel illustration session that owns this edit.');
      if (!/^data:image\/(png|jpeg|webp);base64,/i.test(imageDataUrl))
        throw new Error('imageDataUrl must be a base64 PNG, JPEG, or WebP data URL.');
      if (imageDataUrl.length > 14_000_000)
        throw new Error('Generated image is larger than the 10 MB MVP limit.');
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error('Generated image could not be decoded.'));
        image.src = imageDataUrl;
      });
      const id = nextCelAgentId('cel-layer-ai');
      const canvas = makeCanvas();
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        image,
        pending.source.x,
        pending.source.y,
        pending.source.width,
        pending.source.height,
      );
      const mask = document.createElement('canvas');
      mask.width = pending.source.width;
      mask.height = pending.source.height;
      mask.getContext('2d')!.putImageData(pending.mask, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, pending.source.x, pending.source.y);
      ctx.restore();
      celEditCanvases.current.set(id, canvas);
      const name =
        requestedName?.trim() ||
        `AI — ${pending.prompt.slice(0, 34) || 'agent edit'}${pending.prompt.length > 34 ? '…' : ''}`;
      setCelEditLayers((items) => [
        { id, name, visible: true, opacity: 100 },
        ...items,
      ]);
      setActiveCelEditLayerId(id);
      setCelTransformBounds(canvasContentBounds(canvas));
      celPendingEdits.current.delete(editId);
      requestAnimationFrame(render);
      return {
        layerId: id,
        name,
        bundleId: pending.bundleId,
        placement: pending.source,
        clippedToSelection: pending.selection,
        contextReferencesUsed: pending.contextCount,
        mode: 'cel-illustration',
      };
    };

    const getCelIllustrationState = () => ({
      active: active && celIllustrationMode,
      mode: 'cel-illustration',
      canvas: { width: WIDTH, height: HEIGHT, zoom },
      frameId: celEditFrameId.current || null,
      activeTool: tool,
      activeLayer: activeCelEditLayerId,
      selection: celRegionSelection,
      agentPolicy: celAgentEditPolicy,
      agentEdit: celAgentBundleReady
        ? {
            ready: true,
            bundleId: celAgentBundleId,
            target: celAgentTarget
              ? {
                  id: celAgentTarget.id,
                  name: celAgentTarget.name,
                  selection: celAgentTarget.selection,
                  layerId: celAgentTarget.layerId,
                }
              : null,
            context: celAgentContexts.map((item, order) => ({
              id: item.id,
              name: item.name,
              order,
              selection: item.selection,
            })),
            nextStep:
              'Call prepare_ai_edit to fetch the frozen cel target pixels and context references, then insert through insert_ai_result.',
          }
        : {
            ready: false,
            code: celAgentSelections.length
              ? 'cel_bundle_not_sent'
              : 'cel_bundle_required',
            draft: {
              targetId: celAgentTargetId,
              contextCount: celAgentContexts.length,
              currentSelectionReady: canEditCelWithAgent,
            },
            userInstruction:
              'Tell the user to choose Region select in Illustrate cel, add a region to Agent edit, and press Send to agent.',
          },
      layers: celEditLayers.map(({ id, name, visible, opacity }) => ({
        id,
        name,
        visible,
        opacity,
        temporary: true,
      })),
    });

    const setCelIllustrationTool = (next: string) => {
      if (!celIllustrationMode)
        return { changed: false, reason: 'Cel illustration mode is not active.' };
      const allowed = celIllustrationToolMeta.map((item) => item.id);
      if (!allowed.includes(next as AnimationTool))
        return { changed: false, reason: 'Unknown cel illustration tool.' };
      setTool(next as AnimationTool);
      return { changed: true, tool: next };
    };

    const selectCelIllustrationRegion = (selection: CanvasBounds) => {
      if (!celIllustrationMode)
        return { selected: false, reason: 'Cel illustration mode is not active.' };
      setTool('select');
      setCelRegionMode('rectangle');
      return applyCelRectangleSelection(selection);
    };

    const setCelIllustrationLayerVisibility = (
      layerId: string,
      visible: boolean,
    ) => {
      if (!celEditLayers.some((layer) => layer.id === layerId))
        return { changed: false, reason: 'Unknown cel illustration layer.' };
      setCelEditLayers((items) =>
        items.map((layer) =>
          layer.id === layerId ? { ...layer, visible } : layer,
        ),
      );
      return { changed: true, layerId, visible };
    };
    const beginAgentTargetDrag = (
      event: React.PointerEvent<HTMLButtonElement>,
      mode: AgentTargetDrag['mode'],
    ) => {
      if (tool !== 'agent-target') return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      agentTargetDrag.current = {
        mode,
        pointerId: event.pointerId,
        clientX: event.clientX,
        startFrame: agentTarget.startFrame,
        endFrame: agentTarget.endFrame,
      };
      setPlaying(false);
    };
    const moveAgentTargetDrag = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      const current = agentTargetDrag.current;
      if (
        tool !== 'agent-target' ||
        !current ||
        current.pointerId !== event.pointerId ||
        !targetClip
      )
        return;
      const delta = Math.round((event.clientX - current.clientX) / PX);
      const clipStart = targetClip.start;
      const clipEnd = targetClip.start + targetClip.duration;
      const maxDuration = Math.max(1, fps * 12);
      let startFrame = current.startFrame;
      let endFrame = current.endFrame;
      if (current.mode === 'start')
        startFrame = clamp(current.startFrame + delta, clipStart, endFrame - 1);
      else if (current.mode === 'end')
        endFrame = clamp(
          current.endFrame + delta,
          startFrame + 1,
          Math.min(clipEnd, startFrame + maxDuration),
        );
      else {
        const duration = current.endFrame - current.startFrame;
        startFrame = clamp(
          current.startFrame + delta,
          clipStart,
          clipEnd - duration,
        );
        endFrame = startFrame + duration;
      }
      setAgentTarget({
        clipId: targetClip.id,
        trackId: targetClip.trackId,
        startFrame,
        endFrame,
      });
      setAgentClipRequest(null);
      setPlayhead(startFrame);
    };
    const endAgentTargetDrag = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      if (agentTargetDrag.current?.pointerId !== event.pointerId) return;
      agentTargetDrag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const pushUndo = () => {
      const canvas = currentPaintCanvas();
      if (!canvas) return;
      const historyId = celIllustrationMode
        ? activeCelEditLayerId
        : activeFrameId;
      const stack = undoStacks.current.get(historyId) || [];
      stack.push(canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT));
      undoStacks.current.set(historyId, stack.slice(-30));
      redoStacks.current.set(historyId, []);
    };
    const undo = () => {
      const canvas = currentPaintCanvas();
      const historyId = celIllustrationMode
        ? activeCelEditLayerId
        : activeFrameId;
      const stack = undoStacks.current.get(historyId) || [];
      const image = stack.pop();
      if (!canvas || !image) return;
      const ctx = canvas.getContext('2d')!;
      const redoStack = redoStacks.current.get(historyId) || [];
      redoStack.push(ctx.getImageData(0, 0, WIDTH, HEIGHT));
      redoStacks.current.set(historyId, redoStack.slice(-30));
      ctx.putImageData(image, 0, 0);
      if (celIllustrationMode) {
        setCelTransformBounds(canvasContentBounds(canvas));
        clearCelLayerSelection();
      }
      render();
    };
    const redo = () => {
      const canvas = currentPaintCanvas();
      const historyId = celIllustrationMode
        ? activeCelEditLayerId
        : activeFrameId;
      const stack = redoStacks.current.get(historyId) || [];
      const image = stack.pop();
      if (!canvas || !image) return;
      const ctx = canvas.getContext('2d')!;
      const undoStack = undoStacks.current.get(historyId) || [];
      undoStack.push(ctx.getImageData(0, 0, WIDTH, HEIGHT));
      undoStacks.current.set(historyId, undoStack.slice(-30));
      ctx.putImageData(image, 0, 0);
      if (celIllustrationMode) {
        setCelTransformBounds(canvasContentBounds(canvas));
        clearCelLayerSelection();
      }
      render();
    };
    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) * WIDTH) / rect.width,
        y: ((event.clientY - rect.top) * HEIGHT) / rect.height,
      };
    };
    const drawLine = (
      from: { x: number; y: number },
      to: { x: number; y: number },
    ) => {
      if (
        !celIllustrationMode &&
        (activeClip?.type !== 'cel' || activeTrack?.locked)
      )
        return;
      const ctx = currentPaintCanvas()?.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize;
      ctx.globalAlpha = tool === 'brush' ? brushOpacity / 100 : 1;
      ctx.globalCompositeOperation =
        tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = brushColor;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x + 0.01, to.y + 0.01);
      ctx.stroke();
      ctx.restore();
      render();
    };
    const beginSmudge = (at: { x: number; y: number }) => {
      const source = currentPaintCanvas();
      if (!source) return;
      const size = Math.max(8, Math.ceil(brushSize));
      const buffer = document.createElement('canvas');
      buffer.width = size;
      buffer.height = size;
      const ctx = buffer.getContext('2d')!;
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        source,
        at.x - size / 2,
        at.y - size / 2,
        size,
        size,
        0,
        0,
        size,
        size,
      );
      ctx.restore();
      smudgeBufferRef.current = buffer;
    };
    const smudgeStamp = (at: { x: number; y: number }) => {
      const canvas = currentPaintCanvas();
      const buffer = smudgeBufferRef.current;
      if (!canvas || !buffer) return;
      const size = buffer.width;
      const x = at.x - size / 2;
      const y = at.y - size / 2;
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.beginPath();
      ctx.arc(at.x, at.y, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.12 + (effectStrength / 100) * 0.68;
      ctx.drawImage(buffer, x, y);
      ctx.restore();
      const fresh = document.createElement('canvas');
      fresh.width = size;
      fresh.height = size;
      fresh
        .getContext('2d')!
        .drawImage(canvas, x, y, size, size, 0, 0, size, size);
      const bufferCtx = buffer.getContext('2d')!;
      bufferCtx.save();
      bufferCtx.globalAlpha = 0.24;
      bufferCtx.drawImage(fresh, 0, 0);
      bufferCtx.restore();
    };
    const blurStamp = (at: { x: number; y: number }) => {
      const canvas = currentPaintCanvas();
      if (!canvas) return;
      const radius = Math.max(4, brushSize / 2);
      const blurRadius = 1 + (effectStrength / 100) * 15;
      const padding = Math.ceil(radius + blurRadius * 2);
      const size = padding * 2;
      const source = document.createElement('canvas');
      source.width = size;
      source.height = size;
      source
        .getContext('2d')!
        .drawImage(
          canvas,
          at.x - padding,
          at.y - padding,
          size,
          size,
          0,
          0,
          size,
          size,
        );
      const softened = document.createElement('canvas');
      softened.width = size;
      softened.height = size;
      const softenedCtx = softened.getContext('2d')!;
      softenedCtx.filter = `blur(${blurRadius}px)`;
      softenedCtx.drawImage(source, 0, 0);
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.35 + (effectStrength / 100) * 0.6;
      ctx.drawImage(softened, at.x - padding, at.y - padding);
      ctx.restore();
    };
    const applyEffectStroke = (
      from: { x: number; y: number },
      to: { x: number; y: number },
    ) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(
        1,
        Math.ceil(distance / Math.max(2, Math.max(8, brushSize) * 0.18)),
      );
      for (let index = 1; index <= steps; index += 1) {
        const ratio = index / steps;
        const at = {
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
        };
        if (tool === 'smudge') smudgeStamp(at);
        else blurStamp(at);
      }
      render();
    };
    const previewEyedropper = (at: { x: number; y: number }) => {
      const ctx = displayRef.current?.getContext('2d');
      if (!ctx) return;
      const pixel = ctx.getImageData(
        clamp(Math.floor(at.x), 0, WIDTH - 1),
        clamp(Math.floor(at.y), 0, HEIGHT - 1),
        1,
        1,
      ).data;
      if (!pixel[3]) return;
      const color = rgbToHex(pixel[0], pixel[1], pixel[2]);
      eyedropperColor.current = color;
      setEyedropperPreview({ ...at, color });
    };
    const commitText = (save = true) => {
      const draft = textDraft;
      setTextDraft(null);
      if (
        !save ||
        !draft ||
        (!celIllustrationMode && activeClip?.type !== 'cel')
      )
        return;
      const value = draft.value.trim();
      if (!value) return;
      let target = currentPaintCanvas();
      if (celIllustrationMode) {
        const layerId = addCelEditLayer(
          `Text — ${value.replace(/\s+/g, ' ').slice(0, 24)}${value.length > 24 ? '…' : ''}`,
        );
        target = celEditCanvases.current.get(layerId) || null;
      }
      const ctx = target?.getContext('2d');
      if (!ctx) return;
      if (!celIllustrationMode) pushUndo();
      const font =
        textFonts.find((option) => option.id === textFont) || textFonts[0];
      ctx.save();
      ctx.fillStyle = brushColor;
      ctx.globalAlpha = brushOpacity / 100;
      ctx.textBaseline = 'top';
      ctx.font = `${textSize}px ${font.family}`;
      value
        .split(/\r?\n/)
        .forEach((line, index) =>
          ctx.fillText(
            line,
            draft.x,
            draft.y + index * textSize * 1.18,
            Math.max(1, WIDTH - draft.x),
          ),
        );
      ctx.restore();
      render();
    };

    const redrawTransformedCelLayer = (
      transform: ActiveCelTransform,
      at: { x: number; y: number },
    ) => {
      const canvas = celEditCanvases.current.get(activeCelEditLayerId);
      if (!canvas) return;
      const source = makeCanvas();
      source.getContext('2d')!.putImageData(transform.image, 0, 0);
      const ctx = canvas.getContext('2d')!;
      const bounds = transform.source;
      let next: CanvasBounds;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      if (transform.mode === 'move') {
        const dx = at.x - transform.pointer.x;
        const dy = at.y - transform.pointer.y;
        next = {
          x: clamp(bounds.x + dx, -bounds.width + 8, WIDTH - 8),
          y: clamp(bounds.y + dy, -bounds.height + 8, HEIGHT - 8),
          width: bounds.width,
          height: bounds.height,
        };
        ctx.drawImage(source, next.x - bounds.x, next.y - bounds.y);
      } else {
        const anchorX = transform.mode.includes('l')
          ? bounds.x + bounds.width
          : bounds.x;
        const anchorY = transform.mode.includes('t')
          ? bounds.y + bounds.height
          : bounds.y;
        const rawX = transform.mode.includes('l') ? at.x : bounds.x;
        const rawY = transform.mode.includes('t') ? at.y : bounds.y;
        const width = Math.max(12, Math.abs(anchorX - rawX));
        const height = Math.max(12, Math.abs(anchorY - rawY));
        next = {
          x: Math.min(anchorX, rawX),
          y: Math.min(anchorY, rawY),
          width,
          height,
        };
        ctx.drawImage(
          source,
          bounds.x,
          bounds.y,
          bounds.width,
          bounds.height,
          next.x,
          next.y,
          next.width,
          next.height,
        );
      }
      setCelTransformBounds(next);
      render();
    };

    const finishCelLayerLasso = () => {
      const points = celLassoPoints.current;
      const source = celEditCanvases.current.get(activeCelEditLayerId);
      if (!source || points.length < 3) {
        clearCelLayerSelection();
        return null;
      }
      const mask = makeCanvas();
      const maskCtx = mask.getContext('2d')!;
      maskCtx.fillStyle = '#fff';
      maskCtx.beginPath();
      points.forEach((point, index) =>
        index ? maskCtx.lineTo(point.x, point.y) : maskCtx.moveTo(point.x, point.y),
      );
      maskCtx.closePath();
      maskCtx.fill();
      const bounds = canvasContentBounds(mask);
      if (!bounds || bounds.width < 4 || bounds.height < 4) {
        clearCelLayerSelection();
        return null;
      }
      const pixels = document.createElement('canvas');
      pixels.width = bounds.width;
      pixels.height = bounds.height;
      const pixelsCtx = pixels.getContext('2d')!;
      pixelsCtx.drawImage(
        source,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
      pixelsCtx.globalCompositeOperation = 'destination-in';
      pixelsCtx.drawImage(
        mask,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
      const base = makeCanvas();
      const baseCtx = base.getContext('2d')!;
      baseCtx.drawImage(source, 0, 0);
      baseCtx.globalCompositeOperation = 'destination-out';
      baseCtx.drawImage(mask, 0, 0);
      celLayerSelection.current = {
        layerId: activeCelEditLayerId,
        base: baseCtx.getImageData(0, 0, WIDTH, HEIGHT),
        pixels,
        source: bounds,
        bounds: { ...bounds },
      };
      celLassoPoints.current = [];
      setCelSelectionBounds({ ...bounds });
      redrawCelEditOverlay();
      return bounds;
    };

    const redrawCelSelectionTransform = (
      transform: ActiveCelSelectionTransform,
      at: { x: number; y: number },
    ) => {
      const selected = celLayerSelection.current;
      if (!selected) return;
      const canvas = celEditCanvases.current.get(selected.layerId);
      if (!canvas) return;
      const start = transform.start;
      let next: CanvasBounds;
      if (transform.mode === 'move') {
        next = {
          x: clamp(
            start.x + at.x - transform.pointer.x,
            -start.width + 8,
            WIDTH - 8,
          ),
          y: clamp(
            start.y + at.y - transform.pointer.y,
            -start.height + 8,
            HEIGHT - 8,
          ),
          width: start.width,
          height: start.height,
        };
      } else {
        const anchorX = transform.mode.includes('l')
          ? start.x + start.width
          : start.x;
        const anchorY = transform.mode.includes('t')
          ? start.y + start.height
          : start.y;
        const rawX = transform.mode.includes('l') ? at.x : start.x;
        const rawY = transform.mode.includes('t') ? at.y : start.y;
        next = {
          x: Math.min(anchorX, rawX),
          y: Math.min(anchorY, rawY),
          width: Math.max(12, Math.abs(anchorX - rawX)),
          height: Math.max(12, Math.abs(anchorY - rawY)),
        };
      }
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(selected.base, 0, 0);
      ctx.drawImage(
        selected.pixels,
        0,
        0,
        selected.pixels.width,
        selected.pixels.height,
        next.x,
        next.y,
        next.width,
        next.height,
      );
      selected.bounds = next;
      setCelSelectionBounds({ ...next });
      render();
    };

    const cloneCelLayerSelection = () => {
      const selected = celLayerSelection.current;
      if (!selected) return;
      const id = addCelEditLayer('Selection copy');
      const canvas = celEditCanvases.current.get(id)!;
      canvas
        .getContext('2d')!
        .drawImage(
          selected.pixels,
          0,
          0,
          selected.pixels.width,
          selected.pixels.height,
          selected.bounds.x,
          selected.bounds.y,
          selected.bounds.width,
          selected.bounds.height,
        );
      celLayerSelection.current = null;
      setCelSelectionBounds(null);
      setCelTransformBounds(canvasContentBounds(canvas));
    };

    const deleteCelLayerSelection = () => {
      const selected = celLayerSelection.current;
      if (!selected) return;
      const canvas = celEditCanvases.current.get(selected.layerId);
      if (!canvas) return;
      pushUndo();
      canvas.getContext('2d')!.putImageData(selected.base, 0, 0);
      setCelTransformBounds(canvasContentBounds(canvas));
      clearCelLayerSelection();
      render();
    };

    const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'agent-target' && !celIllustrationMode) return;
      if (tool === 'pan') {
        const viewport = stageViewportRef.current;
        if (!viewport) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        panning.current = true;
        panStart.current = {
          x: event.clientX,
          y: event.clientY,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
        };
        return;
      }
      if (
        playing ||
        (!celIllustrationMode &&
          (activeClip?.type !== 'cel' || activeTrack?.locked))
      )
        return;
      const at = point(event);
      if (tool === 'text') {
        if (!textDraft) {
          setTextDraft({
            x: clamp(at.x, 0, WIDTH - 12),
            y: clamp(at.y, 0, HEIGHT - textSize),
            value: '',
          });
          requestAnimationFrame(() => textEntryRef.current?.focus());
        }
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      if (celIllustrationMode && tool === 'select') {
        drawing.current = true;
        lastPoint.current = at;
        if (celRegionMode === 'rectangle') {
          clearCelRegionSelection();
          celRegionStart.current = at;
        } else if (celRegionMode === 'brush') {
          paintCelRegionStroke(at, at);
        } else {
          clearCelRegionSelection();
          celRegionLassoPoints.current = [at];
          redrawCelEditOverlay();
        }
        return;
      }
      if (celIllustrationMode && tool === 'layer-lasso') {
        const selected = celLayerSelection.current;
        const bounds = selected?.bounds;
        const inside =
          !!bounds &&
          at.x >= bounds.x - 18 &&
          at.x <= bounds.x + bounds.width + 18 &&
          at.y >= bounds.y - 18 &&
          at.y <= bounds.y + bounds.height + 18;
        if (
          selected &&
          selected.layerId === activeCelEditLayerId &&
          bounds &&
          inside
        ) {
          pushUndo();
          activeCelSelectionTransform.current = {
            start: { ...bounds },
            pointer: at,
            mode: transformModeAtPoint(bounds, at),
          };
        } else {
          clearCelLayerSelection();
          celLassoPoints.current = [at];
          redrawCelEditOverlay();
        }
        drawing.current = true;
        return;
      }
      if (celIllustrationMode && tool === 'transform') {
        const canvas = celEditCanvases.current.get(activeCelEditLayerId);
        const bounds = canvas
          ? celTransformBounds || canvasContentBounds(canvas)
          : null;
        if (!canvas || !bounds) {
          setMediaNotice({
            tone: 'error',
            text: 'The selected layer is empty, so there is nothing to transform.',
          });
          return;
        }
        pushUndo();
        activeCelTransform.current = {
          source: bounds,
          image: canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT),
          pointer: at,
          mode: transformModeAtPoint(bounds, at),
        };
        drawing.current = true;
        return;
      }
      drawing.current = true;
      lastPoint.current = at;
      if (tool === 'eyedropper') {
        previewEyedropper(at);
        return;
      }
      pushUndo();
      if (tool === 'smudge') beginSmudge(at);
      else if (tool === 'blur') applyEffectStroke(at, at);
      else drawLine(at, at);
    };
    const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (panning.current) {
        const viewport = stageViewportRef.current;
        if (!viewport) return;
        viewport.scrollLeft =
          panStart.current.scrollLeft - (event.clientX - panStart.current.x);
        viewport.scrollTop =
          panStart.current.scrollTop - (event.clientY - panStart.current.y);
        return;
      }
      if (!drawing.current) return;
      const next = point(event);
      if (celIllustrationMode && tool === 'select') {
        if (celRegionMode === 'rectangle') {
          const start = celRegionStart.current;
          applyCelRectangleSelection({
            x: Math.min(start.x, next.x),
            y: Math.min(start.y, next.y),
            width: Math.abs(next.x - start.x),
            height: Math.abs(next.y - start.y),
          });
        } else if (celRegionMode === 'brush') {
          paintCelRegionStroke(lastPoint.current, next);
        } else {
          const points = celRegionLassoPoints.current;
          const previous = points[points.length - 1];
          if (
            !previous ||
            Math.hypot(next.x - previous.x, next.y - previous.y) > 2
          )
            points.push(next);
          redrawCelEditOverlay();
        }
      } else if (
        celIllustrationMode &&
        tool === 'layer-lasso' &&
        activeCelSelectionTransform.current
      ) {
        redrawCelSelectionTransform(activeCelSelectionTransform.current, next);
      } else if (celIllustrationMode && tool === 'layer-lasso') {
        const points = celLassoPoints.current;
        const previous = points[points.length - 1];
        if (!previous || Math.hypot(next.x - previous.x, next.y - previous.y) > 2)
          points.push(next);
        redrawCelEditOverlay();
      } else if (
        celIllustrationMode &&
        tool === 'transform' &&
        activeCelTransform.current
      ) {
        redrawTransformedCelLayer(activeCelTransform.current, next);
      } else if (tool === 'eyedropper') previewEyedropper(next);
      else if (tool === 'smudge' || tool === 'blur')
        applyEffectStroke(lastPoint.current, next);
      else drawLine(lastPoint.current, next);
      lastPoint.current = next;
    };
    const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (
        drawing.current &&
        celIllustrationMode &&
        tool === 'select' &&
        celRegionMode === 'lasso'
      )
        finishCelRegionLasso();
      if (
        drawing.current &&
        celIllustrationMode &&
        tool === 'layer-lasso'
      ) {
        if (!activeCelSelectionTransform.current) finishCelLayerLasso();
        activeCelSelectionTransform.current = null;
      }
      if (
        drawing.current &&
        celIllustrationMode &&
        tool === 'transform'
      )
        activeCelTransform.current = null;
      if (tool === 'eyedropper' && eyedropperColor.current) {
        setBrushColor(eyedropperColor.current);
        setTool('brush');
      }
      drawing.current = false;
      panning.current = false;
      smudgeBufferRef.current = null;
      activeCelTransform.current = null;
      activeCelSelectionTransform.current = null;
      eyedropperColor.current = null;
      setEyedropperPreview(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (
        celIllustrationMode &&
        tool !== 'select' &&
        tool !== 'layer-lasso' &&
        tool !== 'pan'
      ) {
        const canvas = celEditCanvases.current.get(activeCelEditLayerId);
        setCelTransformBounds(canvas ? canvasContentBounds(canvas) : null);
      }
      render();
    };

    const addFrame = (duplicate = false) => {
      if (activeClip?.type !== 'cel') return;
      const id = uid('frame');
      const canvas = makeCanvas();
      const source = frameCanvases.current.get(activeFrameId);
      if (duplicate && source) canvas.getContext('2d')!.drawImage(source, 0, 0);
      frameCanvases.current.set(id, canvas);
      const index = activeFrameIndex + 1;
      setClips((items) => {
        const updated = items.map((clip) => {
          if (clip.id !== activeClip.id || clip.type !== 'cel') return clip;
          const frameIds = [
            ...clip.frameIds.slice(0, index),
            id,
            ...clip.frameIds.slice(index),
          ];
          return {
            ...clip,
            frameIds,
            duration: celDuration(
              frameIds.length,
              clip.exposure,
              clip.finalHold,
            ),
          };
        });
        return pushFollowingClips(updated, activeClip.id);
      });
      setActiveFrameId(id);
      setPlayhead(activeClip.start + index * activeClip.exposure);
    };
    const deleteFrame = () => {
      if (activeClip?.type !== 'cel') return;
      if (activeClip.frameIds.length === 1) {
        pushUndo();
        frameCanvases.current
          .get(activeFrameId)
          ?.getContext('2d')!
          .clearRect(0, 0, WIDTH, HEIGHT);
        render();
        return;
      }
      const next = activeClip.frameIds.filter((id) => id !== activeFrameId);
      frameCanvases.current.delete(activeFrameId);
      setClips((items) =>
        items.map((clip) =>
          clip.id === activeClip.id && clip.type === 'cel'
            ? {
                ...clip,
                frameIds: next,
                duration: celDuration(
                  next.length,
                  clip.exposure,
                  clip.finalHold,
                ),
              }
            : clip,
        ),
      );
      const index = clamp(activeFrameIndex, 0, next.length - 1);
      setActiveFrameId(next[index]);
      setPlayhead(activeClip.start + index * activeClip.exposure);
    };
    const addVisualTrack = () => {
      const track: Track = {
        id: uid('track'),
        name: `Visual ${tracks.filter((item) => item.kind === 'visual').length + 1}`,
        kind: 'visual',
        visible: true,
        locked: false,
      };
      setTracks((items) => [track, ...items]);
      setActiveTrackId(track.id);
      setActiveClipId('');
    };
    const addCelClip = () => {
      if (
        !selectedTrack ||
        selectedTrack.kind !== 'visual' ||
        selectedTrack.locked
      )
        return;
      const frameId = uid('frame');
      const duration = 2;
      const start = findForwardSlot(
        clips,
        selectedTrack.id,
        playhead,
        duration,
      );
      frameCanvases.current.set(frameId, makeCanvas());
      const clip: CelClip = {
        id: uid('cel'),
        type: 'cel',
        trackId: selectedTrack.id,
        name: `Cel ${clips.filter((item) => item.type === 'cel').length + 1}`,
        start,
        duration,
        opacity: 100,
        exposure: 2,
        finalHold: 0,
        frameIds: [frameId],
      };
      setClips((items) => [...items, clip]);
      setActiveClipId(clip.id);
      setActiveFrameId(frameId);
      setPlayhead(start);
    };
    const insertImageIntoActiveCel = (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number,
      layerName = 'Imported image',
    ) => {
      if (
        !celIllustrationMode &&
        (activeClip?.type !== 'cel' || activeTrack?.locked)
      )
        return false;
      let canvas = currentPaintCanvas();
      if (celIllustrationMode) {
        const layerId = addCelEditLayer(layerName.slice(0, 48));
        canvas = celEditCanvases.current.get(layerId) || null;
      }
      if (!canvas || sourceWidth <= 0 || sourceHeight <= 0) return false;
      const scale = Math.min(WIDTH / sourceWidth, HEIGHT / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      if (!celIllustrationMode) pushUndo();
      canvas
        .getContext('2d')!
        .drawImage(
          source,
          (WIDTH - width) / 2,
          (HEIGHT - height) / 2,
          width,
          height,
        );
      setAssetMenuOpen(false);
      render();
      return true;
    };
    const placeSharedPhoto = (asset: SharedPhotoAsset) =>
      new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          if (
            insertImageIntoActiveCel(
              image,
              image.naturalWidth,
              image.naturalHeight,
              asset.name,
            )
          )
            resolve();
          else
            reject(
              new Error('Select an unlocked cel before inserting a photo.'),
            );
        };
        image.onerror = () =>
          reject(new Error('The photo could not be decoded.'));
        image.src = asset.dataUrl;
      });
    const importStill = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file?.type.startsWith('image/')) return;
      try {
        const asset = await importSharedPhoto(file);
        await placeSharedPhoto(asset);
      } catch {
        /* Invalid image imports leave the selected cel unchanged. */
      }
    };
    const importIllustration = (drawing: IllustrationSource) => {
      const image = getIllustrationImage(drawing.id);
      if (!image) return;
      const canvas = makeCanvas();
      canvas.getContext('2d')!.putImageData(image, 0, 0);
      insertImageIntoActiveCel(canvas, WIDTH, HEIGHT, drawing.name);
    };
    const importAudio = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file?.type.startsWith('audio/')) return;
      const url = URL.createObjectURL(file);
      assetUrls.current.add(url);
      const audio = new Audio(url);
      const existingTrack =
        selectedTrack?.kind === 'audio'
          ? selectedTrack
          : tracks.find((track) => track.kind === 'audio');
      const track: Track = existingTrack || {
        id: uid('track-audio'),
        name: 'Audio',
        kind: 'audio',
        visible: true,
        locked: false,
      };
      if (!existingTrack) setTracks((items) => [...items, track]);
      const id = uid('audio');
      audioElements.current.set(id, audio);
      audio.onloadedmetadata = () => {
        const duration = Math.max(1, Math.ceil(audio.duration * fps));
        const start = findForwardSlot(clips, track.id, playhead, duration);
        const clip: AudioClip = {
          id,
          type: 'audio',
          trackId: track.id,
          name: file.name.replace(/\.[^.]+$/, ''),
          start,
          duration,
          volume: 100,
          url,
        };
        setClips((items) => [...items, clip]);
        setActiveTrackId(track.id);
        setActiveClipId(id);
        setPlayhead(start);
      };
    };
    const importVideo = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (
        !file ||
        (!/\.(mov|webm)$/i.test(file.name) &&
          !['video/quicktime', 'video/webm'].includes(file.type))
      )
        return;
      const track =
        selectedTrack?.kind === 'visual' && !selectedTrack.locked
          ? selectedTrack
          : null;
      if (!track) {
        setMediaNotice({
          tone: 'error',
          text: 'Select an unlocked visual track before importing a video.',
        });
        return;
      }
      const url = URL.createObjectURL(file);
      assetUrls.current.add(url);
      const video = document.createElement('video');
      const id = uid('video');
      video.preload = 'auto';
      video.playsInline = true;
      video.muted = true;
      video.src = url;
      videoElements.current.set(id, video);
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          setMediaNotice({
            tone: 'error',
            text: 'This video has no readable duration.',
          });
          return;
        }
        const duration = Math.max(1, Math.ceil(video.duration * fps));
        const start = findForwardSlot(clips, track.id, playhead, duration);
        const clip: VideoClip = {
          id,
          type: 'video',
          trackId: track.id,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Video',
          start,
          duration,
          opacity: 100,
          volume: 100,
          url,
          sourceOffset: 0,
        };
        setClips((items) => [...items, clip]);
        setActiveTrackId(track.id);
        setActiveClipId(id);
        setPlayhead(start);
        setMediaNotice({
          tone: 'success',
          text: `${file.name} was added to ${track.name}.`,
        });
        void seekVideo(video, 0).then(render);
      };
      video.onerror = () => {
        videoElements.current.delete(id);
        assetUrls.current.delete(url);
        URL.revokeObjectURL(url);
        setMediaNotice({
          tone: 'error',
          text: 'This browser could not decode that video. WebM works best; some MOV codecs are unsupported.',
        });
      };
      video.load();
    };
    const duplicateClip = () => {
      if (!activeClip) return;
      const id = uid(activeClip.type);
      const start = findForwardSlot(
        clips,
        activeClip.trackId,
        activeClip.start + activeClip.duration,
        activeClip.duration,
        activeClip.id,
      );
      let copy: Clip;
      if (activeClip.type === 'cel') {
        const frameIds = activeClip.frameIds.map((sourceId) => {
          const frameId = uid('frame');
          const canvas = makeCanvas();
          const source = frameCanvases.current.get(sourceId);
          if (source) canvas.getContext('2d')!.drawImage(source, 0, 0);
          frameCanvases.current.set(frameId, canvas);
          return frameId;
        });
        copy = {
          ...activeClip,
          id,
          name: `${activeClip.name} copy`,
          start,
          frameIds,
        };
      } else if (activeClip.type === 'still') {
        const canvas = makeCanvas();
        const source = stillCanvases.current.get(activeClip.id);
        if (source) canvas.getContext('2d')!.drawImage(source, 0, 0);
        stillCanvases.current.set(id, canvas);
        copy = { ...activeClip, id, name: `${activeClip.name} copy`, start };
      } else if (activeClip.type === 'video') {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.playsInline = true;
        video.muted = true;
        video.src = activeClip.url;
        videoElements.current.set(id, video);
        copy = { ...activeClip, id, name: `${activeClip.name} copy`, start };
      } else {
        audioElements.current.set(id, new Audio(activeClip.url));
        copy = { ...activeClip, id, name: `${activeClip.name} copy`, start };
      }
      setClips((items) => [...items, copy]);
      setActiveClipId(id);
      setPlayhead(start);
      if (copy.type === 'cel') setActiveFrameId(copy.frameIds[0]);
    };
    const splitClip = () => {
      if (
        !activeClip ||
        activeClip.type === 'audio' ||
        playhead <= activeClip.start ||
        playhead >= activeClip.start + activeClip.duration
      )
        return;
      const id = uid(activeClip.type);
      const leftDuration = playhead - activeClip.start;
      const rightDuration = activeClip.duration - leftDuration;
      if (activeClip.type === 'cel') {
        if (activeClip.frameIds.length < 2) return;
        const split = clamp(
          Math.ceil(leftDuration / activeClip.exposure),
          1,
          activeClip.frameIds.length - 1,
        );
        const leftFrames = activeClip.frameIds.slice(0, split);
        const rightFrames = activeClip.frameIds.slice(split);
        const splitAt =
          activeClip.start + leftFrames.length * activeClip.exposure;
        const left: CelClip = {
          ...activeClip,
          duration: celDuration(leftFrames.length, activeClip.exposure),
          finalHold: 0,
          frameIds: leftFrames,
        };
        const right: CelClip = {
          ...activeClip,
          id,
          name: `${activeClip.name} part 2`,
          start: splitAt,
          duration: celDuration(
            rightFrames.length,
            activeClip.exposure,
            activeClip.finalHold,
          ),
          frameIds: rightFrames,
        };
        setClips((items) => [
          ...items.filter((clip) => clip.id !== activeClip.id),
          left,
          right,
        ]);
        setActiveClipId(id);
        setActiveFrameId(right.frameIds[0]);
        setPlayhead(splitAt);
      } else if (activeClip.type === 'video') {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.playsInline = true;
        video.muted = true;
        video.src = activeClip.url;
        videoElements.current.set(id, video);
        const right: VideoClip = {
          ...activeClip,
          id,
          name: `${activeClip.name} part 2`,
          start: playhead,
          duration: rightDuration,
          sourceOffset: activeClip.sourceOffset + leftDuration / fps,
        };
        setClips((items) => [
          ...items.map((clip) =>
            clip.id === activeClip.id
              ? { ...activeClip, duration: leftDuration }
              : clip,
          ),
          right,
        ]);
        setActiveClipId(id);
      } else {
        const source = stillCanvases.current.get(activeClip.id);
        if (source) stillCanvases.current.set(id, source);
        const right: StillClip = {
          ...activeClip,
          id,
          name: `${activeClip.name} part 2`,
          start: playhead,
          duration: rightDuration,
        };
        setClips((items) => [
          ...items.map((clip) =>
            clip.id === activeClip.id
              ? { ...activeClip, duration: leftDuration }
              : clip,
          ),
          right,
        ]);
        setActiveClipId(id);
      }
    };
    const deleteClip = () => {
      if (!activeClip) return;
      if (activeClip.type === 'audio') {
        audioElements.current.get(activeClip.id)?.pause();
        audioElements.current.delete(activeClip.id);
      } else if (activeClip.type === 'video') {
        videoElements.current.get(activeClip.id)?.pause();
        videoElements.current.delete(activeClip.id);
      }
      setClips((items) => items.filter((clip) => clip.id !== activeClip.id));
      const fallback = clips.find((clip) => clip.id !== activeClip.id) || null;
      setActiveClipId(fallback?.id || '');
      if (fallback?.type === 'cel') setActiveFrameId(fallback.frameIds[0]);
    };
    const deleteTrack = () => {
      if (!selectedTrack) return;
      const removed = clips.filter((clip) => clip.trackId === selectedTrack.id);
      removed.forEach((clip) => {
        if (clip.type === 'cel')
          clip.frameIds.forEach((frameId) => {
            frameCanvases.current.delete(frameId);
            undoStacks.current.delete(frameId);
            redoStacks.current.delete(frameId);
          });
        else if (clip.type === 'still') stillCanvases.current.delete(clip.id);
        else if (clip.type === 'video') {
          videoElements.current.get(clip.id)?.pause();
          videoElements.current.delete(clip.id);
        } else {
          audioElements.current.get(clip.id)?.pause();
          audioElements.current.delete(clip.id);
        }
      });
      const nextTracks = tracks.filter(
        (track) => track.id !== selectedTrack.id,
      );
      const nextClips = clips.filter(
        (clip) => clip.trackId !== selectedTrack.id,
      );
      const fallbackTrack =
        nextTracks.find((track) => track.kind === 'visual') ||
        nextTracks[0] ||
        null;
      const fallbackClip = fallbackTrack
        ? nextClips.find((clip) => clip.trackId === fallbackTrack.id) || null
        : null;
      setTracks(nextTracks);
      setClips(nextClips);
      setActiveTrackId(fallbackTrack?.id || '');
      setActiveClipId(fallbackClip?.id || '');
      if (fallbackClip?.type === 'cel')
        setActiveFrameId(fallbackClip.frameIds[0]);
    };
    const moveTrack = (offset: -1 | 1) =>
      setTracks((items) => {
        const index = items.findIndex((track) => track.id === activeTrackId);
        const destination = index + offset;
        if (index < 0 || destination < 0 || destination >= items.length)
          return items;
        const reordered = [...items];
        [reordered[index], reordered[destination]] = [
          reordered[destination],
          reordered[index],
        ];
        return reordered;
      });
    const updateActive = (patch: Partial<Clip>) =>
      setClips((items) =>
        items.map((clip) =>
          clip.id === activeClipId ? ({ ...clip, ...patch } as Clip) : clip,
        ),
      );
    const updateClipDuration = (duration: number) =>
      setClips((items) =>
        pushFollowingClips(
          items.map((clip) =>
            clip.id === activeClipId ? { ...clip, duration } : clip,
          ),
          activeClipId,
        ),
      );
    const updateCelTiming = (
      patch: Partial<Pick<CelClip, 'exposure' | 'finalHold'>>,
    ) =>
      setClips((items) => {
        const updated = items.map((clip) => {
          if (clip.id !== activeClipId || clip.type !== 'cel') return clip;
          const exposure = patch.exposure ?? clip.exposure;
          const finalHold = patch.finalHold ?? clip.finalHold;
          return {
            ...clip,
            ...patch,
            exposure,
            finalHold,
            duration: celDuration(clip.frameIds.length, exposure, finalHold),
          };
        });
        return pushFollowingClips(updated, activeClipId);
      });
    const toggleTrack = (id: string, field: 'visible' | 'locked') =>
      setTracks((items) =>
        items.map((track) =>
          track.id === id ? { ...track, [field]: !track[field] } : track,
        ),
      );
    const beginDrag = (
      event: React.PointerEvent<HTMLElement>,
      clip: Clip,
      mode: ClipDrag['mode'],
    ) => {
      if (tool === 'agent-target') {
        event.preventDefault();
        event.stopPropagation();
        if (clip.type === 'cel') chooseAgentTarget(clip);
        else
          setMediaNotice({
            tone: 'error',
            text: 'Agent animation targets must be selected from a cel clip.',
          });
        return;
      }
      if (tracks.find((track) => track.id === clip.trackId)?.locked) return;
      event.stopPropagation();
      const host = event.currentTarget.closest('button');
      host?.setPointerCapture(event.pointerId);
      drag.current = {
        id: clip.id,
        mode,
        clientX: event.clientX,
        start: clip.start,
        duration: clip.duration,
        sourceOffset: clip.type === 'video' ? clip.sourceOffset : 0,
      };
      selectClip(clip);
    };
    const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
      const current = drag.current;
      if (!current) return;
      const delta = Math.round((event.clientX - current.clientX) / PX);
      setClips((items) =>
        items.map((clip) => {
          if (clip.id !== current.id) return clip;
          const blockers = trackBlockers(items, clip.trackId, clip.id);
          if (current.mode === 'move') {
            const preferred = Math.max(0, current.start + delta);
            const start =
              delta < 0
                ? findBackwardSlot(
                    items,
                    clip.trackId,
                    preferred,
                    clip.duration,
                    clip.id,
                  )
                : findForwardSlot(
                    items,
                    clip.trackId,
                    preferred,
                    clip.duration,
                    clip.id,
                  );
            return { ...clip, start };
          }
          if (current.mode === 'start') {
            const fixedEnd = current.start + current.duration;
            const previousEnd = Math.max(
              0,
              ...blockers
                .filter((other) => other.start < current.start)
                .map((other) => other.start + other.duration),
            );
            const start = clamp(
              Math.max(previousEnd, current.start + delta),
              0,
              fixedEnd - 1,
            );
            const resized = { ...clip, start, duration: fixedEnd - start };
            return clip.type === 'video'
              ? {
                  ...resized,
                  sourceOffset: Math.max(
                    0,
                    current.sourceOffset + (start - current.start) / fps,
                  ),
                }
              : resized;
          }
          const nextStart = Math.min(
            ...blockers
              .filter(
                (other) => other.start >= current.start + current.duration,
              )
              .map((other) => other.start),
            Number.POSITIVE_INFINITY,
          );
          return {
            ...clip,
            duration: Math.max(
              1,
              Math.min(current.duration + delta, nextStart - current.start),
            ),
          };
        }),
      );
    };
    const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
      const moved = drag.current;
      drag.current = null;
      if (moved?.id === agentTarget.clipId) {
        setAgentTarget({ clipId: '', trackId: '', startFrame: 0, endFrame: 1 });
        setAgentClipRequest(null);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const beginFrameEditorResize = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      frameEditorResize.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight: frameEditorHeight,
      };
    };
    const resizeFrameEditor = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      const current = frameEditorResize.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const nextHeight = current.startHeight + current.startY - event.clientY;
      setFrameEditorHeight(
        clamp(nextHeight, FRAME_EDITOR_MIN_HEIGHT, getMaxFrameEditorHeight()),
      );
    };
    const endFrameEditorResize = (
      event: React.PointerEvent<HTMLButtonElement>,
    ) => {
      if (frameEditorResize.current?.pointerId !== event.pointerId) return;
      frameEditorResize.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const resizeFrameEditorWithKeyboard = (
      event: React.KeyboardEvent<HTMLButtonElement>,
    ) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? 18 : -18;
      setFrameEditorHeight((height) =>
        clamp(
          height + delta,
          FRAME_EDITOR_MIN_HEIGHT,
          getMaxFrameEditorHeight(),
        ),
      );
    };
    const toggleTimeline = () => {
      if (frameEditorHeight < FRAME_EDITOR_ONE_TRACK_HEIGHT) {
        setFrameEditorHeight(
          Math.min(FRAME_EDITOR_DEFAULT_HEIGHT, getMaxFrameEditorHeight()),
        );
        setTimelineManuallyCollapsed(false);
        return;
      }
      setTimelineManuallyCollapsed((collapsed) => !collapsed);
    };
    const setPlayheadFromLane = (
      event: React.PointerEvent<HTMLDivElement>,
      trackId: string,
    ) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setPlaying(false);
      setActiveTrackId(trackId);
      setActiveClipId('');
      setPlayhead(
        clamp(
          Math.floor((event.clientX - rect.left) / PX),
          0,
          timelineFrames - 1,
        ),
      );
    };
    const saveFrame = () => {
      const canvas = makeCanvas();
      drawAt(canvas.getContext('2d')!, playhead);
      canvas.toBlob((blob) => {
        if (blob)
          download(blob, `${safeName(documentName)}-frame-${playhead + 1}.png`);
      }, 'image/png');
    };
    const exportAnimation = async (format: VideoExportFormat = 'webm') => {
      if (exporting) return;
      if (celIllustrationMode) {
        setMediaNotice({
          tone: 'error',
          text: 'Flatten the temporary cel layers before exporting the animation.',
        });
        return;
      }
      const requestedMime = supportedRecordingMime(format);
      if (format === 'mp4' && !requestedMime) {
        setMediaNotice({
          tone: 'error',
          text: 'MP4 export is not supported in this browser. Choose WebM instead.',
        });
        return;
      }
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

        if (
          !('MediaRecorder' in window) ||
          typeof canvas.captureStream !== 'function'
        ) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png'),
          );
          if (blob) download(blob, `${safeName(documentName)}-frame.png`);
          return;
        }

        const audibleClips = clips.filter(
          (clip): clip is AudioClip | VideoClip => {
            const track = tracks.find((item) => item.id === clip.trackId);
            return (
              (clip.type === 'audio' || clip.type === 'video') &&
              Boolean(track?.visible) &&
              clip.volume > 0
            );
          },
        );
        const exportVideos = clips.flatMap((clip) => {
          if (
            clip.type !== 'video' ||
            !tracks.find((track) => track.id === clip.trackId)?.visible ||
            clip.opacity <= 0
          )
            return [];
          const video = videoElements.current.get(clip.id);
          return video ? [{ clip, video }] : [];
        });
        await Promise.all(
          exportVideos.map(async ({ clip, video }) => {
            video.pause();
            video.muted = true;
            await seekVideo(video, clip.sourceOffset);
          }),
        );
        const canvasStream = canvas.captureStream(0);
        const canvasTrack =
          canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
        const streamTracks: MediaStreamTrack[] = [
          ...canvasStream.getVideoTracks(),
        ];
        let audioStartAt = 0;

        if (audibleClips.length) {
          audioContext = new AudioContext();
          await audioContext.resume();
          const destination = audioContext.createMediaStreamDestination();
          const decodedClips: {
            clip: AudioClip | VideoClip;
            buffer: AudioBuffer;
          }[] = [];

          for (const clip of audibleClips) {
            try {
              const response = await fetch(clip.url);
              if (!response.ok) continue;
              const buffer = await audioContext.decodeAudioData(
                await response.arrayBuffer(),
              );
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
            const duration = Math.max(
              0,
              Math.min(buffer.duration - offset, clip.duration / fps),
            );
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
        const mime = requestedMime || supportedRecordingMime('webm');
        const recorder = new MediaRecorder(mediaStream, {
          ...(mime ? { mimeType: mime } : {}),
          videoBitsPerSecond: 5_000_000,
          audioBitsPerSecond: 192_000,
        });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        const stopped = new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
        });

        recorder.start();
        if (audioContext && audioStartAt > audioContext.currentTime) {
          await new Promise((resolve) =>
            window.setTimeout(
              resolve,
              (audioStartAt - audioContext!.currentTime) * 1000,
            ),
          );
        }
        const exportStartedAt = performance.now();
        for (let frame = 0; frame < timelineFrames; frame += 1) {
          drawAt(context, frame);
          canvasTrack.requestFrame();
          await Promise.all(
            exportVideos
              .filter(({ clip }) => clip.start === frame)
              .map(async ({ video }) => {
                try {
                  await video.play();
                } catch {
                  /* Unsupported video playback leaves this clip transparent. */
                }
              }),
          );
          const nextFrameAt = exportStartedAt + ((frame + 1) * 1000) / fps;
          const delay = Math.max(0, nextFrameAt - performance.now());
          await new Promise((resolve) => window.setTimeout(resolve, delay));
          exportVideos
            .filter(({ clip }) => clip.start + clip.duration <= frame + 1)
            .forEach(({ video }) => video.pause());
        }
        recorder.stop();
        await stopped;
        const outputMime = recorder.mimeType || mime || `video/${format}`;
        download(
          new Blob(chunks, { type: outputMime }),
          `${safeName(documentName)}.${format}`,
        );
      } finally {
        scheduledSources.forEach((source) => {
          try {
            source.stop();
          } catch {}
        });
        videoElements.current.forEach((video) => video.pause());
        mediaStream?.getTracks().forEach((track) => track.stop());
        if (audioContext) await audioContext.close();
        setExporting(false);
      }
    };
    const exportWorkspace = async () => {
      if (exporting || celIllustrationMode) return;
      exportProject();
      await exportAnimation('webm');
    };
    const buildAgentSamples = (clip: CelClip, target: AgentTarget) => {
      const cadence = Math.max(1, Math.floor(fps * 0.5));
      const mandatory = new Set<number>([
        target.startFrame,
        target.endFrame - 1,
      ]);
      for (
        let frame = target.startFrame;
        frame < target.endFrame;
        frame += cadence
      )
        mandatory.add(frame);
      const changeCandidates = clip.frameIds.flatMap((_, index) => {
        const frame = Math.max(
          target.startFrame,
          clip.start + index * clip.exposure,
        );
        if (frame >= target.endFrame) return [];
        const previous = index
          ? Math.max(
              target.startFrame,
              clip.start + (index - 1) * clip.exposure,
            )
          : frame;
        return visualDifference(
          clipSource(clip, frame),
          clipSource(clip, previous),
        ) >= 0.035
          ? [
              {
                frame,
                score: visualDifference(
                  clipSource(clip, frame),
                  clipSource(clip, previous),
                ),
              },
            ]
          : [];
      });
      const selected = new Set(mandatory);
      changeCandidates
        .sort((a, b) => b.score - a.score)
        .some(({ frame }) => {
          if (selected.size >= 32) return true;
          selected.add(frame);
          return false;
        });
      const frames = [...selected].sort((a, b) => a - b).slice(0, 32);
      const contextFrames = new Set([
        frames[0],
        frames[Math.floor((frames.length - 1) / 2)],
        frames[frames.length - 1],
      ]);
      return frames.flatMap((timelineFrame): AgentFrameSample[] => {
        const source = clipSource(clip, timelineFrame);
        if (!source) return [];
        let contextImage: string | undefined;
        if (contextFrames.has(timelineFrame)) {
          const composite = makeCanvas();
          drawAt(composite.getContext('2d')!, timelineFrame);
          contextImage = sampledImage(composite);
        }
        return [
          {
            timelineFrame,
            timeSeconds: timelineFrame / fps,
            cel:
              clamp(
                Math.floor((timelineFrame - clip.start) / clip.exposure),
                0,
                clip.frameIds.length - 1,
              ) + 1,
            targetImage: sampledImage(source),
            contextImage,
          },
        ];
      });
    };
    const armAgentClipRequest = () => {
      const clip = targetClip;
      if (!clip) {
        setMediaNotice({
          tone: 'error',
          text: 'Choose the Agent target arrow, then select a cel clip in the timeline.',
        });
        return;
      }
      const startFrame = clamp(
        agentTarget.startFrame,
        clip.start,
        clip.start + clip.duration - 1,
      );
      const endFrame = clamp(
        agentTarget.endFrame,
        startFrame + 1,
        Math.min(clip.start + clip.duration, startFrame + fps * 12),
      );
      const normalized = {
        ...agentTarget,
        clipId: clip.id,
        trackId: clip.trackId,
        startFrame,
        endFrame,
      };
      const celTiming = clip.frameIds.flatMap((_, index): AgentCelTiming[] => {
        const startsAtFrame = Math.max(
          startFrame,
          clip.start + index * clip.exposure,
        );
        const naturalEnd =
          index === clip.frameIds.length - 1
            ? clip.start + clip.duration
            : clip.start + (index + 1) * clip.exposure;
        const endsAtFrame = Math.min(endFrame, naturalEnd);
        return endsAtFrame > startsAtFrame
          ? [
              {
                cel: index + 1,
                startsAtFrame,
                endsAtFrame,
                holdFrames: endsAtFrame - startsAtFrame,
              },
            ]
          : [];
      });
      const request: AgentClipRequest = {
        id: uid('animation-request'),
        target: {
          ...normalized,
          clipName: clip.name,
          durationFrames: endFrame - startFrame,
          durationSeconds: (endFrame - startFrame) / fps,
          celTiming,
          sourceRecipe: clip.agentRecipe || null,
        },
        samples: buildAgentSamples(clip, normalized),
        insertAboveTrackId: clip.trackId,
        insertAboveTrackName:
          tracks.find((track) => track.id === clip.trackId)?.name ||
          'target track',
      };
      setPlaying(false);
      setAgentTarget(normalized);
      setAgentClipResult(null);
      setAgentClipRequest(request);
      setMediaNotice({
        tone: 'success',
        text: `${request.samples.length} sampled frames are ready for the agent.`,
      });
    };
    const getAgentAnimationState = () => ({
      mode: 'animation',
      active,
      canvas: { width: WIDTH, height: HEIGHT },
      timeline: { fps, playhead, durationFrames: timelineFrames },
      tracks: tracks.map(({ id, name, kind, visible, locked }, order) => ({
        id,
        name,
        kind,
        visible,
        locked,
        order,
        stacking:
          kind === 'visual' ? 'Earlier visual tracks draw on top' : undefined,
      })),
      aiClipRequest: agentClipRequest
        ? {
            ready: true,
            requestId: agentClipRequest.id,
            prepared: preparedAgentRequestIds.current.has(agentClipRequest.id),
            target: agentClipRequest.target,
            sampledFrames: agentClipRequest.samples.map(
              ({ timelineFrame, timeSeconds, cel, contextImage }) => ({
                timelineFrame,
                timeSeconds,
                cel,
                hasCompositeContext: Boolean(contextImage),
              }),
            ),
            sampling: {
              method:
                'First and last frames, a mandatory sample at least every 0.5 seconds, plus visually changed cels; held and near-identical frames are skipped.',
              maxFrames: 32,
              isolatedTargetFrames: true,
              compositeContextFrames: agentClipRequest.samples.filter(
                (sample) => sample.contextImage,
              ).length,
            },
            insertAboveTrack: agentClipRequest.insertAboveTrackId
              ? {
                  id: agentClipRequest.insertAboveTrackId,
                  name: agentClipRequest.insertAboveTrackName,
                }
              : null,
            constraints: {
              outputDuration: 'Locked to the selected target range.',
              durationSeconds: agentClipRequest.target.durationSeconds,
              durationFrames: agentClipRequest.target.durationFrames,
              celFps: { min: 1, max: 24 },
              maxGeneratedCels: 48,
              maxTargetSeconds: 12,
              maxObjects: 48,
              canvasCoordinates: { width: WIDTH, height: HEIGHT },
              colours: 'Use #RRGGBB or "none" for fillColor and strokeColor.',
            },
            supportedShapes: {
              line: 'Exactly two canvas-coordinate points; strokeColor is required unless a default is acceptable.',
              path: 'Two or more canvas-coordinate points; set closed=true when a filled closed path is wanted.',
              rectangle:
                'x and y are the centre; width and height describe its size.',
              circle: 'x and y are the centre; radius describes its size.',
              polygon: 'Three or more canvas-coordinate points.',
            },
            motion:
              'Each keyframe uses a cel frame index plus optional translateX, translateY, scale, rotation in degrees, opacity 0–1, and easing: linear, ease-in, ease-out, or ease-in-out.',
            nextStep:
              "Call prepare_animation_edit with this requestId to receive the frozen isolated target frames and composite context frames. Then use the user's prompt as creative context and call insert_ai_cel_clip with the same requestId.",
          }
        : {
            ready: false,
            target: targetClip
              ? {
                  clipId: targetClip.id,
                  clipName: targetClip.name,
                  startFrame: agentTarget.startFrame,
                  endFrame: agentTarget.endFrame,
                  durationSeconds:
                    (agentTarget.endFrame - agentTarget.startFrame) / fps,
                }
              : null,
            userInstruction:
              'Tell the user to choose the Agent target arrow in Animate, select a cel clip, adjust the purple target range, and press Send sampled frames. Do not insert a clip until they do.',
            lastGeneratedClip: agentClipResult,
          },
    });
    const prepareAgentAnimationEdit = (input: Record<string, unknown>) => {
      if (!agentClipRequest)
        throw new Error(
          'No animation target is ready. Ask the user to choose the Agent target arrow, select a cel range, and press Send sampled frames.',
        );
      const requestId =
        typeof input.requestId === 'string' ? input.requestId.trim() : '';
      if (requestId !== agentClipRequest.id)
        throw new Error(
          'This animation target is stale. Inspect get_animation_state and use its exact requestId.',
        );
      preparedAgentRequestIds.current.add(requestId);
      return {
        prepared: true,
        requestId,
        target: agentClipRequest.target,
        frames: agentClipRequest.samples,
        sampling: {
          guaranteedMaximumGapSeconds: 0.5,
          adaptiveVisualChanges: true,
          maximumReferenceFrames: 32,
        },
        output: {
          placement: 'A new visual track directly above the target track.',
          durationFrames: agentClipRequest.target.durationFrames,
          durationSeconds: agentClipRequest.target.durationSeconds,
          maximumGeneratedCels: 48,
          originalClipIsPreserved: true,
        },
      };
    };
    const insertAgentCelClip = (input: Record<string, unknown>) => {
      if (!agentClipRequest)
        throw new Error(
          'No animation request is ready. Ask the user to press Send to agent in Animate first.',
        );
      const recipe = parseAgentClipRecipe(input, agentClipRequest, fps);
      if (recipe.requestId !== agentClipRequest.id)
        throw new Error(
          'This animation request is stale or belongs to a different request. Ask the user to press Send to agent again.',
        );
      if (!preparedAgentRequestIds.current.has(recipe.requestId))
        throw new Error(
          'Call prepare_animation_edit with this requestId before inserting an AI cel clip.',
        );

      const trackId = uid('track-ai');
      const clipId = uid('cel-ai');
      const frameIds = Array.from({ length: recipe.frameCount }, (_, frame) => {
        const frameId = uid(`frame-ai-${frame + 1}`);
        const canvas = makeCanvas();
        const context = canvas.getContext('2d')!;
        recipe.objects.forEach((shape) =>
          renderAgentShape(context, shape, frame),
        );
        frameCanvases.current.set(frameId, canvas);
        return frameId;
      });
      const track: Track = {
        id: trackId,
        name: `Agent — ${recipe.name}`,
        kind: 'visual',
        visible: true,
        locked: false,
      };
      const clip: CelClip = {
        id: clipId,
        type: 'cel',
        trackId,
        name: recipe.name,
        start: agentClipRequest.target.startFrame,
        duration: recipe.durationFrames,
        opacity: 100,
        exposure: recipe.exposure,
        finalHold: recipe.finalHold,
        frameIds,
        agentRecipe: recipe,
      };
      setTracks((items) => {
        const targetIndex = agentClipRequest.insertAboveTrackId
          ? items.findIndex(
              (item) => item.id === agentClipRequest.insertAboveTrackId,
            )
          : -1;
        if (targetIndex < 0) return [track, ...items];
        return [
          ...items.slice(0, targetIndex),
          track,
          ...items.slice(targetIndex),
        ];
      });
      setClips((items) => [...items, clip]);
      setActiveTrackId(trackId);
      setActiveClipId(clipId);
      setActiveFrameId(frameIds[0]);
      setPlayhead(agentClipRequest.target.startFrame);
      setTimelineManuallyCollapsed(false);
      setBottomDrawerCollapsed(false);
      preparedAgentRequestIds.current.delete(recipe.requestId);
      setAgentClipRequest(null);
      setAgentTarget({
        clipId,
        trackId,
        startFrame: clip.start,
        endFrame: clip.start + clip.duration,
      });
      setAgentClipResult({
        trackId,
        clipId,
        name: recipe.name,
        frameCount: recipe.frameCount,
      });
      setMediaNotice({
        tone: 'success',
        text: `${recipe.name} was rendered into ${recipe.frameCount} editable cels on a new track.`,
      });
      return {
        inserted: true,
        trackId,
        clipId,
        name: recipe.name,
        startFrame: clip.start,
        endFrame: clip.start + clip.duration,
        durationFrames: clip.duration,
        generatedCels: recipe.frameCount,
        exposure: recipe.exposure,
        finalHold: recipe.finalHold,
        actualCelFps: recipe.actualCelFps,
        originalClipPreserved: true,
        coloursPreserved: true,
      };
    };
    const removeAgentGeneratedTrack = () => {
      if (!agentClipResult) return;
      const removedClips = clips.filter(
        (clip) => clip.trackId === agentClipResult.trackId,
      );
      removedClips.forEach((clip) => {
        if (clip.type === 'cel')
          clip.frameIds.forEach((frameId) => {
            frameCanvases.current.delete(frameId);
            undoStacks.current.delete(frameId);
            redoStacks.current.delete(frameId);
          });
      });
      const nextTracks = tracks.filter(
        (track) => track.id !== agentClipResult.trackId,
      );
      const nextClips = clips.filter(
        (clip) => clip.trackId !== agentClipResult.trackId,
      );
      const fallbackTrack =
        nextTracks.find((track) => track.kind === 'visual') ||
        nextTracks[0] ||
        null;
      const fallbackClip = fallbackTrack
        ? nextClips.find((clip) => clip.trackId === fallbackTrack.id) || null
        : null;
      setTracks(nextTracks);
      setClips(nextClips);
      setActiveTrackId(fallbackTrack?.id || '');
      setActiveClipId(fallbackClip?.id || '');
      if (fallbackClip?.type === 'cel') {
        setActiveFrameId(fallbackClip.frameIds[0]);
        setAgentTarget({
          clipId: fallbackClip.id,
          trackId: fallbackClip.trackId,
          startFrame: fallbackClip.start,
          endFrame: Math.min(
            fallbackClip.start + fallbackClip.duration,
            fallbackClip.start + fps * 12,
          ),
        });
      } else
        setAgentTarget({ clipId: '', trackId: '', startFrame: 0, endFrame: 1 });
      setAgentClipResult(null);
      setMediaNotice({
        tone: 'success',
        text: 'The generated AI track was removed.',
      });
    };
    useImperativeHandle(ref, () => ({
      exportWorkspace,
      getAgentAnimationState,
      prepareAgentAnimationEdit,
      insertAgentCelClip,
      getCelIllustrationState,
      prepareCelIllustrationEdit,
      insertCelIllustrationResult,
      createCelIllustrationLayer: (name = 'Agent layer') => ({
        layerId: addCelEditLayer(name),
      }),
      setCelIllustrationTool,
      selectCelIllustrationRegion,
      mergeCelIllustrationLayerDown: mergeCelEditLayerDown,
      setCelIllustrationLayerVisibility,
    }));

    useEffect(() => {
      if (initialized.current) return;
      initialized.current = true;
      frameCanvases.current.set('animation-frame-1', makeCanvas());
    }, []);
    useEffect(() => {
      const fitFrameEditor = () =>
        setFrameEditorHeight((height) =>
          clamp(height, FRAME_EDITOR_MIN_HEIGHT, getMaxFrameEditorHeight()),
        );
      fitFrameEditor();
      window.addEventListener('resize', fitFrameEditor);
      return () => window.removeEventListener('resize', fitFrameEditor);
    }, []);
    useEffect(() => {
      const closeAssetMenu = (event: PointerEvent) => {
        if (
          assetMenuRef.current &&
          !assetMenuRef.current.contains(event.target as Node)
        )
          setAssetMenuOpen(false);
      };
      document.addEventListener('pointerdown', closeAssetMenu);
      return () => document.removeEventListener('pointerdown', closeAssetMenu);
    }, []);
    useEffect(() => {
      if (
        !celIllustrationMode &&
        (activeClip?.type !== 'cel' || activeTrack?.locked)
      )
        requestAnimationFrame(() => setAssetMenuOpen(false));
    }, [activeClip?.type, activeTrack?.locked, celIllustrationMode]);
    useEffect(() => {
      requestAnimationFrame(render);
    }, [render]);
    useEffect(() => {
      playheadRef.current = playhead;
    }, [playhead]);
    useEffect(() => {
      if (!playing) {
        if (playbackFrame.current !== null)
          cancelAnimationFrame(playbackFrame.current);
        playbackFrame.current = null;
        return;
      }
      playbackOrigin.current = {
        time: performance.now(),
        frame: playheadRef.current,
      };
      const loop = (time: number) => {
        const elapsed = Math.floor(
          ((time - playbackOrigin.current.time) / 1000) * fps,
        );
        setPlayhead((playbackOrigin.current.frame + elapsed) % timelineFrames);
        playbackFrame.current = requestAnimationFrame(loop);
      };
      playbackFrame.current = requestAnimationFrame(loop);
      return () => {
        if (playbackFrame.current !== null)
          cancelAnimationFrame(playbackFrame.current);
        playbackFrame.current = null;
      };
    }, [fps, playing, timelineFrames]);
    useEffect(() => {
      videoElements.current.forEach((video, id) => {
        const clip = clips.find((item) => item.id === id);
        const track = clip && tracks.find((item) => item.id === clip.trackId);
        if (
          !clip ||
          clip.type !== 'video' ||
          !track?.visible ||
          playhead < clip.start ||
          playhead >= clip.start + clip.duration
        ) {
          video.pause();
          return;
        }
        const target = clip.sourceOffset + (playhead - clip.start) / fps;
        video.volume = clip.volume / 100;
        if (!playing) {
          video.pause();
          video.muted = true;
          void seekVideo(video, target).then(render);
          return;
        }
        video.muted = false;
        if (Math.abs(video.currentTime - target) > 0.3)
          video.currentTime = target;
        if (video.paused) void video.play().catch(() => undefined);
      });
    }, [clips, fps, playhead, playing, render, tracks]);
    useEffect(() => {
      audioElements.current.forEach((audio, id) => {
        const clip = clips.find((item) => item.id === id);
        const track = clip && tracks.find((item) => item.id === clip.trackId);
        if (
          !playing ||
          !clip ||
          clip.type !== 'audio' ||
          !track?.visible ||
          playhead < clip.start ||
          playhead >= clip.start + clip.duration
        ) {
          audio.pause();
          return;
        }
        audio.volume = clip.volume / 100;
        if (audio.paused) {
          audio.currentTime = (playhead - clip.start) / fps;
          void audio.play().catch(() => undefined);
        }
      });
    }, [clips, fps, playhead, playing, tracks]);
    useEffect(() => {
      if (!active) return;
      const keydown = (event: KeyboardEvent) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'z'
        ) {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        } else if (
          (event.metaKey || event.ctrlKey) &&
          (event.key === '+' || event.key === '=')
        ) {
          event.preventDefault();
          zoomAt(zoomRef.current * 1.15);
        } else if ((event.metaKey || event.ctrlKey) && event.key === '-') {
          event.preventDefault();
          zoomAt(zoomRef.current / 1.15);
        } else if ((event.metaKey || event.ctrlKey) && event.key === '0') {
          event.preventDefault();
          zoomAt(82);
        } else if (
          event.key.toLowerCase() === 'h' &&
          !(event.target instanceof HTMLInputElement) &&
          !(event.target instanceof HTMLTextAreaElement)
        ) {
          setTool('pan');
        } else if (event.key === ' ') {
          event.preventDefault();
          setPlaying((value) => !value);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setPlaying(false);
          setPlayhead((value) => Math.max(0, value - 1));
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          setPlaying(false);
          setPlayhead((value) => Math.min(timelineFrames - 1, value + 1));
        }
      };
      window.addEventListener('keydown', keydown);
      return () => window.removeEventListener('keydown', keydown);
    });
    useEffect(
      () => () => {
        audioElements.current.forEach((audio) => audio.pause());
        videoElements.current.forEach((video) => video.pause());
        assetUrls.current.forEach((url) => URL.revokeObjectURL(url));
      },
      [],
    );

    return (
      <main
        className={`animator-shell ${active ? '' : 'mode-hidden'}`}
        data-tool={tool}
        aria-hidden={!active}
      >
        <header className="topbar animator-topbar">
          <div className="animator-brand">
            <div className="brand-mark">
              <Sparkles size={15} />
            </div>
            <strong>DUET</strong>
            <span>{celIllustrationMode ? 'CEL ILLUSTRATION' : 'ANIMATOR'}</span>
          </div>
          <div className="header-center">
            <div className="mode-switch" aria-label="Workspace mode">
              <button
                onClick={() => {
                  setPlaying(false);
                  onModeChange('illustration');
                }}
              >
                Illustrate
              </button>
              <button className="active">Animate</button>
            </div>
          </div>
          <div className="header-actions">
            <Button
              variant="ghost"
              size="sm"
              className="header-save-button"
              onClick={saveFrame}
              disabled={celIllustrationMode}
              aria-label="Save animation frame"
              title={
                celIllustrationMode
                  ? 'Flatten the cel layers before saving'
                  : 'Save frame'
              }
            >
              <Download />
              <span className="header-action-full">Save frame</span>
              <span className="header-action-short">Save</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                data-slot="button"
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="header-export-button"
                  />
                }
                disabled={exporting || celIllustrationMode}
                aria-label="Export animation video"
                title="Export video"
              >
                <Download />
                <span className="header-action-full">
                  {exporting ? 'Rendering…' : 'Export video'}
                </span>
                <span className="header-action-short">
                  {exporting ? 'Rendering…' : 'Export'}
                </span>
                <ChevronDown className="header-menu-chevron" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={7}
                className="video-export-menu"
              >
                <DropdownMenuItem
                  className="video-export-menu-item"
                  disabled={!mp4ExportSupported || exporting}
                  onClick={() => void exportAnimation('mp4')}
                  label="Export MP4"
                >
                  <Download />
                  <span>
                    <strong>MP4</strong>
                    <small>
                      {mp4ExportSupported
                        ? 'Most compatible'
                        : 'Not supported in this browser'}
                    </small>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="video-export-menu-item"
                  disabled={exporting}
                  onClick={() => void exportAnimation('webm')}
                  label="Export WebM"
                >
                  <Download />
                  <span>
                    <strong>WebM</strong>
                    <small>Best for web</small>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="export-button export-workspace-button"
              onClick={() => void exportWorkspace()}
              disabled={exporting || celIllustrationMode}
              title={
                celIllustrationMode
                  ? 'Flatten the cel layers before exporting'
                  : 'Download the animation and editable DUET project'
              }
              aria-label="Export workspace"
            >
              <Download />
              <span className="header-action-full">Export workspace</span>
              <span className="header-action-short">Workspace</span>
            </Button>
          </div>
        </header>
        <section
          className={`animator-workspace ${celIllustrationMode ? 'cel-illustration-workspace' : ''}`}
        >
          <aside
            className="animation-tool-rail"
            aria-label={
              celIllustrationMode
                ? 'Cel illustration tools'
                : 'Animation drawing tools'
            }
          >
            {(celIllustrationMode
              ? celIllustrationToolMeta
              : animationToolMeta
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={tool === id ? 'active' : ''}
                onClick={() => {
                  setTool(id);
                  setTextDraft(null);
                  setEyedropperPreview(null);
                  setMediaNotice(null);
                  if (id !== 'layer-lasso') clearCelLayerSelection();
                  if (celIllustrationMode && id === 'transform') {
                    const canvas = celEditCanvases.current.get(
                      activeCelEditLayerId,
                    );
                    setCelTransformBounds(
                      canvas ? canvasContentBounds(canvas) : null,
                    );
                  } else if (id === 'select') {
                    requestAnimationFrame(redrawCelEditOverlay);
                  } else if (id !== 'layer-lasso') {
                    celEditOverlayRef.current
                      ?.getContext('2d')
                      ?.clearRect(0, 0, WIDTH, HEIGHT);
                  }
                }}
                aria-label={
                  celIllustrationMode
                    ? label
                    : `Animation ${label.toLowerCase()}`
                }
                title={label}
              >
                <Icon />
              </button>
            ))}
            <span className="animation-rail-divider" />
            <label
              className="animation-color"
              title="Brush colour"
              aria-label="Brush colour"
            >
              <input
                type="color"
                value={brushColor}
                onChange={(event) => setBrushColor(event.target.value)}
              />
              <span style={{ background: brushColor }} />
            </label>
            <div ref={assetMenuRef} className="animation-asset-control">
              <button
                className={assetMenuOpen ? 'active' : ''}
                onClick={() => setAssetMenuOpen((open) => !open)}
                aria-label="Open shared image library"
                title={
                  celIllustrationMode ||
                  (activeClip?.type === 'cel' && !activeTrack?.locked)
                    ? 'Insert a photo or illustration into this cel'
                    : 'Select an unlocked cel first'
                }
                disabled={
                  !celIllustrationMode &&
                  (activeClip?.type !== 'cel' || activeTrack?.locked)
                }
              >
                <ImagePlus />
              </button>
              {assetMenuOpen && (
                <div className="animation-asset-menu">
                  <div className="import-menu-heading">
                    <strong>Images</strong>
                    <span>
                      {celIllustrationMode
                        ? 'Add as a new cel layer'
                        : 'Insert into selected cel'}
                    </span>
                  </div>
                  <button
                    className="import-action"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <ImagePlus />
                    Upload and insert photo
                  </button>
                  {photoLibrary.length ? (
                    <div className="photo-library">
                      {photoLibrary.map((photo) => (
                        <button
                          key={photo.id}
                          title={`Insert ${photo.name} into the selected cel`}
                          onClick={() => void placeSharedPhoto(photo)}
                        >
                          <span
                            className="animation-asset-thumb"
                            style={{ backgroundImage: `url(${photo.dataUrl})` }}
                          />
                          <span>{photo.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="photo-library-empty">
                      Photos imported in Illustrate will appear here too.
                    </p>
                  )}
                  <div className="import-menu-divider" />
                  <div className="import-menu-heading compact">
                    <strong>Illustrations</strong>
                    <span>Flattened into selected cel</span>
                  </div>
                  <div className="illustration-library">
                    {illustrations.map((drawing) => (
                      <button
                        key={drawing.id}
                        onClick={() => importIllustration(drawing)}
                      >
                        <span>
                          <Sparkles />
                          {drawing.name}
                        </span>
                        <small>960 × 640</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
          <div
            className={`animation-main hybrid ${celIllustrationMode ? 'cel-illustration-main' : ''}`}
            style={{
              gridTemplateRows: celIllustrationMode
                ? '40px minmax(0, 1fr)'
                : `40px minmax(160px, 1fr) ${bottomDrawerCollapsed ? 22 : frameEditorHeight}px`,
            }}
          >
            <div className="animation-context-bar">
              <strong>
                {tool === 'agent-target'
                  ? 'Agent target'
                  : tool === 'layer-lasso'
                    ? 'Layer lasso'
                    : tool === 'transform'
                      ? 'Transform layer'
                  : tool === 'pan'
                    ? 'Hand'
                    : tool[0].toUpperCase() + tool.slice(1)}
              </strong>
              {(
                ['brush', 'eraser', 'smudge', 'blur'] as AnimationTool[]
              ).includes(tool) && (
                <>
                  <span>Size</span>
                  <Slider
                    min={tool === 'smudge' || tool === 'blur' ? 8 : 2}
                    max={tool === 'smudge' || tool === 'blur' ? 160 : 96}
                    value={[
                      tool === 'smudge' || tool === 'blur'
                        ? Math.max(8, brushSize)
                        : brushSize,
                    ]}
                    onValueChange={(value) =>
                      setBrushSize(
                        Math.round(
                          Array.isArray(value) ? value[0] : Number(value),
                        ),
                      )
                    }
                  />
                  <code>
                    {tool === 'smudge' || tool === 'blur'
                      ? Math.max(8, brushSize)
                      : brushSize}
                    px
                  </code>
                </>
              )}
              {tool === 'brush' && (
                <>
                  <span>Opacity</span>
                  <Slider
                    min={1}
                    max={100}
                    value={[brushOpacity]}
                    onValueChange={(value) =>
                      setBrushOpacity(
                        Math.round(
                          Array.isArray(value) ? value[0] : Number(value),
                        ),
                      )
                    }
                  />
                  <code>{brushOpacity}%</code>
                </>
              )}
              {(tool === 'smudge' || tool === 'blur') && (
                <>
                  <span>Strength</span>
                  <Slider
                    min={1}
                    max={100}
                    value={[effectStrength]}
                    onValueChange={(value) =>
                      setEffectStrength(
                        Math.round(
                          Array.isArray(value) ? value[0] : Number(value),
                        ),
                      )
                    }
                  />
                  <code>{effectStrength}%</code>
                </>
              )}
              {tool === 'text' && (
                <>
                  <span>Font</span>
                  <select
                    value={textFont}
                    onChange={(event) =>
                      setTextFont(event.target.value as TextFont)
                    }
                  >
                    {textFonts.map((font) => (
                      <option key={font.id} value={font.id}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                  <span>Size</span>
                  <Slider
                    min={10}
                    max={180}
                    value={[textSize]}
                    onValueChange={(value) =>
                      setTextSize(
                        Math.round(
                          Array.isArray(value) ? value[0] : Number(value),
                        ),
                      )
                    }
                  />
                  <code>{textSize}px</code>
                  <em>Click the cel, type, then click away</em>
                </>
              )}
              {tool === 'select' && celIllustrationMode && (
                <>
                  <div className="selection-modes" aria-label="Selection shape">
                    <button
                      className={celRegionMode === 'rectangle' ? 'active' : ''}
                      title="Rectangle selection"
                      aria-label="Rectangle selection"
                      onClick={() => {
                        setCelRegionMode('rectangle');
                        clearCelRegionSelection();
                      }}
                    >
                      <SquareDashed />
                    </button>
                    <button
                      className={celRegionMode === 'brush' ? 'active' : ''}
                      title="Brush selection"
                      aria-label="Brush selection"
                      onClick={() => {
                        setCelRegionMode('brush');
                        clearCelRegionSelection();
                      }}
                    >
                      <Paintbrush />
                    </button>
                    <button
                      className={celRegionMode === 'lasso' ? 'active' : ''}
                      title="Lasso selection"
                      aria-label="Lasso selection"
                      onClick={() => {
                        setCelRegionMode('lasso');
                        clearCelRegionSelection();
                      }}
                    >
                      <LassoSelect />
                    </button>
                  </div>
                  {celRegionMode === 'brush' && (
                    <>
                      <span>Size</span>
                      <Slider
                        min={8}
                        max={180}
                        value={[celRegionBrushSize]}
                        onValueChange={(value) =>
                          setCelRegionBrushSize(
                            Math.round(
                              Array.isArray(value) ? value[0] : Number(value),
                            ),
                          )
                        }
                      />
                      <code>{celRegionBrushSize}px</code>
                    </>
                  )}
                  <em>
                    {celRegionMode === 'rectangle'
                      ? 'Drag a rectangle'
                      : celRegionMode === 'brush'
                        ? 'Paint the area to include'
                        : 'Draw around an area · release to close'}
                  </em>
                  <button
                    className="selection-clear"
                    onClick={clearCelRegionSelection}
                    title="Clear selection"
                    aria-label="Clear selection"
                  >
                    <X />
                  </button>
                </>
              )}
              {tool === 'eyedropper' && (
                <em>Press and drag over the canvas · release to choose</em>
              )}
              {tool === 'agent-target' && (
                <em>Click a cel clip in the timeline to target it</em>
              )}
              {tool === 'layer-lasso' && celIllustrationMode && (
                <>
                  {celSelectionBounds ? (
                    <span className="cel-lasso-actions">
                      <button onClick={cloneCelLayerSelection}>
                        <Copy /> Clone
                      </button>
                      <button onClick={deleteCelLayerSelection}>
                        <Trash2 /> Delete
                      </button>
                      <button
                        className="icon-only"
                        onClick={clearCelLayerSelection}
                        aria-label="Clear layer selection"
                      >
                        <X />
                      </button>
                    </span>
                  ) : (
                    <em>Draw around pixels, then drag or resize the selection</em>
                  )}
                </>
              )}
              {tool === 'transform' && celIllustrationMode && (
                <em>Drag the layer to move · drag a corner to resize</em>
              )}
              {tool === 'pan' && <em>Drag the canvas to move around</em>}
              <span className="animation-context-spacer" />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={undo}
                aria-label="Undo frame stroke"
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={redo}
                aria-label="Redo frame stroke"
              >
                <Redo2 />
              </Button>
              {celIllustrationMode ? (
                <Button
                  size="sm"
                  className="flatten-cel-button"
                  onClick={() => setFlattenDialogOpen(true)}
                >
                  <Merge />
                  <span>Flatten &amp; return</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="illustrate-cel-button"
                  onClick={enterCelIllustrationMode}
                  disabled={activeClip?.type !== 'cel' || activeTrack?.locked}
                  title={
                    activeClip?.type === 'cel' && !activeTrack?.locked
                      ? 'Edit this cel using temporary illustration layers'
                      : 'Select an unlocked cel first'
                  }
                >
                  <Layers3 />
                  <span>Illustrate cel</span>
                </Button>
              )}
            </div>
            <div ref={stageViewportRef} className="animation-stage">
              <div
                ref={canvasStageRef}
                className="animation-canvas-stage"
                style={{ width: `${zoom}%` }}
              >
                <div className="animation-canvas-wrap">
                  <canvas
                    ref={displayRef}
                    width={WIDTH}
                    height={HEIGHT}
                    className={`animation-canvas tool-${tool} ${playing || activeClip?.type !== 'cel' ? 'playing' : ''}`}
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={pointerUp}
                  />
                  {celIllustrationMode && (
                    <canvas
                      ref={celEditOverlayRef}
                      width={WIDTH}
                      height={HEIGHT}
                      className="cel-edit-overlay"
                      aria-hidden="true"
                    />
                  )}
                  {textDraft && (
                    <textarea
                      ref={textEntryRef}
                      className="text-entry"
                      aria-label="Text to add to this animation cel"
                      placeholder="Type here…"
                      spellCheck
                      value={textDraft.value}
                      style={{
                        left: `${(textDraft.x / WIDTH) * 100}%`,
                        top: `${(textDraft.y / HEIGHT) * 100}%`,
                        color: brushColor,
                        fontFamily: (
                          textFonts.find((font) => font.id === textFont) ||
                          textFonts[0]
                        ).family,
                        fontSize: `${(textSize / WIDTH) * 100}cqw`,
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setTextDraft({
                          ...textDraft,
                          value: event.target.value,
                        })
                      }
                      onBlur={() => commitText(true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          commitText(false);
                        }
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === 'Enter'
                        ) {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  )}
                  {eyedropperPreview && (
                    <div
                      className="eyedropper-preview"
                      style={{
                        left: `${(eyedropperPreview.x / WIDTH) * 100}%`,
                        top: `${(eyedropperPreview.y / HEIGHT) * 100}%`,
                      }}
                    >
                      <span
                        className="eyedropper-colour"
                        style={{ background: eyedropperPreview.color }}
                      >
                        <Pipette size={15} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="frame-counter">
                {celIllustrationMode ? (
                  <>
                    {activeClip?.name || 'Cel'} · cel {activeFrameIndex + 1}
                  </>
                ) : (
                  <>
                    {Math.floor(playhead / fps)}:
                    {String(playhead % fps).padStart(2, '0')} · frame{' '}
                    {playhead + 1}
                  </>
                )}
              </div>
            </div>
            {!celIllustrationMode && (
              <div
                className={`animation-bottom-drawer ${bottomDrawerCollapsed ? 'collapsed' : ''}`}
              >
              {bottomDrawerCollapsed ? (
                <button
                  className="drawer-expand-button"
                  onClick={() => setBottomDrawerCollapsed(false)}
                  aria-label="Expand playback and frame editor"
                >
                  <ChevronUp />
                  Show playback and frames
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="frame-editor-resizer"
                    aria-label="Resize playback and frame editor. Drag or use the arrow keys."
                    title="Drag to resize · Double-click to reset"
                    onPointerDown={beginFrameEditorResize}
                    onPointerMove={resizeFrameEditor}
                    onPointerUp={endFrameEditorResize}
                    onPointerCancel={endFrameEditorResize}
                    onKeyDown={resizeFrameEditorWithKeyboard}
                    onDoubleClick={() =>
                      setFrameEditorHeight(
                        Math.min(
                          FRAME_EDITOR_DEFAULT_HEIGHT,
                          getMaxFrameEditorHeight(),
                        ),
                      )
                    }
                  >
                    <GripHorizontal />
                  </button>
                  <div className="playback-bar">
                    <button
                      className="drawer-collapse-button"
                      onClick={() => {
                        setPlaying(false);
                        setBottomDrawerCollapsed(true);
                      }}
                      aria-label="Collapse playback and frame editor"
                    >
                      <ChevronDown />
                    </button>
                    <button
                      onClick={() => {
                        setPlaying(false);
                        setPlayhead(0);
                      }}
                      aria-label="Timeline start"
                    >
                      <SkipBack />
                    </button>
                    <button
                      onClick={() => {
                        setPlaying(false);
                        setPlayhead((value) => Math.max(0, value - 1));
                      }}
                      aria-label="Previous timeline frame"
                    >
                      <ChevronLeft />
                    </button>
                    <button
                      className="play-button"
                      onClick={() => setPlaying((value) => !value)}
                      aria-label={playing ? 'Pause' : 'Play'}
                    >
                      {playing ? <Pause /> : <Play />}
                    </button>
                    <button
                      onClick={() => {
                        setPlaying(false);
                        setPlayhead((value) =>
                          Math.min(timelineFrames - 1, value + 1),
                        );
                      }}
                      aria-label="Next timeline frame"
                    >
                      <ChevronRight />
                    </button>
                    <button
                      onClick={() => {
                        setPlaying(false);
                        setPlayhead(timelineFrames - 1);
                      }}
                      aria-label="Timeline end"
                    >
                      <SkipForward />
                    </button>
                    <span className="playback-separator" />
                    <label>
                      FPS{' '}
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={fps}
                        onChange={(event) =>
                          setFps(clamp(Number(event.target.value) || 1, 1, 24))
                        }
                      />
                    </label>
                    <button
                      className={onionSkin ? 'active' : ''}
                      onClick={() => setOnionSkin((value) => !value)}
                    >
                      <Ghost />
                      Onion skin
                    </button>
                  </div>
                  <div
                    className={`hybrid-timeline ${timelineCollapsed ? 'timeline-collapsed' : ''}`}
                  >
                    <div className="flipbook-strip">
                      <div className="flipbook-heading">
                        <span>
                          <Brush />
                          <strong>
                            {activeClip?.type === 'cel'
                              ? activeClip.name
                              : 'Select a cel clip'}
                          </strong>
                        </span>
                        {activeClip?.type === 'cel' && (
                          <span>
                            <button
                              onClick={() => selectOffset(-1)}
                              disabled={activeFrameIndex === 0}
                            >
                              <ChevronLeft />
                            </button>
                            <button onClick={() => addFrame(true)}>
                              <Copy />
                              Duplicate cel
                            </button>
                            <button onClick={deleteFrame}>
                              <Trash2 />
                            </button>
                            <button onClick={() => addFrame(false)}>
                              <Plus />
                              New cel
                            </button>
                          </span>
                        )}
                      </div>
                      {activeClip?.type === 'cel' ? (
                        <div className="cel-track">
                          {activeClip.frameIds.map((frameId, index) => (
                            <button
                              key={frameId}
                              className={
                                frameId === activeFrameId ? 'active' : ''
                              }
                              onClick={() => selectFrame(frameId, index)}
                            >
                              <canvas
                                ref={(node) => {
                                  if (node)
                                    thumbnailRefs.current.set(frameId, node);
                                  else thumbnailRefs.current.delete(frameId);
                                }}
                                width={96}
                                height={64}
                              />
                              <span>{index + 1}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p>
                          Select a cel clip below to draw its individual frames.
                        </p>
                      )}
                    </div>
                    <div
                      className={`sequence-timeline ${timelineCollapsed ? 'collapsed' : ''}`}
                    >
                      <div className="sequence-toolbar">
                        <span>
                          <button
                            className="timeline-collapse-button"
                            onClick={toggleTimeline}
                            aria-label={
                              timelineCollapsed
                                ? 'Expand timeline'
                                : 'Collapse timeline'
                            }
                            aria-expanded={!timelineCollapsed}
                          >
                            {timelineCollapsed ? (
                              <ChevronUp />
                            ) : (
                              <ChevronDown />
                            )}
                          </button>
                          <Film />
                          <strong>Timeline</strong>
                          <small>{(timelineFrames / fps).toFixed(1)}s</small>
                        </span>
                        <span>
                          <button
                            onClick={addVisualTrack}
                            title="Add visual track"
                          >
                            <Plus />
                            Track
                          </button>
                          <button
                            onClick={deleteTrack}
                            disabled={!selectedTrack}
                            title="Delete selected track"
                          >
                            <Trash2 />
                            Track
                          </button>
                          <button
                            onClick={() => moveTrack(-1)}
                            disabled={selectedTrackIndex <= 0}
                            title="Move selected track up"
                            aria-label="Move selected track up"
                          >
                            <ChevronUp />
                          </button>
                          <button
                            onClick={() => moveTrack(1)}
                            disabled={
                              selectedTrackIndex < 0 ||
                              selectedTrackIndex >= tracks.length - 1
                            }
                            title="Move selected track down"
                            aria-label="Move selected track down"
                          >
                            <ChevronDown />
                          </button>
                          <button
                            onClick={addCelClip}
                            disabled={
                              !selectedTrack ||
                              selectedTrack.kind !== 'visual' ||
                              selectedTrack.locked
                            }
                            title={
                              !selectedTrack
                                ? 'Select a visual track first'
                                : selectedTrack.kind !== 'visual'
                                  ? 'Cel clips need a visual track'
                                  : selectedTrack.locked
                                    ? 'Unlock this track to add a cel clip'
                                    : `Add cel clip to ${selectedTrack.name}`
                            }
                          >
                            <Plus />
                            Cel clip
                          </button>
                          <button
                            onClick={() => videoInputRef.current?.click()}
                            disabled={
                              !selectedTrack ||
                              selectedTrack.kind !== 'visual' ||
                              selectedTrack.locked
                            }
                            title={
                              !selectedTrack
                                ? 'Select a visual track first'
                                : selectedTrack.kind !== 'visual'
                                  ? 'Videos need a visual track'
                                  : selectedTrack.locked
                                    ? 'Unlock this track to import video'
                                    : `Import MOV or WebM to ${selectedTrack.name}`
                            }
                          >
                            <Video />
                            Video
                          </button>
                          <button
                            onClick={() => audioInputRef.current?.click()}
                          >
                            <Music2 />
                            Audio
                          </button>
                          <button
                            onClick={splitClip}
                            disabled={
                              !activeClip ||
                              activeClip.type === 'audio' ||
                              (activeClip.type === 'cel' &&
                                activeClip.frameIds.length < 2)
                            }
                          >
                            <Scissors />
                            Split
                          </button>
                          <button
                            onClick={duplicateClip}
                            disabled={!activeClip}
                          >
                            <Copy />
                          </button>
                          <button
                            onClick={deleteClip}
                            disabled={!activeClip}
                            title="Delete selected clip"
                          >
                            <Trash2 />
                          </button>
                        </span>
                      </div>
                      <div className="sequence-scroll">
                        <div
                          className="sequence-grid"
                          style={{ width: timelineFrames * PX + 132 }}
                        >
                          <div
                            className="time-ruler"
                            style={{
                              marginLeft: 132,
                              width: timelineFrames * PX,
                            }}
                          >
                            {seconds.map((second) => (
                              <span
                                key={second}
                                style={{ left: second * fps * PX }}
                              >
                                {second}s
                              </span>
                            ))}
                          </div>
                          {tracks.map((track) => (
                            <div
                              className={`track-row ${track.id === activeTrackId ? 'active' : ''}`}
                              key={track.id}
                            >
                              <div className="track-label">
                                <button
                                  onClick={() =>
                                    toggleTrack(track.id, 'visible')
                                  }
                                  aria-label={
                                    track.visible
                                      ? `Hide ${track.name}`
                                      : `Show ${track.name}`
                                  }
                                >
                                  {track.visible ? <Eye /> : <EyeOff />}
                                </button>
                                <button
                                  onClick={() =>
                                    toggleTrack(track.id, 'locked')
                                  }
                                  aria-label={
                                    track.locked
                                      ? `Unlock ${track.name}`
                                      : `Lock ${track.name}`
                                  }
                                >
                                  {track.locked ? <Lock /> : <Unlock />}
                                </button>
                                <button
                                  className="track-name"
                                  onClick={() => selectTrack(track.id)}
                                  aria-pressed={track.id === activeTrackId}
                                  title={`Select ${track.name} track`}
                                >
                                  {track.kind === 'audio' ? (
                                    <Music2 />
                                  ) : (
                                    <Film />
                                  )}
                                  <span>{track.name}</span>
                                </button>
                              </div>
                              <div
                                className="track-lane"
                                style={{ width: timelineFrames * PX }}
                                onPointerDown={(event) =>
                                  setPlayheadFromLane(event, track.id)
                                }
                              >
                                {clips
                                  .filter((clip) => clip.trackId === track.id)
                                  .map((clip) => (
                                    <button
                                      key={clip.id}
                                      className={`sequence-clip ${clip.type} ${clip.id === activeClipId ? 'active' : ''}`}
                                      style={{
                                        left: clip.start * PX,
                                        width: Math.max(clip.duration * PX, 20),
                                      }}
                                      onPointerDown={(event) =>
                                        beginDrag(event, clip, 'move')
                                      }
                                      onPointerMove={moveDrag}
                                      onPointerUp={endDrag}
                                      onPointerCancel={endDrag}
                                      title={
                                        clip.type === 'cel'
                                          ? `${clip.frameIds.length} cels · length follows cel timing`
                                          : clip.type === 'video'
                                            ? `${clip.name} · MOV/WebM video`
                                            : undefined
                                      }
                                    >
                                      {clip.type !== 'cel' && (
                                        <i
                                          className="clip-handle start"
                                          onPointerDown={(event) =>
                                            beginDrag(event, clip, 'start')
                                          }
                                        />
                                      )}
                                      <span>
                                        {clip.type === 'audio' ? (
                                          <Music2 />
                                        ) : clip.type === 'video' ? (
                                          <Video />
                                        ) : clip.type === 'cel' ? (
                                          <Brush />
                                        ) : (
                                          <ImagePlus />
                                        )}
                                        {clip.name}
                                      </span>
                                      {clip.type === 'audio' && (
                                        <b className="audio-wave">
                                          ▂▅▃▇▄▆▂▅▃▆▂▇
                                        </b>
                                      )}
                                      {clip.type !== 'cel' && (
                                        <i
                                          className="clip-handle end"
                                          onPointerDown={(event) =>
                                            beginDrag(event, clip, 'end')
                                          }
                                        />
                                      )}
                                    </button>
                                  ))}
                                {tool === 'agent-target' &&
                                  track.id === agentTarget.trackId &&
                                  targetClip && (
                                    <div
                                      className="agent-target-range"
                                      style={{
                                        left: agentTarget.startFrame * PX,
                                        width: Math.max(
                                          (agentTarget.endFrame -
                                            agentTarget.startFrame) *
                                            PX,
                                          18,
                                        ),
                                      }}
                                    >
                                      <button
                                        className="agent-target-handle start"
                                        onPointerDown={(event) =>
                                          beginAgentTargetDrag(event, 'start')
                                        }
                                        onPointerMove={moveAgentTargetDrag}
                                        onPointerUp={endAgentTargetDrag}
                                        onPointerCancel={endAgentTargetDrag}
                                        aria-label="Adjust Agent target start"
                                      />
                                      <button
                                        className="agent-target-body"
                                        onPointerDown={(event) =>
                                          beginAgentTargetDrag(event, 'move')
                                        }
                                        onPointerMove={moveAgentTargetDrag}
                                        onPointerUp={endAgentTargetDrag}
                                        onPointerCancel={endAgentTargetDrag}
                                        aria-label="Move Agent target range"
                                      >
                                        <span>Agent target</span>
                                      </button>
                                      <button
                                        className="agent-target-handle end"
                                        onPointerDown={(event) =>
                                          beginAgentTargetDrag(event, 'end')
                                        }
                                        onPointerMove={moveAgentTargetDrag}
                                        onPointerUp={endAgentTargetDrag}
                                        onPointerCancel={endAgentTargetDrag}
                                        aria-label="Adjust Agent target end"
                                      />
                                    </div>
                                  )}
                              </div>
                            </div>
                          ))}
                          <i
                            className="timeline-playhead"
                            style={{ left: 132 + playhead * PX }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              </div>
            )}
          </div>
          <aside className="animation-panel">
            {celIllustrationMode ? (
              <>
                <section className="ai-panel agent-bundle-panel cel-agent-panel">
                  <div className="panel-heading">
                    <div>
                      <WandSparkles />
                      <strong>Agent edit</strong>
                    </div>
                    <span>
                      {celAgentBundleReady
                        ? 'bundle ready'
                        : celAgentSelections.length
                          ? 'draft bundle'
                          : canEditCelWithAgent
                            ? 'selection ready'
                            : 'select a region'}
                    </span>
                  </div>
                  {celAgentBundleStatus === 'sent' ? (
                    <div className="agent-sent-hint">
                      <strong>
                        <Check /> Bundle ready for your agent
                      </strong>
                      <span>
                        One edit target and {celAgentContexts.length} context
                        reference{celAgentContexts.length === 1 ? '' : 's'} are
                        frozen and available through WebMCP.
                      </span>
                      <button type="button" onClick={markCelAgentBundleDraft}>
                        Edit bundle
                      </button>
                    </div>
                  ) : canEditCelWithAgent ? (
                    <div className="agent-ready-hint">
                      <strong>Selection ready to add.</strong>
                      <span>
                        Add this area to the agent request. Nothing is sent yet.
                      </span>
                      <Button
                        size="sm"
                        className="agent-add-button"
                        onClick={addCelSelectionToAgentBundle}
                        disabled={celAgentSelections.length >= 12}
                      >
                        <Plus />
                        {celAgentSelections.length >= 12
                          ? 'Bundle full'
                          : 'Add selection'}
                      </Button>
                    </div>
                  ) : (
                    <p className="tool-required-hint">
                      <strong>
                        {celAgentSelections.length
                          ? 'Select another area.'
                          : 'Select an area first.'}
                      </strong>{' '}
                      {celAgentSelections.length
                        ? 'Draw another region to add more visual context.'
                        : 'Choose Region select, then mark the part of this cel you want your agent to edit or reference.'}
                    </p>
                  )}
                  {celAgentSelections.length > 0 && (
                    <div
                      className={`agent-bundle ${celAgentBundleStatus === 'sent' ? 'locked' : ''}`}
                    >
                      <div className="agent-bundle-section agent-target-section">
                        <div className="agent-bundle-label">
                          <span>
                            <strong>Edit target</strong>
                            <small>
                              The agent edits this region and adds the result as
                              a new temporary layer.
                            </small>
                          </span>
                          <em>1 only</em>
                        </div>
                        <div className="agent-target-drop">
                          {celAgentTarget ? (
                            <div className="agent-selection-card target">
                              <span className="agent-target-icon">
                                <Focus />
                              </span>
                              <span
                                className="agent-selection-thumb"
                                style={{
                                  backgroundImage: `url(${celAgentTarget.previewDataUrl}), repeating-conic-gradient(#35323a 0 25%,#2a282f 0 50%)`,
                                }}
                                aria-hidden="true"
                              />
                              <span className="agent-selection-copy">
                                <strong>{celAgentTarget.name}</strong>
                                <small>
                                  {Math.round(celAgentTarget.selection.width)} ×{' '}
                                  {Math.round(celAgentTarget.selection.height)} ·{' '}
                                  {celAgentTarget.layerName}
                                </small>
                              </span>
                              <span className="agent-card-actions">
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeCelAgentSelection(celAgentTarget.id)
                                  }
                                  disabled={celAgentBundleStatus === 'sent'}
                                  aria-label={`Remove ${celAgentTarget.name}`}
                                >
                                  <X />
                                </button>
                              </span>
                            </div>
                          ) : (
                            <span>Select a region to create an edit target</span>
                          )}
                        </div>
                      </div>
                      <div className="agent-bundle-section agent-context-section">
                        <div className="agent-bundle-label">
                          <span>
                            <strong>Context references</strong>
                            <small>
                              These help the agent understand the cel. They will
                              not be edited.
                            </small>
                          </span>
                          <em>{celAgentContexts.length}</em>
                        </div>
                        <div className="agent-context-list">
                          {celAgentContexts.map((item, index) => (
                            <div
                              key={item.id}
                              className="agent-selection-card context"
                            >
                              <span className="agent-target-icon">
                                <Move />
                              </span>
                              <span
                                className="agent-selection-thumb"
                                style={{
                                  backgroundImage: `url(${item.previewDataUrl}), repeating-conic-gradient(#35323a 0 25%,#2a282f 0 50%)`,
                                }}
                                aria-hidden="true"
                              />
                              <span className="agent-selection-copy">
                                <strong>{item.name}</strong>
                                <small>
                                  {Math.round(item.selection.width)} ×{' '}
                                  {Math.round(item.selection.height)} ·{' '}
                                  {item.layerName}
                                </small>
                              </span>
                              <span className="agent-card-actions">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCelAgentTargetId(item.id);
                                    markCelAgentBundleDraft();
                                  }}
                                  title="Make edit target"
                                  aria-label={`Make ${item.name} the edit target`}
                                >
                                  <Focus />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveCelAgentContext(item.id, -1)
                                  }
                                  disabled={index === 0}
                                  aria-label={`Move ${item.name} up`}
                                >
                                  <ArrowUp />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveCelAgentContext(item.id, 1)}
                                  disabled={
                                    index === celAgentContexts.length - 1
                                  }
                                  aria-label={`Move ${item.name} down`}
                                >
                                  <ArrowDown />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeCelAgentSelection(item.id)
                                  }
                                  disabled={celAgentBundleStatus === 'sent'}
                                  aria-label={`Remove ${item.name}`}
                                >
                                  <X />
                                </button>
                              </span>
                            </div>
                          ))}
                          <div className="agent-context-end">
                            {celAgentContexts.length
                              ? 'Use the arrows to reorder context'
                              : 'Add more selections for context'}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="agent-send-button"
                        onClick={sendCelAgentBundle}
                        disabled={
                          !celAgentTarget || celAgentBundleStatus === 'sent'
                        }
                      >
                        <Send /> Send 1 target + {celAgentContexts.length}{' '}
                        reference{celAgentContexts.length === 1 ? '' : 's'}
                      </Button>
                    </div>
                  )}
                </section>
                <section className="layers-panel cel-workbench-layers">
                  <div className="panel-heading layer-heading">
                    <div>
                      <Layers3 />
                      <strong>Layers</strong>
                      <span className="layer-count">
                        {celEditLayers.length}
                      </span>
                    </div>
                    <div className="layer-actions">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Move layer up"
                        onClick={() => moveCelEditLayer(-1)}
                        disabled={activeCelEditLayerIndex <= 0}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Move layer down"
                        onClick={() => moveCelEditLayer(1)}
                        disabled={
                          activeCelEditLayerIndex < 0 ||
                          activeCelEditLayerIndex >= celEditLayers.length - 1
                        }
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="New layer"
                        onClick={() => addCelEditLayer()}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <p className="cel-session-warning">
                    These layers belong only to this editing session. Returning
                    to Animate permanently flattens them into one cel.
                  </p>
                  {activeCelEditLayer && (
                    <div className="opacity-row">
                      <span>Opacity</span>
                      <Slider
                        min={0}
                        max={100}
                        value={[activeCelEditLayer.opacity]}
                        onValueChange={(value) => {
                          const opacity = Math.round(
                            Array.isArray(value) ? value[0] : Number(value),
                          );
                          setCelEditLayers((items) =>
                            items.map((layer) =>
                              layer.id === activeCelEditLayer.id
                                ? { ...layer, opacity }
                                : layer,
                            ),
                          );
                        }}
                      />
                      <span>{activeCelEditLayer.opacity}%</span>
                    </div>
                  )}
                  <div className="layer-list">
                    {celEditLayers.map((layer) => (
                      <div
                        key={layer.id}
                        className={`layer-row ${activeCelEditLayerId === layer.id ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="visibility-toggle"
                          aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                          onClick={() => {
                            setCelEditLayers((items) =>
                              items.map((item) =>
                                item.id === layer.id
                                  ? { ...item, visible: !item.visible }
                                  : item,
                              ),
                            );
                          }}
                        >
                          {layer.visible ? <Eye /> : <EyeOff />}
                        </button>
                        <button
                          type="button"
                          className="cel-workbench-layer-select"
                          aria-label={`Select layer ${layer.name}`}
                          onClick={() => selectCelEditLayer(layer.id)}
                        >
                          <canvas
                            ref={(node) => {
                              if (node)
                                celLayerThumbnailRefs.current.set(layer.id, node);
                              else
                                celLayerThumbnailRefs.current.delete(layer.id);
                            }}
                            width={68}
                            height={50}
                            className="layer-thumb"
                            aria-hidden="true"
                          />
                          <span className="layer-name">
                            {layer.name}
                            <small>Pixel layer</small>
                          </span>
                          {activeCelEditLayerId === layer.id && (
                            <Check className="active-check" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="layer-footer">
                    <div className="layer-footer-main">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addCelEditLayer()}
                      >
                        <Plus /> New layer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={mergeCelEditLayerDown}
                        disabled={
                          activeCelEditLayerIndex < 0 ||
                          activeCelEditLayerIndex >= celEditLayers.length - 1
                        }
                      >
                        <Merge className="merge-down-icon" /> Merge down
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete layer"
                      onClick={deleteCelEditLayer}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {mediaNotice && (
                    <output
                      className={`animation-media-notice ${mediaNotice.tone}`}
                    >
                      {mediaNotice.text}
                    </output>
                  )}
                </section>
              </>
            ) : (
              <>
                <section className="animation-ai-panel">
              <div className="animation-ai-heading">
                <span>
                  <Sparkles />
                  <strong>Agent animation</strong>
                </span>
                <small>VECTOR + MOTION</small>
              </div>
              {tool !== 'agent-target' ? (
                <div className="animation-ai-tool-hint">
                  <MousePointer2 />
                  <span>
                    <strong>Choose Agent target</strong>
                    <small>
                      Select the arrow tool to choose a cel range for the agent.
                    </small>
                  </span>
                </div>
              ) : !targetClip ? (
                <p>
                  Click a cel clip in the timeline to choose the section your
                  agent should animate.
                </p>
              ) : (
                <>
                  <div className="animation-ai-target">
                    <strong>{targetClip.name}</strong>
                    <span>
                      Frames {agentTarget.startFrame + 1}–
                      {agentTarget.endFrame} ·{' '}
                      {(agentTargetDurationFrames / fps).toFixed(2)}s
                    </span>
                    <small>
                      Drag the purple range and handles in the timeline. Maximum
                      12 seconds.
                    </small>
                  </div>
                  <button
                    className="animation-ai-reselect"
                    onClick={reselectAgentTarget}
                  >
                    <MousePointer2 />
                    Select new target
                  </button>
                  {!agentClipRequest && !agentClipResult && (
                    <>
                      <p>
                        DUET will sample changed cels plus a frame at least every
                        0.5 seconds. Your original clip stays untouched.
                      </p>
                      <Button
                        size="sm"
                        className="animation-ai-send targeted"
                        onClick={armAgentClipRequest}
                      >
                        <Send />
                        Send sampled frames
                      </Button>
                    </>
                  )}
                  {agentClipRequest && (
                    <output className="animation-ai-ready">
                      <button
                        onClick={() => setAgentClipRequest(null)}
                        aria-label="Cancel Agent animation request"
                        title="Cancel request"
                      >
                        <X />
                      </button>
                      <strong>
                        {agentClipRequest.samples.length} sampled frames ready
                      </strong>
                      <span>
                        Ask your agent for a vector animation. It can inspect
                        isolated target frames plus{' '}
                        {
                          agentClipRequest.samples.filter(
                            (sample) => sample.contextImage,
                          ).length
                        }{' '}
                        composite context frames.
                      </span>
                      <small>
                        {agentClipRequest.target.durationFrames} frames · output
                        goes above {agentClipRequest.insertAboveTrackName}
                      </small>
                    </output>
                  )}
                  {agentClipResult && (
                    <output className="animation-ai-result">
                      <strong>
                        <Sparkles />
                        {agentClipResult.name} inserted
                      </strong>
                      <span>
                        {agentClipResult.frameCount} editable cels on a new
                        track.
                      </span>
                      <div>
                        <button onClick={removeAgentGeneratedTrack}>
                          <Undo2 />
                          Undo insert
                        </button>
                        <button onClick={reselectAgentTarget}>
                          <MousePointer2 />
                          New target
                        </button>
                      </div>
                    </output>
                  )}
                </>
              )}
                </section>
                {mediaNotice && (
                  <output
                    className={`animation-media-notice ${mediaNotice.tone}`}
                  >
                    {mediaNotice.text}
                  </output>
                )}
                <div className="animation-stat">
              <span>Playhead</span>
              <strong>{(playhead / fps).toFixed(2)}s</strong>
            </div>
            <div className="animation-stat">
              <span>Track</span>
              <strong>{selectedTrack?.name || 'None'}</strong>
            </div>
            <div className="animation-stat">
              <span>Clip</span>
              <strong>{activeClip?.name || 'None'}</strong>
            </div>
            {activeClip && activeClip.type !== 'audio' && (
              <label className="clip-property">
                <span>Opacity</span>
                <Slider
                  min={0}
                  max={100}
                  value={[activeClip.opacity]}
                  onValueChange={(value) =>
                    updateActive({
                      opacity: Math.round(
                        Array.isArray(value) ? value[0] : Number(value),
                      ),
                    })
                  }
                />
                <strong>{activeClip.opacity}%</strong>
              </label>
            )}
            {activeClip?.type === 'still' && (
              <label className="clip-property">
                <span>Duration</span>
                <input
                  type="number"
                  min={1}
                  value={activeClip.duration}
                  onChange={(event) =>
                    updateClipDuration(
                      Math.max(1, Number(event.target.value) || 1),
                    )
                  }
                />
                <strong>frames</strong>
              </label>
            )}
            {activeClip?.type === 'cel' && (
              <>
                <div className="clip-property calculated explained">
                  <span>Length on track</span>
                  <output>
                    {activeClip.frameIds.length} cels × {activeClip.exposure} +{' '}
                    {activeClip.finalHold}
                  </output>
                  <strong>{activeClip.duration} fr</strong>
                </div>
                <p className="cel-setting-help">
                  Total frames this cel clip occupies on its track.
                </p>
                <label
                  className="clip-property explained"
                  aria-describedby="cel-hold-help"
                >
                  <span>Cel hold</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={activeClip.exposure}
                    onChange={(event) =>
                      updateCelTiming({
                        exposure: clamp(Number(event.target.value) || 1, 1, 12),
                      })
                    }
                  />
                  <strong>fr/cel</strong>
                </label>
                <p id="cel-hold-help" className="cel-setting-help">
                  Frames each cel remains visible before the next cel.
                </p>
                <label
                  className="clip-property explained"
                  aria-describedby="end-hold-help"
                >
                  <span>End hold</span>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={activeClip.finalHold}
                    onChange={(event) =>
                      updateCelTiming({
                        finalHold: clamp(
                          Number(event.target.value) || 0,
                          0,
                          240,
                        ),
                      })
                    }
                  />
                  <strong>fr</strong>
                </label>
                <p id="end-hold-help" className="cel-setting-help">
                  Extra frames the final cel remains visible before this clip
                  ends.
                </p>
              </>
            )}
            {(activeClip?.type === 'audio' || activeClip?.type === 'video') && (
              <label className="clip-property">
                <span>Volume</span>
                <Slider
                  min={0}
                  max={100}
                  value={[activeClip.volume]}
                  onValueChange={(value) =>
                    updateActive({
                      volume: Math.round(
                        Array.isArray(value) ? value[0] : Number(value),
                      ),
                    })
                  }
                />
                <strong>{activeClip.volume}%</strong>
              </label>
            )}
                <div className="animation-shortcuts">
              <strong>Shortcuts</strong>
              <span>Space · Play / pause</span>
              <span>← → · Move playhead</span>
              <span>⌘Z · Undo cel stroke</span>
                </div>
              </>
            )}
          </aside>
          <input
            ref={imageInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={importStill}
          />
          <input
            ref={videoInputRef}
            className="hidden"
            type="file"
            accept=".mov,.webm,video/quicktime,video/webm"
            onChange={importVideo}
          />
          <input
            ref={audioInputRef}
            className="hidden"
            type="file"
            accept="audio/*"
            onChange={importAudio}
          />
        </section>
        <AlertDialog
          open={flattenDialogOpen}
          onOpenChange={setFlattenDialogOpen}
        >
          <AlertDialogContent className="flatten-cel-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Flatten cel layers?</AlertDialogTitle>
              <AlertDialogDescription>
                All visible layers will be compressed into one image for this
                cel. You can undo the resulting pixel change, but the individual
                layers cannot be recovered.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={flattenCelIllustration}>
                <Merge /> Flatten &amp; return
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    );
  },
);
