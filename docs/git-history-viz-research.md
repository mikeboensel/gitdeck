# Git history visualization — research & improvement plan

Research synthesis for the commit-history graph (`CommitHistoryModal`, `commitGraph.ts`,
`routes/localRepoHistory.ts`). Sources verified via multi-source adversarial check
(25 claims, 3‑0 confirmed). Prioritized by impact‑to‑effort.

## Where we are today
Two‑pane modal (graph + selected‑commit detail), greedy first‑free‑lane assignment,
one color per lane, compact nodes (dot + short SHA + ref badges), HEAD ring, smoothstep
edges, create‑branch from the selected node, collapsible changed‑files list, `git log
--all --date-order` capped at 200, **no caching** of the parsed history or computed layout.

The research confirms the two‑pane layout, HEAD coloring, ref badges, lane colors, and
create‑branch are the convergent baseline (gitk, GitKraken, Sublime Merge). The gaps below
are what separate us from a "dramatically better" graph.

## Tier 1 — high impact, low/moderate effort

1. **Cache the walked graph + layout, invalidate on ref/HEAD change** *(the thing you flagged)*
   - Cache parsed `LocalRepoHistory` + computed `CommitGraph` keyed on a cheap ref‑state
     fingerprint (hash of `git for-each-ref` + HEAD; add index/stash state if we surface WIP).
   - History is append‑mostly → on tip move, fetch only `git log <oldTip>..<newRefs>` and prepend.
   - Ensure repos have a `.git/commit-graph` (or `git commit-graph write`) — git's own walk
     accelerator (stores parents/date/generation numbers; 5‑10× on walk‑heavy commands).
   - Source: git-scm commit-graph docs; MS DevBlog "Supercharging the Git commit-graph".

2. **React Flow performance hygiene**
   - `React.memo` the `CommitNode`; **decouple selection highlight from the nodes array**
     (today `rfNodes` re‑maps on every click) — drive `.selected` via CSS/class, not a re‑map.
   - Enable `onlyRenderVisibleElements` so tall histories cull off‑screen nodes.
   - Source: reactflow.dev/learn/advanced-use/performance.

3. **Straight (or elbow) edges instead of smoothstep**
   - Every reference tool (gitk, GitKraken, Sublime) uses straight/elbow lane lines; our
     dot‑anchored handles already make same‑lane edges vertical — `type:"straight"` removes the
     residual curve. (Inferred from convergent behavior, not a hard study.)

4. **Topological ↔ chronological ordering toggle**
   - Add a `--topo-order` option + a UI toggle. Date‑order keeps recent work on top; topo‑order
     keeps each branch contiguous (better for tangled histories). Source: `serie --order`.

## Tier 2 — high impact, higher effort

5. **Branch‑aware lane assignment** *(the flagship readability win)*
   - Replace greedy first‑free‑lane with persistence‑ranked back‑tracing (git‑graph's model):
     classify branches most‑persistent→short‑lived, back‑trace which branch each commit belongs
     to, so `main` keeps a stable column and side branches get consistent lanes.
   - Caveat: benefits repos that follow a naming convention; unmatched branches fall to the right.
   - Source: github.com/mlange-42/git-graph (manual).

6. **Windowing instead of the 200 cap**
   - Replace the hard `MAX_LIMIT` with lazy/incremental loading + viewport virtualization;
     optionally collapse long linear runs into expandable summary nodes (focus+context).
   - Source: Githru (IEEE TVCG 2021) graph‑reconstruction + clustering + context‑preserving squash.

7. **Search + jump‑to + keyboard nav (+ minimap)**
   - Search by SHA/message/author/file; pan the React Flow viewport to matches; F3 / Shift+F3
     next/prev. Add `<MiniMap>` for focus+context on tall graphs. Source: GitLens Commit Graph.

## Tier 3 — polish

8. **Node context menu** (right‑click → create branch / checkout / tag / copy SHA) using the
   existing `useRightClickMenu`; today branch creation is side‑panel only. Source: Sublime Merge.
9. **WIP / refs vocabulary**: a synthetic uncommitted "WIP" top row (gitk's red dot), and
   distinct styling for remote‑tracking vs local refs (and optionally stash, currently excluded).
10. **Inline diffs in the detail panel** (we show only +/- stats) via `@git-diff-view/react` —
    already recommended in `docs/diffing-tooling-research.md`. Source: gitk/GitKraken/Sublime detail panes.

## Library decision (validated)
Keep **React Flow**; borrow git‑graph's lane algorithm and gitgraph.js's straight‑edge/lane‑color
conventions rather than switching renderers. `@gitgraph/react` is git‑native but API‑call‑oriented
(replay branch/commit ops), low‑maintenance, and would lose our interaction + virtualization story.

## Caveats / open questions
- Branch‑aware lanes need recognizable branch names to beat greedy lanes.
- commit‑graph speedup is for *walks*, not reading messages/diffs (which the detail pane needs).
- Virtualization win is unbenchmarked for our dot+SHA node at thousands of commits.
- Straight‑vs‑smoothstep and octopus‑merge (3+ parent) lane strategy had no dedicated hard source.
