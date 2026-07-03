// analyzeStructured → text2step 폴백 배선 검증.
// 추출/복구/힌트 등 전략 내부 동작은 strategies.test.ts와 json-repair.test.ts가 담당한다.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type * as AiModule from 'ai';

const mockModel = { id: 'test-model' };

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => () => mockModel),
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => () => mockModel),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => Object.assign(() => mockModel, { chat: () => mockModel })),
}));

vi.mock('ai', async (importOriginal) => {
  const orig = await importOriginal<typeof AiModule>();
  return {
    ...orig,
    generateText: vi.fn(),
  };
});

import { analyzeStructured } from './gateway';
import { generateText } from 'ai';

const TestSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeStructured (text2step 폴백 배선)', () => {
  // ollama는 supportsStructuredOutput=false → text2step으로 진입

  it('Step 1 성공 시 Step 2를 호출하지 않음 (이중 과금 방지)', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "결과입니다", "score": 95}',
      usage: { promptTokens: 100, completionTokens: 50 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama', model: 'llama3' });

    expect(result.object).toEqual({ summary: '결과입니다', score: 95 });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('Step 1 실패 → Step 2 성공 시 usage 토큰 합산 (NormalizedUsage 단일 형태)', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'This is not JSON, just plain analysis text about the economy.',
      usage: { promptTokens: 100, completionTokens: 200 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "변환 성공", "score": 80}',
      usage: { promptTokens: 150, completionTokens: 60 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama', model: 'llama3' });

    expect(result.object).toEqual({ summary: '변환 성공', score: 80 });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 260, totalTokens: 510 });
  });

  it('Step 1, Step 2 모두 실패 시 실패 원인을 담은 에러 전파', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'completely invalid response with no JSON',
      usage: { promptTokens: 50, completionTokens: 30 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'still not JSON output at all',
      usage: { promptTokens: 60, completionTokens: 40 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    await expect(
      analyzeStructured('분석해줘', TestSchema, { provider: 'ollama', model: 'llama3' }),
    ).rejects.toThrow('구조화 출력 실패');

    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
