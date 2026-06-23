import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { buildMentionQuery } from "../../utils/aliasQuery";
import { nameWithOwnerFromApiUrl, parseRepositoryName } from "../../utils/repository";
import { getAliases } from "../aliasStore";
import { getToken, ghApiJson, restApi } from "../githubClient";
import { logger } from "../logger";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { repoField, upperEnum } from "../openapi/params";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

interface RestIssueSearchItem {
  number: number;
  title: string;
  html_url: string;
  state: string;
  pull_request?: unknown;
  user?: { login: string; html_url: string };
  repository_url: string;
  created_at: string;
  updated_at: string;
}

interface RestCodeSearchItem {
  path: string;
  html_url: string;
  repository: { full_name: string };
}

interface DependentItem {
  owner: string;
  repo: string;
  nameWithOwner: string;
  url: string;
  stars: number;
  forks: number;
  avatar: string;
}

/** Parse GitHub's `network/dependents` HTML page (no JSON API exists). */
function parseDependentsHtml(html: string): {
  items: DependentItem[];
  totalRepos: number;
  totalPackages: number;
  hasNextPage: boolean;
  nextCursor: string | null;
  hasPrevPage: boolean;
  prevCursor: string | null;
  notAvailable: boolean;
} {
  const notAvailable =
    /We haven(?:'|&#39;)t found any dependents for this repository yet/i.test(html) ||
    /This repository is not used by any other repository/i.test(html);

  const repoCountMatch = /([\d,]+)\s+Repositor(?:y|ies)/.exec(html);
  const pkgCountMatch = /([\d,]+)\s+Packages?/.exec(html);
  const totalRepos = repoCountMatch ? Number(repoCountMatch[1].replace(/,/g, "")) : 0;
  const totalPackages = pkgCountMatch ? Number(pkgCountMatch[1].replace(/,/g, "")) : 0;

  const items: DependentItem[] = [];
  const seen = new Set<string>();
  const rowMarker = '<div class="Box-row d-flex flex-items-center"';
  const pagMarker = 'class="paginate-container"';
  const parts = html.split(rowMarker);
  for (let i = 1; i < parts.length; i++) {
    let chunk = parts[i];
    const pagIdx = chunk.indexOf(pagMarker);
    if (pagIdx >= 0) chunk = chunk.substring(0, pagIdx);

    const repoLinkMatch = /data-hovercard-type="repository"[^>]*href="\/([^"/]+)\/([^"?#]+)"/.exec(
      chunk,
    );
    if (!repoLinkMatch) continue;
    const owner = repoLinkMatch[1];
    const repoName = repoLinkMatch[2];
    const nwo = `${owner}/${repoName}`;
    if (seen.has(nwo)) continue;
    seen.add(nwo);

    const starsMatch = /octicon-star[\s\S]{0,2000}?<\/svg>\s*([\d,]+)/.exec(chunk);
    const forksMatch = /octicon-repo-forked[\s\S]{0,2000}?<\/svg>\s*([\d,]+)/.exec(chunk);
    const avatarMatch =
      /<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/.exec(chunk) ||
      /<img[^>]*src="([^"]+)"[^>]*class="[^"]*avatar/.exec(chunk);

    items.push({
      owner,
      repo: repoName,
      nameWithOwner: nwo,
      url: `https://github.com/${nwo}`,
      stars: starsMatch ? Number(starsMatch[1].replace(/,/g, "")) : 0,
      forks: forksMatch ? Number(forksMatch[1].replace(/,/g, "")) : 0,
      avatar: avatarMatch ? avatarMatch[1].replace(/&amp;/g, "&") : "",
    });
  }

  const nextMatch = /href="[^"]*dependents_after=([^"&]+)[^"]*"[^>]*>\s*Next\s*<\/a>/.exec(html);
  const prevMatch = /href="[^"]*dependents_before=([^"&]+)[^"]*"[^>]*>\s*Previous\s*<\/a>/.exec(
    html,
  );

  return {
    items,
    totalRepos,
    totalPackages,
    hasNextPage: !!nextMatch,
    nextCursor: nextMatch ? nextMatch[1] : null,
    hasPrevPage: !!prevMatch,
    prevCursor: prevMatch ? prevMatch[1] : null,
    notAvailable,
  };
}

