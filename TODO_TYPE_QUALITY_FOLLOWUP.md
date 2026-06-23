# Type-Quality Follow-ups

Generated from a type-usage audit triage. Items below were intentionally deferred
(not skipped) and need dedicated work. Several land outside a single edit.

## ✅ Build is GREEN again — all 64 typecheck errors fixed

`npm run typecheck` is now **0 errors**. The 64 errors from the stricter tsconfig
flags (`noUncheckedIndexedAccess` ×63, `noImplicitReturns` ×1) are all fixed.
They were real missing guards on values the prior code assumed present, so the
fixes preserve runtime behavior:
- **Provably-present** sites (post length/bounds check, in-bounds loop index,
  guarded regex groups) → non-null assertion (`x!`).
- **Possibly-undefined** sites → guard or default consistent with the file
  (`?? null` for `string | null` targets, `?? ""` for `string`, `?? current`
  for the two `SetStateAction` density-cycle updaters in `App.tsx:477` /
  `TriageWorkspace.tsx:461`).
- `app.ts:29` defaultHook → explicit `return undefined` on the success path.

Verified: typecheck clean · 126 tests pass · build succeeds. No genuine logic
bugs surfaced (all were missing guards). Side effect: ~40 new
`noNonNullAssertion` Biome *warnings* from the `!` fixes (warnings, not errors).

