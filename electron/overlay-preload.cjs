const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  notifyClick: (details) => {
    ipcRenderer.send('overlay:click', {
      displayId: details?.displayId ?? null,
      screenX: details?.screenX ?? null,
      screenY: details?.screenY ?? null,
      button: details?.button ?? null,
      timestamp: Date.now()
    });
  }
});
