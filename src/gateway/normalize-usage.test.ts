import { describe, expect, it } from 'vitest';
import { normalizeUsage } from './gateway';

describe('normalizeUsage', () => {
  it('null/undefined → 0으로 정규화', () => {
    expect(normalizeUsage(null)).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(normalizeUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it('OpenAI 형식(promptTokens/completionTokens) 정규화', () => {
    expect(
      normalizeUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }),
    ).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
  });

  it('Anthropic/Gemini 형식(inputTokens/outputTokens) 정규화', () => {
    expect(
      normalizeUsage({ inputTokens: 200, outputTokens: 80, totalTokens: 280 }),
    ).toEqual({ inputTokens: 200, outputTokens: 80, totalTokens: 280 });
  });

  it('totalTokens 누락 시 합계로 계산', () => {
    expect(normalizeUsage({ inputTokens: 30, outputTokens: 20 })).toEqual({
      inputTokens: 30,
      outputTokens: 20,
      totalTokens: 50,
    });
  });

  it('빈 객체 → 모두 0', () => {
    expect(normalizeUsage({})).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it('숫자가 아닌 필드는 무시', () => {
    expect(
      normalizeUsage({ promptTokens: 'abc' as unknown as number, outputTokens: 10 }),
    ).toEqual({ inputTokens: 0, outputTokens: 10, totalTokens: 10 });
  });
});
