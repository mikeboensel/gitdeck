# TODO

## Dependency vulnerabilities (`npm audit`)

**Status:** ✅ mostly resolved — ran `npm audit fix` (7 → 1). Typecheck + 126 tests + build all pass after. `package-lock.json` updated (commit separately).
**Source:** triage of `TODO_AI_DECISIONS_TO_REVIEW.md` Decision 2

**Remaining (1, low):** `esbuild` 0.27.3–0.28.0 (dev-server-only arbitrary file read, **Windows-only**), pulled in transitively via `tsx`. Plain `npm audit fix` can't clear it without a `tsx` major bump (`--force`) — deferred as low-risk (dev tooling, non-Windows deploy). Bump `tsx` in a dedicated step if desired.

Original report (all 7) for reference:

7 vulnerabilities (2 critical, 2 high, 3 low), all in **pre-existing transitive deps** — none introduced by the Hono migration.

| Package | Severity | Advisory | Pulled in by |
|---|---|---|---|
| `shell-quote` 1.1.0–1.8.3 | **critical** | `quote()` doesn't escape newlines in object `.op` values ([GHSA-w7jw-789q-3m8p](https://github.com/advisories/GHSA-w7jw-789q-3m8p)) | `concurrently` 9.2.1 |
| `undici` 7.0.0–7.27.2 | **high** | 7 advisories: TLS cert-validation bypass, cache info disclosure, Set-Cookie header injection, WebSocket DoS, SOCKS5 cross-origin routing, keep-alive response poisoning, SameSite downgrade ([GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g) et al.) | direct/transitive |
| `vite` 8.0.0–8.0.15 | **high** | `launch-editor` NTLMv2 hash disclosure (Win UNC), `server.fs.deny` bypass on Win alt paths ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)) | direct (dev) |
| `esbuild` 0.27.3–0.28.0 | low | arbitrary file read via dev server on Windows ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)) | `tsx`, build |
| `react-router` / `-dom` 7.12.0–7.15.0 | low | CSRF via PUT/PATCH/DELETE document requests ([GHSA-84g9-w2xq-vcv6](https://github.com/advisories/GHSA-84g9-w2xq-vcv6)) | direct |

**Notes:**
- The critical (`shell-quote`) and the `esbuild`/`vite` highs are **Windows-only or dev-server-only** exposure paths; lower real risk for this project's deployment, but worth patching.
- The `react-router` CSRF advisory is the one most relevant to the shipped client.

**Recommended action:** run `npm audit fix`, then `npm run build` + `npm test` to confirm nothing regressed. Re-run `npm audit` to confirm 0 remaining. Commit the updated `package-lock.json` separately from feature work.

## API surface compromise: auth/accounts skip the typed-OpenAPI layer

**Status:** open · **Source:** Hono migration follow-up (supersedes `TODO_AI_DECISIONS_TO_REVIEW.md` Decision 17)

The `node:http` fallback (`src/legacy.ts`) is **gone** — every endpoint, static
asset, and SPA route is now served by the Hono app (`src/server/app.ts`). But
the migration left one deliberate compromise to avoid risking the README's
device-flow login.

**What's compromised:** the auth + account endpoints are **plain Hono routes**
(`src/server/routes/auth.ts`, `src/server/routes/accounts.ts`) instead of typed
`app.openapi(...)` routes. To be clear, plain Hono routes are *idiomatic* Hono —
this is not a weakening of Hono itself. The actual debt is narrower:

- **No request validation.** Bodies/queries are hand-checked (`trim()`,
  `if (!id)`) instead of zod-validated like the data routes.
- **Not in the OpenAPI spec.** The 8 auth/account endpoints
  (`/api/auth/{status,start,poll,logout}`, `/api/accounts` list+delete,
  `/api/accounts/{activate,add-token}`, `/api/provider-configs`) are absent from
  `/doc` and Swagger UI. So is `daily-digests` (Decision 16).

**Why deferred:** these handlers spread dynamic OAuth/account payloads
(`authStatus()` spreads provider status, `DeviceFlowPollResult` has an optional
`error`) that fight the zod-response schema system, and they carry the most
state (device-flow login, token persistence, cache invalidation) for the least
validation benefit. Forcing typed ports risked breaking device-flow login.

**Plan — revisit once the initial release is stable:** port auth/accounts to
typed `app.openapi(...)` routes with zod schemas (loose/cast response schemas
are fine where payloads are genuinely dynamic) so the whole API surface is
validated and documented. Then they can be dropped from this list.

**Minor cleanup along the way:** ✅ done — removed the dead `sendStaticFile`
export from `src/server/http.ts` and demoted `send`/`sendJson` to internal
(non-exported) helpers. `sendJsonCacheable` remains the only export (still used
by `repoInsights.ts` + `digests.ts`). The larger follow-up still stands: finish
migrating `repoInsights`/`digests` off the raw `req/res` helpers entirely, which
would let `http.ts` go away too.
