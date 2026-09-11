#!/usr/bin/env npx tsx
import { config } from "dotenv";
import { appendFileSync } from "node:fs";

config();

const dryRun = process.argv.includes("--dry-run");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emitSummary(markdown: string): void {
  process.stdout.write(markdown);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, markdown, "utf8");
}

async function main(): Promise<number> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    console.error(
      "Missing GITHUB_TOKEN. Set it locally in .env or expose your Actions secret as GITHUB_TOKEN in the workflow."
    );
    return 1;
  }

  const [{ createGitHubInvitesGateway, GitHubAuthError }, { acceptPendingInvites, renderRunSummary }] =
    await Promise.all([import("../src/github"), import("../src/accept")]);

  let report;
  try {
    report = await acceptPendingInvites(createGitHubInvitesGateway({ token }), { dryRun });
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      console.error(`GitHub authentication failed: ${error.message}`);
      return 1;
    }
    emitSummary(
      `${dryRun ? "## Pending GitHub invites (dry run)" : "## Pending GitHub invites"}\n\n` +
        `Listing invites failed: ${errorMessage(error)}\n`
    );
    return 0;
  }

  emitSummary(renderRunSummary(report));
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`accept-invites failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
