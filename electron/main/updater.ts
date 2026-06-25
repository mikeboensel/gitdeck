import { app } from "electron";
import { autoUpdater } from "electron-updater";

// Auto-update via electron-updater, reading the `publish` block in
// electron-builder.yml (GitHub Releases). Only signed builds update — unsigned
// dev builds are a no-op, which is why this returns early when not packaged.
export function initUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[updater] check failed:", err);
  });
}
