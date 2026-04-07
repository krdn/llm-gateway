// Stage 1 스키마
export * from './macro-view.schema';
export * from './segmentation.schema';
export * from './sentiment-framing.schema';
export * from './message-impact.schema';

// Stage 2 스키마
export { RiskMapSchema, type RiskMapResult } from './risk-map.schema';
export { OpportunitySchema, type OpportunityResult } from './opportunity.schema';
export { StrategySchema, type StrategyResult } from './strategy.schema';
export { FinalSummarySchema, type FinalSummaryResult } from './final-summary.schema';

// Stage 4 스키마 (ADVN 고급 분석)
export { ApprovalRatingSchema, type ApprovalRatingResult } from './approval-rating.schema';
export { FrameWarSchema, type FrameWarResult } from './frame-war.schema';
export { CrisisScenarioSchema, type CrisisScenarioResult } from './crisis-scenario.schema';
export { WinSimulationSchema, type WinSimulationResult } from './win-simulation.schema';
