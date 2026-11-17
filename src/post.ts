import { randomUUID } from "node:crypto";

import { stringifyUnknown } from "@qawolf/ci-utils";

import {
  actionCore,
  clock,
  makeClient,
  readTextFile,
  runGit,
} from "./githubDependencies.js";
import { readGitHubRun } from "./githubRun.js";
import { runPostStep } from "./runPostStep.js";

async function runGitHubPostStep(): Promise<void> {
  await runPostStep({
    clock,
    core: actionCore,
    githubRun: readGitHubRun(process.env),
    makeClient,
    makeEventId: randomUUID,
    readTextFile,
    runGit,
  });
}

runGitHubPostStep().catch((error: unknown) => {
  actionCore.setFailed(
    `Action failed with reason: ${stringifyUnknown(error) || "Unknown error"}`,
  );
});
