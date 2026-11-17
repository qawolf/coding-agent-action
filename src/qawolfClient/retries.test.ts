import { describe, expect, it, jest } from "@jest/globals";

import type { FetchDriver } from "@qawolf/ci-sdk";

import { makeQaWolfClient } from "./index.js";

const now = Date.parse("2026-11-16T15:00:00.000Z");

function setUp(fetch: FetchDriver) {
  const sleep = jest.fn(async (_ms: number) => undefined);
  const log = jest.fn<(message: string) => void>();
  const client = makeQaWolfClient({
    baseUrl: "https://app.qawolf.com",
    deps: { clock: { now: () => now, sleep }, fetch, log },
    userAgent: "coding-agent-action/test",
  });
  const sendWorking = () =>
    client.sendEvent({
      event: {
        at: "2026-11-16T15:00:00.000Z",
        id: "6f0c1b9e-4d2a-4c1e-9f3b-2a7d8e6c5b41",
        message: undefined,
        type: "working",
      },
      fixId: "fix_8c2k4w",
      fixToken: "qawolf_fix_secret",
    });
  const startFix = () =>
    client.startFix({
      agent: "claude-code",
      fixId: "fix_8c2k4w",
      oidcToken: "oidc-token",
    });
  const waits = () => sleep.mock.calls.map(([ms]) => ms);
  return { log, sendWorking, startFix, waits };
}

function answers(...responses: Array<Response | Error>) {
  const fetch = jest.fn<FetchDriver>();
  responses.forEach((response) =>
    response instanceof Error
      ? fetch.mockRejectedValueOnce(response)
      : fetch.mockResolvedValueOnce(response),
  );
  return fetch;
}

const serverError = () => new Response("", { status: 503 });

describe("QA Wolf client retries", () => {
  it("tries again after a server error", async () => {
    const fetch = answers(serverError(), Response.json({}));
    const { sendWorking, waits } = setUp(fetch);

    await expect(sendWorking()).resolves.toEqual({ outcome: "recorded" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waits()).toEqual([1000]);
  });

  it("tries again after a network error", async () => {
    const fetch = answers(Error("ECONNRESET"), Response.json({}));
    const { sendWorking } = setUp(fetch);

    await expect(sendWorking()).resolves.toEqual({ outcome: "recorded" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("waits as long as Retry-After asks after a 429", async () => {
    const fetch = answers(
      new Response("", { headers: { "Retry-After": "7" }, status: 429 }),
      new Response("", {
        headers: { "Retry-After": new Date(now + 12_000).toUTCString() },
        status: 429,
      }),
      Response.json({}),
    );
    const { sendWorking, waits } = setUp(fetch);

    await sendWorking();

    expect(waits()).toEqual([7000, 12_000]);
  });

  it("gives up after five retries that back off from 1 second to 1 minute", async () => {
    const fetch = answers(...Array.from({ length: 6 }, serverError));
    const { sendWorking, waits } = setUp(fetch);

    await expect(sendWorking()).resolves.toEqual({
      message:
        "QA Wolf did not record the working event of fix fix_8c2k4w: QA Wolf answered HTTP 503 after 5 retries.",
      outcome: "failed",
    });
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(waits()).toEqual([1000, 3000, 9000, 27_000, 60_000]);
  });

  it("does not try again when QA Wolf refuses the request", async () => {
    const fetch = answers(
      Response.json({ error: "invalid_token" }, { status: 401 }),
    );
    const { sendWorking } = setUp(fetch);

    await expect(sendWorking()).resolves.toEqual({
      message:
        "QA Wolf refused to record the working event of fix fix_8c2k4w (HTTP 401): invalid_token.",
      outcome: "failed",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("logs each retry without the fix token", async () => {
    const { log, sendWorking } = setUp(
      answers(serverError(), Response.json({})),
    );

    await sendWorking();

    expect(log).toHaveBeenCalledWith(
      "Reporting the working event: QA Wolf answered HTTP 503. Trying again in 1 second (retry 1 of 5).",
    );
  });
});

describe("QA Wolf client start", () => {
  const handoff = {
    branch: "qawolf/fix/fix_8c2k4w",
    fixUrl: "https://app.qawolf.com/bugs/12",
    prompt: "Fix the bug",
    token: "qawolf_fix_secret",
  };

  it("does not start twice after a server error, because the first start may have reached QA Wolf", async () => {
    const fetch = answers(serverError(), Response.json(handoff));
    const { startFix } = setUp(fetch);

    await expect(startFix()).resolves.toEqual({
      message:
        "It is not known whether QA Wolf could start fix fix_8c2k4w: QA Wolf answered HTTP 503. The action does not repeat this request, because QA Wolf accepts it only once.",
      outcome: "failed",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not start twice after a network error", async () => {
    const fetch = answers(Error("ETIMEDOUT"), Response.json(handoff));
    const { startFix } = setUp(fetch);

    await expect(startFix()).resolves.toMatchObject({ outcome: "failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("tries the start again after a 429, which QA Wolf answers before it starts anything", async () => {
    const fetch = answers(
      new Response("", { headers: { "Retry-After": "7" }, status: 429 }),
      Response.json(handoff),
    );
    const { startFix, waits } = setUp(fetch);

    await expect(startFix()).resolves.toEqual({
      answer: { agent: "claude-code", kind: "handoff", ...handoff },
      outcome: "started",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waits()).toEqual([7000]);
  });
});
