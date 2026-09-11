import { describe, expect, it, vi } from "vitest";
import { createGitHubInvitesGateway, GitHubAuthError } from "../src/github";

function rawInvite(id: number) {
  return {
    id,
    repository: {
      id: id * 10,
      name: `repo-${id}`,
      full_name: `owner/repo-${id}`,
      html_url: `https://github.com/owner/repo-${id}`,
      description: null,
      private: true,
      owner: { login: "owner", avatar_url: "https://avatars.example/owner.png" },
    },
    inviter: { login: "inviter", avatar_url: "https://avatars.example/inviter.png" },
    permissions: "read",
    created_at: "2026-09-01T00:00:00.000Z",
    html_url: `https://github.com/owner/repo-${id}/invitations`,
    expired: false,
  };
}

describe("createGitHubInvitesGateway", () => {
  it("follows pagination and maps the invitation response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([rawInvite(1)]), {
          status: 200,
          headers: { Link: '<https://api.example.test/user/repository_invitations?page=2>; rel="next"' },
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([rawInvite(2)]), { status: 200 }));
    const gateway = createGitHubInvitesGateway({ token: "test-token", baseUrl: "https://api.example.test", fetchImpl });

    const invites = await gateway.listPending();

    expect(invites.map(({ id, repository }) => [id, repository.fullName])).toEqual([
      [1, "owner/repo-1"],
      [2, "owner/repo-2"],
    ]);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.example.test/user/repository_invitations?per_page=100&page=1",
      "https://api.example.test/user/repository_invitations?per_page=100&page=2",
    ]);
  });

  it("classifies a rejected list token as an authentication error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("forbidden", { status: 403 }));
    const gateway = createGitHubInvitesGateway({ token: "test-token", fetchImpl });

    await expect(gateway.listPending()).rejects.toBeInstanceOf(GitHubAuthError);
  });

  it("maps accept race statuses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const gateway = createGitHubInvitesGateway({ token: "test-token", fetchImpl });

    await expect(gateway.accept(1)).resolves.toEqual({ kind: "already-accepted" });
    await expect(gateway.accept(2)).resolves.toEqual({ kind: "not-found" });
  });
});
