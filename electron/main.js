import { app, BrowserWindow, desktopCapturer, ipcMain, screen } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";
// Resolve native helper executable path. In packaged apps this should prefer
// the unpacked copy under resources/app.asar.unpacked so the executable can
// be spawned from disk (executables inside app.asar are not directly runnable).
const nativeRelativeParts = [
  'native',
  'MouseHook',
  'bin',
  'Release',
  'net9.0-windows10.0.19041.0',
  'win-x64',
  'publish',
  'MouseHook.exe'
];

const candidateUnpackedMouseHook = path.join(process.resourcesPath, 'app.asar.unpacked', ...nativeRelativeParts);
const candidatePackagedMouseHook = path.join(__dirname, '..', ...nativeRelativeParts);

let mouseHookExecutablePath = candidatePackagedMouseHook;
try {
  if (fs.existsSync(candidateUnpackedMouseHook)) {
    mouseHookExecutablePath = candidateUnpackedMouseHook;
  } else if (fs.existsSync(candidatePackagedMouseHook)) {
    mouseHookExecutablePath = candidatePackagedMouseHook;
  }
} catch (e) {
  // ignore, will fall back to packaged path
}

console.log('Native mouse hook path resolved to:', mouseHookExecutablePath);

let mainWindow;
let recordingActive = false;
let isCapturing = false;
const overlayWindows = new Map();
let mouseHookProcess = null;
let mouseHookInterface = null;
let lastNativeCaptureAt = 0;
const MOUSE_HOOK_THROTTLE_MS = 450;

function broadcastNativeHookState(available) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('recording:native-state', { available });
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      // Prefer unpacked preload if present in app.asar.unpacked
      preload: (function() {
        const candidateUnpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'preload.cjs');
        const candidatePackaged = path.join(__dirname, 'preload.cjs');
        if (fs.existsSync(candidateUnpacked)) return candidateUnpacked;
        return candidatePackaged;
      })()
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.VITE_DEV_SERVER_URL && isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Prefer loading the unpacked dist if it's available. When assets are
    // unpacked (app.asar.unpacked) Chrome can load them via file:// reliably.
    const resourcesDist = path.join(process.resourcesPath, 'dist', 'index.html');
    const unpackedIndex = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html');
    const packagedIndex = path.join(__dirname, '..', 'dist', 'index.html');
    try {
      if (fs.existsSync(resourcesDist)) {
        mainWindow.loadURL(pathToFileURL(resourcesDist).href);
      } else if (fs.existsSync(unpackedIndex)) {
        mainWindow.loadURL(pathToFileURL(unpackedIndex).href);
      } else if (fs.existsSync(packagedIndex)) {
        mainWindow.loadURL(pathToFileURL(packagedIndex).href);
      } else {
        mainWindow.loadFile(packagedIndex);
      }
    } catch (err) {
      console.error('Failed to load renderer index.html', err);
    }
  }

  // Allow opening DevTools in packaged apps for debugging if the environment
  // variable OPEN_DEVTOOLS is set (useful to inspect renderer errors in release).
  if (!isDev && process.env.OPEN_DEVTOOLS === '1') {
    try {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } catch (err) {
      console.warn('Failed to open DevTools in production', err);
    }
  }
}

async function captureDisplayAtPoint(point) {
  try {
    const targetPoint = point ?? screen.getCursorScreenPoint();
    const targetDisplay = screen.getDisplayNearestPoint(targetPoint);
    if (!targetDisplay) {
      return null;
    }

    const { width, height } = targetDisplay.size;
    const scaleFactor = targetDisplay.scaleFactor || 1;
    const thumbnailSize = {
      width: Math.max(1, Math.floor(width * scaleFactor)),
      height: Math.max(1, Math.floor(height * scaleFactor))
    };

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize
    });

    const matchingSource =
      sources.find((source) => {
        return source.display_id === String(targetDisplay.id) || source.id.endsWith(String(targetDisplay.id));
      }) || sources[0];

    if (!matchingSource || matchingSource.thumbnail.isEmpty()) {
      return null;
    }

    return {
      dataUrl: matchingSource.thumbnail.toDataURL(),
      bounds: targetDisplay.bounds,
      scaleFactor,
      displayId: targetDisplay.id
    };
  } catch (error) {
    console.error('Failed to capture display screenshot', error);
    return null;
  }
}


