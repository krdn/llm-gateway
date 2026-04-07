import type { AnalysisInput } from '../types';

// 본문 최대 길이 제한 (토큰 최적화)
const MAX_CONTENT_LENGTH = 500;

// ─── 공통 프롬프트 블록 ───────────────────────────────────────────

/** 한국 온라인 여론 플랫폼 특성 — 모든 모듈의 시스템 프롬프트에 공통 삽입 */
export const PLATFORM_KNOWLEDGE = `
## 한국 온라인 여론 플랫폼 특성 (분석 시 반드시 반영)

| 플랫폼 | 주 사용층 | 정치 편향 | 확산 패턴 | 분석 시 유의점 |
|--------|----------|----------|----------|--------------|
| 네이버 뉴스 | 40~60대 | 보수 우세 | 댓글→베스트댓글→뉴스 재생산 | 댓글 좋아요 수가 여론 대표성의 핵심 지표. 베스트댓글은 전체 여론이 아닌 다수파 의견 반영 |
| 유튜브 | 전 연령 | 채널별 극심 | 알고리즘 추천→에코챔버 | 조회수·좋아요 비율보다 댓글 내용이 더 정확한 감정 지표. 정치 유튜브는 확증편향 증폭기 |
| DC인사이드 | 20~30대 남성 | 이슈별 상이 | 밈화→커뮤니티 교차→SNS 확산 | 풍자·비꼼 표현이 많아 표면적 감정과 실제 의도가 반대일 수 있음 |
| 클리앙 | 30~40대 IT직종 | 진보 우세 | 게시글→댓글토론→외부링크 공유 | IT·경제 이슈에 전문성 높음. 정치 토론 시 논리적 근거 중시 |
| FM코리아 | 20~30대 남성 | 다양 | 유머→정치 전환 빠름 | 유머 게시판에서 시작된 이슈가 정치화되는 속도가 매우 빠름 |

이 특성을 감안하여 플랫폼별 데이터를 차등 해석하세요.`;

/** 분석 금지 사항 — 모든 모듈 공통 */
export const ANALYSIS_CONSTRAINTS = `
## 분석 금지 사항 (반드시 준수)

1. **중간값 편향 금지**: 모든 점수를 5/10, 50% 등 안전한 중간값으로 부여하지 마세요. 데이터가 극단적이면 극단적 점수를 부여하세요.
2. **균형 편향 금지**: 긍정과 부정을 인위적으로 반반 나누지 마세요. 데이터가 부정 80%이면 그대로 반영하세요.
3. **패딩 금지**: 같은 내용을 다른 표현으로 반복하여 항목 수를 채우지 마세요. 의미 있는 차이가 있는 항목만 포함하세요.
4. **근거 없는 추측 금지**: "~할 수 있다", "~가능성이 있다" 등의 표현은 데이터 근거를 반드시 명시하세요.
5. **선행 결과 재기술 금지**: 이전 분석 결과를 그대로 옮겨쓰지 마세요. 새로운 관점의 심화·확장만 허용합니다.

반드시 한국어로 응답하세요.`;

/** impactScore / negativeScore 앵커 (1~10) — message-impact 등에서 사용 */
export const IMPACT_SCORE_ANCHOR = `
## impactScore / negativeScore 기준 (1~10)

| 점수 | 기준 | 사례 예시 |
|------|------|----------|
| 9~10 | 전 플랫폼 동시 확산, 뉴스 사이클 3일 이상 지속, 실검/트렌드 장기 점유 | 대통령·총리급 발언 논란, 대형 스캔들 |
| 7~8 | 2개 이상 플랫폼 교차 확산, 실검/트렌드 일시 진입, 후속 보도 다수 | 장관급 이슈, 정당 대표 발언, 주요 정책 논란 |
| 5~6 | 단일 플랫폼 내 상위 게시글, 댓글 500+ 수준의 반응 | 커뮤니티 핫글, 유튜브 인기 영상 |
| 3~4 | 일부 반응, 확산 제한적, 뉴스 1~2건 보도 | 뉴스 기사 댓글 100+, 커뮤니티 일반 게시글 |
| 1~2 | 거의 반응 없음, 확산 없음 | 보도자료 수준, 관심 없는 발언 |`;

