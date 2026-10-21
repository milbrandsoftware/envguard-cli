import { writeFileSync } from 'node:fs';

// Loaded only by child-process tests. It intercepts fetch; no socket is opened.
globalThis.fetch = async (url, init) => {
  if (process.env.ENVGUARD_TEST_CAPTURE) writeFileSync(process.env.ENVGUARD_TEST_CAPTURE, init.body);
  if (url !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected endpoint');
  if (process.env.ENVGUARD_TEST_PROVIDER_ERROR) return new Response('SYNTHETIC_SECRET_PROVIDER_ERROR', { status: 401 });
  const disclosure = JSON.parse(JSON.parse(init.body).input[1].content);
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{
    type: 'output_text', text: JSON.stringify({ advice: disclosure.codes.map(code => ({ code, explanation: 'Review this category locally.' })) }),
  }] }], usage: { input_tokens: 50, output_tokens: 25 } }));
};
