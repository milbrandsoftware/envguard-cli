# Contributing

Small, focused contributions are welcome. Keep EnvGuard read-only, dependency-light, and offline at runtime.

1. Use Node.js 22 or 24 LTS and run `npm ci --ignore-scripts`.
2. Make a focused change with tests for the user-visible behavior and error cases.
3. Run `npm run check`, `npm test`, and `npm run test:package`.
4. Update the English documentation and changelog when behavior changes.
5. Open a pull request explaining the problem, solution, and validation.

Use synthetic environment values in tests, examples, issues, and screenshots. Never include real `.env` files. Diagnostics must not include values, source lines, unvalidated names, arbitrary paths, or exception dumps. Add regression tests for any potential disclosure. AI requests may contain only allowlisted diagnostic codes as project-derived input; neither variable names nor values may leave the machine.

TypeScript is compiled to ESM; tests use Node's built-in test runner. Avoid dependencies unless they solve a concrete maintenance problem. Do not add telemetry, implicit network calls, write-back operations, or automatic publication. Provider tests must intercept fetch and must not require credentials or incur costs.

Report security problems privately as described in [SECURITY.md](SECURITY.md). Contributions are licensed under MIT.
