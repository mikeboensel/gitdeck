# Local-Diff Viewer for gitdeck — Tooling Research

> Research into adding a "view outstanding/uncommitted diffs for a local git repo" feature to
> gitdeck (React 19 + Vite SPA, Hono/Node backend that shells to git/gh, caches to disk), favoring
> incorporation of existing open-source work over rolling our own diff engine/UI.
>
> Method: multi-agent deep research — 23 sources fetched, 113 claims extracted, 25 adversarially
> verified (3-vote, needs 2/3 to refute). All 25 verified claims confirmed, 0 killed.
> Findings dated mid-2026; fast-moving library facts should be re-verified at integration time.

## TL;DR recommendation

- **Backend:** keep shelling to the git binary via **`simple-git`** (MIT). Use
  `git status --porcelain=v2` for the file list and `git diff --histogram` for content. Matches
  gitdeck's existing shell-to-git/gh pattern.
- **Frontend renderer:** **`@git-diff-view/react`** (MIT, actively maintained) as primary —
  GitHub-like, split/unified, HAST syntax highlighting, Web Worker offload. **`react-diff-view`**
  (MIT, mature) is the fallback if you want lower-level control and to feed raw unified-diff text
  directly.
- **First UX patterns to ship:** split/unified toggle, word-level intra-line highlighting, syntax
  highlighting, file-status grouping (staged/unstaged/untracked). These are the convergent
  must-haves across *every* tool category.

## Goal A — the competitive landscape

The space splits into **five categories**, all converging on the same UX baseline but
differentiating at the edges.

### 1. Desktop Git GUIs
GitKraken, Sublime Merge, Fork, Tower, GitHub Desktop, SmartGit, Sourcetree.
- Standout: **line/hunk staging** directly in the diff, file-status grouping, instant split/unified,
  inline word diff.
- Sublime Merge is the UX north star — fast, keyboard-driven, native-feeling hunk staging. Worth
  emulating its responsiveness model.

### 2. Web/forge review UIs
GitHub, GitLab, Gitea/Forgejo, Bitbucket, Gerrit, Graphite, Reviewable, CodeRabbit.
- **GitHub's 2025 "Files Changed" rewrite is the reference benchmark** (verified): seamless
  split↔unified toggle with no page refresh; became default in Jan 2026.
