import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type * as AiModule from 'ai';

vi.mock('ai', async (importOriginal) => {
  const orig = await importOriginal<typeof AiModule>();
  return {
    ...orig,
    generateText: vi.fn(),
  };
});

import type { LanguageModel } from 'ai';
import { executeStructured } from './strategies';
import { generateText } from 'ai';

const mockModel = { id: 'test-model' } as unknown as LanguageModel;

const TestSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

const baseOpts = {
  prompt: '분석해줘',
  maxOutputTokens: 4096,
  abortSignal: new AbortController().signal,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeStructured', () => {
  describe('native 전략 (supportsStructuredOutput 프로바이더)', () => {
    it('generateText + output 스펙으로 1회 호출하고 result.output을 반환', async () => {
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { summary: 'ok', score: 90 },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await executeStructured('anthropic', mockModel, TestSchema, baseOpts);

      expect(result.object).toEqual({ summary: 'ok', score: 90 });
      expect(generateText).toHaveBeenCalledTimes(1);
      const call = vi.mocked(generateText).mock.calls[0][0] as Record<string, unknown>;
      expect(call.output).toBeDefined();
    });

    it('usage를 NormalizedUsage로 정규화한다 (totalTokens 미제공 시 합산)', async () => {
      // totalTokens를 일부러 omit → raw passthrough면 totalTokens가 undefined가 되어 실패
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { summary: 'ok', score: 1 },
        usage: { inputTokens: 100, outputTokens: 50 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await executeStructured('anthropic', mockModel, TestSchema, baseOpts);

      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    });
  });

  describe('text2step 전략 (구조화 출력 미지원 프로바이더)', () => {
    it('Step 1 성공 시 Step 2 미호출, usage를 NormalizedUsage로 정규화', async () => {
      // totalTokens omit + 구버전 필드명 → raw passthrough면 실패하도록 discriminate
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"summary": "1단계", "score": 95}',
        usage: { promptTokens: 100, completionTokens: 50 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await executeStructured('ollama', mockModel, TestSchema, baseOpts);

      expect(result.object).toEqual({ summary: '1단계', score: 95 });
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('systemPrompt에 JSON 힌트를 이어붙여 Step 1 system으로 전달', async () => {
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"summary": "ok", "score": 1}',
        usage: {},
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await executeStructured('ollama', mockModel, TestSchema, {
        ...baseOpts,
        systemPrompt: '너는 분석가다.',
      });

      const call = vi.mocked(generateText).mock.calls[0][0] as { system?: string };
      expect(call.system).toContain('너는 분석가다.');
      expect(call.system).toContain('IMPORTANT: Respond in valid JSON format only');
    });

    it('finishReason=length로 잘린 Step 1 JSON을 복구하면 Step 2 미호출', async () => {
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"summary": "긴 분석 결과", "score": 88, "extra": "잘린 문자열이 여기서',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'length',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await executeStructured('ollama', mockModel, TestSchema, baseOpts);

      expect(result.object).toEqual({ summary: '긴 분석 결과', score: 88 });
      expect(result.finishReason).toBe('length');
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('Step 1 실패 → Step 2 성공 시 usage를 NormalizedUsage로 합산', async () => {
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'plain text, not json',
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"summary": "2단계", "score": 80}',
        usage: { inputTokens: 150, outputTokens: 60, totalTokens: 210 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await executeStructured('ollama', mockModel, TestSchema, baseOpts);

      expect(result.object).toEqual({ summary: '2단계', score: 80 });
      expect(generateText).toHaveBeenCalledTimes(2);
      // 두 호출 합산 후 NormalizedUsage 단일 형태 (totalTokens 포함)
      expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 260, totalTokens: 510 });
    });

    it('구버전 promptTokens/completionTokens 필드도 정규화하여 합산', async () => {
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'not json',
        usage: { promptTokens: 100, completionTokens: 200 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"summary": "ok", "score": 1}',
        usage: { promptTokens: 150, completionTokens: 60 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await executeStructured('ollama', mockModel, TestSchema, baseOpts);

      expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 260, totalTokens: 510 });
    });

    it('Step 1 분석 텍스트가 2000자를 넘어도 전문이 Step 2 변환기에 전달됨', async () => {
      const longText = 'A'.repeat(2500) + ' UNIQUE_TAIL_MARKER 끝부분 정보';
      vi.mocked(generateText).mockResolvedValueOnce({
        text: longText,
        usage: {},
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"summary": "ok", "score": 1}',
        usage: {},
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await executeStructured('ollama', mockModel, TestSchema, baseOpts);

      const step2Call = vi.mocked(generateText).mock.calls[1][0] as { prompt: string };
      expect(step2Call.prompt).toContain('UNIQUE_TAIL_MARKER');
    });

    it('Step 1, Step 2 모두 실패 시 각 단계의 실패 원인을 담은 에러 전파', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'never json',
        usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await expect(
        executeStructured('ollama', mockModel, TestSchema, baseOpts),
      ).rejects.toThrow(/구조화 출력 실패.*step1\(finishReason=stop\).*step2\(finishReason=stop\)/s);
    });
  });
});
