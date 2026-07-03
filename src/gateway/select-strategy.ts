// 구조화 출력 전략 선택자 (selector) — 순수 데이터, SDK-free.
// provider capability(supportsStructuredOutput)에서 전략 identifier를 유도한다.
// 전략의 '실행'은 SDK 레이어(strategies.ts)가 담당.
import { PROVIDER_REGISTRY, type AIProvider } from './provider-meta';

/** 구조화 출력 전략 identifier */
export type StructuredStrategy = 'native' | 'text2step';

/**
 * provider의 capability 데이터에서 구조화 출력 전략을 유도한다.
 *
 * 유도 규칙:
 *   1. 구조화 출력 미지원 → 'text2step' (generateText 2-call 폴백)
 *   2. 그 외 → 'native' (generateObject)
 *
 * NOTE: AI SDK v6의 generateObject는 provider별 structured-output 모드를 내부에서
 * 선택하므로, 과거 openrouter용 `mode:'json'` 분기는 제거됐다. `requiresJsonMode`
 * 레지스트리 플래그는 provider 메타데이터로 유지되지만 전략 선택에는 쓰이지 않는다.
 */
export function selectStrategy(provider: AIProvider): StructuredStrategy {
  const meta = PROVIDER_REGISTRY[provider];
  return meta.supportsStructuredOutput ? 'native' : 'text2step';
}
