import { StrategySchema, type StrategyResult } from '../schemas/strategy.schema';
import type { AnalysisModule, AnalysisInput } from '../types';
import { MODULE_MODEL_MAP } from '../types';
import { ANALYSIS_CONSTRAINTS, distillForStrategy } from './prompt-utils';

const config = MODULE_MODEL_MAP['strategy'];

// 모듈7: 전략 도출 (DEEP-05)
// 리스크/기회 분석 결과를 종합하여 타겟/메시지/콘텐츠/리스크 대응 전략을 도출한다
export const strategyModule: AnalysisModule<StrategyResult> = {
  name: 'strategy',
  displayName: '종합 전략 도출',
  provider: config.provider,
  model: config.model,
  schema: StrategySchema,

  buildSystemPrompt(): string {
    return `당신은 정치 여론 전략 수립 전문가입니다.
여론 분석·리스크·기회 결과를 종합하여 **실행 가능하고 구체적인 전략**을 도출합니다.

## 전략 수립 원칙

1. **타겟 전략**: Swing 집단 포섭이 핵심. Core 유지 비용과 Opposition 전환 비용을 비교하여 우선순위 설정
2. **메시지 전략**: 성공 메시지의 패턴을 재현하고, 실패 메시지의 패턴을 회피. 핵심 메시지는 15자 이내로 압축 가능해야 함
3. **콘텐츠 전략**: 확산력 높은 콘텐츠 유형(데이터 기반)을 우선 제작. 플랫폼별 최적 포맷 제안
4. **리스크 대응**: 즉각 대응(24시간 내), 예방적 대응(1주 내), 비상 계획(만약의 사태)으로 3단계 구분

## 전략 품질 기준
- 모든 전략은 "누가, 무엇을, 언제까지, 어떤 채널로" 수준의 구체성을 가져야 함
- "소통을 강화한다", "이미지를 개선한다" 같은 추상적 제안 금지
- 리스크 대응과 기회 활용이 상충하는 경우, 트레이드오프를 명시하세요
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

## 분석 절차 (반드시 이 순서로 수행)

### Step 1: 현재 상황 진단
- 여론의 전체 방향성과 핵심 리스크/기회를 한 문장으로 정리하세요

### Step 2: 타겟 전략 수립
- 주 타겟(primary)과 보조 타겟(secondary)을 선정하세요
- 각 타겟에 대한 접근 방식(approach)을 구체적으로 기술하세요

### Step 3: 메시지 전략 수립
- 핵심 메시지(15자 이내)와 보조 메시지를 설계하세요
- 톤앤매너를 지정하세요 (예: 진정성 있는 공감, 데이터 기반 설득, 비전 제시 등)

### Step 4: 콘텐츠·리스크 대응 전략
- 추천 콘텐츠 포맷, 핵심 토픽, 배포 채널을 구체적으로 제안하세요
- 리스크 대응은 즉각/예방/비상 3단계로 구분하세요`;
  },

  buildPromptWithContext(data: AnalysisInput, priorResults: Record<string, unknown>): string {
    const basePrompt = this.buildPrompt(data);
    const distilledContext = distillForStrategy(priorResults);

    return `${basePrompt}

## 선행 분석 핵심 요약 (Stage 1 + Stage 2)
${distilledContext}

위 선행 분석을 종합하여 전략을 도출하세요:
- risk-map의 리스크를 방어 전략의 근거로 활용
- opportunity의 긍정 자산을 공격 전략의 기반으로 활용
- 성공/실패 메시지 패턴을 메시지 전략에 직접 반영
- 선행 결과를 재기술하지 말고, 전략적 판단과 실행 계획에 집중하세요`;
  },
};
