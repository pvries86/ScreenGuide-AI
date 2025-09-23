const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
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
