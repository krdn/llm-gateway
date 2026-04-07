import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { MacroViewSchema, type MacroViewResult } from '../schemas/macro-view.schema';
import { formatInputData, PLATFORM_KNOWLEDGE, ANALYSIS_CONSTRAINTS } from './prompt-utils';

// 모듈1: 전체 여론 구조 분석 (ANLZ-01, ANLZ-03)
export const macroViewModule: AnalysisModule<MacroViewResult> = {
  name: 'macro-view',
  displayName: '전체 여론 구조 분석',
  provider: MODULE_MODEL_MAP['macro-view'].provider,
  model: MODULE_MODEL_MAP['macro-view'].model,
  schema: MacroViewSchema,

  buildSystemPrompt(): string {
    return `당신은 15년 경력의 정치 여론 동향 분석가입니다.
한국 온라인 여론 데이터(뉴스, 유튜브, 커뮤니티 댓글)를 종합하여 **시간축 기반 여론 구조**를 파악합니다.

## 전문 역량
- 일별/주별 여론 흐름의 변곡점(inflection point)을 정확히 포착
- 이벤트-반응 간 인과관계를 추론하여 타임라인 구성
- 플랫폼별 데이터 편향을 보정한 종합 방향성 판단
- 단순 감정 집계가 아닌, 여론의 **구조적 흐름**(상승→정체→반전 등)을 서사로 구성
${PLATFORM_KNOWLEDGE}
${ANALYSIS_CONSTRAINTS}`;
  },

  buildPrompt(data: AnalysisInput): string {
    const { articles, videos, comments, dateRange } = formatInputData(data);

    return `## 분석 대상: "${data.keyword}"
## 분석 기간: ${dateRange}

### 뉴스 기사 (${articles.length}건)
${articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}\n   ${a.content}`).join('\n')}

### 영상 (${videos.length}건)
${videos.map((v, i) => `${i + 1}. [${v.channel}] ${v.title} (조회수: ${v.viewCount}, 좋아요: ${v.likeCount})`).join('\n')}

### 댓글 (${comments.length}건)
${comments.map((c, i) => `${i + 1}. [${c.source}] ${c.content} (좋아요: ${c.likeCount})`).join('\n')}

## 분석 절차 (반드시 이 순서로 수행)

### Step 1: 시간축 스캔
- 기사 발행일과 댓글 작성일을 기준으로 일별 언급량을 집계하세요
- 언급량이 급증(전일 대비 2배 이상)하거나 급감한 날짜를 표시하세요

### Step 2: 이벤트-반응 매핑
- 급증/급감 시점에 어떤 기사·발언·사건이 있었는지 식별하세요
- "이벤트 → 플랫폼별 반응 → 후속 영향"의 인과 체인을 구성하세요

### Step 3: 변곡점 판별
- 감정 기조가 전환된 시점(긍정→부정, 또는 반대)을 변곡점으로 식별하세요
- 변곡점 전후의 감정 변화를 구체적으로 기술하세요 (beforeSentiment → afterSentiment)

### Step 4: 구조적 서사 구성
- 위 분석을 종합하여 전체 여론의 흐름을 3~5줄의 서사(narrative)로 요약하세요
- 단순 나열이 아닌, "A 때문에 B가 발생했고, 이로 인해 C로 전환됨" 형태의 인과적 서사를 작성하세요

### Step 5: 일별 추이 정리
- 분석 기간 내 주요 날짜별 언급량과 감정 비율(positive/negative/neutral)을 정리하세요`;
  },
};
