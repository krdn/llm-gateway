import { z } from 'zod';

// 모듈6: 기회 분석 (DEEP-04)
export const OpportunitySchema = z.object({
  positiveAssets: z
    .array(
      z.object({
        title: z.string().catch(''),
        description: z.string().catch(''),
        expandability: z.enum(['high', 'medium', 'low']).catch('medium'),
        currentUtilization: z.enum(['fully', 'partially', 'unused']).catch('partially'),
        recommendation: z.string().catch(''),
      }),
    )
    .default([])
    .describe('확장 가능한 긍정 요소'),
  untappedAreas: z
    .array(
      z.object({
        area: z.string().catch(''),
        potential: z.string().catch(''),
        approach: z.string().catch(''),
      }),
    )
    .default([])
    .describe('미활용 영역'),
  priorityOpportunity: z
    .object({
      title: z.string().catch(''),
      reason: z.string().catch(''),
      actionPlan: z.string().catch(''),
    })
    .catch({ title: '', reason: '', actionPlan: '' }),
});

export type OpportunityResult = z.infer<typeof OpportunitySchema>;
