// @krdn/llm-gateway — common types
//
// 사용자는 자기 도메인의 입력 타입(TInput)과 결과 타입(TResult)을 지정해
// AnalysisModule을 정의한다. runModule은 입력 형태에 대해 알지 못한다.
import type { FlexibleSchema } from 'ai';
import type { AIProvider } from './gateway/provider-meta';
import type { NormalizedUsage } from './gateway/normalize-usage';

export type { AIProvider };
// 호환성 별칭
export type ProviderType = AIProvider;

/**
 * 분석 모듈 공통 인터페이스 — 도메인 입력/결과 모두 제네릭
 *
 * @template TInput  소비자 도메인의 입력 데이터 타입 (예: 정치 여론 → articles+videos+comments)
 * @template TResult Zod 스키마가 검증하는 결과 객체 타입
 */
export interface AnalysisModule<TInput = unknown, TResult = unknown> {
  readonly name: string; // 'macro-view', 'segmentation', etc.
  readonly displayName: string; // 사람이 읽는 모듈 이름
  /**
   * 모듈 기본 프로바이더 — `RunModuleOptions.configAdapter`가 없을 때 사용된다.
   * adapter를 지정하면 adapter의 해석 결과가 이 값보다 우선한다.
   */
  readonly provider: AIProvider;
  /** 모듈 기본 모델 — configAdapter가 있으면 adapter 결과가 우선 */
  readonly model: string; // 'gemini-2.5-flash', 'claude-sonnet-4-6' 등
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
export type ModuleUsage = NormalizedUsage & { provider: string; model: string };

/**
 * 분석 모듈 실행 결과 — `status`로 판별되는 discriminated union.
 *
 * - `completed`: `result`/`usage` 보장. `errorMessage`가 있으면 분석은 성공했으나
 *   `onPersist('completed')` 저장이 실패했다는 뜻이다.
 * - `failed` / `skipped`: `errorMessage`에 사유가 담긴다. `failed`의 `usage`는
 *   실패 전까지 실제 소비한 토큰이 파악되는 경우에만 존재한다
 *   (text2step 이중 실패, native 파싱 실패 등 — 비용 집계 누락 방지).
 */
export type AnalysisModuleResult<TResult = unknown> =
  | {
      module: string;
      status: 'completed';
      result: TResult;
      usage: ModuleUsage;
      errorMessage?: string;
    }
  | { module: string; status: 'failed'; errorMessage: string; usage?: ModuleUsage }
  | { module: string; status: 'skipped'; errorMessage: string };

/**
 * runModule이 입력에서 추출하는 최소 메타데이터.
 *
 * `RunModuleOptions.extractMeta`로 자신의 TInput에서 jobId/itemCount를 어떻게
 * 뽑을지 알려줄 수 있다 (선택). 미지정 시 jobId=0, itemCount=1이 사용되어
 * skip-on-empty 검사가 비활성화된다.
 */
export interface AnalysisInputMeta {
  jobId: number;
  itemCount: number;
}
