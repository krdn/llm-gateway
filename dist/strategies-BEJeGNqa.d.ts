import { FinishReason } from 'ai';

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

/** SDK가 보고한 모델/종료 사유. 실제 서빙 모델의 독립적인 증명은 아니다. */
interface ResponseInfo {
    model?: string;
    finishReason: FinishReason;
}
interface StrategyResult<T> {
    object: T;
    /** 호출 순서대로 기록. 복구 전 응답의 절단 여부도 보존한다. */
    responses?: ResponseInfo[];
    usage: NormalizedUsage;
    finishReason: FinishReason;
}
/**
 * 구조화 출력이 실패했지만 토큰은 이미 과금된 경우에 던지는 에러.
 *
 * 두 경로에서 나온다 — text2step 이중 실패, 그리고 native 경로에서 프로바이더가
 * 완결된 출력을 내지 않은 경우(토큰 절단 등). 어느 쪽이든 호출은 HTTP 레벨로
 * 성공해 토큰이 실제 과금된 상태이므로, 소비한 usage를 에러에 실어 실패한
 * 분석도 비용 집계(checkCostLimit/onPersist)에 포함될 수 있게 한다.
 * runModule이 이를 감지해 failed 결과에 usage를 싣는다.
 */
declare const structuredOutputErrorMarker: unique symbol;
declare class StructuredOutputError extends Error {
    private readonly [structuredOutputErrorMarker];
    /** 서브패스별 독립 번들 사이에서도 같은 오류를 인식한다. */
    static isInstance(error: unknown): error is StructuredOutputError;
    readonly usage: NormalizedUsage;
    readonly responses?: ResponseInfo[];
    constructor(message: string, usage: NormalizedUsage, options?: {
        cause?: unknown;
        responses?: ResponseInfo[];
    });
}

export { type NormalizedUsage as N, type ResponseInfo as R, StructuredOutputError as S, type StrategyResult as a, normalizeUsage as n };
