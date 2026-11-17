import { describe, expect, it } from "@jest/globals";

import {
  makeCore,
  makeFetch,
  makeMainDependencies,
  sentRequest,
} from "./actionDependencies.test-setup.js";
import { runMainStep } from "./runMainStep.js";

const handoffAnswer = {
  branch: "qawolf/fix/fix_8c2k4w",
  fixUrl: "https://app.qawolf.com/howl/bugs/all?id=cl9",
  prompt: "Fix the bug.",
  token: "qawolf_fix_secret",
};

function inputsFor(fix: string, agent: string) {
  return { agent, fix, "qawolf-base-url": "https://qawolf.example/" };
}

function exportedVariables(core: ReturnType<typeof makeCore>) {
  return Object.fromEntries(core.exportVariable.mock.calls);
}

describe("runMainStep", () => {
  it("starts the fix with the run's OIDC token and the agent", async () => {
    const core = makeCore(inputsFor("fix_8c2k4w", "codex"));
    const fetch = makeFetch(Response.json(handoffAnswer));
    const deps = makeMainDependencies({ core, fetch });

    await runMainStep(deps);

    expect(deps.requestIdToken).toHaveBeenCalledWith("https://app.qawolf.com");
    const request = sentRequest(fetch, 0);
    expect(request.url).toBe(
      "https://qawolf.example/api/v1/coding-agent/fixes/fix_8c2k4w/start",
    );
    expect(request.headers.get("Authorization")).toBe(
      "Bearer github-oidc-token",
    );
    expect(request.body).toEqual({ agent: "codex" });
  });

  it("hands the fix to the agent's step on a new branch", async () => {
    const core = makeCore(inputsFor("fix_8c2k4w", "claude-code"));
    const deps = makeMainDependencies({
      core,
      fetch: makeFetch(Response.json(handoffAnswer)),
    });

    await runMainStep(deps);

    expect(core.setSecret).toHaveBeenCalledWith("qawolf_fix_secret");
    expect(exportedVariables(core)).toEqual({
      QAWOLF_BRANCH: "qawolf/fix/fix_8c2k4w",
      QAWOLF_FIX_ID: "fix_8c2k4w",
      QAWOLF_FIX_TOKEN: "qawolf_fix_secret",
      QAWOLF_FIX_URL: "https://app.qawolf.com/howl/bugs/all?id=cl9",
      QAWOLF_PROMPT_FILE: "/home/runner/work/_temp/qawolf-fix_8c2k4w-prompt.md",
      QAWOLF_RESULT_FILE:
        "/home/runner/work/_temp/qawolf-fix_8c2k4w-result.json",
    });
    expect(deps.writeTextFile).toHaveBeenCalledWith({
      path: "/home/runner/work/_temp/qawolf-fix_8c2k4w-prompt.md",
      text: "Fix the bug.",
    });
    expect(deps.runGit).toHaveBeenCalledWith([
      "switch",
      "-c",
      "qawolf/fix/fix_8c2k4w",
    ]);
    expect(core.setOutput).toHaveBeenCalledWith("agent", "claude-code");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("never prints the fix token or the prompt", async () => {
    const core = makeCore(inputsFor("fix_8c2k4w", "cursor"));
    const deps = makeMainDependencies({
      core,
      fetch: makeFetch(Response.json(handoffAnswer)),
    });

    await runMainStep(deps);

    const printed = [...core.info.mock.calls, ...core.warning.mock.calls]
      .flat()
      .join("\n");
    expect(printed).not.toContain("qawolf_fix_secret");
    expect(printed).not.toContain("Fix the bug.");
  });

  it("runs no agent for a setup check", async () => {
    const core = makeCore(inputsFor("check", "claude-code"));
    const deps = makeMainDependencies({
      core,
      fetch: makeFetch(Response.json({ agent: "claude-code" })),
    });

    await runMainStep(deps);

    expect(core.setOutput).toHaveBeenCalledWith("agent", "");
    expect(core.exportVariable).not.toHaveBeenCalled();
    expect(core.saveState).not.toHaveBeenCalled();
    expect(deps.runGit).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("reports the missing agent and fails with the secrets to add", async () => {
    const core = makeCore(inputsFor("fix_8c2k4w", "none"));
    const fetch = makeFetch(Response.json({ token: "qawolf_fix_secret" }));

    await runMainStep(makeMainDependencies({ core, fetch }));

    expect(sentRequest(fetch, 0).body).toEqual({ agent: "none" });
    expect(core.setOutput).toHaveBeenCalledWith("agent", "");
    expect(core.setFailed).toHaveBeenCalledWith(
      "No coding agent: add ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, OPENAI_API_KEY or CURSOR_API_KEY as a repository secret, or use the Your command step",
    );
    expect(core.exportVariable).not.toHaveBeenCalled();
  });

  it("asks for id-token: write when GitHub gives no OIDC token", async () => {
    const core = makeCore(inputsFor("fix_8c2k4w", "codex"));
    const fetch = makeFetch();
    const deps = makeMainDependencies({ core, fetch });
    deps.requestIdToken.mockResolvedValueOnce("missing-permission");

    await runMainStep(deps);

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Add `id-token: write`"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails with QA Wolf's reason when it refuses the start", async () => {
    const core = makeCore(inputsFor("fix_8c2k4w", "codex"));
    const fetch = makeFetch(
      Response.json({ error: "already_started" }, { status: 409 }),
    );

    await runMainStep(makeMainDependencies({ core, fetch }));

    expect(core.setFailed).toHaveBeenCalledWith(
      "QA Wolf refused to start fix fix_8c2k4w (HTTP 409): already_started.",
    );
    expect(core.saveState).not.toHaveBeenCalled();
  });
});
