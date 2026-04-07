import { z } from 'zod';

// 모듈2: 집단별 반응 분석 스키마 (ANLZ-04)
export const SegmentationSchema = z.object({
  platformSegments: z
    .array(
      z.object({
        platform: z.string().catch(''),
        sentiment: z.enum(['positive', 'negative', 'mixed']).catch('mixed'),
        keyTopics: z.array(z.string()).default([]),
        volume: z.number().catch(0),
        characteristics: z.string().catch(''),
      }),
    )
    .default([])
    .describe('플랫폼별 반응 세분화'),
  audienceGroups: z
    .array(
      z.object({
        groupName: z.string().catch(''),
        type: z.enum(['core', 'opposition', 'swing']).catch('swing'),
        characteristics: z.string().catch(''),
        sentiment: z.enum(['positive', 'negative', 'mixed']).catch('mixed'),
        influence: z.enum(['high', 'medium', 'low']).catch('medium'),
      }),
    )
    .default([])
    .describe('집단별 반응 (Core/Opposition/Swing)'),
  highInfluenceGroup: z
    .object({
      name: z.string().catch('미확인'),
      reason: z.string().catch('데이터 부족'),
    })
    .catch({ name: '미확인', reason: '데이터 부족' })
    .describe('가장 영향력 높은 집단'),
});

export type SegmentationResult = z.infer<typeof SegmentationSchema>;
