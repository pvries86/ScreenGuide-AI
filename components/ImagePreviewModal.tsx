import React, { useEffect, useState } from 'react';

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  imageName?: string;
  imageUrls?: string[];
  imageNames?: string[];
  currentIndex?: number;
  totalImages?: number;
  onClose: () => void;
  onAnnotate?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSelectImage?: (index: number) => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  imageUrl,
  imageName,
  imageUrls = [],
  imageNames = [],
  currentIndex,
  totalImages,
  onClose,
  onAnnotate,
  onPrevious,
  onNext,
  onSelectImage,
}) => {
  const canNavigate = Boolean(onPrevious && onNext && totalImages && totalImages > 1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [imageUrl]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft' && canNavigate) {
        event.preventDefault();
        onPrevious?.();
      } else if (event.key === 'ArrowRight' && canNavigate) {
        event.preventDefault();
        onNext?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canNavigate, isOpen, onClose, onNext, onPrevious]);

  if (!isOpen || !imageUrl) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close image preview"
        className="absolute inset-0 cursor-zoom-out"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-5xl max-h-[90vh] bg-slate-900 text-slate-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-700">
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-700 bg-slate-800/80">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wide text-slate-400">Previewing</span>
            <span className="text-sm font-medium truncate max-w-[60vw]">
              {imageName ?? 'Screenshot'}
            </span>
            {currentIndex !== undefined && totalImages !== undefined && (
              <span className="text-xs text-slate-400">
                {currentIndex + 1} of {totalImages}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onAnnotate && (
              <button
                type="button"
                onClick={() => onAnnotate?.()}
                className="px-4 py-2 text-sm font-semibold rounded-md bg-primary hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/60"
              >
                Annotate
              </button>
            )}
            <div className="flex items-center gap-1 border-l border-slate-700 pl-2 ml-1">
              <button
                type="button"
                onClick={() => setZoom((currentZoom) => Math.max(0.5, Number((currentZoom - 0.25).toFixed(2))))}
                className="px-3 py-2 text-sm font-semibold rounded-md bg-slate-700 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
                aria-label="Zoom out"
                title="Zoom out"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-3 py-2 text-sm font-semibold rounded-md bg-slate-700 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
                aria-label="Reset zoom"
                title="Reset zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((currentZoom) => Math.min(3, Number((currentZoom + 0.25).toFixed(2))))}
                className="px-3 py-2 text-sm font-semibold rounded-md bg-slate-700 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-slate-700 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              Close
            </button>
          </div>
        </header>
        <div className="relative flex-1 overflow-auto bg-slate-950 flex items-center justify-center p-6">
          {canNavigate && (
            <>
              <button
                type="button"
                onClick={onPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-slate-900/80 text-white border border-white/20 shadow-lg flex items-center justify-center hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-white/70"
                aria-label="Show previous screenshot"
                title="Previous screenshot"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-slate-900/80 text-white border border-white/20 shadow-lg flex items-center justify-center hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-white/70"
                aria-label="Show next screenshot"
                title="Next screenshot"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </>
          )}
          <img
            src={imageUrl}
            alt={imageName ?? 'Screenshot preview'}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg transition-transform origin-center"
            style={{ transform: `scale(${zoom})` }}
          />
        </div>
        {imageUrls.length > 1 && onSelectImage && currentIndex !== undefined && (
          <div className="flex gap-2 overflow-x-auto p-3 border-t border-slate-700 bg-slate-900">
            {imageUrls.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => onSelectImage(index)}
                className={`relative h-16 w-28 flex-shrink-0 rounded-md overflow-hidden border-2 focus:outline-none focus:ring-2 focus:ring-primary ${index === currentIndex ? 'border-primary' : 'border-slate-700 hover:border-slate-500'}`}
                aria-label={`Show screenshot ${index + 1}`}
                title={imageNames[index] ?? `Screenshot ${index + 1}`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
                <span className="absolute top-1 left-1 bg-black/70 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
