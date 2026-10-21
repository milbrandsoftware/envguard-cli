import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// These are reproducible synthetic integration scenarios, not customer activity.
const sentinel = 'SYNTHETIC_SCENARIO_SECRET_DO_NOT_PRINT';
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const scenarios = [
  { id: 'web-app-ready', goal: 'Start a correctly configured web application',
    env: `PORT=3000\nDATABASE_URL=postgresql://example.invalid/demo\nAPI_TOKEN=${sentinel}`,
    example: 'PORT=\nDATABASE_URL=\nAPI_TOKEN=', args: ['--strict'], exit: 0, codes: [] },
  { id: 'deployment-missing-key', goal: 'Block deployment after a new required setting is added',
    env: 'PORT=3000', example: 'PORT=\nDATABASE_URL=', exit: 1, codes: ['MISSING'] },
  { id: 'stale-feature-flag', goal: 'Warn about a setting removed from the reference',
    env: 'PORT=3000\nOLD_FEATURE=true', example: 'PORT=', exit: 0, codes: ['UNUSED'] },
  { id: 'strict-ci-gate', goal: 'Fail a strict CI gate for a stale setting',
    env: 'PORT=3000\nOLD_FEATURE=true', example: 'PORT=', args: ['--strict'], exit: 1, codes: ['UNUSED'] },
  { id: 'empty-ci-secret', goal: 'Catch a secret that CI failed to inject',
    env: 'API_TOKEN=', example: 'API_TOKEN=', exit: 1, codes: ['EMPTY'] },
  { id: 'duplicate-after-merge', goal: 'Catch contradictory settings introduced by a merge',
    env: 'PORT=3000\nPORT=4000', example: 'PORT=', exit: 1, codes: ['DUPLICATE'] },
  { id: 'damaged-reference', goal: 'Catch duplicate declarations in the committed template',
    env: `API_TOKEN=${sentinel}`, example: 'API_TOKEN=\nAPI_TOKEN=', exit: 1, codes: ['DUPLICATE'] },
  { id: 'truncated-quoted-secret', goal: 'Catch a truncated quoted value without printing its contents',
    env: `API_TOKEN="${sentinel}`, example: 'API_TOKEN=', exit: 1, codes: ['SYNTAX', 'MISSING'] },
  { id: 'multiline-value', goal: 'Accept multiline credentials, comments, and Windows line endings',
    env: `\uFEFFPORT=3000\r\nPRIVATE_KEY="synthetic first line\r\n${sentinel}\r\nsynthetic last line" # comment\r\n`,
    example: 'PORT=\nPRIVATE_KEY=', args: ['--strict'], exit: 0, codes: [] },
  { id: 'custom-production-paths', goal: 'Check separate configuration paths containing spaces',
    env: `API_TOKEN=${sentinel}`, example: 'API_TOKEN=', customPaths: true, exit: 0, codes: [] },
  { id: 'missing-env-file', goal: 'Distinguish absent configuration from a validation failure',
    example: 'PORT=', exit: 2, operational: 'FILE_READ' },
];
const root = mkdtempSync(join(tmpdir(), 'envguard-scenarios-'));
const results = [];
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
try {
  for (const scenario of scenarios) {
    const cwd = join(root, scenario.id);
    mkdirSync(cwd);
    const envPath = join(cwd, scenario.customPaths ? 'production env' : '.env');
    const examplePath = join(cwd, scenario.customPaths ? 'production example' : '.env.example');
    if (scenario.env !== undefined) writeFileSync(envPath, scenario.env);
    writeFileSync(examplePath, scenario.example);
    const before = [scenario.env === undefined ? null : hash(envPath), hash(examplePath)];
    const args = ['check', '--json', ...(scenario.args ?? []),
      ...(scenario.customPaths ? ['--env', envPath, '--example', examplePath] : [])];
    const run = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 10_000 });
    assert.ifError(run.error);
    assert.equal(run.status, scenario.exit, `${scenario.id}: unexpected exit code`);
    assert.equal(run.stderr, '', `${scenario.id}: JSON command must leave stderr empty`);
    assert.ok(!run.stdout.includes(sentinel), `${scenario.id}: synthetic value must be redacted`);
    assert.ok(!run.stdout.includes(root), `${scenario.id}: paths must not be disclosed`);
    const report = JSON.parse(run.stdout);
    assert.equal(report.exitCode, scenario.exit);
    if (scenario.operational) assert.equal(report.error.code, scenario.operational);
    else assert.deepEqual(report.diagnostics.map(item => item.code), scenario.codes);
    assert.deepEqual([scenario.env === undefined ? null : hash(envPath), hash(examplePath)], before,
      `${scenario.id}: input files must remain unchanged`);
    results.push({ id: scenario.id, goal: scenario.goal, status: 'PASS', exitCode: run.status,
      codes: report.diagnostics?.map(item => item.code) ?? [report.error.code] });
  }
  const report = { schemaVersion: 1, kind: 'synthetic-integration-tests',
    node: process.version, platform: process.platform, passed: results.length, failed: 0, results };
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const result of results) console.log(`PASS ${result.id}: expected exit ${result.exitCode}; ${result.codes.join(', ') || 'clean'}`);
    console.log(`${results.length}/${scenarios.length} synthetic integration scenarios passed. No customer usage is represented.`);
  }
} finally {
  // root is exactly mkdtemp's result, never an argument or computed parent path.
  rmSync(root, { recursive: true, force: true });
}
