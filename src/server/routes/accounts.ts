import type { HttpBindings } from "@hono/node-server";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { errorMessage } from "../../utils/errors";
import {
  add as addAccount,
  getActive as getActiveAccount,
  getProviderConfig,
  init as initAccountStore,
  list as listAccountsStore,
  listProviderConfigs,
  remove as removeAccountStore,
  setActive as setActiveAccount,
} from "../accountStore";
import { invalidateCIHealthCache } from "../ciHealth";
import { invalidateCollaboratorsCache } from "../collaborators";
import { invalidateDataCache } from "../dashboardData";
import { invalidateNotificationsCache } from "../notifications";
import { json } from "../openapi/respond";
import { getProvider, getProviderForAccount } from "../providers/registry";
import type { ProviderIdentity } from "../providers/types";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;

/**
 * Account + provider-config endpoints. Like the auth routes, these stay as
 * plain (untyped) Hono routes and out of the OpenAPI spec: they carry the most
 * state (token persistence, cache invalidation) with the least validation
 * benefit. Behavior is identical to the original `node:http` handlers.
 */

interface AccountSummary {
  id: string;
  providerKind: string;
  providerConfigId: string;
  label: string;
  login: string | null;
  scope: string;
  source: string;
  ephemeral: boolean;
  active: boolean;
  capabilities: Record<string, boolean>;
}

async function summariseAccount(
  account: Awaited<ReturnType<typeof getActiveAccount>>,
  activeId: string | null,
): Promise<AccountSummary | null> {
  if (!account) return null;
  let capabilities: Record<string, boolean> = {};
  try {
    const provider = await getProviderForAccount(account);
    capabilities = { ...provider.capabilities };
  } catch {
    // Unknown provider kind — return empty caps; UI will treat as conservative.
  }
  return {
    id: account.id,
    providerKind: account.providerKind,
    providerConfigId: account.providerConfigId,
    label: account.label,
    login: account.login,
    scope: account.scope,
    source: account.source,
    ephemeral: Boolean(account.ephemeral),
    active: account.id === activeId,
    capabilities,
  };
}

export function registerAccounts(app: App): void {
  app.get("/api/accounts", async (c) => {
    await initAccountStore();
    const all = await listAccountsStore();
    const active = await getActiveAccount();
    const summaries: AccountSummary[] = [];
    for (const account of all) {
      const summary = await summariseAccount(account, active?.id ?? null);
      if (summary) summaries.push(summary);
    }
    return json(c, 200, { ok: true, accounts: summaries, activeId: active?.id ?? null });
  });

  app.delete("/api/accounts", async (c) => {
    const id = (c.req.query("id") || "").trim();
    if (!id) return json(c, 400, { ok: false, error: "missing id" });
    await initAccountStore();
    const existed = await removeAccountStore(id);
    if (!existed) return json(c, 404, { ok: false, error: "account not found" });
    invalidateDataCache();
    invalidateNotificationsCache();
    invalidateCIHealthCache();
    invalidateCollaboratorsCache();
    return json(c, 200, { ok: true });
  });

  app.post("/api/accounts/activate", async (c) => {
    let parsed: { id?: string };
    try {
      parsed = await c.req.json();
    } catch {
      return json(c, 400, { ok: false, error: "invalid JSON" });
    }
    const id = (parsed.id || "").trim();
    if (!id) return json(c, 400, { ok: false, error: "missing id" });
    await initAccountStore();
    const account = await setActiveAccount(id);
    if (!account) return json(c, 404, { ok: false, error: "account not found" });
    invalidateDataCache();
    invalidateNotificationsCache();
    invalidateCIHealthCache();
    invalidateCollaboratorsCache();
    return json(c, 200, { ok: true, activeId: account.id });
  });

  app.post("/api/accounts/add-token", async (c) => {
    let parsed: { providerConfigId?: string; token?: string; label?: string };
    try {
      parsed = await c.req.json();
    } catch {
      return json(c, 400, { ok: false, error: "invalid JSON" });
    }
    const providerConfigId = (parsed.providerConfigId || "").trim();
    const token = (parsed.token || "").trim();
    if (!providerConfigId) return json(c, 400, { ok: false, error: "missing providerConfigId" });
    if (!token) return json(c, 400, { ok: false, error: "missing token" });
    await initAccountStore();
    const config = await getProviderConfig(providerConfigId);
    if (!config) return json(c, 404, { ok: false, error: "unknown providerConfigId" });
    let identity: ProviderIdentity;
    try {
      const provider = await getProvider(providerConfigId);
      identity = await provider.fetchIdentity(token);
    } catch (error) {
      return json(c, 400, { ok: false, error: errorMessage(error) });
    }
    if (!identity.login)
      return json(c, 400, { ok: false, error: "provider did not return a login" });
    const safeLogin = identity.login.replace(/[^a-zA-Z0-9_-]/g, "_");
    const prefix = config.kind === "github" ? "gh" : "fj";
    const webHost = new URL(config.webUrl).host;
    const account = await addAccount({
      id: `${prefix}_${safeLogin}_${providerConfigId}`,
      providerKind: config.kind,
      providerConfigId,
      label: parsed.label?.trim() || `${identity.login} (${webHost})`,
      login: identity.login,
      accessToken: token,
      scope: identity.scope ?? "",
      obtainedAt: new Date().toISOString(),
      source: "token",
    });
    invalidateDataCache();
    invalidateNotificationsCache();
    invalidateCIHealthCache();
    invalidateCollaboratorsCache();
    return json(c, 200, { ok: true, accountId: account.id });
  });

  app.get("/api/provider-configs", async (c) => {
    await initAccountStore();
    const configs = await listProviderConfigs();
    const summaries = Object.values(configs).map((cfg) => ({
      id: cfg.id,
      kind: cfg.kind,
      label: cfg.label,
      webUrl: cfg.webUrl,
      supportsDeviceFlow: Boolean(cfg.oauthDeviceCodeUrl) && cfg.kind === "github",
    }));
    return json(c, 200, { ok: true, configs: summaries });
  });
}
