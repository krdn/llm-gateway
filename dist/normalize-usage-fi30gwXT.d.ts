/** AI SDK 프로바이더별 usage 필드명 차이를 정규화 */
interface NormalizedUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
declare function normalizeUsage(usage: Record<string, unknown> | undefined | null): NormalizedUsage;

export { type NormalizedUsage as N, normalizeUsage as n };
