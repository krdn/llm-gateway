// @krdn/llm-gateway v3.0.0 — public API barrel
//
// v1.x → v2.0.0 BREAKING: 정치 여론 도메인 모듈(12개)·스키마·Stage 상수·AnalysisInput은
// 소비자 프로젝트(ai-signalcraft)로 이전되었다. 본 패키지는 AI 프로바이더 게이트웨이,
// 도메인 무관 모듈 러너, 어댑터 인터페이스만 제공한다.
export * from './types';
export * from './gateway';
export * from './adapters';
export * from './runner';
