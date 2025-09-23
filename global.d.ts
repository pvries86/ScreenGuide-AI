export {};

declare global {
  interface Window {
    electronAPI?: {
      captureScreenshot: () => Promise<string | null>;
      setRecordingEnabled: (enabled: boolean) => Promise<boolean>;
      onRecordingScreenshot: (
        callback: (
          payload:
            | string
            | null
            | {
                dataUrl: string | null;
                pointer?: {
                  relative?: { x: number; y: number };
                  absolute?: { x: number; y: number };
                  display?: { id: number; scaleFactor: number };
                };
                source?: 'native' | 'fallback';
              }
        ) => void
      ) => () => void;
      onNativeRecordingState: (callback: (available: boolean) => void) => () => void;
    };
  }
}
