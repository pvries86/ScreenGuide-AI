const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isSecureStorageAvailable: async () => {
    try {
      return await ipcRenderer.invoke('secure-store:is-available');
    } catch (error) {
      console.error('Failed to check secure storage availability', error);
      return false;
    }
  },
  getApiKey: async () => {
    try {
      return await ipcRenderer.invoke('secure-store:get-api-key');
    } catch (error) {
      console.error('Failed to load API key from secure storage', error);
      return '';
    }
  },
  setApiKey: async (apiKey) => {
    try {
      return await ipcRenderer.invoke('secure-store:set-api-key', String(apiKey));
    } catch (error) {
      console.error('Failed to save API key to secure storage', error);
      return false;
    }
  },
  deleteApiKey: async () => {
    try {
      return await ipcRenderer.invoke('secure-store:delete-api-key');
    } catch (error) {
      console.error('Failed to delete API key from secure storage', error);
      return false;
    }
  },
  captureScreenshot: async () => {
    try {
      return await ipcRenderer.invoke('capture:screenshot');
    } catch (error) {
      console.error('Failed to capture screenshot', error);
      return null;
    }
  },
  setRecordingEnabled: async (enabled) => {
    try {
      return await ipcRenderer.invoke('recording:set-enabled', Boolean(enabled));
    } catch (error) {
      console.error('Failed to toggle automatic recording', error);
      return false;
    }
  },
  onRecordingScreenshot: (callback) => {
    const listener = (_event, payload) => {
      if (typeof callback === 'function') {
        callback(payload);
      }
    };
    ipcRenderer.on('recording:screenshot', listener);
    return () => {
      ipcRenderer.removeListener('recording:screenshot', listener);
    };
  },
  onNativeRecordingState: (callback) => {
    const listener = (_event, payload) => {
      if (typeof callback === 'function') {
        callback(payload?.available === true);
      }
    };
    ipcRenderer.on('recording:native-state', listener);
    return () => {
      ipcRenderer.removeListener('recording:native-state', listener);
    };
  }
});
