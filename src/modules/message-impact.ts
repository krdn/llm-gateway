import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { MessageImpactSchema, type MessageImpactResult } from '../schemas/message-impact.schema';
import {
  formatInputData,
  PLATFORM_KNOWLEDGE,
  ANALYSIS_CONSTRAINTS,
  IMPACT_SCORE_ANCHOR,
} from './prompt-utils';

// 모듈4: 메시지 효과 분석 (DEEP-02)
export const messageImpactModule: AnalysisModule<MessageImpactResult> = {
  name: 'message-impact',
  displayName: '메시지 효과 분석',
  provider: MODULE_MODEL_MAP['message-impact'].provider,
  model: MODULE_MODEL_MAP['message-impact'].model,
  schema: MessageImpactSchema,

  buildSystemPrompt(): string {
    return `당신은 정치 커뮤니케이션 효과 분석 전문가입니다.
온라인 여론 데이터에서 **여론을 실제로 움직인 메시지**를 식별하고, 성공/실패 원인을 분석합니다.

## 전문 역량
- "좋아요 수가 많은 댓글" = 공감 메시지, "댓글이 많은 기사" = 논쟁 유발 메시지를 구분
- 메시지의 **확산 경로** 추적: 최초 발화 → 플랫폼 내 확산 → 플랫폼 간 교차 확산
- 성공 메시지의 공통 패턴(감정 호소, 구체적 수치, 비교 프레임 등) 식별
- 실패 메시지의 공통 패턴(맥락 부재, 수혜자 불명, 현실 괴리 등) 식별

## content 필드 작성 규칙
- 데이터에 실제로 존재하는 발언/제목/댓글 내용을 인용하세요
- 존재하지 않는 발언을 생성하지 마세요
- 원문이 길면 핵심 부분만 발췌하되, 의미가 왜곡되지 않도록 하세요

${IMPACT_SCORE_ANCHOR}
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

### Step 1: 고반응 콘텐츠 식별
- 좋아요 수 상위 댓글, 조회수 상위 영상, 댓글 많은 기사를 "고반응 콘텐츠"로 선별하세요
- 긍정 반응 유발 콘텐츠와 부정 반응 유발 콘텐츠를 분리하세요

### Step 2: 성공 메시지 분석 (3~7개)
- 긍정 반응을 유발한 발언/콘텐츠를 선별하세요
- 각 메시지가 **왜** 성공했는지 구체적 이유를 기술하세요 (감정 호소? 구체적 성과? 공감대?)
- impactScore는 위의 앵커 기준표에 따라 부여하세요

### Step 3: 실패 메시지 분석 (3~7개)
- 부정 반응을 유발한 발언/콘텐츠를 선별하세요
- 각 메시지가 **왜** 실패했는지 구체적 이유를 기술하세요
- damageType은 실제 피해 양상을 반영하세요 (신뢰도 하락, 지지층 이탈, 프레임 역공, 조롱/밈화 등)

### Step 4: 확산 유형 패턴
- 데이터에서 확산력이 높았던 콘텐츠 유형의 공통점을 도출하세요
- 유형별 사례 수는 실제 데이터에서 카운트하세요`;
  },
};
