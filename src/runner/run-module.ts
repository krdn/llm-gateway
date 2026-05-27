// 분석 모듈 단일 실행 러너 — 도메인 무관 (v2.0.0)
//
// v1.x → v2.0.0 BREAKING:
//   - input 타입이 AnalysisInput 고정 → 제네릭 TInput
//   - jobId/itemCount는 RunModuleOptions.extractMeta 콜백으로 추출
//   - "수집 데이터 없음" 스킵 조건이 articles+videos+comments → meta.itemCount === 0
import {
  analyzeStructured,
  normalizeUsage,
  type AIGatewayOptions,
  type NormalizedUsage,
} from '../gateway';
import type {
  ModelConfigAdapter,
  ResolvedModelConfig,
} from '../adapters/model-config';
import {
  noopPipelineControl,
  type PipelineControlAdapter,
} from '../adapters/pipeline-control';
import type {
  AnalysisModule,
  AnalysisInputMeta,
  AnalysisModuleResult,
} from '../types';
import { retryWithPolicy } from './retry-utils';

/**
 * runModule 옵션 (v2.0.0)
 *
 * @template TInput 소비자 도메인 입력 타입 — 옵션 자체엔 직접 안 쓰이지만,
 *                  extractMeta가 같은 TInput을 받도록 보장하기 위해 노출.
 */
export interface RunModuleOptions<TInput = unknown> {
  /** 모듈별 모델/프로바이더/엔드포인트를 해석하는 어댑터 */
  configAdapter: ModelConfigAdapter;
  /**
   * 입력에서 jobId/itemCount를 추출하는 콜백.
   * v1.x의 input.jobId / articles+videos+comments.length 하드코딩을 대체.
   */
  extractMeta: (input: TInput) => AnalysisInputMeta;
  /** 파이프라인 제어 어댑터. 미지정 시 noop (단독 실행) */
  pipelineControl?: PipelineControlAdapter;
  /** 모듈 시작/완료/실패 단계마다 호출되는 콜백 (DB persist 등) */
  onPersist?: (result: PersistEvent) => Promise<void> | void;
  /** 진행 상황 로깅 콜백 (선택) */
  onProgress?: (event: ProgressEvent) => void;
}

export type PersistEvent =
  | { jobId: number; module: string; status: 'running' }
  | { jobId: number; module: string; status: 'skipped'; errorMessage: string }
  | {
      jobId: number;
      module: string;
      status: 'completed';
      result: unknown;
      usage: NormalizedUsage & { provider: string; model: string };
    }
  | { jobId: number; module: string; status: 'failed'; errorMessage: string };

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
 *   1. `extractMeta(input)`로 jobId/itemCount 획득
 *   2. itemCount === 0이면 즉시 `skipped` 반환
 *   3. `configAdapter.resolve(module.name)`로 모델 설정 해석
 *   4. 매 시도마다 `pipelineControl.isCancelled` / `waitIfPaused` 체크
 *   5. `analyzeStructured()` 호출 → 결과 반환 + onPersist(`completed`)
 *   6. Rate limit 에러: exponential backoff로 최대 5회 재시도
 *   7. Server overload(503): 15초 후 1회만 재시도
 *   8. 모든 재시도 실패 시 throw하지 않고 `failed` 상태 반환
 *
 * 에러 처리 정책: **부분 실패 허용** — 한 모듈의 실패가 전체 파이프라인을
 * 중단시키지 않도록 항상 `AnalysisModuleResult`를 반환한다.
 *
 * @template TInput  소비자 도메인 입력 타입
 * @template TResult 모듈 스키마가 검증하는 결과 타입
 * @param module 실행할 분석 모듈
 * @param input 모듈에 전달할 입력 데이터
 * @param options 어댑터 + 콜백 옵션
 */
export async function runModule<TInput, TResult>(
  module: AnalysisModule<TInput, TResult>,
  input: TInput,
  options: RunModuleOptions<TInput>,
): Promise<AnalysisModuleResult<TResult>> {
  const pipelineControl = options.pipelineControl ?? noopPipelineControl;
  const onPersist = options.onPersist ?? (async () => undefined);
  const onProgress = options.onProgress ?? (() => undefined);

  const meta = options.extractMeta(input);
  const { jobId, itemCount } = meta;

  // 입력 데이터가 없으면 분석 스킵 (도메인 측이 정의)
  if (itemCount === 0) {
    onProgress({ module: module.name, phase: 'skip', message: '입력 데이터 0건' });
    await onPersist({
      jobId,
      module: module.name,
      status: 'skipped',
      errorMessage: '입력 데이터 없음 — 분석 스킵',
    });
    return { module: module.name, status: 'skipped', errorMessage: '입력 데이터 없음' };
  }

  try {
    await onPersist({ jobId, module: module.name, status: 'running' });
    onProgress({ module: module.name, phase: 'start' });

    const config: ResolvedModelConfig = await options.configAdapter.resolve(module.name);

    const prompt = module.buildPrompt(input);

    const gatewayOptions: AIGatewayOptions = {
      provider: config.provider,
      model: config.model,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      systemPrompt: module.buildSystemPrompt(),
      maxOutputTokens: config.maxOutputTokens ?? 8192,
    };

    const result = await retryWithPolicy(
      () => analyzeStructured(prompt, module.schema, gatewayOptions),
      {
        shouldAbort: () => pipelineControl.isCancelled(jobId),
        onRetry: async ({ attempt, backoffMs, type }) => {
          await pipelineControl.waitIfPaused(jobId);
          const msg = type === 'rate-limit'
            ? `${module.name}: Rate limit, ${Math.round(backoffMs / 1000)}초 후 재시도 (${attempt})`
            : `${module.name}: 서버 과부하, ${Math.round(backoffMs / 1000)}초 후 재시도`;
          onProgress({ module: module.name, phase: 'retry', message: msg, attempt });
          await pipelineControl.appendEvent(jobId, 'warn', msg).catch(() => undefined);
        },
      },
    );

    const moduleResult: AnalysisModuleResult<TResult> = {
      module: module.name,
      status: 'completed',
      result: result.object,
      usage: {
        ...normalizeUsage(result.usage as Record<string, unknown>),
        provider: config.provider,
        model: config.model,
      },
    };

    await onPersist({
      jobId,
      module: module.name,
      status: 'completed',
      result: moduleResult.result,
      usage: moduleResult.usage!,
    });
    onProgress({ module: module.name, phase: 'complete' });
    return moduleResult;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const errorMessage = raw === 'aborted' ? '사용자에 의해 중지됨' : raw;
    const errorStack = error instanceof Error ? error.stack : undefined;

    onProgress({ module: module.name, phase: 'fail', message: errorMessage });
    if (errorStack && raw !== 'aborted') {
      console.error(`[run-module] ${module.name}: ${errorMessage}\n${errorStack}`);
    }

    await onPersist({
      jobId,
      module: module.name,
      status: 'failed',
      errorMessage,
    });
    await pipelineControl
      .appendEvent(jobId, 'error', `${module.name} 분석 실패: ${errorMessage}`)
      .catch(() => undefined);

    return { module: module.name, status: 'failed', errorMessage };
  }
}
