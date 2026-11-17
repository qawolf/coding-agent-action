import { describe, expect, it } from "@jest/globals";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { RunGit } from "./git.js";
import { makeFixBranch, readHeadSha } from "./git.js";

const runFile = promisify(execFile);

const isolatedGitEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

async function withCheckout(test: (runGit: RunGit) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "coding-agent-action-"));
  const runGit: RunGit = async (args) =>
    (
      await runFile("git", args, {
        cwd: directory,
        env: isolatedGitEnvironment,
      })
    ).stdout;
  try {
    await runGit(["init", "--quiet", "--initial-branch=main"]);
    await runGit([
      "-c",
      "user.name=Someone",
      "-c",
      "user.email=someone@example.com",
      "commit",
      "--quiet",
      "--allow-empty",
      "--message=Start",
    ]);
    await test(runGit);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe("makeFixBranch", () => {
  it("makes the fix's branch from the checked-out commit, with the bot as the author", async () => {
    await withCheckout(async (runGit) => {
      const startSha = (await runGit(["rev-parse", "HEAD"])).trim();

      await makeFixBranch({ branch: "qawolf/fix/fix_8c2k4w", runGit });
      await runGit(["commit", "--quiet", "--allow-empty", "--message=Fix"]);

      expect((await runGit(["branch", "--show-current"])).trim()).toBe(
        "qawolf/fix/fix_8c2k4w",
      );
      expect((await runGit(["rev-parse", "HEAD~1"])).trim()).toBe(startSha);
      expect(await readHeadSha(runGit)).toEqual({
        sha: (await runGit(["rev-parse", "HEAD"])).trim(),
      });
      expect((await runGit(["log", "-1", "--format=%an <%ae>"])).trim()).toBe(
        "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
      );
    });
  });
});
