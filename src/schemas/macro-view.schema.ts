import { z } from 'zod';

// 모듈1: 전체 여론 구조 분석 스키마 (ANLZ-01, ANLZ-03)
export const MacroViewSchema = z.object({
  overallDirection: z.enum(['positive', 'negative', 'mixed']).describe('전체 여론 방향성'),
  summary: z.string().min(1).describe('핵심 흐름 요약 3~5줄'),
  timeline: z
    .array(
      z.object({
        date: z.string().catch(''),
        event: z.string().catch(''),
        impact: z.enum(['positive', 'negative', 'neutral', 'mixed']).catch('neutral'),
        description: z.string().catch(''),
      }),
    )
    .default([])
    .describe('주요 이벤트 타임라인'),
  inflectionPoints: z
    .array(
      z.object({
        date: z.string().catch(''),
        description: z.string().catch(''),
        beforeSentiment: z.enum(['positive', 'negative', 'neutral']).catch('neutral'),
        afterSentiment: z.enum(['positive', 'negative', 'neutral']).catch('neutral'),
      }),
    )
    .default([])
    .describe('여론 변곡점'),
  dailyMentionTrend: z
    .array(
      z.object({
        date: z.string().catch(''),
        count: z.number().catch(0),
        sentimentRatio: z
          .object({
            positive: z.number().catch(0),
            negative: z.number().catch(0),
            neutral: z.number().catch(0),
          })
          .catch({ positive: 0, negative: 0, neutral: 0 }),
      }),
    )
    .default([])
    .describe('일별 언급량 및 감성 추이'),
});

export type MacroViewResult = z.infer<typeof MacroViewSchema>;
