import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { check, parseEnv, formatReport } from '../dist/check.js';

test('matching keys pass; blank template values are placeholders', () => {
  assert.deepEqual(check('PORT=3000\nTOKEN=private', 'PORT=\nTOKEN=').summary, { errors: 0, warnings: 0 });
  assert.equal(check('', '# empty template').ok, true);
});

for (const [name, text] of [
  ['plain', 'KEY=value'], ['export', 'export KEY=value'],
  ['whitespace', ' \tKEY \t= value \t'], ['comments', '# comment\nKEY=value # comment'],
  ['BOM and CRLF', '\uFEFFKEY=value\r\n'], ['CR', 'KEY=value\rOTHER=x'],
  ['single quoted', "KEY='a # b = c'"], ['double quoted', 'KEY="a # b = c"'],
  ['multiline double', 'KEY="first\n# still inside\nLAST=fake\nlast" # comment'],
  ['multiline single', "KEY='first\nlast'"], ['equals in value', 'KEY=a=b=c'],
  ['underscore', '_KEY_1=value'], ['escaped quotes', 'KEY="a\\"b"'],
  ['literal expansion', 'KEY=${OTHER}'], ['shell text is literal', 'KEY=$(echo do-not-run)'],
  ['prototype-like keys', '__proto__=value\nconstructor=value\ntoString=value'],
]) {
  test(`accepts ${name}`, () => {
    const result = parseEnv(text, 'env');
    assert.equal(result.diagnostics.length, 0);
    assert.equal(result.entries.has(name === 'underscore' ? '_KEY_1' : name === 'prototype-like keys' ? '__proto__' : 'KEY'), true);
  });
}

for (const value of ['', '  ', ' # comment', '""', "''", '"   "', '"\n  \n"']) {
  test(`empty value ${JSON.stringify(value)} is an error only in env`, () => {
    assert.equal(check(`KEY=${value}`, 'KEY=').diagnostics.some(d => d.code === 'EMPTY'), true);
    assert.equal(parseEnv(`KEY=${value}`, 'example').diagnostics.length, 0);
  });
}

for (const text of ['KEY=0', 'KEY=false', 'KEY=null', 'KEY="\\n"']) {
  test(`nonempty literal ${text} remains nonempty`, () => {
    assert.equal(parseEnv(text, 'env').diagnostics.length, 0);
  });
}

for (const [name, text] of [
  ['missing equals', 'SECRET_SENTINEL'], ['invalid key', '1BAD=SECRET_SENTINEL'],
  ['dash in key', 'BAD-KEY=SECRET_SENTINEL'], ['space in key', 'BAD KEY=SECRET_SENTINEL'],
  ['unterminated quote', 'KEY="SECRET_SENTINEL\nmore'],
  ['trailing text', 'KEY="SECRET_SENTINEL" invalid'],
  ['backtick', 'KEY=`SECRET_SENTINEL`'], ['NUL', 'KEY=SECRET_SENTINEL\0'],
  ['multiline NUL', 'KEY="first\nSECRET_SENTINEL\0\nlast"'],
  ['terminal escape in key', '\x1b[31mKEY=SECRET_SENTINEL'],
]) {
  test(`rejects ${name} without reproducing input`, () => {
    const result = check(text, 'KEY=');
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some(d => d.code === 'SYNTAX'));
    assert.ok(!JSON.stringify(result).includes('SECRET_SENTINEL'));
    assert.ok(!formatReport(result).includes('SECRET_SENTINEL'));
    assert.ok(!formatReport(result).includes('\x1b'));
  });
}

test('duplicates in either file retain the first line and report every repeat', () => {
  const report = check('KEY=a\nKEY=b\nKEY=c', 'KEY=\nKEY=');
  assert.deepEqual(report.diagnostics.filter(d => d.code === 'DUPLICATE').map(d => [d.file, d.line]),
    [['env', 2], ['env', 3], ['example', 2]]);
  assert.match(report.diagnostics[0].message, /line 1/);
});

test('missing keys point to the reference line', () => {
  assert.deepEqual(check('', '# schema\nPORT=').diagnostics[0], {
    code: 'MISSING', severity: 'error', file: 'example', line: 2, key: 'PORT',
    message: 'Variable is required by the example but missing from env.',
  });
});

test('unused is a warning; strict promotes the exit status without changing severity', () => {
  const regular = check('PORT=3000\nEXTRA=x', 'PORT=');
  const strict = check('PORT=3000\nEXTRA=x', 'PORT=', true);
  assert.equal(regular.exitCode, 0);
  assert.equal(strict.exitCode, 1);
  assert.deepEqual(regular.diagnostics, strict.diagnostics);
  assert.equal(strict.summary.warnings, 1);
});

test('names are case-sensitive', () => {
  assert.deepEqual(check('port=3000', 'PORT=').diagnostics.map(d => d.code), ['MISSING', 'UNUSED']);
});

test('parsed metadata never retains values, including duplicate and malformed lines', () => {
  const result = parseEnv('KEY=SECRET_SENTINEL\nKEY=SECRET_SENTINEL\nBAD-KEY=SECRET_SENTINEL', 'env');
  assert.ok(!JSON.stringify([...result.entries]).includes('SECRET_SENTINEL'));
  assert.ok(!JSON.stringify(result.diagnostics).includes('SECRET_SENTINEL'));
});

test('pure check leaves process environment untouched and never evaluates shell text', () => {
  // Compare digests so a failing assertion cannot dump real environment values.
  const digest = () => createHash('sha256').update(JSON.stringify({ ...process.env })).digest('hex');
  const before = digest();
  check('ENVGUARD_TEST=$(echo SECRET_SENTINEL)', 'ENVGUARD_TEST=');
  assert.equal(digest(), before);
});

test('invalid quoted entries are not considered present', () => {
  assert.equal(check('KEY="value" trailing', 'KEY=').diagnostics.some(d => d.code === 'MISSING'), true);
});

test('format is readable and deterministic', () => {
  const result = check('PORT=3000', 'PORT=', true);
  assert.equal(formatReport(result), 'EnvGuard: PASS (strict)\n1 env variables, 1 example variables; 0 error(s), 0 warning(s).');
  assert.deepEqual(check('A=x', 'A='), check('A=x', 'A='));
});