/** 프레임 강도 앵커 (0~100) — sentiment-framing, frame-war에서 사용 */
export const FRAME_STRENGTH_ANCHOR = `
## 프레임 강도 기준 (0~100)

| 범위 | 기준 | 설명 |
|------|------|------|
| 80~100 | 지배적 프레임 | 해당 이슈를 언급할 때 대부분 이 프레임으로 이야기함. 대안 프레임이 거의 없음 |
| 60~79 | 우세 프레임 | 주요 미디어와 다수 댓글이 이 프레임을 사용하지만 반론도 존재 |
| 40~59 | 경합 프레임 | 찬반이 비등하거나 복수의 프레임이 경쟁 중 |
| 20~39 | 약세 프레임 | 소수 의견이나 특정 플랫폼에서만 통용 |
| 0~19 | 미약 프레임 | 거의 언급되지 않거나 새롭게 등장 중인 프레임 |`;

/** 확률 앵커 — crisis-scenario, win-simulation에서 사용 */
export const PROBABILITY_ANCHOR = `
## 확률 기준

| 범위 | 의미 | 판단 근거 |
|------|------|----------|
| 80~100% | 거의 확실 | 현재 추세가 명확하고, 반전 요인이 보이지 않음 |
| 60~79% | 가능성 높음 | 주요 지표가 해당 방향이지만, 변수 1~2개 존재 |
| 40~59% | 반반 | 찬반 지표가 혼재하거나 핵심 변수가 미결정 |
| 20~39% | 가능성 낮음 | 현재 추세에 반하지만, 특정 조건 충족 시 가능 |
| 0~19% | 거의 불가능 | 데이터상 근거가 거의 없음 |`;

// ─── 컨텍스트 선별 주입 (Context Distillation) ──────────────────────

type PriorResults = Record<string, unknown>;

/** 선행 결과에서 안전하게 필드를 추출 */
function extractField(results: PriorResults, module: string, ...fields: string[]): unknown {
  const moduleResult = results[module];
  if (!moduleResult || typeof moduleResult !== 'object') return undefined;

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (moduleResult as Record<string, unknown>)[field];
    if (value !== undefined) result[field] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** risk-map용: Stage 1에서 핵심 필드만 추출 */
export function distillForRiskMap(priorResults: PriorResults): string {
  const sections: string[] = [];

  const macroView = extractField(
    priorResults,
    'macro-view',
    'overallDirection',
    'summary',
    'inflectionPoints',
  );
  if (macroView)
    sections.push(`### 여론 흐름 요약 (macro-view)\n${JSON.stringify(macroView, null, 2)}`);

  const segmentation = extractField(
    priorResults,
    'segmentation',
    'audienceGroups',
    'highInfluenceGroup',
  );
  if (segmentation)
    sections.push(`### 집단 구조 (segmentation)\n${JSON.stringify(segmentation, null, 2)}`);

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'sentimentRatio',
    'negativeFrames',
    'frameConflict',
  );
  if (sentiment)
    sections.push(
      `### 부정 감정·프레임 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`,
    );

  const impact = extractField(
    priorResults,
    'message-impact',
    'failureMessages',
    'highSpreadContentTypes',
  );
  if (impact)
    sections.push(`### 실패 메시지·확산 유형 (message-impact)\n${JSON.stringify(impact, null, 2)}`);

  return sections.join('\n\n');
}

/** opportunity용: Stage 1에서 긍정 신호만 추출 */
export function distillForOpportunity(priorResults: PriorResults): string {
  const sections: string[] = [];

  const macroView = extractField(priorResults, 'macro-view', 'overallDirection', 'summary');
  if (macroView)
    sections.push(`### 여론 흐름 요약 (macro-view)\n${JSON.stringify(macroView, null, 2)}`);

  const segmentation = extractField(
    priorResults,
    'segmentation',
    'audienceGroups',
    'highInfluenceGroup',
  );
  if (segmentation)
    sections.push(`### 집단 구조 (segmentation)\n${JSON.stringify(segmentation, null, 2)}`);

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'sentimentRatio',
    'positiveFrames',
  );
  if (sentiment)
    sections.push(
      `### 긍정 감정·프레임 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`,
    );

  const impact = extractField(
    priorResults,
    'message-impact',
    'successMessages',
    'highSpreadContentTypes',
  );
  if (impact)
    sections.push(`### 성공 메시지·확산 유형 (message-impact)\n${JSON.stringify(impact, null, 2)}`);

  return sections.join('\n\n');
}

