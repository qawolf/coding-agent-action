import { stringifyUnknown } from "@qawolf/ci-utils";

import {
  actionCore,
  makeClient,
  requestIdToken,
  runGit,
  writeTextFile,
} from "./githubDependencies.js";
import { runMainStep } from "./runMainStep.js";

async function runGitHubMainStep(): Promise<void> {
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp)
    throw Error("RUNNER_TEMP is not set. Run this action in GitHub Actions.");

  await runMainStep({
    core: actionCore,
    makeClient,
    requestIdToken,
    runGit,
    runnerTemp,
    writeTextFile,
  });
}

runGitHubMainStep().catch((error: unknown) => {
  actionCore.setFailed(
    `Action failed with reason: ${stringifyUnknown(error) || "Unknown error"}`,
  );
});
