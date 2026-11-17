## v1.0.0

- New GitHub action that hands a bug that QA Wolf found to your own coding agent in your own CI. It proves the run to QA Wolf with GitHub's OIDC token, gets the prompt and a fix token, makes the fix's branch, and exports `QAWOLF_PROMPT_FILE`, `QAWOLF_RESULT_FILE`, `QAWOLF_BRANCH`, `QAWOLF_FIX_ID`, `QAWOLF_FIX_URL` and `QAWOLF_FIX_TOKEN` for the agent's step. Its post step reports the agent's result to QA Wolf when the job ends.
