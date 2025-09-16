import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UploadIcon, CloseIcon, DragHandleIcon } from './icons';

interface ImageUploaderProps {
  onImagesChange: (files: File[]) => void;
  images: File[];
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesChange, images }) => {
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Using refs for drag state to prevent re-renders on every drag-over event
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  // Using a state to force re-render for visual feedback
  const [, setForceUpdate] = useState(0);

  // Effect to sync internal state when external `images` prop changes
  useEffect(() => {
    // Revoke old previews before creating new ones to prevent memory leaks
    imagePreviews.forEach(url => URL.revokeObjectURL(url));

    const newPreviews = images.map(file => URL.createObjectURL(file));
    setImagePreviews(newPreviews);
    
    // This effect should only run when the parent `images` array instance changes.
    // The cleanup function will handle revoking the URLs when the component unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  // Clean up Object URLs when component unmounts
  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  // Centralized function to add new files to the queue
  const handleAddFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    // Sort the new files by modification date to establish a chronological initial order.
    imageFiles.sort((a, b) => a.lastModified - b.lastModified);

    const combined = [...images, ...imageFiles];

    // De-duplicate based on name, size, and last modified, keeping the first occurrence.
    // This preserves existing images and their order if duplicates are added.
    const uniqueFiles = combined.filter((file, index, self) =>
        index === self.findIndex((f) => (
            f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
        ))
    );
    
    onImagesChange(uniqueFiles);

  }, [images, onImagesChange]);
  
  // Paste event handler attached to the document
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (event.clipboardData && event.clipboardData.files.length > 0) {
        event.preventDefault();
        handleAddFiles(Array.from(event.clipboardData.files));
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handleAddFiles]);


  const handleRemoveImage = useCallback((indexToRemove: number) => {
    const newFiles = images.filter((_, index) => index !== indexToRemove);
    onImagesChange(newFiles);
  }, [images, onImagesChange]);
  
  const handleDragEnterZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeaveZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDragOverZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDropZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(Array.from(e.dataTransfer.files));
    }
  };
  
  // Drag-and-drop handlers for sorting image previews
  const handleSortDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSortDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    dragOverItem.current = index;
    setForceUpdate(val => val + 1); // Force re-render for visual feedback
  };

  const handleSortDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSortDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const newImages = [...images];
      const draggedItemContent = newImages.splice(dragItem.current, 1)[0];
      newImages.splice(dragOverItem.current, 0, draggedItemContent);
      onImagesChange(newImages);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setForceUpdate(val => val + 1);
  };

  const handleSortDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
    setForceUpdate(val => val + 1);
  };

  return (
    <div>
      <div
        onDragEnter={handleDragEnterZone}
        onDragLeave={handleDragLeaveZone}
        onDragOver={handleDragOverZone}
        onDrop={handleDropZone}
        className={`relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-300
        ${isDragging ? 'border-primary bg-indigo-50 dark:bg-primary/10' : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 hover:border-primary dark:hover:border-primary'}`}
      >
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            if (e.target.files) {
              handleAddFiles(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center justify-center text-center">
            <UploadIcon />
            <p className="mt-2 text-lg font-semibold text-slate-700 dark:text-slate-200">
                Drag & drop, click, or paste (Ctrl+V) screenshots
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Add one or more images to the queue
            </p>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
        * You can drag and drop screenshots to change their order.
      </p>

      {imagePreviews.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">Selected Screenshots:</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {imagePreviews.map((src, index) => {
              const isBeingDragged = dragItem.current === index;
              const isDragTarget = dragOverItem.current === index;
              return (
              <div 
                key={`${images[index]?.name}-${src}`} 
                className={`relative aspect-video rounded-lg overflow-hidden shadow-md border border-slate-200 dark:border-slate-700 group cursor-grab transition-all duration-200
                  ${isBeingDragged ? 'opacity-40 scale-95' : 'opacity-100 scale-100'}
                  ${isDragTarget && !isBeingDragged ? 'ring-2 ring-primary' : ''}
                `}
                draggable
                onDragStart={(e) => handleSortDragStart(e, index)}
                onDragEnter={(e) => handleSortDragEnter(e, index)}
                onDragOver={handleSortDragOver}
                onDrop={handleSortDrop}
                onDragEnd={handleSortDragEnd}
              >
                <img src={src} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <DragHandleIcon className="w-8 h-8 text-white" />
                </div>
                 <div className="absolute top-1 left-1 bg-primary text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-lg z-10">
                  {index + 1}
                </div>
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="absolute top-1 right-1 bg-black/40 text-white rounded-full p-1 hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white transition-opacity opacity-0 group-hover:opacity-100 z-10"
                  aria-label={`Remove screenshot ${index + 1}`}
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};