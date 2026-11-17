import { describe, expect, it } from "@jest/globals";

import {
  githubRun,
  headSha,
  makeCore,
  makeFetch,
  makeMainDependencies,
  makePostDependencies,
  sentRequest,
} from "./actionDependencies.test-setup.js";
import type { RunGit } from "./git.js";
import { runMainStep } from "./runMainStep.js";
import { runPostStep } from "./runPostStep.js";

const eventIdentity = {
  at: "2026-11-16T15:02:11.000Z",
  id: "6f0c1b9e-4d2a-4c1e-9f3b-2a7d8e6c5b41",
};

async function runJob(options: {
  agent: string;
  eventAnswer?: Response;
  postRunGit?: RunGit;
  resultFileText: string | undefined;
}) {
  const core = makeCore({ agent: options.agent, fix: "fix_8c2k4w" });
  await runMainStep(
    makeMainDependencies({
      core,
      fetch: makeFetch(
        Response.json({
          branch: "qawolf/fix/fix_8c2k4w",
          fixUrl: "https://app.qawolf.com/howl/bugs/all?id=cl9",
          prompt: "Fix the bug.",
          token: "qawolf_fix_secret",
        }),
      ),
    }),
  );
  const fetch = makeFetch(options.eventAnswer ?? Response.json({}));
  await runPostStep(
    makePostDependencies({
      core,
      fetch,
      resultFileText: options.resultFileText,
      runGit: options.postRunGit,
    }),
  );
  return { core, event: () => sentRequest(fetch, 0), fetch };
}

describe("runPostStep", () => {
  it("reports the agent's result file as the end of the fix", async () => {
    const result = {
      cause: "src/cart/applyPromo.ts:42",
      checks: [{ name: "npm run lint", result: "passed" }],
      status: "fixed",
      summary: "The promo endpoint read the code too early.",
      title: "Apply promo codes to the cart total",
    };
    const { core, event } = await runJob({
      agent: "claude-code",
      resultFileText: JSON.stringify(result),
    });

    expect(event().url).toBe(
      "https://app.qawolf.com/api/v1/coding-agent/fixes/fix_8c2k4w/events",
    );
    expect(event().headers.get("Authorization")).toBe(
      "Bearer qawolf_fix_secret",
    );
    expect(event().body).toEqual({
      ...eventIdentity,
      ...result,
      agent: { kind: "claude-code" },
      branch: "qawolf/fix/fix_8c2k4w",
      headSha,
      run: githubRun,
      type: "finished",
    });
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("still reports the result when git cannot read the head commit", async () => {
    const { core, event } = await runJob({
      agent: "claude-code",
      async postRunGit() {
        throw Error("fatal: not a git repository");
      },
      resultFileText: JSON.stringify({ status: "no_fix", summary: "No cause" }),
    });

    expect(event().body).toMatchObject({ status: "no_fix", type: "finished" });
    expect(event().body).not.toHaveProperty("headSha");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("reports failed when the agent wrote no result file", async () => {
    const { event } = await runJob({
      agent: "codex",
      resultFileText: undefined,
    });

    expect(event().body).toMatchObject({
      status: "failed",
      summary: expect.stringMatching(/^The job ended without a result/),
      type: "finished",
    });
  });

  it("reports failed when the result file is not valid", async () => {
    const { event } = await runJob({
      agent: "codex",
      resultFileText: '{"status":"done"}',
    });

    expect(event().body).toMatchObject({
      status: "failed",
      summary: expect.stringMatching(/^The job ended without a result/),
      type: "finished",
    });
  });

  it("reports working for a command that started work elsewhere", async () => {
    const { event } = await runJob({
      agent: "command",
      resultFileText: '{"status":"working"}',
    });

    expect(event().body).toEqual({ ...eventIdentity, type: "working" });
  });

  it("reports not_set_up when the workflow has no agent", async () => {
    const { event } = await runJob({
      agent: "none",
      resultFileText: undefined,
    });

    expect(event().body).toEqual({
      ...eventIdentity,
      run: githubRun,
      status: "not_set_up",
      type: "finished",
    });
  });

  it("passes when QA Wolf already has the end of the fix", async () => {
    const { core } = await runJob({
      agent: "codex",
      eventAnswer: Response.json(
        { error: "already_finished" },
        { status: 409 },
      ),
      resultFileText: '{"status":"no_fix","summary":"Not here."}',
    });

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("sends nothing after a setup check", async () => {
    const core = makeCore({ agent: "claude-code", fix: "check" });
    await runMainStep(
      makeMainDependencies({ core, fetch: makeFetch(Response.json({})) }),
    );
    const fetch = makeFetch();

    await runPostStep(
      makePostDependencies({
        core,
        fetch,
        resultFileText: undefined,
        runGit: undefined,
      }),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
