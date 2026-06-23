import type { HttpBindings } from "@hono/node-server";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { errorMessage } from "../../utils/errors";
import { gql } from "../githubClient";
import { logger } from "../logger";
import { errEnvelope, okEnvelope } from "../openapi/envelope";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

interface ProjectSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
  shortDescription: string | null;
  updatedAt?: string;
  items?: { totalCount: number };
  owner: { __typename: string; login?: string };
}

const PROJECT_SUMMARY_FIELDS = `
  id number title url closed shortDescription updatedAt
  items(first: 1) { totalCount }
  owner { __typename ... on User { login } ... on Organization { login } }
`;

const PROJECTS_LIST_QUERY = `
query {
  viewer {
    projectsV2(first: 50) {
      nodes { ${PROJECT_SUMMARY_FIELDS} }
    }
    repositories(first: 100, ownerAffiliations: [OWNER, COLLABORATOR]) {
      nodes {
        nameWithOwner
        projectsV2(first: 10) {
          nodes { ${PROJECT_SUMMARY_FIELDS} }
        }
      }
    }
    organizations(first: 50) {
      nodes {
        login
        projectsV2(first: 50) {
          nodes { ${PROJECT_SUMMARY_FIELDS} }
        }
        repositories(first: 50) {
          nodes {
            nameWithOwner
            projectsV2(first: 10) {
              nodes { ${PROJECT_SUMMARY_FIELDS} }
            }
          }
        }
      }
    }
  }
}`;

const PROJECT_QUERY = `
query($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on ProjectV2 {
      id number title url closed shortDescription
      owner { __typename ... on User { login } ... on Organization { login } }
      fields(first: 50) {
        nodes {
          __typename
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField {
            id name dataType
            options { id name color }
          }
          ... on ProjectV2IterationField {
            id name dataType
            configuration { iterations { id title startDate duration } }
          }
        }
      }
      items(first: 100, after: $cursor) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes {
          id isArchived type
          content {
            __typename
            ... on Issue {
              id number title url state
              repository { nameWithOwner }
              author { login url }
              labels(first: 10) { nodes { name color description } }
              assignees(first: 5) { nodes { login avatarUrl url } }
              createdAt updatedAt
            }
            ... on PullRequest {
              id number title url state isDraft
              repository { nameWithOwner }
              author { login url }
              labels(first: 10) { nodes { name color description } }
              assignees(first: 5) { nodes { login avatarUrl url } }
              createdAt updatedAt
            }
            ... on DraftIssue {
              id title
              assignees(first: 5) { nodes { login avatarUrl url } }
              createdAt updatedAt
            }
          }
          fieldValues(first: 30) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                field { ... on ProjectV2FieldCommon { id name } }
                name optionId
              }
              ... on ProjectV2ItemFieldTextValue {
                field { ... on ProjectV2FieldCommon { id name } }
                text
              }
              ... on ProjectV2ItemFieldNumberValue {
                field { ... on ProjectV2FieldCommon { id name } }
                number
              }
              ... on ProjectV2ItemFieldDateValue {
                field { ... on ProjectV2FieldCommon { id name } }
                date
              }
              ... on ProjectV2ItemFieldIterationValue {
                field { ... on ProjectV2FieldCommon { id name } }
                title iterationId startDate duration
              }
            }
          }
        }
      }
    }
  }
}`;

const MOVE_MUTATION = `
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $fieldId
    value: { singleSelectOptionId: $optionId }
  }) { projectV2Item { id } }
}`;

const CLEAR_FIELD_MUTATION = `
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
  clearProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $fieldId
  }) { projectV2Item { id } }
}`;

function classifyProjectsError(msg: string): { needsScope: boolean; friendly: string } {
  if (/scope|permission|not been granted/i.test(msg)) {
    return {
      needsScope: true,
      friendly:
        "Your gh token lacks Projects v2 permissions.\n" +
        "Run in your terminal: gh auth refresh -h github.com -s project\n" +
        "(or 'read:project' if you only need to view).",
    };
  }
  return { needsScope: false, friendly: msg };
}

type RepoNode = { nameWithOwner: string; projectsV2?: { nodes: ProjectSummary[] } };

// 200-with-ok:false carries needsScope (token lacks Projects v2 permission).
const projectsErr = z
  .object({ ok: z.literal(false), needsScope: z.boolean(), error: z.string() })
  .openapi("ProjectsError");

const ProjectsResponse = z
  .union([okEnvelope({ projects: z.array(z.unknown()) }), projectsErr])
  .openapi("ProjectsResponse");

const ProjectResponse = z
  .union([okEnvelope({ project: z.unknown() }), projectsErr])
  .openapi("ProjectResponse");

const MoveResponse = z.union([okEnvelope({}), projectsErr]).openapi("ProjectMoveResponse");

const projectsRoute = createRoute({
  method: "get",
  path: "/api/projects",
  tags: ["projects"],
  responses: {
    200: {
      content: { "application/json": { schema: ProjectsResponse } },
      description: "Projects list",
    },
    500: {
      content: { "application/json": { schema: projectsErr } },
      description: "Upstream error",
    },
  },
});

const projectRoute = createRoute({
  method: "get",
  path: "/api/project",
  tags: ["projects"],
  request: { query: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectResponse } },
      description: "Project detail",
    },
    400: {
      content: { "application/json": { schema: errEnvelope } },
      description: "Invalid project id",
    },
    500: {
      content: { "application/json": { schema: projectsErr } },
      description: "Upstream error",
    },
  },
});

