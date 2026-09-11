export interface GitHubInvite {
  id: number;
  repository: {
    id: number;
    name: string;
    fullName: string;
    htmlUrl: string;
    description: string | null;
    private: boolean;
    owner: {
      login: string;
      avatarUrl: string;
    };
  };
  inviter: {
    login: string;
    avatarUrl: string;
  };
  permissions: "read" | "write" | "admin";
  createdAt: string;
  htmlUrl: string;
  expired: boolean;
}

export const EXPIRED_INVITE_WINDOW_MONTHS = 3;

/**
 * Keep expired-invite reporting bounded. GitHub invitations do not need to be
 * declined by this project; older expired invitations are simply omitted.
 */
export function isRecentExpiredInvite(invite: GitHubInvite, now: Date = new Date()): boolean {
  if (!invite.expired) return false;

  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - EXPIRED_INVITE_WINDOW_MONTHS);

  return new Date(invite.createdAt).getTime() >= cutoff.getTime();
}
