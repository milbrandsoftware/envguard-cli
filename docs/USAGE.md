# Usage and CI integration

## Web application

Keep the names required by your application in a committed `.env.example`:

```dotenv
PORT=3000
DATABASE_URL=
API_TOKEN=
```

Populate `.env` locally through your secret manager or deployment process. Do not commit it. Run `envguard-cli check --strict` before starting the application. A new required variable should be added to both the application configuration and its example.

The checked-in `examples/web-app/env.valid` and `env.invalid` files contain synthetic placeholders only:

```sh
node dist/cli.js check --env examples/web-app/env.valid --example examples/web-app/.env.example --strict
node dist/cli.js check --env examples/web-app/env.invalid --example examples/web-app/.env.example --json
```

The first exits `0`, the second exits `1`. These examples do not connect to a database or validate any token.

## JSON report

For an env file containing only `PORT=3000`, compared to a reference with `PORT=` and `API_TOKEN=`:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "strict": false,
  "exitCode": 1,
  "counts": { "envVariables": 1, "exampleVariables": 2 },
  "summary": { "errors": 1, "warnings": 0 },
  "diagnostics": [
    {
      "code": "MISSING",
      "severity": "error",
      "file": "example",
      "line": 2,
      "key": "API_TOKEN",
      "message": "Variable is required by the example but missing from env."
    }
  ]
}
```

Operational errors use a separate envelope:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "exitCode": 2,
  "error": {
    "code": "FILE_READ",
    "message": "Cannot read env file. Check its path and permissions."
  }
}
```

Validation codes: `MISSING`, `UNUSED`, `DUPLICATE`, `EMPTY`, `SYNTAX`.
Operational codes: `USAGE`, `FILE_READ`, `FILE_ENCODING`, `INTERNAL`.
`line` is 1-based; missing keys point to their declaration in the reference. `key` is omitted when syntax prevents safe identification of a name. Counts include unique, syntactically valid definitions. Invalid lines may also cause missing-variable diagnostics.

## CI

After the package is published, add a pinned dev dependency and commit the lockfile:

```sh
npm install --save-dev --save-exact envguard-cli@0.1.0
```

Have your existing CI secret injection create `.env` without echoing its contents. Then:

```sh
npx --no-install envguard-cli check --strict --json > envguard-report.json
```

The command's exit code fails the CI step when validation fails. Do not use `|| true` for a required gate. Never upload `.env` as an artifact. The report contains variable names; restrict artifact access if those names are confidential.

The tool intentionally compares two files, not injected process environment variables. Optional values, secret strength checks, interpolation, recursive discovery, and source-code usage analysis are outside v0.1.0.
