import { ApprovalRatingSchema, type ApprovalRatingResult } from '../schemas/approval-rating.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, distillForApprovalRating } from './prompt-utils';

const config = MODULE_MODEL_MAP['approval-rating'];

// ADVN-01: AI 지지율 추정 모듈
// 감정 비율과 플랫폼 편향을 보정하여 범위(range)로 산출한다
export const approvalRatingModule: AnalysisModule<ApprovalRatingResult> = {
  name: 'approval-rating',
  displayName: 'AI 지지율 추정',
  provider: config.provider,
  model: config.model,
  schema: ApprovalRatingSchema,

  buildSystemPrompt(): string {
    return `당신은 온라인 여론 데이터 기반 지지율 추정 전문가입니다.
댓글·기사·영상 데이터에서 **플랫폼별 편향을 보정하여** AI 기반 지지율 범위를 추정합니다.

## 핵심 원칙
1. **반드시 범위(min~max)**로 표현. 단일 수치 절대 금지
2. 온라인 여론은 실제 여론의 **일부 표본**임을 인지. 과대 해석 금지
3. 면책 문구 필수: "이 추정치는 AI 분석 기반 참고용이며, 과학적 여론조사를 대체하지 않습니다"

## 플랫폼별 편향 보정 가이드라인
| 플랫폼 | 편향 방향 | 보정 방법 |
|--------|----------|----------|
| 네이버 뉴스 댓글 | 보수 우세 (40~60대 과대표) | 부정 비율을 0.7~0.85배로 보정 |
| 유튜브 댓글 | 채널별 극심 | 채널 성향별 가중치 차등 적용 |
| DC인사이드 | 이슈별 상이 | 풍자·비꼼 표현을 감정 분류 시 주의 |
| 클리앙 | 진보 우세 | 긍정 비율을 0.8~0.9배로 보정 |
| FM코리아 | 다양 | 유머 맥락 고려, 감정 분류 주의 |

## confidence 판단 기준
- **high**: 플랫폼 3개 이상, 댓글 100건 이상, 감정 분포 일관
- **medium**: 플랫폼 2개, 댓글 50~100건, 또는 플랫폼 간 감정 편차 존재
- **low**: 단일 플랫폼, 댓글 50건 미만, 또는 플랫폼 간 감정 극단적 불일치
${ANALYSIS_CONSTRAINTS}`;
  },

  buildPrompt(data: AnalysisInput): string {
    const articlesSummary = data.articles
      .slice(0, 20)
      .map((a) => `- [${a.publisher ?? '알 수 없음'}] ${a.title}`)
      .join('\n');
    const commentsSample = data.comments
      .slice(0, 30)
      .map((c) => `- [${c.source}] ${c.content.slice(0, 100)}`)
      .join('\n');

    const platformDist: Record<string, number> = {};
    for (const c of data.comments) {
      platformDist[c.source] = (platformDist[c.source] ?? 0) + 1;
    }
    const platformSummary = Object.entries(platformDist)
      .map(([src, cnt]) => `${src}: ${cnt}건`)
      .join(', ');

    return `키워드: "${data.keyword}"
분석 기간: ${data.dateRange.start.toISOString().split('T')[0]} ~ ${data.dateRange.end.toISOString().split('T')[0]}

## 주요 기사 (${data.articles.length}건 중 상위 20건)
${articlesSummary}

## 대표 댓글 (${data.comments.length}건 중 상위 30건)
${commentsSample}

## 플랫폼별 데이터 분포
${platformSummary}

## 추정 절차 (반드시 이 순서로 수행)

### Step 1: 플랫폼별 원시 감정 비율 산출
- 각 플랫폼의 댓글에서 긍정/중립/부정 비율을 산출하세요

### Step 2: 편향 보정
- 위 시스템 프롬프트의 편향 보정 가이드라인에 따라 각 플랫폼의 비율을 보정하세요
- 보정 전후 수치를 모두 methodology에 기록하세요

### Step 3: 가중 통합
- 플랫폼별 댓글 수를 가중치로 하여 전체 감정 비율을 통합하세요
- spreadFactor(확산 계수)를 반영하세요

### Step 4: 범위 산출
- 보정된 긍정 비율을 기반으로 추정 범위(min~max)를 산출하세요
- confidence 수준에 따라 범위 폭을 조정하세요 (high=±3%p, medium=±5%p, low=±8%p)
- 면책 문구를 반드시 포함하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForApprovalRating(priorResults);

    return `${basePrompt}

## 선행 분석 핵심 요약
${distilledContext}

위 선행 분석의 감정 비율과 집단별 반응을 보정 요인으로 활용하세요.
선행 결과를 그대로 재기술하지 말고, 지지율 추정의 근거로만 활용하세요.`;
  },
};
