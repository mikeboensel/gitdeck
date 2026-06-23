export interface RepoSecurityAlertLike {
  updated_at?: string | null;
  updatedAt?: string | null;
}

export interface RepoSecuritySummaryInput {
  dependabotAlerts: RepoSecurityAlertLike[];
  codeScanningAlerts: RepoSecurityAlertLike[];
  unavailable?: boolean;
  unavailableReason?: string;
}

export interface RepoSecuritySummary {
  dependabotOpen: number;
  codeScanningOpen: number;
  totalOpen: number;
  latestUpdatedAt: string | null;
  unavailable: boolean;
  /** Human-readable reason the alerts could not be read (status + GitHub message). */
  unavailableReason?: string;
}

function latestTimestamp(items: RepoSecurityAlertLike[]): string | null {
  let latest = null as string | null;
  for (const item of items) {
    const value = item.updatedAt ?? item.updated_at ?? null;
    if (!value) continue;
    if (!latest || Date.parse(value) > Date.parse(latest)) {
      latest = value;
    }
  }
  return latest;
}

export function buildRepoSecuritySummary(input: RepoSecuritySummaryInput): RepoSecuritySummary {
  const dependabotOpen = input.dependabotAlerts.length;
  const codeScanningOpen = input.codeScanningAlerts.length;
  const latestUpdatedAt = latestTimestamp([...input.dependabotAlerts, ...input.codeScanningAlerts]);

  return {
    dependabotOpen,
    codeScanningOpen,
    totalOpen: dependabotOpen + codeScanningOpen,
    latestUpdatedAt,
    unavailable: Boolean(input.unavailable),
    unavailableReason: input.unavailableReason,
  };
}
