import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { SegmentationSchema, type SegmentationResult } from '../schemas/segmentation.schema';
import { formatInputData, PLATFORM_KNOWLEDGE, ANALYSIS_CONSTRAINTS } from './prompt-utils';

// 모듈2: 집단별 반응 분석 (ANLZ-04)
export const segmentationModule: AnalysisModule<SegmentationResult> = {
  name: 'segmentation',
  displayName: '집단별 반응 분석',
  provider: MODULE_MODEL_MAP['segmentation'].provider,
  model: MODULE_MODEL_MAP['segmentation'].model,
  schema: SegmentationSchema,

  buildSystemPrompt(): string {
    return `당신은 정치 여론의 집단 역학(group dynamics) 분석 전문가입니다.
온라인 여론 데이터에서 **누가, 어떤 플랫폼에서, 어떤 반응**을 보이는지 세분화합니다.

## 전문 역량
- 플랫폼별 사용자 특성을 감안한 데이터 해석 (네이버 댓글 ≠ 클리앙 댓글)
- Core(핵심 지지층) / Opposition(반대층) / Swing(유동층) 삼분법으로 집단 구조 파악
- 각 집단의 규모·결집력·이탈 가능성을 종합한 영향력 평가
- 댓글 어투·용어·좋아요 패턴에서 집단 특성을 추론

## Core/Opposition/Swing 판별 기준
- **Core**: 일관되게 옹호/지지하는 댓글, 출처 불문 긍정 반응, 반론에도 입장 유지
- **Opposition**: 일관되게 비판/반대하는 댓글, 부정 프레임 적극 확산, 대안 제시
- **Swing**: 이슈에 따라 입장 변동, 조건부 지지/반대, "~하면 좋겠는데" 형태의 유보적 표현
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

### Step 1: 플랫폼별 분리
- 각 플랫폼(naver, youtube, clien, fmkorea, dcinside)의 댓글을 분리하세요
- 플랫폼별 전체 감정 기조(긍정/부정/중립 비율)를 1차 판단하세요

### Step 2: 집단 식별
- 댓글 내용·어투·좋아요 패턴에서 Core/Opposition/Swing 집단을 식별하세요
- 각 집단의 대표적 표현 패턴과 관심 주제를 정리하세요

### Step 3: 집단별 영향력 평가
- 각 집단의 추정 규모(댓글 비율), 결집력(의견 일관성), 확산력(좋아요·공유 수)을 평가하세요
- 영향력은 "규모 × 결집력 × 확산력"을 종합 고려하여 high/medium/low로 판단하세요

### Step 4: 전략적 인사이트
- Swing 집단의 이탈 조건과 포섭 가능성을 구체적으로 기술하세요
- 가장 영향력 높은 집단이 전체 여론에 미치는 영향을 설명하세요`;
  },
};
