import type { ClockDriver, FetchDriver } from "@qawolf/ci-sdk";
import { stringifyUnknown } from "@qawolf/ci-utils";

export type RetryDependencies = {
  clock: ClockDriver;
  fetch: FetchDriver;
  log: (message: string) => void;
};

export type Delivery =
  | { outcome: "answered"; response: Response }
  | { outcome: "gave-up"; reason: string }
  | { outcome: "maybe-delivered"; reason: string };

export type RetryPolicy = "throttled-only" | "transient-failures";

export const retryLimit = 5;
const firstDelayMs = 1000;
const longestDelayMs = 60_000;
const requestTimeoutMs = 30_000;

type Attempt = { response: Response } | { networkError: unknown };

type RetryDecision =
  | { delayMs: number; kind: "retry"; reason: string }
  | { kind: "answered"; response: Response }
  | { kind: "maybe-delivered"; reason: string };

function backoffMs(retryNumber: number): number {
  return Math.min(firstDelayMs * 3 ** (retryNumber - 1), longestDelayMs);
}

function retryAfterMs(options: {
  clock: ClockDriver;
  response: Response;
}): number | undefined {
  const header = options.response.headers.get("retry-after")?.trim();
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : date - options.clock.now();
}

function decideRetry(options: {
  attempt: Attempt;
  clock: ClockDriver;
  retryNumber: number;
  retryPolicy: RetryPolicy;
}): RetryDecision {
  const { attempt, clock, retryNumber, retryPolicy } = options;
  const afterTransientFailure = (reason: string): RetryDecision =>
    retryPolicy === "transient-failures"
      ? { delayMs: backoffMs(retryNumber), kind: "retry", reason }
      : { kind: "maybe-delivered", reason };
  if ("networkError" in attempt) {
    return afterTransientFailure(
      `could not reach QA Wolf (${stringifyUnknown(attempt.networkError)})`,
    );
  }
  const { status } = attempt.response;
  if (status === 429) {
    const requested = retryAfterMs({ clock, response: attempt.response });
    return {
      delayMs:
        requested === undefined
          ? backoffMs(retryNumber)
          : Math.min(Math.max(requested, 0), longestDelayMs),
      kind: "retry",
      reason: "QA Wolf answered HTTP 429",
    };
  }
  if (status >= 500)
    return afterTransientFailure(`QA Wolf answered HTTP ${status}`);
  return { kind: "answered", response: attempt.response };
}

async function attemptOnce(options: {
  fetch: FetchDriver;
  init: RequestInit;
  url: string;
}): Promise<Attempt> {
  try {
    const response = await options.fetch(options.url, {
      ...options.init,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    return { response };
  } catch (networkError) {
    return { networkError };
  }
}

function describeSeconds(delayMs: number): string {
  const seconds = Math.round(delayMs / 1000);
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

async function sendFromRetry(options: {
  deps: RetryDependencies;
  description: string;
  init: RequestInit;
  retryNumber: number;
  retryPolicy: RetryPolicy;
  url: string;
}): Promise<Delivery> {
  const { deps, description, init, retryNumber, retryPolicy, url } = options;
  const attempt = await attemptOnce({ fetch: deps.fetch, init, url });
  const nextRetryNumber = retryNumber + 1;
  const decision = decideRetry({
    attempt,
    clock: deps.clock,
    retryNumber: nextRetryNumber,
    retryPolicy,
  });
  if (decision.kind === "answered")
    return { outcome: "answered", response: decision.response };

  if (decision.kind === "maybe-delivered")
    return { outcome: "maybe-delivered", reason: decision.reason };

  if (nextRetryNumber > retryLimit) {
    return {
      outcome: "gave-up",
      reason: `${decision.reason} after ${retryLimit} retries`,
    };
  }
  deps.log(
    `${description}: ${decision.reason}. Trying again in ${describeSeconds(decision.delayMs)} (retry ${nextRetryNumber} of ${retryLimit}).`,
  );
  await deps.clock.sleep(decision.delayMs);
  return sendFromRetry({ ...options, retryNumber: nextRetryNumber });
}

export function sendWithRetries(options: {
  deps: RetryDependencies;
  description: string;
  init: RequestInit;
  retryPolicy: RetryPolicy;
  url: string;
}): Promise<Delivery> {
  return sendFromRetry({ ...options, retryNumber: 0 });
}
