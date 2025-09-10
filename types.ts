export type Language = 'en' | 'nl';

export type Theme = 'light' | 'dark';

export interface InstructionStep {
  type: 'text' | 'image';
  content: string;
}

export interface SopOutput {
  title: string;
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