const authErr = { content: { "application/json": { schema: errEnvelope } } };

const MentionIssuesResponse = okEnvelope({
  items: z.array(z.looseObject({})),
  totalCount: z.number(),
  aliases: z.array(z.string()),
}).openapi("MentionIssuesResponse");

const MentionCodeResponse = okEnvelope({
  items: z.array(z.looseObject({})),
  totalCount: z.number(),
  aliases: z.array(z.string()),
}).openapi("MentionCodeResponse");

const ReferrersResponse = okEnvelope({
  forbidden: z.boolean(),
  referrers: z.unknown(),
  paths: z.unknown(),
  views: z.unknown(),
  clones: z.unknown(),
}).openapi("ReferrersResponse");

const DependentItemSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  nameWithOwner: z.string(),
  url: z.string(),
  stars: z.number(),
  forks: z.number(),
  avatar: z.string(),
});

const DependentsResponse = okEnvelope({
  type: z.enum(["REPOSITORY", "PACKAGE"]).optional(),
  items: z.array(DependentItemSchema),
  totalRepos: z.number(),
  totalPackages: z.number(),
  hasNextPage: z.boolean(),
  nextCursor: z.string().nullable(),
  hasPrevPage: z.boolean(),
  prevCursor: z.string().nullable(),
  notAvailable: z.boolean(),
}).openapi("DependentsResponse");

const issuesRoute = createRoute({
  method: "get",
  path: "/api/mentions/issues",
  tags: ["mentions"],
  request: { query: z.object({ repo: repoField }) },
  responses: {
    200: {
      content: { "application/json": { schema: MentionIssuesResponse } },
      description: "Issue/PR mentions",
    },
    400: { ...authErr, description: "Invalid request" },
    401: { ...authErr, description: "Authentication required" },
    500: { ...authErr, description: "Upstream error" },
  },
});

const codeRoute = createRoute({
  method: "get",
  path: "/api/mentions/code",
  tags: ["mentions"],
  request: { query: z.object({ repo: repoField }) },
  responses: {
    200: {
      content: { "application/json": { schema: MentionCodeResponse } },
      description: "Code mentions",
    },
    400: { ...authErr, description: "Invalid request" },
    401: { ...authErr, description: "Authentication required" },
    500: { ...authErr, description: "Upstream error" },
  },
});

const referrersRoute = createRoute({
  method: "get",
  path: "/api/mentions/referrers",
  tags: ["mentions"],
  request: { query: z.object({ repo: repoField }) },
  responses: {
    200: {
      content: { "application/json": { schema: ReferrersResponse } },
      description: "Traffic referrers",
    },
    400: { ...authErr, description: "Invalid request" },
  },
});

const dependentsRoute = createRoute({
  method: "get",
  path: "/api/mentions/dependents",
  tags: ["mentions"],
  request: {
    query: z.object({
      repo: repoField,
      type: upperEnum(["REPOSITORY", "PACKAGE"], "REPOSITORY"),
      after: z.string().optional(),
      before: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: DependentsResponse } },
      description: "Dependents",
    },
    400: { ...authErr, description: "Invalid request" },
    500: { ...authErr, description: "Upstream error" },
    502: { ...authErr, description: "GitHub returned a non-OK status" },
  },
});

