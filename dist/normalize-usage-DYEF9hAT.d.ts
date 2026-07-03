/** AI SDK 프로바이더별 usage 필드명 차이를 정규화 */
interface NormalizedUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
/**
 * usage 객체를 `NormalizedUsage`로 정규화한다.
 * 인자로 usage 객체 자체를 전달할 것 — 인식 불가능한 값은 0으로 정규화된다.
 * (v4 필드명 promptTokens/completionTokens와 v5+ inputTokens/outputTokens 모두 지원)
 */
declare function normalizeUsage(usage: unknown): NormalizedUsage;

export { type NormalizedUsage as N, normalizeUsage as n };
