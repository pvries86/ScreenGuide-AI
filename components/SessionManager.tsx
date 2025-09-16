import React, { useRef } from 'react';
import { SavedSession, TimeFormat } from '../types';
import { PlusIcon, DeleteIcon, LogoIcon, ImportIcon, ExportIcon, SettingsIcon } from './icons';

interface SessionManagerProps {
  sessions: SavedSession[];
  currentSessionId: number | null;
  onNew: () => void;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
  onImport: (file: File) => void;
  onExport: () => void;
  isExportDisabled: boolean;
  onSettingsClick: () => void;
  timeFormat: TimeFormat;
}

export const SessionManager: React.FC<SessionManagerProps> = ({ 
    sessions, currentSessionId, onNew, onLoad, onDelete, onImport, onExport, isExportDisabled, onSettingsClick, timeFormat
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    }).format(date);
  };
  
  const handleImportClick = () => {
    importInputRef.current?.click();
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset the input value to allow importing the same file again
      event.target.value = '';
    }
  };

  return (
    <aside className="w-full md:w-72 flex-shrink-0 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-3 h-16 border-b border-slate-200 dark:border-slate-800 px-4 flex-shrink-0">
        <LogoIcon />
        <span className="text-xl font-bold text-slate-800 dark:text-slate-100">ScreenGuide AI</span>
      </div>
      
      <div className="p-4 flex-shrink-0 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white font-semibold rounded-lg shadow-sm hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-300"
        >
          <PlusIcon className="w-5 h-5" />
          New Instructions
        </button>
        <div className="flex items-center gap-2 mt-2">
            <input 
                type="file"
                ref={importInputRef}
                className="hidden"
                accept=".json"
                onChange={handleFileChange}
            />
            <button
                onClick={handleImportClick}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-medium rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200"
            >
                <ImportIcon className="w-4 h-4" />
                Import
            </button>
            <button
                onClick={onExport}
                disabled={isExportDisabled}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-medium rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed transition-all duration-200"
            >
                <ExportIcon className="w-4 h-4" />
                Export
            </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto px-2">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 pt-2 pb-1">Saved Sessions</h2>
        {sessions.length > 0 ? (
          <ul className="space-y-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <div 
                  className={`group flex flex-col p-2.5 rounded-lg cursor-pointer transition-colors ${currentSessionId === session.id ? 'bg-indigo-100 dark:bg-primary/20' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                  onClick={() => onLoad(session.id)}
                >
                  <div className="flex justify-between items-start">
                    <span className={`font-semibold text-sm break-all ${currentSessionId === session.id ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                      {session.title || 'Untitled Session'}
                    </span>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
                       <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to delete "${session.title || 'this session'}"? This action cannot be undone.`)) {
                              onDelete(session.id);
                            }
                          }}
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-md"
                          title="Delete Session"
                        >
                          <DeleteIcon className="w-4 h-4" />
                        </button>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">{formatDate(session.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center text-sm text-slate-500 dark:text-slate-400 p-4 mt-4">
            No saved sessions yet. <br/> Click "Save" in the editor to keep a copy of your work.
          </div>
        )}
      </div>
       <footer className="flex items-center justify-between p-2 text-slate-500 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 px-2">
            <span>
                Powered by Gemini API
            </span>
          </div>
          <button 
            onClick={onSettingsClick}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
            aria-label="Open settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
      </footer>
    </aside>
  );
};