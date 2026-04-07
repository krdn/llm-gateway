import { OpportunitySchema, type OpportunityResult } from '../schemas/opportunity.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, distillForOpportunity } from './prompt-utils';

const config = MODULE_MODEL_MAP['opportunity'];

// 모듈6: 기회 분석 (DEEP-04)
// 긍정 요소와 미활용 영역을 분석하여 확장 기회를 도출한다
export const opportunityModule: AnalysisModule<OpportunityResult> = {
  name: 'opportunity',
  displayName: '기회 요소 분석',
  provider: config.provider,
  model: config.model,
  schema: OpportunitySchema,

  buildSystemPrompt(): string {
    return `당신은 여론 기반 기회 발굴 및 전략적 자산 분석 전문가입니다.
부정적 여론 속에서도 **활용 가능한 긍정 자산과 미개발 영역**을 식별합니다.

## 기회 평가 프레임워크

1. **현재 자산(Current Assets)**: 이미 긍정 반응을 얻고 있지만 충분히 활용되지 않는 요소
2. **미개발 영역(Untapped Areas)**: 아직 다루지 않았지만 잠재적 호응이 예상되는 영역
3. **전환 기회(Conversion Opportunities)**: Swing 집단을 우호적으로 전환할 수 있는 접점

## currentUtilization 판단 기준
- **fully**: 이미 적극 활용 중 (추가 확장 여지 제한적)
- **partially**: 활용하고 있으나 일부 플랫폼/집단에서만 효과 (확장 가능)
- **unused**: 긍정 잠재력이 있으나 전혀 활용하지 않고 있음 (즉시 활용 권장)
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

### Step 1: 긍정 신호 수집
- 기사와 댓글에서 긍정적 반응이 집중된 토픽을 식별하세요
- 좋아요 수가 높은 긍정 댓글의 공통 주제를 파악하세요

### Step 2: 현재 자산 평가
- 이미 긍정 반응을 얻고 있는 요소를 정리하고, 현재 활용 수준을 평가하세요
- 확장 가능성(expandability)을 high/medium/low로 판단하세요

### Step 3: 미개발 영역 탐색
- 데이터에서 관심은 있지만 아직 충분히 어필하지 못한 영역을 찾으세요
- 각 영역의 잠재력과 접근 방법을 제안하세요

### Step 4: 최우선 기회 선정
- 위 분석을 종합하여 가장 ROI가 높은 기회 1개를 선정하고 구체적 실행 계획을 제시하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForOpportunity(priorResults);

    return `${basePrompt}

## 선행 분석 핵심 요약 (Stage 1)
${distilledContext}

위 선행 분석의 긍정 프레임, 성공 메시지, 우호 집단을 기회 탐색의 출발점으로 활용하세요.
선행 결과를 그대로 재기술하지 말고, 기회 관점에서 재해석하세요.`;
  },
};
