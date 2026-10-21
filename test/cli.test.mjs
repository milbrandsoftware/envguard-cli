import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
function fixture(t, env = 'PORT=3000', example = 'PORT=') {
  const directory = mkdtempSync(join(tmpdir(), 'envguard-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, '.env'), env);
  writeFileSync(join(directory, '.env.example'), example);
  return directory;
}
function run(cwd, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 10_000 });
  assert.ifError(result.error);
  return result;
}

test('default paths, human report and no file mutation', t => {
  const cwd = fixture(t);
  const result = run(cwd, ['check']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS/);
  assert.equal(result.stderr, '');
  assert.equal(readFileSync(join(cwd, '.env'), 'utf8'), 'PORT=3000');
});

test('JSON contains the complete report, with no stderr', t => {
  const result = run(fixture(t, 'TOKEN=SECRET_SENTINEL', 'TOKEN=\nMISSING='), ['check', '--json']);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.equal(report.exitCode, 1);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.diagnostics[0].key, 'MISSING');
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes('SECRET_SENTINEL'));
});

test('strict exit codes', t => {
  const cwd = fixture(t, 'PORT=3000\nEXTRA=x');
  assert.equal(run(cwd, ['check']).status, 0);
  assert.equal(run(cwd, ['check', '--strict']).status, 1);
  assert.equal(JSON.parse(run(cwd, ['check', '--strict', '--json']).stdout).ok, false);
});

test('custom file paths with spaces and equals syntax', t => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'app env'), 'KEY=value');
  writeFileSync(join(cwd, 'app example'), 'KEY=');
  assert.equal(run(cwd, ['check', '--env', 'app env', '--example=app example']).status, 0);
});

for (const args of [[], ['bad-command'], ['check', 'extra'], ['check', '--unknown=SECRET_SENTINEL'],
  ['check', '--env'], ['check', '--strict=false'], ['check', '--env=']]) {
  test(`usage failure: ${JSON.stringify(args)}`, t => {
    const result = run(fixture(t), [...args, '--json']);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'USAGE');
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes('SECRET_SENTINEL'));
  });
}

test('text usage failures go to stderr without echoing arbitrary arguments', t => {
  const result = run(fixture(t), ['SECRET_SENTINEL']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.ok(!result.stderr.includes('SECRET_SENTINEL'));
});

for (const role of ['.env', '.env.example']) {
  test(`missing ${role} is an operational error without leaking paths`, t => {
    const cwd = fixture(t);
    rmSync(join(cwd, role));
    const result = run(cwd, ['check', '--json']);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'FILE_READ');
    assert.ok(!result.stdout.includes(cwd));
  });
}

test('directory as input fails safely', t => {
  const cwd = fixture(t);
  mkdirSync(join(cwd, 'folder'));
  assert.equal(run(cwd, ['check', '--env', 'folder']).status, 2);
});

test('invalid UTF-8 is rejected instead of silently replacing bytes', t => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, '.env'), Buffer.from([0xff, 0xfe, 0x00]));
  const result = run(cwd, ['check', '--json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'FILE_ENCODING');
});

test('help and version work without input files', t => {
  const cwd = fixture(t);
  assert.match(run(cwd, ['--help']).stdout, /Usage:/);
  assert.match(run(cwd, ['check', '-h']).stdout, /--strict/);
  assert.equal(run(cwd, ['--version']).stdout.trim(), '0.1.0');
  assert.equal(run(cwd, ['-v']).status, 0);
});

test('all diagnostics redact values in both modes, including syntax failures', t => {
  const cwd = fixture(t, 'TOKEN=SECRET_SENTINEL\nTOKEN=SECRET_SENTINEL\nBAD-KEY=SECRET_SENTINEL\nEMPTY=', 'TOKEN=\nEMPTY=');
  for (const args of [['check'], ['check', '--json']]) {
    const result = run(cwd, args);
    assert.equal(result.status, 1);
    assert.ok(!(result.stdout + result.stderr).includes('SECRET_SENTINEL'));
  }
});

test('AI preview works without credentials and exposes only categories', t => {
  const cwd = fixture(t, 'CONFIDENTIAL_TOKEN=SECRET_SENTINEL\nEMPTY=', 'CONFIDENTIAL_TOKEN=\nEMPTY=\nMISSING=');
  const result = run(cwd, ['explain', '--preview', '--json']);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 1);
  assert.deepEqual(report.ai.disclosure, { schemaVersion: 1, codes: ['EMPTY', 'MISSING'] });
  assert.equal(report.ai.status, 'preview');
  assert.ok(!JSON.stringify(report.ai).includes('CONFIDENTIAL'));
  assert.ok(!result.stdout.includes('SECRET_SENTINEL'));
});

for (const args of [['check', '--ai'], ['check', '--preview'], ['check', '--model', 'test-model'],
  ['explain'], ['explain', '--ai'], ['explain', '--ai', '--preview']]) {
  test(`rejects ambiguous AI usage: ${args.join(' ')}`, t => {
    assert.equal(run(fixture(t), [...args, '--json']).status, 2);
  });
}

test('AI CLI end-to-end uses a mocked provider and preserves validation failure', t => {
  const cwd = fixture(t, 'CONFIDENTIAL_TOKEN=SECRET_SENTINEL\nEMPTY=', 'CONFIDENTIAL_TOKEN=\nEMPTY=');
  const capture = join(cwd, 'request.json');
  const preload = new URL('./fixtures/mock-openai.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--import', preload, cli, 'explain', '--ai', '--model', 'synthetic-model', '--json'], {
    cwd, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, OPENAI_API_KEY: 'SYNTHETIC_API_KEY', ENVGUARD_TEST_CAPTURE: capture },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ai.status, 'completed');
  const payload = readFileSync(capture, 'utf8');
  for (const privateText of ['CONFIDENTIAL_TOKEN', 'SECRET_SENTINEL', cwd, 'SYNTHETIC_API_KEY']) {
    assert.ok(!payload.includes(privateText));
  }
});

test('AI CLI provider failure is sanitized', t => {
  const cwd = fixture(t, 'KEY=', 'KEY=');
  const preload = new URL('./fixtures/mock-openai.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--import', preload, cli, 'explain', '--ai', '--model', 'synthetic-model', '--json'], {
    cwd, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, OPENAI_API_KEY: 'SYNTHETIC_API_KEY', ENVGUARD_TEST_PROVIDER_ERROR: '1' },
  });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'AI_AUTH');
  assert.ok(!result.stdout.includes('SYNTHETIC'));
});
