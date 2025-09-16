import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base64ToFile } from '../utils/fileUtils';
import { CloseIcon, UndoIcon, RedoIcon, RectangleIcon, ArrowIcon, CircleIcon, TextIcon, PencilIcon, EraserIcon, SelectIcon, TrashIcon, RotateIcon, CropIcon, BlurIcon, NumberIcon } from './icons';
import { useHistory as useAnnotationHistory } from '../hooks/useHistory';

// --- Types ---
type AnnotationTool = 'select' | 'rectangle' | 'arrow' | 'circle' | 'text' | 'pencil' | 'eraser' | 'crop' | 'blur' | 'number';
type Action = 'none' | 'drawing' | 'moving' | 'resizing' | 'rotating' | 'cropping';
type HandleKey = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'rotate';

interface Point { x: number; y: number; }

interface Annotation {
  id: number;
  type: Exclude<AnnotationTool, 'eraser' | 'select' | 'crop'>;
  color: string;
  lineWidth?: number; // For shapes
  fontSize?: number; // For text
  blurStrength?: number; // For blur
  size?: number; // For numbers
  start: Point;
  end: Point;
  rotation: number; // in radians
  text?: string;
  points?: Point[];
}

interface Handle {
    key: HandleKey;
    position: Point;
    cursor: string;
}

interface TextEditingState {
  x: number; y: number; sx: number; sy: number; value: string; id?: number;
}

// --- Props ---
interface ImageAnnotatorProps {
  isOpen: boolean; onClose: () => void; imageFile: File | null; onSave: (newImageFile: File) => void;
}

// --- Constants ---
const HANDLE_SIZE = 8;

// --- Helper Functions ---
const getContrastingTextColor = (hexcolor: string): string => {
    if (hexcolor.startsWith('#')) hexcolor = hexcolor.slice(1);
    if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(char => char + char).join('');
    const r = parseInt(hexcolor.substr(0, 2), 16); const g = parseInt(hexcolor.substr(2, 2), 16); const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};

const rotatePoint = (point: Point, center: Point, angle: number): Point => {
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const nx = (point.x - center.x) * cos - (point.y - center.y) * sin + center.x;
    const ny = (point.x - center.x) * sin + (point.y - center.y) * cos + center.y;
    return { x: nx, y: ny };
};

