import type { HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { parseRepositoryName } from "../../utils/repository";
import { getLatestRepoDigest, handleDailyDigests } from "../digests";
import { ghApiJson, restApiPaginate } from "../githubClient";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { repoField } from "../openapi/params";
import { cacheableJson } from "../openapi/respond";
import { getRepoInsightsCached } from "../repoInsights";
import { fetchRepoSecuritySummary } from "../securityAlerts";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const errContent = { content: { "application/json": { schema: errEnvelope } } };

const RepoInsightsResponse = okEnvelope({
  generatedAt: z.string(),
  insights: z.array(z.unknown()),
}).openapi("RepoInsightsResponse");

const insightsRoute = createRoute({
  method: "get",
  path: "/api/repo-insights",
  tags: ["repo"],
  request: { query: z.object({ fresh: z.string().optional() }) },
  responses: {
    200: {
      content: { "application/json": { schema: RepoInsightsResponse } },
      description: "Repo insights",
    },
    304: { description: "Not modified (ETag match)" },
    500: { ...errContent, description: "Upstream error" },
  },
});

const RepoDetailsResponse = okEnvelope({
  meta: z.unknown(),
  languages: z.unknown(),
  contributors: z.unknown(),
  views: z.unknown(),
  releases: z.array(z.unknown()),
  security: z.unknown(),
  digest: z.unknown(),
  commits: z.unknown(),
  workflows: z.array(z.unknown()),
  errors: z.unknown(),
}).openapi("RepoDetailsResponse");

const detailsRoute = createRoute({
  method: "get",
  path: "/api/repo-details",
  tags: ["repo"],
  request: { query: z.object({ repo: repoField }) },
  responses: {
    200: {
      content: { "application/json": { schema: RepoDetailsResponse } },
      description: "Repo details",
    },
    400: { ...errContent, description: "Invalid request" },
  },
});

interface ReleaseRecord {
  id: number;
  name: string | null;
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at?: string | null;
  assets?: Array<{
    id: number;
    name: string;
    download_count: number;
    size?: number;
    browser_download_url?: string;
  }>;
}

export function registerDelegated(app: App): void {
  app.openapi(insightsRoute, async (c) => {
    const fresh = c.req.valid("query").fresh === "1";
    return cacheableJson(c, await getRepoInsightsCached(fresh));
  });

  app.openapi(detailsRoute, async (c) => {
    const { repo } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);

    const [
      meta,
      languages,
      contributors,
      commits,
      workflows,
      views,
      releases,
      repoDigest,
      security,
    ] = await Promise.all([
      ghApiJson(`/repos/${repo}`),
      ghApiJson(`/repos/${repo}/languages`),
      restApiPaginate(`/repos/${repo}/contributors?per_page=100&anon=1`),
      ghApiJson(`/repos/${repo}/commits?per_page=20`),
      ghApiJson(`/repos/${repo}/actions/runs?per_page=100`),
      ghApiJson(`/repos/${repo}/traffic/views`),
      restApiPaginate(`/repos/${repo}/releases?per_page=100`),
      getLatestRepoDigest(repo),
      fetchRepoSecuritySummary(repo),
    ]);

    const normalizedReleases = releases.ok
      ? ((releases.data as ReleaseRecord[] | null) ?? []).map((release) => {
          const assets = release.assets ?? [];
          return {
            ...release,
            assets,
            totalDownloads: assets.reduce((sum, asset) => sum + (asset.download_count || 0), 0),
          };
        })
      : [];

    return c.json(
      {
        ok: true as const,
        meta: meta.ok ? meta.data : null,
        languages: languages.ok ? languages.data : {},
        contributors: contributors.ok ? contributors.data : [],
        views: views.ok ? views.data : null,
        releases: normalizedReleases,
        security,
        digest: repoDigest,
        commits: commits.ok ? commits.data : [],
        workflows: workflows.ok
          ? ((workflows.data as { workflow_runs?: unknown[] } | null)?.workflow_runs ?? [])
          : [],
        errors: {
          meta: meta.ok ? null : meta.error,
          languages: languages.ok ? null : languages.error,
          contributors: contributors.ok ? null : contributors.error,
          views: views.ok ? null : views.error,
          releases: releases.ok ? null : releases.error,
          commits: commits.ok ? null : commits.error,
          workflows: workflows.ok ? null : workflows.error,
        },
      },
      200,
    );
  });

  // daily-digests is bridged to the existing handler (AI enrichment + disk I/O
  // side effects) via the raw Node res; it is intentionally not in the OpenAPI spec.
  app.get("/api/daily-digests", async (c) => {
    await handleDailyDigests(c.env.incoming, c.env.outgoing);
    return RESPONSE_ALREADY_SENT;
  });
}
