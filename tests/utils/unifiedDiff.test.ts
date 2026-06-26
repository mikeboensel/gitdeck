import { describe, expect, it } from "vitest";
import { splitUnifiedDiff } from "../../src/utils/unifiedDiff";

describe("splitUnifiedDiff", () => {
  it("returns an empty list for empty input", () => {
    expect(splitUnifiedDiff("")).toEqual([]);
    expect(splitUnifiedDiff("   \n")).toEqual([]);
  });

  it("splits a multi-file patch and parses paths + hunks", () => {
    const patch = [
      "diff --git a/Makefile b/Makefile",
      "index c08d864..29c9605 100644",
      "--- a/Makefile",
      "+++ b/Makefile",
      "@@ -1,2 +1,2 @@",
      "-old",
      "+new",
      "diff --git a/src/App.ts b/src/App.ts",
      "index 111..222 100644",
      "--- a/src/App.ts",
      "+++ b/src/App.ts",
      "@@ -5,1 +5,2 @@",
      " context",
      "+added",
    ].join("\n");
    const files = splitUnifiedDiff(patch);
    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      path: "Makefile",
      oldPath: "Makefile",
      newPath: "Makefile",
      binary: false,
    });
    // The full per-file segment is kept (headers included), as the renderer needs them.
    expect(files[0]?.diff.startsWith("diff --git a/Makefile b/Makefile")).toBe(true);
    expect(files[0]?.diff).toContain("@@ -1,2 +1,2 @@");
    expect(files[1]?.path).toBe("src/App.ts");
  });

  it("maps /dev/null to null for an added file", () => {
    const patch = [
      "diff --git a/new.md b/new.md",
      "new file mode 100644",
      "index 000..a44",
      "--- /dev/null",
      "+++ b/new.md",
      "@@ -0,0 +1,1 @@",
      "+hello",
    ].join("\n");
    const [file] = splitUnifiedDiff(patch);
    expect(file?.oldPath).toBeNull();
    expect(file?.newPath).toBe("new.md");
    expect(file?.path).toBe("new.md");
  });

  it("flags a binary file and recovers its path from the header", () => {
    const patch = [
      "diff --git a/logo.png b/logo.png",
      "index 111..222 100644",
      "Binary files a/logo.png and b/logo.png differ",
    ].join("\n");
    const [file] = splitUnifiedDiff(patch);
    expect(file?.binary).toBe(true);
    expect(file?.path).toBe("logo.png");
    expect(file?.diff).toContain("Binary files");
  });
});
