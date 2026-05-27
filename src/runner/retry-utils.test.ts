import { describe, expect, it, vi } from 'vitest';
import {
  isParseError,
  isRateLimitError,
  isServerOverloadError,
  parseRetryAfter,
  sleep,
  MAX_RATE_LIMIT_RETRIES,
  retryWithPolicy,
} from './retry-utils';

describe('isRateLimitError', () => {
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

  it('non-Error 입력도 안전 처리', () => {
    expect(isRateLimitError('429 quota exceeded')).toBe(true);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe('isServerOverloadError', () => {
  it('503 인식', () => {
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

describe('isParseError', () => {
  it('"could not parse" 인식', () => {
    expect(isParseError(new Error('could not parse response'))).toBe(true);
  });

  it('"No object generated" 인식', () => {
    expect(isParseError(new Error('No object generated'))).toBe(true);
  });

  it('일반 에러는 false', () => {
    expect(isParseError(new Error('429'))).toBe(false);
  });
});

describe('상수', () => {
  it('MAX_RATE_LIMIT_RETRIES === 5', () => {
    expect(MAX_RATE_LIMIT_RETRIES).toBe(5);
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

  it('재시도 불가능한 에러는 즉시 전파', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invalid schema'));

    await expect(
      retryWithPolicy(fn, { maxRateLimitRetries: 3, _sleep: noSleep }),
    ).rejects.toThrow('invalid schema');

    expect(fn).toHaveBeenCalledTimes(1);
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

  it('backoff은 retryAfter와 (attempt+1)*3000 중 큰 값', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Please retry in 10s'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();

    await retryWithPolicy(fn, { maxRateLimitRetries: 3, onRetry, _sleep: noSleep });

    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ backoffMs: 10000 }),
    );
  });

  it('retryAfter가 없으면 (attempt+1)*3000 기본 backoff', async () => {
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
