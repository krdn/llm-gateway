// Rate limit 재시도 유틸리티 (runModule 및 소비자 파이프라인 공용)
import { APICallError, RetryError } from 'ai';

/**
 * AI SDK가 던진 에러에서 구조화된 APICallError를 꺼낸다.
 * AI SDK 내부 재시도(maxRetries)가 소진되면 마지막 에러를 RetryError로
 * 감싸므로, 먼저 래핑을 해제해야 statusCode 기반 분류가 동작한다.
 */
function unwrapApiError(error: unknown): APICallError | undefined {
  const unwrapped = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(unwrapped) ? unwrapped : undefined;
}

/** Rate limit 에러 감지 (재시도 가능한 에러) */
export function isRateLimitError(error: unknown): boolean {
  const apiError = unwrapApiError(error);
  if (apiError?.statusCode !== undefined) {
    return apiError.statusCode === 429;
  }
  // CLI 프록시/Ollama 등 비구조화 에러는 메시지 패턴으로 폴백
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /rate\s*limit|\b429\b|quota\s*exceeded|RESOURCE_EXHAUSTED|\b[TR]PM\b/i.test(msg) ||
    // Gemini 서버 용량 부족 (구체적 문구만 매칭)
    msg.includes('No capacity available') ||
    // 프로바이더가 명시한 재시도 안내
    /please\s+retry\s+in|try\s+again\s+in/i.test(msg)
  );
}

/**
 * 서버 일시 장애 감지 (rate limit과 분리 — 별도 재시도 정책 적용).
 *
 * 프록시 계층 에러(cli-proxy-api의 502, type 'server_error')는 여기서 재시도하지
 * 않는다 — AI SDK 기본 maxRetries=2가 isRetryable(5xx) 규칙으로 502를 이미
 * 재시도하고, 프록시 자체도 업스트림 재시도 후 502를 반환하므로 단기 장애는
 * 하위 계층에서 흡수된다. 'unknown provider' 같은 영구 오류도 같은 502로 오므로
 * 상위 재시도는 무익하다.
 */
export function isServerOverloadError(error: unknown): boolean {
  const apiError = unwrapApiError(error);
  if (apiError?.statusCode !== undefined) {
    // 529 = Anthropic overloaded_error
    return apiError.statusCode === 503 || apiError.statusCode === 529;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /\b503\b/.test(msg) || msg.includes('overloaded') || msg.includes('temporarily unavailable')
  );
}

/** Rate limit 에러에서 대기 시간 추출 (초) — retry-after 헤더 우선, 메시지 패턴 폴백 */
export function parseRetryAfter(error: unknown): number {
  const headerValue = unwrapApiError(error)?.responseHeaders?.['retry-after'];
  if (headerValue !== undefined) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  }
  const msg = error instanceof Error ? error.message : String(error);
  // "try again in 5s" 또는 "Please retry in 19.303052072s" 패턴
  const match = msg.match(/(?:try again|retry) in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : 0;
}

/**
 * 지정 시간(ms) 대기. signal이 주어지면 대기 중 abort 시 즉시 reject한다
 * (backoff 대기가 취소를 무시해 최대 5분 지연되는 것을 방지).
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const MAX_RATE_LIMIT_RETRIES = 5;

/**
 * provider가 안내한 retry-after가 이 값을 넘으면 재시도하지 않고 원본 에러를
 * 즉시 던진다 (예: Gemini 일일 쿼터 소진 시 'retry in 86400s' — 24시간 대기 방지).
 */
export const MAX_RETRY_AFTER_MS = 5 * 60_000;

export interface RetryPolicyOptions {
  maxRateLimitRetries?: number;
  maxOverloadRetries?: number;
  overloadBackoffMs?: number;
  onRetry?: (info: { error: unknown; attempt: number; backoffMs: number; type: 'rate-limit' | 'overload' }) => void | Promise<void>;
  shouldAbort?: () => boolean | Promise<boolean>;
  /** backoff 대기 중 abort 시 즉시 중단하기 위한 signal (선택) */
  abortSignal?: AbortSignal;
  /** @internal 테스트용 sleep 주입 */
  _sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Rate limit(선형 backoff: attempt × 3000ms, retry-after 안내가 있으면 그 값과
 * 큰 쪽)과 서버 과부하(고정 backoff)를 서로 독립된 재시도 예산으로 처리한다.
 * 두 예산 중 해당하는 쪽이 소진되면 마지막 원본 에러를 그대로 다시 던진다
 * (일반 에러로 감싸지 않음 — 상위에서 statusCode/메시지 기반 분류가 계속
 * 동작해야 하므로).
 */
export async function retryWithPolicy<T>(
  fn: () => Promise<T>,
  options?: RetryPolicyOptions,
): Promise<T> {
  const maxRateLimit = options?.maxRateLimitRetries ?? MAX_RATE_LIMIT_RETRIES;
  const maxOverload = options?.maxOverloadRetries ?? 1;
  const overloadBackoff = options?.overloadBackoffMs ?? 15_000;
  const wait = options?._sleep ?? sleep;

  let rateLimitAttempts = 0;
  let overloadAttempts = 0;

  while (true) {
    if (options?.shouldAbort && (await options.shouldAbort())) {
      throw new Error('aborted');
    }

    try {
      return await fn();
    } catch (error) {
      if (isRateLimitError(error) && rateLimitAttempts < maxRateLimit) {
        const retryAfterMs = parseRetryAfter(error) * 1000;
        if (retryAfterMs > MAX_RETRY_AFTER_MS) {
          throw error; // 일일 쿼터 소진 등 장시간 대기 안내는 즉시 실패
        }
        rateLimitAttempts++;
        const backoffMs = Math.max(retryAfterMs, rateLimitAttempts * 3000);
        await options?.onRetry?.({ error, attempt: rateLimitAttempts, backoffMs, type: 'rate-limit' });
        await wait(backoffMs, options?.abortSignal);
        continue;
      }
      if (isServerOverloadError(error) && overloadAttempts < maxOverload) {
        overloadAttempts++;
        await options?.onRetry?.({ error, attempt: overloadAttempts, backoffMs: overloadBackoff, type: 'overload' });
        await wait(overloadBackoff, options?.abortSignal);
        continue;
      }
      throw error;
    }
  }
}
