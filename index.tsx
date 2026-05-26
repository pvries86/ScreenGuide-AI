
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Capture unhandled errors early and surface them to the main process when
// running inside Electron so we can debug packaged builds that otherwise
// appear blank. Falls back to localStorage when not available.
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).addEventListener('error', (ev: ErrorEvent) => {
    const payload = { message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, error: ev.error?.stack || String(ev.error) };
    try {
      // @ts-ignore - electronAPI is injected by preload in Electron builds
      if ((window as any).electronAPI && (window as any).electronAPI.sendRendererLog) {
        // prefer structured IPC when available
        (window as any).electronAPI.sendRendererLog(JSON.stringify(payload));
      } else {
        localStorage.setItem('screenguide_last_error', JSON.stringify(payload));
      }
    } catch (e) {
      try { localStorage.setItem('screenguide_last_error', JSON.stringify(payload)); } catch {};
    }
  });
} catch (e) {
  // ignore
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
