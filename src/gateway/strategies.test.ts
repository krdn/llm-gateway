import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('ai', async (importOriginal) => {
  const orig = await importOriginal<typeof import('ai')>();
  return {
    ...orig,
    generateText: vi.fn(),
    generateObject: vi.fn(),
  };
});

import type { LanguageModel } from 'ai';
import { executeStrategy } from './strategies';
import { generateObject, generateText } from 'ai';

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

describe('executeStrategy', () => {
  describe('native 전략', () => {
    it('generateObject를 mode 없이 호출 (v6는 provider별 모드를 내부 선택)', async () => {
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { summary: 'ok', score: 90 },
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const result = await executeStrategy('native', mockModel, TestSchema, baseOpts);

      expect(result.object).toEqual({ summary: 'ok', score: 90 });
      const call = vi.mocked(generateObject).mock.calls[0][0] as Record<string, unknown>;
      expect(call.mode).toBeUndefined();
    });

    it('usage를 NormalizedUsage로 정규화한다 (totalTokens 미제공 시 합산)', async () => {
      // totalTokens를 일부러 omit → raw passthrough면 totalTokens가 undefined가 되어 실패
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { summary: 'ok', score: 1 },
        usage: { inputTokens: 100, outputTokens: 50 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateObject>>);

      const result = await executeStrategy('native', mockModel, TestSchema, baseOpts);

      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    });
  });

  describe('text2step 전략', () => {
    it('Step 1 성공 시 Step 2 미호출, usage를 NormalizedUsage로 정규화', async () => {
      // totalTokens omit + 구버전 필드명 → raw passthrough면 실패하도록 discriminate
      vi.mocked(generateText).mockResolvedValueOnce({
        text: '{"summary": "1단계", "score": 95}',
        usage: { promptTokens: 100, completionTokens: 50 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      const result = await executeStrategy('text2step', mockModel, TestSchema, baseOpts);

      expect(result.object).toEqual({ summary: '1단계', score: 95 });
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
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

      const result = await executeStrategy('text2step', mockModel, TestSchema, baseOpts);

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

      const result = await executeStrategy('text2step', mockModel, TestSchema, baseOpts);

      expect(result.usage).toEqual({ inputTokens: 250, outputTokens: 260, totalTokens: 510 });
    });

    it('Step 1, Step 2 모두 실패 시 에러 전파', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'never json',
        usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
        finishReason: 'stop',
      } as unknown as Awaited<ReturnType<typeof generateText>>);

      await expect(
        executeStrategy('text2step', mockModel, TestSchema, baseOpts),
      ).rejects.toThrow('JSON 파싱 실패');
    });
  });
});
