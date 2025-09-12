import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base64ToFile } from '../utils/fileUtils';
import { CloseIcon, UndoIcon, RectangleIcon, ArrowIcon, CircleIcon, TextIcon, PencilIcon, EraserIcon, SelectIcon, TrashIcon, RotateIcon, CropIcon } from './icons';

// --- Types ---
type AnnotationTool = 'select' | 'rectangle' | 'arrow' | 'circle' | 'text' | 'pencil' | 'eraser' | 'crop';
type LineWidth = 2 | 4 | 8;
type Action = 'none' | 'drawing' | 'moving' | 'resizing' | 'rotating' | 'cropping';
type HandleKey = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'rotate';

interface Point { x: number; y: number; }

interface Annotation {
  id: number;
  type: Exclude<AnnotationTool, 'eraser' | 'select' | 'crop'>;
  color: string;
  lineWidth: LineWidth;
  start: Point;
  end: Point;
  rotation: number; // in radians
  // Text specific
  text?: string;
  // Pencil specific
  points?: Point[];
}

interface Handle {
    key: HandleKey;
    position: Point;
    cursor: string;
}

interface TextEditingState {
  x: number; // canvas-space X
  y: number; // canvas-space Y
  sx: number; // screen-space X relative to <main>
  sy: number; // screen-space Y relative to <main>
  value: string;
  id?: number; // when editing existing text annotation
}

// --- Props ---
interface ImageAnnotatorProps {
  isOpen: boolean;
  onClose: () => void;
  imageFile: File | null;
  onSave: (newImageFile: File) => void;
}

// --- Constants ---
const HANDLE_SIZE = 8;
const colors = [
    { name: 'Red', value: '#ef4444' },
    { name: 'Black', value: '#000000ff' },    
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Purple', value: '#a855f7' },
];

// --- Geometry Helper Functions ---
const rotatePoint = (point: Point, center: Point, angle: number): Point => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = (point.x - center.x) * cos - (point.y - center.y) * sin + center.x;
    const ny = (point.x - center.x) * sin + (point.y - center.y) * cos + center.y;
    return { x: nx, y: ny };
};

