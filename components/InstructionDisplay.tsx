import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { InstructionStep, RegenerationMode } from '../types';
import { exportToDocx, exportToPdf } from '../utils/exportUtils';
import { 
    DocxIcon, PdfIcon, LoadingIcon, EditIcon, RefreshIcon, 
    CheckIcon, CloseIcon, ShorterIcon, LongerIcon, SimplerIcon, ProfessionalIcon,
    UndoIcon, RedoIcon, TrashIcon, DragHandleIcon
} from './icons';

interface InstructionDisplayProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  steps: InstructionStep[];
  images: File[];
  isLoading: boolean;
  onStepsChange: (newSteps: InstructionStep[]) => void;
  onDeleteStep: (stepIndex: number) => void;
  onRegenerateStep: (stepIndex: number, mode: RegenerationMode) => Promise<string>;
  regeneratingIndex: number | null;
}

const LoadingState: React.FC = () => (
    <div className="flex flex-col items-center justify-center p-12 border border-slate-200 rounded-lg bg-slate-50">
        <LoadingIcon />
        <p className="mt-4 text-lg font-semibold text-slate-600 animate-pulse">
            AI is analyzing your screenshots...
        </p>
        <p className="text-slate-500">This may take a moment.</p>
    </div>
);

const EmptyState: React.FC = () => (
    <div className="text-center p-12 border border-slate-200 rounded-lg bg-slate-50">
        <h3 className="text-xl font-semibold text-slate-700">Instructions will appear here</h3>
        <p className="mt-2 text-slate-500">Upload your screenshots and click "Generate" to start.</p>
    </div>
);

const useHistory = (initialState: string) => {
    const [state, setState] = useState({
      past: [] as string[],
      present: initialState,
      future: [] as string[],
    });
  
    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;
  
    const undo = useCallback(() => {
      if (!canUndo) return;
      const { past, present, future } = state;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      setState({
        past: newPast,
        present: previous,
        future: [present, ...future],
      });
    }, [canUndo, state]);
  
    const redo = useCallback(() => {
      if (!canRedo) return;
      const { past, present, future } = state;
      const next = future[0];
      const newFuture = future.slice(1);
      setState({
        past: [...past, present],
        present: next,
        future: newFuture,
      });
    }, [canRedo, state]);
  
    const set = useCallback((newState: string) => {
      const { present } = state;
      if (newState === present) return;
      
      setState({
        past: [...state.past, present],
        present: newState,
        future: [],
      });
    }, [state]);
  
    const reset = useCallback((newInitialState: string) => {
      setState({
        past: [],
        present: newInitialState,
        future: [],
      });
    }, []);
  
    return {
      state: state.present,
      set,
      undo,
      redo,
      reset,
      canUndo,
      canRedo,
    };
};

