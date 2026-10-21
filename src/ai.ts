import type { Code, Report } from './check.js';

const codes: readonly Code[] = ['SYNTAX', 'DUPLICATE', 'EMPTY', 'MISSING', 'UNUSED'];
export interface Disclosure { schemaVersion: 1; codes: Code[] }
export interface Advice { code: Code; explanation: string }
export interface AiResult {
  status: 'completed' | 'skipped';
  disclosure: Disclosure;
  advice: Advice[];
  usage?: { inputTokens: number; outputTokens: number };
}
export class AiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

// This is the only project-derived input sent to OpenAI. No string from a file
// or diagnostic (including a variable name or message) crosses this boundary.
export function disclose(report: Pick<Report, 'diagnostics'>): Disclosure {
  return { schemaVersion: 1, codes: codes.filter(code => report.diagnostics.some(item => item.code === code)) };
}

export async function explain(disclosure: Disclosure, options: {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}): Promise<AiResult> {
  // Reconstruct from the closed allowlist even if a caller supplies extra data.
  const safe: Disclosure = { schemaVersion: 1, codes: codes.filter(code => disclosure.codes.includes(code)) };
  if (safe.codes.length === 0) return { status: 'skipped', disclosure: safe, advice: [] };
  if (!options.apiKey.trim()) throw new AiError('AI_CONFIG', 'Set OPENAI_API_KEY in the process environment to use AI explanations.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(options.model)) {
    throw new AiError('AI_CONFIG', 'Choose a valid OpenAI model identifier with --model.');
  }
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: options.model,
        store: false,
        max_output_tokens: 800,
        input: [
          { role: 'system', content: 'Explain these dotenv diagnostic categories in plain English. Return one short explanation and practical correction per code. MISSING means required by the example but absent from env. UNUSED means absent from the example, not unused by source code. Empty example placeholders are allowed. Never invent variable names, values, credentials, commands, security guarantees, or project details. Advice is informational; it must not change validation results.' },
          { role: 'user', content: JSON.stringify(safe) },
        ],
        text: { format: { type: 'json_schema', name: 'envguard_advice', strict: true,
          schema: { type: 'object', additionalProperties: false, required: ['advice'], properties: {
            advice: { type: 'array', items: { type: 'object', additionalProperties: false,
              required: ['code', 'explanation'], properties: {
                code: { type: 'string', enum: safe.codes }, explanation: { type: 'string' },
              } } },
          } } } },
      }),
    });
  } catch {
    throw new AiError('AI_NETWORK', 'OpenAI request failed or timed out. No automatic retry was made.');
  }
  if (!response.ok) {
    // Do not read/echo provider error bodies, which may contain submitted data.
    if (response.status === 401 || response.status === 403) throw new AiError('AI_AUTH', 'OpenAI authentication or model access was refused.');
    if (response.status === 429) throw new AiError('AI_LIMIT', 'OpenAI quota or rate limit reached. No automatic retry was made.');
    throw new AiError('AI_PROVIDER', 'OpenAI returned an error. No automatic retry was made.');
  }
  try {
    const body = await response.json();
    if (body.status !== 'completed' || !Array.isArray(body.output)) throw new Error();
    const text = body.output.filter((item: { type?: string }) => item.type === 'message')
      .flatMap((item: { content?: unknown[] }) => item.content ?? [])
      .filter((item: { type?: string }) => item.type === 'output_text')
      .map((item: { text?: string }) => item.text ?? '').join('');
    const parsed = JSON.parse(text);
    if (Object.keys(parsed).length !== 1 || !Array.isArray(parsed.advice) || parsed.advice.length !== safe.codes.length) throw new Error();
    const seen = new Set<Code>();
    const advice: Advice[] = parsed.advice.map((item: Advice) => {
      if (!item || Object.keys(item).length !== 2 || !safe.codes.includes(item.code) || seen.has(item.code)
        || typeof item.explanation !== 'string' || !item.explanation.trim() || item.explanation.length > 1500) throw new Error();
      seen.add(item.code);
      // Model text is untrusted. Strip terminal controls; never execute it.
      return { code: item.code, explanation: item.explanation.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim() };
    });
    const result: AiResult = { status: 'completed', disclosure: safe, advice };
    if (Number.isSafeInteger(body.usage?.input_tokens) && body.usage.input_tokens >= 0
      && Number.isSafeInteger(body.usage?.output_tokens) && body.usage.output_tokens >= 0) {
      result.usage = { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens };
    }
    return result;
  } catch {
    throw new AiError('AI_RESPONSE', 'OpenAI did not return complete, valid advice. No automatic retry was made.');
  }
}
