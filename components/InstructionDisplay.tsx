import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { InstructionStep, RegenerationMode } from '../types';
import { exportToDocx, exportToPdf } from '../utils/exportUtils';
import { 
    DocxIcon, PdfIcon, LoadingIcon, EditIcon, RefreshIcon, 
    CheckIcon, CloseIcon, ShorterIcon, LongerIcon, SimplerIcon, ProfessionalIcon,
    TrashIcon, DragHandleIcon, AnnotateIcon, CombineIcon, PlusIcon
} from './icons';

interface InstructionDisplayProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  steps: InstructionStep[];
  images: File[];
  isLoading: boolean;
  onStepsChange: (newSteps: InstructionStep[]) => void;
  onDeleteStep: (stepIndex: number) => void;
  onRegenerateStep: (stepIndex: number, mode: RegenerationMode) => Promise<void>;
  regeneratingIndex: number | null;
  onAnnotateImage: (imageIndex: number) => void;
}

const LoadingState: React.FC = () => (
    <div className="flex flex-col items-center justify-center p-12 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <LoadingIcon />
        <p className="mt-4 text-lg font-semibold text-slate-600 dark:text-slate-300 animate-pulse">
            AI is analyzing your screenshots...
        </p>
        <p className="text-slate-500 dark:text-slate-400">This may take a moment.</p>
    </div>
);

const EmptyState: React.FC = () => (
    <div className="text-center p-12 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
        <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200">Instructions will appear here</h3>
        <p className="mt-2 text-slate-500 dark:text-slate-400">Upload your screenshots and click "Generate" to start.</p>
    </div>
);

