export {};

declare global {
  interface Window {
    electronAPI?: {
      captureScreenshot: () => Promise<string | null>;
    };
  }
}
