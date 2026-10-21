export type FileRole = 'env' | 'example';
export type Code = 'SYNTAX' | 'DUPLICATE' | 'EMPTY' | 'MISSING' | 'UNUSED';
export interface Diagnostic {
  code: Code;
  severity: 'error' | 'warning';
  file: FileRole;
  line: number;
  key?: string;
  message: string;
}
interface Entry { key: string; line: number; empty: boolean }
interface Parsed { entries: Map<string, Entry>; diagnostics: Diagnostic[] }
export interface Report {
  schemaVersion: 1;
  ok: boolean;
  strict: boolean;
  exitCode: 0 | 1;
  counts: { envVariables: number; exampleVariables: number };
  summary: { errors: number; warnings: number };
  diagnostics: Diagnostic[];
}

// Values are inspected only for emptiness; they never enter parsed output.
export function parseEnv(text: string, file: FileRole): Parsed {
  const entries = new Map<string, Entry>();
  const diagnostics: Diagnostic[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const syntax = (line: number, message: string): void => {
    diagnostics.push({ code: 'SYNTAX', severity: 'error', file, line, message });
  };
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const source = lines[index]!.trim();
    if (!source || source.startsWith('#')) continue;
    const match = /^(?:export[\t ]+)?([A-Za-z_][A-Za-z0-9_]*)[\t ]*=[\t ]*(.*)$/.exec(source);
    if (!match || source.includes('\0')) {
      syntax(line, 'Expected NAME=value with a valid variable name.');
      continue;
    }
    const key = match[1]!;
    let value = match[2]!;
    const quote = value[0];
    let empty: boolean;
    if (quote === '"' || quote === "'") {
      let cursor = 1;
      let closed = false;
      let hasContent = false;
      let invalid = false;
      for (;;) {
        while (cursor < value.length) {
          const char = value[cursor]!;
          if (char === quote) {
            const tail = value.slice(cursor + 1).trim();
            if (tail && !tail.startsWith('#')) {
              syntax(line, 'Unexpected text after a quoted value.');
              invalid = true;
            }
            closed = true;
            break;
          }
          if (char === '\\' && cursor + 1 < value.length) {
            hasContent = true;
            cursor += 2;
          } else {
            if (char.trim()) hasContent = true;
            cursor++;
          }
        }
        if (closed || index + 1 >= lines.length) break;
        index++;
        value = lines[index]!;
        if (value.includes('\0')) {
          syntax(index + 1, 'NUL characters are not allowed.');
          invalid = true;
        }
        cursor = 0;
      }
      if (!closed) {
        syntax(line, 'Unterminated quoted value.');
        continue;
      }
      if (invalid) continue;
      empty = !hasContent;
    } else {
      if (value.startsWith('`')) {
        syntax(line, 'Backtick quoting is not supported; use single or double quotes.');
        continue;
      }
      empty = value.split('#', 1)[0]!.trim().length === 0;
    }
    const previous = entries.get(key);
    if (previous) {
      diagnostics.push({ code: 'DUPLICATE', severity: 'error', file, line, key,
        message: `Variable is already defined on line ${previous.line}.` });
    } else {
      entries.set(key, { key, line, empty });
    }
    if (empty && file === 'env') {
      diagnostics.push({ code: 'EMPTY', severity: 'error', file, line, key,
        message: 'Variable has an empty or whitespace-only value.' });
    }
  }
  return { entries, diagnostics };
}

export function check(envText: string, exampleText: string, strict = false): Report {
  const env = parseEnv(envText, 'env');
  const example = parseEnv(exampleText, 'example');
  const diagnostics = [...env.diagnostics, ...example.diagnostics];
  for (const entry of example.entries.values()) {
    if (!env.entries.has(entry.key)) {
      diagnostics.push({ code: 'MISSING', severity: 'error', file: 'example', line: entry.line,
        key: entry.key, message: 'Variable is required by the example but missing from env.' });
    }
  }
  for (const entry of env.entries.values()) {
    if (!example.entries.has(entry.key)) {
      diagnostics.push({ code: 'UNUSED', severity: 'warning', file: 'env', line: entry.line,
        key: entry.key, message: 'Variable is not declared in the example.' });
    }
  }
  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  const ok = errors === 0 && (!strict || warnings === 0);
  return { schemaVersion: 1, ok, strict, exitCode: ok ? 0 : 1,
    counts: { envVariables: env.entries.size, exampleVariables: example.entries.size },
    summary: { errors, warnings }, diagnostics };
}

export function formatReport(report: Report): string {
  const lines = [`EnvGuard: ${report.ok ? 'PASS' : 'FAIL'}${report.strict ? ' (strict)' : ''}`];
  for (const item of report.diagnostics) {
    lines.push(`  ${item.severity.toUpperCase()} ${item.code} ${item.file}:${item.line}${item.key ? ` ${item.key}` : ''} - ${item.message}`);
  }
  lines.push(`${report.counts.envVariables} env variables, ${report.counts.exampleVariables} example variables; ${report.summary.errors} error(s), ${report.summary.warnings} warning(s).`);
  return lines.join('\n');
}
