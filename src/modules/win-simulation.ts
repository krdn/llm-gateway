import { WinSimulationSchema, type WinSimulationResult } from '../schemas/win-simulation.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, PROBABILITY_ANCHOR, distillForWinSimulation } from './prompt-utils';

const config = MODULE_MODEL_MAP['win-simulation'];

// ADVN-04: 승리 확률 시뮬레이션 모듈
// 모든 선행 결과(Stage 1~3 + ADVN-01~03)를 종합하여 승리/패배 조건과 핵심 전략 도출
export const winSimulationModule: AnalysisModule<WinSimulationResult> = {
  name: 'win-simulation',
  displayName: '승리 확률 시뮬레이션',
  provider: config.provider,
  model: config.model,
  schema: WinSimulationSchema,

  buildSystemPrompt(): string {
    return `당신은 선거/여론 전략 시뮬레이션 전문가입니다.
11개 선행 분석 결과를 종합하여 **승리 확률, 승패 조건, 핵심 전략**을 도출합니다.

## 시뮬레이션 프레임워크

### winProbability 산출 근거
- approval-rating의 지지율 범위를 기반선으로 사용
- 리스크(risk-map) 현실화 가능성을 감점 요인으로 반영
- 기회(opportunity) 활용 가능성을 가점 요인으로 반영
- 프레임 전쟁(frame-war)에서 우세/열세를 반영
- 위기 시나리오(crisis-scenario)의 확산 확률을 리스크 가중치로 반영

### 승리 조건 도출 규칙
- 각 조건의 currentStatus는 데이터 근거를 기반으로 판단
  - met: 이미 충족된 조건 (데이터에서 확인 가능)
  - partial: 부분적으로 충족 (일부 플랫폼/집단에서만)
  - unmet: 아직 미충족 (향후 충족해야 함)
- importance는 "이 조건이 미충족되면 승리가 불가능한가?"로 판단

### 패배 조건 도출 규칙
- 각 조건의 currentRisk는 crisis-scenario의 시나리오 확률과 연동
- mitigation은 strategy의 리스크 대응과 연계하되, 새로운 관점을 추가

### 핵심 전략 도출 규칙
- strategy의 기존 전략을 그대로 반복하지 말고, 시뮬레이션 결과를 반영하여 우선순위를 재배치
- expectedImpact는 정량적 표현 (예: "Swing 5%p 전환", "지지율 2~3%p 상승 기대")

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

## 시뮬레이션 절차 (반드시 이 순서로 수행)

### Step 1: 기반선 설정
- 현재 지지율 추정 범위와 여론 방향성을 기반선으로 설정하세요

### Step 2: 승리 조건 도출 (3~7개)
- 승리에 필요한 핵심 조건을 도출하세요
- 각 조건의 현재 충족 상태(met/partial/unmet)를 데이터 근거로 판단하세요

### Step 3: 패배 조건 도출 (2~5개)
- 패배로 이어질 수 있는 조건을 도출하세요
- 각 조건의 현재 리스크 수준과 완화 방안을 기술하세요

### Step 4: 승리 확률 산출
- Step 1~3을 종합하여 승리 확률(0~100%)을 산출하세요
- confidenceLevel을 판단하세요

### Step 5: 핵심 전략 도출 (3~5개)
- 승리 확률을 높이기 위한 핵심 전략을 우선순위 순으로 제시하세요
- 각 전략의 기대 효과를 정량적으로 표현하세요

### Step 6: 종합 요약
- simulationSummary에 전체 시뮬레이션 결과를 3~5줄로 요약하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForWinSimulation(priorResults);

    return `${basePrompt}

## 전체 선행 분석 핵심 요약
${distilledContext}

위 분석 결과를 종합하여 시뮬레이션을 수행하세요.
선행 전략(strategy)을 그대로 반복하지 말고, 시뮬레이션 결과에 기반한 새로운 우선순위를 제시하세요.`;
  },
};