const StepEditor: React.FC<{
    step: InstructionStep;
    index: number;
    steps: InstructionStep[];
    onStepsChange: (newSteps: InstructionStep[]) => void;
    onRegenerateStep: (stepIndex: number, mode: RegenerationMode) => Promise<void>;
    regeneratingIndex: number | null;
    onCancel: () => void;
}> = ({ step, index, steps, onStepsChange, onRegenerateStep, regeneratingIndex, onCancel }) => {
    
    const [editedContent, setEditedContent] = useState(step.content);
    const isRegenerating = regeneratingIndex === index;

    // This effect synchronizes the editor's state if the parent prop changes
    // (e.g., after an AI regeneration or an undo/redo action).
    useEffect(() => {
        setEditedContent(step.content);
    }, [step.content]);

    const handleSave = () => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], content: editedContent };
        onStepsChange(newSteps);
        onCancel();
    };

    const handleRegenerate = async (mode: RegenerationMode) => {
        try {
            await onRegenerateStep(index, mode);
            // No need to set state here; the useEffect will catch the prop change.
        } catch (error) {
            // The error is already handled and displayed by the parent App component.
            console.error("Regeneration failed:", error);
        }
    };

    const aiTools = [
        { mode: 'shorter', icon: <ShorterIcon className="w-4 h-4" />, label: 'Shorter' },
        { mode: 'longer', icon: <LongerIcon className="w-4 h-4" />, label: 'Longer' },
        { mode: 'simpler', icon: <SimplerIcon className="w-4 h-4" />, label: 'Simpler' },
        { mode: 'professional', icon: <ProfessionalIcon className="w-4 h-4" />, label: 'Pro' }
    ];

    return (
        <div className="bg-indigo-50 dark:bg-primary/10 p-4 rounded-lg border border-primary my-2 relative">
            {isRegenerating && (
                <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 flex flex-col items-center justify-center z-10 rounded-lg backdrop-blur-sm">
                    <LoadingIcon />
                    <span className="mt-2 text-sm font-semibold text-primary">AI is rewriting...</span>
                </div>
            )}
            <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md text-lg focus:ring-primary focus:border-primary bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                rows={3}
                aria-label="Edit instruction text"
                disabled={isRegenerating}
                autoFocus
            />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <div className="flex items-center gap-1 flex-wrap">
                    {aiTools.map(({ mode, icon, label }) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => handleRegenerate(mode as RegenerationMode)}
                            disabled={isRegenerating}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-white dark:bg-slate-800 border border-primary/50 dark:border-primary/70 rounded-full hover:bg-indigo-50 dark:hover:bg-primary/20 disabled:opacity-50 disabled:cursor-wait"
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
                        className="flex items-center justify-center p-2 text-primary bg-white dark:bg-slate-800 border border-primary/50 dark:border-primary/70 rounded-full hover:bg-indigo-50 dark:hover:bg-primary/20 disabled:opacity-50 disabled:cursor-wait"
                        title="Regenerate"
                    >
                        <RefreshIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button type="button" onClick={onCancel} disabled={isRegenerating} className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50" aria-label="Cancel edit">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                    <button type="button" onClick={handleSave} disabled={isRegenerating} className="p-2 text-green-600 hover:text-green-800 rounded-full hover:bg-green-100 dark:hover:bg-green-500/20 disabled:opacity-50" aria-label="Save changes">
                        <CheckIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

const Inserter: React.FC<{ onClick: () => void; onHover: () => void; onLeave: () => void; isVisible: boolean; }> = ({ onClick, onHover, onLeave, isVisible }) => (
    <div className="relative h-8 -my-4 group/inserter" onMouseEnter={onHover} onMouseLeave={onLeave}>
        <div 
            className={`absolute inset-x-0 top-1/2 h-px bg-primary transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`} 
            aria-hidden="true"
        />
        <div className="absolute inset-0 flex items-center justify-center">
            <button
                onClick={onClick}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-primary bg-white dark:bg-slate-800 border border-primary/50 dark:border-primary/70 rounded-full shadow-lg transform transition-all duration-200 z-10 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}
                aria-label="Insert new step"
            >
                <PlusIcon className="w-4 h-4" />
                Add step
            </button>
        </div>
    </div>
);

export const InstructionDisplay: React.FC<InstructionDisplayProps> = ({ 
    title, onTitleChange, steps, images, isLoading, onStepsChange, onDeleteStep, onRegenerateStep, regeneratingIndex, onAnnotateImage
}) => {
    const displayRef = useRef<HTMLDivElement>(null);
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const [hoveredInsertIndex, setHoveredInsertIndex] = useState<number | null>(null);

    useEffect(() => {
        imageUrls.forEach(URL.revokeObjectURL);
        const urls = images.map(URL.createObjectURL);
        setImageUrls(urls);

        return () => {
            urls.forEach(URL.revokeObjectURL);
        };
    }, [images]);
    
    useEffect(() => {
        setSelectedIndices([]);
    }, [steps]);

    const instructionBlocks = useMemo(() => {
        const blocks: { textStep: InstructionStep; textStepIndex: number; imageSteps: InstructionStep[] }[] = [];
        if (steps.length === 0) return blocks;
        let currentBlock: { textStep: InstructionStep; textStepIndex: number; imageSteps: InstructionStep[] } | null = null;
        steps.forEach((step, index) => {
            if (step.type === 'text') {
                if (currentBlock) blocks.push(currentBlock);
                currentBlock = { textStep: step, textStepIndex: index, imageSteps: [] };
            } else if (step.type === 'image' && currentBlock) {
                currentBlock.imageSteps.push(step);
            }
        });
        if (currentBlock) blocks.push(currentBlock);
        return blocks;
    }, [steps]);

    const handleStartEditing = (index: number) => { setEditingIndex(index); };
    const handleCancelEditing = () => { setEditingIndex(null); };
    const generateFilename = (base: string) => base.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'sop-instructions';

    const handleExportPdf = () => {
        if (displayRef.current) exportToPdf(displayRef.current, generateFilename(title));
    };
    
    const handleExportDocx = () => { exportToDocx(title, steps, images); };
    const handleDelete = (index: number) => {
        if (window.confirm('Are you sure you want to delete this step?')) onDeleteStep(index);
    };

    const handleToggleSelection = (textStepIndex: number) => {
        setSelectedIndices(prev => prev.includes(textStepIndex) ? prev.filter(i => i !== textStepIndex) : [...prev, textStepIndex]);
    };

    const handleMerge = () => {
        if (selectedIndices.length < 2) return;
        const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
        const blocksToMerge = instructionBlocks.filter(block => sortedIndices.includes(block.textStepIndex));
        const mergedText = blocksToMerge.map(block => block.textStep.content).join(' ');
        const mergedImageSteps = blocksToMerge.flatMap(block => block.imageSteps);
        const newMergedTextStep: InstructionStep = { type: 'text', content: mergedText };
        const finalSteps: InstructionStep[] = [];
        let mergedBlockAdded = false;

        instructionBlocks.forEach(block => {
            if (sortedIndices.includes(block.textStepIndex)) {
                if (block.textStepIndex === sortedIndices[0] && !mergedBlockAdded) {
                    finalSteps.push(newMergedTextStep, ...mergedImageSteps);
                    mergedBlockAdded = true;
                }
            } else {
                finalSteps.push(block.textStep, ...block.imageSteps);
            }
        });
        onStepsChange(finalSteps);
        setSelectedIndices([]);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.dataTransfer.effectAllowed = 'move';
        setDraggedIndex(index);
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        setDragOverIndex(index);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
    const handleDrop = () => {
        if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) return;
        const newBlocks = [...instructionBlocks];
        const [draggedBlock] = newBlocks.splice(draggedIndex, 1);
        newBlocks.splice(dragOverIndex, 0, draggedBlock);
        const newSteps = newBlocks.flatMap(block => [block.textStep, ...block.imageSteps]);
        onStepsChange(newSteps);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleInsertStep = (afterBlockIndex: number) => {
        const newSteps = [...steps];
        const newTextStep: InstructionStep = { type: 'text', content: '' };

        let insertAtIndex;
        if (afterBlockIndex === -1) { // Insert at the very beginning
            insertAtIndex = 0;
        } else {
            const previousBlock = instructionBlocks[afterBlockIndex];
            // Find the index of the last step in the block (could be an image)
            const lastStepOfBlockIndex = previousBlock.textStepIndex + previousBlock.imageSteps.length;
            insertAtIndex = lastStepOfBlockIndex + 1;
        }

        newSteps.splice(insertAtIndex, 0, newTextStep);
        onStepsChange(newSteps);
        setEditingIndex(insertAtIndex); // Immediately edit the new step
    };

    if (isLoading) return <LoadingState />;
    if (steps.length === 0) return <EmptyState />;

    let textStepCounter = 0;

    return (
        <div>
            <div className="flex items-center justify-between mb-4 gap-4">
                <input type="text" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="Procedure Title" className="text-2xl font-bold text-slate-800 dark:text-slate-100 bg-transparent focus:outline-none focus:bg-slate-100 dark:focus:bg-slate-700 rounded-md -ml-2 p-2 w-full" aria-label="Procedure Title" />
                <div className="flex items-center space-x-2 flex-shrink-0">
                    <button onClick={handleExportDocx} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"><DocxIcon />DOCX</button>
                    <button onClick={handleExportPdf} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"><PdfIcon />PDF</button>
                </div>
            </div>
            <div ref={displayRef} className="p-8 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900/50 prose dark:prose-invert max-w-none">
                <h1 className="text-3xl font-bold !text-center !mb-8 !text-slate-900 dark:!text-slate-100">{title}</h1>
                {selectedIndices.length > 1 && (
                    <div className="sticky top-2 z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-2 rounded-lg shadow-lg border border-primary flex items-center justify-between mb-4">
                        <span className="font-semibold text-primary px-2">{selectedIndices.length} steps selected</span>
                        <button onClick={handleMerge} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-secondary transition-colors"><CombineIcon />Merge Selected</button>
                    </div>
                )}
                <div className="space-y-6">
                    <Inserter 
                        isVisible={hoveredInsertIndex === -1}
                        onHover={() => setHoveredInsertIndex(-1)}
                        onLeave={() => setHoveredInsertIndex(null)}
                        onClick={() => handleInsertStep(-1)}
                    />
                    {instructionBlocks.map((block, blockIndex) => {
                        textStepCounter++;
                        const isEditing = editingIndex === block.textStepIndex;
                        const isBeingDragged = draggedIndex === blockIndex;
                        const isSelected = selectedIndices.includes(block.textStepIndex);
                        
                        return (
                           <React.Fragment key={block.textStepIndex}>
                                {isEditing ? (
                                    <StepEditor step={block.textStep} index={block.textStepIndex} steps={steps} onStepsChange={onStepsChange} onRegenerateStep={onRegenerateStep} regeneratingIndex={regeneratingIndex} onCancel={handleCancelEditing} />
                                ) : (
                                    <div className="relative group/block">
                                        {dragOverIndex === blockIndex && <div className="absolute -top-3 left-0 w-full h-1 bg-primary rounded-full"></div>}
                                        <div draggable={!isEditing} onDragStart={(e) => handleDragStart(e, blockIndex)} onDragEnter={(e) => handleDragEnter(e, blockIndex)} onDragOver={handleDragOver} onDrop={handleDrop} onDragEnd={handleDragEnd} className={`relative rounded-lg transition-all duration-200 ${isBeingDragged ? 'opacity-40 shadow-2xl' : ''} ${isSelected ? 'bg-indigo-50 dark:bg-primary/10 ring-2 ring-primary' : ''}`}>
                                            <div className="flex gap-4 items-start">
                                                <div className="flex-shrink-0 flex items-center gap-2 pt-2">
                                                    <input type="checkbox" checked={isSelected} onChange={() => handleToggleSelection(block.textStepIndex)} className="h-5 w-5 rounded border-slate-400 dark:border-slate-500 text-primary focus:ring-primary bg-transparent dark:bg-slate-800 focus:ring-offset-0 opacity-0 group-hover/block:opacity-100 checked:opacity-100 transition-opacity" aria-label={`Select step ${textStepCounter}`} />
                                                    <div className="text-slate-400 dark:text-slate-500 cursor-grab" title="Drag to reorder"><DragHandleIcon /></div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="p-2 -m-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer group/step" onClick={() => handleStartEditing(block.textStepIndex)}>
                                                        <p className="text-lg leading-relaxed flex">
                                                            <span className="font-bold w-8 flex-shrink-0">{textStepCounter}.</span>
                                                            <span>{block.textStep.content}</span>
                                                        </p>
                                                        <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1 opacity-0 group-hover/step:opacity-100 focus-within:opacity-100 transition-opacity">
                                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(block.textStepIndex); }} className="p-1.5 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400 rounded-full shadow border border-slate-200 dark:border-slate-600" aria-label="Delete step"><TrashIcon className="w-4 h-4" /></button>
                                                            <button className="p-1.5 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-primary dark:hover:text-indigo-400 rounded-full shadow border border-slate-200 dark:border-slate-600" aria-label="Edit step"><EditIcon className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>
                                                    {block.imageSteps.map((imageStep, imgIdx) => {
                                                        const imageIndex = parseInt(imageStep.content, 10) - 1;
                                                        if (imageIndex >= 0 && imageIndex < imageUrls.length) {
                                                            return (
                                                                <div key={`${block.textStepIndex}-${imgIdx}`} className="my-6 relative group/image">
                                                                    <img src={imageUrls[imageIndex]} alt={`Screenshot for step ${textStepCounter}`} className="w-full max-w-2xl mx-auto rounded-lg shadow-md border border-slate-200 dark:border-slate-700" />
                                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                                                        <button onClick={() => onAnnotateImage(imageIndex)} className="flex items-center gap-2 px-4 py-2 bg-white/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 font-semibold rounded-lg shadow-lg hover:scale-105 transition-transform"><AnnotateIcon className="w-5 h-5" />Annotate</button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <Inserter 
                                    isVisible={hoveredInsertIndex === blockIndex}
                                    onHover={() => setHoveredInsertIndex(blockIndex)}
                                    onLeave={() => setHoveredInsertIndex(null)}
                                    onClick={() => handleInsertStep(blockIndex)}
                                />
                           </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};