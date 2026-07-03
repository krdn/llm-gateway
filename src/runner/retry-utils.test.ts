import { describe, expect, it, vi } from 'vitest';
import { APICallError, RetryError } from 'ai';
import {
  isRateLimitError,
  isServerOverloadError,
  parseRetryAfter,
  sleep,
  MAX_RETRY_AFTER_MS,
  retryWithPolicy,
} from './retry-utils';

/** 구조화된 APICallError 생성 헬퍼 */
function apiError(
  statusCode: number,
  message = 'api error',
  responseHeaders?: Record<string, string>,
): APICallError {
  return new APICallError({
    message,
    url: 'https://api.test/v1',
    requestBodyValues: {},
    statusCode,
    ...(responseHeaders ? { responseHeaders } : {}),
  });
}

describe('isRateLimitError', () => {
  describe('구조화된 APICallError (statusCode 우선)', () => {
    it('statusCode 429 → true (메시지 무관)', () => {
      expect(isRateLimitError(apiError(429, 'anything'))).toBe(true);
    });

    it('statusCode 401 → false (메시지에 rate limit이 있어도 status가 우선)', () => {
      expect(isRateLimitError(apiError(401, 'see rate limit docs'))).toBe(false);
    });

    it('AI SDK RetryError로 감싸진 429도 인식 (래핑 해제)', () => {
      const inner = apiError(429);
      const wrapped = new RetryError({
        message: 'Failed after 3 attempts',
        reason: 'maxRetriesExceeded',
        errors: [inner],
      });
      expect(isRateLimitError(wrapped)).toBe(true);
    });
  });

  describe('비구조화 에러 (메시지 패턴 폴백)', () => {
    it('429 메시지를 rate limit으로 인식', () => {
      expect(isRateLimitError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
    });

    it('"rate limit" 문구 인식', () => {
      expect(isRateLimitError(new Error('Rate Limit exceeded'))).toBe(true);
    });

    it('Gemini RESOURCE_EXHAUSTED 인식', () => {
      expect(isRateLimitError(new Error('RESOURCE_EXHAUSTED: quota'))).toBe(true);
    });

    it('Gemini "No capacity available" 인식', () => {
      expect(isRateLimitError(new Error('No capacity available right now'))).toBe(true);
    });

    it('"please retry in 5s" 안내 인식', () => {
      expect(isRateLimitError(new Error('Please retry in 5s'))).toBe(true);
    });

    it('일반 네트워크 에러는 false', () => {
      expect(isRateLimitError(new Error('ECONNRESET'))).toBe(false);
    });

    it('숫자 429가 다른 숫자의 일부면 false (word boundary)', () => {
      expect(isRateLimitError(new Error('model-4290 not found'))).toBe(false);
    });

    it('non-Error 입력도 안전 처리', () => {
      expect(isRateLimitError('429 quota exceeded')).toBe(true);
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
    });
  });
});

describe('isServerOverloadError', () => {
  it('statusCode 503 → true', () => {
    expect(isServerOverloadError(apiError(503))).toBe(true);
  });

  it('statusCode 529 (Anthropic overloaded_error) → true', () => {
    expect(isServerOverloadError(apiError(529))).toBe(true);
  });

  it('statusCode 429 → false (rate limit이지 overload 아님)', () => {
    expect(isServerOverloadError(apiError(429, 'overloaded'))).toBe(false);
  });

  it('503 메시지 인식', () => {
    expect(isServerOverloadError(new Error('HTTP 503 Service Unavailable'))).toBe(true);
  });

  it('"overloaded" 인식', () => {
    expect(isServerOverloadError(new Error('Server is overloaded'))).toBe(true);
  });

  it('"temporarily unavailable" 인식', () => {
    expect(isServerOverloadError(new Error('Service temporarily unavailable'))).toBe(true);
  });

  it('429는 rate limit이지 overload 아님', () => {
    expect(isServerOverloadError(new Error('429 too many requests'))).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('retry-after 응답 헤더 우선 사용', () => {
    const err = apiError(429, 'rate limited', { 'retry-after': '30' });
    expect(parseRetryAfter(err)).toBe(30);
  });

  it('헤더가 숫자가 아니면 메시지 패턴으로 폴백', () => {
    const err = apiError(429, 'try again in 5s', { 'retry-after': 'Wed, 21 Oct' });
    expect(parseRetryAfter(err)).toBe(5);
  });

  it('"try again in 5s" 패턴', () => {
    expect(parseRetryAfter(new Error('try again in 5s'))).toBe(5);
  });

  it('"Please retry in 19.303052072s" 소수점 → 올림', () => {
    expect(parseRetryAfter(new Error('Please retry in 19.303052072s'))).toBe(20);
  });

  it('대소문자 무관', () => {
    expect(parseRetryAfter(new Error('Try Again In 7s'))).toBe(7);
  });

  it('패턴 없으면 0', () => {
    expect(parseRetryAfter(new Error('quota exceeded'))).toBe(0);
  });
});

describe('sleep', () => {
  it('지정 시간 후 resolve', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});

describe('retryWithPolicy', () => {
  const noSleep = async () => {};

  it('첫 시도 성공 시 즉시 반환', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithPolicy(fn, { maxRateLimitRetries: 3, _sleep: noSleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rate limit 에러 시 재시도 후 성공', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = await retryWithPolicy(fn, {
      maxRateLimitRetries: 3,
      onRetry,
      _sleep: noSleep,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1, type: 'rate-limit' }),
    );
  });

  it('rate limit 재시도 한도 초과 시 마지막 에러 전파', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('429 rate limit'));

    await expect(
      retryWithPolicy(fn, { maxRateLimitRetries: 2, _sleep: noSleep }),
    ).rejects.toThrow('429 rate limit');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('server overload 에러 시 1회 재시도 후 성공', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503 overloaded'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = await retryWithPolicy(fn, {
      maxRateLimitRetries: 3,
      overloadBackoffMs: 10,
      onRetry,
      _sleep: noSleep,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'overload', backoffMs: 10 }),
    );
  });

  it('server overload 재시도 한도(기본 1회) 초과 시 에러 전파', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('503 overloaded'));

    await expect(
      retryWithPolicy(fn, { maxRateLimitRetries: 3, overloadBackoffMs: 10, _sleep: noSleep }),
    ).rejects.toThrow('503 overloaded');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('overload 재시도가 rate limit 예산을 소모하지 않음 (독립 카운터)', async () => {
    // maxRateLimitRetries=0이어도 overload 예산은 온전히 동작해야 함
    const fn = vi.fn().mockRejectedValue(new Error('503 overloaded'));

    await expect(
      retryWithPolicy(fn, {
        maxRateLimitRetries: 0,
        maxOverloadRetries: 3,
        overloadBackoffMs: 10,
        _sleep: noSleep,
      }),
    ).rejects.toThrow('503 overloaded');

    // 최초 1회 + overload 재시도 3회 = 4회
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('rate limit과 overload가 섞여도 각자의 예산으로 재시도 후 성공', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockRejectedValueOnce(new Error('503 overloaded'))
      .mockResolvedValue('ok');

    const result = await retryWithPolicy(fn, {
      maxRateLimitRetries: 1,
      maxOverloadRetries: 1,
      overloadBackoffMs: 10,
      _sleep: noSleep,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('재시도 불가능한 에러는 즉시 전파', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invalid schema'));

    await expect(
      retryWithPolicy(fn, { maxRateLimitRetries: 3, _sleep: noSleep }),
    ).rejects.toThrow('invalid schema');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retry-after가 상한(MAX_RETRY_AFTER_MS)을 넘으면 재시도 없이 원본 에러 전파', async () => {
    // Gemini 일일 쿼터 소진: "Please retry in 86400s" → 24시간 대기 방지
    expect(86400 * 1000).toBeGreaterThan(MAX_RETRY_AFTER_MS);
    const fn = vi.fn().mockRejectedValue(
      new Error('RESOURCE_EXHAUSTED: Please retry in 86400s'),
    );
    const sleepSpy = vi.fn(noSleep);

    await expect(
      retryWithPolicy(fn, { maxRateLimitRetries: 5, _sleep: sleepSpy }),
    ).rejects.toThrow('86400s');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('상한 이내의 retry-after(90s)는 그대로 대기 후 재시도', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Please retry in 90s'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    const result = await retryWithPolicy(fn, {
      maxRateLimitRetries: 3,
      onRetry,
      _sleep: noSleep,
    });

    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ backoffMs: 90_000 }),
    );
  });

  it('shouldAbort가 true면 실행 전 abort', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(
      retryWithPolicy(fn, { shouldAbort: () => true, _sleep: noSleep }),
    ).rejects.toThrow('aborted');

    expect(fn).not.toHaveBeenCalled();
  });

  it('shouldAbort가 재시도 중간에 true면 abort', async () => {
    let aborted = false;
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValue('ok');

    await expect(
      retryWithPolicy(fn, {
        maxRateLimitRetries: 3,
        _sleep: noSleep,
        shouldAbort: () => {
          if (fn.mock.calls.length >= 1) aborted = true;
          return aborted;
        },
      }),
    ).rejects.toThrow('aborted');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backoff은 retryAfter와 attempt*3000 중 큰 값', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Please retry in 10s'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    await retryWithPolicy(fn, { maxRateLimitRetries: 3, onRetry, _sleep: noSleep });

    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ backoffMs: 10000 }),
    );
  });

  it('retryAfter가 없으면 attempt*3000 기본 backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 quota exceeded'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    await retryWithPolicy(fn, { maxRateLimitRetries: 3, onRetry, _sleep: noSleep });

    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ backoffMs: 3000 }),
    );
  });
});
