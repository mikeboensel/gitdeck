// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chunkDateRange,
  GitHubProvider,
  normalizeGitHubNotification,
  parseNextLink,
  type RawGitHubNotification,
} from "../../../src/server/providers/github";
import type { ProviderConfig } from "../../../src/server/providers/types";

const DAY = 24 * 60 * 60 * 1000;

describe("chunkDateRange", () => {
  it("returns a single chunk spanning from..to when within maxDays", () => {
    const from = "2026-01-01T00:00:00.000Z";
    const to = "2026-01-05T00:00:00.000Z";
    const chunks = chunkDateRange(from, to, 30);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ from, to });
  });

  it("splits a range longer than maxDays into non-overlapping chunks with a 1s gap", () => {
    const from = "2026-01-01T00:00:00.000Z";
    const to = "2026-01-21T00:00:00.000Z"; // 20 days
    const chunks = chunkDateRange(from, to, 7);
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk starts at `from`; last chunk ends at `to`.
    expect(chunks[0]?.from).toBe(from);
    expect(chunks.at(-1)?.to).toBe(to);
    // The deliberate 1s gap: chunk[1].from is exactly 1000ms after chunk[0].to.
    const firstEnd = new Date(chunks[0]?.to ?? "").getTime();
    const secondStart = new Date(chunks[1]?.from ?? "").getTime();
    expect(secondStart - firstEnd).toBe(1000);
    // Chunks never overlap: each `from` is strictly after the previous `to`.
    for (let i = 1; i < chunks.length; i++) {
      expect(new Date(chunks[i]?.from ?? "").getTime()).toBeGreaterThan(
        new Date(chunks[i - 1]?.to ?? "").getTime(),
      );
    }
  });

  it("yields a single chunk for a span exactly equal to maxDays", () => {
    const from = "2026-01-01T00:00:00.000Z";
    const to = new Date(new Date(from).getTime() + 7 * DAY).toISOString();
    const chunks = chunkDateRange(from, to, 7);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ from, to });
  });
});

describe("normalizeGitHubNotification", () => {
  function rawNotification(
    overrides: Omit<Partial<RawGitHubNotification>, "subject" | "repository"> & {
      subject?: Partial<RawGitHubNotification["subject"]>;
      repository?: Partial<RawGitHubNotification["repository"]> | undefined;
    } = {},
  ): RawGitHubNotification {
    const { subject, repository, ...rest } = overrides;
    return {
      id: "n1",
      unread: true,
      reason: "mention",
      updated_at: "2026-06-01T00:00:00Z",
      last_read_at: null,
      subject: {
        title: "Some title",
        url: "https://api.github.com/repos/o/r/issues/42",
        latest_comment_url: null,
        type: "Issue",
        ...subject,
      },
      repository: repository as RawGitHubNotification["repository"],
      ...rest,
    } as RawGitHubNotification;
  }

  it("returns null item fields when subject.url is null", () => {
    const result = normalizeGitHubNotification(
      rawNotification({
        subject: { url: null, type: "Issue" },
        repository: {
          name: "r",
          full_name: "o/r",
          private: false,
          html_url: "https://github.com/o/r",
        },
      }),
    );
    expect(result.itemNumber).toBeNull();
    expect(result.itemHtmlUrl).toBeNull();
  });

  it("does NOT match when the number is not $-anchored (e.g. .../pulls/123/comments)", () => {
    const result = normalizeGitHubNotification(
      rawNotification({
        subject: {
          url: "https://api.github.com/repos/o/r/pulls/123/comments",
          type: "PullRequest",
        },
        repository: {
          name: "r",
          full_name: "o/r",
          private: false,
          html_url: "https://github.com/o/r",
        },
      }),
    );
    expect(result.itemNumber).toBeNull();
    expect(result.itemHtmlUrl).toBeNull();
  });

  it("builds a SINGULAR /pull/ html url for a PullRequest subject", () => {
    const result = normalizeGitHubNotification(
      rawNotification({
        subject: {
          url: "https://api.github.com/repos/o/r/pulls/123",
          type: "PullRequest",
        },
        repository: {
          name: "r",
          full_name: "o/r",
          private: false,
          html_url: "https://github.com/o/r",
        },
      }),
    );
    expect(result.itemNumber).toBe(123);
    // Singular /pull/ (GitHub web), not the plural /pulls/ of the API url (contrast: Forgejo /pulls/).
    expect(result.itemHtmlUrl).toBe("https://github.com/o/r/pull/123");
  });

  it("builds an /issues/ html url for an Issue subject", () => {
    const result = normalizeGitHubNotification(
      rawNotification({
        subject: {
          url: "https://api.github.com/repos/o/r/issues/7",
          type: "Issue",
        },
        repository: {
          name: "r",
          full_name: "o/r",
          private: false,
          html_url: "https://github.com/o/r",
        },
      }),
    );
    expect(result.itemNumber).toBe(7);
    expect(result.itemHtmlUrl).toBe("https://github.com/o/r/issues/7");
  });

  it("falls back repository fields to empty strings when repository is absent", () => {
    const result = normalizeGitHubNotification(rawNotification({ repository: undefined }));
    expect(result.repository).toEqual({
      name: "",
      nameWithOwner: "",
      private: false,
      htmlUrl: "",
    });
    // With no repo html url and an Issue subject, the html url stays null.
    expect(result.itemHtmlUrl).toBe("/issues/42");
  });
});

