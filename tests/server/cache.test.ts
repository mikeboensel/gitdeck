import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoize, memoizeByKey } from "../../src/server/cache";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("memoize", () => {
  it("caches the fetched value within the TTL", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, n: 1 }));
    const m = memoize(1000, fetcher);

    await m.get(false);
    await m.get(false);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after the TTL expires", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => ({ ok: true, n: ++n }));
    const m = memoize(1000, fetcher);

    expect((await m.get(false)).n).toBe(1);
    vi.setSystemTime(1001);
    expect((await m.get(false)).n).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("forceFresh bypasses a still-fresh cache", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => ({ ok: true, n: ++n }));
    const m = memoize(1000, fetcher);

    await m.get(false);
    expect((await m.get(true)).n).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent callers onto one in-flight fetch", async () => {
    const fetcher = vi.fn(
      () => new Promise<{ ok: true }>((resolve) => setTimeout(() => resolve({ ok: true }), 50)),
    );
    const m = memoize(1000, fetcher);

    const a = m.get(false);
    const b = m.get(false);
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([a, b]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shouldCache:false values are not cached (failures refetch)", async () => {
    const results = [
      { ok: false, n: 1 },
      { ok: true, n: 2 },
    ];
    const fetcher = vi.fn(async () => results.shift() ?? { ok: true, n: 0 });
    const m = memoize(1000, fetcher, { shouldCache: (v) => v.ok });

    expect((await m.get(false)).n).toBe(1); // failure — not cached
    expect((await m.get(false)).n).toBe(2); // refetched, success — cached
    await m.get(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("peek returns the value only while fresh, never fetches", async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    const m = memoize(1000, fetcher);

    expect(m.peek()).toBeNull();
    await m.get(false);
    expect(m.peek()).toEqual({ ok: true });
    vi.setSystemTime(1001);
    expect(m.peek()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("forwards forceFresh to the fetcher", async () => {
    const fetcher = vi.fn(async (_forceFresh: boolean) => ({ ok: true }));
    const m = memoize(1000, fetcher);

    await m.get(false);
    await m.get(true);

    expect(fetcher).toHaveBeenNthCalledWith(1, false);
    expect(fetcher).toHaveBeenNthCalledWith(2, true);
  });

  it("invalidate drops the cache", async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    const m = memoize(1000, fetcher);

    await m.get(false);
    m.invalidate();
    await m.get(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("memoizeByKey", () => {
  it("caches per key independently", async () => {
    const loader = vi.fn(async (key: string) => `v:${key}`);
    const m = memoizeByKey(1000, loader);

    expect(await m.get("a")).toBe("v:a");
    expect(await m.get("b")).toBe("v:b");
    expect(await m.get("a")).toBe("v:a");

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent loads of the same key", async () => {
    const loader = vi.fn(
      (key: string) => new Promise<string>((resolve) => setTimeout(() => resolve(`v:${key}`), 50)),
    );
    const m = memoizeByKey(1000, loader);

    const a = m.get("x");
    const b = m.get("x");
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([a, b]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("refetches a key after its TTL expires", async () => {
    let n = 0;
    const loader = vi.fn(async () => ++n);
    const m = memoizeByKey(1000, loader);

    expect(await m.get("k")).toBe(1);
    vi.setSystemTime(1001);
    expect(await m.get("k")).toBe(2);
  });

  it("invalidate(key) drops one key; invalidate() drops all", async () => {
    const loader = vi.fn(async (key: string) => `v:${key}`);
    const m = memoizeByKey(1000, loader);

    await m.get("a");
    await m.get("b");
    m.invalidate("a");
    await m.get("a"); // refetched
    await m.get("b"); // still cached
    expect(loader).toHaveBeenCalledTimes(3);

    m.invalidate();
    await m.get("a");
    await m.get("b");
    expect(loader).toHaveBeenCalledTimes(5);
  });
});
