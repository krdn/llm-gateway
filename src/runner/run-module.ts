// 분석 모듈 단일 실행 러너 — 도메인 무관
import { NoObjectGeneratedError } from 'ai';
import { analyzeStructured, type AIGatewayOptions } from '../gateway';
// 배럴('../gateway')이 아닌 구체 모듈에서 import — 테스트가 배럴을 통째로
// mock해도 instanceof 검사와 usage 정규화가 실제 구현으로 동작해야 한다
import { StructuredOutputError } from '../gateway/strategies';
import { normalizeUsage } from '../gateway/normalize-usage';
import type { ModelConfigAdapter, ResolvedModelConfig } from '../adapters/model-config';
import {
  noopPipelineControl,
  type PipelineControlAdapter,
} from '../adapters/pipeline-control';
import type {
  AnalysisModule,
  AnalysisInputMeta,
  AnalysisModuleResult,
  ModuleUsage,
} from '../types';
import { retryWithPolicy } from './retry-utils';

/** 진행 중 취소(pipelineControl.isCancelled) 폴링 간격 (ms) */
const CANCEL_POLL_INTERVAL_MS = 5_000;

/**
 * 어댑터 호출을 fail-open으로 감싼다 — 비동기 reject뿐 아니라 **동기 throw**도
 * 흡수한다 (`Promise.resolve(fn()).catch(...)`는 fn이 동기로 던지면 가드 밖으로
 * 예외가 새어 나간다). 어댑터 일시 오류가 모듈 실행을 중단시키지 않기 위한 정책.
 */