const getAnnotationBounds = (annotation: Annotation): { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } => {
    if (annotation.type === 'number') {
        const radius = annotation.size || 16;
        return { minX: annotation.start.x - radius, minY: annotation.start.y - radius, maxX: annotation.start.x + radius, maxY: annotation.start.y + radius, width: radius * 2, height: radius * 2 };
    }
    let minX, minY, maxX, maxY;
    if (annotation.type === 'pencil' && annotation.points && annotation.points.length > 0) {
        minX = Math.min(...annotation.points.map(p => p.x)); maxX = Math.max(...annotation.points.map(p => p.x));
        minY = Math.min(...annotation.points.map(p => p.y)); maxY = Math.max(...annotation.points.map(p => p.y));
    } else {
        minX = Math.min(annotation.start.x, annotation.end.x); minY = Math.min(annotation.start.y, annotation.end.y);
        maxX = Math.max(annotation.start.x, annotation.end.x); maxY = Math.max(annotation.start.y, annotation.end.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const getAnnotationCenter = (annotation: Annotation): Point => {
    if (annotation.type === 'number') return annotation.start;
    const bounds = getAnnotationBounds(annotation);
    return { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
};

const getAnnotationHandles = (annotation: Annotation): Handle[] => {
    const bounds = getAnnotationBounds(annotation); const { minX, minY, width, height } = bounds;
    const positions: Record<HandleKey, Point> = {
        nw: { x: minX, y: minY }, n: { x: minX + width / 2, y: minY }, ne: { x: minX + width, y: minY },
        w: { x: minX, y: minY + height / 2 }, e: { x: minX + width, y: minY + height / 2 },
        sw: { x: minX, y: minY + height }, s: { x: minX + width / 2, y: minY + height }, se: { x: minX + width, y: minY + height },
        rotate: { x: minX + width / 2, y: minY - 20 },
    };
    const cursors: Record<HandleKey, string> = {
        nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', w: 'ew-resize', e: 'ew-resize',
        sw: 'nesw-resize', s: 'ns-resize', se: 'nwse-resize', rotate: 'grab',
    }
    const center = getAnnotationCenter(annotation);
    return Object.keys(positions).map(key => ({
        key: key as HandleKey, position: rotatePoint(positions[key as HandleKey], center, annotation.rotation), cursor: cursors[key as HandleKey],
    }));
};

const isPointInsideAnnotation = (point: Point, annotation: Annotation, ctx: CanvasRenderingContext2D): boolean => {
    const center = getAnnotationCenter(annotation);
    const localPoint = rotatePoint(point, center, -annotation.rotation);
    if (annotation.type === 'number') {
        const radius = annotation.size || 16;
        return Math.hypot(localPoint.x - center.x, localPoint.y - center.y) <= radius;
    }
    if (annotation.type === 'text' && annotation.text && annotation.fontSize) {
        const fontSize = annotation.fontSize; const lineHeight = fontSize * 1.2;
        const lines = annotation.text.split('\n'); const textHeight = lines.length * lineHeight;
        ctx.font = `${fontSize}px sans-serif`; const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
        const textBounds = { minX: annotation.start.x, minY: annotation.start.y, maxX: annotation.start.x + textWidth, maxY: annotation.start.y + textHeight };
        return localPoint.x >= textBounds.minX && localPoint.x <= textBounds.maxX && localPoint.y >= textBounds.minY && localPoint.y <= textBounds.maxY;
    }
    const bounds = getAnnotationBounds(annotation);
    const buffer = (annotation.lineWidth || 4) + 4; // Add a buffer for easier clicking
    return localPoint.x >= bounds.minX - buffer && localPoint.x <= bounds.maxX + buffer && localPoint.y >= bounds.minY - buffer && localPoint.y <= bounds.maxY + buffer;
};

export const ImageAnnotator: React.FC<ImageAnnotatorProps> = ({ isOpen, onClose, imageFile, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null); const imageRef = useRef<HTMLImageElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null); const mainRef = useRef<HTMLDivElement>(null);
  
  const [tool, setTool] = useState<AnnotationTool>('select'); const [color, setColor] = useState<string>('#ef4444');
  const [toolOptions, setToolOptions] = useState({ thickness: 4, fontSize: 28, blurStrength: 10, numberSize: 16 });
  
  const {
      state: history,
      setState: setHistory,
      undo: undoAnnotation,
      redo: redoAnnotation,
      canUndo: canUndoAnnotation,
      canRedo: canRedoAnnotation,
      resetState: resetAnnotationHistory,
  } = useAnnotationHistory<Annotation[]>([]);
  
  const [currentAction, setCurrentAction] = useState<Action>('none');
  const [activeHandleKey, setActiveHandleKey] = useState<HandleKey | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  const [drawingAnnotation, setDrawingAnnotation] = useState<Annotation | null>(null);
  
  const [textEditing, setTextEditing] = useState<TextEditingState | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const actionState = useRef<{ annotation: Annotation | null, mousePos: Point, cropRect: typeof cropRect }>({ annotation: null, mousePos: { x: 0, y: 0 }, cropRect: null });
  const [canvasCursor, setCanvasCursor] = useState('default');

  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): Point => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const canvasToMain = useCallback((p: Point): Point => {
    const canvas = canvasRef.current; const main = mainRef.current; if (!canvas || !main) return p;
    const cRect = canvas.getBoundingClientRect(); const mRect = main.getBoundingClientRect();
    const scaleX = cRect.width / canvas.width; const scaleY = cRect.height / canvas.height;
    const cssXOnCanvas = p.x * scaleX; const cssYOnCanvas = p.y * scaleY;
    return { x: cssXOnCanvas + (cRect.left - mRect.left) + main.scrollLeft, y: cssYOnCanvas + (cRect.top - mRect.top) + main.scrollTop };
  }, []);

  useEffect(() => { if (textEditing && textareaRef.current) textareaRef.current.focus(); }, [textEditing]);
  useEffect(() => {
    if (!textEditing) return;
    const update = () => {
        const pos = canvasToMain({ x: textEditing.x, y: textEditing.y });
        setTextEditing(prev => prev ? { ...prev, sx: pos.x, sy: pos.y } : prev);
    };
    window.addEventListener('resize', update); return () => window.removeEventListener('resize', update);
  }, [textEditing, canvasToMain]);

  const getCropHandles = (rect: { x: number, y: number, width: number, height: number }): Omit<Handle, 'cursor'>[] => {
    const { x, y, width, height } = rect;
    return [
      { key: 'nw', position: { x, y } }, { key: 'n', position: { x: x + width / 2, y } }, { key: 'ne', position: { x: x + width, y } },
      { key: 'w', position: { x, y: y + height / 2 } }, { key: 'e', position: { x: x + width, y: y + height / 2 } },
      { key: 'sw', position: { x, y: y + height } }, { key: 's', position: { x: x + width / 2, y: y + height } }, { key: 'se', position: { x: x + width, y: y + height } },
    ] as Omit<Handle, 'cursor'>[];
  };

  const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation) => {
    const { type, text, points, rotation } = annotation;
    const center = getAnnotationCenter(annotation);
    ctx.save();
    ctx.translate(center.x, center.y); ctx.rotate(rotation); ctx.translate(-center.x, -center.y);
    ctx.strokeStyle = annotation.color; ctx.fillStyle = annotation.color;
    const bounds = getAnnotationBounds(annotation);
    if (type === 'rectangle' && annotation.lineWidth) {
        ctx.lineWidth = annotation.lineWidth; ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    } else if (type === 'circle' && annotation.lineWidth) {
        ctx.lineWidth = annotation.lineWidth; const radiusX = bounds.width / 2; const radiusY = bounds.height / 2;
        ctx.beginPath(); ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, 2 * Math.PI); ctx.stroke();
    } else if (type === 'arrow' && annotation.lineWidth) {
        ctx.lineWidth = annotation.lineWidth; const headlen = 4 + (ctx.lineWidth * 2); const from = annotation.start; const to = annotation.end;
        const dx = to.x - from.x; const dy = to.y - from.y; const angle = Math.atan2(dy, dx);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
        ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    } else if (type === 'pencil' && points && points.length > 0 && annotation.lineWidth) {
        ctx.lineWidth = annotation.lineWidth; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        for(let i=1; i<points.length; ++i) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
    } else if (type === 'text' && text && annotation.fontSize) {
        const fontSize = annotation.fontSize; ctx.font = `${fontSize}px sans-serif`; ctx.textBaseline = 'top';
        const lines = text.split('\n'); const lineHeight = fontSize * 1.2;
        lines.forEach((line, i) => ctx.fillText(line, annotation.start.x, annotation.start.y + (i * lineHeight)));
    } else if (type === 'number' && text && annotation.size) {
        const radius = annotation.size; const numberCenter = annotation.start; ctx.beginPath();
        ctx.arc(numberCenter.x, numberCenter.y, radius, 0, 2 * Math.PI); ctx.fillStyle = annotation.color; ctx.fill();
        const fontSize = radius * 1.2; ctx.font = `bold ${fontSize}px sans-serif`; ctx.fillStyle = getContrastingTextColor(annotation.color);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, numberCenter.x, numberCenter.y);
    }
    ctx.restore();
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current; const image = imageRef.current; if (!canvas || !image) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    const itemsToDraw = drawingAnnotation ? history.filter(a => a.id !== drawingAnnotation.id) : history;

    itemsToDraw.filter(ann => ann.type === 'blur').forEach(annotation => {
        if (!annotation.blurStrength) return;
        ctx.save(); const bounds = getAnnotationBounds(annotation); const center = getAnnotationCenter(annotation);
        ctx.translate(center.x, center.y); ctx.rotate(annotation.rotation); ctx.translate(-center.x, -center.y);
        ctx.beginPath(); ctx.rect(bounds.minX, bounds.minY, bounds.width, bounds.height); ctx.clip();
        ctx.filter = `blur(${annotation.blurStrength}px)`;
        ctx.translate(center.x, center.y); ctx.rotate(-annotation.rotation); ctx.translate(-center.x, -center.y);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    });

    if (tool === 'crop' && cropRect) {
        ctx.save(); ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        const { x, y, width, height } = cropRect;
        ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height); ctx.rect(x, y, width, height); ctx.fill('evenodd');
        ctx.restore(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
        ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height); ctx.setLineDash([]); ctx.fillStyle = 'white';
        getCropHandles(cropRect).forEach(handle => ctx.fillRect(handle.position.x - HANDLE_SIZE / 2, handle.position.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE));
    }

    ctx.lineCap = "round"; ctx.lineJoin = "round";

    itemsToDraw.filter(ann => ann.type !== 'blur').forEach(annotation => drawAnnotation(ctx, annotation));
    if (drawingAnnotation && drawingAnnotation.type !== 'blur') drawAnnotation(ctx, drawingAnnotation);

    const selectedAnn = history.find(a => a.id === selectedAnnotationId);
    if (selectedAnn && !drawingAnnotation) {
        const { rotation } = selectedAnn; const center = getAnnotationCenter(selectedAnn); const bounds = getAnnotationBounds(selectedAnn);
        ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(rotation); ctx.translate(-center.x, -center.y);
        ctx.strokeStyle = selectedAnn.type === 'blur' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(60, 130, 255, 0.9)';
        ctx.lineWidth = 1; ctx.setLineDash([6, 3]); ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
        ctx.setLineDash([]); ctx.restore();
        getAnnotationHandles(selectedAnn).forEach(handle => {
            ctx.save(); ctx.strokeStyle = 'black'; ctx.lineWidth = 1; const size = HANDLE_SIZE;
            if (handle.key === 'rotate') {
                ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(handle.position.x, handle.position.y, size / 2, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
            } else {
                ctx.fillStyle = 'white'; ctx.fillRect(handle.position.x - size / 2, handle.position.y - size / 2, size, size); ctx.strokeRect(handle.position.x - size / 2, handle.position.y - size / 2, size, size);
            }
            ctx.restore();
        });
    }
  }, [history, selectedAnnotationId, tool, cropRect, drawingAnnotation, drawAnnotation]);

    useEffect(() => {
        if (!isOpen || !imageFile) { 
            resetAnnotationHistory([]); 
            setSelectedAnnotationId(null); 
            setCropRect(null); 
            return; 
        }
        const canvas = canvasRef.current; if (!canvas) return;
        const img = new Image();
        img.onload = () => {
            const ar = img.naturalWidth / img.naturalHeight;
            const p = canvas.parentElement;
            
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            if (p) {
                const maxW = p.clientWidth;
                const maxH = p.clientHeight;
                let newW = maxW;
                let newH = newW / ar;
                if (newH > maxH) {
                    newH = maxH;
                    newW = newH * ar;
                }
                canvas.style.width = `${newW}px`;
                canvas.style.height = `${newH}px`;
            }
            
            imageRef.current = img;
            redrawCanvas();
        };
        img.src = URL.createObjectURL(imageFile);
        return () => { URL.revokeObjectURL(img.src); imageRef.current = null; }
    }, [isOpen, imageFile, redrawCanvas, resetAnnotationHistory]);

  useEffect(redrawCanvas, [history, redrawCanvas, drawingAnnotation]);
  
  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotationId === null) return;
    setHistory(history.filter(a => a.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId, history, setHistory]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || textEditing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId !== null) {
        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
        e.preventDefault(); handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedAnnotationId, handleDeleteSelected, textEditing]);

  const commitText = (text: string, position: Point) => {
    const val = text.trim(); const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    if (!val) { setTextEditing(null); return; }
    const fontSize = toolOptions.fontSize; ctx.font = `${fontSize}px sans-serif`;
    const lines = val.split('\n'); const lineHeight = fontSize * 1.2;
    const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const textHeight = lines.length * lineHeight;
    if (textEditing?.id) {
        const id = textEditing.id;
        setHistory(history.map(a => a.id === id ? { ...a, text: val, start: position, end: { x: position.x + textWidth, y: position.y + textHeight }, fontSize } : a));
        setSelectedAnnotationId(id);
    } else {
        const newAnnotation: Annotation = {
            id: Date.now(), type: 'text', color, rotation: 0, text: val, fontSize,
            start: position, end: { x: position.x + textWidth, y: position.y + textHeight },
        };
        setHistory([...history, newAnnotation]); 
        setTool('select'); 
        setSelectedAnnotationId(newAnnotation.id);
    }
    setTextEditing(null);
  };

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textEditing) { commitText(textEditing.value, { x: textEditing.x, y: textEditing.y }); return; }
    const mousePos = getCanvasPoint(e);
    if (tool === 'crop') {
        let clickedOnHandle: Omit<Handle,'cursor'> | null = null;
        if(cropRect) clickedOnHandle = getCropHandles(cropRect).find(h => Math.hypot(h.position.x - mousePos.x, h.position.y - mousePos.y) < HANDLE_SIZE / 2 + 2) || null;
        if(clickedOnHandle) { setActiveHandleKey(clickedOnHandle.key); setCurrentAction('resizing'); }
        else if (cropRect && mousePos.x > cropRect.x && mousePos.x < cropRect.x + cropRect.width && mousePos.y > cropRect.y && mousePos.y < cropRect.y + cropRect.height) setCurrentAction('moving');
        else { setCurrentAction('cropping'); setCropRect({ x: mousePos.x, y: mousePos.y, width: 0, height: 0 }); }
        actionState.current = { annotation: null, mousePos, cropRect }; return;
    }
    if (tool === 'number') {
        const existingNumbers = history.filter(ann => ann.type === 'number' && ann.text).map(ann => parseInt(ann.text!, 10));
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        const newAnnotation: Annotation = {
            id: Date.now(), type: 'number', color, rotation: 0, text: String(nextNumber), size: toolOptions.numberSize,
            start: mousePos, end: { x: mousePos.x + toolOptions.numberSize, y: mousePos.y + toolOptions.numberSize }
        };
        setHistory([...history, newAnnotation]);
        return;
    }
    if (tool === 'text') {
        const base = { x: mousePos.x, y: mousePos.y }; const screen = canvasToMain(base);
        setTimeout(() => setTextEditing({ x: base.x, y: base.y, sx: screen.x, sy: screen.y, value: '' }), 0); return;
    }
    let clickedOnHandle: Handle | null = null; let clickedAnnotation: Annotation | null = null;
    if (selectedAnnotationId !== null) {
        const selectedAnn = history.find(a => a.id === selectedAnnotationId);
        if (selectedAnn) clickedOnHandle = getAnnotationHandles(selectedAnn).find(h => Math.hypot(h.position.x - mousePos.x, h.position.y - mousePos.y) < HANDLE_SIZE / 2 + 2) || null;
    }
    if (clickedOnHandle) {
        const annotation = history.find(a => a.id === selectedAnnotationId)!;
        actionState.current = { annotation, mousePos, cropRect: null };
        setDrawingAnnotation(annotation); setActiveHandleKey(clickedOnHandle.key);
        if (clickedOnHandle.key === 'rotate') setCurrentAction('rotating'); else setCurrentAction('resizing');
    } else {
        const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
        for (let i = history.length - 1; i >= 0; i--) if (isPointInsideAnnotation(mousePos, history[i], ctx)) { clickedAnnotation = history[i]; break; }
        if (clickedAnnotation && tool === 'select') {
            setSelectedAnnotationId(clickedAnnotation.id); setCurrentAction('moving');
            actionState.current = { annotation: clickedAnnotation, mousePos, cropRect: null };
            setDrawingAnnotation(clickedAnnotation);
        } else if (tool !== 'select' && tool !== 'eraser') {
            setSelectedAnnotationId(null); setCurrentAction('drawing');
            const newAnnotation: Annotation = {
                id: Date.now(), type: tool as any, color, rotation: 0, start: mousePos, end: mousePos,
                ...(tool === 'pencil' && { points: [mousePos], lineWidth: toolOptions.thickness }),
                ...(['rectangle', 'circle', 'arrow'].includes(tool) && { lineWidth: toolOptions.thickness }),
                ...(tool === 'blur' && { blurStrength: toolOptions.blurStrength }),
            };
            setDrawingAnnotation(newAnnotation);
        } else if (tool === 'eraser' && clickedAnnotation) { setHistory(history.filter(ann => ann.id !== clickedAnnotation!.id));
        } else { setSelectedAnnotationId(null); }
    }
  }, [getCanvasPoint, textEditing, tool, cropRect, selectedAnnotationId, history, toolOptions, color, canvasToMain, setHistory]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const mousePos = getCanvasPoint(e);
    if (tool === 'crop' && cropRect) {
        if (currentAction === 'cropping') {
            const width = mousePos.x - cropRect.x; const height = mousePos.y - cropRect.y;
            setCropRect({ ...cropRect, width, height });
        } else if (currentAction === 'moving') {
            const { mousePos: startMouse, cropRect: startCrop } = actionState.current;
            const dx = mousePos.x - startMouse.x; const dy = mousePos.y - startMouse.y;
            setCropRect({ ...startCrop!, x: startCrop!.x + dx, y: startCrop!.y + dy });
        } else if (currentAction === 'resizing' && activeHandleKey) {
            let { x, y, width, height } = cropRect;
            if (activeHandleKey.includes('e')) width = mousePos.x - x;
            if (activeHandleKey.includes('w')) { width += x - mousePos.x; x = mousePos.x; }
            if (activeHandleKey.includes('s')) height = mousePos.y - y;
            if (activeHandleKey.includes('n')) { height += y - mousePos.y; y = mousePos.y; }
            setCropRect({ x, y, width, height });
        }
        redrawCanvas();
        return;
    }
    if (currentAction === 'none' || !drawingAnnotation) {
        let newCursor = 'default'; if (tool === 'select') newCursor = 'grab';
        if (['rectangle', 'circle', 'arrow', 'pencil', 'blur', 'number'].includes(tool)) newCursor = 'crosshair';
        if (tool === 'text') newCursor = 'text'; if (tool === 'eraser') newCursor = 'crosshair';
        const selectedAnn = history.find(a => a.id === selectedAnnotationId);
        if (selectedAnn) {
            const hoveredHandle = getAnnotationHandles(selectedAnn).find(h => Math.hypot(h.position.x - mousePos.x, h.position.y - mousePos.y) < HANDLE_SIZE / 2 + 2);
            if (hoveredHandle) newCursor = hoveredHandle.cursor;
            else { const ctx = canvasRef.current?.getContext('2d'); if (ctx && isPointInsideAnnotation(mousePos, selectedAnn, ctx)) newCursor = 'move'; }
        }
        setCanvasCursor(newCursor); return;
    }
    if (currentAction === 'moving') {
        const { annotation: ann, mousePos: startMouse } = actionState.current;
        const dx = mousePos.x - startMouse.x; const dy = mousePos.y - startMouse.y;
        setDrawingAnnotation({ ...ann!,
            start: { x: ann!.start.x + dx, y: ann!.start.y + dy }, end: { x: ann!.end.x + dx, y: ann!.end.y + dy },
            points: ann!.points?.map(p => ({ x: p.x + dx, y: p.y + dy })),
        });
    } else if (currentAction === 'rotating') {
        const { annotation: ann } = actionState.current; const center = getAnnotationCenter(ann!);
        const angle = Math.atan2(mousePos.y - center.y, mousePos.x - center.x) + Math.PI / 2;
        setDrawingAnnotation({ ...drawingAnnotation!, rotation: angle });
    } else if (currentAction === 'resizing' && activeHandleKey) {
        const { annotation: ann } = actionState.current;
        if (ann!.type === 'number') {
            const center = getAnnotationCenter(ann!); const newRadius = Math.hypot(mousePos.x - center.x, mousePos.y - center.y);
            setDrawingAnnotation({ ...drawingAnnotation!, size: Math.max(8, newRadius) }); return;
        }
        const oppositeHandleKeyMap: Partial<Record<HandleKey, HandleKey>> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw', n: 's', s: 'n', w: 'e', e: 'w' };
        const oppositeHandleKey = oppositeHandleKeyMap[activeHandleKey]; if (!oppositeHandleKey) return;
        const pivot = getAnnotationHandles(ann!).find(h => h.key === oppositeHandleKey)!.position;
        const rotatedMousePos = rotatePoint(mousePos, pivot, -ann!.rotation);
        const newStartUnrotated = { x: Math.min(pivot.x, rotatedMousePos.x), y: Math.min(pivot.y, rotatedMousePos.y) };
        const newEndUnrotated = { x: Math.max(pivot.x, rotatedMousePos.x), y: Math.max(pivot.y, rotatedMousePos.y) };
        const newCenterUnrotated = { x: (newStartUnrotated.x + newEndUnrotated.x) / 2, y: (newStartUnrotated.y + newEndUnrotated.y) / 2 };
        
        const originalBounds = getAnnotationBounds(ann!);
        const newWidth = newEndUnrotated.x - newStartUnrotated.x;
        const newHeight = newEndUnrotated.y - newStartUnrotated.y;

        const rotatedCenterDiff = { x: newCenterUnrotated.x - pivot.x, y: newCenterUnrotated.y - pivot.y };
        const finalCenter = {
            x: pivot.x + (rotatedCenterDiff.x * Math.cos(ann!.rotation) - rotatedCenterDiff.y * Math.sin(ann!.rotation)),
            y: pivot.y + (rotatedCenterDiff.x * Math.sin(ann!.rotation) + rotatedCenterDiff.y * Math.cos(ann!.rotation))
        };
        
        const newStart = { x: finalCenter.x - newWidth / 2, y: finalCenter.y - newHeight / 2 };
        const newEnd = { x: finalCenter.x + newWidth / 2, y: finalCenter.y + newHeight / 2 };
        
        let updatedAnn = { ...drawingAnnotation!, start: newStart, end: newEnd };
        if (updatedAnn.type === 'pencil' && updatedAnn.points && ann!.points && originalBounds.width > 0 && originalBounds.height > 0) {
            const scaleX = newWidth / originalBounds.width;
            const scaleY = newHeight / originalBounds.height;
            updatedAnn.points = ann!.points.map(p => ({
                x: newStart.x + (p.x - originalBounds.minX) * scaleX,
                y: newStart.y + (p.y - originalBounds.minY) * scaleY
            }));
        }
        setDrawingAnnotation(updatedAnn);
    } else if (currentAction === 'drawing') {
        let updatedAnn = { ...drawingAnnotation!, end: mousePos };
        if (tool === 'pencil') updatedAnn.points = [...(drawingAnnotation!.points || []), mousePos];
        setDrawingAnnotation(updatedAnn);
    }
  }, [getCanvasPoint, tool, currentAction, activeHandleKey, history, selectedAnnotationId, drawingAnnotation, redrawCanvas]);
  
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      const mousePos = getCanvasPoint(e);
      const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
      let clickedAnnotation: Annotation | null = null;
      for (let i = history.length - 1; i >= 0; i--) if (isPointInsideAnnotation(mousePos, history[i], ctx)) { clickedAnnotation = history[i]; break; }
      if (clickedAnnotation && clickedAnnotation.type === 'text') {
          const screenPos = canvasToMain(clickedAnnotation.start);
          setTextEditing({
              x: clickedAnnotation.start.x, y: clickedAnnotation.start.y,
              sx: screenPos.x, sy: screenPos.y,
              value: clickedAnnotation.text || '', id: clickedAnnotation.id,
          });
          setSelectedAnnotationId(null);
      }
  }, [getCanvasPoint, history, canvasToMain]);

  const handleMouseUp = useCallback(() => {
    if (tool === 'crop') {
        if (currentAction === 'cropping' && cropRect) {
            const newCropRect = {
                x: cropRect.width < 0 ? cropRect.x + cropRect.width : cropRect.x,
                y: cropRect.height < 0 ? cropRect.y + cropRect.height : cropRect.y,
                width: Math.abs(cropRect.width),
                height: Math.abs(cropRect.height),
            };
            if (newCropRect.width < 10 || newCropRect.height < 10) setCropRect(null); else setCropRect(newCropRect);
        }
        setCurrentAction('none'); setActiveHandleKey(null);
        return;
    }
    if (drawingAnnotation) {
        if (currentAction === 'drawing') {
            setHistory([...history, drawingAnnotation]);
            if (tool !== 'pencil') setTool('select');
            setSelectedAnnotationId(drawingAnnotation.id);
        } else if (['moving', 'resizing', 'rotating'].includes(currentAction)) {
            setHistory(history.map(a => a.id === drawingAnnotation.id ? drawingAnnotation : a));
        }
        setDrawingAnnotation(null);
    }
    setCurrentAction('none'); setActiveHandleKey(null);
  }, [tool, currentAction, drawingAnnotation, history, setHistory, cropRect]);

  const handleSaveAnnotations = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageFile) return;
    
    // Create a temporary canvas to draw the final image without UI elements
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    // Draw without any selection UI
    const image = imageRef.current;
    if (image) ctx.drawImage(image, 0, 0, tempCanvas.width, tempCanvas.height);
    
    history.filter(ann => ann.type === 'blur').forEach(annotation => {
        if (!annotation.blurStrength || !image) return;
        ctx.save();
        const bounds = getAnnotationBounds(annotation);
        const center = getAnnotationCenter(annotation);
        ctx.translate(center.x, center.y); ctx.rotate(annotation.rotation); ctx.translate(-center.x, -center.y);
        ctx.beginPath(); ctx.rect(bounds.minX, bounds.minY, bounds.width, bounds.height); ctx.clip();
        ctx.filter = `blur(${annotation.blurStrength}px)`;
        ctx.translate(center.x, center.y); ctx.rotate(-annotation.rotation); ctx.translate(-center.x, -center.y);
        ctx.drawImage(image, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.restore();
    });

    ctx.lineCap = "round"; ctx.lineJoin = "round";
    history.filter(ann => ann.type !== 'blur').forEach(annotation => drawAnnotation(ctx, annotation));

    tempCanvas.toBlob((blob) => {
        if (blob) {
            const newFile = new File([blob], imageFile.name, {
                type: imageFile.type, lastModified: Date.now(),
            });
            onSave(newFile);
        }
    }, imageFile.type, 0.95);
  };
  
  const handleApplyCrop = useCallback(() => {
      if (!cropRect || !imageFile || !imageRef.current) return;
      const image = imageRef.current;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cropRect.width;
      tempCanvas.height = cropRect.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);
      tempCanvas.toBlob((blob) => {
          if (blob) {
              const newFile = new File([blob], `cropped_${imageFile.name}`, { type: imageFile.type, lastModified: Date.now() });
              onSave(newFile);
              onClose();
          }
      }, imageFile.type, 1.0);
  }, [cropRect, imageFile, onSave, onClose]);
  const handleCancelCrop = () => { setCropRect(null); setTool('select'); };

  if (!isOpen) return null;

  const tools: { name: AnnotationTool; icon: JSX.Element }[] = [
    { name: 'select', icon: <SelectIcon /> }, { name: 'crop', icon: <CropIcon/> }, { name: 'rectangle', icon: <RectangleIcon /> }, { name: 'circle', icon: <CircleIcon /> },
    { name: 'arrow', icon: <ArrowIcon /> }, { name: 'pencil', icon: <PencilIcon /> }, { name: 'text', icon: <TextIcon /> }, { name: 'number', icon: <NumberIcon /> }, { name: 'blur', icon: <BlurIcon /> }, { name: 'eraser', icon: <EraserIcon /> },
  ];

  const renderToolOptions = () => {
    const commonSliderProps = "w-24 cursor-pointer accent-primary";
    switch(tool) {
        case 'rectangle': case 'circle': case 'arrow': case 'pencil':
            return <>
                <label className="text-sm font-medium text-slate-300">Thickness</label>
                <input type="range" min="1" max="30" value={toolOptions.thickness} onChange={(e) => setToolOptions(o => ({...o, thickness: parseInt(e.target.value)}))} className={commonSliderProps}/>
            </>;
        case 'text':
            return <>
                <label className="text-sm font-medium text-slate-300">Font Size</label>
                <input type="range" min="12" max="72" value={toolOptions.fontSize} onChange={(e) => setToolOptions(o => ({...o, fontSize: parseInt(e.target.value)}))} className={commonSliderProps}/>
            </>;
        case 'blur':
            return <>
                <label className="text-sm font-medium text-slate-300">Blur Strength</label>
                <input type="range" min="1" max="30" value={toolOptions.blurStrength} onChange={(e) => setToolOptions(o => ({...o, blurStrength: parseInt(e.target.value)}))} className={commonSliderProps}/>
            </>;
        case 'number':
             return <>
                <label className="text-sm font-medium text-slate-300">Size</label>
                <input type="range" min="8" max="40" value={toolOptions.numberSize} onChange={(e) => setToolOptions(o => ({...o, numberSize: parseInt(e.target.value)}))} className={commonSliderProps}/>
            </>;
        default: return null;
    }
  };

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
                        <label className="text-sm font-medium text-slate-300">Color</label>
                        <div className="relative w-8 h-8 rounded-full border-2 border-slate-600 overflow-hidden cursor-pointer shadow-inner">
                            <div className="w-full h-full" style={{ backgroundColor: color }}></div>
                            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title="Select annotation color" />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 min-w-[180px]">
                        {renderToolOptions()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={undoAnnotation} disabled={!canUndoAnnotation || tool === 'crop'} className="p-2 rounded-md hover:bg-slate-700 disabled:opacity-50" title="Undo"><UndoIcon /></button>
                    <button onClick={redoAnnotation} disabled={!canRedoAnnotation || tool === 'crop'} className="p-2 rounded-md hover:bg-slate-700 disabled:opacity-50" title="Redo"><RedoIcon /></button>
                    <button onClick={handleDeleteSelected} disabled={selectedAnnotationId === null} className="p-2 rounded-md hover:bg-slate-700 disabled:opacity-50 text-red-400 hover:text-red-500" title="Delete Selected"><TrashIcon /></button>
                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md hover:bg-slate-700">Cancel</button>
                    <button onClick={handleSaveAnnotations} className="px-4 py-2 text-sm font-semibold rounded-md bg-primary hover:bg-secondary">Save Changes</button>
                </div>
            </header>
            <main ref={mainRef} className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/50 relative">
                <canvas ref={canvasRef} className="object-contain rounded-md shadow-lg" 
                    style={{ cursor: canvasCursor, zIndex: 0, maxWidth: '100%', maxHeight: '100%' }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onDoubleClick={handleDoubleClick}
                    onMouseLeave={handleMouseUp}
                />
                 {textEditing && (
                    <textarea
                        ref={textareaRef} value={textEditing.value}
                        onChange={(e) => { setTextEditing({ ...textEditing, value: e.target.value }); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                        onBlur={() => commitText(textEditing.value, { x: textEditing.x, y: textEditing.y })}
                        onKeyDown={(e) => { if (e.key === 'Escape') setTextEditing(null); if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) commitText(textEditing.value, { x: textEditing.x, y: textEditing.y }); }}
                        style={{
                            position: 'absolute', left: `${textEditing.sx}px`, top: `${textEditing.sy}px`,
                            fontSize: `${(toolOptions.fontSize / (canvasRef.current ? canvasRef.current!.width / canvasRef.current!.getBoundingClientRect().width : 1))}px`, 
                            lineHeight: 1.2, fontFamily: 'sans-serif',
                            color: color, backgroundColor: 'rgba(255, 255, 255, 0.95)', border: `1px solid ${color}`,
                            outline: 'none', padding: '4px', minWidth: '100px', minHeight: '1.2em',
                            resize: 'none', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                            borderRadius: '4px', zIndex: 100,
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