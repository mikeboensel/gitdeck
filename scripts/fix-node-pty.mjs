#!/usr/bin/env node
// node-pty 1.1.0 ships prebuilt binaries, but pnpm's extraction drops the
// executable bit on the macOS/Linux `spawn-helper`, so the first `pty.spawn`
// fails with "posix_spawnp failed". Restore +x after every install.
// See: https://github.com/microsoft/node-pty/issues (prebuild perms).
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

let root;
try {
  // Resolve through the package's main entry, then walk up to its root.
  root = dirname(dirname(require.resolve("node-pty")));
} catch {
  // node-pty not installed (e.g. CI without it) — nothing to fix.
  process.exit(0);
}

const candidates = [
  "prebuilds/darwin-arm64/spawn-helper",
  "prebuilds/darwin-x64/spawn-helper",
  "prebuilds/linux-x64/spawn-helper",
  "prebuilds/linux-arm64/spawn-helper",
  "build/Release/spawn-helper",
];

let fixed = 0;
for (const rel of candidates) {
  const p = join(root, rel);
  if (existsSync(p)) {
    chmodSync(p, 0o755);
    fixed++;
  }
}
if (fixed > 0) console.log(`fix-node-pty: chmod +x ${fixed} spawn-helper binary(ies)`);