const moveRoute = createRoute({
  method: "post",
  path: "/api/project/move",
  tags: ["projects"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            projectId: z.string(),
            itemId: z.string(),
            fieldId: z.string(),
            optionId: z.string().nullable().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { "application/json": { schema: MoveResponse } }, description: "Move applied" },
    400: {
      content: { "application/json": { schema: errEnvelope } },
      description: "Invalid request",
    },
    500: {
      content: { "application/json": { schema: projectsErr } },
      description: "Upstream error",
    },
  },
});

interface ProjectResponseData {
  node: {
    id: string;
    number: number;
    title: string;
    url: string;
    closed: boolean;
    shortDescription: string | null;
    owner: { __typename: string; login?: string };
    fields: { nodes: unknown[] };
    items: {
      totalCount: number;
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
      nodes: unknown[];
    };
  } | null;
}

export function registerProjects(app: App): void {
  app.openapi(projectsRoute, async (c) => {
    try {
      const data = await gql<{
        viewer: {
          projectsV2: { nodes: ProjectSummary[] };
          repositories?: { nodes: RepoNode[] };
          organizations: {
            nodes: {
              login: string;
              projectsV2: { nodes: ProjectSummary[] };
              repositories?: { nodes: RepoNode[] };
            }[];
          };
        };
      }>(PROJECTS_LIST_QUERY, {});

      const byId = new Map<string, ProjectSummary & { linkedRepos: string[] }>();
      const linkSet = new Map<string, Set<string>>();

      const addProject = (p: ProjectSummary | null | undefined, repoNwo?: string) => {
        if (!p || p.closed) return;
        if (!byId.has(p.id)) byId.set(p.id, { ...p, linkedRepos: [] });
        if (repoNwo) {
          if (!linkSet.has(p.id)) linkSet.set(p.id, new Set());
          linkSet.get(p.id)?.add(repoNwo);
        }
      };

      for (const p of data.viewer.projectsV2.nodes || []) addProject(p);
      for (const r of data.viewer.repositories?.nodes || []) {
        for (const p of r.projectsV2?.nodes || []) addProject(p, r.nameWithOwner);
      }
      for (const org of data.viewer.organizations.nodes || []) {
        for (const p of org.projectsV2?.nodes || []) addProject(p);
        for (const r of org.repositories?.nodes || []) {
          for (const p of r.projectsV2?.nodes || []) addProject(p, r.nameWithOwner);
        }
      }

      for (const [id, set] of linkSet) {
        const proj = byId.get(id);
        if (proj) proj.linkedRepos = [...set].sort();
      }

      const all = [...byId.values()].sort((a, b) => {
        const oa = a.owner?.login || "";
        const ob = b.owner?.login || "";
        return oa.localeCompare(ob) || a.title.localeCompare(b.title);
      });
      return c.json({ ok: true as const, projects: all }, 200);
    } catch (e: unknown) {
      const msg = errorMessage(e);
      const { needsScope, friendly } = classifyProjectsError(msg);
      if (needsScope) return c.json({ ok: false as const, needsScope, error: friendly }, 200);
      logger.error({ err: e }, "projects request failed");
      return c.json({ ok: false as const, needsScope, error: friendly }, 500);
    }
  });

  app.openapi(projectRoute, async (c) => {
    const { id } = c.req.valid("query");
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      return c.json({ ok: false as const, error: "invalid project id" }, 400);
    }
    const MAX_ITEMS = 500;
    try {
      let cursor: string | null = null;
      let firstResp: ProjectResponseData | null = null;
      const allItems: unknown[] = [];
      let totalCount = 0;
      while (true) {
        const resp: ProjectResponseData = await gql<ProjectResponseData>(PROJECT_QUERY, {
          id,
          cursor,
        });
        if (!firstResp) firstResp = resp;
        const p = resp.node;
        if (!p) throw new Error("Project not found");
        totalCount = p.items.totalCount;
        for (const it of p.items.nodes) allItems.push(it);
        if (!p.items.pageInfo.hasNextPage || allItems.length >= MAX_ITEMS) break;
        cursor = p.items.pageInfo.endCursor;
      }
      const proj = firstResp?.node;
      if (!proj) throw new Error("Project not found");
      return c.json(
        {
          ok: true as const,
          project: {
            id: proj.id,
            number: proj.number,
            title: proj.title,
            url: proj.url,
            closed: proj.closed,
            shortDescription: proj.shortDescription,
            owner: proj.owner,
            fields: proj.fields.nodes,
            items: allItems,
            totalCount,
            truncated: allItems.length < totalCount,
          },
        },
        200,
      );
    } catch (e: unknown) {
      const msg = errorMessage(e);
      const { needsScope, friendly } = classifyProjectsError(msg);
      if (needsScope) return c.json({ ok: false as const, needsScope, error: friendly }, 200);
      logger.error({ err: e }, "projects request failed");
      return c.json({ ok: false as const, needsScope, error: friendly }, 500);
    }
  });

  app.openapi(moveRoute, async (c) => {
    const { projectId, itemId, fieldId } = c.req.valid("json");
    const optionId = c.req.valid("json").optionId ?? null;
    if (!projectId || !itemId || !fieldId) {
      return c.json({ ok: false as const, error: "missing projectId/itemId/fieldId" }, 400);
    }
    try {
      if (optionId) {
        await gql(MOVE_MUTATION, { projectId, itemId, fieldId, optionId });
      } else {
        await gql(CLEAR_FIELD_MUTATION, { projectId, itemId, fieldId });
      }
      return c.json({ ok: true as const }, 200);
    } catch (e: unknown) {
      const msg = errorMessage(e);
      const { needsScope, friendly } = classifyProjectsError(msg);
      if (needsScope) return c.json({ ok: false as const, needsScope, error: friendly }, 200);
      logger.error({ err: e }, "projects request failed");
      return c.json({ ok: false as const, needsScope, error: friendly }, 500);
    }
  });
}
