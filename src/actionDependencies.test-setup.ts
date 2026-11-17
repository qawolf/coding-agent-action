import { jest } from "@jest/globals";

import type { FetchDriver } from "@qawolf/ci-sdk";

import type { ActionCore } from "./actionCore.js";
import type { RunGit } from "./git.js";
import { makeQaWolfClient } from "./qawolfClient/index.js";
import type { MainStepDependencies } from "./runMainStep.js";
import type { PostStepDependencies } from "./runPostStep.js";

export const headSha = "9b2e4d1c0a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d";

export const githubRun = {
  id: 1234567890,
  url: "https://github.com/howlhotel/web/actions/runs/1234567890",
};

export function makeCore(inputs: Record<string, string>) {
  const state = new Map<string, string>();
  return {
    exportVariable: jest.fn<ActionCore["exportVariable"]>(),
    getInput: (name: string) => inputs[name] ?? "",
    getState: (name: string) => state.get(name) ?? "",
    info: jest.fn<ActionCore["info"]>(),
    saveState: jest.fn<ActionCore["saveState"]>((name, value) => {
      state.set(name, value);
    }),
    setFailed: jest.fn<ActionCore["setFailed"]>(),
    setOutput: jest.fn<ActionCore["setOutput"]>(),
    setSecret: jest.fn<ActionCore["setSecret"]>(),
    warning: jest.fn<ActionCore["warning"]>(),
  };
}

export type FakeCore = ReturnType<typeof makeCore>;

export function makeFetch(...responses: Response[]) {
  const fetch = jest.fn<FetchDriver>();
  responses.forEach((response) => fetch.mockResolvedValueOnce(response));
  return fetch;
}

export function sentRequest(
  fetch: ReturnType<typeof makeFetch>,
  callIndex: number,
) {
  const call = fetch.mock.calls[callIndex];
  if (!call) throw Error(`fetch was not called ${callIndex + 1} times`);
  const [url, init] = call;
  const body: unknown = JSON.parse(String(init?.body));
  return { body, headers: new Headers(init?.headers), url: String(url) };
}

export function makeClientFactory(fetch: FetchDriver) {
  return (baseUrl: string) =>
    makeQaWolfClient({
      baseUrl,
      deps: {
        clock: { now: () => 0, sleep: async () => undefined },
        fetch,
        log: () => undefined,
      },
      userAgent: "coding-agent-action/test",
    });
}

export function makeMainDependencies(options: {
  core: FakeCore;
  fetch: FetchDriver;
}) {
  return {
    core: options.core,
    makeClient: makeClientFactory(options.fetch),
    requestIdToken: jest.fn<MainStepDependencies["requestIdToken"]>(
      async () => ({ token: "github-oidc-token" }),
    ),
    runGit: jest.fn<RunGit>(async () => ""),
    runnerTemp: "/home/runner/work/_temp",
    writeTextFile: jest.fn<MainStepDependencies["writeTextFile"]>(),
  };
}

export function makePostDependencies(options: {
  core: FakeCore;
  fetch: FetchDriver;
  resultFileText: string | undefined;
  runGit: RunGit | undefined;
}): PostStepDependencies {
  const { resultFileText } = options;
  return {
    clock: { now: () => Date.parse("2026-11-16T15:02:11.000Z") },
    core: options.core,
    githubRun,
    makeClient: makeClientFactory(options.fetch),
    makeEventId: () => "6f0c1b9e-4d2a-4c1e-9f3b-2a7d8e6c5b41",
    readTextFile: async () =>
      resultFileText === undefined ? "not-found" : { text: resultFileText },
    runGit: options.runGit ?? (async () => `${headSha}\n`),
  };
}
