# Security policy

## Supported versions

v0.1.0 is the initial prepared release. Security fixes will target the latest released version; no older release support is promised.

## Reporting a vulnerability

Please email **milbrand.software@gmail.com** privately with a description, affected version, and a minimal reproduction using synthetic values. Do not open a public issue containing a real secret or secret-bearing log. A response time is not guaranteed.

If you discover a real credential in any output, revoke or rotate it through its provider before sharing evidence. Redact the credential from the report.

## Security boundaries

- EnvGuard reads local files and never modifies them. `check` is offline. Explicit `explain --ai` calls OpenAI with diagnostic categories only; environment names and values are excluded. Inspect the [disclosure contract](docs/AI.md).
- Local reports contain variable names and line numbers, never values or source lines. These names and numbers are not sent to the optional AI provider.
- Input is never executed or installed into the process environment.
- It cannot determine whether a value is a valid, strong, or unexpired secret.
- It is not a substitute for secret scanning, a secret manager, or access controls.
- File contents must exist in memory while being checked; process or OS-level access is outside this tool's protection.

The npm package uses an explicit publish allowlist. CI has read-only repository permissions and no publication job. Package installation itself is handled by npm and may access its registry. AI credentials go only in the Authorization header to the fixed OpenAI endpoint; error bodies are not printed. AI advice is untrusted and never executed. Provider tests are mocked; no live API success or program eligibility is claimed.
