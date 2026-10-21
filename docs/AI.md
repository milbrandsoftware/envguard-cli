# Optional OpenAI explanations without disclosing environment content

`check` remains entirely local. The optional `explain` command adds generic explanations for the diagnostic categories found by the local checker. It is not a vulnerability scanner or a password-strength audit, and its advice never changes a validation result.

## Inspect before sending

```sh
node dist/cli.js explain --preview --json --env examples/web-app/env.invalid --example examples/web-app/.env.example
```

This preview makes **no API request** and needs no key. The JSON contains the ordinary local report and a separate `ai.disclosure` field. Only the latter is used as project-derived API input:

```json
{
  "schemaVersion": 1,
  "codes": ["EMPTY", "MISSING", "UNUSED"]
}
```

Names, values, raw lines, filenames, paths, comments, diagnostic messages, and line numbers are excluded. Counts are excluded too. The payload is reconstructed from a closed five-code allowlist, rather than redacting arbitrary input text. Consequently, two projects with the same categories produce the same project-derived payload, even if their names and secret values differ. Locally displayed reports still contain variable names.

## Explicitly request advice

Configure `OPENAI_API_KEY` in the process environment using your existing secret manager; EnvGuard does not load credentials out of the checked env file. Pick an OpenAI model available to your account that supports Structured Outputs. No default model is silently chosen.

```sh
# Replace YOUR_MODEL with an actual model identifier available to your account.
# This command makes a billable API call if diagnostics exist.
node dist/cli.js explain --ai --model YOUR_MODEL --json
```

The API key necessarily goes to OpenAI in the Authorization header. It is never placed in the prompt or logged. Model selection and fixed instructions also go to OpenAI. No tools, shell commands, repository content, or environment values are sent.

The provider endpoint is fixed to `https://api.openai.com/v1/responses`. There are no configurable proxies or base URLs in the tool, redirects are refused, and requests use `store: false`. This flag requests no stored response; it is **not** a promise of zero retention across all provider systems. Refer to [OpenAI's data controls](https://developers.openai.com/api/docs/guides/your-data).

## Bounds and failures

- One API request per invocation, only when there are known diagnostics.
- No request at all for a clean report.
- 15-second timeout and maximum 800 output tokens.
- No retry, background job, automatic regeneration, or automatic file change.
- Authentication, access, quota, malformed output, refusal, and incomplete output fail with exit 2 and fixed messages. Provider error bodies are never printed.
- Valid advice leaves the original validation exit code intact: a failed check stays failed.
- Advice is untrusted text, with terminal controls removed. It is never executed.
- Optional `usage` reports the provider's actual input/output token counts when supplied; no monetary price or credit balance is invented.

Token limits bound the request size, not a monthly currency budget. The caller must authorize billing and configure account/project spending controls before live use. Tests do not consume API credit.

## Validation status

The provider boundary and CLI are tested with mocked HTTP responses. Tests capture the outbound body and assert that names, values, paths, and API keys are absent; check quota/authentication failures and response validation; and execute the CLI in a child process with `fetch` intercepted. **No live OpenAI call has been made or claimed.** A real integration smoke test requires an approved budget, a configured key, and an available model.

This feature is a functional integration prepared for live validation, not evidence of external adoption or eligibility for any support program. Selection for Codex for Open Source remains OpenAI's decision.

References: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses API](https://developers.openai.com/api/docs/guides/text).
