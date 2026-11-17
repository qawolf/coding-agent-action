import { describe, expect, it } from "@jest/globals";

import { validateInput } from "./inputs.js";

function validate(inputs: Record<string, string>) {
  return validateInput((name) => inputs[name] ?? "");
}

describe("validateInput", () => {
  it("defaults the base URL to QA Wolf's app", () => {
    expect(validate({ agent: "codex", fix: "fix_8c2k4w" })).toEqual({
      agent: "codex",
      fixId: "fix_8c2k4w",
      isValid: true,
      qawolfBaseUrl: "https://app.qawolf.com",
    });
  });

  it("refuses a fix id that could leave the runner's temp folder", () => {
    expect(validate({ agent: "codex", fix: "../fix" })).toEqual({
      error:
        "'fix' must contain only letters, digits, '_' and '-', not '../fix'",
      isValid: false,
    });
  });

  it("refuses an agent the workflow cannot run", () => {
    expect(validate({ agent: "copilot", fix: "fix_8c2k4w" })).toMatchObject({
      error:
        "'agent' must be one of 'claude-code', 'codex', 'command', 'cursor', 'none', not 'copilot'",
      isValid: false,
    });
  });
});
