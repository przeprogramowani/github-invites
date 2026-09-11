# GitHub Invites

Small, forkable GitHub Actions project that checks the authenticated user's pending repository invitations every other day and accepts active invitations automatically.

It is intended for people who regularly receive invitations to repositories—for example, a mentor or maintainer who needs access to student projects—without depending on a larger application.

## What it does

- Lists every pending invitation, following GitHub pagination before changing anything.
- Accepts each active invitation one at a time.
- Shows expired invitations created in the last three calendar months as `skipped (expired)`.
- Leaves expired invitations untouched. It never declines or deletes invitations.
- Writes the same Markdown report to the terminal and the GitHub Actions job summary.
- Keeps the workflow green for an individual invitation failure or a non-authentication listing error.
- Fails the workflow when the token is missing or GitHub rejects it with HTTP 401/403.

Older expired invitations are omitted from the report. The three-month window is deliberate: it keeps the report useful while leaving the invitation available for the sender to replace with a fresh invitation.

## Fork and enable it

1. Fork this repository to the GitHub account that should accept invitations.
2. Create a token for that same account.
3. In the fork, open **Settings → Secrets and variables → Actions** and create a repository secret named `INVITES_TOKEN`.
4. Paste the token into that secret. Do not put it in a committed file, an issue, a pull request, or a workflow command.
5. Open **Actions** and enable GitHub Actions for the fork if GitHub asks. Forked repositories have scheduled workflows blocked by default.
6. In the workflow list, open **Accept repository invites** and click **Enable workflow**. Enabling Actions alone is not enough; this workflow must also be enabled.
7. Run **Accept repository invites** manually with **List invites without accepting** checked.
8. After confirming the dry-run report, run it again with the checkbox clear. Future scheduled runs happen every two days at 06:00 UTC.

The workflow's built-in `GITHUB_TOKEN` is not sufficient: it represents the fork repository, not the user account whose invitations are being accepted. The workflow passes your `INVITES_TOKEN` secret to the script as `GITHUB_TOKEN`.

### Token choice

For the simplest setup, use a **classic personal access token** owned by the receiving account with the `repo:invite` scope. That scope is targeted to invitations. A classic token with the broader `repo` scope also works but grants access to repository code, so use it only when that broader access is acceptable.

GitHub's current REST documentation does not list a fine-grained personal access token for the **Accept a repository invitation** endpoint. A GitHub App user access token is another supported option, but configuring the App is outside this small repository. Review the [repository invitation API documentation](https://docs.github.com/en/rest/collaborators/invitations) and your organization's token policy before creating credentials.

## Run locally

Requirements: Node.js 22 (the version is recorded in `.nvmrc`).

```bash
npm ci
cp .env.example .env
# edit .env and set GITHUB_TOKEN to a token owned by the receiving account

npm run invites:accept -- --dry-run # list; make no PATCH requests
npm run invites:accept              # accept active invitations
```

The `.env` file is ignored by Git. Remove it after local use if the machine is shared.

## Workflow controls

The scheduled workflow uses `0 6 */2 * *`, which means every second calendar day at 06:00 UTC. It also supports `workflow_dispatch`:

- **List invites without accepting** checked: dry run; no invitation is accepted.
- Checkbox clear: real run; active invitations are accepted.

Schedules run from the default branch. GitHub may disable scheduled workflows in a public repository after 60 days without repository activity; re-enable the workflow in the Actions tab if that happens.

## Reading a run

Each report contains totals and a row for every reportable invitation. Outcomes are:

| Outcome             | Meaning                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `accepted`          | GitHub accepted the invitation.                                  |
| `would accept`      | Dry-run result; no mutation was made.                            |
| `skipped (expired)` | Expired within the three-month reporting window; left untouched. |
| `already accepted`  | The invitation disappeared between listing and accepting.        |
| `not found`         | GitHub no longer has the invitation.                             |
| `failed`            | GitHub returned another status or the request failed locally.    |

An empty report says `No pending invites.` Older expired invitations do not appear in the table.

## Project layout

```text
.github/workflows/accept-invites.yml  schedule and manual trigger
scripts/accept-invites.ts             CLI entry point and job-summary output
src/domain.ts                         invite data and expiration rule
src/accept.ts                         use case, outcomes, and Markdown report
src/github.ts                         GitHub REST API adapter
test/                                 behavior and formatting tests
```

## Development

```bash
npm test        # behavior tests
npm run check   # TypeScript validation
npm run format  # verify Prettier formatting
```

Keep the token handling, pagination-before-mutation rule, dry-run behavior, and no-decline behavior covered when changing the project. See [AGENTS.md](AGENTS.md) for instructions intended for coding agents and contributors.

## Security notes

- The secret is read only in the job step that runs the script.
- The job grants the repository's built-in token only `contents: read`.
- Reports include repository names, inviters, permissions, and GitHub URLs, but never the token.
- Do not add logging of request headers or environment variables.
- If a token is exposed, revoke it immediately and create a replacement.
