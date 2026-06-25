import { builtinModules } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { defineConfig } from "electron-vite";

// gitdeck Pattern A (server-serves-SPA): electron-vite builds ONLY main +
// preload. The renderer is the app's existing `vite build` (dist/client),
// served by the in-main Hono server over loopback.
//
// Externalization strategy — BUNDLE, don't ship node_modules:
// Externalize ONLY what genuinely cannot be bundled into the main process:
//   - `electron`: provided by the runtime; bundling it breaks because it uses
//     __dirname to locate its native binary ("__dirname is not defined ...").
//   - node builtins: provided by the runtime.
// EVERYTHING ELSE (hono, @hono/*, zod, pino, electron-updater, …) is bundled
// into a single self-contained out/main/index.js. We deliberately do NOT rely
// on resolving node_modules from inside app.asar at runtime: under pnpm's
// symlinked store, electron-builder ships top-level deps but misses transitive
// ones (e.g. `zod` behind `@hono/zod-openapi`), yielding ERR_MODULE_NOT_FOUND at
// launch — one missing package at a time. Bundling makes the whole dependency
// tree a build-time concern and eliminates that entire class of failure.
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);
const external = (id: string): boolean =>
  id === "electron" || id.startsWith("node:") || nodeBuiltins.has(id);

// The main bundle is ESM (package.json "type":"module"), but bundled CJS deps
// (e.g. pino's real-require, lazy requires) expect `require`/`__dirname`/
// `__filename` to exist in module scope. Provide them at the top of the bundle.
const esmShimBanner = [
  'import { createRequire as __electronCreateRequire } from "node:module";',
  'import { fileURLToPath as __electronFileURLToPath } from "node:url";',
  'import { dirname as __electronDirname } from "node:path";',
  "const require = __electronCreateRequire(import.meta.url);",
  "const __filename = __electronFileURLToPath(import.meta.url);",
  "const __dirname = __electronDirname(__filename);",
].join("\n");

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external,
        input: { index: resolve(__dirname, "electron/main/index.ts") },
        output: { format: "es", banner: esmShimBanner },
      },
    },
  },
  preload: {
    // Preload imports only `electron` + first-party shared code, so the same
    // externalization applies (first-party gets bundled in).
    build: {
      rollupOptions: {
        external,
        input: { index: resolve(__dirname, "electron/preload/index.ts") },
      },
    },
  },
});
