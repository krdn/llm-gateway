import { z } from 'zod';

// 개별 시나리오 공통 필드
const scenarioBase = {
  name: z.string().catch(''),
  probability: z.number().catch(0).describe('발생 확률 0~100'),
  triggerConditions: z.array(z.string()).default([]),
  expectedOutcome: z.string().catch(''),
  responseStrategy: z.array(z.string()).default([]),
  timeframe: z.string().catch(''),
};

// ADVN-03: 위기 대응 시나리오 스키마
// 3개 시나리오: spread(확산/worst), control(통제/moderate), reverse(역전/best)
const scenarioSchema = z.object({
  type: z.enum(['spread', 'control', 'reverse']).catch('control'),
  ...scenarioBase,
});

export const CrisisScenarioSchema = z.object({
  scenarios: z
    .array(scenarioSchema)
    .default([])
    .describe('정확히 3개 시나리오: spread, control, reverse'),
  currentRiskLevel: z.enum(['critical', 'high', 'medium', 'low']).describe('현재 위기 수준'),
  recommendedAction: z.string().catch(''),
});

export type CrisisScenarioResult = z.infer<typeof CrisisScenarioSchema>;
