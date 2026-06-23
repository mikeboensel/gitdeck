import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { HttpBindings } from "@hono/node-server";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { CLIENT_DIR, CLIENT_INDEX_PATH, SOURCE_INDEX_PATH } from "../config";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** The built client index, falling back to the source index in dev. */
async function readClientIndex(): Promise<string> {
  return readFile(CLIENT_INDEX_PATH, "utf-8").catch(() => readFile(SOURCE_INDEX_PATH, "utf-8"));
}

/**
 * Static-asset serving + SPA index fallback, registered last as the GET
 * catch-all (everything the typed/plain API routes above did not claim).
 * Mirrors the original `node:http` static handler: real files under
 * `CLIENT_DIR` win (with a path-traversal guard); extensionless paths fall back
 * to `index.html` for client-side routing; anything else is a 404.
 */
export function registerStatic(app: App): void {
  app.get("*", async (c) => {
    const pathname = new URL(c.req.url).pathname;

    // 1. Serve a real static asset if one exists (traversal-guarded).
    const cleanPath = pathname.replace(/^\/+/, "");
    const filePath = resolve(CLIENT_DIR, cleanPath);
    if (filePath.startsWith(CLIENT_DIR)) {
      try {
        const body = await readFile(filePath);
        return c.body(body, 200, {
          "Content-Type": STATIC_TYPES[extname(filePath)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
      } catch {
        // Not a file — fall through to SPA routing.
      }
    }

    // 2. SPA fallback: extensionless paths render the client shell.
    const lastSlash = pathname.lastIndexOf("/");
    const fileName = lastSlash >= 0 ? pathname.slice(lastSlash + 1) : pathname;
    if (!fileName.includes(".")) {
      try {
        return c.body(await readClientIndex(), 200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
      } catch {
        return c.text("index.html not found", 500);
      }
    }

    return c.text("not found", 404);
  });
}
