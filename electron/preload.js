import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreenshot: async () => {
    try {
      return await ipcRenderer.invoke('capture:screenshot');
    } catch (error) {
      console.error('Failed to capture screenshot', error);
      return null;
    }
  }
});
