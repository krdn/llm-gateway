import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('../gateway', () => ({
  analyzeStructured: vi.fn(),
}));

import { analyzeStructured } from '../gateway';
import { runModule, type PersistEvent } from './run-module';
import { noopPipelineControl } from '../adapters/pipeline-control';
import type { AnalysisModule } from '../types';

const TestSchema = z.object({ summary: z.string() });

const testModule: AnalysisModule<string[], { summary: string }> = {
  name: 'test-module',
  displayName: '테스트 모듈',
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  schema: TestSchema,
  buildPrompt: (input) => `분석: ${input.join(',')}`,
  buildSystemPrompt: () => '시스템 프롬프트',
};

function mockGatewaySuccess() {
  vi.mocked(analyzeStructured).mockResolvedValue({
    object: { summary: 'ok' },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: 'stop',
  } as Awaited<ReturnType<typeof analyzeStructured>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runModule', () => {
  describe('모델 설정 해석', () => {
    it('configAdapter 없이 module.provider/model을 그대로 사용 (단독 실행)', async () => {
      mockGatewaySuccess();

      const result = await runModule(testModule, ['data']);

      expect(result.status).toBe('completed');
      const options = vi.mocked(analyzeStructured).mock.calls[0][2]!;
      expect(options.provider).toBe('anthropic');
      expect(options.model).toBe('claude-sonnet-4-6');
      if (result.status === 'completed') {
        expect(result.usage).toEqual({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
        });
      }
    });

    it('configAdapter가 있으면 adapter 해석 결과가 module 필드보다 우선', async () => {
      mockGatewaySuccess();

      const result = await runModule(testModule, ['data'], {
        configAdapter: {
          resolve: async () => ({
            provider: 'openai',
            model: 'gpt-4.1-nano',
            apiKey: 'sk-x',
            timeoutMs: 60_000,
          }),
        },
      });

      expect(result.status).toBe('completed');
      const options = vi.mocked(analyzeStructured).mock.calls[0][2]!;
      expect(options.provider).toBe('openai');
      expect(options.model).toBe('gpt-4.1-nano');
      expect(options.apiKey).toBe('sk-x');
      expect(options.timeoutMs).toBe(60_000);
    });
  });

  describe('extractMeta / skip 정책', () => {
    it('extractMeta 미지정 시 skip 없이 실행 (jobId=0)', async () => {
      mockGatewaySuccess();
      const events: PersistEvent[] = [];

      const result = await runModule(testModule, [], {
        onPersist: (e) => void events.push(e),
      });

      expect(result.status).toBe('completed');
      expect(events[0]).toEqual({ jobId: 0, module: 'test-module', status: 'running' });
    });

    it('itemCount=0이면 skipped 반환, 게이트웨이 미호출', async () => {
      const events: PersistEvent[] = [];

      const result = await runModule(testModule, [], {
        extractMeta: (input) => ({ jobId: 7, itemCount: input.length }),
        onPersist: (e) => void events.push(e),
      });

      expect(result).toEqual({
        module: 'test-module',
        status: 'skipped',
        errorMessage: '입력 데이터 없음',
      });
      expect(analyzeStructured).not.toHaveBeenCalled();
      expect(events[0]).toMatchObject({ jobId: 7, status: 'skipped' });
    });

    it('extractMeta가 throw해도 failed 결과 반환 (never-throw), onPersist 미호출', async () => {
      const onPersist = vi.fn();

      const result = await runModule(testModule, ['x'], {
        extractMeta: () => {
          throw new Error('메타 추출 불가');
        },
        onPersist,
      });

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.errorMessage).toContain('메타 추출 불가');
      }
      expect(onPersist).not.toHaveBeenCalled();
      expect(analyzeStructured).not.toHaveBeenCalled();
    });
  });

  describe('부분 실패 정책 (never-throw)', () => {
    it('게이트웨이 에러 시 failed 결과 반환, persist 이벤트 순서 running→failed', async () => {
      vi.mocked(analyzeStructured).mockRejectedValue(new Error('API 폭발'));
      const events: PersistEvent[] = [];

      const result = await runModule(testModule, ['x'], {
        onPersist: (e) => void events.push(e),
      });

      expect(result).toEqual({
        module: 'test-module',
        status: 'failed',
        errorMessage: 'API 폭발',
      });
      expect(events.map((e) => e.status)).toEqual(['running', 'failed']);
    });

    it("'aborted' 에러는 '사용자에 의해 중지됨'으로 매핑", async () => {
      vi.mocked(analyzeStructured).mockRejectedValue(new Error('aborted'));

      const result = await runModule(testModule, ['x']);

      expect(result).toEqual({
        module: 'test-module',
        status: 'failed',
        errorMessage: '사용자에 의해 중지됨',
      });
    });

    it('실패 경로에서 onPersist가 또 throw해도 failed 결과 반환 (원본 에러 보존)', async () => {
      vi.mocked(analyzeStructured).mockRejectedValue(new Error('원본 에러'));

      const result = await runModule(testModule, ['x'], {
        onPersist: async (e) => {
          if (e.status === 'failed') throw new Error('DB 죽음');
        },
      });

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.errorMessage).toBe('원본 에러');
      }
    });

    it('onProgress가 throw해도 실행이 중단되지 않음', async () => {
      mockGatewaySuccess();

      const result = await runModule(testModule, ['x'], {
        onProgress: () => {
          throw new Error('콜백 버그');
        },
      });

      expect(result.status).toBe('completed');
    });

    it("분석 성공 후 onPersist('completed')가 throw하면 completed + 저장 실패 errorMessage", async () => {
      mockGatewaySuccess();

      const result = await runModule(testModule, ['x'], {
        onPersist: async (e) => {
          if (e.status === 'completed') throw new Error('저장소 오류');
        },
      });

      expect(result.status).toBe('completed');
      if (result.status === 'completed') {
        expect(result.result).toEqual({ summary: 'ok' });
        expect(result.errorMessage).toContain('결과 저장 실패');
        expect(result.errorMessage).toContain('저장소 오류');
      }
    });
  });

  describe('파이프라인 제어', () => {
    it('checkCostLimit이 false면 failed 반환, 게이트웨이 미호출', async () => {
      const result = await runModule(testModule, ['x'], {
        pipelineControl: {
          ...noopPipelineControl,
          checkCostLimit: async () => false,
        },
      });

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.errorMessage).toContain('비용 한도 초과');
      }
      expect(analyzeStructured).not.toHaveBeenCalled();
    });

    it('isCancelled가 true면 게이트웨이 호출 전 중지', async () => {
      const result = await runModule(testModule, ['x'], {
        pipelineControl: {
          ...noopPipelineControl,
          isCancelled: async () => true,
        },
      });

      expect(result).toEqual({
        module: 'test-module',
        status: 'failed',
        errorMessage: '사용자에 의해 중지됨',
      });
      expect(analyzeStructured).not.toHaveBeenCalled();
    });

    it('이미 abort된 외부 abortSignal이면 게이트웨이 호출 전 중지', async () => {
      const controller = new AbortController();
      controller.abort(new Error('aborted'));

      const result = await runModule(testModule, ['x'], {
        abortSignal: controller.signal,
      });

      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.errorMessage).toBe('사용자에 의해 중지됨');
      }
      expect(analyzeStructured).not.toHaveBeenCalled();
    });

    it('게이트웨이 호출에 abort 가능한 signal이 전달됨', async () => {
      mockGatewaySuccess();

      await runModule(testModule, ['x']);

      const options = vi.mocked(analyzeStructured).mock.calls[0][2]!;
      expect(options.abortSignal).toBeInstanceOf(AbortSignal);
      expect(options.abortSignal!.aborted).toBe(false);
    });
  });
});
