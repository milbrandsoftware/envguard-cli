# EnvGuard CLI

Check your `.env` against `.env.example` before a missing variable breaks your application.

EnvGuard reports missing variables, extra variables, duplicates, empty values, and syntax errors. It runs locally, never evaluates your environment files, and never includes their values in its reports. No runtime dependencies, server, database, API, or telemetry.

**Release status:** v0.1.0 is a release candidate. Source code is hosted at [milbrandsoftware/envguard-cli](https://github.com/milbrandsoftware/envguard-cli). The npm package has not been published. The `npx` commands below become available after the first npm release.

## Quick start

Requires Node.js 22 or 24 LTS.

After publication:

```sh
npx envguard-cli check
npx envguard-cli check --json
npx envguard-cli check --strict
```

To run the source checkout today:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js check --env examples/web-app/env.valid --example examples/web-app/.env.example
```

Files default to `.env` and `.env.example` in the current working directory. Nothing is written to either file. Custom paths, including paths with spaces, are supported:

```sh
envguard-cli check --env .env.production --example config/.env.example --strict
envguard-cli --help
envguard-cli --version
```

## Example

Given this reference file:

```dotenv
PORT=3000
DATABASE_URL=
API_TOKEN=
```

An environment file with an empty `DATABASE_URL`, no `API_TOKEN`, and an additional `DEBUG` variable produces:

```text
EnvGuard: FAIL
  ERROR EMPTY env:2 DATABASE_URL - Variable has an empty or whitespace-only value.
  ERROR MISSING example:3 API_TOKEN - Variable is required by the example but missing from env.
  WARNING UNUSED env:3 DEBUG - Variable is not declared in the example.
3 env variables, 3 example variables; 2 error(s), 1 warning(s).
```

`UNUSED` means **not declared in the reference file**. EnvGuard does not scan application code and cannot prove that a variable is unused by your application.

## Rules and exit codes

| Check | Default severity |
| --- | --- |
| Required key missing from env | Error |
| Key present in env but absent from example | Warning |
| Duplicate key in either file | Error |
| Empty or whitespace-only env value | Error |
| Invalid syntax in either file | Error |

Empty reference values are accepted as placeholders. There is no optional-variable convention in v0.1.0: every reference key is required and every env value must be nonempty. Duplicate diagnostics refer to the first valid definition. Comparison uses case-sensitive names, independently of the operating system.

| Exit code | Meaning |
| --- | --- |
| `0` | No errors; warnings allowed unless `--strict` is enabled |
| `1` | Validation errors, or warnings with `--strict` |
| `2` | Invalid command, unreadable file, invalid UTF-8, or operational error |

With `--json`, stdout contains one JSON document and diagnostic output does not go to stderr. Validation reports include `schemaVersion`, `ok`, `strict`, `exitCode`, `counts`, `summary`, and `diagnostics`. Operational failures contain `schemaVersion`, `ok`, `exitCode`, and `error`. See [JSON and CI examples](docs/USAGE.md).

## Supported syntax

EnvGuard uses a small, explicit dotenv dialect, informed by the [Node.js dotenv specification](https://nodejs.org/api/environment_variables.html#dotenv). It validates syntax more strictly than permissive dotenv loaders.

- UTF-8, optional BOM, LF/CRLF/CR line endings.
- Names match `[A-Za-z_][A-Za-z0-9_]*`; `export NAME=value` is accepted.
- Blank lines and `#` comments; an unquoted `#` starts an inline comment.
- Single and double quotes, including multiline values and `#` inside quotes.
- A backslash protects the next character inside either quote style; values are not decoded or expanded.
- Only whitespace or a comment may follow a closing quote.
- Backtick quoting, invalid names, missing `=`, NUL characters, and unterminated quotes are errors.

`$VAR`, `${VAR}`, and shell-like text are treated literally. The tool never runs shell commands, resolves interpolation, loads values into `process.env`, or checks whether a credential is valid. Do not use it as a general shell-script or Docker Compose parser.

## Privacy

Reports contain validated variable **names**, file roles (`env` / `example`), line numbers, and fixed explanatory messages. They never contain values, raw input lines, user-supplied paths, or raw exception messages. Variable names themselves can be sensitive; decide whether your CI logs should be public. Keep secrets in values, not variable names.

The CLI has no network code and no telemetry. Installing packages with npm or `npx` can contact the npm registry; that is separate from running EnvGuard. Original values necessarily exist in process memory while their files are read. The tool is read-only.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:coverage
npm run test:package
```

Tests use Node's built-in test runner and synthetic credentials. The package smoke test packs the actual release, installs it offline into a temporary project, and runs the installed executable. GitHub Actions is configured for Windows and Linux on Node.js 22 and 24; remote CI results are only available once the repository is pushed.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md), and the [manual release procedure](docs/RELEASING.md).

## License

[MIT](LICENSE). No usage statistics, popularity claims, or program eligibility claims are made.
