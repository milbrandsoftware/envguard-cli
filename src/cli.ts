#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { check, formatReport, type FileRole } from './check.js';
import { AiError, disclose, explain } from './ai.js';

const help = `EnvGuard CLI 0.1.0
Check environment files without displaying their values.

Usage: envguard-cli check [--env <path>] [--example <path>] [--json] [--strict]
       envguard-cli explain --preview [--env <path>] [--example <path>] [--json]
       envguard-cli explain --ai --model <id> [--env <path>] [--example <path>] [--json]

  --env <path>      Environment file (default: .env)
  --example <path>  Reference file (default: .env.example)
  --json           Machine-readable output on stdout
  --strict         Treat warnings as failures
  --preview        Show exactly which diagnostic categories would be sent; no API call
  --ai             Explicitly enable one OpenAI request (explain command only)
  --model <id>     OpenAI model supporting Structured Outputs; required with --ai
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
        ai: { type: 'boolean' }, preview: { type: 'boolean' }, model: { type: 'string' },
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      } });
    } catch {
      throw new InputError('USAGE', 'Invalid arguments. Run envguard-cli --help for usage.');
    }
    const { values, positionals } = parsed;
    json = values.json ?? false;
    if (values.help) { console.log(help); return; }
    if (values.version) { console.log('0.1.0'); return; }
    const command = positionals[0];
    if (positionals.length !== 1 || !['check', 'explain'].includes(command ?? '') || values.env === '' || values.example === '') {
      throw new InputError('USAGE', 'Expected check or explain. Run envguard-cli --help for usage.');
    }
    if (command === 'check' && (values.ai || values.preview || values.model !== undefined)) {
      throw new InputError('USAGE', 'AI options require the explain command. The check command stays offline.');
    }
    if (command === 'explain' && ((!values.ai && !values.preview) || (values.ai && values.preview))) {
      throw new InputError('USAGE', 'Choose explain --preview or explain --ai --model <id>.');
    }
    if (command === 'explain' && values.ai && !values.model) {
      throw new InputError('USAGE', 'Choose an OpenAI model explicitly with --model.');
    }
    const envText = await readInput(values.env ?? '.env', 'env');
    const exampleText = await readInput(values.example ?? '.env.example', 'example');
    const report = check(envText, exampleText, values.strict ?? false);
    if (command === 'explain') {
      const disclosure = disclose(report);
      const ai = values.preview
        ? { status: 'preview', disclosure, advice: [] }
        : await explain(disclosure, { apiKey: process.env.OPENAI_API_KEY ?? '', model: values.model! });
      if (json) console.log(JSON.stringify({ ...report, ai }, null, 2));
      else {
        console.log(formatReport(report));
        console.log(`AI ${ai.status}: only these diagnostic categories are disclosed: ${disclosure.codes.join(', ') || 'none'}.`);
        for (const item of ai.advice) console.log(`  ${item.code}: ${item.explanation}`);
        if (ai.status === 'completed') console.log('AI advice is informational. Validation results are unchanged.');
      }
    } else console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exitCode = report.exitCode;
  } catch (error) {
    const safe = error instanceof InputError || error instanceof AiError ? error : new InputError('INTERNAL', 'An unexpected error occurred.');
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
