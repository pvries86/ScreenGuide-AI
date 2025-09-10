import React, { useState, useCallback, useEffect } from 'react';
import { SessionManager } from './components/SessionManager';
import { ImageUploader } from './components/ImageUploader';
import { InstructionDisplay } from './components/InstructionDisplay';
import { LanguageToggle } from './components/LanguageToggle';
import { SettingsModal } from './components/SettingsModal';
import { generateInstructions, regenerateInstruction } from './services/geminiService';
import * as db from './services/dbService';
import { Language, InstructionStep, RegenerationMode, SavedSession, SessionData, ExportedSession, Theme } from './types';
import { GenerateIcon, SaveIcon } from './components/icons';
import { base64ToFile } from './utils/fileUtils';

const App: React.FC = () => {
  // Session State
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  // Document State
  const [images, setImages] = useState<File[]>([]);
  const [instructionSteps, setInstructionSteps] = useState<InstructionStep[]>([]);
  const [title, setTitle] = useState<string>('');
  const [language, setLanguage] = useState<Language>('en');

  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isModified, setIsModified] = useState<boolean>(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Settings State
  const [apiKey, setApiKey] = useState<string>('');
  const [theme, setTheme] = useState<Theme>('light');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // --- Theme & API Key Management ---
  useEffect(() => {
    // Load theme
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme) {
        setTheme(savedTheme);
    } else if (prefersDark) {
        setTheme('dark');
    }

    // Load API Key
    const savedApiKey = localStorage.getItem('gemini-api-key');
    if (savedApiKey) {
        setApiKey(savedApiKey);
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const handleApiKeySave = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem('gemini-api-key', newKey);
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

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleNewSession = () => {
    setImages([]);
    setInstructionSteps([]);
    setTitle('');
    setCurrentSessionId(null);
    setError(null);
    setIsModified(false);
  };

  const handleSaveSession = async () => {
    if (!title && instructionSteps.length === 0) {
        setError("Please generate instructions before saving.");
        return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const sessionData: SessionData = { title, steps: instructionSteps, images };
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
      setIsModified(false);
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
        setTitle(session.title);
        setInstructionSteps(session.steps);
        setImages(session.images);
        setCurrentSessionId(session.id);
        setIsModified(false);
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
      // Convert images to base64 strings for serialization
      const imagePromises = images.map(async (file) => {
        const reader = new FileReader();
        return new Promise<{ name: string; type: string; lastModified: number; data: string }>((resolve, reject) => {
            reader.onload = () => resolve({
                name: file.name,
                type: file.type,
                lastModified: file.lastModified,
                data: reader.result as string
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
      });
  
      const exportedImages = await Promise.all(imagePromises);
  
      const exportedSession: ExportedSession = {
        title,
        steps: instructionSteps,
        images: exportedImages,
      };
  
      const jsonString = JSON.stringify(exportedSession, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const filename = (title || 'untitled-session').replace(/[^a-z0-9]/gi, '_').toLowerCase();
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
        if (typeof result !== 'string') {
          throw new Error("Failed to read file content.");
        }
        const parsed: ExportedSession = JSON.parse(result);

        // Validate the imported data
        if (!parsed.title || !Array.isArray(parsed.steps) || !Array.isArray(parsed.images)) {
            throw new Error("Invalid session file format.");
        }
        
        const importedImages = parsed.images.map(imgData => base64ToFile(imgData.data, imgData.name, imgData.type, imgData.lastModified));
        
        const newSessionData: SessionData = {
          title: parsed.title,
          steps: parsed.steps,
          images: importedImages,
        };

        const newId = await db.addSession(newSessionData);
        await loadSessions();
        await handleLoadSession(newId);

      } catch (e) {
        console.error("Failed to import session:", e);
        setError("Could not import session. The file might be corrupted or in the wrong format.");
      }
    };
    reader.onerror = () => {
        setError("Error reading the selected file.");
    };
    reader.readAsText(file);
  };

  // --- Instruction Generation & Modification ---

  const handleImagesChange = (files: File[]) => {
    if (instructionSteps.length > 0) setIsModified(true);
    setImages(files);
    setInstructionSteps([]);
    setTitle('');
    setError(null);
  };

  const handleStepsChange = (newSteps: InstructionStep[]) => {
    setInstructionSteps(newSteps);
    if (title || instructionSteps.length > 0) setIsModified(true);
  };
  
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (title || instructionSteps.length > 0) setIsModified(true);
  };

  const handleDeleteStep = (startIndex: number) => {
    let endIndex = startIndex + 1;
    // Find the end of the block (the text step + all subsequent image steps)
    while (endIndex < instructionSteps.length && instructionSteps[endIndex].type === 'image') {
      endIndex++;
    }
    const newSteps = [
      ...instructionSteps.slice(0, startIndex),
      ...instructionSteps.slice(endIndex)
    ];
    handleStepsChange(newSteps);
  };

  const handleRegenerateStep = async (stepIndex: number, mode: RegenerationMode): Promise<string> => {
    setRegeneratingIndex(stepIndex);
    setError(null);
    try {
      const currentStep = instructionSteps[stepIndex];
      if (currentStep.type !== 'text') throw new Error("Can only regenerate text steps.");

      let associatedImage: File | null = null;
      for (let i = stepIndex + 1; i < instructionSteps.length; i++) {
        if (instructionSteps[i].type === 'image') {
          const imageIndex = parseInt(instructionSteps[i].content, 10) - 1;
          if (imageIndex >= 0 && imageIndex < images.length) {
            associatedImage = images[imageIndex];
          }
          break;
        }
      }

      if (!associatedImage) {
        throw new Error("Could not find an associated image for this step.");
      }

      let previousStep: string | null = null;
      for (let i = stepIndex - 1; i >= 0; i--) {
        if (instructionSteps[i].type === 'text') {
          previousStep = instructionSteps[i].content;
          break;
        }
      }
      
      let nextStep: string | null = null;
      for (let i = stepIndex + 1; i < instructionSteps.length; i++) {
        if (instructionSteps[i].type === 'text') {
          nextStep = instructionSteps[i].content;
          break;
        }
      }

      const newContent = await regenerateInstruction(associatedImage, language, {
        previousStep,
        currentStep: currentStep.content,
        nextStep,
      }, mode, apiKey);

      // Instead of updating state here, we return the content to the editor.
      return newContent;

    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to regenerate step. Please try again.';
      setError(errorMessage);
      throw e; // Re-throw to be caught by the caller
    } finally {
      setRegeneratingIndex(null);
    }
  };


  const handleGenerate = useCallback(async () => {
    if (images.length === 0) {
      setError('Please upload at least one screenshot.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setInstructionSteps([]);
    setTitle('');
    setIsModified(false); // New generation is not a modification of a saved state

    try {
      const { title: newTitle, steps } = await generateInstructions(images, language, apiKey);
      setTitle(newTitle);
      setInstructionSteps(steps);
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to generate instructions. Please check your API key and try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [images, language, apiKey]);

  return (
    <div className="flex w-full min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-200">
      <SessionManager 
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNew={handleNewSession}
        onLoad={handleLoadSession}
        onDelete={handleDeleteSession}
        onImport={handleImportSession}
        onExport={handleExportSession}
        isExportDisabled={!currentSessionId}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 md:p-8">
            <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-6 md:p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="text-center mb-8">
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                      ScreenGuide AI
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                      Turn screenshots into step-by-step guides instantly. Upload, generate, and export.
                    </p>
                </div>
                
                <div className="space-y-6">
                    <ImageUploader onImagesChange={handleImagesChange} images={images} />
                    
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <LanguageToggle language={language} onLanguageChange={setLanguage} />
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                                onClick={handleSaveSession}
                                disabled={isSaving || (instructionSteps.length === 0 && !title)}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-700 text-primary dark:text-indigo-400 border border-primary dark:border-indigo-400 font-semibold rounded-lg shadow-sm hover:bg-indigo-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-slate-200 dark:disabled:bg-slate-600 disabled:text-slate-500 disabled:border-slate-300 dark:disabled:border-slate-500 disabled:cursor-not-allowed transition-all duration-300"
                            >
                                <SaveIcon className="w-5 h-5" />
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={isLoading || images.length === 0}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-lg shadow-md hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300"
                            >
                                <GenerateIcon />
                                {isLoading ? 'Generating...' : 'Generate'}
                            </button>
                        </div>
                    </div>

                    {error && (
                      <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded-md" role="alert">
                        <p className="font-bold">Error</p>
                        <p>{error}</p>
                      </div>
                    )}

                    {isModified && (
                      <div className="bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-300 p-4 rounded-md" role="alert">
                        <p className="font-bold">Unsaved Changes</p>
                        <p>You have unsaved changes. Click 'Save' to keep them.</p>
                      </div>
                    )}
                    
                    <InstructionDisplay 
                      title={title}
                      onTitleChange={handleTitleChange}
                      steps={instructionSteps}
                      images={images}
                      isLoading={isLoading}
                      onStepsChange={handleStepsChange}
                      onDeleteStep={handleDeleteStep}
                      onRegenerateStep={handleRegenerateStep}
                      regeneratingIndex={regeneratingIndex}
                    />
                </div>
            </div>
        </div>
      </main>
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        apiKey={apiKey}
        onApiKeySave={handleApiKeySave}
      />
    </div>
  );
};

export default App;
