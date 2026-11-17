import { z } from "zod";

import type { AgentInput } from "../inputs.js";
import { parseJson } from "../parseJson.js";

import type { FixEvent } from "./events.js";
import type {
  Delivery,
  RetryDependencies,
  RetryPolicy,
} from "./sendWithRetries.js";
import { sendWithRetries } from "./sendWithRetries.js";
import type { StartAnswer } from "./startAnswer.js";
import { parseStartAnswer } from "./startAnswer.js";

export type { FixEvent, GitHubRun } from "./events.js";
export type { RetryDependencies } from "./sendWithRetries.js";
export type { StartAnswer } from "./startAnswer.js";

export type StartOutcome =
  | { answer: StartAnswer; outcome: "started" }
  | { message: string; outcome: "failed" };

export type EventOutcome =
  | { outcome: "already-finished" }
  | { outcome: "recorded" }
  | { message: string; outcome: "failed" };

export type QaWolfClient = {
  sendEvent: (options: {
    event: FixEvent;
    fixId: string;
    fixToken: string;
  }) => Promise<EventOutcome>;
  startFix: (options: {
    agent: AgentInput;
    fixId: string;
    oidcToken: string;
  }) => Promise<StartOutcome>;
};

const refusalSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

async function readJson(
  response: Response,
): Promise<{ value: unknown } | "not-json"> {
  return parseJson(await response.text());
}

async function describeRefusal(options: {
  action: string;
  delivery: Delivery;
}): Promise<string> {
  const { action, delivery } = options;
  if (delivery.outcome === "gave-up")
    return `QA Wolf did not ${action}: ${delivery.reason}.`;

  if (delivery.outcome === "maybe-delivered")
    return `It is not known whether QA Wolf could ${action}: ${delivery.reason}. The action does not repeat this request, because QA Wolf accepts it only once.`;

  const body = await readJson(delivery.response);
  const refusal = refusalSchema.safeParse(
    body === "not-json" ? undefined : body.value,
  );
  const reason = refusal.success
    ? (refusal.data.message ?? refusal.data.error)
    : undefined;
  const detail = reason ? `: ${reason}` : "";
  return `QA Wolf refused to ${action} (HTTP ${delivery.response.status})${detail}.`;
}

export function makeQaWolfClient(options: {
  baseUrl: string;
  deps: RetryDependencies;
  userAgent: string;
}): QaWolfClient {
  const { baseUrl, deps, userAgent } = options;
  const fixUrl = (fixId: string, path: string) =>
    `${baseUrl}/api/v1/coding-agent/fixes/${encodeURIComponent(fixId)}/${path}`;
  const post = (request: {
    bearerToken: string;
    body: unknown;
    description: string;
    retryPolicy: RetryPolicy;
    url: string;
  }) =>
    sendWithRetries({
      deps,
      description: request.description,
      init: {
        body: JSON.stringify(request.body),
        headers: {
          Authorization: `Bearer ${request.bearerToken}`,
          "Content-Type": "application/json",
          "User-Agent": userAgent,
        },
        method: "POST",
      },
      retryPolicy: request.retryPolicy,
      url: request.url,
    });

  return {
    async sendEvent({ event, fixId, fixToken }) {
      const delivery = await post({
        bearerToken: fixToken,
        body: event,
        description: `Reporting the ${event.type} event`,
        retryPolicy: "transient-failures",
        url: fixUrl(fixId, "events"),
      });
      if (delivery.outcome === "answered" && delivery.response.ok)
        return { outcome: "recorded" };

      if (delivery.outcome === "answered" && delivery.response.status === 409)
        return { outcome: "already-finished" };

      const action = `record the ${event.type} event of fix ${fixId}`;
      return {
        message: await describeRefusal({ action, delivery }),
        outcome: "failed",
      };
    },

    async startFix({ agent, fixId, oidcToken }) {
      const action = `start fix ${fixId}`;
      const delivery = await post({
        bearerToken: oidcToken,
        body: { agent },
        description: "Starting the fix",
        retryPolicy: "throttled-only",
        url: fixUrl(fixId, "start"),
      });
      if (delivery.outcome !== "answered" || !delivery.response.ok) {
        return {
          message: await describeRefusal({ action, delivery }),
          outcome: "failed",
        };
      }
      const body = await readJson(delivery.response);
      const answer =
        body === "not-json"
          ? "invalid"
          : parseStartAnswer({ agent, body: body.value, fixId });
      if (answer === "invalid") {
        return {
          message: `QA Wolf answered the start of fix ${fixId} with a body this action does not understand. Update the action.`,
          outcome: "failed",
        };
      }
      return { answer, outcome: "started" };
    },
  };
}
