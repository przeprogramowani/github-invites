import type { AcceptOutcome, GitHubInvitesGateway } from "./accept";
import type { GitHubInvite } from "./domain";

export class GitHubAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "GitHubAuthError";
    this.status = status;
  }
}

export class GitHubListError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "GitHubListError";
    this.status = status;
  }
}

export interface GitHubInvitesGatewayOptions {
  token: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.github.com";
const PER_PAGE = 100;

interface RawInvite {
  id: number;
  repository: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    description: string | null;
    private: boolean;
    owner: { login: string; avatar_url: string };
  };
  inviter: { login: string; avatar_url: string };
  permissions: GitHubInvite["permissions"];
  created_at: string;
  html_url: string;
  expired?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseLinkHeader(linkHeader: string | null): number | null {
  if (!linkHeader) return null;
  for (const link of linkHeader.split(",")) {
    const match = link.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/);
    if (match) return Number.parseInt(match[1], 10);
  }
  return null;
}

function mapInvite(invite: RawInvite): GitHubInvite {
  return {
    id: invite.id,
    repository: {
      id: invite.repository.id,
      name: invite.repository.name,
      fullName: invite.repository.full_name,
      htmlUrl: invite.repository.html_url,
      description: invite.repository.description,
      private: invite.repository.private,
      owner: { login: invite.repository.owner.login, avatarUrl: invite.repository.owner.avatar_url },
    },
    inviter: { login: invite.inviter.login, avatarUrl: invite.inviter.avatar_url },
    permissions: invite.permissions,
    createdAt: invite.created_at,
    htmlUrl: invite.html_url,
    expired: invite.expired ?? false,
  };
}

/** GitHub REST implementation for the invitation list and accept endpoints. */
export function createGitHubInvitesGateway(opts: GitHubInvitesGatewayOptions): GitHubInvitesGateway {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-invites",
  };

  async function fetchPage(page: number): Promise<{ invites: GitHubInvite[]; nextPage: number | null }> {
    const url = new URL(`${baseUrl}/user/repository_invitations`);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), { headers });
    } catch (error) {
      throw new GitHubListError(`Network error while listing invites (page ${page}): ${errorMessage(error)}`);
    }

    if (response.status === 401 || response.status === 403) {
      const body = await response.text().catch(() => "");
      throw new GitHubAuthError(response.status, `GitHub rejected the token (${response.status}): ${body}`);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GitHubListError(`Failed to list invites (${response.status}): ${body}`, response.status);
    }

    let raw: RawInvite[];
    try {
      raw = (await response.json()) as RawInvite[];
    } catch (error) {
      throw new GitHubListError(`Malformed invites response (page ${page}): ${errorMessage(error)}`, response.status);
    }

    return { invites: raw.map(mapInvite), nextPage: parseLinkHeader(response.headers.get("Link")) };
  }

  return {
    async listPending(): Promise<GitHubInvite[]> {
      const invites: GitHubInvite[] = [];
      let page: number | null = 1;
      while (page !== null) {
        const result = await fetchPage(page);
        invites.push(...result.invites);
        page = result.nextPage;
      }
      return invites;
    },

    async accept(id: number): Promise<AcceptOutcome> {
      const response = await fetchImpl(`${baseUrl}/user/repository_invitations/${id}`, { method: "PATCH", headers });
      if (response.ok) return { kind: "accepted" };
      if (response.status === 409) return { kind: "already-accepted" };
      if (response.status === 404) return { kind: "not-found" };
      return { kind: "failed", status: response.status, message: await response.text().catch(() => "") };
    },
  };
}
