import { describe, expect, it } from "vitest";
import {
  defaultIssueFilters,
  defaultPrFilters,
  defaultRepoFilters,
  detailTabFromParams,
  metricKindFromParams,
  tabFromPath,
} from "../../src/appHelpers";

describe("tabFromPath", () => {
  it("maps the /alert alias to the alerts tab", () => {
    expect(tabFromPath("/alert")).toBe("alerts");
  });

  it("maps a known route to its tab", () => {
    expect(tabFromPath("/pull-requests")).toBe("prs");
    expect(tabFromPath("/local")).toBe("local");
  });

  it("falls back to repos for an unknown path", () => {
    expect(tabFromPath("/nope")).toBe("repos");
  });
});

describe("detailTabFromParams", () => {
  it("returns overview for a missing or invalid detail param", () => {
    expect(detailTabFromParams(new URLSearchParams())).toBe("overview");
    expect(detailTabFromParams(new URLSearchParams("detail=bogus"))).toBe("overview");
  });

  it("passes a valid detail value through", () => {
    expect(detailTabFromParams(new URLSearchParams("detail=releases"))).toBe("releases");
  });
});

describe("metricKindFromParams", () => {
  it("returns null for a missing or invalid metric param", () => {
    expect(metricKindFromParams(new URLSearchParams())).toBeNull();
    expect(metricKindFromParams(new URLSearchParams("metric=bogus"))).toBeNull();
  });

  it("returns the kind for a valid metric value", () => {
    expect(metricKindFromParams(new URLSearchParams("metric=stars"))).toBe("stars");
    expect(metricKindFromParams(new URLSearchParams("metric=forks"))).toBe("forks");
  });
});

describe("filter factories return fresh state each call", () => {
  it("defaultIssueFilters does not alias its Sets across calls", () => {
    const a = defaultIssueFilters();
    const b = defaultIssueFilters();
    a.orgs.add("acme");
    expect(b.orgs.size).toBe(0);
    expect(a.orgs).not.toBe(b.orgs);
  });

  it("defaultPrFilters does not alias its Sets across calls", () => {
    const a = defaultPrFilters();
    const b = defaultPrFilters();
    a.labels.add("bug");
    expect(b.labels.size).toBe(0);
  });

  it("defaultRepoFilters does not alias its Sets across calls", () => {
    const a = defaultRepoFilters();
    const b = defaultRepoFilters();
    a.languages.add("ts");
    expect(b.languages.size).toBe(0);
    expect(a.includeForks).toBe(true);
    expect(a.visibility).toBe("all");
  });
});
