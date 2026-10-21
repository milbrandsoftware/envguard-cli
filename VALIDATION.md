# v0.1.0 validation report

Date: 2026-10-21 (Europe/Paris).

## Result

**PASS — local release candidate. GitHub browser identity is verified. The owner authorized uploading the source through GitHub's web interface. npm publication remains pending separate approval and authentication.**

The repository is initialized locally on branch `main`. Source publication targets the public repository `milbrandsoftware/envguard-cli` through the authenticated browser. No GitHub release or npm publication has been performed. No automatic publication workflow exists.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Strict TypeScript check | PASS | `npm run check` |
| Windows / Node.js 24.21.0 | PASS | 64 tests, 0 failures |
| Windows / Node.js 22.23.3 | PASS | Same 64 tests, 0 failures, executed with a temporary npm-provided Node.js binary |
| Coverage on Node.js 24 | PASS | Compiled source: 100% lines, 98.48% branches, 100% functions, Node built-in coverage |
| npm package installation | PASS | Actual tarball installed offline into a temporary project; installed bin invoked through `npm exec --offline` |
| npm publish contents | PASS | Explicit allowlist; 9 files before final pack; no env files, node_modules, tests, or local artifacts |
| Dependency audit | PASS | `npm audit` and `npm audit --omit=dev`: 0 known vulnerabilities at check time |
| Runtime dependencies | PASS | None; TypeScript and Node.js types are development-only |
| Valid documented fixture | PASS | Strict check exits 0 |
| Invalid documented fixture | PASS | JSON check exits 1; empty DATABASE_URL, missing API_TOKEN, extra DEBUG reported |
| Exit codes and errors | PASS | Validation 1, usage/read/encoding errors 2, clean validation 0 |
| Value redaction | PASS | Synthetic sentinel absent from both text and JSON reports, including syntax and duplicate diagnostics |
| Read-only behavior | PASS | Fixture content unchanged; process environment unchanged; shell-like input treated literally |
| Remote GitHub Actions | NOT RUN | Windows/Linux, Node.js 22/24 matrix is prepared; requires an approved public push |
| Linux execution | NOT RUN | Covered by the prepared CI matrix, not claimed as locally tested |

Coverage is a test metric, not proof of absence of defects. Runtime values are read into memory, but never retained in parsed metadata or rendered diagnostics. Variable names and line numbers are intentionally reported.

## Identity and registry checks

- Authenticated browser GitHub login: `milbrandsoftware`, created by the owner.
- Account/email association: **VERIFIED** in GitHub Settings > Emails. `milbrand.software@gmail.com` is marked Primary and Verified.
- Repository-local Git author: `MIILBRAND Nicolas <milbrand.software@gmail.com>`.
- Global Git configuration and command-line GitHub authentication were preserved. Web uploads use the verified browser account. Any future CLI operation must authenticate as `milbrandsoftware`; a browser login does not authenticate `gh` automatically.
- npm authentication: **NOT CONFIGURED** (`npm whoami` returned ENEEDAUTH).
- `https://registry.npmjs.org/envguard-cli`: E404 on 2026-10-21. No package was found; this is neither a reservation nor a guarantee of name acceptance.
- GitHub source repository: `https://github.com/milbrandsoftware/envguard-cli`. Its public creation and source upload use the browser account, not the existing CLI identity.

## Deliverables

- `src/check.ts`: pure parser, comparison, structured report, text formatter.
- `src/cli.ts`: local file reading, strict arguments, JSON/text output, safe operational errors.
- `test/`: parser, comparison, CLI, redaction, encoding, and exit-code regression tests.
- `scripts/smoke-package.mjs`: actual package installation and executable smoke test.
- `.github/workflows/ci.yml`: read-only CI, pinned action revisions, no publishing job.
- English README, MIT license, CONTRIBUTING, SECURITY, CHANGELOG, usage examples, and manual release procedure.
- `artifacts/envguard-cli-0.1.0.tgz` and adjacent SHA-256 file: local release candidate, excluded from Git and npm package contents.

## Intentional scope

`UNUSED` means absent from `.env.example`, not unused in source code. Reference blanks are placeholders; env blanks are errors. Every reference variable is required. No interpolation, value validation, optional-variable configuration, source-code scanning, or env-file modification is provided.

## Publication gates

1. GitHub source publication is authorized through the web interface; npm publication requires separate confirmation.
2. Authenticate npm with the intended owner account. Select `milbrandsoftware` in the GitHub CLI only if CLI access is needed; the browser account/email association is already verified.
3. Review repository identity/URLs, mark README and changelog as released, and rerun validation.
4. Publish source using `docs/RELEASING.md` and require remote CI to pass.
5. Recheck npm name availability, inspect the packed artifact, then publish only with approval.

No Codex for OSS eligibility claim, adoption statistic, download count, contributor count, or popularity claim has been made.
