import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('../gateway', () => ({
  analyzeStructured: vi.fn(),
}));

import { analyzeStructured } from '../gateway';
// 배럴 mock의 영향을 받지 않도록 구체 모듈에서 실제 클래스를 가져온다
import { StructuredOutputError } from '../gateway/strategies';
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

    it('StructuredOutputError 실패 시 소비한 usage가 failed 결과와 persist 이벤트에 실린다', async () => {
      vi.mocked(analyzeStructured).mockRejectedValue(
        new StructuredOutputError('구조화 출력 실패', {
          inputTokens: 70,
          outputTokens: 40,
          totalTokens: 110,
        }),
      );
      const events: PersistEvent[] = [];

      const result = await runModule(testModule, ['x'], {
        onPersist: (e) => void events.push(e),
      });

      const expectedUsage = {
        inputTokens: 70,
        outputTokens: 40,
        totalTokens: 110,
        provider: testModule.provider,
        model: testModule.model,
      };
      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.usage).toEqual(expectedUsage);
      const failedEvent = events.find((e) => e.status === 'failed');
      expect(failedEvent && 'usage' in failedEvent ? failedEvent.usage : undefined).toEqual(
        expectedUsage,
      );
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

    it("onPersist가 status==='running'에서 throw해도 분석이 진행되어 completed 반환", async () => {
      mockGatewaySuccess();

      const result = await runModule(testModule, ['x'], {
        onPersist: async (e) => {
          if (e.status === 'running') throw new Error('running persist 실패');
        },
      });

      // 'running' persist 실패가 파이프라인을 중단시키지 않아야 함 (safePersist 가드)
      expect(result.status).toBe('completed');
      expect(analyzeStructured).toHaveBeenCalledTimes(1);
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

    it('isCancelled가 throw하면 fail-open — 취소로 간주하지 않고 분석 진행', async () => {
      mockGatewaySuccess();

      const result = await runModule(testModule, ['x'], {
        pipelineControl: {
          ...noopPipelineControl,
          isCancelled: async () => {
            throw new Error('취소 어댑터 일시 오류');
          },
        },
      });

      // shouldAbort가 어댑터 오류를 '취소 아님'으로 간주(fail-open)하여 완료돼야 함
      expect(result.status).toBe('completed');
      expect(analyzeStructured).toHaveBeenCalled();
    });

    it('재시도 중 waitIfPaused가 throw해도 재시도가 계속되어 completed 반환', async () => {
      vi.useFakeTimers();
      try {
        // 첫 호출은 429로 실패 → 재시도 → onRetry에서 waitIfPaused throw → 가드 후 성공
        vi.mocked(analyzeStructured)
          .mockRejectedValueOnce(new Error('429 rate limit'))
          .mockResolvedValue({
            object: { summary: 'ok' },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            finishReason: 'stop',
          } as Awaited<ReturnType<typeof analyzeStructured>>);

        const promise = runModule(testModule, ['x'], {
          pipelineControl: {
            ...noopPipelineControl,
            waitIfPaused: async () => {
              throw new Error('pause 어댑터 일시 오류');
            },
          },
        });

        // backoff 대기(3초) 및 대기 중 마이크로태스크를 진행
        await vi.runAllTimersAsync();
        const result = await promise;

        // waitIfPaused throw가 원본 429를 대체해 던져지지 않고 재시도가 계속돼야 함
        expect(result.status).toBe('completed');
        expect(analyzeStructured).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('실패 경로의 appendEvent가 동기적으로 throw해도 never-throw 계약 유지 (원본 에러 보존)', async () => {
      vi.mocked(analyzeStructured).mockRejectedValue(new Error('API 폭발'));

      // catch 블록 안의 appendEvent 동기 throw — 가드가 없으면 runModule 밖으로 새어
      // never-throw 계약이 깨진다
      const result = await runModule(testModule, ['x'], {
        pipelineControl: {
          ...noopPipelineControl,
          appendEvent: () => {
            throw new Error('동기 로그 어댑터 버그');
          },
        },
      });

      expect(result.status).toBe('failed');
      if (result.status === 'failed') expect(result.errorMessage).toBe('API 폭발');
    });

    it('isCancelled가 동기적으로 throw해도 fail-open (Promise가 아닌 즉시 예외)', async () => {
      mockGatewaySuccess();

      const result = await runModule(testModule, ['x'], {
        pipelineControl: {
          ...noopPipelineControl,
          // async가 아닌 동기 throw — Promise.resolve(fn()).catch() 패턴은 못 잡는 케이스
          isCancelled: () => {
            throw new Error('동기 어댑터 버그');
          },
        },
      });

      expect(result.status).toBe('completed');
      expect(analyzeStructured).toHaveBeenCalled();
    });

    it('재시도 중 waitIfPaused가 동기적으로 throw해도 재시도가 계속된다', async () => {
      vi.useFakeTimers();
      try {
        vi.mocked(analyzeStructured)
          .mockRejectedValueOnce(new Error('429 rate limit'))
          .mockResolvedValue({
            object: { summary: 'ok' },
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            finishReason: 'stop',
          } as Awaited<ReturnType<typeof analyzeStructured>>);

        const promise = runModule(testModule, ['x'], {
          pipelineControl: {
            ...noopPipelineControl,
            waitIfPaused: () => {
              throw new Error('동기 pause 어댑터 버그');
            },
          },
        });

        await vi.runAllTimersAsync();
        const result = await promise;

        expect(result.status).toBe('completed');
        expect(analyzeStructured).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
