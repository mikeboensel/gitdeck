// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthMode, resetExternalAuthCaches } from "../../src/server/authProvider";

/**
 * Unset every env var getAuthMode consults so each case starts clean. The source
 * uses `??`, so an empty string would short-circuit precedence — we must delete
 * the keys (stubEnv with undefined) rather than blank them.
 */
function clearAuthEnv(): void {
  vi.stubEnv("GH_AUTH_MODE", undefined);
  vi.stubEnv("GITHUB_AUTH_MODE", undefined);
  vi.stubEnv("GITHUB_MODE", undefined);
}

beforeEach(() => {
  resetExternalAuthCaches();
  clearAuthEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAuthMode", () => {
  it("maps gh-cli aliases to 'gh-cli'", () => {
    for (const value of ["gh-cli", "gh", "ghcli", "GH", "  GhCli  "]) {
      vi.stubEnv("GH_AUTH_MODE", value);
      expect(getAuthMode()).toBe("gh-cli");
    }
  });

  it("maps token aliases to 'token'", () => {
    for (const value of ["token", "env", "pat", "PAT", " Token "]) {
      vi.stubEnv("GH_AUTH_MODE", value);
      expect(getAuthMode()).toBe("token");
    }
  });

  it("maps 'device' to 'device'", () => {
    vi.stubEnv("GH_AUTH_MODE", "device");
    expect(getAuthMode()).toBe("device");
  });

  it("lets GH_AUTH_MODE win over GITHUB_AUTH_MODE and GITHUB_MODE", () => {
    vi.stubEnv("GH_AUTH_MODE", "gh");
    vi.stubEnv("GITHUB_AUTH_MODE", "token");
    vi.stubEnv("GITHUB_MODE", "device");
    expect(getAuthMode()).toBe("gh-cli");
  });

  it("lets GITHUB_AUTH_MODE win over GITHUB_MODE when GH_AUTH_MODE is unset", () => {
    vi.stubEnv("GITHUB_AUTH_MODE", "token");
    vi.stubEnv("GITHUB_MODE", "gh");
    expect(getAuthMode()).toBe("token");
  });

  it("falls back to GITHUB_MODE when the higher-priority vars are unset", () => {
    vi.stubEnv("GITHUB_MODE", "gh");
    expect(getAuthMode()).toBe("gh-cli");
  });

  it("defaults to 'device' when unset or unrecognized", () => {
    expect(getAuthMode()).toBe("device");
    vi.stubEnv("GH_AUTH_MODE", "nonsense");
    expect(getAuthMode()).toBe("device");
  });
});