describe("parseNextLink", () => {
  it("returns null when the header is null", () => {
    expect(parseNextLink(null)).toBeNull();
  });

  it('returns null when the header has no rel="next"', () => {
    const header =
      '<https://api.github.com/x?page=1>; rel="prev", <https://api.github.com/x?page=5>; rel="last"';
    expect(parseNextLink(header)).toBeNull();
  });

  it('extracts the rel="next" url from a multi-rel Link header', () => {
    const header =
      '<https://api.github.com/x?page=2>; rel="next", ' +
      '<https://api.github.com/x?page=5>; rel="last", ' +
      '<https://api.github.com/x?page=1>; rel="first"';
    expect(parseNextLink(header)).toBe("https://api.github.com/x?page=2");
  });
});

describe("GitHubProvider.pollDeviceFlow", () => {
  const config: ProviderConfig = {
    id: "github",
    kind: "github",
    label: "GitHub",
    baseUrl: "https://api.github.com",
    webUrl: "https://github.com",
    oauthDeviceCodeUrl: "https://github.com/login/device/code",
    oauthTokenUrl: "https://github.com/login/oauth/access_token",
    oauthClientId: "cid",
    userAgent: "gitdeck-test",
  };

  function textResponse(obj: unknown) {
    return { ok: true, status: 200, text: async () => JSON.stringify(obj) };
  }
  function jsonResponse(obj: unknown) {
    return { ok: true, status: 200, json: async () => obj };
  }

  // Start a device flow so `pending` is populated, returning the active deviceCode.
  async function started(fetchMock: ReturnType<typeof vi.fn>, interval = 5) {
    const provider = new GitHubProvider(config);
    fetchMock.mockResolvedValueOnce(
      textResponse({
        device_code: "DC",
        user_code: "WXYZ",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval,
      }),
    );
    const start = await provider.startDeviceFlow();
    return { provider, deviceCode: start.deviceCode };
  }

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears pending and reports denied on access_denied, so a re-poll sees no pending flow", async () => {
    const { provider, deviceCode } = await started(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "access_denied" }));

    const first = await provider.pollDeviceFlow(deviceCode);
    expect(first).toEqual({ status: "denied" });

    // Pending was cleared: a second poll short-circuits before any fetch.
    const callsBefore = fetchMock.mock.calls.length;
    const second = await provider.pollDeviceFlow(deviceCode);
    expect(second).toEqual({ status: "error", error: "no pending device flow" });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("clears pending and reports expired on expired_token", async () => {
    const { provider, deviceCode } = await started(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "expired_token" }));

    const first = await provider.pollDeviceFlow(deviceCode);
    expect(first).toEqual({ status: "expired" });

    const second = await provider.pollDeviceFlow(deviceCode);
    expect(second).toEqual({ status: "error", error: "no pending device flow" });
  });

  it("returns pending and keeps the flow alive on authorization_pending", async () => {
    const { provider, deviceCode } = await started(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "authorization_pending" }));

    const result = await provider.pollDeviceFlow(deviceCode);
    expect(result).toEqual({ status: "pending" });

    // Still pending: re-poll would hit throttle (not "no pending device flow").
    const second = await provider.pollDeviceFlow(deviceCode);
    expect(second).toEqual({ status: "throttled" });
  });

  it("bumps the poll interval via Math.max on slow_down", async () => {
    const { provider, deviceCode } = await started(fetchMock, 5);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "slow_down", interval: 10 }));

    const result = await provider.pollDeviceFlow(deviceCode);
    expect(result).toEqual({ status: "throttled", interval: 10 });

    // The mutated pending interval was bumped from 5 up to 10.
    const pending = (provider as unknown as { pending: { interval: number } | null }).pending;
    expect(pending?.interval).toBe(10);
  });
});