const getAnnotationBounds = (annotation: Annotation): { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } => {
    let minX, minY, maxX, maxY;
    if (annotation.type === 'pencil' && annotation.points && annotation.points.length > 0) {
        minX = Math.min(...annotation.points.map(p => p.x));
        maxX = Math.max(...annotation.points.map(p => p.x));
        minY = Math.min(...annotation.points.map(p => p.y));
        maxY = Math.max(...annotation.points.map(p => p.y));
    } else {
        minX = Math.min(annotation.start.x, annotation.end.x);
        minY = Math.min(annotation.start.y, annotation.end.y);
        maxX = Math.max(annotation.start.x, annotation.end.x);
        maxY = Math.max(annotation.start.y, annotation.end.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const getAnnotationCenter = (annotation: Annotation): Point => {
    const bounds = getAnnotationBounds(annotation);
    return { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
};


const getAnnotationHandles = (annotation: Annotation): Handle[] => {
    const bounds = getAnnotationBounds(annotation);
    const { minX, minY, width, height } = bounds;
    const positions: Record<HandleKey, Point> = {
        nw: { x: minX, y: minY },
        n: { x: minX + width / 2, y: minY },
        ne: { x: minX + width, y: minY },
        w: { x: minX, y: minY + height / 2 },
        e: { x: minX + width, y: minY + height / 2 },
        sw: { x: minX, y: minY + height },
        s: { x: minX + width / 2, y: minY + height },
        se: { x: minX + width, y: minY + height },
        rotate: { x: minX + width / 2, y: minY - 20 },
    };
    const cursors: Record<HandleKey, string> = {
        nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
        w: 'ew-resize', e: 'ew-resize',
        sw: 'nesw-resize', s: 'ns-resize', se: 'nwse-resize',
        rotate: 'grab',
    }
    const center = getAnnotationCenter(annotation);
    return Object.keys(positions).map(key => ({
        key: key as HandleKey,
        position: rotatePoint(positions[key as HandleKey], center, annotation.rotation),
        cursor: cursors[key as HandleKey],
    }));
};

const isPointInsideAnnotation = (point: Point, annotation: Annotation, ctx: CanvasRenderingContext2D): boolean => {
    const center = getAnnotationCenter(annotation);
    const localPoint = rotatePoint(point, center, -annotation.rotation);
    
    if (annotation.type === 'text' && annotation.text) {
        const fontSize = 12 + annotation.lineWidth * 2;
        const lineHeight = fontSize * 1.2;
        const lines = annotation.text.split('\n');
        const textHeight = lines.length * lineHeight;
        ctx.font = `${fontSize}px sans-serif`;
        const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));

        const textBounds = {
            minX: annotation.start.x,
            minY: annotation.start.y,
            maxX: annotation.start.x + textWidth,
            maxY: annotation.start.y + textHeight
        }
        return localPoint.x >= textBounds.minX && localPoint.x <= textBounds.maxX &&
               localPoint.y >= textBounds.minY && localPoint.y <= textBounds.maxY;
    }

    const bounds = getAnnotationBounds(annotation);
    const buffer = annotation.lineWidth + 4; // Add a buffer for easier clicking
    return localPoint.x >= bounds.minX - buffer && localPoint.x <= bounds.maxX + buffer &&
           localPoint.y >= bounds.minY - buffer && localPoint.y <= bounds.maxY + buffer;
};


export const ImageAnnotator: React.FC<ImageAnnotatorProps> = ({ isOpen, onClose, imageFile, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [color, setColor] = useState<string>('#ef4444');
  const [lineWidth, setLineWidth] = useState<LineWidth>(4);
  const [history, setHistory] = useState<Annotation[]>([]);
  
  const [currentAction, setCurrentAction] = useState<Action>('none');
  const [activeHandleKey, setActiveHandleKey] = useState<HandleKey | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  
  const [textEditing, setTextEditing] = useState<TextEditingState | null>(null);

  const [cropRect, setCropRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const initialState = useRef<{ annotation: Annotation | null, mousePos: Point, cropRect: typeof cropRect }>({ annotation: null, mousePos: { x: 0, y: 0 }, cropRect: null });
  
  const [canvasCursor, setCanvasCursor] = useState('default');

  useEffect(() => {
    if (textEditing && textareaRef.current) {
        textareaRef.current.focus();
    }
  }, [textEditing]);

  useEffect(() => {
    if (!textEditing) return;
    const update = () => {
        const pos = canvasToMain({ x: textEditing.x, y: textEditing.y });
        setTextEditing(prev => prev ? { ...prev, sx: pos.x, sy: pos.y } : prev);
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [textEditing]);

  const getCropHandles = (rect: { x: number, y: number, width: number, height: number }): Omit<Handle, 'cursor'>[] => {
    const { x, y, width, height } = rect;
    return [
      { key: 'nw', position: { x, y } }, { key: 'n', position: { x: x + width / 2, y } }, { key: 'ne', position: { x: x + width, y } },
      { key: 'w', position: { x, y: y + height / 2 } }, { key: 'e', position: { x: x + width, y: y + height / 2 } },
      { key: 'sw', position: { x, y: y + height } }, { key: 's', position: { x: x + width / 2, y: y + height } }, { key: 'se', position: { x: x + width, y: y + height } },
    ] as Omit<Handle, 'cursor'>[];
  };

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    if (tool === 'crop' && cropRect) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        const { x, y, width, height } = cropRect;
        // Use path winding rule to fill the area *outside* the crop rectangle
        ctx.beginPath();
        // Outer rectangle (the entire canvas)
        ctx.rect(0, 0, canvas.width, canvas.height);
        // Inner rectangle (the crop area)
        ctx.rect(x, y, width, height);
        // Fill using the 'evenodd' rule, which creates a hole where the inner rectangle is.
        ctx.fill('evenodd');
        ctx.restore();

        // Draw border and handles for the crop area itself
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'white';
        getCropHandles(cropRect).forEach(handle => {
             ctx.fillRect(handle.position.x - HANDLE_SIZE / 2, handle.position.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        });
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    history.forEach(annotation => {
        const { id, type, text, points, rotation } = annotation;
        const center = getAnnotationCenter(annotation);

        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(rotation);
        ctx.translate(-center.x, -center.y);
        
        ctx.strokeStyle = annotation.color;
        ctx.fillStyle = annotation.color;
        ctx.lineWidth = annotation.lineWidth;
        const bounds = getAnnotationBounds(annotation);

        if (type === 'rectangle') {
            ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
        } else if (type === 'circle') {
            const radiusX = bounds.width / 2;
            const radiusY = bounds.height / 2;
            ctx.beginPath();
            ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (type === 'arrow') {
            const headlen = 4 + (ctx.lineWidth * 2);
            const from = annotation.start;
            const to = annotation.end;
            const dx = to.x - from.x; const dy = to.y - from.y;
            const angle = Math.atan2(dy, dx);
            ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
            ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(to.x, to.y);
            ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        } else if (type === 'pencil' && points && points.length > 0) {
            ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
            for(let i=1; i<points.length; ++i) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();
        } else if (type === 'text' && text) {
            const fontSize = 12 + (annotation.lineWidth * 2);
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textBaseline = 'top';
            const lines = text.split('\n');
            const lineHeight = fontSize * 1.2;
            lines.forEach((line, i) => {
                ctx.fillText(line, annotation.start.x, annotation.start.y + (i * lineHeight));
            });
        }

        if (id === selectedAnnotationId) {
            ctx.strokeStyle = 'rgba(60, 130, 255, 0.9)';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
            ctx.setLineDash([]);
            
            getAnnotationHandles(annotation).forEach(handle => {
                ctx.save();
                ctx.translate(handle.position.x, handle.position.y);
                ctx.rotate(-rotation);
                ctx.translate(-handle.position.x, -handle.position.y);
                ctx.fillStyle = handle.key === 'rotate' ? '#f59e0b' : 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(handle.position.x, handle.position.y, HANDLE_SIZE / 2, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        }
        ctx.restore();
    });
  }, [history, selectedAnnotationId, tool, cropRect]);

    useEffect(() => {
        if (!isOpen || !imageFile) { setHistory([]); setSelectedAnnotationId(null); setCropRect(null); return; }
        const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
        const img = new Image();
        img.onload = () => {
            const ar = img.width / img.height; const p = canvas.parentElement;
            if (p) {
                const maxW = p.clientWidth; const maxH = p.clientHeight;
                let newW = maxW; let newH = newW / ar;
                if (newH > maxH) { newH = maxH; newW = newH * ar; }
                canvas.width = newW; canvas.height = newH;
            } else { canvas.width = img.width; canvas.height = img.height; }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            imageRef.current = img; redrawCanvas();
        };
        img.src = URL.createObjectURL(imageFile);
        return () => { URL.revokeObjectURL(img.src); imageRef.current = null; }
    }, [isOpen, imageFile, redrawCanvas]);

  useEffect(redrawCanvas, [history, redrawCanvas]);
  
  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotationId === null) return;
    setHistory(history.filter(a => a.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId, history]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || textEditing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId !== null) {
        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
        e.preventDefault(); handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedAnnotationId, handleDeleteSelected, textEditing]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): Point => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

const canvasToMain = (p: Point): Point => {
  const canvas = canvasRef.current; const main = mainRef.current;
  if (!canvas || !main) return p;
  const cRect = canvas.getBoundingClientRect();
  const mRect = main.getBoundingClientRect();
  // ✅ account for scroll inside <main>
  return {
    x: p.x + (cRect.left - mRect.left) + main.scrollLeft,
    y: p.y + (cRect.top - mRect.top) + main.scrollTop,
  };
};


  const commitText = (text: string, position: Point) => {
    const val = text.trim();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;

    if (!val) { setTextEditing(null); return; }

    const fontSize = 12 + (lineWidth * 2);
    ctx.font = `${fontSize}px sans-serif`;
    const lines = val.split('\n');
    const lineHeight = fontSize * 1.2;
    const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const textHeight = lines.length * lineHeight;

    if (textEditing?.id) {
        const id = textEditing.id;
        setHistory(prev => prev.map(a => a.id === id ? { ...a, text: val, start: position, end: { x: position.x + textWidth, y: position.y + textHeight } } : a));
        setSelectedAnnotationId(id);
    } else {
        const newAnnotation: Annotation = {
            id: Date.now(), type: 'text', color, lineWidth, rotation: 0, text: val,
            start: position,
            end: { x: position.x + textWidth, y: position.y + textHeight },
        };
        setHistory(prev => [...prev, newAnnotation]);
        setTool('select');
        setSelectedAnnotationId(newAnnotation.id);
    }
    setTextEditing(null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textEditing) {
        commitText(textEditing.value, { x: textEditing.x, y: textEditing.y });
        return;
    }
    const mousePos = getCanvasPoint(e);

    if (tool === 'crop') {
        let clickedOnHandle: Omit<Handle,'cursor'> | null = null;
        if(cropRect) {
            clickedOnHandle = getCropHandles(cropRect).find(h => Math.hypot(h.position.x - mousePos.x, h.position.y - mousePos.y) < HANDLE_SIZE / 2 + 2) || null;
        }

        if(clickedOnHandle) {
            setActiveHandleKey(clickedOnHandle.key);
            setCurrentAction('resizing');
        } else if (cropRect && mousePos.x > cropRect.x && mousePos.x < cropRect.x + cropRect.width && mousePos.y > cropRect.y && mousePos.y < cropRect.y + cropRect.height) {
            setCurrentAction('moving');
        } else {
            setCurrentAction('cropping');
            setStartPoint(mousePos);
            setCropRect({ x: mousePos.x, y: mousePos.y, width: 0, height: 0 });
        }
        initialState.current = { annotation: null, mousePos, cropRect };
        return;
    }

    if (tool === 'text') {
        const base = { x: mousePos.x + 5, y: mousePos.y + 5 };
        const screen = canvasToMain(base);
        setTimeout(() => setTextEditing({ x: base.x, y: base.y, sx: screen.x, sy: screen.y, value: '' }), 0);
        return;
    }

    let clickedOnHandle: Handle | null = null;
    let clickedAnnotation: Annotation | null = null;

    if (selectedAnnotationId !== null) {
        const selectedAnn = history.find(a => a.id === selectedAnnotationId);
        if (selectedAnn) {
            const handles = getAnnotationHandles(selectedAnn);
            clickedOnHandle = handles.find(h => Math.hypot(h.position.x - mousePos.x, h.position.y - mousePos.y) < HANDLE_SIZE / 2 + 2) || null;
        }
    }

    if (clickedOnHandle) {
        const annotation = history.find(a => a.id === selectedAnnotationId)!;
        initialState.current = { annotation, mousePos, cropRect: null };
        setActiveHandleKey(clickedOnHandle.key);
        if (clickedOnHandle.key === 'rotate') setCurrentAction('rotating');
        else setCurrentAction('resizing');
    } else {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        for (let i = history.length - 1; i >= 0; i--) {
            if (isPointInsideAnnotation(mousePos, history[i], ctx)) {
                clickedAnnotation = history[i]; break;
            }
        }
        if (clickedAnnotation && tool === 'select') {
            setSelectedAnnotationId(clickedAnnotation.id);
            setCurrentAction('moving');
            initialState.current = { annotation: clickedAnnotation, mousePos, cropRect: null };
        } else if (tool !== 'select' && tool !== 'eraser') {
            setSelectedAnnotationId(null);
            setCurrentAction('drawing');
            setStartPoint(mousePos);
            if (tool === 'pencil') setCurrentPoints([mousePos]);
        } else if (tool === 'eraser' && clickedAnnotation) {
             const newHistory = history.filter(ann => ann.id !== clickedAnnotation.id);
             setHistory(newHistory);
        } else {
            setSelectedAnnotationId(null);
        }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mousePos = getCanvasPoint(e);

    if (tool === 'crop') {
        if (currentAction === 'cropping' && startPoint) {
            const x = Math.min(startPoint.x, mousePos.x);
            const y = Math.min(startPoint.y, mousePos.y);
            const width = Math.abs(startPoint.x - mousePos.x);
            const height = Math.abs(startPoint.y - mousePos.y);
            setCropRect({ x, y, width, height });
        } else if (currentAction === 'moving' && initialState.current.cropRect) {
            const dx = mousePos.x - initialState.current.mousePos.x;
            const dy = mousePos.y - initialState.current.mousePos.y;
            setCropRect({ ...initialState.current.cropRect, x: initialState.current.cropRect.x + dx, y: initialState.current.cropRect.y + dy });
        } else if (currentAction === 'resizing' && initialState.current.cropRect && activeHandleKey) {
             const { x, y, width, height } = initialState.current.cropRect;
             let newX = x, newY = y, newW = width, newH = height;
             const dx = mousePos.x - initialState.current.mousePos.x;
             const dy = mousePos.y - initialState.current.mousePos.y;
             if (activeHandleKey.includes('e')) newW += dx;
             if (activeHandleKey.includes('w')) { newW -= dx; newX += dx; }
             if (activeHandleKey.includes('s')) newH += dy;
             if (activeHandleKey.includes('n')) { newH -= dy; newY += dy; }
             setCropRect({ x: newX, y: newY, width: newW, height: newH });
        } else {
            // Set cursor for crop tool
            let newCursor = 'crosshair';
            if (cropRect) {
                const handle = getCropHandles(cropRect).find(h => Math.hypot(h.position.x - mousePos.x, h.position.y - mousePos.y) < HANDLE_SIZE / 2 + 2);
                const cursors: Record<HandleKey, string> = { nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', w: 'ew-resize', e: 'ew-resize', sw: 'nesw-resize', s: 'ns-resize', se: 'nwse-resize', rotate: '' };
                if (handle) newCursor = cursors[handle.key as HandleKey];
                else if (mousePos.x > cropRect.x && mousePos.x < cropRect.x + cropRect.width && mousePos.y > cropRect.y && mousePos.y < cropRect.y + cropRect.height) newCursor = 'move';
            }
            setCanvasCursor(newCursor);
        }
        return;
    }
    
    if (currentAction === 'none') {
        let newCursor = 'default';
        if (tool === 'select') newCursor = 'grab';
        if (['rectangle', 'circle', 'arrow', 'pencil'].includes(tool)) newCursor = 'crosshair';
        if (tool === 'text') newCursor = 'text';
        if (tool === 'eraser') newCursor = 'crosshair';

        const selectedAnn = history.find(a => a.id === selectedAnnotationId);
        if (selectedAnn) {
            const handles = getAnnotationHandles(selectedAnn);
            const hoveredHandle = handles.find(h => Math.hypot(h.position.x - mousePos.x, h.position.y - mousePos.y) < HANDLE_SIZE / 2 + 2);
            if (hoveredHandle) {
                newCursor = hoveredHandle.cursor;
            } else {
                const ctx = canvasRef.current?.getContext('2d');
                if (ctx && isPointInsideAnnotation(mousePos, selectedAnn, ctx)) newCursor = 'move';
            }
        }
        setCanvasCursor(newCursor);
        return;
    }

    if (currentAction === 'moving' && initialState.current.annotation) {
        const { annotation: ann, mousePos: startMouse } = initialState.current;
        const dx = mousePos.x - startMouse.x;
        const dy = mousePos.y - startMouse.y;
        const newHistory = history.map(a => a.id === ann.id ? {
            ...a,
            start: { x: a.start.x + dx, y: a.start.y + dy },
            end: { x: a.end.x + dx, y: a.end.y + dy },
            points: a.points?.map(p => ({ x: p.x + dx, y: p.y + dy })),
        } : a);
        setHistory(newHistory);
        initialState.current.mousePos = mousePos;
    } else if (currentAction === 'rotating' && initialState.current.annotation) {
        const { annotation: ann } = initialState.current;
        const center = getAnnotationCenter(ann);
        const angle = Math.atan2(mousePos.y - center.y, mousePos.x - center.x) + Math.PI / 2;
        setHistory(history.map(a => a.id === ann.id ? { ...a, rotation: angle } : a));
    } else if (currentAction === 'resizing' && initialState.current.annotation && activeHandleKey) {
        const { annotation: ann } = initialState.current;
        const handles = getAnnotationHandles(ann);
        const oppositeHandleKeyMap: Partial<Record<HandleKey, HandleKey>> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw', n: 's', s: 'n', w: 'e', e: 'w' };
        const oppositeHandleKey = oppositeHandleKeyMap[activeHandleKey];
        if (!oppositeHandleKey) return;
        
        const pivot = handles.find(h => h.key === oppositeHandleKey)!.position;
        const rotatedMousePos = rotatePoint(mousePos, pivot, -ann.rotation);
        const rotatedPivot = rotatePoint(pivot, pivot, -ann.rotation);

        const originalBounds = getAnnotationBounds(ann);
        const originalWidth = originalBounds.width;
        const originalHeight = originalBounds.height;
        const newWidth = Math.abs(rotatedMousePos.x - rotatedPivot.x);
        const newHeight = Math.abs(rotatedMousePos.y - rotatedPivot.y);

        const newStartUnrotated = {
            x: Math.min(rotatedPivot.x, rotatedMousePos.x),
            y: Math.min(rotatedPivot.y, rotatedMousePos.y)
        };
        const newCenterUnrotated = {
            x: newStartUnrotated.x + newWidth / 2,
            y: newStartUnrotated.y + newHeight / 2
        };
        const newCenter = rotatePoint(newCenterUnrotated, rotatedPivot, ann.rotation);

        const newStart = { x: newCenter.x - newWidth / 2, y: newCenter.y - newHeight / 2 };
        const newEnd = { x: newCenter.x + newWidth / 2, y: newCenter.y + newHeight / 2 };
        
        let updatedAnn = { ...ann, start: newStart, end: newEnd };
        
        if (updatedAnn.type === 'pencil' && updatedAnn.points && ann.points) {
            if (originalWidth > 0 && originalHeight > 0) {
                const scaleX = newWidth / originalWidth;
                const scaleY = newHeight / originalHeight;
                updatedAnn.points = ann.points.map(p => {
                    const localP = { x: p.x - originalBounds.minX, y: p.y - originalBounds.minY };
                    return {
                        x: newStart.x + localP.x * scaleX,
                        y: newStart.y + localP.y * scaleY
                    };
                });
            }
        }
        setHistory(history.map(a => a.id === ann.id ? updatedAnn : a));

    } else if (currentAction === 'drawing' && startPoint) {
        const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
        redrawCanvas(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
        const start = { x: Math.min(startPoint.x, mousePos.x), y: Math.min(startPoint.y, mousePos.y) };
        const end = { x: Math.max(startPoint.x, mousePos.x), y: Math.max(startPoint.y, mousePos.y) };
        const width = end.x-start.x; const height = end.y-start.y;
        if (tool === 'rectangle') ctx.strokeRect(startPoint.x, startPoint.y, mousePos.x - startPoint.x, mousePos.y - startPoint.y);
        else if (tool === 'circle') {
            ctx.beginPath();
            ctx.ellipse(start.x + width/2, start.y + height/2, width/2, height/2, 0, 0, 2*Math.PI);
            ctx.stroke();
        }
        else if (tool === 'arrow') {
            const headlen = 4 + (lineWidth * 2); const dx = mousePos.x - startPoint.x; const dy = mousePos.y - startPoint.y;
            const angle = Math.atan2(dy, dx); ctx.beginPath(); ctx.moveTo(startPoint.x, startPoint.y); ctx.lineTo(mousePos.x, mousePos.y);
            ctx.lineTo(mousePos.x - headlen * Math.cos(angle - Math.PI / 6), mousePos.y - headlen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(mousePos.x, mousePos.y); ctx.lineTo(mousePos.x - headlen * Math.cos(angle + Math.PI / 6), mousePos.y - headlen * Math.sin(angle + Math.PI / 6)); ctx.stroke();
        }
        else if (tool === 'pencil') {
            const newPoints = [...currentPoints, mousePos]; setCurrentPoints(newPoints);
            ctx.beginPath(); ctx.moveTo(newPoints[0].x, newPoints[0].y); newPoints.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
        }
    }
  };
  
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mousePos = getCanvasPoint(e);
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    for (let i = history.length - 1; i >= 0; i--) {
        const ann = history[i];
        if (isPointInsideAnnotation(mousePos, ann, ctx)) {
            if (ann.type === 'text') {
                const screen = canvasToMain(ann.start);
                setTextEditing({ x: ann.start.x, y: ann.start.y, sx: screen.x, sy: screen.y, value: ann.text || '', id: ann.id });
                setSelectedAnnotationId(ann.id);
            }
            break;
        }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'crop' && currentAction === 'resizing' && initialState.current.cropRect) {
        const mousePos = getCanvasPoint(e);
        const { x, y, width, height } = initialState.current.cropRect;
        let newX = x, newY = y, newW = width, newH = height;
        const dx = mousePos.x - initialState.current.mousePos.x;
        const dy = mousePos.y - initialState.current.mousePos.y;
        if (activeHandleKey.includes('e')) newW += dx;
        if (activeHandleKey.includes('w')) { newW -= dx; newX += dx; }
        if (activeHandleKey.includes('s')) newH += dy;
        if (activeHandleKey.includes('n')) { newH -= dy; newY += dy; }
        setCropRect({ x: newW > 0 ? newX : newX + newW, y: newH > 0 ? newY : newY + newH, width: Math.abs(newW), height: Math.abs(newH) });
    } else if (tool === 'crop' && currentAction === 'cropping' && startPoint) {
         const mousePos = getCanvasPoint(e);
         if (Math.abs(startPoint.x - mousePos.x) < 5 || Math.abs(startPoint.y - mousePos.y) < 5) {
            setCropRect(null); // too small, cancel
        }
    }

    if (currentAction === 'drawing' && startPoint) {
        const endPoint = getCanvasPoint(e);
        let newAnnotation: Annotation | null = null;
        if (tool === 'pencil') {
            newAnnotation = { id: Date.now(), type: 'pencil', color, lineWidth, rotation: 0, start: startPoint, end: endPoint, points: currentPoints };
        } else if (tool === 'arrow') {
            newAnnotation = { id: Date.now(), type: 'arrow', color, lineWidth, rotation: 0, start: startPoint, end: endPoint };
        } else if (tool !== 'eraser' && tool !== 'text' && tool !== 'select' && tool !== 'crop') {
            newAnnotation = { id: Date.now(), type: tool, color, lineWidth, rotation: 0, 
                start: startPoint, 
                end: endPoint,
            };
        }
        if (newAnnotation) setHistory([...history, newAnnotation]);
        setStartPoint(null); setCurrentPoints([]);
    }
    setCurrentAction('none');
    setActiveHandleKey(null);
  };

  const handleUndo = () => { setHistory(history.slice(0, -1)); };
  
  const handleSaveAnnotations = () => {
    const canvas = canvasRef.current; if (!canvas || !imageFile || !imageRef.current) return;
    const tempCanvas = document.createElement('canvas'); const tempCtx = tempCanvas.getContext('2d'); const originalImage = imageRef.current;
    if (!tempCtx) return;
    setSelectedAnnotationId(null);
    
    setTimeout(() => {
        tempCanvas.width = originalImage.naturalWidth; tempCanvas.height = originalImage.naturalHeight;
        const scaleX = originalImage.naturalWidth / canvas.width;
        const scaleY = originalImage.naturalHeight / canvas.height;
        
        tempCtx.drawImage(originalImage, 0, 0);
        tempCtx.lineCap = "round"; tempCtx.lineJoin = "round";
        
        history.forEach(ann => {
            const scaledAnn = { ...ann,
                start: { x: ann.start.x * scaleX, y: ann.start.y * scaleY },
                end: { x: ann.end.x * scaleX, y: ann.end.y * scaleY },
                points: ann.points?.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })),
                lineWidth: (ann.lineWidth * (scaleX + scaleY) / 2) as LineWidth
            };

            const center = getAnnotationCenter(scaledAnn);
            tempCtx.save();
            tempCtx.translate(center.x, center.y); tempCtx.rotate(scaledAnn.rotation); tempCtx.translate(-center.x, -center.y);
            tempCtx.strokeStyle = scaledAnn.color; tempCtx.fillStyle = scaledAnn.color; tempCtx.lineWidth = scaledAnn.lineWidth;
            
            const bounds = getAnnotationBounds({
                ...scaledAnn,
                start: ann.type !== 'arrow' ? { x: Math.min(scaledAnn.start.x, scaledAnn.end.x), y: Math.min(scaledAnn.start.y, scaledAnn.end.y) } : scaledAnn.start,
                end: ann.type !== 'arrow' ? { x: Math.max(scaledAnn.start.x, scaledAnn.end.x), y: Math.max(scaledAnn.start.y, scaledAnn.end.y) } : scaledAnn.end
            });
            
            if (scaledAnn.type === 'rectangle') {
                tempCtx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
            } else if (scaledAnn.type === 'circle') {
                const radiusX = bounds.width / 2; const radiusY = bounds.height / 2;
                tempCtx.beginPath(); tempCtx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, 2 * Math.PI); tempCtx.stroke();
            } else if (scaledAnn.type === 'arrow') {
                const headlen = 4 + (tempCtx.lineWidth * 2); const from = scaledAnn.start; const to = scaledAnn.end;
                const dx = to.x - from.x; const dy = to.y - from.y; const angle = Math.atan2(dy, dx);
                tempCtx.beginPath(); tempCtx.moveTo(from.x, from.y); tempCtx.lineTo(to.x, to.y);
                tempCtx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
                tempCtx.moveTo(to.x, to.y);
                tempCtx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
                tempCtx.stroke();
            } else if (scaledAnn.type === 'pencil' && scaledAnn.points) {
                tempCtx.beginPath(); tempCtx.moveTo(scaledAnn.points[0].x, scaledAnn.points[0].y);
                for(let i=1; i<scaledAnn.points.length; ++i) tempCtx.lineTo(scaledAnn.points[i].x, scaledAnn.points[i].y);
                tempCtx.stroke();
            } else if (scaledAnn.type === 'text' && scaledAnn.text) {
                const fontSize = (12 + (ann.lineWidth * 2)) * scaleY;
                tempCtx.font = `${fontSize}px sans-serif`;
                tempCtx.textBaseline = 'top';
                const lines = scaledAnn.text.split('\n');
                const lineHeight = fontSize * 1.2;
                lines.forEach((line, i) => {
                    tempCtx.fillText(line, scaledAnn.start.x, scaledAnn.start.y + (i * lineHeight));
                });
            }
            tempCtx.restore();
        });
        
        const dataUrl = tempCanvas.toDataURL(imageFile.type);
        const newFile = base64ToFile(dataUrl, `annotated_${imageFile.name}`, imageFile.type, Date.now());
        onSave(newFile);
    }, 50);
  };
  
  const handleApplyCrop = useCallback(() => {
    const canvas = canvasRef.current; const image = imageRef.current;
    if (!cropRect || !canvas || !image || !imageFile) return;
    
    const scaleX = image.naturalWidth / canvas.width;
    const scaleY = image.naturalHeight / canvas.height;

    const sourceX = cropRect.x * scaleX;
    const sourceY = cropRect.y * scaleY;
    const sourceWidth = cropRect.width * scaleX;
    const sourceHeight = cropRect.height * scaleY;

    if (sourceWidth < 1 || sourceHeight < 1) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sourceWidth;
    tempCanvas.height = sourceHeight;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    
    const dataUrl = tempCanvas.toDataURL(imageFile.type);
    const newFile = base64ToFile(dataUrl, `cropped_${imageFile.name}`, imageFile.type, Date.now());
    
    // Reset state and save the new file. The parent component will pass the new file back as a prop,
    // which will trigger the useEffect to reload the canvas.
    setHistory([]);
    setSelectedAnnotationId(null);
    setCropRect(null);
    setTool('select');
    onSave(newFile);

  }, [cropRect, imageFile, onSave]);

  const handleCancelCrop = () => {
    setCropRect(null);
    setTool('select');
  };

  if (!isOpen) return null;

  const tools: { name: AnnotationTool; icon: JSX.Element }[] = [
    { name: 'select', icon: <SelectIcon /> }, { name: 'crop', icon: <CropIcon/> }, { name: 'rectangle', icon: <RectangleIcon /> }, { name: 'circle', icon: <CircleIcon /> },
    { name: 'arrow', icon: <ArrowIcon /> }, { name: 'pencil', icon: <PencilIcon /> }, { name: 'text', icon: <TextIcon /> }, { name: 'eraser', icon: <EraserIcon /> },
  ];
  const lineSizes: { value: LineWidth, label: string }[] = [{ value: 2, label: 'S' }, { value: 4, label: 'M' }, { value: 8, label: 'L' }];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true">
        <div className="bg-slate-800 rounded-lg shadow-2xl w-full h-full flex flex-col" onClick={e => e.stopPropagation()}>
            <header className="flex-shrink-0 bg-slate-900 p-2 flex flex-wrap items-center justify-between gap-4 text-white border-b border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-md">
                      {tools.map(({ name, icon }) => (
                          <button key={name} onClick={() => { setTool(name); setSelectedAnnotationId(null); if (textEditing) commitText(textEditing.value, {x: textEditing.x, y: textEditing.y}); }} className={`p-2 rounded-md transition-colors ${tool === name ? 'bg-primary text-white' : 'hover:bg-slate-700'}`} title={name.charAt(0).toUpperCase() + name.slice(1)}>{icon}</button>
                      ))}
                  </div>
                  <div className="h-8 w-px bg-slate-700"></div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        {colors.map(c => (<button key={c.value} onClick={() => setColor(c.value)} style={{ backgroundColor: c.value }} className={`w-6 h-6 rounded-full ring-offset-2 ring-offset-slate-900 ${color === c.value ? 'ring-2 ring-white' : ''}`} title={c.name} />))}
                    </div>
                     <div className="flex items-center gap-1 p-1 bg-slate-800 rounded-md">
                      {lineSizes.map(size => (<button key={size.value} onClick={() => setLineWidth(size.value)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${lineWidth === size.value ? 'bg-primary text-white' : 'hover:bg-slate-700'}`} title={`${size.label} size`}>{size.label}</button>))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleUndo} disabled={history.length === 0 || tool === 'crop'} className="p-2 rounded-md hover:bg-slate-700 disabled:opacity-50" title="Undo"><UndoIcon /></button>
                    <button onClick={handleDeleteSelected} disabled={selectedAnnotationId === null} className="p-2 rounded-md hover:bg-slate-700 disabled:opacity-50 text-red-400 hover:text-red-500" title="Delete Selected"><TrashIcon /></button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md hover:bg-slate-700">Cancel</button>
                    <button onClick={handleSaveAnnotations} className="px-4 py-2 text-sm font-semibold rounded-md bg-primary hover:bg-secondary">Save Changes</button>
                </div>
            </header>
            <main ref={mainRef} className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/50 relative">
                <canvas ref={canvasRef} className="max-w-full max-h-full object-contain rounded-md shadow-lg" 
                    style={{ cursor: canvasCursor, zIndex: 0 }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onDoubleClick={handleDoubleClick}
                    onMouseLeave={() => { if (currentAction !== 'none') handleMouseUp(new MouseEvent('mouseup') as any); }}
                />
                 {textEditing && (
                    <textarea
                        ref={textareaRef}
                        value={textEditing.value}
                        onChange={(e) => {
                            setTextEditing({ ...textEditing, value: e.target.value });
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        onBlur={() => commitText(textEditing.value, { x: textEditing.x, y: textEditing.y })}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') setTextEditing(null);
                            if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
                                commitText(textEditing.value, { x: textEditing.x, y: textEditing.y });
                            }
                        }}
                        style={{
                            position: 'absolute',
                            left: `${textEditing.sx}px`,
                            top: `${textEditing.sy}px`,
                            fontSize: `${12 + lineWidth * 2}px`,
                            lineHeight: 1.2,
                            fontFamily: 'sans-serif',
                            color: color,
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: `1px solid ${color}`,
                            outline: 'none',
                            padding: '4px',
                            minWidth: '100px',
                            minHeight: '1.2em',
                            resize: 'none',
                            overflow: 'hidden',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                            borderRadius: '4px',
                            zIndex: 100,
                        }}
                    />
                )}
                {tool === 'crop' && cropRect && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-slate-800 p-2 rounded-lg shadow-lg flex items-center gap-2">
                        <button onClick={handleCancelCrop} className="px-4 py-2 text-sm font-semibold text-white rounded-md hover:bg-slate-700">Cancel</button>
                        <button onClick={handleApplyCrop} className="px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:bg-secondary">Apply Crop</button>
                    </div>
                )}
            </main>
        </div>
    </div>
  );
};