async function handleCaptureRequest(point) {
  if (!recordingActive || isCapturing) {
    return;
  }

  isCapturing = true;
  try {
    let capturePoint;
    if (typeof point?.x === 'number' && typeof point?.y === 'number') {
      try {
        capturePoint = screen.screenToDipPoint({ x: point.x, y: point.y });
      } catch (conversionError) {
        console.warn('Failed to convert native point to DIP', conversionError);
        capturePoint = { x: point.x, y: point.y };
      }
    } else {
      capturePoint = screen.getCursorScreenPoint();
    }

    const captureResult = await captureDisplayAtPoint(capturePoint);
    let dataUrl = captureResult?.dataUrl ?? null;
    let pointerMeta = null;

    if (captureResult && capturePoint) {
      const relativeX = (capturePoint.x - captureResult.bounds.x) / captureResult.bounds.width;
      const relativeY = (capturePoint.y - captureResult.bounds.y) / captureResult.bounds.height;

      pointerMeta = {
        relative: {
          x: Math.min(Math.max(relativeX, 0), 1),
          y: Math.min(Math.max(relativeY, 0), 1)
        },
        absolute: {
          x: capturePoint.x,
          y: capturePoint.y
        },
        display: {
          id: captureResult.displayId,
          scaleFactor: captureResult.scaleFactor
        }
      };
    }

    if (!dataUrl && mainWindow && !mainWindow.isDestroyed()) {
      const image = await mainWindow.webContents.capturePage();
      dataUrl = image.toDataURL();
    }

    if (dataUrl && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('recording:screenshot', {
        dataUrl,
        pointer: pointerMeta,
        source: pointerMeta ? 'native' : 'fallback'
      });
    }
  } catch (error) {
    console.error('Automatic recording failed', error);
  } finally {
    isCapturing = false;
  }
}


function createOverlayForDisplay(display) {
  if (overlayWindows.has(display.id)) {
    return overlayWindows.get(display.id);
  }

  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      // Ensure the preload path points to an unpacked file when available.
      preload: (function() {
        const candidateUnpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'overlay-preload.cjs');
        const candidatePackaged = path.join(__dirname, 'overlay-preload.cjs');
        if (fs.existsSync(candidateUnpacked)) return candidateUnpacked;
        return candidatePackaged;
      })()
    }
  });

  overlay.setMenuBarVisibility(false);

  overlay.once("ready-to-show", () => {
    if (overlay.isDestroyed()) {
      return;
    }
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setVisibleOnAllWorkspaces(true);
    overlay.setBounds(display.bounds);
    if (typeof overlay.showInactive === "function") {
      overlay.showInactive();
    } else {
      overlay.show();
    }
  });

  overlay.on("closed", () => {
    overlayWindows.delete(display.id);
  });

  // Load overlay HTML from unpacked electron folder if available to avoid file:// inside app.asar
  const overlayHtmlUnpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'overlay.html');
  const overlayHtmlPackaged = path.join(__dirname, 'overlay.html');
  if (fs.existsSync(overlayHtmlUnpacked)) {
    overlay.loadFile(overlayHtmlUnpacked, { search: `?displayId=${display.id}` });
  } else {
    overlay.loadFile(overlayHtmlPackaged, { search: `?displayId=${display.id}` });
  }

  overlayWindows.set(display.id, overlay);
  return overlay;
}

function destroyOverlays() {
  for (const overlay of overlayWindows.values()) {
    if (!overlay.isDestroyed()) {
      overlay.close();
    }
  }
  overlayWindows.clear();
}

