import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TTL_MS,
  getEtag,
  invalidate,
  isFresh,
  peek,
  set,
  setEtag,
  swr,
} from "../../src/api/cache";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  // Module-level Maps persist between tests — reset them.
  invalidate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("swr", () => {
  it("de-dupes concurrent callers onto a single in-flight fetch", async () => {
    const fetcher = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("value"), 50)),
    );

    const a = swr("k", fetcher);
    const b = swr("k", fetcher);

    await vi.advanceTimersByTimeAsync(50);
    const [av, bv] = await Promise.all([a.promise, b.promise]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(av).toBe("value");
    expect(bv).toBe("value");
  });

  it("fresh:true bypasses both the cache and the in-flight promise", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => `v${++n}`);

    // Seed the cache with a fresh value.
    await swr("k", fetcher).promise;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peek<string>("k")).toBe("v1");

    // fresh:true forces a new fetch even though the cached value is still fresh.
    const forced = swr("k", fetcher, { fresh: true });
    expect(await forced.promise).toBe("v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fresh:true is not registered as in-flight (no de-dupe with it)", async () => {
    const fetcher = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("x"), 50)),
    );

    // A fresh fetch in flight must not be reused by a subsequent non-fresh call.
    swr("k", fetcher, { fresh: true });
    swr("k", fetcher);

    await vi.advanceTimersByTimeAsync(50);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("isFresh / peek TTL semantics", () => {
  it("isFresh is true within the TTL and false after it expires", () => {
    set("k", "v", 1000);
    expect(isFresh("k")).toBe(true);

    vi.setSystemTime(1000);
    // expiresAt (1000) must be strictly greater than now (1000) → stale.
    expect(isFresh("k")).toBe(false);
  });

  it("isFresh stays true right up to the boundary", () => {
    set("k", "v", 1000);
    vi.setSystemTime(999);
    expect(isFresh("k")).toBe(true);
  });

  it("peek ignores TTL and returns the stale value, while isFresh reports false", () => {
    set("k", "v", 1000);
    vi.setSystemTime(5000);

    expect(peek<string>("k")).toBe("v");
    expect(isFresh("k")).toBe(false);
  });

  it("peek returns null for an unknown key", () => {
    expect(peek("missing")).toBeNull();
  });

  it("DEFAULT_TTL_MS is five minutes", () => {
    expect(DEFAULT_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe("invalidate", () => {
  it("with no key clears both values and etags", () => {
    set("a", "1");
    set("b", "2");
    setEtag("a", "etag-a");

    invalidate();

    expect(peek("a")).toBeNull();
    expect(peek("b")).toBeNull();
    expect(getEtag("a")).toBeUndefined();
  });

  it("with a key clears just that key (value + etag), leaving others", () => {
    set("a", "1");
    set("b", "2");
    setEtag("a", "etag-a");
    setEtag("b", "etag-b");

    invalidate("a");

    expect(peek("a")).toBeNull();
    expect(getEtag("a")).toBeUndefined();
    expect(peek<string>("b")).toBe("2");
    expect(getEtag("b")).toBe("etag-b");
  });
});

describe("in-flight cleanup on rejection", () => {
  it("a rejected fetch does not poison the next swr for the same key", async () => {
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });

    const first = swr("k", failing);
    await expect(first.promise).rejects.toThrow("boom");

    // The finally block deletes the in-flight entry only if it owns the promise,
    // so a fresh call should start a brand-new fetch rather than reuse the
    // rejected one.
    const ok = vi.fn(async () => "recovered");
    const second = swr("k", ok);
    expect(await second.promise).toBe("recovered");
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
