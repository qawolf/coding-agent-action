import { z } from "zod";

import type { GitHubRun } from "./qawolfClient/index.js";

const runEnvironmentSchema = z.object({
  GITHUB_REPOSITORY: z.string().regex(/^[^/]+\/[^/]+$/),
  GITHUB_RUN_ID: z.coerce.number().int().positive(),
  GITHUB_SERVER_URL: z.url(),
});

export function readGitHubRun(environment: NodeJS.ProcessEnv): GitHubRun {
  const run = runEnvironmentSchema.parse(environment);
  const runPath = [
    ...run.GITHUB_REPOSITORY.split("/"),
    "actions",
    "runs",
    String(run.GITHUB_RUN_ID),
  ]
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const serverUrl = run.GITHUB_SERVER_URL.replace(/\/+$/, "");
  return { id: run.GITHUB_RUN_ID, url: `${serverUrl}/${runPath}` };
}
