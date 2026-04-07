import { z } from 'zod';

// 모듈8: 최종 전략 요약 (REPT-02)
export const FinalSummarySchema = z.object({
  oneLiner: z.string().min(1).describe('현재 상태 + 승부 핵심 한 줄 요약'),
  currentState: z
    .object({
      summary: z.string().min(1),
      sentiment: z.enum(['positive', 'negative', 'mixed']),
      keyFactor: z.string().catch(''),
    })
    .describe('현재 상황 요약'),
  criticalActions: z
    .array(
      z.object({
        priority: z.number().catch(0),
        action: z.string().catch(''),
        expectedImpact: z.string().catch(''),
        timeline: z.string().catch(''),
      }),
    )
    .default([])
    .describe('최우선 실행 과제 (최대 5개)'),
  outlook: z
    .object({
      shortTerm: z.string().catch(''),
      mediumTerm: z.string().catch(''),
      keyVariable: z.string().catch(''),
    })
    .catch({ shortTerm: '', mediumTerm: '', keyVariable: '' }),
});

export type FinalSummaryResult = z.infer<typeof FinalSummarySchema>;
