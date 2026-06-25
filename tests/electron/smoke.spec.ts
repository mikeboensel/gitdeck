import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

// Smoke test: launch the built main bundle, assert a window opens and the
// hardened preload bridge is present (a contextIsolation/preload-path break
// makes window.api undefined). Run `pnpm build:electron` first so out/ exists.
test("app launches and exposes the preload bridge", async () => {
  const electronApp = await electron.launch({
    args: [join(__dirname, "../../out/main/index.js")],
  });

  const window = await electronApp.firstWindow();
  await expect(window.locator("body")).toBeVisible();

  const hasApi = await window.evaluate(
    () => typeof (window as unknown as { api?: { ping?: unknown } }).api?.ping === "function",
  );
  expect(hasApi).toBe(true);

  await electronApp.close();
});
