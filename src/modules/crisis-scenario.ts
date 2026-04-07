import { CrisisScenarioSchema, type CrisisScenarioResult } from '../schemas/crisis-scenario.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, PROBABILITY_ANCHOR, distillForCrisisScenario } from './prompt-utils';

const config = MODULE_MODEL_MAP['crisis-scenario'];

// ADVN-03: 위기 대응 시나리오 모듈
// risk-map + ADVN-01(approval-rating) 결과를 참조하여 3개 시나리오 생성
export const crisisScenarioModule: AnalysisModule<CrisisScenarioResult> = {
  name: 'crisis-scenario',
  displayName: '위기 대응 시나리오',
  provider: config.provider,
  model: config.model,
  schema: CrisisScenarioSchema,

  buildSystemPrompt(): string {
    return `당신은 정치 위기 관리 및 시나리오 플래닝 전문가입니다.
리스크 분석과 지지율 추정을 기반으로 **3가지 시나리오(확산/통제/역전)**를 구체적으로 시뮬레이션합니다.

## 시나리오 유형 (정확히 3개, 순서 고정)

1. **spread** (확산 - worst case): 현재 리스크가 통제 불능으로 확대되는 시나리오
2. **control** (통제 - moderate case): 리스크를 현 수준에서 봉쇄·관리하는 시나리오
3. **reverse** (역전 - best case): 위기를 기회로 전환하여 여론 반전에 성공하는 시나리오

## 핵심 원칙 — risk-map과의 차별화
- risk-map에서 이미 식별한 리스크 목록을 재기술하지 마세요
- 대신 "리스크가 현실화되면 어떤 경로로 전개되는가"를 시나리오로 전개하세요
- 각 시나리오의 트리거 → 전개 경로 → 결과를 인과적으로 서술하세요

## 시나리오 품질 기준
- triggerConditions: 구체적 이벤트 (예: "주요 언론 1면 보도", "야당 국정조사 요구" 등)
- expectedOutcome: 정량적 결과 포함 (예: "지지율 3~5%p 하락", "Swing 집단 이탈 가속")
- responseStrategy: "누가, 무엇을, 언제까지" 수준의 실행 계획
- timeframe: 구체적 기간 (예: "48시간 내", "1주", "2~4주")

${PROBABILITY_ANCHOR}
${ANALYSIS_CONSTRAINTS}`;
  },

  buildPrompt(data: AnalysisInput): string {
    const articlesSummary = data.articles
      .slice(0, 15)
      .map((a) => `- [${a.publisher ?? '알 수 없음'}] ${a.title}`)
      .join('\n');
    const commentsSample = data.comments
      .slice(0, 20)
      .map((c) => `- ${c.content.slice(0, 100)}`)
      .join('\n');

    return `키워드: "${data.keyword}"
분석 기간: ${data.dateRange.start.toISOString().split('T')[0]} ~ ${data.dateRange.end.toISOString().split('T')[0]}

## 주요 기사 (${data.articles.length}건 중 상위 15건)
${articlesSummary}

## 대표 댓글 (${data.comments.length}건 중 상위 20건)
${commentsSample}

## 시나리오 구성 절차 (반드시 이 순서로 수행)

### Step 1: 현재 위기 수준 진단
- 현재 상황이 위기의 어느 단계에 있는지 판단하세요 (잠복기/발화기/확산기/수습기)

### Step 2: Spread 시나리오 (worst case)
- 가장 위험한 리스크가 현실화되면 어떤 경로로 확산되는지 시뮬레이션하세요
- 트리거 → 미디어 반응 → 여론 변화 → 결과의 인과 체인을 기술하세요

### Step 3: Control 시나리오 (moderate case)
- 적절한 대응으로 리스크를 현 수준에서 봉쇄하는 경로를 시뮬레이션하세요
- 어떤 대응이 필요하고, 그 결과 어떤 상태가 되는지 기술하세요

### Step 4: Reverse 시나리오 (best case)
- 위기를 기회로 전환하여 여론을 반전시키는 경로를 시뮬레이션하세요
- 반전을 위한 구체적 조건과 행동을 기술하세요

### Step 5: 종합 권장 조치
- 3개 시나리오를 종합하여 현재 가장 적합한 대응 방향을 제시하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForCrisisScenario(priorResults);

    return `${basePrompt}

## 선행 분석 핵심 요약
${distilledContext}

**중요**: risk-map의 리스크 목록을 재기술하지 마세요.
리스크가 "현실화되면 어떻게 전개되는가"를 시나리오로 전개하세요.
approval-rating의 지지율 범위를 기반선으로 삼아, 각 시나리오별 변동을 예측하세요.`;
  },
};
