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
import { generateText } from 'ai';

const TestSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeStructuredViaText (text fallback 파이프라인)', () => {
  // ollama는 needsTextFallback=true → analyzeStructuredViaText로 진입

  it('Step 1 성공 시 Step 2를 호출하지 않음 (이중 과금 방지)', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "결과입니다", "score": 95}',
      usage: { promptTokens: 100, completionTokens: 50 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama' });

    expect(result.object).toEqual({ summary: '결과입니다', score: 95 });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('Step 1 실패 → Step 2 성공 시 usage 토큰 합산', async () => {
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

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama' });

    expect(result.object).toEqual({ summary: '변환 성공', score: 80 });
    expect(generateText).toHaveBeenCalledTimes(2);
    const usage = result.usage as Record<string, number>;
    expect(usage.promptTokens).toBe(250);
    expect(usage.completionTokens).toBe(260);
  });

  it('Step 1, Step 2 모두 실패 시 에러 전파', async () => {
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
      analyzeStructured('분석해줘', TestSchema, { provider: 'ollama' }),
    ).rejects.toThrow('JSON 파싱 실패');

    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('Step 1에서 코드블록 형태 JSON 추출 성공', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '분석 결과:\n```json\n{"summary": "코드블록", "score": 70}\n```\n이상입니다.',
      usage: { promptTokens: 80, completionTokens: 40 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama' });

    expect(result.object).toEqual({ summary: '코드블록', score: 70 });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('Step 1에서 Zod 검증 실패 시 Step 2로 폴백', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "결과", "score": "not a number"}',
      usage: { promptTokens: 90, completionTokens: 45 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "수정됨", "score": 60}',
      usage: { promptTokens: 100, completionTokens: 50 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama' });

    expect(result.object).toEqual({ summary: '수정됨', score: 60 });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('Step 1에서 잘린 JSON (finishReason=length) 복구 성공', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "잘린 응답", "score": 55',
      usage: { promptTokens: 100, completionTokens: 4096 },
      finishReason: 'length',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama' });

    expect(result.object).toEqual({ summary: '잘린 응답', score: 55 });
    expect(result.finishReason).toBe('length');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('systemPrompt 옵션이 JSON 힌트와 결합됨', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "ok", "score": 1}',
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    await analyzeStructured('분석해줘', TestSchema, {
      provider: 'ollama',
      systemPrompt: '당신은 경제 분석가입니다.',
    });

    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.system).toContain('당신은 경제 분석가입니다.');
    expect(call.system).toContain('IMPORTANT: Respond in valid JSON format only');
  });

  it('빈 응답 시 Step 2로 폴백', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: '',
      usage: { promptTokens: 50, completionTokens: 0 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    vi.mocked(generateText).mockResolvedValueOnce({
      text: '{"summary": "빈 응답 복구", "score": 10}',
      usage: { promptTokens: 70, completionTokens: 30 },
      finishReason: 'stop',
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama' });

    expect(result.object).toEqual({ summary: '빈 응답 복구', score: 10 });
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
