import React from 'react';
import { Language } from '../types';

interface LanguageToggleProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
}

const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Dutch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'li', name: 'Limburgs' },
];

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ language, onLanguageChange }) => {
  return (
    <div className="relative w-full sm:w-auto">
      <select
        value={language}
        onChange={(e) => onLanguageChange(e.target.value as Language)}
        className="w-full appearance-none bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-3 pr-8 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
        aria-label="Select output language"
      >
        {LANGUAGES.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700 dark:text-slate-200">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  );
};