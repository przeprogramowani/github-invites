import { isRecentExpiredInvite, type GitHubInvite } from "./domain";

export type AcceptOutcome =
  | { kind: "accepted" }
  | { kind: "already-accepted" }
  | { kind: "not-found" }
  | { kind: "failed"; status: number; message: string };

export interface GitHubInvitesGateway {
  /** List every pending invitation before any invitation is accepted. */
  listPending(): Promise<GitHubInvite[]>;
  accept(id: number): Promise<AcceptOutcome>;
}

export type InviteOutcomeKind = AcceptOutcome["kind"] | "skipped-expired" | "would-accept";

export interface InviteOutcome {
  invite: GitHubInvite;
  outcome: InviteOutcomeKind;
  status?: number;
  detail?: string;
}

export interface RunReport {
  outcomes: InviteOutcome[];
  totals: Record<InviteOutcomeKind, number>;
  dryRun: boolean;
}

const OUTCOME_KINDS: readonly InviteOutcomeKind[] = [
  "accepted",
  "would-accept",
  "skipped-expired",
  "already-accepted",
  "not-found",
  "failed",
];

const OUTCOME_LABELS: Record<InviteOutcomeKind, string> = {
  accepted: "accepted",
  "would-accept": "would accept",
  "skipped-expired": "skipped (expired)",
  "already-accepted": "already accepted",
  "not-found": "not found",
  failed: "failed",
};

function emptyTotals(): Record<InviteOutcomeKind, number> {
  const totals = {} as Record<InviteOutcomeKind, number>;
  for (const kind of OUTCOME_KINDS) totals[kind] = 0;
  return totals;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function acceptOne(gateway: GitHubInvitesGateway, invite: GitHubInvite): Promise<InviteOutcome> {
  try {
    const result = await gateway.accept(invite.id);
    if (result.kind === "failed") {
      return { invite, outcome: "failed", status: result.status, detail: result.message };
    }
    return { invite, outcome: result.kind };
  } catch (error) {
    return { invite, outcome: "failed", detail: errorMessage(error) };
  }
}

/**
 * List all invitations first, then report recent expired invitations and
 * accept active invitations. This ordering prevents pagination from skipping
 * an invitation after a mutation changes the page contents.
 */
export async function acceptPendingInvites(
  gateway: GitHubInvitesGateway,
  opts: { dryRun: boolean; now?: Date }
): Promise<RunReport> {
  const invites = await gateway.listPending();
  const outcomes: InviteOutcome[] = [];
  const now = opts.now ?? new Date();

  for (const invite of invites) {
    if (invite.expired) {
      if (isRecentExpiredInvite(invite, now)) outcomes.push({ invite, outcome: "skipped-expired" });
    } else if (opts.dryRun) {
      outcomes.push({ invite, outcome: "would-accept" });
    } else {
      outcomes.push(await acceptOne(gateway, invite));
    }
  }

  const totals = emptyTotals();
  for (const { outcome } of outcomes) totals[outcome] += 1;

  return { outcomes, totals, dryRun: opts.dryRun };
}

function cell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function outcomeLabel(entry: InviteOutcome): string {
  return entry.outcome === "failed" && entry.status !== undefined
    ? `failed: ${entry.status}`
    : OUTCOME_LABELS[entry.outcome];
}

/** Render the report for both stdout and GitHub Actions' job summary. */
export function renderRunSummary(report: RunReport): string {
  const heading = report.dryRun ? "## Pending GitHub invites (dry run)" : "## Pending GitHub invites";

  if (report.outcomes.length === 0) return `${heading}\n\nNo pending invites.\n`;

  const totalsLine = OUTCOME_KINDS.map((kind) => `${OUTCOME_LABELS[kind]}: ${report.totals[kind]}`).join(" · ");
  const rows = report.outcomes.map((entry) => {
    const repository = `[${cell(entry.invite.repository.fullName)}](${entry.invite.htmlUrl})`;
    return `| ${repository} | ${cell(entry.invite.inviter.login)} | ${entry.invite.permissions} | ${outcomeLabel(entry)} | ${cell(entry.detail ?? "")} |`;
  });

  return [
    heading,
    "",
    `**Totals:** ${report.outcomes.length} pending — ${totalsLine}`,
    "",
    "| Repository | Inviter | Permission | Outcome | Detail |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
