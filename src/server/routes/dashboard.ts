import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { getCIHealthCached } from "../ciHealth";
import { getCollaboratorsCached } from "../collaborators";
import { getIssuesCached, getPullRequestsCached, getReposCached } from "../dashboardData";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { cacheableJson } from "../openapi/respond";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const freshQuery = z.object({ fresh: z.string().optional() });

const errContent = { content: { "application/json": { schema: errEnvelope } } };

/** Build a cached, ETag-aware GET route definition with a success schema. */
function cachedRoute(path: string, schema: z.ZodTypeAny, description: string) {
  return createRoute({
    method: "get",
    path,
    tags: ["dashboard"],
    request: { query: freshQuery },
    responses: {
      200: { content: { "application/json": { schema } }, description },
      304: { description: "Not modified (ETag match)" },
      401: { ...errContent, description: "Authentication required" },
      500: { ...errContent, description: "Upstream error" },
    },
  });
}

const ReposResponse = okEnvelope({
  repos: z.array(z.unknown()),
  owners: z.array(z.string()),
  fetchedAt: z.string(),
}).openapi("ReposResponse");

const IssuesResponse = okEnvelope({
  issues: z.array(z.unknown()),
  owners: z.array(z.string()),
  fetchedAt: z.string(),
}).openapi("IssuesResponse");

const PullRequestsResponse = okEnvelope({
  pullRequests: z.array(z.unknown()),
  owners: z.array(z.string()),
  fetchedAt: z.string(),
}).openapi("PullRequestsResponse");

const CIHealthResponse = okEnvelope({
  repos: z.array(z.unknown()),
  fetchedAt: z.string(),
}).openapi("CIHealthResponse");

const CollaboratorsResponse = okEnvelope({
  byRepo: z.record(z.string(), z.array(z.string())),
  fetchedAt: z.string(),
}).openapi("CollaboratorsResponse");

export function registerDashboard(app: App): void {
  app.openapi(cachedRoute("/api/repos", ReposResponse, "Repositories"), async (c) => {
    const fresh = c.req.valid("query").fresh === "1";
    return cacheableJson(c, await getReposCached(fresh));
  });

  app.openapi(cachedRoute("/api/issues", IssuesResponse, "Open issues"), async (c) => {
    const fresh = c.req.valid("query").fresh === "1";
    return cacheableJson(c, await getIssuesCached(fresh));
  });

  app.openapi(cachedRoute("/api/prs", PullRequestsResponse, "Open pull requests"), async (c) => {
    const fresh = c.req.valid("query").fresh === "1";
    return cacheableJson(c, await getPullRequestsCached(fresh));
  });

  app.openapi(cachedRoute("/api/ci-health", CIHealthResponse, "CI health"), async (c) => {
    const fresh = c.req.valid("query").fresh === "1";
    return cacheableJson(c, await getCIHealthCached(fresh));
  });

  app.openapi(
    cachedRoute("/api/collaborators", CollaboratorsResponse, "Repo collaborators"),
    async (c) => {
      const fresh = c.req.valid("query").fresh === "1";
      return cacheableJson(c, await getCollaboratorsCached(fresh));
    },
  );
}
