import { A as AIProvider } from '../provider-meta-Bo9sv1xo.js';

/**
 * 모듈 실행 시 사용할 모델/프로바이더/엔드포인트 정보.
 * ai-signalcraft는 DB에서 조회한 값으로 채우고,
 * 다른 프로젝트는 in-memory 어댑터로 환경변수/하드코드 값을 사용한다.
 */
interface ResolvedModelConfig {
    provider: AIProvider;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    maxOutputTokens?: number;
}
interface ModelConfigAdapter {
    resolve(moduleName: string): Promise<ResolvedModelConfig>;
}
interface InMemoryModelConfigOptions {
    /** 모듈별 부분 오버라이드 */
    overrides?: Partial<Record<string, Partial<ResolvedModelConfig>>>;
    /** 프로바이더별 공통 apiKey/baseUrl */
    providerDefaults?: Partial<Record<AIProvider, {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
    }>>;
}
/**
 * 기본 in-memory 어댑터 — MODULE_MODEL_MAP을 기반으로 동작.
 * apiKey는 providerDefaults 또는 환경변수에서 자동 추론.
 */
declare function createInMemoryModelConfig(options?: InMemoryModelConfigOptions): ModelConfigAdapter;

/**
 * 파이프라인 제어 인터페이스 — 취소/일시정지/비용 한도 검사를
 * 분리 패키지가 호출할 수 있도록 추상화한다.
 *
 * ai-signalcraft는 DB 기반 구현체를 주입하고,
 * 다른 프로젝트는 noopPipelineControl만 써도 정상 동작한다.
 */
interface PipelineControlAdapter {
    isCancelled(jobId: number): Promise<boolean>;
    waitIfPaused(jobId: number): Promise<void>;
    /** true 면 진행 가능, false 면 비용 한도 초과로 중단 */
    checkCostLimit(jobId: number, additionalEstimatedCost?: number): Promise<boolean>;
    /** 모듈 진행 이벤트 기록 (info / warn / error) */
    appendEvent(jobId: number, level: 'info' | 'warn' | 'error', message: string): Promise<void>;
}
declare const noopPipelineControl: PipelineControlAdapter;

interface ConcurrencyAdapter {
    /** 동시 실행 가능한 모듈 수 (프로바이더별) */
    getLimit(provider: AIProvider): Promise<number>;
}
declare function createStaticConcurrency(limits?: Partial<Record<AIProvider, number>>): ConcurrencyAdapter;

export { type ConcurrencyAdapter, type InMemoryModelConfigOptions, type ModelConfigAdapter, type PipelineControlAdapter, type ResolvedModelConfig, createInMemoryModelConfig, createStaticConcurrency, noopPipelineControl };
