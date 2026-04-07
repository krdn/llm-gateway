import { z } from 'zod';

// ADVN-01: AI 지지율 추정 스키마
// 감정 비율과 플랫폼 편향을 보정하여 범위(range)로 산출, 면책 문구 필수 포함
export const ApprovalRatingSchema = z.object({
  estimatedRange: z
    .object({
      min: z.number().describe('최소 지지율 0~100'),
      max: z.number().describe('최대 지지율 0~100'),
    })
    .describe('AI 추정 지지율 범위 (%)'),
  confidence: z.enum(['high', 'medium', 'low']).describe('신뢰도'),
  methodology: z
    .object({
      sentimentRatio: z
        .object({
          positive: z.number().catch(0),
          neutral: z.number().catch(0),
          negative: z.number().catch(0),
        })
        .catch({ positive: 0, neutral: 0, negative: 0 }),
      platformBiasCorrection: z
        .array(
          z.object({
            platform: z.string().catch(''),
            biasDirection: z.enum(['left', 'right', 'neutral']).catch('neutral'),
            correctionFactor: z.number().catch(1),
          }),
        )
        .default([]),
      spreadFactor: z.number().catch(1).describe('확산력 가중치'),
    })
    .catch({
      sentimentRatio: { positive: 0, neutral: 0, negative: 0 },
      platformBiasCorrection: [],
      spreadFactor: 1,
    }),
  disclaimer: z
    .string()
    .catch('AI 추정치로 실제 지지율과 차이가 있을 수 있습니다.')
    .describe('면책 문구 -- 반드시 포함'),
  reasoning: z.string().catch(''),
});

export type ApprovalRatingResult = z.infer<typeof ApprovalRatingSchema>;
