import { describe, expect, it } from "vitest";
import {
  buildHealthMatrix,
  type CellState,
  DIMENSIONS,
  type MatrixRow,
} from "../../../src/components/widgets/health-matrix/matrix";
import type { GhRepo, RepoInsight } from "../../../src/types/github";

function insight(overrides: Partial<RepoInsight> = {}): RepoInsight {
  return {
    repo: "acme/widget",
    issueCount: 0,
    staleIssueCount: 0,
    daysSincePush: 1,
    daysSinceUpdate: 1,
    starsDelta: 0,
    forksDelta: 0,
    releaseCount: 0,
    totalDownloads: 0,
    recentDownloads: 0,
    viewsCount: 10,
    viewsUniques: 5,
    securityAlertsCount: 0,
    latestReleasePublishedAt: null,
    ...overrides,
  };
}

function repo(name: string, isArchived = false): GhRepo {
  return {
    nameWithOwner: name,
    name: name.split("/").pop() ?? name,
    owner: { login: name.split("/")[0] ?? name },
    description: null,
    stargazerCount: 0,
    forkCount: 0,
    primaryLanguage: null,
    updatedAt: "",
    pushedAt: "",
    visibility: "public",
    isPrivate: false,
    isArchived,
    isFork: false,
    url: "",
  };
}

/** State of one repo's cell for a given dimension; undefined if not found. */
function cellState(rows: MatrixRow[], repoName: string, dimKey: string): CellState | undefined {
  const row = rows.find((candidate) => candidate.repo === repoName);
  return row?.cells.find((cell) => cell.dimension.key === dimKey)?.state;
}

describe("buildHealthMatrix", () => {
  it("produces one cell per dimension in column order", () => {
    const rows = buildHealthMatrix([insight()], new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.map((cell) => cell.dimension.key)).toEqual(
      DIMENSIONS.map((dim) => dim.key),
    );
  });

  it("grades recent activity by days since push", () => {
    const rows = buildHealthMatrix(
      [
        insight({ repo: "a", daysSincePush: 5 }),
        insight({ repo: "b", daysSincePush: 60 }),
        insight({ repo: "c", daysSincePush: 200 }),
      ],
      new Map(),
    );
    expect(cellState(rows, "a", "activity")).toBe("ok");
    expect(cellState(rows, "b", "activity")).toBe("warn");
    expect(cellState(rows, "c", "activity")).toBe("bad");
  });

  it("marks a metric unknown when its fetch errored", () => {
    const rows = buildHealthMatrix(
      [insight({ securityAlertsCount: 0, errors: { security: "403 Forbidden" } })],
      new Map(),
    );
    const cell = rows[0]?.cells.find((entry) => entry.dimension.key === "security");
    expect(cell?.state).toBe("unknown");
    expect(cell?.detail).toBe("403 Forbidden");
  });

  it("treats lost stars as bad and flat as warn", () => {
    const rows = buildHealthMatrix(
      [
        insight({ repo: "up", starsDelta: 3 }),
        insight({ repo: "flat", starsDelta: 0 }),
        insight({ repo: "down", starsDelta: -2 }),
        insight({ repo: "none", starsDelta: null }),
      ],
      new Map(),
    );
    expect(cellState(rows, "up", "momentum")).toBe("ok");
    expect(cellState(rows, "flat", "momentum")).toBe("warn");
    expect(cellState(rows, "down", "momentum")).toBe("bad");
    expect(cellState(rows, "none", "momentum")).toBe("unknown");
  });

  it("sorts worst-first and sinks archived repos to the bottom", () => {
    const reposByName = new Map<string, GhRepo>([
      ["healthy", repo("healthy")],
      ["broken", repo("broken")],
      ["archived", repo("archived", true)],
    ]);
    const rows = buildHealthMatrix(
      [
        insight({ repo: "healthy", daysSincePush: 1 }),
        insight({ repo: "broken", daysSincePush: 300, staleIssueCount: 9, securityAlertsCount: 5 }),
        insight({ repo: "archived", daysSincePush: 300, staleIssueCount: 9 }),
      ],
      reposByName,
    );
    expect(rows.map((row) => row.repo)).toEqual(["broken", "healthy", "archived"]);
  });
});
