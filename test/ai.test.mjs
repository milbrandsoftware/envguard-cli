import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../dist/check.js';
import { disclose, explain } from '../dist/ai.js';

const options = { apiKey: 'SYNTHETIC_API_KEY', model: 'synthetic-model' };
function success(codes, overrides = {}) {
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{
    type: 'output_text', text: JSON.stringify({ advice: codes.map(code => ({ code, explanation: 'Review the local configuration and reference.' })) }),
  }] }], usage: { input_tokens: 40, output_tokens: 30 }, ...overrides }));
}

test('disclosure includes only deduplicated enum codes, never names, values, lines or messages', () => {
  const report = check('CONFIDENTIAL_COMPANY_TOKEN=SECRET_SENTINEL\nEMPTY=', 'CONFIDENTIAL_COMPANY_TOKEN=\nEMPTY=\nPRIVATE_PROJECT_URL=');
  const result = disclose(report);
  assert.deepEqual(result, { schemaVersion: 1, codes: ['EMPTY', 'MISSING'] });
  assert.ok(!JSON.stringify(result).includes('CONFIDENTIAL'));
  assert.ok(!JSON.stringify(result).includes('SECRET_SENTINEL'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_PROJECT'));
});

test('no issues means no network request, key requirement or cost', async () => {
  const result = await explain({ schemaVersion: 1, codes: [] }, { apiKey: '', model: '', fetch: () => assert.fail('No request expected') });
  assert.equal(result.status, 'skipped');
});

test('one bounded request uses the fixed official endpoint and reconstructs its input', async () => {
  let calls = 0;
  const result = await explain({ schemaVersion: 1, codes: ['MISSING', 'MISSING'], secret: 'SECRET_SENTINEL' }, {
    ...options, fetch: async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer SYNTHETIC_API_KEY');
      assert.ok(init.signal instanceof AbortSignal);
      const payload = JSON.parse(init.body);
      assert.equal(payload.store, false);
      assert.equal(payload.max_output_tokens, 800);
      assert.equal(payload.text.format.strict, true);
      assert.deepEqual(JSON.parse(payload.input[1].content), { schemaVersion: 1, codes: ['MISSING'] });
      assert.ok(!init.body.includes('SECRET_SENTINEL'));
      assert.ok(!init.body.includes('SYNTHETIC_API_KEY'));
      return success(['MISSING']);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.usage, { inputTokens: 40, outputTokens: 30 });
});

for (const [key, model] of [['', 'synthetic-model'], ['key', ''], ['key', 'invalid model']]) {
  test(`configuration rejected before request (${key ? 'key' : 'no key'}, ${model ? 'model' : 'no model'})`, async () => {
    await assert.rejects(explain({ schemaVersion: 1, codes: ['EMPTY'] }, {
      apiKey: key, model, fetch: () => assert.fail('No request expected'),
    }), error => error.code === 'AI_CONFIG');
  });
}

for (const [status, code] of [[401, 'AI_AUTH'], [403, 'AI_AUTH'], [429, 'AI_LIMIT'], [500, 'AI_PROVIDER']]) {
  test(`provider ${status} is sanitized and never retried`, async () => {
    let calls = 0;
    await assert.rejects(explain({ schemaVersion: 1, codes: ['EMPTY'] }, { ...options, fetch: async () => {
      calls++;
      return new Response('SYNTHETIC_API_KEY SECRET_SENTINEL', { status });
    } }), error => error.code === code && !error.message.includes('SECRET') && !error.message.includes('SYNTHETIC'));
    assert.equal(calls, 1);
  });
}

test('network failures do not echo exception details or retry', async () => {
  let calls = 0;
  await assert.rejects(explain({ schemaVersion: 1, codes: ['EMPTY'] }, { ...options, fetch: async () => {
    calls++;
    throw new Error('SYNTHETIC_API_KEY SECRET_SENTINEL');
  } }), error => error.code === 'AI_NETWORK' && !error.message.includes('SECRET'));
  assert.equal(calls, 1);
});

for (const body of [null, {}, { status: 'incomplete', output: [] }, { status: 'completed', output: [] },
  { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'SECRET_SENTINEL' }] }] },
  { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'SECRET_SENTINEL' }] }] }]) {
  test('invalid, incomplete or refused response fails safely', async () => {
    await assert.rejects(explain({ schemaVersion: 1, codes: ['EMPTY'] }, {
      ...options, fetch: async () => new Response(JSON.stringify(body)),
    }), error => error.code === 'AI_RESPONSE' && !error.message.includes('SECRET'));
  });
}

for (const advice of [[], [{ code: 'MISSING', explanation: 'Wrong category' }],
  [{ code: 'EMPTY', explanation: '' }], [{ code: 'EMPTY', explanation: 'x', extra: true }],
  [{ code: 'EMPTY', explanation: 'x'.repeat(1501) }]]) {
  test('advice must match the expected categories and strict shape', async () => {
    await assert.rejects(explain({ schemaVersion: 1, codes: ['EMPTY'] }, {
      ...options, fetch: async () => success(['EMPTY'], { output: [{ type: 'message', content: [{
        type: 'output_text', text: JSON.stringify({ advice }),
      }] }] }),
    }), error => error.code === 'AI_RESPONSE');
  });
}

test('terminal control characters in model output are removed', async () => {
  const result = await explain({ schemaVersion: 1, codes: ['EMPTY'] }, { ...options,
    fetch: async () => success(['EMPTY'], { output: [{ type: 'message', content: [{ type: 'output_text',
      text: JSON.stringify({ advice: [{ code: 'EMPTY', explanation: '\x1b[31mAdvice\nnext\x07' }] }),
    }] }] }),
  });
  assert.ok(!/[\x00-\x1f]/.test(result.advice[0].explanation));
});
