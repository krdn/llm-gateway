// 분석 모듈 단일 실행 러너 — DB 의존성 제거 버전
// ai-signalcraft의 runner.ts에서 DB 호출(persistAnalysisResult, getModuleModelConfig,
// isPipelineCancelled, appendJobEvent)을 어댑터로 추상화한 것
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
import type { AnalysisModule, AnalysisInput, AnalysisModuleResult } from '../types';
import {
  isRateLimitError,
  isServerOverloadError,
  parseRetryAfter,
  sleep,
  MAX_RATE_LIMIT_RETRIES,
} from './retry-utils';

export interface RunModuleOptions {
  /** 모듈별 모델/프로바이더/엔드포인트를 해석하는 어댑터 */
  configAdapter: ModelConfigAdapter;
  /** 파이프라인 제어 어댑터. 미지정 시 noop (단독 실행) */
  pipelineControl?: PipelineControlAdapter;
  /**
   * 모듈 시작/완료/실패 단계마다 호출되는 콜백.
   * ai-signalcraft는 여기서 DB persist를 수행한다.
   */
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
 * 단일 분석 모듈 실행 (AI Gateway 호출 + 어댑터 콜백)
 * 부분 실패 허용 — 실패 시에도 에러를 throw하지 않고 failed 상태 반환
 * Rate limit 발생 시 exponential backoff로 재시도
 */
export async function runModule<T>(
  module: AnalysisModule<T>,
  input: AnalysisInput,
  options: RunModuleOptions,
  priorResults?: Record<string, unknown>,
): Promise<AnalysisModuleResult<T>> {
  const pipelineControl = options.pipelineControl ?? noopPipelineControl;
  const onPersist = options.onPersist ?? (async () => undefined);
  const onProgress = options.onProgress ?? (() => undefined);

  // 수집 데이터가 없으면 분석 스킵
  const totalItems = input.articles.length + input.videos.length + input.comments.length;
  if (totalItems === 0) {
    onProgress({ module: module.name, phase: 'skip', message: '수집 데이터 0건' });
    await onPersist({
      jobId: input.jobId,
      module: module.name,
      status: 'skipped',
      errorMessage: '수집 데이터 없음 — 분석 스킵',
    });
    return { module: module.name, status: 'skipped', errorMessage: '수집 데이터 없음' };
  }

  try {
    await onPersist({ jobId: input.jobId, module: module.name, status: 'running' });
    onProgress({ module: module.name, phase: 'start' });

    const config: ResolvedModelConfig = await options.configAdapter.resolve(module.name);

    const prompt =
      priorResults && module.buildPromptWithContext
        ? module.buildPromptWithContext(input, priorResults)
        : module.buildPrompt(input);

    const gatewayOptions: AIGatewayOptions = {
      provider: config.provider,
      model: config.model,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      systemPrompt: module.buildSystemPrompt(),
      maxOutputTokens: config.maxOutputTokens ?? 8192,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      // 매 시도 전 취소 확인
      if (await pipelineControl.isCancelled(input.jobId)) {
        onProgress({
          module: module.name,
          phase: 'fail',
          message: '취소됨',
        });
        return {
          module: module.name,
          status: 'failed',
          errorMessage: '사용자에 의해 중지됨',
        };
      }
      await pipelineControl.waitIfPaused(input.jobId);

      try {
        const result = await analyzeStructured(prompt, module.schema, gatewayOptions);

        const moduleResult: AnalysisModuleResult<T> = {
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
          jobId: input.jobId,
          module: module.name,
          status: 'completed',
          result: moduleResult.result,
          usage: moduleResult.usage!,
        });
        onProgress({ module: module.name, phase: 'complete' });
        return moduleResult;
      } catch (error) {
        lastError = error;

        if (isRateLimitError(error) && attempt < MAX_RATE_LIMIT_RETRIES) {
          const retryAfterSec = parseRetryAfter(error);
          const backoffMs = Math.max(retryAfterSec * 1000, (attempt + 1) * 3000);
          const msg = `${module.name}: Rate limit, ${Math.round(backoffMs / 1000)}초 후 재시도 (${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`;
          onProgress({
            module: module.name,
            phase: 'retry',
            message: msg,
            attempt: attempt + 1,
          });
          await pipelineControl
            .appendEvent(input.jobId, 'warn', msg)
            .catch(() => undefined);
          await sleep(backoffMs);
          continue;
        }
        if (isServerOverloadError(error) && attempt < 1) {
          const msg = `${module.name}: 서버 과부하, 15초 후 재시도`;
          onProgress({ module: module.name, phase: 'retry', message: msg, attempt: 1 });
          await pipelineControl
            .appendEvent(input.jobId, 'warn', msg)
            .catch(() => undefined);
          await sleep(15_000);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    onProgress({ module: module.name, phase: 'fail', message: errorMessage });
    if (errorStack) {
      console.error(`[run-module] ${module.name}: ${errorMessage}\n${errorStack}`);
    }

    await onPersist({
      jobId: input.jobId,
      module: module.name,
      status: 'failed',
      errorMessage,
    });
    await pipelineControl
      .appendEvent(input.jobId, 'error', `${module.name} 분석 실패: ${errorMessage}`)
      .catch(() => undefined);

    return { module: module.name, status: 'failed', errorMessage };
  }
}
