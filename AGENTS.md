# AGENTS.md

Instructions for coding agents working in `github-invites`.

## Purpose

This repository is a small, forkable GitHub Actions utility. Its only external side effect is accepting active repository invitations for the GitHub user represented by `GITHUB_TOKEN`.

When helping a user adopt it, explain the fork/setup flow from `README.md`, recommend a dry run first, and make clear that the token must belong to the account receiving invitations. Agents may suggest schedule, token, troubleshooting, and maintenance improvements, but must not invent GitHub permissions or claim a live workflow succeeded without evidence.

## Non-negotiable behavior

Preserve these invariants unless the user explicitly changes the product behavior:

1. Fetch all pages of pending invitations before accepting any invitation. Accepting while paginating can shift page contents and skip invitations.
2. Accept every non-expired invitation; do not filter by inviter, repository owner, repository visibility, or permission level.
3. Never decline or delete an expired invitation.
4. Report expired invitations created within the last three UTC calendar months. Omit older expired invitations.
5. `--dry-run` must not send PATCH requests.
6. Individual acceptance failures are report rows and do not stop later invitations from being attempted.
7. Missing or rejected credentials are the authentication failure boundary. Do not print the token or request headers.
8. Keep the workflow's repository permission at `contents: read` and use the separate `INVITES_TOKEN` Actions secret.

## Source of truth

- `.github/workflows/accept-invites.yml` defines the schedule, manual input, permissions, and secret mapping.
- `scripts/accept-invites.ts` defines CLI flags, exit behavior, and GitHub Actions summary output.
- `src/domain.ts` defines the three-month UTC expiration rule.
- `src/accept.ts` defines invitation processing, outcomes, and report formatting.
- `src/github.ts` defines the REST endpoints, pagination, response mapping, and HTTP classification.
- `test/` is the regression safety net. Prefer testing the use case with a fake gateway and the adapter with a fake `fetch` implementation.
- `README.md` is the user-facing setup and operations guide.

Do not copy application-specific assumptions from the original `10xForge` implementation into this standalone project, such as a maintainer name or a hard-coded secret name. The reusable secret is `INVITES_TOKEN`; the script receives it through the conventional `GITHUB_TOKEN` environment variable.

## Safe change workflow

Before editing:

- Inspect the current worktree and preserve unrelated user changes.
- Read the relevant source and tests before changing behavior.
- For GitHub API or Actions claims, consult the current official GitHub documentation.

After editing:

```bash
npm ci
npm test
npm run check
npm run format
```

If dependencies are already installed, `npm ci` may be skipped for a quick iteration. Run a dry run only when the user has supplied a token and explicitly wants live GitHub access; otherwise use mocked tests. Never use a real run as a test.

## Review checklist

- Is the change necessary for the standalone forkable use case?
- Does it preserve pagination-before-mutation and no-decline semantics?
- Are success, dry-run, expired, 404/409, auth, and per-invite failure paths covered?
- Does the README describe any new secret, permission, schedule, or side effect precisely?
- Does the workflow still use least-privilege repository permissions?
- Are secrets absent from source, fixtures, logs, and job summaries?
- Are claims about current GitHub behavior sourced from GitHub's documentation?
