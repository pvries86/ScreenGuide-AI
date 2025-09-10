
import React from 'react';
import { Language } from '../types';

interface LanguageToggleProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ language, onLanguageChange }) => {
  return (
    <div className="flex items-center space-x-2 bg-slate-200 dark:bg-slate-700 p-1 rounded-lg">
      <button
        onClick={() => onLanguageChange('en')}
        className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-300 ${
          language === 'en' ? 'bg-white dark:bg-slate-800 text-primary shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
        }`}
      >
        English
      </button>
      <button
        onClick={() => onLanguageChange('nl')}
        className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors duration-300 ${
          language === 'nl' ? 'bg-white dark:bg-slate-800 text-primary shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
        }`}
      >
        Dutch
      </button>
    </div>
  );
};
