export const agentInputs = [
  "claude-code",
  "codex",
  "command",
  "cursor",
  "none",
] as const;

export type AgentInput = (typeof agentInputs)[number];

export type RunnableAgent = Exclude<AgentInput, "none">;

export type ValidatedInput = {
  agent: AgentInput;
  fixId: string;
  qawolfBaseUrl: string;
};

export type InputValidation =
  | ({ isValid: true } & ValidatedInput)
  | { error: string; isValid: false };

const defaultBaseUrl = "https://app.qawolf.com";

function invalid(error: string): InputValidation {
  return { error, isValid: false };
}

function readBaseUrl(value: string): string | { error: string } {
  const baseUrl = value || defaultBaseUrl;
  if (!URL.canParse(baseUrl) || !/^https?:$/.test(new URL(baseUrl).protocol)) {
    return {
      error: `'qawolf-base-url' must be an http(s) URL, not '${baseUrl}'`,
    };
  }
  if (/[?#]/.test(baseUrl)) {
    return {
      error: `'qawolf-base-url' must not have a query string or a hash, not '${baseUrl}'`,
    };
  }
  return baseUrl.replace(/\/+$/, "");
}

export function validateInput(
  getInput: (name: string) => string,
): InputValidation {
  const fixId = getInput("fix").trim();
  if (!fixId) {
    return invalid(
      "'fix' is required: QA Wolf fills it in when it starts the workflow",
    );
  }
  if (!/^[\w-]+$/.test(fixId)) {
    return invalid(
      `'fix' must contain only letters, digits, '_' and '-', not '${fixId}'`,
    );
  }

  const agentValue = getInput("agent").trim();
  const agent = agentInputs.find((candidate) => candidate === agentValue);
  if (!agent) {
    return invalid(
      `'agent' must be one of ${agentInputs.map((candidate) => `'${candidate}'`).join(", ")}, not '${agentValue}'`,
    );
  }

  const baseUrl = readBaseUrl(getInput("qawolf-base-url").trim());
  if (typeof baseUrl === "object") return invalid(baseUrl.error);

  return { agent, fixId, isValid: true, qawolfBaseUrl: baseUrl };
}
