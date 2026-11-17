import { join } from "node:path";

import type { ActionCore } from "./actionCore.js";
import type { RunGit } from "./git.js";
import { makeFixBranch } from "./git.js";
import { validateInput } from "./inputs.js";
import type { QaWolfClient, StartAnswer } from "./qawolfClient/index.js";
import { saveFix } from "./savedFix.js";

const oidcAudience = "https://app.qawolf.com";

const noAgentMessage =
  "No coding agent: add ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, OPENAI_API_KEY or CURSOR_API_KEY as a repository secret, or use the Your command step";

export type MainStepDependencies = {
  core: ActionCore;
  makeClient: (baseUrl: string) => QaWolfClient;
  requestIdToken: (
    audience: string,
  ) => Promise<{ token: string } | "missing-permission">;
  runGit: RunGit;
  runnerTemp: string;
  writeTextFile: (options: { path: string; text: string }) => Promise<void>;
};

async function handOff(options: {
  answer: Extract<StartAnswer, { kind: "handoff" }>;
  deps: MainStepDependencies;
  fixId: string;
  qawolfBaseUrl: string;
}): Promise<void> {
  const { answer, deps, fixId, qawolfBaseUrl } = options;
  const { agent } = answer;
  const { core } = deps;
  const promptFile = join(deps.runnerTemp, `qawolf-${fixId}-prompt.md`);
  const resultFile = join(deps.runnerTemp, `qawolf-${fixId}-result.json`);
  saveFix({
    fix: {
      agent,
      branch: answer.branch,
      fixId,
      kind: "handoff",
      qawolfBaseUrl,
      resultFile,
      token: answer.token,
    },
    saveState: core.saveState,
  });

  await deps.writeTextFile({ path: promptFile, text: answer.prompt });
  await makeFixBranch({ branch: answer.branch, runGit: deps.runGit });

  core.exportVariable("QAWOLF_PROMPT_FILE", promptFile);
  core.exportVariable("QAWOLF_RESULT_FILE", resultFile);
  core.exportVariable("QAWOLF_BRANCH", answer.branch);
  core.exportVariable("QAWOLF_FIX_ID", fixId);
  core.exportVariable("QAWOLF_FIX_URL", answer.fixUrl);
  core.exportVariable("QAWOLF_FIX_TOKEN", answer.token);
  core.setOutput("agent", agent);
  core.info(
    `QA Wolf started fix ${fixId} on the branch ${answer.branch}. The ${agent} step runs next. ${answer.fixUrl}`,
  );
}

export async function runMainStep(deps: MainStepDependencies): Promise<void> {
  const { core } = deps;
  const input = validateInput(core.getInput);
  if (!input.isValid) {
    core.setFailed(`Action input is invalid: ${input.error}`);
    return;
  }
  const { agent, fixId, qawolfBaseUrl } = input;

  const idToken = await deps.requestIdToken(oidcAudience);
  if (idToken === "missing-permission") {
    core.setFailed(
      "GitHub gave this job no OIDC token. Add `id-token: write` to the workflow's permissions, so QA Wolf can check which repository the run is in.",
    );
    return;
  }

  const started = await deps.makeClient(qawolfBaseUrl).startFix({
    agent,
    fixId,
    oidcToken: idToken.token,
  });
  if (started.outcome === "failed") {
    core.setFailed(started.message);
    return;
  }

  const { answer } = started;
  if (answer.kind === "check") {
    core.setOutput("agent", "");
    core.info(
      `Reported to QA Wolf that this workflow picks the agent '${agent}'.`,
    );
    return;
  }

  core.setSecret(answer.token);
  if (answer.kind === "not-set-up") {
    saveFix({
      fix: { fixId, kind: "not-set-up", qawolfBaseUrl, token: answer.token },
      saveState: core.saveState,
    });
    core.setOutput("agent", "");
    core.setFailed(noAgentMessage);
    return;
  }

  await handOff({ answer, deps, fixId, qawolfBaseUrl });
}
