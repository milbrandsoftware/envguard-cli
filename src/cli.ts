#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { check, formatReport, type FileRole } from './check.js';

const help = `EnvGuard CLI 0.1.0
Check environment files without displaying their values.

Usage: envguard-cli check [--env <path>] [--example <path>] [--json] [--strict]

  --env <path>      Environment file (default: .env)
  --example <path>  Reference file (default: .env.example)
  --json           Machine-readable output on stdout
  --strict         Treat warnings as failures
  --help, -h       Show help
  --version, -v    Show version

Exit codes: 0 pass, 1 validation failed, 2 usage or file error.
UNUSED means absent from the example, not unused by application code.
Empty values in the example are allowed. Values are never printed.`;

class InputError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function readInput(path: string, role: FileRole): Promise<string> {
  let content: Buffer;
  try {
    content = await readFile(path);
  } catch {
    throw new InputError('FILE_READ', `Cannot read ${role} file. Check its path and permissions.`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new InputError('FILE_ENCODING', `The ${role} file must contain valid UTF-8 text.`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let json = args.includes('--json');
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
        env: { type: 'string' }, example: { type: 'string' },
        json: { type: 'boolean' }, strict: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      } });
    } catch {
      throw new InputError('USAGE', 'Invalid arguments. Run envguard-cli --help for usage.');
    }
    const { values, positionals } = parsed;
    json = values.json ?? false;
    if (values.help) { console.log(help); return; }
    if (values.version) { console.log('0.1.0'); return; }
    if (positionals.length !== 1 || positionals[0] !== 'check' || values.env === '' || values.example === '') {
      throw new InputError('USAGE', 'Expected the check command. Run envguard-cli --help for usage.');
    }
    const envText = await readInput(values.env ?? '.env', 'env');
    const exampleText = await readInput(values.example ?? '.env.example', 'example');
    const report = check(envText, exampleText, values.strict ?? false);
    console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exitCode = report.exitCode;
  } catch (error) {
    const safe = error instanceof InputError ? error : new InputError('INTERNAL', 'An unexpected error occurred.');
    if (json) {
      console.log(JSON.stringify({ schemaVersion: 1, ok: false, exitCode: 2,
        error: { code: safe.code, message: safe.message } }, null, 2));
    } else {
      console.error(`EnvGuard: ${safe.message}`);
    }
    process.exitCode = 2;
  }
}

await main();
