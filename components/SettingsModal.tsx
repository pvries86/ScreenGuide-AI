import React, { useState, useEffect } from 'react';
import { Theme } from '../types';
import { CloseIcon, SunIcon, MoonIcon, InfoIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  apiKey: string;
  onApiKeySave: (key: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, theme, onThemeChange, apiKey, onApiKeySave }) => {
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isInfoVisible, setIsInfoVisible] = useState(false);

  useEffect(() => {
    setLocalApiKey(apiKey);
    setIsInfoVisible(false); // Reset info popover when modal opens/closes
  }, [apiKey, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    if (localApiKey.trim()) {
        onApiKeySave(localApiKey.trim());
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  return (
    <div 
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm"
        onClick={onClose}
        aria-modal="true"
        role="dialog"
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md m-4 p-6 border border-slate-200 dark:border-slate-700 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
          aria-label="Close settings"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Settings</h2>

        <div className="space-y-6">
          {/* Theme Toggle */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Appearance
            </label>
            <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                <button
                    onClick={() => onThemeChange('light')}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-300 ${
                        theme === 'light' ? 'bg-white text-primary shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                    <SunIcon className="w-4 h-4" />
                    Light
                </button>
                <button
                    onClick={() => onThemeChange('dark')}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-300 ${
                        theme === 'dark' ? 'bg-slate-800 text-primary shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                    <MoonIcon className="w-4 h-4" />
                    Dark
                </button>
            </div>
          </div>

          {/* API Key Input */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
                <label htmlFor="api-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Gemini API Key
                </label>
                <button 
                    onClick={() => setIsInfoVisible(!isInfoVisible)}
                    className="text-slate-400 hover:text-primary"
                    aria-label="How to get an API key"
                >
                    <InfoIcon className="w-5 h-5" />
                </button>
            </div>
             {isInfoVisible && (
                <div className="absolute bottom-full left-0 w-full mb-2 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 z-10">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">How to get a Gemini API Key</h4>
                    <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1">
                        <li>Go to <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">Google AI Studio</a>.</li>
                        <li>Sign in with your Google account.</li>
                        <li>Click the <strong>"Get API key"</strong> button.</li>
                        <li>Click <strong>"Create API key in new project"</strong>.</li>
                        <li>Copy the generated key and paste it below.</li>
                    </ol>
                    <button onClick={() => setIsInfoVisible(false)} className="absolute top-2 right-2 p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600">
                        <CloseIcon className="w-4 h-4"/>
                    </button>
                </div>
            )}
            <input
              id="api-key"
              type="password"
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder="Enter your API key"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-slate-900 dark:text-slate-100"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Your API key is stored securely in your browser's local storage.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-2">
            <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition-all"
            >
                Close
            </button>
            <button
                onClick={handleSave}
                className={`px-5 py-2.5 text-sm font-semibold text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-300
                    ${saveStatus === 'saved' ? 'bg-green-500' : 'bg-primary hover:bg-secondary'}
                    ${saveStatus === 'error' ? 'bg-red-500' : ''}`}
            >
                {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Invalid' : 'Save Key'}
            </button>
        </div>
      </div>
    </div>
  );
};
