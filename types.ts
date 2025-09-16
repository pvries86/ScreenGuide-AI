export type Language = 'en' | 'nl';

export type Theme = 'light' | 'dark';

export type TimeFormat = '12h' | '24h';

export interface InstructionStep {
  type: 'text' | 'image';
  content: string;
}

export interface SopOutput {
  title: string;
  steps: InstructionStep[];
}

export interface IncrementalSopOutput {
    steps: InstructionStep[];
}

export type RegenerationMode = 'regenerate' | 'shorter' | 'longer' | 'simpler' | 'professional';

export interface SessionData {
  title: string;
  steps: InstructionStep[];
  images: File[];
}

export interface SavedSession extends SessionData {
  id: number;
  createdAt: Date;
  modifiedAt?: Date;
}

// Types for JSON export/import
export interface ExportedImage {
    name: string;
    type: string;
    lastModified: number;
    data: string; // base64 data URL
}

export interface ExportedSession {
    title: string;
    steps: InstructionStep[];
    images: ExportedImage[];
}