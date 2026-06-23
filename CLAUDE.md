# CLAUDE.md

Local multi-account dashboard for GitHub and Forgejo-compatible forges. React 19 + Vite SPA
frontend, Hono (Node) server backend. See `AGENTS.md` for the full contributor ruleset.

## Commands

- `pnpm dev` — run API (`:8765`) + Vite dev server (`:5180`) together, with hot reload
- `pnpm test` — Vitest unit tests (`tests/**/*.test.ts`)
- `pnpm test:coverage` — tests with V8 coverage
- `pnpm typecheck` — `tsc --noEmit` (strict)
- `pnpm lint` — Biome check (the CI gate); `pnpm format` writes formatting
- `pnpm build` — bundle server (esbuild) + build SPA (Vite)
- `pnpm clean` — remove `dist/`, `coverage/`, `*.tsbuildinfo`
- `pnpm kill-ports` — free the declared dev ports (read from `package.json` `config.ports`)

## Architecture

- **Backend** (`src/server.ts`, `src/server/*`): Hono HTTP server. GitHub OAuth Device Flow,
  proxies all REST/GraphQL, caches responses to disk under `~/.gitdeck/`, exposes `/api/*`.
  The GitHub token is stored server-side and **never exposed to the browser**.
- **Frontend** (`src/main.tsx`, `src/App.tsx`, `src/components/*`, `src/api/*`): React 19 + Vite
  SPA that consumes the backend's `/api/*` endpoints.
- Pure business logic lives in `src/utils/`, unit-tested under the mirrored `tests/utils/` path.

## Conventions

- Conventional commits; one responsibility per component; don't mix refactors with feature work.
- TypeScript for new source; keep all GitHub/`gh` access behind server endpoints.
- Biome (2-space indent, lineWidth 100). Explain every `biome-ignore` with the rule and the reason.

## Context efficiency

- Terse git: `git status -s`, `git diff --stat` before full diffs, `git log --oneline -20`.
- Silent installs: `pnpm install --reporter=silent`.
- Pipe verbose command output through `tail -n`/`head -n` unless actively debugging.
