import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { SessionManager } from './components/SessionManager';
import { ImageUploader } from './components/ImageUploader';
import { InstructionDisplay } from './components/InstructionDisplay';
import { LanguageToggle } from './components/LanguageToggle';
import { SettingsModal } from './components/SettingsModal';
import { ImageAnnotator } from './components/ImageAnnotator';
import { ConfirmModal } from './components/ConfirmModal';
import { generateInstructions, regenerateInstruction, generateIncrementalInstruction } from './services/llmService';
import * as db from './services/dbService';
import { Language, InstructionStep, RegenerationMode, SavedSession, SessionData, ExportedSession, Theme, ExportedImage, TimeFormat, LLMProvider, ApiKeys } from './types';
import { GenerateIcon, SaveIcon, MergeIcon, UndoIcon, RedoIcon } from './components/icons';
import { base64ToFile } from './utils/fileUtils';
import { useHistory } from './hooks/useHistory';

interface DocumentState {
  title: string;
  steps: InstructionStep[];
}

const convertFilesToExportedImages = (files: File[]): Promise<ExportedImage[]> => {
    const imagePromises = files.map(async (file) => {
        const reader = new FileReader();
        return new Promise<ExportedImage>((resolve, reject) => {
            reader.onload = () => resolve({ name: file.name, type: file.type, lastModified: file.lastModified, data: reader.result as string });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    });
    return Promise.all(imagePromises);
};

const App: React.FC = () => {
  // Session State
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  // Document State with Undo/Redo
  const {
    state: documentState,
    setState: setDocumentState,
    undo,
    redo,
    canUndo,
    canRedo,
    resetState: resetDocumentState,
  } = useHistory<DocumentState>({ title: '', steps: [] });
  const { title, steps: instructionSteps } = documentState;
  
  // File State (not part of undo/redo history)
  const [images, setImages] = useState<File[]>([]);
  
  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [annotatingImageIndex, setAnnotatingImageIndex] = useState<number | null>(null);
  const [isGenerateConfirmOpen, setIsGenerateConfirmOpen] = useState<boolean>(false);
  const [isRecoveryPromptOpen, setIsRecoveryPromptOpen] = useState<boolean>(false);
  const [recoveredSession, setRecoveredSession] = useState<ExportedSession | null>(null);

  // Settings State
  const [selectedModel, setSelectedModel] = useState<LLMProvider>('gemini');
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [theme, setTheme] = useState<Theme>('light');
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('24h');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [language, setLanguage] = useState<Language>('en');
  
  // Derived state for unsaved changes
  const isModified = canUndo;

  // --- Session Recovery on Load ---
  useEffect(() => {
    try {
        const savedJson = localStorage.getItem('auto-saved-session');
        if (savedJson) {
            const session: ExportedSession = JSON.parse(savedJson);
            if (session && session.steps && (session.steps.length > 0 || session.title)) {
                setRecoveredSession(session);
                setIsRecoveryPromptOpen(true);
            }
        }
    } catch (e) {
        console.error("Failed to load auto-saved session:", e);
        localStorage.removeItem('auto-saved-session'); // Clear corrupted data
    }
  }, []);

  // --- Auto-Save Feature ---
  useEffect(() => {
    const performAutoSave = async () => {
        if (!isModified) return;
        try {
            const exportedImages = await convertFilesToExportedImages(images);
            const sessionToSave: ExportedSession = { ...documentState, images: exportedImages };
            localStorage.setItem('auto-saved-session', JSON.stringify(sessionToSave));
        } catch (e) {
            console.error("Auto-save failed:", e);
        }
    };

    const intervalId = setInterval(performAutoSave, 60000); // Auto-save every 60 seconds

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (isModified) {
            event.preventDefault();
            event.returnValue = 'You have unsaved changes that may be lost.';
        }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
        clearInterval(intervalId);
        window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isModified, documentState, images]);


  // --- Keyboard Shortcuts for Undo/Redo ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Don't interfere if user is typing in an input/textarea or a modal is open
        const activeEl = document.activeElement;
        const isEditing = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || (activeEl as HTMLElement)?.isContentEditable;
        if (isEditing || isSettingsOpen || annotatingImageIndex !== null) return;

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

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo, isSettingsOpen, annotatingImageIndex]);

  // --- Settings Management ---
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme) setTheme(savedTheme);
    else if (prefersDark) setTheme('dark');

    const savedTimeFormat = localStorage.getItem('time-format') as TimeFormat | null;
    if (savedTimeFormat) setTimeFormat(savedTimeFormat);

    try {
        const savedApiKeys = localStorage.getItem('apiKeys');
        if (savedApiKeys) setApiKeys(JSON.parse(savedApiKeys));
    } catch (e) { console.error("Could not load API keys", e); }
    
    const savedModel = localStorage.getItem('selectedModel') as LLMProvider | null;
    if (savedModel) setSelectedModel(savedModel);

    const currentKey = (apiKeys as any)[selectedModel];
    if (!currentKey) {
      setIsSettingsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  useEffect(() => {
    localStorage.setItem('time-format', timeFormat);
  }, [timeFormat]);

  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  const handleApiKeysSave = (newKeys: ApiKeys) => {
    setApiKeys(newKeys);
    localStorage.setItem('apiKeys', JSON.stringify(newKeys));
  };

  // --- Session Management Callbacks ---

  const loadSessions = useCallback(async () => {
    try {
      const savedSessions = await db.getAllSessions();
      setSessions(savedSessions);
    } catch (e) {
      console.error(e);
      setError("Could not load saved sessions. IndexedDB might not be supported or is blocked.");
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleNewSession = () => {
    setImages([]);
    resetDocumentState({ title: '', steps: [] });
    setCurrentSessionId(null);
    setError(null);
    localStorage.removeItem('auto-saved-session');
  };

  const handleSaveSession = async () => {
    if (!title && instructionSteps.length === 0) {
        setError("Please generate instructions before saving.");
        return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const sessionData: SessionData = { ...documentState, images };
      if (currentSessionId) {
        const existingSession = sessions.find(s => s.id === currentSessionId);
        if (existingSession) {
          await db.updateSession({ ...sessionData, id: currentSessionId, createdAt: existingSession.createdAt });
        }
      } else {
        const newId = await db.addSession(sessionData);
        setCurrentSessionId(newId);
      }
      await loadSessions();
      resetDocumentState(documentState); // Commit current state as the new baseline
      localStorage.removeItem('auto-saved-session');
    } catch (e) {
      console.error(e);
      setError("Failed to save the session.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadSession = async (id: number) => {
    if (isModified && !window.confirm("You have unsaved changes that will be lost. Are you sure you want to load a new session?")) {
      return;
    }
    setError(null);
    try {
      const session = await db.getSession(id);
      if (session) {
        resetDocumentState({ title: session.title, steps: session.steps });
        setImages(session.images);
        setCurrentSessionId(session.id);
        localStorage.removeItem('auto-saved-session');
      } else {
        throw new Error("Session not found in the database.");
      }
    } catch (e) {
      console.error(e);
      setError(`Failed to load session ${id}.`);
    }
  };

  const handleDeleteSession = async (id: number) => {
    setError(null);
    try {
      await db.deleteSession(id);
      if (id === currentSessionId) {
        handleNewSession();
      }
      await loadSessions();
    } catch (e) {
      console.error(e);
      setError(`Failed to delete session ${id}.`);
    }
  };

  const handleExportSession = async () => {
    if (!currentSessionId || (instructionSteps.length === 0 && !title)) {
      alert("Please save the session before exporting.");
      return;
    }

    try {
      const exportedImages = await convertFilesToExportedImages(images);
      const exportedSession: ExportedSession = { title, steps: instructionSteps, images: exportedImages };
      const jsonString = JSON.stringify(exportedSession, null, 2);
      const filename = (title || 'untitled-session').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const blob = new Blob([jsonString], { type: 'application/json' });
      window.saveAs(blob, `${filename}.json`);
    } catch(e) {
        console.error("Failed to export session:", e);
        setError("Could not export session. See console for details.");
    }
  };

  const handleImportSession = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') throw new Error("Failed to read file content.");
        const parsed: ExportedSession = JSON.parse(result);
        if (!parsed.title || !Array.isArray(parsed.steps) || !Array.isArray(parsed.images)) throw new Error("Invalid session file format.");
        
        const importedImages = parsed.images.map(imgData => base64ToFile(imgData.data, imgData.name, imgData.type, imgData.lastModified));
        
        const newSessionData: SessionData = { title: parsed.title, steps: parsed.steps, images: importedImages };
        const newId = await db.addSession(newSessionData);
        await loadSessions();
        await handleLoadSession(newId);
        localStorage.removeItem('auto-saved-session');
      } catch (e) {
        console.error("Failed to import session:", e);
        setError("Could not import session. The file might be corrupted or in the wrong format.");
      }
    };
    reader.onerror = () => { setError("Error reading the selected file."); };
    reader.readAsText(file);
  };

  // --- Auto-Save Recovery Handlers ---
  const handleRestoreAutoSave = () => {
    if (!recoveredSession) return;
    try {
        const importedImages = recoveredSession.images.map(imgData => 
            base64ToFile(imgData.data, imgData.name, imgData.type, imgData.lastModified)
        );
        resetDocumentState({ title: recoveredSession.title, steps: recoveredSession.steps });
        setImages(importedImages);
        setCurrentSessionId(null);
    } catch (e) {
        console.error("Failed to restore session:", e);
        setError("Could not restore the auto-saved session. It might be corrupted.");
    } finally {
        localStorage.removeItem('auto-saved-session');
        setIsRecoveryPromptOpen(false);
        setRecoveredSession(null);
    }
  };

  const handleDiscardAutoSave = () => {
      localStorage.removeItem('auto-saved-session');
      setIsRecoveryPromptOpen(false);
      setRecoveredSession(null);
  };

  // --- Instruction Generation & Modification ---

  const handleImagesChange = (files: File[]) => {
    if (instructionSteps.length > 0) {
      // Don't reset if we are adding images to an existing guide
    } else {
        resetDocumentState({ title: '', steps: [] });
    }
    setImages(files);
    setError(null);
  };

  const handleStepsChange = (newSteps: InstructionStep[]) => {
    setDocumentState({ ...documentState, steps: newSteps });
  };
  
  const handleTitleChange = (newTitle: string) => {
    setDocumentState({ ...documentState, title: newTitle });
  };

  const handleDeleteStep = (startIndex: number) => {
    let endIndex = startIndex + 1;
    while (endIndex < instructionSteps.length && instructionSteps[endIndex].type === 'image') endIndex++;
    const newSteps = [...instructionSteps.slice(0, startIndex), ...instructionSteps.slice(endIndex)];
    handleStepsChange(newSteps);
  };

  const handleRegenerateStep = async (stepIndex: number, mode: RegenerationMode): Promise<void> => {
    const apiKey = apiKeys[selectedModel];
    if (!apiKey) {
        setError(`Please set your ${selectedModel} API key in the settings before regenerating.`);
        setIsSettingsOpen(true);
        throw new Error("API key not set."); // Throw to stop the loading spinner in InstructionDisplay
    }
    setRegeneratingIndex(stepIndex);
    setError(null);
    try {
      const currentStep = instructionSteps[stepIndex];
      if (currentStep.type !== 'text') throw new Error("Can only regenerate text steps.");
      
      let associatedImage: File | null = null;
      // Search for an image step that logically follows the text step before the next text step
      for (let i = stepIndex + 1; i < instructionSteps.length; i++) {
        const nextStep = instructionSteps[i];
        if (nextStep.type === 'image') {
          const imageIndex = parseInt(nextStep.content, 10) - 1;
          if (imageIndex >= 0 && imageIndex < images.length) {
            associatedImage = images[imageIndex];
            // We found the first image of the block, that's enough context
            break; 
          }
        }
        // If we hit another text step, it means the current step has no images.
        if (nextStep.type === 'text') {
            break;
        }
      }

      let previousStep: string | null = null;
      for (let i = stepIndex - 1; i >= 0; i--) if (instructionSteps[i].type === 'text') { previousStep = instructionSteps[i].content; break; }
      let nextStep: string | null = null;
      for (let i = stepIndex + 1; i < instructionSteps.length; i++) if (instructionSteps[i].type === 'text') { nextStep = instructionSteps[i].content; break; }

      const newContent = await regenerateInstruction(
        selectedModel,
        apiKeys,
        associatedImage, 
        language, 
        { previousStep, currentStep: currentStep.content, nextStep }, 
        mode, 
      );
      
      const newSteps = [...instructionSteps];
      newSteps[stepIndex] = { ...newSteps[stepIndex], content: newContent };
      setDocumentState({ ...documentState, steps: newSteps });

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to regenerate step. Please try again.';
      setError(errorMessage);
      throw e;
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const generateAll = async () => {
    const apiKey = apiKeys[selectedModel];
    if (!apiKey) {
      setError(`Please set your ${selectedModel} API key in the settings before generating.`);
      setIsSettingsOpen(true);
      return;
    }
    if (images.length === 0) {
      setError('Please upload at least one screenshot.');
      return;
    }
    setIsLoading(true);
    setError(null);
    
    try {
      const { title: newTitle, steps } = await generateInstructions(images, language, selectedModel, apiKeys);
      resetDocumentState({ title: newTitle, steps });
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : `Failed to generate instructions using ${selectedModel}. Please check your API key and try again.`;
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = () => {
    if (instructionSteps.length > 0) {
      setIsGenerateConfirmOpen(true);
    } else {
      void generateAll();
    }
  };

  const handleConfirmGenerate = () => {
    setIsGenerateConfirmOpen(false);
    void generateAll();
  };

  const handleCancelGenerate = () => {
    setIsGenerateConfirmOpen(false);
  };

  const handleMergeInstructions = async () => {
    const apiKey = apiKeys[selectedModel];
    if (!apiKey) {
      setError(`Please set your ${selectedModel} API key in the settings before merging.`);
      setIsSettingsOpen(true);
      return;
    }
    setIsMerging(true);
    setError(null);
    try {
        const existingImageIndices = new Set(instructionSteps.filter(step => step.type === 'image').map(step => parseInt(step.content, 10) - 1));
        const newImagesToProcess = images.map((file, index) => ({ file, index })).filter(({ index }) => !existingImageIndices.has(index));
        if (newImagesToProcess.length === 0) {
            setError("No new images to merge.");
            setIsMerging(false);
            return;
        }
        const existingBlocks = new Map<number, InstructionStep[]>();
        let currentBlock: InstructionStep[] = [], currentImageIndex = -1;
        instructionSteps.forEach(step => {
            if (step.type === 'text' && currentBlock.length > 0) {
                if (currentImageIndex !== -1) existingBlocks.set(currentImageIndex, currentBlock);
                currentBlock = [];
                currentImageIndex = -1;
            }
            currentBlock.push(step);
            if (step.type === 'image') currentImageIndex = parseInt(step.content, 10) - 1;
        });
        if (currentBlock.length > 0 && currentImageIndex !== -1) existingBlocks.set(currentImageIndex, currentBlock);
        
        const textStepContentMap = new Map<number, string>();
        existingBlocks.forEach((block, imageIndex) => {
            const textStep = block.find(s => s.type === 'text');
            if (textStep) textStepContentMap.set(imageIndex, textStep.content);
        });

        const generationPromises = newImagesToProcess.map(async ({ file, index }) => {
            let prevImageIndex = -1;
            for (let i = index - 1; i >= 0; i--) if (existingImageIndices.has(i)) { prevImageIndex = i; break; }
            let nextImageIndex = -1;
            for (let i = index + 1; i < images.length; i++) if (existingImageIndices.has(i)) { nextImageIndex = i; break; }
            const context = { previousStep: prevImageIndex !== -1 ? textStepContentMap.get(prevImageIndex) ?? null : null, nextStep: nextImageIndex !== -1 ? textStepContentMap.get(nextImageIndex) ?? null : null };
            const result = await generateIncrementalInstruction(file, language, selectedModel, apiKeys, context);
            const processedSteps = result.steps.map(step => step.type === 'image' ? { ...step, content: String(index + 1) } : step);
            return { index, steps: processedSteps };
        });

        const newlyGeneratedStepsData = await Promise.all(generationPromises);
        const newlyGeneratedStepsMap = new Map<number, InstructionStep[]>();
        newlyGeneratedStepsData.forEach(data => newlyGeneratedStepsMap.set(data.index, data.steps));

        const finalSteps: InstructionStep[] = [];
        for (let i = 0; i < images.length; i++) {
            if (existingBlocks.has(i)) finalSteps.push(...(existingBlocks.get(i) || []));
            else if (newlyGeneratedStepsMap.has(i)) finalSteps.push(...(newlyGeneratedStepsMap.get(i) || []));
        }
        setDocumentState({ ...documentState, steps: finalSteps });
    } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : 'Failed to merge new steps. Please try again.');
    } finally {
        setIsMerging(false);
    }
  };

  const handleAnnotateImage = (imageIndex: number) => setAnnotatingImageIndex(imageIndex);
  const handleSaveAnnotatedImage = (newImageFile: File) => {
    if (annotatingImageIndex !== null) {
      const newImages = [...images];
      newImages[annotatingImageIndex] = newImageFile;
      setImages(newImages);
      // Note: This modification is not tracked by undo/redo.
    }
    setAnnotatingImageIndex(null);
  };
  const handleCloseAnnotator = () => setAnnotatingImageIndex(null);

  const imagesInUseCount = useMemo(() => new Set(instructionSteps.filter(s => s.type === 'image').map(s => s.content)).size, [instructionSteps]);
  const canMerge = instructionSteps.length > 0 && images.length > imagesInUseCount;

  return (
    <div className="flex w-full min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-200">
      <SessionManager sessions={sessions} currentSessionId={currentSessionId} onNew={handleNewSession} onLoad={handleLoadSession} onDelete={handleDeleteSession} onImport={handleImportSession} onExport={handleExportSession} isExportDisabled={!currentSessionId} onSettingsClick={() => setIsSettingsOpen(true)} timeFormat={timeFormat} />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 md:p-8">
            <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-6 md:p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="text-center mb-8">
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">ScreenGuide AI</h1>
                    <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">Turn screenshots into step-by-step guides instantly. Upload, generate, and export.</p>
                </div>
                <div className="space-y-6">
                    <ImageUploader onImagesChange={handleImagesChange} images={images} />
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <LanguageToggle language={language} onLanguageChange={setLanguage} />
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button onClick={undo} disabled={!canUndo} className="flex items-center justify-center gap-2 px-3 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-semibold rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all" title="Undo (Ctrl+Z)"><UndoIcon className="w-5 h-5" /></button>
                            <button onClick={redo} disabled={!canRedo} className="flex items-center justify-center gap-2 px-3 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-semibold rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all" title="Redo (Ctrl+Y)"><RedoIcon className="w-5 h-5" /></button>
                            <button onClick={handleSaveSession} disabled={isSaving || !isModified} className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700 text-primary dark:text-indigo-400 border border-primary dark:border-indigo-400 font-semibold rounded-lg shadow-sm hover:bg-indigo-50 dark:hover:bg-slate-600 disabled:bg-slate-200 dark:disabled:bg-slate-600 disabled:text-slate-500 disabled:border-slate-300 dark:disabled:border-slate-500 disabled:cursor-not-allowed transition-all"><SaveIcon className="w-5 h-5" />{isSaving ? 'Saving...' : 'Save'}</button>
                            {canMerge ? (
                                <button onClick={handleMergeInstructions} disabled={isMerging || isLoading} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-all"><MergeIcon />{isMerging ? 'Merging...' : 'Add & Merge'}</button>
                            ) : (
                                <button onClick={handleGenerate} disabled={isLoading || isMerging || images.length === 0} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-lg shadow-md hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-all"><GenerateIcon />{isLoading ? 'Generating...' : (instructionSteps.length > 0 ? 'Regenerate All' : 'Generate')}</button>
                            )}
                        </div>
                    </div>
                    {error && (<div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded-md" role="alert"><p className="font-bold">Error</p><p>{error}</p></div>)}
                    {isModified && (<div className="bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-300 p-4 rounded-md" role="alert"><p className="font-bold">Unsaved Changes</p><p>You have unsaved changes. Click 'Save' to keep them.</p></div>)}
                    <InstructionDisplay title={title} onTitleChange={handleTitleChange} steps={instructionSteps} images={images} isLoading={isLoading || isMerging} onStepsChange={handleStepsChange} onDeleteStep={handleDeleteStep} onRegenerateStep={handleRegenerateStep} regeneratingIndex={regeneratingIndex} onAnnotateImage={handleAnnotateImage} />
                </div>
            </div>
        </div>
      </main>
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        theme={theme} 
        onThemeChange={setTheme} 
        timeFormat={timeFormat} 
        onTimeFormatChange={setTimeFormat} 
        apiKeys={apiKeys} 
        onApiKeysSave={handleApiKeysSave}
        selectedModel={selectedModel}
        onSelectedModelChange={setSelectedModel}
      />
      <ConfirmModal
        isOpen={isGenerateConfirmOpen}
        message="This will regenerate the entire guide and replace any changes you've made. Are you sure?"
        onConfirm={handleConfirmGenerate}
        onCancel={handleCancelGenerate}
      />
       <ConfirmModal
        isOpen={isRecoveryPromptOpen}
        message="We found an unsaved session from your last visit. Would you like to restore it?"
        onConfirm={handleRestoreAutoSave}
        onCancel={handleDiscardAutoSave}
      />
      <ImageAnnotator isOpen={annotatingImageIndex !== null} onClose={handleCloseAnnotator} imageFile={annotatingImageIndex !== null ? images[annotatingImageIndex] : null} onSave={handleSaveAnnotatedImage} />
    </div>
  );
};
export default App;
