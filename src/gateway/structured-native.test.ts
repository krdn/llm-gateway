import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

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
  const orig = await importOriginal<typeof import('ai')>();
  return {
    ...orig,
    generateText: vi.fn(),
    generateObject: vi.fn(),
  };
});

import { analyzeStructured } from './gateway';
import { generateObject, generateText } from 'ai';

const TestSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeStructured (native 전략 배선)', () => {
  it('native 프로바이더(anthropic)는 generateObject를 mode 없이 호출', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { summary: 'native ok', score: 88 },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'anthropic' });

    expect(result.object).toEqual({ summary: 'native ok', score: 88 });
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
    const call = vi.mocked(generateObject).mock.calls[0][0] as Record<string, unknown>;
    expect(call.mode).toBeUndefined();
    expect(call.schema).toBe(TestSchema);
  });

  it('native 경로도 usage를 NormalizedUsage로 정규화 (totalTokens 미제공 시 합산)', async () => {
    // totalTokens omit → raw passthrough면 totalTokens가 undefined가 되어 실패
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { summary: 'ok', score: 1 },
      usage: { inputTokens: 30, outputTokens: 20 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'openai' });

    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 20, totalTokens: 50 });
  });

  it('openrouter도 native 전략 → generateObject를 mode 없이 호출 (v6 내부 모드 선택)', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { summary: 'json ok', score: 77 },
      usage: { inputTokens: 60, outputTokens: 40, totalTokens: 100 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    const result = await analyzeStructured('분석해줘', TestSchema, {
      provider: 'openrouter',
      apiKey: 'test-key',
    });

    expect(result.object).toEqual({ summary: 'json ok', score: 77 });
    const call = vi.mocked(generateObject).mock.calls[0][0] as Record<string, unknown>;
    expect(call.mode).toBeUndefined();
  });

  it('systemPrompt 옵션이 native 호출의 system으로 전달됨', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { summary: 'ok', score: 1 },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateObject>>);

    await analyzeStructured('분석해줘', TestSchema, {
      provider: 'anthropic',
      systemPrompt: '당신은 분석가입니다.',
    });

    const call = vi.mocked(generateObject).mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toBe('당신은 분석가입니다.');
  });
});
