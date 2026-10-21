# Reproducible usage scenarios

These scenarios demonstrate concrete developer workflows with synthetic configuration files. They are automated integration tests, not evidence of users, installations, customer adoption, or production deployments. No application or external service is started.

## Run them

```sh
npm ci --ignore-scripts
npm run test:scenarios
```

For a structured report, build first and invoke the runner directly so npm's progress messages do not enter the JSON:

```sh
npm run build
node scripts/verify-scenarios.mjs --json
```

Each scenario creates a temporary project, writes synthetic input files, invokes the actual compiled CLI in a separate process, checks the JSON and exit code, verifies redaction, and confirms that file hashes remain unchanged. Temporary files are removed afterward. The same suite runs in the GitHub Actions matrix.

## Workflows covered

| Scenario | Concrete problem | Expected behavior |
| --- | --- | --- |
| Ready web application | PORT, DATABASE_URL, and API_TOKEN are configured | Strict validation exits 0 |
| Missing deployment setting | Code now requires DATABASE_URL but the deployed env lacks it | MISSING; exit 1 |
| Stale feature flag | OLD_FEATURE remains after its reference entry is removed | UNUSED warning; exit 0 |
| Strict CI gate | The team requires exact agreement with the reference | Same UNUSED warning; strict exit 1 |
| Empty CI secret | Secret injection supplies an empty API_TOKEN | EMPTY; exit 1 |
| Merge duplication | A merge leaves two conflicting PORT definitions | DUPLICATE; exit 1 |
| Damaged reference | The committed template declares API_TOKEN twice | DUPLICATE; exit 1 |
| Truncated credential | A copied quoted value lacks its closing quote | SYNTAX and MISSING; exit 1; no value disclosure |
| Multiline configuration | A synthetic multiline credential uses BOM and CRLF | Strict validation exits 0 |
| Custom production paths | A project stores its files under names containing spaces | Validation exits 0 |
| Missing env file | A deployment forgets the environment file entirely | FILE_READ; operational exit 2 |

## Practical adoption

For a real project, commit a reference file containing names and safe placeholders, keep `.env` private, and run EnvGuard in your existing deployment gate. Start with warnings, review stale variables, then enable `--strict` when the reference is authoritative. EnvGuard never decides whether a credential is valid and never removes a variable.

For a private trial, record the tool version, operating system, scenario, expected outcome, and actual exit code. Share only redacted reports. Real external feedback should be recorded as such only when it actually exists; synthetic scenarios must remain labelled as tests.
