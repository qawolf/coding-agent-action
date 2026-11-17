import type { RunnableAgent } from "../inputs.js";
import type { AgentResult } from "../resultFile.js";

export type GitHubRun = { id: number; url: string };

type EventIdentity = { at: string; id: string };

export type FinishedEvent = EventIdentity & {
  run: GitHubRun;
  type: "finished";
} & (
    | { status: "not_set_up" }
    | (AgentResult & {
        agent: { kind: RunnableAgent };
        branch: string;
        headSha: string | undefined;
      })
  );

export type WorkingEvent = EventIdentity & {
  message: string | undefined;
  type: "working";
};

export type FixEvent = FinishedEvent | WorkingEvent;
