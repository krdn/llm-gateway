import { describe, expect, it, vi, beforeEach } from 'vitest';
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

import { analyzeText } from './gateway';
import { generateText } from 'ai';

function mockTextResponse(overrides: Record<string, unknown> = {}) {
  return {
    text: '분석 결과',
    usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
    finishReason: 'stop',
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof generateText>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyzeText', () => {
  it('기본값: provider=anthropic, maxOutputTokens=4096', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(mockTextResponse());

    const result = await analyzeText('요약해줘');

    expect(result.text).toBe('분석 결과');
    expect(generateText).toHaveBeenCalledTimes(1);
    const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
    expect(call.maxOutputTokens).toBe(4096);
    expect(call.model).toBe(mockModel);
  });

  it('systemPrompt 옵션이 system으로 전달됨', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(mockTextResponse());

    await analyzeText('요약해줘', { systemPrompt: '너는 요약가다.' });

    const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
    expect(call.system).toBe('너는 요약가다.');
  });

  it('systemPrompt 미지정 시 system 키 자체를 넘기지 않음', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(mockTextResponse());

    await analyzeText('요약해줘');

    const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
    expect('system' in call).toBe(false);
  });

  it('usage는 원본 필드 보존 + 정규화 필드 보장 (totalTokens 미제공 시 합산)', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(
      mockTextResponse({
        usage: { inputTokens: 30, outputTokens: 20, cachedInputTokens: 5 },
      }),
    );

    const result = await analyzeText('요약해줘');

    // 정규화 필드 3종은 항상 숫자
    expect(result.usage.inputTokens).toBe(30);
    expect(result.usage.outputTokens).toBe(20);
    expect(result.usage.totalTokens).toBe(50);
    // 프로바이더 원본 확장 필드 보존
    expect((result.usage as unknown as Record<string, unknown>).cachedInputTokens).toBe(5);
  });

  it('abortSignal이 이미 abort된 경우 병합된 signal도 즉시 aborted 상태', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(mockTextResponse());
    const controller = new AbortController();
    controller.abort(new Error('취소됨'));

    await analyzeText('요약해줘', { abortSignal: controller.signal });

    const call = vi.mocked(generateText).mock.calls[0][0] as { abortSignal: AbortSignal };
    expect(call.abortSignal.aborted).toBe(true);
  });

  it('진행 중 외부 abort가 병합된 signal로 전파됨', async () => {
    vi.mocked(generateText).mockResolvedValueOnce(mockTextResponse());
    const controller = new AbortController();

    await analyzeText('요약해줘', { abortSignal: controller.signal });

    const call = vi.mocked(generateText).mock.calls[0][0] as { abortSignal: AbortSignal };
    expect(call.abortSignal.aborted).toBe(false);
    controller.abort();
    expect(call.abortSignal.aborted).toBe(true);
  });
});
