import { RiskMapSchema, type RiskMapResult } from '../schemas/risk-map.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, distillForRiskMap } from './prompt-utils';

const config = MODULE_MODEL_MAP['risk-map'];

// 모듈5: 리스크 맵 분석 (DEEP-03)
// Stage 1 결과를 참조하여 Top 3~5 리스크와 영향도/확산 가능성을 분석한다
export const riskMapModule: AnalysisModule<RiskMapResult> = {
  name: 'risk-map',
  displayName: '리스크 맵 분석',
  provider: config.provider,
  model: config.model,
  schema: RiskMapSchema,

  buildSystemPrompt(): string {
    return `당신은 정치 리스크 분석 및 위기 예측 전문가입니다.
여론 데이터에서 **현재 잠재된 리스크와 향후 폭발 가능성**을 도출합니다.

## 리스크 평가 프레임워크

각 리스크를 다음 4가지 차원으로 평가하세요:

1. **발화점(Ignition)**: 최초 이슈가 어디서 제기되었는가? 미디어 증폭 경로는?
2. **확산력(Virality)**: 플랫폼 교차 확산 가능성. 단일 플랫폼 vs 멀티 플랫폼 리스크
3. **지속성(Duration)**: 뉴스 사이클 내 생존 기간 예측. 일회성 vs 구조적 문제
4. **피해 범위(Blast Radius)**: 어떤 집단(Core/Opposition/Swing)에 파급되는가?

## spreadProbability 기준
- 0.8~1.0: 이미 확산 중이거나 트리거 조건이 임박
- 0.5~0.7: 특정 이벤트 발생 시 높은 확률로 확산
- 0.3~0.4: 잠재적 리스크이나 현재 확산 동력 부족
- 0.0~0.2: 이론적 가능성만 존재
${ANALYSIS_CONSTRAINTS}`;
  },

  buildPrompt(data: AnalysisInput): string {
    const articlesSummary = data.articles
      .slice(0, 20)
      .map((a) => `- [${a.publisher ?? '알 수 없음'}] ${a.title}`)
      .join('\n');
    const commentsSample = data.comments
      .slice(0, 30)
      .map((c) => `- ${c.content.slice(0, 100)}`)
      .join('\n');

    return `키워드: "${data.keyword}"
분석 기간: ${data.dateRange.start.toISOString().split('T')[0]} ~ ${data.dateRange.end.toISOString().split('T')[0]}

## 주요 기사 (${data.articles.length}건 중 상위 20건)
${articlesSummary}

## 대표 댓글 (${data.comments.length}건 중 상위 30건)
${commentsSample}

## 분석 절차 (반드시 이 순서로 수행)

### Step 1: 부정 신호 수집
- 기사 제목과 댓글에서 부정적 반응이 집중된 토픽을 식별하세요
- 각 토픽의 부정 감정 강도와 빈도를 파악하세요

### Step 2: 리스크 후보 도출
- 부정 신호가 강한 토픽을 리스크 후보로 선정하세요 (5~7개)
- 각 후보의 발화점, 확산력, 지속성, 피해 범위를 평가하세요

### Step 3: 리스크 순위화
- 영향도(impactLevel)와 확산 가능성(spreadProbability)을 기준으로 Top 3~5를 선정하세요
- 각 리스크의 트리거 조건(어떤 이벤트가 발생하면 현실화되는지)을 구체적으로 기술하세요

### Step 4: 전체 리스크 수준 판단
- overallRiskLevel과 riskTrend를 종합 판단하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForRiskMap(priorResults);

    return `${basePrompt}

## 선행 분석 핵심 요약 (Stage 1)
${distilledContext}

위 선행 분석의 부정 프레임, 실패 메시지, 여론 변곡점을 리스크 후보의 근거로 활용하세요.
선행 결과를 그대로 재기술하지 말고, 리스크 관점에서 재해석하세요.`;
  },
};