async function failOpen<T>(fn: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * runModule 옵션
 *
 * @template TInput 소비자 도메인 입력 타입 — 옵션 자체엔 직접 안 쓰이지만,
 *                  extractMeta가 같은 TInput을 받도록 보장하기 위해 노출.
 */
export interface RunModuleOptions<TInput = unknown> {
  /**
   * 모듈별 모델/프로바이더/엔드포인트를 해석하는 어댑터 (선택).
   * 지정하면 어댑터의 해석 결과가 `module.provider`/`module.model`보다 우선한다.
   * 미지정 시 모듈 자신의 provider/model을 그대로 사용한다 (단독 실행).
   */
  configAdapter?: ModelConfigAdapter;
  /**
   * 입력에서 jobId/itemCount를 추출하는 콜백 (선택).
   * 미지정 시 jobId=0, itemCount=1 — skip-on-empty 검사가 비활성화된다.
   * onPersist나 실제 pipelineControl을 쓴다면 의미 있는 jobId를 위해 지정할 것.
   */
  extractMeta?: (input: TInput) => AnalysisInputMeta;
  /** 파이프라인 제어 어댑터. 미지정 시 noop (단독 실행) */
  pipelineControl?: PipelineControlAdapter;
  /** 모듈 시작/완료/실패 단계마다 호출되는 콜백 (DB persist 등) */
  onPersist?: (result: PersistEvent) => Promise<void> | void;
  /** 진행 상황 로깅 콜백 (선택) */
  onProgress?: (event: ProgressEvent) => void;
  /** 외부 취소 signal (선택) — 진행 중인 LLM 호출까지 즉시 중단한다 */
  abortSignal?: AbortSignal;
}

export type PersistEvent =
  | { jobId: number; module: string; status: 'running' }
  | { jobId: number; module: string; status: 'skipped'; errorMessage: string }
  | {
      jobId: number;
      module: string;
      status: 'completed';
      result: unknown;
      usage: ModuleUsage;
    }
  | {
      jobId: number;
      module: string;
      status: 'failed';
      errorMessage: string;
      /** 실패 전까지 실제 소비한 토큰 (파악되는 경우에만 — 비용 집계 누락 방지) */
      usage?: ModuleUsage;
    };

export interface ProgressEvent {
  module: string;
  phase: 'start' | 'retry' | 'complete' | 'fail' | 'skip';
  message?: string;
  attempt?: number;
}

/**
 * 단일 분석 모듈을 실행한다 (AI Gateway 호출 + 어댑터 콜백 통합).
 *
 * 동작 단계:
 *   1. `extractMeta(input)`로 jobId/itemCount 획득 (미지정 시 jobId=0, itemCount=1)
 *   2. itemCount === 0이면 즉시 `skipped` 반환
 *   3. `pipelineControl.checkCostLimit(jobId)`가 false면 즉시 `failed` 반환
 *   4. configAdapter가 있으면 `resolve(module.name)`, 없으면 module.provider/model 사용
 *   5. 매 재시도 전 `pipelineControl.isCancelled` / `waitIfPaused` 체크,
 *      호출 진행 중에도 취소를 폴링해 in-flight 요청을 abort
 *   6. `analyzeStructured()` 호출 → 결과 반환 + onPersist(`completed`)
 *   7. Rate limit 에러: 선형 backoff(attempt × 3000ms, retry-after 안내가
 *      있으면 그 값과 큰 쪽)로 최대 5회 재시도
 *   8. Server overload(503/529): 15초 후 1회만 재시도
 *
 * 에러 처리 정책: **부분 실패 허용** — 어떤 경로에서도 throw하지 않고 항상
 * `AnalysisModuleResult`를 반환한다. 콜백(onPersist/onProgress/appendEvent)의
 * 실패도 모듈 실행을 중단시키지 않는다. 단, 분석 성공 후 `onPersist('completed')`가
 * 실패하면 `status: 'completed'` + `errorMessage`(저장 실패 사유)로 반환된다.
 *
 * @template TInput  소비자 도메인 입력 타입
 * @template TResult 모듈 스키마가 검증하는 결과 타입
 * @param module 실행할 분석 모듈
 * @param input 모듈에 전달할 입력 데이터
 * @param options 어댑터 + 콜백 옵션 (모두 선택)
 */
export async function runModule<TInput, TResult>(
  module: AnalysisModule<TInput, TResult>,
  input: TInput,
  options: RunModuleOptions<TInput> = {},
): Promise<AnalysisModuleResult<TResult>> {
  const pipelineControl = options.pipelineControl ?? noopPipelineControl;
  const onPersist = options.onPersist ?? (async () => undefined);
  const onProgress = options.onProgress ?? (() => undefined);

  // 콜백 실패가 파이프라인을 중단시키지 않도록 모든 콜백 호출을 가드
  const safeProgress = (event: ProgressEvent): void => {
    try {
      onProgress(event);
    } catch {
      /* noop */
    }
  };
  const safePersist = async (event: PersistEvent): Promise<void> => {
    await Promise.resolve()
      .then(() => onPersist(event))
      .catch(() => undefined);
  };

  let meta: AnalysisInputMeta;
  try {
    meta = options.extractMeta?.(input) ?? { jobId: 0, itemCount: 1 };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const errorMessage = `extractMeta 실패: ${raw}`;
    // jobId를 알 수 없으므로 onPersist/appendEvent는 호출하지 않는다
    safeProgress({ module: module.name, phase: 'fail', message: errorMessage });
    return { module: module.name, status: 'failed', errorMessage };
  }
  const { jobId, itemCount } = meta;

  // 입력 데이터가 없으면 분석 스킵 (도메인 측이 정의)
  if (itemCount === 0) {
    safeProgress({ module: module.name, phase: 'skip', message: '입력 데이터 0건' });
    await safePersist({
      jobId,
      module: module.name,
      status: 'skipped',
      errorMessage: '입력 데이터 없음 — 분석 스킵',
    });
    return { module: module.name, status: 'skipped', errorMessage: '입력 데이터 없음' };
  }

  // 취소 폴링 타이머 — finally에서 반드시 정리
  let cancelPoll: ReturnType<typeof setInterval> | undefined;
  // catch 블록에서 실패 usage에 provider/model 컨텍스트를 붙이기 위해 호이스팅
  let resolvedConfig: ResolvedModelConfig | undefined;

  try {
    // 비용 한도 pre-flight (noop 구현은 항상 true)
    if (!(await pipelineControl.checkCostLimit(jobId))) {
      const errorMessage = '비용 한도 초과 — 모듈 실행 중단';
      safeProgress({ module: module.name, phase: 'fail', message: errorMessage });
      await safePersist({ jobId, module: module.name, status: 'failed', errorMessage });
      await pipelineControl
        .appendEvent(jobId, 'warn', `${module.name}: ${errorMessage}`)
        .catch(() => undefined);
      return { module: module.name, status: 'failed', errorMessage };
    }

    await safePersist({ jobId, module: module.name, status: 'running' });
    safeProgress({ module: module.name, phase: 'start' });

    const config: ResolvedModelConfig = options.configAdapter
      ? await options.configAdapter.resolve(module.name)
      : { provider: module.provider, model: module.model };
    resolvedConfig = config;

    const prompt = module.buildPrompt(input);

    // 취소 전파: 외부 signal + pipelineControl 취소 폴링을 하나의 signal로 통합
    const controller = new AbortController();
    const gatewaySignal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, controller.signal])
      : controller.signal;

    if (pipelineControl !== noopPipelineControl) {
      cancelPoll = setInterval(() => {
        void failOpen(() => pipelineControl.isCancelled(jobId), false).then((cancelled) => {
          if (cancelled) controller.abort(new Error('aborted'));
        });
      }, CANCEL_POLL_INTERVAL_MS);
      cancelPoll.unref?.();
    }

    const gatewayOptions: AIGatewayOptions = {
      provider: config.provider,
      model: config.model,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
      systemPrompt: module.buildSystemPrompt(),
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      abortSignal: gatewaySignal,
    };

    const result = await retryWithPolicy(
      () => analyzeStructured(prompt, module.schema, gatewayOptions),
      {
        abortSignal: gatewaySignal,
        // 어댑터 일시 오류는 '취소 아님'으로 간주(fail-open) — 취소 폴링 경로와 동일 정책
        shouldAbort: () =>
          gatewaySignal.aborted || failOpen(() => pipelineControl.isCancelled(jobId), false),
        onRetry: async ({ attempt, backoffMs, type }) => {
          // onRetry 안의 어댑터 실패(waitIfPaused/appendEvent)가 원본 429 에러를
          // 대체해 던져지며 재시도 예산이 남았는데도 중단되는 것을 방지 (가드)
          await failOpen(() => pipelineControl.waitIfPaused(jobId), undefined);
          const msg = type === 'rate-limit'
            ? `${module.name}: Rate limit, ${Math.round(backoffMs / 1000)}초 후 재시도 (${attempt})`
            : `${module.name}: 서버 과부하, ${Math.round(backoffMs / 1000)}초 후 재시도`;
          safeProgress({ module: module.name, phase: 'retry', message: msg, attempt });
          await failOpen(() => pipelineControl.appendEvent(jobId, 'warn', msg), undefined);
        },
      },
    );

    const usage: ModuleUsage = {
      ...result.usage,
      provider: config.provider,
      model: config.model,
    };
    const moduleResult: AnalysisModuleResult<TResult> = {
      module: module.name,
      status: 'completed',
      result: result.object,
      usage,
    };

    try {
      await onPersist({
        jobId,
        module: module.name,
        status: 'completed',
        result: result.object,
        usage,
      });
    } catch (persistError) {
      // 분석은 성공했으므로 결과를 보존하고 저장 실패만 errorMessage로 알린다
      const msg = persistError instanceof Error ? persistError.message : String(persistError);
      safeProgress({ module: module.name, phase: 'fail', message: `결과 저장 실패: ${msg}` });
      return { ...moduleResult, errorMessage: `결과 저장 실패: ${msg}` };
    }

    safeProgress({ module: module.name, phase: 'complete' });
    return moduleResult;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const errorMessage = raw === 'aborted' ? '사용자에 의해 중지됨' : raw;

    // 실패 경로에서도 실제 소비한 토큰을 보존 — StructuredOutputError(text2step
    // 이중 실패)와 AI SDK NoObjectGeneratedError(native 파싱 실패)는 usage를 실어 온다
    const failedTokens =
      error instanceof StructuredOutputError
        ? error.usage
        : NoObjectGeneratedError.isInstance(error) && error.usage
          ? normalizeUsage(error.usage)
          : undefined;
    const failedUsage =
      failedTokens && resolvedConfig
        ? { ...failedTokens, provider: resolvedConfig.provider, model: resolvedConfig.model }
        : undefined;

    safeProgress({ module: module.name, phase: 'fail', message: errorMessage });
    await safePersist({
      jobId,
      module: module.name,
      status: 'failed',
      errorMessage,
      ...(failedUsage ? { usage: failedUsage } : {}),
    });
    await pipelineControl
      .appendEvent(jobId, 'error', `${module.name} 분석 실패: ${errorMessage}`)
      .catch(() => undefined);

    return {
      module: module.name,
      status: 'failed',
      errorMessage,
      ...(failedUsage ? { usage: failedUsage } : {}),
    };
  } finally {
    if (cancelPoll) clearInterval(cancelPoll);
  }
}