Original breakdown for reference (now resolved): 63 `noUncheckedIndexedAccess`,
1 `noImplicitReturns` (`src/server/app.ts:29`). The other three flags
(`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) produced
0 errors.

### Errors by file (count)
- 16  src/server/routes/mentions.ts
- 11  tests/utils/digests.test.ts
-  6  src/utils/changelog.ts
-  5  tests/utils/dashboard.test.ts
-  5  src/server/accountStore.ts
-  3  tests/utils/inbox.test.ts
-  3  src/components/views/TriageWorkspace.tsx
-  2  src/utils/repository.ts
-  2  src/utils/insights.ts
-  2  src/server/ciHealth.ts
-  2  src/components/modals/repoDetail/helpers.ts
-  1  tests/server/accountStore.test.ts
-  1  src/server/repoInsights.ts
-  1  src/server/providers/github.ts
-  1  src/server/providers/forgejoData.ts
-  1  src/server/githubClient.ts
-  1  src/server/app.ts   (noImplicitReturns)
-  1  src/App.tsx

Run `npx tsc --noEmit` for the live list.

## Deferred findings

### #3 — Runtime validation at external boundaries (zod)
External/untrusted data is cast via `as` without runtime validation:
- API responses in `src/server/providers/github.ts`, `forgejoData.ts`, `githubClient.ts`
- Request bodies in `src/legacy.ts` (40, 165, 197)
- `localStorage` reads in `src/App.tsx` (122, 139, 140, 155, 156)

**Agreed design:**
- Validate at the boundary, once per surface, in the central fetch helpers
  (`rest`/`restPaginate`/`restGet`/graphql) — schema param instead of bare `<T>`.
- Keep schema (upstream shape) separate from adapter (→ internal `GhRepo` etc.).
- `safeParse` + graceful degradation for reads (extend existing `unavailable` pattern);
  reject hard only on inbound routes.
- Strict (throw) in dev/test, lenient (log + degrade) in prod.
- Codegen, scoped to usage — 3 pipelines:
  - GitHub GraphQL (search, projects) → `graphql-codegen` (+ zod plugin)
  - GitHub REST (notifications, security, traffic, actions) → `openapi-typescript`/zod
  - Forgejo REST (all) → `openapi-typescript`/zod from `swagger.v1.json`
- The REST+GraphQL hybrid is justified/forced by GitHub's API surface — plan for it,
  don't collapse it.
- Sequencing: (1) localStorage guards stopgap; (2) add schema params + `parseOrDegrade`
  to helpers with hand-written zod; (3) swap hand-written for generated schemas.

Recommend running `plan-creator` to design this rollout.

### #4 — Tighten shared type model (`src/types/github.ts`)
Fold into #3 — generated schemas + adapters tighten it as a byproduct:
- ~34% of fields optional (61/~180); make identity fields required.
- `string` → unions for `status`, `event`, `conclusion`, `state`, `visibility`,
  `ProjectItem.type`.
- Normalize mixed camel/snake naming (`avatarUrl`+`avatar_url`, `html_url`+`url`).

## Other follow-ups
- **Biome cleanup — ✅ DONE (lint is now green: 0 errors).**
  - ✅ Ran `biome check --write` (safe fixes) → cleared ~126 errors (formatting + organizeImports across the whole tree; large CSS reformat churn).
  - ✅ Fixed the 5 genuine-correctness errors: `noArrayIndexKey` ×3 (`Pagination.tsx`, `ChangelogModal.tsx`, `repoDetail/OverviewPanel.tsx` — replaced index keys with stable identity keys), `useIterableCallbackReturn` (`CIHealthView.tsx` sort callback — added `default: return 0`), `noUnknownProperty` (`kanban.css` — removed non-standard `user-drag`, kept `-webkit-user-drag`).
  - ✅ Excluded transient `.claude/` worktrees from git + Biome (fixed a "nested root configuration" error). See `.gitignore`.
  - ✅ **`useExhaustiveDependencies` (16 React hook-dep errors) — DONE** (assessed each individually via parallel agents, not blanket-autofixed):
    - **Genuine fixes (8):** `App.tsx:440` added missing `location.pathname`/`location.search`/`navigate` (also removed a stale `eslint-disable`) — ⚠️ this redirect effect is now reactive to route changes instead of mount-only (deliberate, verified loop-free/idempotent); `App.tsx:546` added `t`; `AddAccountModal` `stopPolling` + `I18nProvider` `setLanguage` + `KanbanView` `loadProjects` wrapped in `useCallback` (stable identity → effects keep mount-only behavior, no per-render refetch).
    - **Intentional re-run triggers kept + suppressed with reasons (8):** 5× `activeAccountId` in `App.tsx` (refetch account-scoped data on account switch — removing would break it), `App.tsx:451` `location.pathname` (close filters on route change), `CommandPalette` `query` (reset selection on each keystroke), `RepositoryDetailsModal` `mentionsRefreshKey` (alias-driven refetch). Each has a `// biome-ignore … : <reason>`.
    - Verified: 0 `useExhaustiveDependencies` remain · typecheck 0 · 126 tests pass · build OK.
  - ✅ **a11y sweep (129 errors) — DONE** (5 parallel agents, by-file buckets, shared rubric: prefer native semantic elements over ARIA bolt-ons). **116 real markup fixes + 13 justified `// biome-ignore`s.**
    - **Markup fixes:** `useButtonType` → `type="button"` on all buttons; `noSvgWithoutTitle` → `aria-hidden="true"` on decorative icons (whole `Icons.tsx` library) + `<title>` on the logo asset; `useSemanticElements` → CIHealthView faux-`<div>`-table converted to a real `<table>`/`<th>`/`<td>` (CSS resets added to `views.css` to keep look identical), various `role="group"` → `<fieldset>`, list roles → semantic; interactive divs/anchors → `<button type="button">` (e.g. modal backdrops in CommandPalette/App sidebar, with style resets); `noLabelWithoutControl` → `htmlFor`/`id` wired on sort/preset selects; `useAriaPropsSupportedByRole` → `role="img"` on aria-labeled badge spans; redundant `role="separator"`/`role="list"` removed.
    - **13 justified suppressions:** `noStaticElementInteractions`×7 + `useKeyWithClickEvents`×7 (modal backdrops — click-to-close kept; every modal has a visible Close button / Escape handler; drag-drop zones are pointer-only), `useSemanticElements`×4 (clickable cards/rows wrapping nested interactive elements — can't be a native `<button>`; keep `role="button"`+`tabIndex`+`onKeyDown`), `noNoninteractiveTabindex`×2 (intentionally focusable `<article>` cards), `noAutofocus`×2 (intentional focus-on-open of modal/token inputs).
    - Verified: **0 a11y errors · 0 lint errors** (105 warnings + 1 info remain, non-blocking) · typecheck 0 · 126 tests pass · build OK.
    - ⚠️ **Minor visible deltas flagged** (see chat): KanbanView project-card title `<a href-less>` → `<span>` loses its hover-tint (card still fully clickable); InsightsView cards + TopBar account rows gain keyboard (Enter/Space) activation; CIHealthView is now a real table (CSS-reset to look identical). A visual sanity-pass on those screens is worthwhile.
  - ✅ **Warning cleanup — mostly DONE (105 → 44):**
    - ✅ `useOptionalChain` (4) + `noUselessFragments` (1 info) → real fixes (`?.length`, `!repos?.ok`, dropped useless fragment).
    - ✅ **CSS `noDescendingSpecificity` (43) + `noImportantStyles` (14) → DONE** via 4 parallel agents, cascade-neutral pass:
      - **views.css:** 15 fixed with `:where()` (ties specificity, keeps source order + matching), 1 ignore; 7 `!important` kept+ignored (load-bearing: mobile `.aside-col` overrides + inline-style avatar sizing from `Avatar.tsx`).
      - **navigation.css:** 5 fixed via 2 `:where()` edits on `.topbar-search`; 3 `!important` kept (fixed-size text-size preview swatches).
      - **inbox.css (12) + modals.css (11):** all suppressed with concrete per-rule reasons — reordering across the large files / `:where()` were proven unsafe (would flip embedded-reader padding, heading sizes, etc.). **Comment-only → zero rendering change.**
      - **layout-sidebar.css (2) + kanban.css (1):** `!important` kept+ignored (mobile drawer `position:fixed`; board-focus chrome hide).
    - ⏳ **`noNonNullAssertion` (44) — awaiting decision.** In direct tension with `noUncheckedIndexedAccess` (which forces `!` after bounds-checks). Most are provably-safe; refactoring to guards would be dead code. Options: relax the rule (recommended), refactor the one genuine smell (TriageWorkspace optional-prop `pageProp!`/`pageSizeProp!`) + relax rest, or leave as warnings.
  - ⚠️ **Visual QA spots from the CSS pass** (low risk — only views.css `:where()` pagination rules + navigation.css search-button label/⌘K hint changed structurally; everything else is comment-only): glance at pagination bar borders in Repos grid/list + after Issues/PRs lists, and the top-bar search button at desktop + ≤1180/≤900px.
  - ✅ **CI impact RESOLVED:** `npm run lint` (`biome check`) passes with 0 errors (44 non-blocking warnings remain pending the noNonNull decision).

## Completed in triage (this session)
- ✅ **All 64 typecheck errors fixed** (see top of file) — build GREEN.
- ✅ **`npm audit`**: 7 vulns → 1 (low, dev-only `esbuild` via `tsx`); see `TODO.md`.
- ✅ **Dead `http.ts` exports** pruned (`sendStaticFile` removed; `send`/`sendJson` demoted to internal); see `TODO.md`.
- ✅ **forks/stargazers** auth-error now returns `401 + needsAuth` (was 500); see `TODO_AI_DECISIONS_TO_REVIEW.md` Decision 11.
- ✅ Biome safe-fix pass + 5 correctness errors (above).

### Completed in earlier triage
- ✅ #1 tsc field-rename errors (fixed externally during session).
- ✅ #2 widened Biome lint scope to whole tree.
- ✅ #5 added `src/utils/errors.ts` `errorMessage()`; replaced 39 `(x as Error)` sites.
- ✅ #6 `statsCache.ts` parse-to-`unknown`-then-validate ordering.
