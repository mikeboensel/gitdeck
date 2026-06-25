import "./env"; // MUST be first — sets NODE_ENV=production before the server/logger loads
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { app as honoApp } from "../../src/server/app";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { IPC } from "../shared/ipc";
import { initUpdater } from "./updater";

// electron-vite emits an ESM main bundle when package.json has "type":"module",
// and __dirname/__filename do not exist in ESM. Derive the dir from import.meta.
const MAIN_DIR = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// gitdeck Pattern A — the existing Hono server runs INSIDE the Electron main
// process on loopback. The renderer is a pure HTTP client (relative /api +
// BrowserRouter), so loading it from the loopback origin means zero renderer
// changes and keeps all privileged work (gh/git subprocess, the GitHub token)
// server-side, exactly where it already lives. See backend-integration.md.
// ─────────────────────────────────────────────────────────────────────────────

const API_HOST = "127.0.0.1";
const DEV_PORT = Number(process.env.PORT ?? 8765); // dev: must match the Vite proxy target
const DEV_RENDERER_URL = `http://${API_HOST}:5180`; // app's Vite dev server (HMR)
const isDev = !app.isPackaged;

// Set once the server is listening: the origin the window loads and the only
// origin trusted for navigation + IPC.
let appOrigin = "";

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    // Dev matches the Vite proxy on a fixed port; packaged uses an ephemeral
    // port (0) so it never collides with a running dev server or second instance.
    const port = isDev ? DEV_PORT : 0;
    serve({ fetch: honoApp.fetch, port, hostname: API_HOST }, (info) => {
      appOrigin = isDev ? DEV_RENDERER_URL : `http://${API_HOST}:${info.port}`;
      resolve();
    });
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(MAIN_DIR, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(appOrigin)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadURL(appOrigin);
  return win;
}

function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  return (event.senderFrame?.url ?? "").startsWith(appOrigin);
}

function registerIpc(): void {
  ipcMain.handle(IPC.ping, (event) => {
    if (!isTrustedSender(event)) throw new Error("untrusted IPC sender");
    return "pong";
  });
  // gitdeck needs no domain IPC: the renderer talks to the in-main server over
  // HTTP. Add channels here only for native-only needs (tray, OS dialogs).
}

app.whenReady().then(async () => {
  await startServer();
  registerIpc();
  createWindow();
  initUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
