import { z } from 'zod';
import { A as AIProvider } from '../provider-meta-BGU1PhSI.js';
import { NormalizedUsage } from '../gateway/index.js';
import { ModelConfigAdapter, PipelineControlAdapter, ConcurrencyAdapter } from '../adapters/index.js';
import 'ai';

type ProviderType = AIProvider;
/**
 * 분석 모듈 공통 인터페이스 — 도메인 입력/결과 모두 제네릭
 *
 * @template TInput  소비자 도메인의 입력 데이터 타입 (예: 정치 여론 → articles+videos+comments)
 * @template TResult Zod 스키마가 검증하는 결과 객체 타입
 */
interface AnalysisModule<TInput = unknown, TResult = unknown> {
    readonly name: string;
    readonly displayName: string;
    readonly provider: AIProvider;
    readonly model: string;
    readonly schema: z.ZodType<TResult, z.ZodTypeDef, unknown>;
    buildPrompt(data: TInput): string;
    buildSystemPrompt(): string;
    /** 선행 분석 결과가 필요한 모듈용 (Stage 2+) */
    buildPromptWithContext?(data: TInput, priorResults: Record<string, unknown>): string;
}
/** 분석 모듈 실행 결과 */
interface AnalysisModuleResult<TResult = unknown> {
    module: string;
    status: 'completed' | 'failed' | 'skipped';
    result?: TResult;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        provider: string;
        model: string;
    };
    errorMessage?: string;
}
/**
 * runModule이 입력에서 추출해야 하는 최소 메타데이터.
 *
 * v1.x에서는 AnalysisInput이 articles/videos/comments를 강제했지만,
 * v2.0.0부터는 임의 도메인 입력을 지원하기 위해 메타만 별도로 추출한다.
 *
 * 소비자는 runModule 호출 시 RunModuleOptions.extractMeta로 자신의
 * TInput에서 jobId/itemCount를 어떻게 뽑을지 알려줘야 한다.
 */
interface AnalysisInputMeta {
    jobId: number;
    itemCount: number;
}

/**
 * runModule 옵션 (v2.0.0)
 *
 * @template TInput 소비자 도메인 입력 타입 — 옵션 자체엔 직접 안 쓰이지만,
 *                  extractMeta가 같은 TInput을 받도록 보장하기 위해 노출.
 */
interface RunModuleOptions<TInput = unknown> {
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
type PersistEvent = {
    jobId: number;
    module: string;
    status: 'running';
} | {
    jobId: number;
    module: string;
    status: 'skipped';
    errorMessage: string;
} | {
    jobId: number;
    module: string;
    status: 'completed';
    result: unknown;
    usage: NormalizedUsage & {
        provider: string;
        model: string;
    };
} | {
    jobId: number;
    module: string;
    status: 'failed';
    errorMessage: string;
};
interface ProgressEvent {
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
 * @param priorResults 선행 모듈 결과 (Stage 2+ 모듈의 컨텍스트)
 */
declare function runModule<TInput, TResult>(module: AnalysisModule<TInput, TResult>, input: TInput, options: RunModuleOptions<TInput>, priorResults?: Record<string, unknown>): Promise<AnalysisModuleResult<TResult>>;

/**
 * 모듈 배열을 프로바이더별로 그룹화하여 동시성을 제어한다.
 *
 * - 같은 프로바이더의 모듈은 어댑터가 정의한 limit만큼만 동시 실행
 * - 다른 프로바이더는 서로 독립 (전부 병렬)
 * - 각 모듈의 결과는 PromiseSettledResult로 반환 (부분 실패 허용)
 */
declare function runWithProviderGrouping<M extends AnalysisModule<unknown, unknown>>(modules: M[], runner: (module: M) => Promise<AnalysisModuleResult>, concurrency: ConcurrencyAdapter): Promise<PromiseSettledResult<AnalysisModuleResult>[]>;

/** Rate limit 에러 감지 (재시도 가능한 에러) */
declare function isRateLimitError(error: unknown): boolean;
/** 서버 일시 장애 감지 (rate limit과 분리 — 별도 재시도 정책 적용) */
declare function isServerOverloadError(error: unknown): boolean;
/** Rate limit 에러에서 대기 시간 추출 (초) */
declare function parseRetryAfter(error: unknown): number;
/** 지정 시간(ms) 대기 */
declare function sleep(ms: number): Promise<void>;
declare const MAX_RATE_LIMIT_RETRIES = 5;

export { type AnalysisInputMeta as A, MAX_RATE_LIMIT_RETRIES, type ProviderType as P, type PersistEvent, type ProgressEvent, type RunModuleOptions, type AnalysisModule as a, type AnalysisModuleResult as b, isRateLimitError, isServerOverloadError, parseRetryAfter, runModule, runWithProviderGrouping, sleep };
