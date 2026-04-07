import { FinalSummarySchema, type FinalSummaryResult } from '../schemas/final-summary.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, distillForFinalSummary } from './prompt-utils';

const config = MODULE_MODEL_MAP['final-summary'];

// 모듈8: 최종 전략 요약 (REPT-02)
// 전체 분석 결과를 종합하여 현재 상태 + 승부 핵심 한 줄 요약을 생성한다
export const finalSummaryModule: AnalysisModule<FinalSummaryResult> = {
  name: 'final-summary',
  displayName: '최종 전략 요약',
  provider: config.provider,
  model: config.model,
  schema: FinalSummarySchema,

  buildSystemPrompt(): string {
    return `당신은 정치 전략 브리핑 전문가입니다.
복잡한 분석 결과를 **의사결정자가 3분 내에 파악하고 즉시 행동**할 수 있는 형태로 압축합니다.

## oneLiner 작성 규칙
- 형식: "[현재 상태 진단] -- [승부 핵심 / 돌파구]"
- 길이: 30~50자 (한 줄에 읽히는 수준)
- 좋은 예: "지지율 하락세 속 MZ세대 이탈이 핵심 변수 -- 교육정책 어필이 돌파구"
- 좋은 예: "커뮤니티 반발 확산 중이나 40대 지지 견고 -- 경제 성과 가시화가 관건"
- 나쁜 예: "여론이 긍정적이지만 부정적인 면도 있습니다" (구체성 부족)
- 나쁜 예: "현재 상황은 복잡하며 다양한 변수가 있습니다" (내용 없음)

## criticalActions 작성 규칙
- 각 action은 "~하라" 형태의 명령문
- expectedImpact는 측정 가능한 결과 (예: "Swing 집단 10%p 전환 기대")
- timeline은 구체적 (예: "3일 이내", "1주 내", "2주 내")
- 추상적 제안 금지: "소통 강화" (X) → "유튜브 라이브 Q&A 주 1회 실시" (O)
${ANALYSIS_CONSTRAINTS}`;
  },

  buildPrompt(data: AnalysisInput): string {
    const articlesSummary = data.articles
      .slice(0, 10)
      .map((a) => `- [${a.publisher ?? '알 수 없음'}] ${a.title}`)
      .join('\n');

    return `키워드: "${data.keyword}"
분석 기간: ${data.dateRange.start.toISOString().split('T')[0]} ~ ${data.dateRange.end.toISOString().split('T')[0]}
기사 수: ${data.articles.length}건 | 댓글 수: ${data.comments.length}건 | 영상 수: ${data.videos.length}건

## 주요 기사 (상위 10건)
${articlesSummary}

## 작성 절차 (반드시 이 순서로 수행)

### Step 1: 핵심 발견 추출
- 전체 분석에서 의사결정에 영향을 미치는 핵심 발견 3개를 선별하세요

### Step 2: oneLiner 작성
- 핵심 발견을 종합하여 "[현재 상태] -- [승부 핵심]" 형식의 한 줄 요약을 작성하세요

### Step 3: 실행 과제 도출
- 즉시 실행해야 할 과제를 우선순위 순으로 3~5개 도출하세요
- 각 과제의 기대 효과와 실행 시한을 명시하세요

### Step 4: 전망 정리
- 단기(1~2주)와 중기(1~3개월) 전망을 작성하세요
- 전망의 핵심 변수(keyVariable)를 명시하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForFinalSummary(priorResults);

    return `${basePrompt}

## 전체 분석 핵심 요약 (Stage 1 + Stage 2)
${distilledContext}

위 분석 결과를 종합하여 최종 전략 요약을 작성하세요.
선행 분석 내용을 재기술하지 말고, 의사결정자 관점에서 압축·재구성하세요.`;
  },
};
