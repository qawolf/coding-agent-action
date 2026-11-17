import { z } from "zod";

import { agentInputs } from "./inputs.js";
import { parseJson } from "./parseJson.js";

const stateName = "fix";

const sharedFields = {
  fixId: z.string().min(1),
  qawolfBaseUrl: z.string().min(1),
  token: z.string().min(1),
};

const savedFixSchema = z.discriminatedUnion("kind", [
  z.object({ ...sharedFields, kind: z.literal("not-set-up") }),
  z.object({
    ...sharedFields,
    agent: z.enum(agentInputs).exclude(["none"]),
    branch: z.string().min(1),
    kind: z.literal("handoff"),
    resultFile: z.string().min(1),
  }),
]);

export type SavedFix = z.infer<typeof savedFixSchema>;

export function saveFix(options: {
  fix: SavedFix;
  saveState: (name: string, value: string) => void;
}): void {
  options.saveState(stateName, JSON.stringify(options.fix));
}

export function readSavedFix(
  getState: (name: string) => string,
): SavedFix | "nothing-saved" {
  const state = getState(stateName);
  if (!state) return "nothing-saved";
  const json = parseJson(state);
  if (json === "not-json")
    throw Error("The main step saved a fix that is not JSON.");

  return savedFixSchema.parse(json.value);
}
