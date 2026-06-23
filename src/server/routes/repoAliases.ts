import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { isValidRepoName } from "../../utils/aliasQuery";
import { parseRepositoryName } from "../../utils/repository";
import { addAlias, getAliases, removeAlias } from "../aliasStore";
import { errEnvelope, okEnvelope } from "../openapi/envelope";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const repoField = z.string().openapi({ example: "octocat/Hello-World" });

const AliasesResponse = okEnvelope({ aliases: z.array(z.string()) }).openapi("AliasesResponse");

const jsonErr = { content: { "application/json": { schema: errEnvelope } } };
const ok200 = { content: { "application/json": { schema: AliasesResponse } } };

const getRoute = createRoute({
  method: "get",
  path: "/api/repo-aliases",
  tags: ["aliases"],
  request: { query: z.object({ repo: repoField }) },
  responses: {
    200: { ...ok200, description: "Aliases for the repository" },
    400: { ...jsonErr, description: "Invalid request" },
  },
});

const postRoute = createRoute({
  method: "post",
  path: "/api/repo-aliases",
  tags: ["aliases"],
  request: {
    query: z.object({ repo: repoField }),
    body: {
      content: {
        "application/json": { schema: z.object({ alias: z.string().optional() }) },
      },
    },
  },
  responses: {
    200: { ...ok200, description: "Updated alias list" },
    400: { ...jsonErr, description: "Invalid request" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/repo-aliases",
  tags: ["aliases"],
  request: { query: z.object({ repo: repoField, alias: z.string().optional() }) },
  responses: {
    200: { ...ok200, description: "Updated alias list" },
    400: { ...jsonErr, description: "Invalid request" },
  },
});

export function registerRepoAliases(app: App): void {
  app.openapi(getRoute, async (c) => {
    const { repo } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    const aliases = await getAliases(repo);
    return c.json({ ok: true as const, aliases }, 200);
  });

  app.openapi(postRoute, async (c) => {
    const { repo } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    const alias = (c.req.valid("json").alias ?? "").trim();
    if (!isValidRepoName(alias)) {
      return c.json({ ok: false as const, error: "alias must be in 'owner/repo' format" }, 400);
    }
    if (alias === repo) {
      return c.json({ ok: false as const, error: "alias cannot equal the repository name" }, 400);
    }
    const aliases = await addAlias(repo, alias);
    return c.json({ ok: true as const, aliases }, 200);
  });

  app.openapi(deleteRoute, async (c) => {
    const { repo, alias } = c.req.valid("query");
    if (!parseRepositoryName(repo))
      return c.json({ ok: false as const, error: "invalid repo" }, 400);
    const trimmed = (alias ?? "").trim();
    if (!trimmed) return c.json({ ok: false as const, error: "missing alias" }, 400);
    const aliases = await removeAlias(repo, trimmed);
    return c.json({ ok: true as const, aliases }, 200);
  });
}
