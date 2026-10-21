# Manual release procedure

No command in this project automatically publishes to npm or GitHub. Do not create the public repository, push source, publish a GitHub release, or run a real `npm publish` until the owner confirms publication.

## Identity and availability gates

The intended GitHub owner is `milbrandsoftware`. Its email settings were inspected in the authenticated browser: `milbrand.software@gmail.com` is the primary, verified email address. The package repository, issues, and homepage URLs now target this account.

Browser and command-line authentication are separate. Before publication, ensure `gh api user --jq .login` returns exactly `milbrandsoftware`. If needed, sign into that account through `gh auth login --hostname github.com --web`, then select it with `gh auth switch --hostname github.com --user milbrandsoftware`. Do not create a repository using another account or alter global Git identity for other projects.

The repository-local Git email is configured to the verified address. Recheck it before committing:

```sh
git config user.email "milbrand.software@gmail.com"
git config user.name "MIILBRAND Nicolas"
git config --get user.email
gh api user --jq .login
npm whoami
npm view envguard-cli name version --registry=https://registry.npmjs.org/
```

On 2026-10-21 the registry returned E404 for `envguard-cli`; no package was found. This is not a reservation or a guarantee that npm will accept the name. Recheck immediately before publishing. The intended repository is `milbrandsoftware/envguard-cli`; it has not been created by this workflow. Check its availability using `gh repo view milbrandsoftware/envguard-cli` before creating it.

## Validate v0.1.0

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:package
npm audit
npm pack --dry-run
git diff --check
```

Inspect the tarball file list. It must not contain `.env`, credentials, `node_modules`, or local reports. Review the privacy contract and changelog. Change the README release status and changelog from prepared/unreleased to the actual approved release date before publishing. Re-run validation after edits. The Node.js 22/24 Windows/Linux GitHub Actions matrix must pass after the approved first push.

## Publish to GitHub — only after explicit confirmation

The source repository was prepared for creation through the authenticated browser as `milbrandsoftware/envguard-cli`. If it already exists, do not run `gh repo create` again: clone it with the correct account and work from its history. The commands below are the alternative CLI procedure for a repository that does not yet exist. The local preparation repository and web-created history are initially separate; do not force-push one over the other.

Commit only reviewed files:

```sh
git add .
git commit -m "Prepare envguard-cli v0.1.0"
gh repo create milbrandsoftware/envguard-cli --public --source=. --remote=origin --push --description "Check .env files against .env.example without exposing secret values."
```

Enable private vulnerability reporting in GitHub settings if desired. Wait for CI to pass. Review the public content before proceeding to npm.

## Publish to npm — only after explicit confirmation

Sign into the intended npm owner account with `npm login` if necessary, verify `npm whoami`, and use the account's required two-factor authentication. Do not store tokens in this repository. No npm identity is assumed from a GitHub login.

```sh
npm pack
npm publish ./envguard-cli-0.1.0.tgz --access public --dry-run
# The following command publishes publicly. Run only when approved:
npm publish ./envguard-cli-0.1.0.tgz --access public
git tag -a v0.1.0 -m "envguard-cli v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md ./envguard-cli-0.1.0.tgz
```

Verify `npm view envguard-cli@0.1.0` and test `npx envguard-cli@0.1.0 check` in a synthetic project. Never use a real secret as a publication smoke-test value. Retain the reviewed tarball and its checksum.

References: [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/), [Node.js release status](https://nodejs.org/en/about/previous-releases).
