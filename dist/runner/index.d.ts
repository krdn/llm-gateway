import { NormalizedUsage } from '../gateway/index.js';
import { ModelConfigAdapter, PipelineControlAdapter, ConcurrencyAdapter } from '../adapters/index.js';
import { a as AnalysisModule, A as AnalysisInput, b as AnalysisModuleResult } from '../types-Br_iIOw8.js';
import 'ai';
import 'zod';
import '../provider-meta-Bo9sv1xo.js';

interface RunModuleOptions {
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
 * 단일 분석 모듈 실행 (AI Gateway 호출 + 어댑터 콜백)
 * 부분 실패 허용 — 실패 시에도 에러를 throw하지 않고 failed 상태 반환
 * Rate limit 발생 시 exponential backoff로 재시도
 */
declare function runModule<T>(module: AnalysisModule<T>, input: AnalysisInput, options: RunModuleOptions, priorResults?: Record<string, unknown>): Promise<AnalysisModuleResult<T>>;

/**
 * 모듈 배열을 프로바이더별로 그룹화하여 동시성을 제어한다.
 *
 * - 같은 프로바이더의 모듈은 어댑터가 정의한 limit만큼만 동시 실행
 * - 다른 프로바이더는 서로 독립 (전부 병렬)
 * - 각 모듈의 결과는 PromiseSettledResult로 반환 (부분 실패 허용)
 */
declare function runWithProviderGrouping<M extends AnalysisModule>(modules: M[], runner: (module: M) => Promise<AnalysisModuleResult>, concurrency: ConcurrencyAdapter): Promise<PromiseSettledResult<AnalysisModuleResult>[]>;

declare const STAGE1_MODULES: AnalysisModule[];
declare const STAGE2_MODULES: AnalysisModule[];
declare const STAGE3_MODULES: AnalysisModule[];
declare const STAGE4_PARALLEL: AnalysisModule[];
declare const STAGE4_SEQUENTIAL: AnalysisModule[];
declare const ALL_MODULES: AnalysisModule[];
declare function getModuleByName(name: string): AnalysisModule | undefined;

/** Rate limit 에러 감지 (재시도 가능한 에러) */
declare function isRateLimitError(error: unknown): boolean;
/** 서버 일시 장애 감지 (rate limit과 분리 — 별도 재시도 정책 적용) */
declare function isServerOverloadError(error: unknown): boolean;
/** Rate limit 에러에서 대기 시간 추출 (초) */
declare function parseRetryAfter(error: unknown): number;
/** 지정 시간(ms) 대기 */
declare function sleep(ms: number): Promise<void>;
declare const MAX_RATE_LIMIT_RETRIES = 5;

export { ALL_MODULES, MAX_RATE_LIMIT_RETRIES, type PersistEvent, type ProgressEvent, type RunModuleOptions, STAGE1_MODULES, STAGE2_MODULES, STAGE3_MODULES, STAGE4_PARALLEL, STAGE4_SEQUENTIAL, getModuleByName, isRateLimitError, isServerOverloadError, parseRetryAfter, runModule, runWithProviderGrouping, sleep };
