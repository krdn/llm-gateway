// @krdn/ai-analysis-kit — 도메인 무관 타입 정의
//
// v2.0.0 BREAKING CHANGES
//   - AnalysisModule<T>가 AnalysisModule<TInput, TResult>로 제네릭화됨
//   - AnalysisInput, MODULE_MODEL_MAP, MODULE_NAMES 제거 (도메인 자산 → 소비자 측 정의)
//
// 사용자는 자기 도메인의 입력 타입(TInput)과 결과 타입(TResult)을 지정해
// AnalysisModule을 정의한다. runModule은 입력 형태에 대해 알지 못한다.
import type { z } from 'zod';
import type { AIProvider } from './gateway/provider-meta';

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
  readonly provider: AIProvider; // 모듈별 AI 모델 지정
  readonly model: string; // 'gemini-2.5-flash', 'claude-sonnet-4-6' 등
  readonly schema: z.ZodType<TResult, z.ZodTypeDef, unknown>;

  buildPrompt(data: TInput): string;
  buildSystemPrompt(): string;
  /** 선행 분석 결과가 필요한 모듈용 (Stage 2+) */
  buildPromptWithContext?(data: TInput, priorResults: Record<string, unknown>): string;
}

/** 분석 모듈 실행 결과 */
export interface AnalysisModuleResult<TResult = unknown> {
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
export interface AnalysisInputMeta {
  jobId: number;
  itemCount: number;
}
