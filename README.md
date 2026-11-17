# QA Wolf coding agent

## Introduction

This action hands a bug that QA Wolf found to your own coding agent, in your own CI. Your agent fixes the bug with your keys and your checks. QA Wolf then opens a draft pull request from the fix's branch and runs the bug's flows on its preview to confirm the fix.

QA Wolf starts the workflow when a loop's instructions use `/coding-agent`. You do not start it yourself.

The action gets no key or token of yours, and it needs no QA Wolf API key. It proves which repository it runs in with the run's GitHub OIDC token. Each agent's key goes only to that agent's step.

## Quick start

1. Copy [`workflow/qawolf-coding-agent.yml`](./workflow/qawolf-coding-agent.yml) to `.github/workflows/qawolf-coding-agent.yml` on your default branch. Keep the file name: QA Wolf starts the workflow by it.
2. Add one of these repository secrets. The first one that is set picks the agent.

| Agent       | Secret                                                                        |
| ----------- | ----------------------------------------------------------------------------- |
| Claude Code | `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) |
| Codex       | `OPENAI_API_KEY`                                                              |
| Cursor      | `CURSOR_API_KEY`                                                              |

To use your own CLI, set `AGENT: command` in the file and fill in the "Your command" step.

When the file reaches your default branch, QA Wolf starts it once with the fix `check`. That run reports the agent the file picked, and no agent runs.

## What the action does

The action runs twice: as its own step before the agent's step, and as a post step when the job ends.

Its step:

1. Asks GitHub for an OIDC token with the audience `https://app.qawolf.com`. The workflow needs `id-token: write`.
2. Starts the fix at QA Wolf with that token and the agent's name. QA Wolf answers with the prompt, the branch name and a fix token.
3. Makes the fix's branch, such as `qawolf/fix/fix_8c2k4w`, from the checked-out commit. It sets the commit author to `github-actions[bot]`, so the agent can commit.
4. Writes the prompt to a file and exports the [environment variables](#environment-variables) for the next steps.

Its post step always runs. It reads the result file and reports it to QA Wolf. When there is no result file, it reports that the fix failed, so QA Wolf hears of every run that started.

The calls to QA Wolf retry `429` (after `Retry-After`) five times, with a backoff from 1 second to 1 minute. The reports of events also retry network errors and `5xx`. The start does not, because QA Wolf starts a fix only once and a lost answer may hide a start that worked. Its step then fails.

## Inputs

### `fix`

**Required**. The fix QA Wolf asked for. QA Wolf fills it in when it starts the workflow. The value `check` is a setup check: the action reports the agent and no agent runs.

### `agent`

**Required**. The agent the workflow picked: `claude-code`, `codex`, `cursor`, `command` or `none`. The reference workflow sets it in the `AGENT` line.

With `none`, the action reports to QA Wolf that the repository is not set up, and its step fails with the secrets to add.

### `qawolf-base-url`

The base URL of the QA Wolf API. Defaults to `https://app.qawolf.com`.

## Outputs

### `agent`

The agent whose step runs next, such as `claude-code`. Empty for a setup check and when there is no agent, so no agent step runs.

## Environment variables

The action exports these for the steps after it:

| Variable             | Value                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| `QAWOLF_PROMPT_FILE` | The file that holds the prompt for the agent                                       |
| `QAWOLF_RESULT_FILE` | The file the agent writes its result to                                            |
| `QAWOLF_BRANCH`      | The fix's branch, which the action checked out                                     |
| `QAWOLF_FIX_ID`      | The fix's id                                                                       |
| `QAWOLF_FIX_URL`     | The bug's page in QA Wolf                                                          |
| `QAWOLF_FIX_TOKEN`   | A token that can only read this fix and report its events. It is masked in the log |

## The result file

The prompt tells the agent to write its result as JSON to `$QAWOLF_RESULT_FILE`:

```json
{
  "status": "fixed",
  "title": "A pull request title, under 72 characters",
  "summary": "What was wrong and what changed, in two or three sentences",
  "cause": "path/to/file.ts:42, and why it caused the bug",
  "checks": [{ "name": "npm run lint", "result": "passed", "note": "" }],
  "repository": "owner/name, only for no_fix when the cause is in another repository",
  "previewUrl": "only if the agent deployed the fix where QA Wolf can reach it"
}
```

- `status` is `fixed`, `no_fix` or `failed`. Each check's `result` is `passed`, `failed` or `skipped`.
- A command that opened its own pull request adds `pullRequestUrl`.
- A command that started work somewhere else and exited writes `{"status":"working"}`. The post step then tells QA Wolf that the work goes on, and does not end the fix.
- A missing file, or a file that is not in this shape, ends the fix as `failed`.

The "Push the fix" step of the workflow reads `status` and `title`. When the status is `fixed`, it commits what the agent left and pushes `$QAWOLF_BRANCH` with the run's own `GITHUB_TOKEN`.

## The workflow file

[`workflow/qawolf-coding-agent.yml`](./workflow/qawolf-coding-agent.yml) is the file to copy. It:

- runs on `workflow_dispatch` with the inputs `fix` and `bug`, which QA Wolf fills in,
- has the permissions `contents: write`, to push the fix's branch, and `id-token: write`, for the OIDC token,
- picks the agent in its `AGENT` line from the secrets that are set, without passing a secret to QA Wolf's step,
- runs `actions/checkout` with `persist-credentials: false`, so the GitHub token is not left on disk,
- gives each agent's key only to that agent's step,
- limits the job to 60 minutes with `timeout-minutes`.

## What to protect

The agent runs shell commands in the job. It reads the bug report, which can quote text from the tested application, and an attacker can write text in an application. The prompt marks the report as untrusted, but that is an instruction to a model, not a guard. So treat everything the job can do as something the agent can do.

- The job has `contents: write`, so protect the default branch. With branch protection, the job can push only to other branches, and QA Wolf opens a draft pull request for a person to review.
- The job has `id-token: write`, so that QA Wolf's step can prove the run. Every step of the job can then ask GitHub for a token. If your cloud trusts GitHub tokens of this repository, scope that trust to the workflow that deploys, with the token's `workflow_ref` claim, or `job_workflow_ref` for a reusable workflow. Do not scope it to the repository or the branch alone.

## What to know

- A public repository shows the run's logs to everyone, and the logs can quote the bug report.
- QA Wolf does not open a pull request from a branch that changes `.github/`.
