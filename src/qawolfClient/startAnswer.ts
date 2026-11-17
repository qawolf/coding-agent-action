import { z } from "zod";

import type { AgentInput, RunnableAgent } from "../inputs.js";

export const setupCheckFixId = "check";

const tokenSchema = z.string().min(1);

const handoffAnswerSchema = z.object({
  branch: z.string().regex(/^[\w.][\w./-]*$/),
  fixUrl: z.url(),
  prompt: z.string().min(1),
  token: tokenSchema,
});

const notSetUpAnswerSchema = z.object({ token: tokenSchema });

export type StartAnswer =
  | { kind: "check" }
  | { kind: "not-set-up"; token: string }
  | ({ agent: RunnableAgent; kind: "handoff" } & z.infer<
      typeof handoffAnswerSchema
    >);

export function parseStartAnswer(options: {
  agent: AgentInput;
  body: unknown;
  fixId: string;
}): StartAnswer | "invalid" {
  if (options.fixId === setupCheckFixId) return { kind: "check" };
  if (options.agent === "none") {
    const parsed = notSetUpAnswerSchema.safeParse(options.body);
    return parsed.success
      ? { kind: "not-set-up", token: parsed.data.token }
      : "invalid";
  }
  const parsed = handoffAnswerSchema.safeParse(options.body);
  return parsed.success
    ? { agent: options.agent, kind: "handoff", ...parsed.data }
    : "invalid";
}
