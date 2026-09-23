import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StructuredOutputError } from '@krdn/llm-gateway/gateway';
import { StructuredOutputError as RootError } from '@krdn/llm-gateway';
import { isRateLimitError, isServerOverloadError } from '@krdn/llm-gateway/runner';
import { PROVIDER_REGISTRY } from '@krdn/llm-gateway/metadata';

test('built subpaths share the structured-error contract', () => {
  const error = new StructuredOutputError('step2 429 overloaded 503', { inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  assert.equal(RootError.isInstance(error), true);
  assert.equal(isRateLimitError(error), false);
  assert.equal(isServerOverloadError(error), false);
});

test('metadata is available through the public package export', () => {
  assert.equal(PROVIDER_REGISTRY.deepseek.supportsStructuredOutput, false);
  assert.equal(PROVIDER_REGISTRY['gemini-cli'].accessMethod, 'local');
});
