import { z } from "zod";

import { parseJson } from "./parseJson.js";

export type ReadTextFile = (
  path: string,
) => Promise<{ text: string } | "not-found">;

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || undefined);

const checkSchema = z.object({
  name: z.string().min(1),
  note: optionalText,
  result: z.enum(["passed", "failed", "skipped"]),
});

const agentResultSchema = z.object({
  cause: optionalText,
  checks: z
    .array(checkSchema)
    .nullish()
    .transform((checks) => checks ?? undefined),
  previewUrl: optionalText,
  pullRequestUrl: optionalText,
  repository: optionalText,
  status: z.enum(["fixed", "no_fix", "failed"]),
  summary: optionalText,
  title: optionalText,
});

const workingResultSchema = z.object({
  message: optionalText,
  status: z.literal("working"),
});

export type AgentResult = z.infer<typeof agentResultSchema>;

export type ResultFileReading =
  | { kind: "finished"; result: AgentResult }
  | { kind: "invalid" }
  | { kind: "missing" }
  | { kind: "working"; message: string | undefined };

export async function readResultFile(options: {
  path: string;
  readTextFile: ReadTextFile;
}): Promise<ResultFileReading> {
  const file = await options.readTextFile(options.path);
  if (file === "not-found") return { kind: "missing" };
  const json = parseJson(file.text);
  if (json === "not-json") return { kind: "invalid" };

  const working = workingResultSchema.safeParse(json.value);
  if (working.success)
    return { kind: "working", message: working.data.message };

  const finished = agentResultSchema.safeParse(json.value);
  return finished.success
    ? { kind: "finished", result: finished.data }
    : { kind: "invalid" };
}
