// @vitest-environment node
import { describe, expect, it } from "vitest";
import { describeRestError } from "../../src/server/githubClient";

describe("describeRestError", () => {
  it("combines a plain message with the status as an HTTP suffix", () => {
    expect(describeRestError("Not Found", 404)).toBe("Not Found (HTTP 404)");
  });

  it("prefers GitHub's JSON `message` field over the raw body", () => {
    const body = JSON.stringify({ message: "Dependabot alerts are disabled for this repository." });
    expect(describeRestError(body, 403)).toBe(
      "Dependabot alerts are disabled for this repository. (HTTP 403)",
    );
  });

  it("does not append the suffix when the detail already contains the status", () => {
    // Raw non-JSON body that already reads "HTTP 403" — avoid "HTTP 403 (HTTP 403)".
    expect(describeRestError("HTTP 403", 403)).toBe("HTTP 403");
  });

  it("does not duplicate the status when it appears inside the JSON message", () => {
    const body = JSON.stringify({ message: "API rate limit exceeded (403)" });
    expect(describeRestError(body, 403)).toBe("API rate limit exceeded (403)");
  });

  it("returns the bare message when status is undefined", () => {
    expect(describeRestError("boom", undefined)).toBe("boom");
  });

  it("returns just the HTTP suffix when only a status is given", () => {
    expect(describeRestError(undefined, 500)).toBe("HTTP 500");
  });

  it("falls back to a generic reason when both inputs are absent", () => {
    expect(describeRestError(undefined, undefined)).toBe("Request failed");
    expect(describeRestError("   ", undefined)).toBe("Request failed");
  });
});
