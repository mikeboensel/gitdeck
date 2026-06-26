// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The adapter only consumes getProviderConfig from accountStore; mock it with a
// stable config so the module-level configCache resolves deterministically.
vi.mock("../../../src/server/accountStore", () => ({
  getProviderConfig: vi.fn(async () => ({
    id: "pc1",
    kind: "forgejo" as const,
    label: "Forge",
    baseUrl: "https://forge.example",
    webUrl: "https://forge.example",
    userAgent: "gitdeck-test",
  })),
}));

import {
  fetchForgejoIssues,
  fetchForgejoNotifications,
  fetchForgejoOwners,
  fetchForgejoPullRequests,
  fetchForgejoRepos,
  markForgejoAllRead,
} from "../../../src/server/providers/forgejoData";
import type { Account } from "../../../src/server/providers/types";

// --- test plumbing -----------------------------------------------------------

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

/** Build a fake Response covering the surface the adapter touches. */
function res(opts: {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}): Response {
  const status = opts.status ?? 200;
  const ok = status >= 200 && status < 300;
  const text = opts.text ?? (opts.body !== undefined ? JSON.stringify(opts.body) : "");
  const headers = opts.headers ?? {};
  return {
    ok,
    status,
    text: async () => text,
    json: async () => (opts.body !== undefined ? opts.body : JSON.parse(text)),
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
    },
  } as unknown as Response;
}

function makeAccount(): Account {
  return {
    id: "acc1",
    providerKind: "forgejo",
    providerConfigId: "pc1",
    label: "Forge",
    login: "me",
    accessToken: "tok",
    scope: "",
    obtainedAt: "2020-01-01T00:00:00Z",
    source: "token",
  };
}

const REPO_BASE = {
  id: 1,
  description: null,
  html_url: "https://forge.example/o/a",
  forks_count: 0,
  updated_at: "2020-01-01T00:00:00Z",
};

// --- fetchForgejoRepos / normalizeRepo --------------------------------------

describe("fetchForgejoRepos (normalizeRepo)", () => {
  it("dedups repos by nameWithOwner across owners", async () => {
    const shared = { ...REPO_BASE, name: "x", full_name: "shared/x", owner: { login: "o" } };
    fetchMock.mockImplementation(async () => res({ body: [shared] }));
    const out = await fetchForgejoRepos(makeAccount(), ["o1", "o2"]);
    expect(out).toHaveLength(1);
    expect(out[0]?.nameWithOwner).toBe("shared/x");
  });

  it("picks stars_count, then stargazers_count, then 0 for the star count", async () => {
    const repos = [
      {
        ...REPO_BASE,
        name: "a",
        full_name: "o/a",
        owner: { login: "o" },
        stars_count: 5,
        stargazers_count: 99,
      },
      { ...REPO_BASE, name: "b", full_name: "o/b", owner: { login: "o" }, stargazers_count: 7 },
      { ...REPO_BASE, name: "c", full_name: "o/c", owner: { login: "o" } },
    ];
    fetchMock.mockResolvedValue(res({ body: repos }));
    const out = await fetchForgejoRepos(makeAccount(), ["o"]);
    expect(out.map((r) => r.stargazerCount)).toEqual([5, 7, 0]);
  });

  it("maps visibility private > internal > public", async () => {
    const repos = [
      {
        ...REPO_BASE,
        name: "p",
        full_name: "o/p",
        owner: { login: "o" },
        private: true,
        internal: true,
      },
      {
        ...REPO_BASE,
        name: "i",
        full_name: "o/i",
        owner: { login: "o" },
        private: false,
        internal: true,
      },
      { ...REPO_BASE, name: "u", full_name: "o/u", owner: { login: "o" } },
    ];
    fetchMock.mockResolvedValue(res({ body: repos }));
    const out = await fetchForgejoRepos(makeAccount(), ["o"]);
    expect(out.map((r) => r.visibility)).toEqual(["private", "internal", "public"]);
    expect(out.map((r) => r.isPrivate)).toEqual([true, false, false]);
  });

  it("falls back owner.login -> username -> empty string", async () => {
    const repos = [
      { ...REPO_BASE, name: "a", full_name: "o/a", owner: { login: "byLogin" } },
      { ...REPO_BASE, name: "b", full_name: "o/b", owner: { username: "byUsername" } },
      { ...REPO_BASE, name: "c", full_name: "o/c", owner: {} },
    ];
    fetchMock.mockResolvedValue(res({ body: repos }));
    const out = await fetchForgejoRepos(makeAccount(), ["o"]);
    expect(out.map((r) => r.owner.login)).toEqual(["byLogin", "byUsername", ""]);
  });
});

// --- fetchReposForOwner (user -> org fallback) ------------------------------

