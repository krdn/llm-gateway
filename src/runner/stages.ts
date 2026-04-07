// Stage 상수 — 12개 모듈을 ai-signalcraft 파이프라인 그룹별로 export
import {
  macroViewModule,
  segmentationModule,
  sentimentFramingModule,
  messageImpactModule,
  riskMapModule,
  opportunityModule,
  strategyModule,
  finalSummaryModule,
  approvalRatingModule,
  frameWarModule,
  crisisScenarioModule,
  winSimulationModule,
} from '../modules';
import type { AnalysisModule } from '../types';

// Stage 1: 병렬 실행 (독립 모듈)
export const STAGE1_MODULES: AnalysisModule[] = [
  macroViewModule,
  segmentationModule,
  sentimentFramingModule,
  messageImpactModule,
];

// Stage 2: 병렬 가능 (Stage 1 결과 의존)
export const STAGE2_MODULES: AnalysisModule[] = [
  riskMapModule,
  opportunityModule,
  strategyModule,
];

// Stage 3: 최종 요약
export const STAGE3_MODULES: AnalysisModule[] = [finalSummaryModule];

// Stage 4: 고급 분석 (ADVN 모듈)
export const STAGE4_PARALLEL: AnalysisModule[] = [approvalRatingModule, frameWarModule];
export const STAGE4_SEQUENTIAL: AnalysisModule[] = [
  crisisScenarioModule,
  winSimulationModule,
];

export const ALL_MODULES: AnalysisModule[] = [
  ...STAGE1_MODULES,
  ...STAGE2_MODULES,
  ...STAGE3_MODULES,
  ...STAGE4_PARALLEL,
  ...STAGE4_SEQUENTIAL,
];

export function getModuleByName(name: string): AnalysisModule | undefined {
  return ALL_MODULES.find((m) => m.name === name);
}
