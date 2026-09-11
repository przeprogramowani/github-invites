import { describe, expect, it, vi } from "vitest";
import { acceptPendingInvites, renderRunSummary, type AcceptOutcome, type GitHubInvitesGateway } from "../src/accept";
import type { GitHubInvite } from "../src/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

function invite(id: number, overrides: Partial<GitHubInvite> = {}): GitHubInvite {
  return {
    id,
    repository: {
      id: id * 10,
      name: `repo-${id}`,
      fullName: `student-${id}/repo-${id}`,
      htmlUrl: `https://github.com/student-${id}/repo-${id}`,
      description: null,
      private: true,
      owner: { login: `student-${id}`, avatarUrl: "https://avatars.example/owner.png" },
    },
    inviter: { login: `student-${id}`, avatarUrl: "https://avatars.example/inviter.png" },
    permissions: "read",
    createdAt: new Date(Date.now() - DAY_MS).toISOString(),
    htmlUrl: `https://github.com/student-${id}/repo-${id}/invitations`,
    expired: false,
    ...overrides,
  };
}

function gateway(
  invites: GitHubInvite[],
  acceptImpl: (id: number) => Promise<AcceptOutcome> = async () => ({ kind: "accepted" })
): GitHubInvitesGateway & { accept: ReturnType<typeof vi.fn> } {
  return {
    listPending: vi.fn<() => Promise<GitHubInvite[]>>().mockResolvedValue(invites),
    accept: vi.fn<(id: number) => Promise<AcceptOutcome>>().mockImplementation(acceptImpl),
  };
}

describe("acceptPendingInvites", () => {
  it("accepts every active invite and reports recent expired invites", async () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const g = gateway([
      invite(1),
      invite(2, { expired: true, createdAt: "2026-08-26T12:00:00.000Z" }),
      invite(3, { expired: true, createdAt: "2026-06-05T12:00:00.000Z" }),
      invite(4, { expired: true, createdAt: "2026-06-05T11:59:59.999Z" }),
    ]);

    const report = await acceptPendingInvites(g, { dryRun: false, now });

    expect(g.accept).toHaveBeenCalledWith(1);
    expect(g.accept).toHaveBeenCalledTimes(1);
    expect(report.outcomes.map(({ invite: item, outcome }) => [item.id, outcome])).toEqual([
      [1, "accepted"],
      [2, "skipped-expired"],
      [3, "skipped-expired"],
    ]);
  });

  it("does not accept anything in a dry run", async () => {
    const g = gateway([invite(1), invite(2)]);

    const report = await acceptPendingInvites(g, { dryRun: true });

    expect(g.accept).not.toHaveBeenCalled();
    expect(report.outcomes.map(({ outcome }) => outcome)).toEqual(["would-accept", "would-accept"]);
  });

  it("continues after per-invite failures", async () => {
    const g = gateway([invite(1), invite(2), invite(3)], async (id) => {
      if (id === 1) return { kind: "failed", status: 500, message: "server error" };
      if (id === 2) throw new Error("network error");
      return { kind: "accepted" };
    });

    const report = await acceptPendingInvites(g, { dryRun: false });

    expect(report.totals.failed).toBe(2);
    expect(report.totals.accepted).toBe(1);
  });

  it("keeps race outcomes visible", async () => {
    const g = gateway([invite(1), invite(2)], async (id) =>
      id === 1 ? { kind: "already-accepted" } : { kind: "not-found" }
    );

    const report = await acceptPendingInvites(g, { dryRun: false });

    expect(report.outcomes.map(({ outcome }) => outcome)).toEqual(["already-accepted", "not-found"]);
  });

  it("renders a safe markdown table", () => {
    const g = gateway([invite(1, { repository: { ...invite(1).repository, fullName: "owner/a|b" } })]);
    return acceptPendingInvites(g, { dryRun: true }).then((report) => {
      const markdown = renderRunSummary(report);
      expect(markdown).toContain("## Pending GitHub invites (dry run)");
      expect(markdown).toContain("owner/a\\|b");
      expect(markdown).toContain("would accept");
    });
  });
});
