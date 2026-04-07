// Rate limit 재시도 유틸리티 (runner.ts, map-reduce.ts 공용)

/** Rate limit 에러 감지 (재시도 가능한 에러) */
export function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /rate\s*limit|429|quota\s*exceeded|RESOURCE_EXHAUSTED|[TR]PM/i.test(msg) ||
    // Gemini 서버 용량 부족 (구체적 문구만 매칭)
    msg.includes('No capacity available') ||
    // 프로바이더가 명시한 재시도 안내
    /please\s+retry\s+in|try\s+again\s+in/i.test(msg)
  );
}

/** 서버 일시 장애 감지 (rate limit과 분리 — 별도 재시도 정책 적용) */
export function isServerOverloadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('503') || msg.includes('overloaded') || msg.includes('temporarily unavailable')
  );
}

/** Rate limit 에러에서 대기 시간 추출 (초) */
export function parseRetryAfter(error: unknown): number {
  const msg = error instanceof Error ? error.message : String(error);
  // "try again in 5s" 또는 "Please retry in 19.303052072s" 패턴
  const match = msg.match(/(?:try again|retry) in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : 0;
}

/** 지정 시간(ms) 대기 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const MAX_RATE_LIMIT_RETRIES = 5;
export const MAX_PARSE_RETRIES = 2;

/** 구조화 응답 파싱 실패 감지 */
export function isParseError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('could not parse') ||
    msg.includes('No object generated') ||
    msg.includes('Failed to parse')
  );
}