describe("fetchForgejoRepos (user/org fallback)", () => {
  it("returns [] when the user-repos call fails with a non-404 status", async () => {
    fetchMock.mockResolvedValue(res({ status: 500, text: "boom" }));
    const out = await fetchForgejoRepos(makeAccount(), ["acme"]);
    expect(out).toEqual([]);
  });

  it("falls back to /orgs/{owner}/repos when user repos 404", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/users/")) return res({ status: 404, text: "not found" });
      if (url.includes("/orgs/"))
        return res({
          body: [
            { ...REPO_BASE, name: "fromorg", full_name: "acme/fromorg", owner: { login: "acme" } },
          ],
        });
      return res({ status: 500 });
    });
    const out = await fetchForgejoRepos(makeAccount(), ["acme"]);
    expect(out.map((r) => r.nameWithOwner)).toEqual(["acme/fromorg"]);
  });
});

// --- fetchForgejoIssues / normalizeIssue ------------------------------------

const ISSUE_BASE = {
  id: 1,
  number: 10,
  title: "An issue",
  state: "open",
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-02T00:00:00Z",
  comments: 0,
};

describe("fetchForgejoIssues (normalizeIssue)", () => {
  it("filters out search entries that carry a pull_request field", async () => {
    const entries = [
      {
        ...ISSUE_BASE,
        number: 1,
        html_url: "https://forge.example/o/r/issues/1",
        user: { login: "x" },
        repository: { full_name: "o/r" },
      },
      {
        ...ISSUE_BASE,
        number: 2,
        html_url: "https://forge.example/o/r/pulls/2",
        user: { login: "x" },
        repository: { full_name: "o/r" },
        pull_request: { draft: false },
      },
    ];
    fetchMock.mockResolvedValue(res({ body: entries }));
    const out = await fetchForgejoIssues(makeAccount(), ["o"]);
    expect(out).toHaveLength(1);
    expect(out[0]?.number).toBe(1);
  });

  it("derives repository from repository.full_name when present", async () => {
    const entries = [
      {
        ...ISSUE_BASE,
        html_url: "https://forge.example/acme/widgets/issues/10",
        user: { login: "x" },
        repository: { full_name: "acme/widgets" },
      },
    ];
    fetchMock.mockResolvedValue(res({ body: entries }));
    const out = await fetchForgejoIssues(makeAccount(), ["acme"]);
    expect(out[0]?.repository).toEqual({ name: "widgets", nameWithOwner: "acme/widgets" });
  });

  it("parses repository from html_url path when repository.full_name is absent", async () => {
    const entries = [
      { ...ISSUE_BASE, html_url: "https://forge.example/bob/proj/issues/3", user: { login: "x" } },
    ];
    fetchMock.mockResolvedValue(res({ body: entries }));
    const out = await fetchForgejoIssues(makeAccount(), ["bob"]);
    expect(out[0]?.repository).toEqual({ name: "proj", nameWithOwner: "bob/proj" });
  });

  it("leaves author undefined when user is null and falls back to username for author/assignee", async () => {
    const entries = [
      {
        ...ISSUE_BASE,
        number: 1,
        html_url: "https://forge.example/o/r/issues/1",
        user: null,
        repository: { full_name: "o/r" },
        assignees: [{ username: "a1" }],
      },
      {
        ...ISSUE_BASE,
        number: 2,
        html_url: "https://forge.example/o/r/issues/2",
        user: { username: "u1" },
        repository: { full_name: "o/r" },
      },
    ];
    fetchMock.mockResolvedValue(res({ body: entries }));
    const out = await fetchForgejoIssues(makeAccount(), ["o"]);
    expect(out[0]?.author).toBeUndefined();
    expect(out[0]?.assignees?.[0]?.login).toBe("a1");
    expect(out[1]?.author?.login).toBe("u1");
  });
});

// --- fetchForgejoPullRequests / normalizePullRequest ------------------------

describe("fetchForgejoPullRequests (normalizePullRequest)", () => {
  it("normalizes draft, REVIEW_REQUIRED decision, and zeroed counts", async () => {
    const entries = [
      {
        ...ISSUE_BASE,
        number: 5,
        html_url: "https://forge.example/o/r/pulls/5",
        user: { login: "x" },
        repository: { full_name: "o/r" },
        pull_request: { draft: true },
      },
    ];
    fetchMock.mockResolvedValue(res({ body: entries }));
    const out = await fetchForgejoPullRequests(makeAccount(), ["o"]);
    expect(out[0]).toMatchObject({
      isDraft: true,
      reviewDecision: "REVIEW_REQUIRED",
      reviewsCount: 0,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    });
  });
});

// --- fetchForgejoNotifications / normalizeNotification ----------------------

