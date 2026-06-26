import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    // Non-default port (off the well-known 5173) so this can run alongside other
    // Vite projects. Mirrors package.json `config.ports.web`.
    port: 5180,
    proxy: {
      // `ws: true` forwards the terminal WebSocket upgrade (/api/terminal) to
      // the API server alongside the normal REST proxying.
      "/api": { target: "http://127.0.0.1:8765", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.ts"],
  },
});