export function registerMentions(app: App): void {
  app.openapi(issuesRoute, async (c) => {
    const { repo } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    const aliases = await getAliases(repo);
    const selfNames = new Set([repo, ...aliases]);
    const query = buildMentionQuery(repo, aliases);
    const path = `/search/issues?q=${encodeURIComponent(query)}&per_page=100`;
    const result = await restApi<{ items: RestIssueSearchItem[] }>(path);
    if (!result.ok) {
      if (result.status === 401) {
        return c.json(
          { ok: false as const, error: "authentication required", needsAuth: true },
          401,
        );
      }
      return c.json({ ok: false as const, error: result.error }, 500);
    }
    const items = (result.data.items ?? [])
      .map((entry) => ({
        repository: { nameWithOwner: nameWithOwnerFromApiUrl(entry.repository_url) },
        title: entry.title,
        url: entry.html_url,
        number: entry.number,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
        state: entry.state,
        isPullRequest: Boolean(entry.pull_request),
        // Omit the key when absent (matches the legacy wire output: JSON.stringify
        // drops `undefined`, and `undefined` is not a JSON value for the schema).
        ...(entry.user ? { author: { login: entry.user.login, url: entry.user.html_url } } : {}),
      }))
      .filter((entry) => !selfNames.has(entry.repository.nameWithOwner));
    return c.json({ ok: true as const, items, totalCount: items.length, aliases }, 200);
  });

  app.openapi(codeRoute, async (c) => {
    const { repo } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    const aliases = await getAliases(repo);
    const selfNames = new Set([repo, ...aliases]);
    const query = buildMentionQuery(repo, aliases);
    const path = `/search/code?q=${encodeURIComponent(query)}&per_page=100`;
    const result = await restApi<{ items: RestCodeSearchItem[] }>(path);
    if (!result.ok) {
      if (result.status === 401) {
        return c.json(
          { ok: false as const, error: "authentication required", needsAuth: true },
          401,
        );
      }
      return c.json({ ok: false as const, error: result.error }, 500);
    }
    const items = (result.data.items ?? [])
      .map((entry) => ({
        repository: { nameWithOwner: entry.repository.full_name },
        path: entry.path,
        url: entry.html_url,
      }))
      .filter((entry) => !selfNames.has(entry.repository.nameWithOwner));
    return c.json({ ok: true as const, items, totalCount: items.length, aliases }, 200);
  });

  app.openapi(referrersRoute, async (c) => {
    const { repo } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    const [refs, paths, views, clones] = await Promise.all([
      ghApiJson(`/repos/${repo}/traffic/popular/referrers`),
      ghApiJson(`/repos/${repo}/traffic/popular/paths`),
      ghApiJson(`/repos/${repo}/traffic/views`),
      ghApiJson(`/repos/${repo}/traffic/clones`),
    ]);
    const anyForbidden = [refs, paths, views, clones].some(
      (r) => !r.ok && (r.status === 403 || /403|forbidden/i.test(r.error)),
    );
    return c.json(
      {
        ok: true as const,
        forbidden: anyForbidden,
        referrers: refs.ok ? refs.data : [],
        paths: paths.ok ? paths.data : [],
        views: views.ok ? views.data : null,
        clones: clones.ok ? clones.data : null,
      },
      200,
    );
  });

  app.openapi(dependentsRoute, async (c) => {
    const { repo, type, after, before } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    try {
      const params = new URLSearchParams({ dependent_type: type });
      if (after) params.set("dependents_after", after);
      if (before) params.set("dependents_before", before);
      const pageUrl = `https://github.com/${repo}/network/dependents?${params.toString()}`;
      const token = await getToken().catch(() => "");
      const resp = await fetch(pageUrl, {
        headers: {
          "User-Agent": "gitdeck/1.0 (+local)",
          Accept: "text/html",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        redirect: "follow",
      });
      if (resp.status === 404) {
        return c.json(
          {
            ok: true as const,
            items: [],
            totalRepos: 0,
            totalPackages: 0,
            hasNextPage: false,
            nextCursor: null,
            hasPrevPage: false,
            prevCursor: null,
            notAvailable: true,
          },
          200,
        );
      }
      if (!resp.ok) {
        return c.json({ ok: false as const, error: `GitHub returned HTTP ${resp.status}` }, 502);
      }
      const html = await resp.text();
      const parsed = parseDependentsHtml(html);
      return c.json({ ok: true as const, type, ...parsed }, 200);
    } catch (e: unknown) {
      logger.error({ err: e }, "mentions request failed");
      return c.json({ ok: false as const, error: (e as Error).message || String(e) }, 500);
    }
  });
}
