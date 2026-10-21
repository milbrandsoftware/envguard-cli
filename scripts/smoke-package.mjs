import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'envguard-package-'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this script with npm run test:package.');
function npm(args, cwd) {
  return execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
try {
  const [pack] = JSON.parse(npm(['pack', '--json', '--pack-destination', temp], root));
  assert.equal(pack.name, 'envguard-cli');
  assert.equal(pack.version, '0.1.0');
  assert.ok(pack.files.some(file => file.path === 'dist/cli.js'));
  assert.ok(!pack.files.some(file => /(^|\/)(\.env(?:\.|$)|node_modules|test|artifacts|src)(\/|$)/.test(file.path)));
  writeFileSync(join(temp, 'package.json'), '{"private":true}');
  npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, pack.filename)], temp);
  writeFileSync(join(temp, '.env'), 'PORT=3000\nTOKEN=PACKAGE_SECRET_SENTINEL');
  writeFileSync(join(temp, '.env.example'), 'PORT=\nTOKEN=');
  // npm exec resolves the installed bin shim; it must not fetch anything online.
  const result = npm(['exec', '--offline', '--', 'envguard-cli', 'check', '--strict', '--json'], temp);
  assert.equal(JSON.parse(result).ok, true);
  assert.ok(!result.includes('PACKAGE_SECRET_SENTINEL'));
  console.log(`PASS: ${pack.filename} installs offline, exposes its CLI, and validates a real fixture.`);
  console.log(`PASS: publish allowlist excludes local environment files and development artifacts (${pack.files.length} files).`);
} finally {
  // The target is the exact directory returned by mkdtemp, never a supplied path.
  rmSync(temp, { recursive: true, force: true });
}
