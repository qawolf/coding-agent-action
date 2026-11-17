import * as core from "@actions/core";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import packageJson from "../package.json" with { type: "json" };

import type { ActionCore } from "./actionCore.js";
import type { RunGit } from "./git.js";
import { makeQaWolfClient } from "./qawolfClient/index.js";
import type { QaWolfClient } from "./qawolfClient/index.js";
import type { ReadTextFile } from "./resultFile.js";

const runFile = promisify(execFile);

export const actionCore: ActionCore = {
  exportVariable: (name, value) => core.exportVariable(name, value),
  getInput: (name) => core.getInput(name),
  getState: (name) => core.getState(name),
  info: (message) => core.info(message),
  saveState: (name, value) => core.saveState(name, value),
  setFailed: (message) => core.setFailed(message),
  setOutput: (name, value) => core.setOutput(name, value),
  setSecret: (secret) => core.setSecret(secret),
  warning: (message) => core.warning(message),
};

export const clock = {
  now: () => Date.now(),
  async sleep(ms: number) {
    await delay(ms);
  },
};

export function makeClient(baseUrl: string): QaWolfClient {
  return makeQaWolfClient({
    baseUrl,
    deps: { clock, fetch, log: actionCore.warning },
    userAgent: `coding-agent-action/${packageJson.version}`,
  });
}

export const runGit: RunGit = async (args) => {
  const { stdout } = await runFile("git", args);
  return stdout;
};

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export const readTextFile: ReadTextFile = async (path) => {
  try {
    return { text: await readFile(path, "utf8") };
  } catch (error) {
    if (isMissingFile(error)) return "not-found";
    throw error;
  }
};

export async function writeTextFile(options: {
  path: string;
  text: string;
}): Promise<void> {
  await writeFile(options.path, options.text, { mode: 0o600 });
}

export async function requestIdToken(
  audience: string,
): Promise<{ token: string } | "missing-permission"> {
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) return "missing-permission";
  return { token: await core.getIDToken(audience) };
}
