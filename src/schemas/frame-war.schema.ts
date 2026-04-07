import { z } from 'zod';

// ADVN-02: 프레임 전쟁 분석 스키마
// 지배적/위협/반전 가능 프레임을 식별하여 구조화된 결과 생성
export const FrameWarSchema = z.object({
  dominantFrames: z
    .array(
      z.object({
        name: z.string().catch(''),
        description: z.string().catch(''),
        strength: z.number().catch(0).describe('강도 0~100'),
        supportingEvidence: z.array(z.string()).default([]),
      }),
    )
    .default([])
    .describe('지배적 프레임 TOP 5 (최대 5개)'),
  threateningFrames: z
    .array(
      z.object({
        name: z.string().catch(''),
        description: z.string().catch(''),
        threatLevel: z.enum(['critical', 'high', 'medium', 'low']).catch('medium'),
        counterStrategy: z.string().catch(''),
      }),
    )
    .default([])
    .describe('위협 프레임 (최대 5개)'),
  reversibleFrames: z
    .array(
      z.object({
        name: z.string().catch(''),
        currentPerception: z.string().catch(''),
        potentialShift: z.string().catch(''),
        requiredAction: z.string().catch(''),
      }),
    )
    .default([])
    .describe('반전 가능 프레임 (최대 3개)'),
  battlefieldSummary: z.string().min(1).describe('프레임 전쟁 요약'),
});

export type FrameWarResult = z.infer<typeof FrameWarSchema>;
