import { ModelConfigAdapter, PipelineControlAdapter } from './adapters/index.js';
import { FlexibleSchema } from 'ai';
import { A as AIProvider } from './provider-meta-BkGweTb-.js';
import { N as NormalizedUsage } from './normalize-usage-sTTPLOZv.js';

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
    /**
     * 모듈 기본 프로바이더 — `RunModuleOptions.configAdapter`가 없을 때 사용된다.
     * adapter를 지정하면 adapter의 해석 결과가 이 값보다 우선한다.
     */
    readonly provider: AIProvider;
    /** 모듈 기본 모델 — configAdapter가 있으면 adapter 결과가 우선 */
    readonly model: string;
    /**
     * 결과를 검증할 스키마. zod v3·v4 양쪽을 받는다 (AI SDK의 `FlexibleSchema`).
     *
     * zod의 타입을 직접 참조하지 않는 이유: v4가 `ZodTypeDef`를 없애 3-인자
     * `ZodType<T, ZodTypeDef, unknown>` 별칭이 v4에서 출력 타입 추론을 잃는다.
     * `FlexibleSchema<T>`는 출력 타입이 유일한 인자라 두 메이저 모두에서 추론이 산다.
     */
    readonly schema: FlexibleSchema<TResult>;
    buildPrompt(data: TInput): string;
    buildSystemPrompt(): string;
}
/** 모듈 실행 usage — 정규화 토큰 수 + 실행 컨텍스트(provider/model) */
type ModuleUsage = NormalizedUsage & {
    provider: string;
    model: string;
};
/**
 * 분석 모듈 실행 결과 — `status`로 판별되는 discriminated union.
 *
 * - `completed`: `result`/`usage` 보장. `errorMessage`가 있으면 분석은 성공했으나
 *   `onPersist('completed')` 저장이 실패했다는 뜻이다.
 * - `failed` / `skipped`: `errorMessage`에 사유가 담긴다. `failed`의 `usage`는
 *   실패 전까지 실제 소비한 토큰이 파악되는 경우에만 존재한다
 *   (text2step 이중 실패, native 파싱 실패 등 — 비용 집계 누락 방지).
 */
type AnalysisModuleResult<TResult = unknown> = {
    module: string;
    status: 'completed';
    result: TResult;
    usage: ModuleUsage;
    errorMessage?: string;
} | {
    module: string;
    status: 'failed';
    errorMessage: string;
    usage?: ModuleUsage;
} | {
    module: string;
    status: 'skipped';
    errorMessage: string;
};
/**
 * runModule이 입력에서 추출하는 최소 메타데이터.
 *
 * `RunModuleOptions.extractMeta`로 자신의 TInput에서 jobId/itemCount를 어떻게
 * 뽑을지 알려줄 수 있다 (선택). 미지정 시 jobId=0, itemCount=1이 사용되어
 * skip-on-empty 검사가 비활성화된다.
 */
interface AnalysisInputMeta {
    jobId: number;
    itemCount: number;
}

/**
 * runModule 옵션
 *
 * @template TInput 소비자 도메인 입력 타입 — 옵션 자체엔 직접 안 쓰이지만,
 *                  extractMeta가 같은 TInput을 받도록 보장하기 위해 노출.
 */
interface RunModuleOptions<TInput = unknown> {
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
    usage: ModuleUsage;
} | {
    jobId: number;
    module: string;
    status: 'failed';
    errorMessage: string;
    /** 실패 전까지 실제 소비한 토큰 (파악되는 경우에만 — 비용 집계 누락 방지) */
    usage?: ModuleUsage;
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
declare function runModule<TInput, TResult>(module: AnalysisModule<TInput, TResult>, input: TInput, options?: RunModuleOptions<TInput>): Promise<AnalysisModuleResult<TResult>>;

/** Rate limit 에러 감지 (재시도 가능한 에러) */
declare function isRateLimitError(error: unknown): boolean;
/**
 * 서버 일시 장애 감지 (rate limit과 분리 — 별도 재시도 정책 적용).
 *
 * 프록시 계층 에러(cli-proxy-api의 502, type 'server_error')는 여기서 재시도하지
 * 않는다 — AI SDK 기본 maxRetries=2가 isRetryable(5xx) 규칙으로 502를 이미
 * 재시도하고, 프록시 자체도 업스트림 재시도 후 502를 반환하므로 단기 장애는
 * 하위 계층에서 흡수된다. 'unknown provider' 같은 영구 오류도 같은 502로 오므로
 * 상위 재시도는 무익하다.
 */
declare function isServerOverloadError(error: unknown): boolean;
/** Rate limit 에러에서 대기 시간 추출 (초) — retry-after 헤더 우선, 메시지 패턴 폴백 */
declare function parseRetryAfter(error: unknown): number;
/**
 * 지정 시간(ms) 대기. signal이 주어지면 대기 중 abort 시 즉시 reject한다
 * (backoff 대기가 취소를 무시해 최대 5분 지연되는 것을 방지).
 */
declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;
declare const MAX_RATE_LIMIT_RETRIES = 5;
/**
 * provider가 안내한 retry-after가 이 값을 넘으면 재시도하지 않고 원본 에러를
 * 즉시 던진다 (예: Gemini 일일 쿼터 소진 시 'retry in 86400s' — 24시간 대기 방지).
 */
declare const MAX_RETRY_AFTER_MS: number;
interface RetryPolicyOptions {
    maxRateLimitRetries?: number;
    maxOverloadRetries?: number;
    overloadBackoffMs?: number;
    onRetry?: (info: {
        error: unknown;
        attempt: number;
        backoffMs: number;
        type: 'rate-limit' | 'overload';
    }) => void | Promise<void>;
    shouldAbort?: () => boolean | Promise<boolean>;
    /** backoff 대기 중 abort 시 즉시 중단하기 위한 signal (선택) */
    abortSignal?: AbortSignal;
    /** @internal 테스트용 sleep 주입 */
    _sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
/**
 * Rate limit(선형 backoff: attempt × 3000ms, retry-after 안내가 있으면 그 값과
 * 큰 쪽)과 서버 과부하(고정 backoff)를 서로 독립된 재시도 예산으로 처리한다.
 * 두 예산 중 해당하는 쪽이 소진되면 마지막 원본 에러를 그대로 다시 던진다
 * (일반 에러로 감싸지 않음 — 상위에서 statusCode/메시지 기반 분류가 계속
 * 동작해야 하므로).
 */
declare function retryWithPolicy<T>(fn: () => Promise<T>, options?: RetryPolicyOptions): Promise<T>;

export { type AnalysisInputMeta as A, MAX_RATE_LIMIT_RETRIES as M, type PersistEvent as P, type RetryPolicyOptions as R, type AnalysisModule as a, type AnalysisModuleResult as b, MAX_RETRY_AFTER_MS as c, type ModuleUsage as d, type ProgressEvent as e, type ProviderType as f, type RunModuleOptions as g, isServerOverloadError as h, isRateLimitError as i, runModule as j, parseRetryAfter as p, retryWithPolicy as r, sleep as s };
