import { describe, expect, it } from 'vitest';
import {
  isParseError,
  isRateLimitError,
  isServerOverloadError,
  parseRetryAfter,
  sleep,
  MAX_RATE_LIMIT_RETRIES,
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
