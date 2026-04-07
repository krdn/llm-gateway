import { z } from 'zod';
import type { AIProvider } from './gateway/provider-meta';

// AI 프로바이더 타입 — gateway에서 단일 정의, 여기서 re-export
export type { AIProvider };

// 호환성을 위한 별칭
export type ProviderType = AIProvider;

// 분석 모듈 공통 인터페이스 (D-01)
export interface AnalysisModule<T = unknown> {
  readonly name: string; // 'macro-view', 'segmentation', etc.
  readonly displayName: string; // '전체 여론 구조 분석'
  readonly provider: AIProvider; // D-03: 모듈별 AI 모델 지정
  readonly model: string; // 'gemini-2.5-flash', 'claude-sonnet-4-6' 등
  readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>; // 모듈별 Zod 스키마

  buildPrompt(data: AnalysisInput): string;
  buildSystemPrompt(): string;
  // 선행 분석 결과가 필요한 모듈용 (모듈5~7)
  buildPromptWithContext?(data: AnalysisInput, priorResults: Record<string, unknown>): string;
}

// 분석 입력 데이터 (소비 측이 자체 DB에서 로드해 전달)
export interface AnalysisInput {
  jobId: number;
  keyword: string;
  articles: Array<{
    title: string;
    content: string | null;
    publisher: string | null;
    publishedAt: Date | null;
    source: string;
  }>;
  videos: Array<{
    title: string;
    description: string | null;
    channelTitle: string | null;
    viewCount: number | null;
    likeCount: number | null;
    publishedAt: Date | null;
  }>;
  comments: Array<{
    content: string;
    source: string;
    author: string | null;
    likeCount: number | null;
    dislikeCount: number | null;
    publishedAt: Date | null;
  }>;
  dateRange: { start: Date; end: Date };
}

// 분석 모듈 실행 결과
export interface AnalysisModuleResult<T = unknown> {
  module: string;
  status: 'completed' | 'failed' | 'skipped';
  result?: T;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    provider: string;
    model: string;
  };
  errorMessage?: string;
}

// 모듈별 AI 모델 매핑 (D-03) — 2026-04 최신 모델 기준
// 분리 전 ai-signalcraft/types.ts와 동일하게 유지
export const MODULE_MODEL_MAP: Record<string, { provider: AIProvider; model: string }> = {
  // Stage 1: 대량 텍스트 요약/분류 — 속도·비용 우선
  'macro-view': { provider: 'gemini', model: 'gemini-2.5-flash' },
  segmentation: { provider: 'gemini', model: 'gemini-2.5-flash' },
  'sentiment-framing': { provider: 'gemini', model: 'gemini-2.5-flash' },
  'message-impact': { provider: 'gemini', model: 'gemini-2.5-flash' },
  // Stage 2: 복합 추론/전략 — 품질 우선
  'risk-map': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  opportunity: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  strategy: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  'final-summary': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  'integrated-report': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  // Stage 4: ADVN 고급 분석 모듈
  'approval-rating': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  'frame-war': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  'crisis-scenario': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  'win-simulation': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
};

// 모듈 이름 상수
export const MODULE_NAMES = {
  MACRO_VIEW: 'macro-view',
  SEGMENTATION: 'segmentation',
  SENTIMENT_FRAMING: 'sentiment-framing',
  MESSAGE_IMPACT: 'message-impact',
  RISK_MAP: 'risk-map',
  OPPORTUNITY: 'opportunity',
  STRATEGY: 'strategy',
  FINAL_SUMMARY: 'final-summary',
  APPROVAL_RATING: 'approval-rating',
  FRAME_WAR: 'frame-war',
  CRISIS_SCENARIO: 'crisis-scenario',
  WIN_SIMULATION: 'win-simulation',
} as const;
