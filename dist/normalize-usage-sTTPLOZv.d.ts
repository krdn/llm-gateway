/**
 * AI SDK 프로바이더별 usage 필드명 차이를 정규화.
 * interface가 아닌 type인 이유: interface는 선언 병합 가능성 때문에
 * `Record<string, unknown>`에 할당되지 않아, usage를 범용 로깅/persist
 * 함수에 넘기는 소비자 코드가 컴파일 에러를 맞는다 (gons-dashboard에서 실측).
 */
type NormalizedUsage = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
};
/**
 * usage 객체를 `NormalizedUsage`로 정규화한다.
 * 인자로 usage 객체 자체를 전달할 것 — 인식 불가능한 값은 0으로 정규화된다.
 * (v4 필드명 promptTokens/completionTokens와 v5+ inputTokens/outputTokens 모두 지원)
 */
declare function normalizeUsage(usage: unknown): NormalizedUsage;

export { type NormalizedUsage as N, normalizeUsage as n };
