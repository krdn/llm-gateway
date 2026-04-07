import { FrameWarSchema, type FrameWarResult } from '../schemas/frame-war.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, FRAME_STRENGTH_ANCHOR, distillForFrameWar } from './prompt-utils';

const config = MODULE_MODEL_MAP['frame-war'];

// ADVN-02: 프레임 전쟁 분석 모듈
// sentiment-framing 결과를 참조하여 프레임 간 충돌/지배 구조를 분석한다
export const frameWarModule: AnalysisModule<FrameWarResult> = {
  name: 'frame-war',
  displayName: '프레임 전쟁 분석',
  provider: config.provider,
  model: config.model,
  schema: FrameWarSchema,

  buildSystemPrompt(): string {
    return `당신은 미디어 프레임 전쟁(frame war) 및 담론 역학 전문가입니다.
선행 분석(sentiment-framing)에서 식별된 프레임을 출발점으로, **프레임 간 세력 역학과 전략적 전장 구조**를 심층 분석합니다.

## 핵심 원칙 — sentiment-framing과의 차별화
- sentiment-framing이 "어떤 프레임이 있는가"를 식별했다면, 이 모듈은 "프레임 간 힘의 관계"를 분석합니다
- sentiment-framing에서 이미 식별한 프레임 목록을 그대로 반복하지 마세요
- 대신 다음을 추가로 분석하세요:
  1. **세력 역학**: 어떤 프레임이 다른 프레임을 약화/강화시키는가
  2. **시간 추이**: 프레임 강도가 상승/하락 중인가
  3. **플랫폼 격차**: 같은 프레임이 플랫폼별로 다른 강도를 갖는가
  4. **반전 가능성**: 약세 프레임이 특정 이벤트로 우세로 전환될 조건

## 프레임 3분류
- **지배적(dominant)**: 현재 여론을 주도. 다수가 이 관점으로 이야기함
- **위협적(threatening)**: 지배 프레임에 도전 중. 확산 시 여론 판도 변경 가능
- **반전 가능(reversible)**: 현재 약세이나, 특정 조건 충족 시 급반전 가능

${FRAME_STRENGTH_ANCHOR}
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

### Step 1: 프레임 세력 지도 구성
- 데이터에서 작동 중인 프레임을 식별하고, 각 프레임의 강도(0~100)를 앵커 기준에 따라 평가하세요

### Step 2: 세력 역학 분석
- 프레임 간 상호 작용을 분석하세요 (강화 관계, 약화 관계, 독립 관계)
- 어떤 프레임이 어떤 프레임을 밀어내고 있는지 기술하세요

### Step 3: 위협 프레임 식별
- 현재 지배 프레임을 위협하는 도전 프레임을 식별하세요
- 각 위협 프레임의 위협 수준과 구체적 대응 전략을 제시하세요

### Step 4: 반전 기회 탐색
- 현재 약세이나 잠재적 반전이 가능한 프레임을 식별하세요 (최대 3개)
- 반전을 위한 필요 조건과 행동을 구체적으로 제시하세요

### Step 5: 전장 종합
- battlefieldSummary에 프레임 전장의 전체 구도를 3~5줄로 요약하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForFrameWar(priorResults);

    return `${basePrompt}

## 선행 분석 핵심 요약
${distilledContext}

**중요**: sentiment-framing에서 이미 식별한 프레임 목록을 그대로 반복하지 마세요.
대신 프레임 간 **세력 역학, 시간 추이, 플랫폼 격차, 반전 가능성**을 심층 분석하세요.
성공/실패 메시지가 어떤 프레임을 강화/약화했는지도 분석하세요.`;
  },
};