/** strategy용: Stage 1 + risk-map + opportunity 핵심 필드 */
export function distillForStrategy(priorResults: PriorResults): string {
  const sections: string[] = [];

  const macroView = extractField(priorResults, 'macro-view', 'overallDirection', 'summary');
  if (macroView) sections.push(`### 여론 방향 (macro-view)\n${JSON.stringify(macroView, null, 2)}`);

  const segmentation = extractField(
    priorResults,
    'segmentation',
    'audienceGroups',
    'highInfluenceGroup',
  );
  if (segmentation)
    sections.push(`### 핵심 집단 (segmentation)\n${JSON.stringify(segmentation, null, 2)}`);

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'sentimentRatio',
    'positiveFrames',
    'negativeFrames',
    'frameConflict',
  );
  if (sentiment)
    sections.push(`### 감정·프레임 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`);

  const impact = extractField(priorResults, 'message-impact', 'successMessages', 'failureMessages');
  if (impact) sections.push(`### 메시지 성패 (message-impact)\n${JSON.stringify(impact, null, 2)}`);

  const riskMap = extractField(priorResults, 'risk-map', 'topRisks', 'overallRiskLevel');
  if (riskMap) sections.push(`### 리스크 (risk-map)\n${JSON.stringify(riskMap, null, 2)}`);

  const opportunity = extractField(
    priorResults,
    'opportunity',
    'positiveAssets',
    'priorityOpportunity',
  );
  if (opportunity) sections.push(`### 기회 (opportunity)\n${JSON.stringify(opportunity, null, 2)}`);

  return sections.join('\n\n');
}

/** final-summary용: 전체 결과에서 핵심만 */
export function distillForFinalSummary(priorResults: PriorResults): string {
  const sections: string[] = [];

  const macroView = extractField(
    priorResults,
    'macro-view',
    'overallDirection',
    'summary',
    'inflectionPoints',
  );
  if (macroView) sections.push(`### 여론 흐름 (macro-view)\n${JSON.stringify(macroView, null, 2)}`);

  const segmentation = extractField(priorResults, 'segmentation', 'highInfluenceGroup');
  if (segmentation)
    sections.push(`### 핵심 집단 (segmentation)\n${JSON.stringify(segmentation, null, 2)}`);

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'sentimentRatio',
    'frameConflict',
  );
  if (sentiment)
    sections.push(
      `### 감정·프레임 핵심 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`,
    );

  const riskMap = extractField(
    priorResults,
    'risk-map',
    'topRisks',
    'overallRiskLevel',
    'riskTrend',
  );
  if (riskMap) sections.push(`### 리스크 (risk-map)\n${JSON.stringify(riskMap, null, 2)}`);

  const opportunity = extractField(priorResults, 'opportunity', 'priorityOpportunity');
  if (opportunity)
    sections.push(`### 최우선 기회 (opportunity)\n${JSON.stringify(opportunity, null, 2)}`);

  const strategy = extractField(
    priorResults,
    'strategy',
    'targetStrategy',
    'messageStrategy',
    'riskResponse',
  );
  if (strategy) sections.push(`### 전략 (strategy)\n${JSON.stringify(strategy, null, 2)}`);

  return sections.join('\n\n');
}

/** approval-rating용: 감정/집단 데이터만 */
export function distillForApprovalRating(priorResults: PriorResults): string {
  const sections: string[] = [];

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'sentimentRatio',
    'topKeywords',
  );
  if (sentiment)
    sections.push(
      `### 감정 비율·키워드 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`,
    );

  const segmentation = extractField(
    priorResults,
    'segmentation',
    'platformSegments',
    'audienceGroups',
  );
  if (segmentation)
    sections.push(
      `### 플랫폼·집단별 반응 (segmentation)\n${JSON.stringify(segmentation, null, 2)}`,
    );

  const macroView = extractField(
    priorResults,
    'macro-view',
    'overallDirection',
    'dailyMentionTrend',
  );
  if (macroView) sections.push(`### 여론 추이 (macro-view)\n${JSON.stringify(macroView, null, 2)}`);

  return sections.join('\n\n');
}

/** frame-war용: 프레임 관련 데이터만 */
export function distillForFrameWar(priorResults: PriorResults): string {
  const sections: string[] = [];

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'positiveFrames',
    'negativeFrames',
    'frameConflict',
    'topKeywords',
  );
  if (sentiment)
    sections.push(`### 프레임·키워드 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`);

  const macroView = extractField(
    priorResults,
    'macro-view',
    'overallDirection',
    'inflectionPoints',
  );
  if (macroView)
    sections.push(`### 여론 변곡점 (macro-view)\n${JSON.stringify(macroView, null, 2)}`);

  const impact = extractField(priorResults, 'message-impact', 'successMessages', 'failureMessages');
  if (impact) sections.push(`### 메시지 성패 (message-impact)\n${JSON.stringify(impact, null, 2)}`);

  return sections.join('\n\n');
}