function startNativeMouseHook() {
  if (process.platform !== 'win32') {
    broadcastNativeHookState(false);
    return false;
  }

  if (mouseHookProcess) {
    broadcastNativeHookState(true);
    return true;
  }

  if (!fs.existsSync(mouseHookExecutablePath)) {
    console.warn('Mouse hook helper executable not found at expected path:', mouseHookExecutablePath, '; global capture limited to overlays.');
    broadcastNativeHookState(false);
    return false;
  }

  // Try to spawn the helper from the resolved path. If that fails with ENOENT
  // (not found), attempt the alternative candidate (unpacked vs packaged).
  const unpackedCandidate = path.join(process.resourcesPath, 'app.asar.unpacked', ...nativeRelativeParts);
  const packagedCandidate = path.join(__dirname, '..', ...nativeRelativeParts);

  const trySpawn = (exePath) => {
    try {
      console.log('Spawning MouseHook from:', exePath);
      const proc = spawn(exePath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stderr?.on('data', (chunk) => {
        console.error('Mouse hook stderr:', chunk.toString().trim());
      });
      proc.on('error', (error) => {
        console.error('Mouse hook spawn error for', exePath, error);
      });
      return proc;
    } catch (e) {
      console.error('Exception while spawning MouseHook from', exePath, e);
      return null;
    }
  };

  // Prefer unpacked candidate if present
  if (fs.existsSync(unpackedCandidate)) {
    mouseHookProcess = trySpawn(unpackedCandidate);
  }

  // If spawning from unpacked candidate didn't succeed, try packaged candidate
  if (!mouseHookProcess && fs.existsSync(packagedCandidate)) {
    mouseHookProcess = trySpawn(packagedCandidate);
  }

  if (!mouseHookProcess) {
    console.error('Failed to spawn MouseHook executable from both unpacked and packaged candidates:', { unpackedCandidate, packagedCandidate });
    broadcastNativeHookState(false);
    return false;
  }

  lastNativeCaptureAt = 0;
  broadcastNativeHookState(true);

  mouseHookProcess.on('error', (error) => {
    console.error('Mouse hook spawn failed (final):', error);
    stopNativeMouseHook();
  });

  mouseHookProcess.on('exit', () => {
    mouseHookProcess = null;
    if (mouseHookInterface) {
      mouseHookInterface.close();
      mouseHookInterface = null;
    }
    broadcastNativeHookState(false);
  });

  mouseHookProcess.stderr?.on('data', (chunk) => {
    console.error('Mouse hook error:', chunk.toString().trim());
  });

  mouseHookInterface = readline.createInterface({ input: mouseHookProcess.stdout });
  mouseHookInterface.on('line', (line) => {
    try {
      const payload = JSON.parse(line);
      if (!payload || typeof payload !== 'object' || payload?.type !== 'left_down') {
        return;
      }

      if (typeof payload.x === 'number' && typeof payload.y === 'number') {
        let insideWindow = false;

        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            const bounds = mainWindow.getBounds();
            const dipPoint = screen.screenToDipPoint({ x: payload.x, y: payload.y });
            insideWindow =
              dipPoint.x >= bounds.x &&
              dipPoint.x <= bounds.x + bounds.width &&
              dipPoint.y >= bounds.y &&
              dipPoint.y <= bounds.y + bounds.height;
          } catch (windowCheckError) {
            console.warn('Failed to evaluate native click against window bounds', windowCheckError);
          }
        }

        if (insideWindow) {
          return;
        }

        const now = Date.now();
        if (now - lastNativeCaptureAt < MOUSE_HOOK_THROTTLE_MS) {
          return;
        }
        lastNativeCaptureAt = now;
        void handleCaptureRequest({ x: payload.x, y: payload.y });
      }
    } catch (error) {
      console.error('Failed to parse mouse hook payload', line, error);
    }
  });

  return true;
}

function stopNativeMouseHook() {
  let wasActive = false;

  if (mouseHookInterface) {
    mouseHookInterface.close();
    mouseHookInterface = null;
    wasActive = true;
  }

  if (mouseHookProcess) {
    mouseHookProcess.kill('SIGTERM');
    mouseHookProcess = null;
    wasActive = true;
  }

  broadcastNativeHookState(false);
  return wasActive;
}


function startGlobalRecording() {
  if (recordingActive) {
    return startNativeMouseHook();
  }

  recordingActive = true;
  screen.getAllDisplays().forEach(createOverlayForDisplay);
  return startNativeMouseHook();
}

function stopGlobalRecording() {
  if (!recordingActive) {
    return stopNativeMouseHook();
  }

  recordingActive = false;
  destroyOverlays();
  return stopNativeMouseHook();
}


function registerIpcHandlers() {
  ipcMain.handle("capture:screenshot", async () => {
    // captureDisplayAtPoint returns an object { dataUrl, bounds, scaleFactor, displayId }
    // Ensure we return only the dataUrl string to the renderer so callers that
    // expect a string don't receive an object and attempt string operations.
    const captureResult = await captureDisplayAtPoint();
    if (captureResult && typeof captureResult.dataUrl === 'string') {
      return captureResult.dataUrl;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      const image = await mainWindow.webContents.capturePage();
      return image.toDataURL();
    }

    return null;
  });

  ipcMain.handle("recording:set-enabled", async (_event, enabled) => {
    if (enabled) {
      return startGlobalRecording();
    }

    return stopGlobalRecording();
  });

  ipcMain.on("overlay:click", async (_event, payload) => {
    const point =
      typeof payload?.screenX === "number" && typeof payload?.screenY === "number"
        ? { x: payload.screenX, y: payload.screenY }
        : undefined;

    void handleCaptureRequest(point);
  });
}

// Simple IPC channel for renderer to send boot-time errors back to the main
// process. This is only used for debugging packaged builds.
try {
  ipcMain.on('renderer:log-error', (_event, payload) => {
    try {
      console.error('Renderer error reported:', payload);
    } catch (e) {
      console.error('Renderer error (failed to log payload)', e);
    }
  });
} catch (e) {
  // ignore registration failures
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.screenguide.ai");
  }

  screen.on("display-added", (_event, display) => {
    if (recordingActive) {
      createOverlayForDisplay(display);
    }
  });

  screen.on("display-removed", (_event, display) => {
    const overlay = overlayWindows.get(display.id);
    if (overlay && !overlay.isDestroyed()) {
      overlay.close();
    }
    overlayWindows.delete(display.id);
  });

  screen.on("display-metrics-changed", (_event, display) => {
    const overlay = overlayWindows.get(display.id);
    if (overlay && !overlay.isDestroyed()) {
      overlay.setBounds(display.bounds);
    }
  });

  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopGlobalRecording();
  if (process.platform !== "darwin") {
    app.quit();
  }
});




