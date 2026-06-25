import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";

// The only bridge between privileged main and the untrusted renderer. gitdeck's
// renderer reaches the backend over HTTP (the in-main server), so this surface
// is intentionally tiny — just a liveness check today. Never expose raw
// ipcRenderer; add narrow typed methods here if a native-only need appears.
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IPC.ping),
};

contextBridge.exposeInMainWorld("api", api);

export type Api = typeof api;