describe("fetchForgejoNotifications (normalizeNotification)", () => {
  it("returns needsAuth on 401", async () => {
    fetchMock.mockResolvedValue(res({ status: 401 }));
    const out = await fetchForgejoNotifications(makeAccount(), null);
    expect(out).toEqual({ error: "authentication required", needsAuth: true });
  });

  it("returns an unrefreshed empty result on 304", async () => {
    fetchMock.mockResolvedValue(res({ status: 304, headers: { "last-modified": "yesterday" } }));
    const out = await fetchForgejoNotifications(makeAccount(), "yesterday");
    expect(out).toMatchObject({ refreshed: false, notifications: [], lastModified: "yesterday" });
  });

  it("sends an If-Modified-Since header when given a prior timestamp", async () => {
    fetchMock.mockResolvedValue(res({ status: 200, body: [] }));
    await fetchForgejoNotifications(makeAccount(), "Tue, 01 Jan 2020 00:00:00 GMT");
    const init = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers["If-Modified-Since"]).toBe("Tue, 01 Jan 2020 00:00:00 GMT");
  });

  it("maps a Pull subject to a /pulls/ URL and a PullRequest type", async () => {
    const notifs = [
      {
        id: 1,
        unread: true,
        updated_at: "2020-01-01T00:00:00Z",
        subject: {
          title: "PR",
          url: "https://forge.example/api/v1/repos/acme/widgets/issues/42",
          type: "Pull",
        },
        repository: {
          full_name: "acme/widgets",
          name: "widgets",
          html_url: "https://forge.example/acme/widgets",
        },
      },
      {
        id: 2,
        unread: false,
        updated_at: "2020-01-01T00:00:00Z",
        subject: {
          title: "Issue",
          url: "https://forge.example/api/v1/repos/acme/widgets/issues/7",
          type: "Issue",
        },
        repository: { full_name: "acme/widgets", html_url: "https://forge.example/acme/widgets" },
      },
    ];
    fetchMock.mockResolvedValue(res({ status: 200, body: notifs }));
    const out = await fetchForgejoNotifications(makeAccount(), null);
    if (!("notifications" in out)) throw new Error("expected a refreshed result");
    expect(out.notifications[0]?.itemNumber).toBe(42);
    expect(out.notifications[0]?.itemHtmlUrl).toBe("https://forge.example/acme/widgets/pulls/42");
    expect(out.notifications[0]?.subject.type).toBe("PullRequest");
    expect(out.notifications[1]?.itemHtmlUrl).toBe("https://forge.example/acme/widgets/issues/7");
    expect(out.notifications[1]?.subject.type).toBe("Issue");
  });

  it("nulls itemNumber and itemHtmlUrl when the subject has no url", async () => {
    const notifs = [
      {
        id: 3,
        unread: true,
        updated_at: "2020-01-01T00:00:00Z",
        subject: { title: "x", type: "Issue" },
        repository: { full_name: "a/b", html_url: "https://forge.example/a/b" },
      },
    ];
    fetchMock.mockResolvedValue(res({ status: 200, body: notifs }));
    const out = await fetchForgejoNotifications(makeAccount(), null);
    if (!("notifications" in out)) throw new Error("expected a refreshed result");
    expect(out.notifications[0]?.itemNumber).toBeNull();
    expect(out.notifications[0]?.itemHtmlUrl).toBeNull();
  });
});

// --- fetchForgejoOwners ------------------------------------------------------

describe("fetchForgejoOwners", () => {
  it("returns needsAuth when /user returns 401", async () => {
    fetchMock.mockResolvedValue(res({ status: 401, text: "unauthorized" }));
    const out = await fetchForgejoOwners(makeAccount());
    expect(out).toEqual({ ok: false, error: "authentication required", needsAuth: true });
  });

  it("dedups the user login with org logins and drops empties", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/user/orgs"))
        return res({
          body: [{ username: "org1" }, { name: "org2" }, { username: "" }, { username: "me" }],
        });
      return res({ body: { login: "me" } });
    });
    const out = await fetchForgejoOwners(makeAccount());
    expect(out).toEqual({ ok: true, owners: ["me", "org1", "org2"] });
  });
});

// --- markForgejoAllRead ------------------------------------------------------

describe("markForgejoAllRead", () => {
  it("PUTs to /repos/{repo}/notifications when a repo is given", async () => {
    fetchMock.mockResolvedValue(res({ status: 200, text: "" }));
    await markForgejoAllRead(makeAccount(), { repo: "acme/widgets" });
    const [url, init] = (fetchMock.mock.calls[0] ?? []) as [string, { method: string }];
    expect(url).toContain("/repos/acme/widgets/notifications");
    expect(init.method).toBe("PUT");
  });

  it("PUTs to /notifications when no repo is given", async () => {
    fetchMock.mockResolvedValue(res({ status: 200, text: "" }));
    await markForgejoAllRead(makeAccount(), {});
    const [url] = (fetchMock.mock.calls[0] ?? []) as [string];
    expect(url).toContain("/notifications?");
    expect(url).not.toContain("/repos/");
  });
});
