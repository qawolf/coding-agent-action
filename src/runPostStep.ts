import type { ActionCore } from "./actionCore.js";
import type { RunGit } from "./git.js";
import { readHeadSha } from "./git.js";
import type {
  FixEvent,
  GitHubRun,
  QaWolfClient,
} from "./qawolfClient/index.js";
import type { AgentResult, ReadTextFile } from "./resultFile.js";
import { readResultFile } from "./resultFile.js";
import type { SavedFix } from "./savedFix.js";
import { readSavedFix } from "./savedFix.js";

export type PostStepDependencies = {
  clock: { now: () => number };
  core: ActionCore;
  githubRun: GitHubRun;
  makeClient: (baseUrl: string) => QaWolfClient;
  makeEventId: () => string;
  readTextFile: ReadTextFile;
  runGit: RunGit;
};

function missingResult(reason: string): AgentResult {
  return {
    cause: undefined,
    checks: undefined,
    previewUrl: undefined,
    pullRequestUrl: undefined,
    repository: undefined,
    status: "failed",
    summary: `The job ended without a result: ${reason}. The agent may have crashed, or the job was cancelled or timed out.`,
    title: undefined,
  };
}

async function buildEvent(options: {
  deps: PostStepDependencies;
  fix: SavedFix;
}): Promise<FixEvent> {
  const { deps, fix } = options;
  const identity = {
    at: new Date(deps.clock.now()).toISOString(),
    id: deps.makeEventId(),
  };
  if (fix.kind === "not-set-up") {
    return {
      ...identity,
      run: deps.githubRun,
      status: "not_set_up",
      type: "finished",
    };
  }

  const reading = await readResultFile({
    path: fix.resultFile,
    readTextFile: deps.readTextFile,
  });
  if (reading.kind === "working")
    return { ...identity, message: reading.message, type: "working" };

  const result =
    reading.kind === "finished"
      ? reading.result
      : missingResult(
          reading.kind === "missing"
            ? "the agent wrote no result file"
            : "the result file is not JSON in the shape the prompt asks for",
        );
  const head = await readHeadSha(deps.runGit);
  return {
    ...identity,
    ...result,
    agent: { kind: fix.agent },
    branch: fix.branch,
    headSha: head === "unreadable" ? undefined : head.sha,
    run: deps.githubRun,
    type: "finished",
  };
}

function describeEvent(event: FixEvent): string {
  if (event.type === "working")
    return "Reported to QA Wolf that the agent is still working.";

  return `Reported to QA Wolf that the fix ended with the status '${event.status}'.`;
}

export async function runPostStep(deps: PostStepDependencies): Promise<void> {
  const { core } = deps;
  const fix = readSavedFix(core.getState);
  if (fix === "nothing-saved") {
    core.info("No fix started in this job, so there is nothing to report.");
    return;
  }
  core.setSecret(fix.token);

  const event = await buildEvent({ deps, fix });
  const outcome = await deps.makeClient(fix.qawolfBaseUrl).sendEvent({
    event,
    fixId: fix.fixId,
    fixToken: fix.token,
  });
  switch (outcome.outcome) {
    case "already-finished":
      core.info(
        `QA Wolf already has the end of fix ${fix.fixId}, so it kept that one.`,
      );
      return;
    case "failed":
      core.setFailed(outcome.message);
      return;
    case "recorded":
      core.info(describeEvent(event));
      return;
  }
}
