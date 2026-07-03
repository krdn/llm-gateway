// AI SDK 프로바이더별 usage 필드명 차이를 정규화한다.
// gateway.ts와 strategies.ts가 공유 (순환 의존 방지를 위해 별도 모듈로 분리).

/** AI SDK 프로바이더별 usage 필드명 차이를 정규화 */
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function normalizeUsage(usage: Record<string, unknown> | undefined | null): NormalizedUsage {
  if (!usage) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const inputTokens =
    (typeof usage.promptTokens === 'number' ? usage.promptTokens : 0) ||
    (typeof usage.inputTokens === 'number' ? usage.inputTokens : 0);
  const outputTokens =
    (typeof usage.completionTokens === 'number' ? usage.completionTokens : 0) ||
    (typeof usage.outputTokens === 'number' ? usage.outputTokens : 0);
  const totalTokens =
    typeof usage.totalTokens === 'number' ? usage.totalTokens : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}