/** crisis-scenario용: 리스크+지지율 중심 */
export function distillForCrisisScenario(priorResults: PriorResults): string {
  const sections: string[] = [];

  const riskMap = extractField(
    priorResults,
    'risk-map',
    'topRisks',
    'overallRiskLevel',
    'riskTrend',
  );
  if (riskMap) sections.push(`### 리스크 (risk-map)\n${JSON.stringify(riskMap, null, 2)}`);

  const approval = extractField(
    priorResults,
    'approval-rating',
    'estimatedRange',
    'confidence',
    'methodology',
  );
  if (approval)
    sections.push(`### 지지율 추정 (approval-rating)\n${JSON.stringify(approval, null, 2)}`);

  const macroView = extractField(
    priorResults,
    'macro-view',
    'overallDirection',
    'inflectionPoints',
  );
  if (macroView)
    sections.push(`### 여론 변곡점 (macro-view)\n${JSON.stringify(macroView, null, 2)}`);

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'sentimentRatio',
    'negativeFrames',
  );
  if (sentiment)
    sections.push(`### 부정 감정 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`);

  return sections.join('\n\n');
}

/** win-simulation용: 모든 결과에서 핵심만 */
export function distillForWinSimulation(priorResults: PriorResults): string {
  const sections: string[] = [];

  const approval = extractField(priorResults, 'approval-rating', 'estimatedRange', 'confidence');
  if (approval)
    sections.push(`### 지지율 추정 (approval-rating)\n${JSON.stringify(approval, null, 2)}`);

  const riskMap = extractField(priorResults, 'risk-map', 'topRisks', 'overallRiskLevel');
  if (riskMap) sections.push(`### 리스크 (risk-map)\n${JSON.stringify(riskMap, null, 2)}`);

  const opportunity = extractField(
    priorResults,
    'opportunity',
    'positiveAssets',
    'priorityOpportunity',
  );
  if (opportunity) sections.push(`### 기회 (opportunity)\n${JSON.stringify(opportunity, null, 2)}`);

  const strategy = extractField(
    priorResults,
    'strategy',
    'targetStrategy',
    'messageStrategy',
    'riskResponse',
  );
  if (strategy) sections.push(`### 전략 (strategy)\n${JSON.stringify(strategy, null, 2)}`);

  const frameWar = extractField(
    priorResults,
    'frame-war',
    'dominantFrames',
    'threateningFrames',
    'battlefieldSummary',
  );
  if (frameWar) sections.push(`### 프레임 전쟁 (frame-war)\n${JSON.stringify(frameWar, null, 2)}`);

  const crisis = extractField(priorResults, 'crisis-scenario', 'scenarios', 'currentRiskLevel');
  if (crisis)
    sections.push(`### 위기 시나리오 (crisis-scenario)\n${JSON.stringify(crisis, null, 2)}`);

  const sentiment = extractField(
    priorResults,
    'sentiment-framing',
    'sentimentRatio',
    'frameConflict',
  );
  if (sentiment)
    sections.push(`### 감정·프레임 (sentiment-framing)\n${JSON.stringify(sentiment, null, 2)}`);

  const segmentation = extractField(priorResults, 'segmentation', 'highInfluenceGroup');
  if (segmentation)
    sections.push(`### 핵심 집단 (segmentation)\n${JSON.stringify(segmentation, null, 2)}`);

  return sections.join('\n\n');
}

// 입력 데이터를 프롬프트용 구조로 변환
export function formatInputData(data: AnalysisInput) {
  const formatDate = (d: Date | null) => (d ? d.toISOString().split('T')[0] : '날짜 미상');

  const articles = data.articles.map((a) => ({
    title: a.title,
    content: a.content
      ? a.content.length > MAX_CONTENT_LENGTH
        ? a.content.slice(0, MAX_CONTENT_LENGTH) + '...'
        : a.content
      : '(본문 없음)',
    source: a.source,
    publisher: a.publisher ?? '출처 미상',
    publishedAt: formatDate(a.publishedAt),
  }));

  const videos = data.videos.map((v) => ({
    title: v.title,
    channel: v.channelTitle ?? '채널 미상',
    viewCount: v.viewCount ?? 0,
    likeCount: v.likeCount ?? 0,
    publishedAt: formatDate(v.publishedAt),
  }));

  const comments = data.comments.map((c) => ({
    content: c.content,
    source: c.source,
    author: c.author ?? '익명',
    likeCount: c.likeCount ?? 0,
    publishedAt: formatDate(c.publishedAt),
  }));

  const dateRange = `${formatDate(data.dateRange.start)} ~ ${formatDate(data.dateRange.end)}`;

  return { articles, videos, comments, dateRange };
}