const StepEditor: React.FC<{
    step: InstructionStep;
    index: number;
    steps: InstructionStep[];
    onStepsChange: (newSteps: InstructionStep[]) => void;
    onRegenerateStep: (stepIndex: number, mode: RegenerationMode) => Promise<string>;
    regeneratingIndex: number | null;
    onCancel: () => void;
}> = ({ step, index, steps, onStepsChange, onRegenerateStep, regeneratingIndex, onCancel }) => {
    
    const { state: editedContent, set: setEditedContent, undo, redo, reset, canUndo, canRedo } = useHistory(step.content);
    const isRegenerating = regeneratingIndex === index;

    // This effect synchronizes the editor's state if the parent prop changes
    // (e.g., after an AI regeneration), without interfering with user input.
    useEffect(() => {
        reset(step.content);
    }, [step.content, reset]);


    const handleSave = () => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], content: editedContent };
        onStepsChange(newSteps);
        onCancel();
    };

    const handleRegenerate = async (mode: RegenerationMode) => {
        try {
            const newContent = await onRegenerateStep(index, mode);
            // Update the local editor state, which also pushes to undo history
            setEditedContent(newContent);
        } catch (error) {
            // The error is already handled and displayed by the parent App component.
            console.error("Regeneration failed:", error);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (e.key === 'y') {
                e.preventDefault();
                redo();
            }
        }
    };


    const aiTools = [
        { mode: 'shorter', icon: <ShorterIcon className="w-4 h-4" />, label: 'Shorter' },
        { mode: 'longer', icon: <LongerIcon className="w-4 h-4" />, label: 'Longer' },
        { mode: 'simpler', icon: <SimplerIcon className="w-4 h-4" />, label: 'Simpler' },
        { mode: 'professional', icon: <ProfessionalIcon className="w-4 h-4" />, label: 'Pro' }
    ];

    return (
        <div className="bg-indigo-50 p-4 rounded-lg border border-primary my-2 relative">
            {isRegenerating && (
                <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10 rounded-lg backdrop-blur-sm">
                    <LoadingIcon />
                    <span className="mt-2 text-sm font-semibold text-primary">AI is rewriting...</span>
                </div>
            )}
            <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full p-2 border border-slate-300 rounded-md text-lg focus:ring-primary focus:border-primary"
                rows={3}
                aria-label="Edit instruction text"
                disabled={isRegenerating}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <div className="flex items-center gap-1 flex-wrap">
                    {aiTools.map(({ mode, icon, label }) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => handleRegenerate(mode as RegenerationMode)}
                            disabled={isRegenerating}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-white border border-primary/50 rounded-full hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-wait"
                            title={`Make text ${label.toLowerCase()}`}
                        >
                            {icon}
                            {label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => handleRegenerate('regenerate')}
                        disabled={isRegenerating}
                        className="flex items-center justify-center p-2 text-primary bg-white border border-primary/50 rounded-full hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-wait"
                        title="Regenerate"
                    >
                        <RefreshIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button type="button" onClick={undo} disabled={!canUndo || isRegenerating} className="p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Undo change" title="Undo (Ctrl+Z)">
                        <UndoIcon className="w-5 h-5" />
                    </button>
                    <button type="button" onClick={redo} disabled={!canRedo || isRegenerating} className="p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Redo change" title="Redo (Ctrl+Y)">
                        <RedoIcon className="w-5 h-5" />
                    </button>
                    <div className="h-5 w-px bg-slate-300 mx-1"></div>
                    <button type="button" onClick={onCancel} disabled={isRegenerating} className="p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-200 disabled:opacity-50" aria-label="Cancel edit">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                    <button type="button" onClick={handleSave} disabled={isRegenerating} className="p-2 text-green-600 hover:text-green-800 rounded-full hover:bg-green-100 disabled:opacity-50" aria-label="Save changes">
                        <CheckIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export const InstructionDisplay: React.FC<InstructionDisplayProps> = ({ 
    title, onTitleChange, steps, images, isLoading, onStepsChange, onDeleteStep, onRegenerateStep, regeneratingIndex 
}) => {
    const displayRef = useRef<HTMLDivElement>(null);
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editorKey, setEditorKey] = useState<number>(0);
    
    // Drag and Drop State
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useEffect(() => {
        const urls = images.map(URL.createObjectURL);
        setImageUrls(urls);

        return () => {
            urls.forEach(URL.revokeObjectURL);
        };
    }, [images]);

    // Group steps into logical blocks (text + associated images) for easier rendering and reordering.
    const instructionBlocks = useMemo(() => {
        const blocks: { textStep: InstructionStep; textStepIndex: number; imageSteps: InstructionStep[] }[] = [];
        if (steps.length === 0) return blocks;
    
        let currentBlock: { textStep: InstructionStep; textStepIndex: number; imageSteps: InstructionStep[] } | null = null;
    
        steps.forEach((step, index) => {
            if (step.type === 'text') {
                if (currentBlock) {
                    blocks.push(currentBlock);
                }
                currentBlock = { textStep: step, textStepIndex: index, imageSteps: [] };
            } else if (step.type === 'image' && currentBlock) {
                currentBlock.imageSteps.push(step);
            }
        });
    
        if (currentBlock) {
            blocks.push(currentBlock);
        }
        return blocks;
    }, [steps]);

    const handleStartEditing = (index: number) => {
        setEditorKey(prevKey => prevKey + 1);
        setEditingIndex(index);
    };

    const handleCancelEditing = () => {
        setEditingIndex(null);
    };

    const generateFilename = (base: string) => {
        return base.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'sop-instructions';
    }

    const handleExportPdf = () => {
        if (displayRef.current) {
            exportToPdf(displayRef.current, generateFilename(title));
        }
    };
    
    const handleExportDocx = () => {
        exportToDocx(title, steps, images);
    };

    const handleDelete = (index: number) => {
        if (window.confirm('Are you sure you want to delete this step? This cannot be undone.')) {
            onDeleteStep(index);
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.dataTransfer.effectAllowed = 'move';
        setDraggedIndex(index);
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        setDragOverIndex(index);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = () => {
        if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) return;

        const newBlocks = [...instructionBlocks];
        const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
        newBlocks.splice(dragOverIndex, 0, draggedBlock);

        // Flatten the reordered blocks back into a single steps array
        const newSteps = newBlocks.flatMap(block => [block.textStep, ...block.imageSteps]);
        onStepsChange(newSteps);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    if (isLoading) {
        return <LoadingState />;
    }

    if (steps.length === 0) {
        return <EmptyState />;
    }

    let textStepCounter = 0;

    return (
        <div>
            <div className="flex items-center justify-between mb-4 gap-4">
                <input 
                    type="text"
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder="Procedure Title"
                    className="text-2xl font-bold text-slate-800 bg-transparent focus:outline-none focus:bg-slate-100 rounded-md -ml-2 p-2 w-full"
                    aria-label="Procedure Title"
                />
                <div className="flex items-center space-x-2 flex-shrink-0">
                    <button onClick={handleExportDocx} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors">
                        <DocxIcon />
                        DOCX
                    </button>
                    <button onClick={handleExportPdf} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors">
                        <PdfIcon />
                        PDF
                    </button>
                </div>
            </div>

            <div ref={displayRef} className="p-8 border border-slate-200 rounded-lg bg-white prose max-w-none">
                <h1 className="text-3xl font-bold !text-center !mb-8">{title}</h1>
                <div className="space-y-6">
                    {instructionBlocks.map((block, blockIndex) => {
                        textStepCounter++;
                        const isEditing = editingIndex === block.textStepIndex;
                        const isBeingDragged = draggedIndex === blockIndex;

                        if (isEditing) {
                            return (
                                <StepEditor
                                    key={`${block.textStepIndex}-${editorKey}`}
                                    step={block.textStep}
                                    index={block.textStepIndex}
                                    steps={steps}
                                    onStepsChange={onStepsChange}
                                    onRegenerateStep={onRegenerateStep}
                                    regeneratingIndex={regeneratingIndex}
                                    onCancel={handleCancelEditing}
                                />
                            );
                        }
                        
                        return (
                            <div key={block.textStepIndex} className="relative">
                                {dragOverIndex === blockIndex && <div className="absolute -top-3 left-0 w-full h-1 bg-primary rounded-full"></div>}
                                <div
                                    draggable={!isEditing}
                                    onDragStart={(e) => handleDragStart(e, blockIndex)}
                                    onDragEnter={(e) => handleDragEnter(e, blockIndex)}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    onDragEnd={handleDragEnd}
                                    className={`group relative rounded-lg transition-all duration-200 ${isBeingDragged ? 'opacity-40 shadow-2xl' : ''}`}
                                >
                                    <div className="flex gap-2">
                                        <div className="text-slate-400 pt-2 cursor-grab" title="Drag to reorder">
                                          <DragHandleIcon />
                                        </div>
                                        <div className="flex-1">
                                            <div className="p-2 -m-2 rounded-lg hover:bg-slate-100 cursor-pointer" onClick={() => handleStartEditing(block.textStepIndex)}>
                                                <p className="text-lg leading-relaxed flex">
                                                    <span className="font-bold w-8 flex-shrink-0">{textStepCounter}.</span>
                                                    <span>{block.textStep.content}</span>
                                                </p>
                                                <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(block.textStepIndex); }} className="p-1.5 bg-white text-slate-500 hover:bg-red-100 hover:text-red-600 rounded-full shadow border border-slate-200" aria-label="Delete step">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                    <button className="p-1.5 bg-white text-slate-500 hover:bg-indigo-100 hover:text-primary rounded-full shadow border border-slate-200" aria-label="Edit step">
                                                        <EditIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {block.imageSteps.map((imageStep, imgIdx) => {
                                                const imageIndex = parseInt(imageStep.content, 10) - 1;
                                                if (imageIndex >= 0 && imageIndex < imageUrls.length) {
                                                    return (
                                                        <div key={`${block.textStepIndex}-${imgIdx}`} className="my-6">
                                                            <img
                                                                src={imageUrls[imageIndex]}
                                                                alt={`Screenshot for step ${textStepCounter}`}
                                                                className="w-full max-w-2xl mx-auto rounded-lg shadow-md border border-slate-200"
                                                            />
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
