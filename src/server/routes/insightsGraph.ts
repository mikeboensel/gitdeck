import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { parseRepositoryName } from "../../utils/repository";
import { gql } from "../githubClient";
import { logger } from "../logger";
import { errEnvelope, okEnvelope } from "../openapi/envelope";
import { pageInfo, repoField, upperEnum } from "../openapi/params";
import { isAuthError } from "../openapi/respond";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

const STARGAZERS_QUERY = `
query($owner:String!, $name:String!, $cursor:String, $direction:OrderDirection!) {
  repository(owner:$owner, name:$name) {
    stargazers(first:100, after:$cursor, orderBy:{field:STARRED_AT, direction:$direction}) {
      totalCount
      pageInfo { endCursor hasNextPage }
      edges { starredAt node { login avatarUrl url } }
    }
  }
}`;

const FORKS_QUERY = `
query($owner:String!, $name:String!, $cursor:String, $field:RepositoryOrderField!, $direction:OrderDirection!) {
  repository(owner:$owner, name:$name) {
    forks(first:100, after:$cursor, orderBy:{field:$field, direction:$direction}) {
      totalCount
      pageInfo { endCursor hasNextPage }
      nodes {
        nameWithOwner
        owner { login avatarUrl }
        stargazerCount
        forkCount
        pushedAt
        updatedAt
        createdAt
        url
        description
        primaryLanguage { name }
      }
    }
  }
}`;

const StargazersQuery = z.object({
  repo: repoField,
  direction: upperEnum(["ASC", "DESC"], "DESC"),
  cursor: z.string().optional(),
});

const StargazersResponse = okEnvelope({
  totalCount: z.number(),
  pageInfo,
  edges: z.array(
    z.looseObject({
      starredAt: z.string(),
      node: z.looseObject({ login: z.string(), avatarUrl: z.string(), url: z.string() }),
    }),
  ),
}).openapi("StargazersResponse");

const ForksQuery = z.object({
  repo: repoField,
  direction: upperEnum(["ASC", "DESC"], "DESC"),
  field: upperEnum(["PUSHED_AT", "UPDATED_AT", "CREATED_AT", "STARGAZERS", "NAME"], "PUSHED_AT"),
  cursor: z.string().optional(),
});

const ForksResponse = okEnvelope({
  totalCount: z.number(),
  pageInfo,
  nodes: z.array(z.looseObject({ nameWithOwner: z.string() })),
}).openapi("ForksResponse");

const jsonErr = (schema: typeof errEnvelope) => ({
  content: { "application/json": { schema } },
});

const stargazersRoute = createRoute({
  method: "get",
  path: "/api/stargazers",
  tags: ["insights"],
  request: { query: StargazersQuery },
  responses: {
    200: {
      content: { "application/json": { schema: StargazersResponse } },
      description: "Paginated stargazers for a repository",
    },
    400: { ...jsonErr(errEnvelope), description: "Invalid request" },
    401: { ...jsonErr(errEnvelope), description: "Authentication required" },
    500: { ...jsonErr(errEnvelope), description: "Upstream error" },
  },
});

const forksRoute = createRoute({
  method: "get",
  path: "/api/forks",
  tags: ["insights"],
  request: { query: ForksQuery },
  responses: {
    200: {
      content: { "application/json": { schema: ForksResponse } },
      description: "Paginated forks for a repository",
    },
    400: { ...jsonErr(errEnvelope), description: "Invalid request" },
    401: { ...jsonErr(errEnvelope), description: "Authentication required" },
    500: { ...jsonErr(errEnvelope), description: "Upstream error" },
  },
});

interface StargazersData {
  repository: {
    stargazers: {
      totalCount: number;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      edges: { starredAt: string; node: { login: string; avatarUrl: string; url: string } }[];
    };
  };
}

interface ForksData {
  repository: {
    forks: {
      totalCount: number;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      nodes: { nameWithOwner: string }[];
    };
  };
}

export function registerInsightsGraph(app: App): void {
  app.openapi(stargazersRoute, async (c) => {
    const { repo, direction, cursor } = c.req.valid("query");
    const parsed = parseRepositoryName(repo);
    if (!parsed) return c.json({ ok: false as const, error: "invalid repo" }, 400);
    try {
      const data = await gql<StargazersData>(STARGAZERS_QUERY, {
        owner: parsed[0],
        name: parsed[1],
        cursor: cursor ?? null,
        direction,
      });
      return c.json({ ok: true as const, ...data.repository.stargazers }, 200);
    } catch (e) {
      logger.error({ err: e }, "insights graph request failed");
      if (isAuthError(e)) {
        return c.json({ ok: false as const, error: (e as Error).message, needsAuth: true }, 401);
      }
      return c.json({ ok: false as const, error: (e as Error).message }, 500);
    }
  });

  app.openapi(forksRoute, async (c) => {
    const { repo, direction, field, cursor } = c.req.valid("query");
    const parsed = parseRepositoryName(repo);
    if (!parsed) return c.json({ ok: false as const, error: "invalid repo" }, 400);
    try {
      const data = await gql<ForksData>(FORKS_QUERY, {
        owner: parsed[0],
        name: parsed[1],
        cursor: cursor ?? null,
        direction,
        field,
      });
      return c.json({ ok: true as const, ...data.repository.forks }, 200);
    } catch (e) {
      logger.error({ err: e }, "insights graph request failed");
      if (isAuthError(e)) {
        return c.json({ ok: false as const, error: (e as Error).message, needsAuth: true }, 401);
      }
      return c.json({ ok: false as const, error: (e as Error).message }, 500);
    }
  });
}