- Frontier is **AI-assisted review** (CodeRabbit's "Atlas" AI-native review interface) and
  review-thread/comment overlays.
- Gerrit/Reviewable bring patchset-to-patchset (interdiff) comparison — relevant later if gitdeck
  adds commit-range diffs.

### 3. Terminal / TUI
lazygit, gitui, tig, magit, fugitive, neogit.
- Standout: **keyboard-first navigation** and instant staging. lazygit/magit model "diff as a fast,
  navigable surface" — worth stealing their keybinding ergonomics.

### 4. IDE / editor SCM
VS Code, JetBrains, Zed, Cursor.
- VS Code's SCM panel + diff editor is the closest analog to gitdeck's situation — a diff view that
  lives inside a broader dashboard, not a standalone app.

### 5. Diff engines / structural diff
Myers, histogram/patience, Delta, difftastic, diffsitter, Mergiraf.
- **Algorithm matters** (verified, peer-reviewed): Nugroho, Hata & Matsumoto, *Empirical Software
  Engineering* 25(1) 2020 recommends **`--histogram` over Myers** for source code — results differ
  in 1.7–8.2% of commits. Actionable today: pass `--histogram`.
- **Structural/AST diffing is the novel frontier** (verified): difftastic & diffsitter diff *syntax
  trees* via tree-sitter, eliminating formatting-only noise (whitespace, reformatting). difftastic
  frames it as a graph shortest-path problem (Dijkstra over tree-sitter trees).
- **But** (verified caveat): AST tools **scale poorly** — difftastic aborted at ~12GB RAM on large C
  files; only covers languages with tree-sitter grammars; both are Rust binaries, not JS. → Reserve
  as an **opt-in "semantic mode"** for small/medium files, never the default.
- **Mergiraf** is the syntax-aware *merge* counterpart (tree-sitter on base/left/right) — out of
  scope for the initial diff view, but relevant if conflict/merge visualization is added later.

### Features users value most (ranked)

| Tier | Features |
|---|---|
| **Table-stakes** | split/unified toggle · word/char intra-line highlight · syntax highlighting · staged/unstaged/untracked grouping |
| **High-value next** | hunk/line staging · collapse-unchanged · ignore-whitespace · keyboard nav |
| **Differentiators** | binary/image/notebook/LFS diffs · blame · review comments · minimap/heatmap |

The four table-stakes features were verified as present across *all* candidate renderers AND
GitHub's reference UI — convergence implies they are the must-haves to ship first.

## Goal B — concrete building blocks for the stack

### Backend (Node / Hono)

- **`simple-git`** (MIT) ✅ — wraps the git binary; `.diff()` returns raw patch text,
  `.diffSummary()` returns structured `--stat`. Requires git on PATH (already assumed via gh/git).
- `isomorphic-git` (pure-JS) — fallback only if git-on-PATH can't be assumed; weaker rename
  detection / perf.
- `parse-diff` (MIT) — if parsing raw unified diff into structured hunks ourselves.

### Frontend (React 19 + Vite)

| Library | License | Strengths | Trade-off |
|---|---|---|---|
| **`@git-diff-view/react`** ✅ | MIT | GitHub-like, split+unified, HAST syntax highlight, Web Worker offload, range mode for big diffs, takes raw `{oldFile,newFile,hunks}` or processed data | Newer (~v0.1.x), smaller ecosystem |
| `react-diff-view` | MIT | Mature (~v3.3.3), powerful token system, web-worker tokenization, parses unified-diff text (pairs with `simple-git` raw output) | Lower-level — must wire up tokenization/refractor |
| `react-diff-viewer-continued` | MIT | Simplest API, split/unified, word diff, dark theme; v4.2.2 (Apr 2026) | Takes old/new strings, not patches; weaker for large virtualized diffs |

> Note: the original `react-diff-viewer` is effectively abandoned (last publish ~6 years ago, 82
> open issues); `react-diff-viewer-continued` is the maintained fork.

### Reference implementation worth studying

- **`kamranahmedse/diffity`** — a local-first, embeddable GitHub-style viewer built specifically to
  review *uncommitted* changes from AI coding tools (Claude Code, Cursor). Closest existing analog
  to what gitdeck is building.

## Things easy to miss (cross-cutting)

- **Performance is the real engineering challenge.** GitHub's rewrite (verified): window
  virtualization cut large-PR JS heap ~50% (10k-line diffs ~150–250MB → ~80–120MB), up to 10×
  heap/DOM reduction on p95+ PRs, INP 450ms → 100ms, React nodes per diff line 8 → 2, large-PR load
  10s+ → seconds. **Virtualize** big uncommitted diffs; avoid per-line React overhead.
- **Security:** shelling to git risks **argument injection** (Snyk) — sanitize repo paths/refs;
  never interpolate user input into git args without `--` separators.
- **Edge cases to handle in the backend before rendering:** rename/move detection (`-M`),
  binary/image diffs, Jupyter notebooks, Git LFS pointer files, CRLF/encoding normalization
  (`gitattributes`).

## Open questions

1. Do `@git-diff-view/react` / `react-diff-view` handle renames, binary/image, notebook, and LFS
   diffs out of the box, or must the Hono backend pre-process them?
2. Accessibility maturity (keyboard nav, ARIA, screen reader) of the candidate renderers — not
   covered by surviving claims.
3. Worth offering an opt-in structural diff (difftastic shelled binary) for small files despite poor
   large-file scaling and limited language coverage?

## Caveats

- React diff-lib versions move fast — re-verify version/maintenance facts at integration time
  (`@git-diff-view` ~v0.1.x, `react-diff-view` ~v3.3.3, `react-diff-viewer-continued` v4.2.2 dated
  2026-04-23).
- GitHub's performance numbers come from GitHub's own changelog + engineering blog (vendor primary
  sources): techniques (virtualization, fewer React nodes per line) are credible and measured, but
  absolute figures are self-reported.
- The `--histogram` recommendation rests on a single peer-reviewed study (Java-focused repository
  mining); it generalizes well, but the 1.7–8.2% magnitude was the one finding with a 2-1 verifier
  split. The recommendation itself was unanimous.
- AST/structural diff tools (difftastic, diffsitter) are Rust binaries, not JS libraries;
  incorporating them means shelling to another binary. diffsitter's own README calls it "work in
  progress, nowhere close to production ready."

## Key sources

- GitHub — Improved PR "Files Changed" experience (2025): <https://github.blog/changelog/2025-06-26-improved-pull-request-files-changed-experience-now-in-public-preview/>
- GitHub Engineering — Making diff lines performant: <https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/>
- difftastic: <https://github.com/Wilfred/difftastic>
- diffsitter: <https://github.com/afnanenayet/diffsitter>
- Mergiraf architecture: <https://mergiraf.org/architecture.html>
- Diff-algorithm study (Nugroho/Hata/Matsumoto, EMSE 2020): <https://link.springer.com/article/10.1007/s10664-019-09772-z>
- `@git-diff-view/react`: <https://github.com/MrWangJustToDo/git-diff-view>
- `react-diff-view`: <https://github.com/otakustay/react-diff-view>
- `react-diff-viewer-continued`: <https://github.com/Aeolun/react-diff-viewer-continued>
- `simple-git`: <https://github.com/steveukx/git-js>
- `diffity` (reference impl): <https://github.com/kamranahmedse/diffity>
- Argument injection in git/Mercurial (Snyk): <https://snyk.io/blog/argument-injection-when-using-git-and-mercurial/>
