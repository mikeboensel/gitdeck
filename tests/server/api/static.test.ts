// @vitest-environment node
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Pin the static-asset roots to fixed, in-test paths so the traversal guard and
// content-type mapping can be exercised without a real `dist/client` build.
// vi.hoisted so the values exist before the (hoisted) vi.mock factory runs.
const { CLIENT_DIR, CLIENT_INDEX_PATH, SOURCE_INDEX_PATH } = vi.hoisted(() => ({
  CLIENT_DIR: "/srv/client",
  CLIENT_INDEX_PATH: "/srv/client/index.html",
  SOURCE_INDEX_PATH: "/srv/source-index.html",
}));

vi.mock("../../../src/server/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/server/config")>()),
  CLIENT_DIR,
  CLIENT_INDEX_PATH,
  SOURCE_INDEX_PATH,
}));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));

import { readFile } from "node:fs/promises";
import { app } from "../../../src/server/app";

const readFileMock = vi.mocked(readFile);

/** Reject everything (nothing exists) unless a test opts a path in. */
function existsOnly(present: Record<string, string | Buffer>) {
  readFileMock.mockImplementation((p: unknown) => {
    const key = String(p);
    if (key in present) return Promise.resolve(present[key] as never);
    return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  });
}

beforeEach(() => {
  readFileMock.mockReset();
  // Default: nothing on disk.
  readFileMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
});

describe("GET * static handler — content types", () => {
  it("serves a real CSS asset with the mapped content-type", async () => {
    existsOnly({ [resolve(CLIENT_DIR, "styles.css")]: "body{}" });
    const res = await app.request("/styles.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("body{}");
  });

  it("serves a JS asset with the javascript content-type", async () => {
    existsOnly({ [resolve(CLIENT_DIR, "app.js")]: "console.log(1)" });
    const res = await app.request("/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  });

  it("falls back to application/octet-stream for an unknown extension", async () => {
    existsOnly({ [resolve(CLIENT_DIR, "data.bin")]: Buffer.from([1, 2, 3]) });
    const res = await app.request("/data.bin");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("GET * static handler — SPA fallback & 404", () => {
  it("serves index.html for an extensionless (client-routed) path", async () => {
    existsOnly({ [CLIENT_INDEX_PATH]: "<!doctype html><div id=root>" });
    const res = await app.request("/dashboard/local");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toContain("id=root");
  });

  it("404s a path that has an extension but no matching file", async () => {
    const res = await app.request("/missing-bundle.js");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("not found");
  });

  it("500s when the index cannot be read (neither built nor source)", async () => {
    // Default beforeEach mock rejects every readFile, including both index paths.
    const res = await app.request("/some-spa-route");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("index.html not found");
  });

  it("falls back to the source index when the built index is missing", async () => {
    existsOnly({ [SOURCE_INDEX_PATH]: "<!doctype html><!-- dev -->" });
    const res = await app.request("/some-spa-route");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("dev");
  });
});

describe("GET * static handler — path traversal guard (security)", () => {
  /** Assert the handler never read a file outside CLIENT_DIR / the index paths. */
  function assertNoEscape() {
    for (const call of readFileMock.mock.calls) {
      const target = String(call[0]);
      const allowed =
        target.startsWith(CLIENT_DIR) ||
        target === CLIENT_INDEX_PATH ||
        target === SOURCE_INDEX_PATH;
      expect(allowed, `read escaped CLIENT_DIR: ${target}`).toBe(true);
    }
  }

  it("never reads outside CLIENT_DIR for a ../ traversal attempt", async () => {
    existsOnly({ [CLIENT_INDEX_PATH]: "<html>shell" });
    const res = await app.request("/../../../../etc/passwd");
    // URL-normalized to /etc/passwd → extensionless → SPA shell, NOT /etc/passwd.
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("shell");
    assertNoEscape();
    // Crucially, the real /etc/passwd path was never handed to readFile.
    for (const call of readFileMock.mock.calls) {
      expect(String(call[0])).not.toBe("/etc/passwd");
    }
  });

  it("never reads outside CLIENT_DIR for an encoded-traversal attempt", async () => {
    const res = await app.request("/..%2f..%2f..%2fetc%2fpasswd.txt");
    // Encoded slashes survive normalization but stay a literal segment under
    // CLIENT_DIR; missing + dotted filename → 404, no escape.
    expect(res.status).toBe(404);
    assertNoEscape();
  });
});
