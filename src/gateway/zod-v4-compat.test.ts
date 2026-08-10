// zod v3·v4 듀얼 지원 회귀 테스트.
//
// 두 결함을 각각 잡는다 (둘 다 4.0.2 이전에 v4 지원을 되돌리게 만든 원인):
//   ① zod-to-json-schema 3.25.x가 v4 스키마에 예외 없이 `{}`를 반환 →
//      text2step 폴백 프롬프트에 빈 스키마가 조용히 실렸다.
//   ② 3-인자 `ZodType<T, ZodTypeDef, unknown>` 별칭이 v4에서 출력 타입 추론을 잃어
//      `analyzeStructured` 결과가 `unknown`이 됐다.
//
// zod 3.25.x와 4.x 모두 `zod/v3`·`zod/v4` 서브패스를 제공하므로, 어느 메이저가
// 설치돼 있든 이 파일 하나로 두 API 표면을 모두 검사한다.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z as z3 } from 'zod/v3';
import * as z4 from 'zod/v4';
import type * as AiModule from 'ai';

const mockModel = { id: 'test-model' };

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => () => mockModel) }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => () => mockModel) }));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => Object.assign(() => mockModel, { chat: () => mockModel })),
}));

vi.mock('ai', async (importOriginal) => {
  const orig = await importOriginal<typeof AiModule>();
  return { ...orig, generateText: vi.fn() };
});

import { analyzeStructured } from './gateway';
import { tryParseAndValidate } from './json-repair';
import { generateText, jsonSchema } from 'ai';

/** ollama는 supportsStructuredOutput=false → text2step 폴백으로 진입한다 */
const FALLBACK_OPTS = { provider: 'ollama', model: 'llama3' } as const;

const mockText = (text: string) =>
  vi.mocked(generateText).mockResolvedValueOnce({
    text,
    usage: { promptTokens: 10, completionTokens: 10 },
    finishReason: 'stop',
  } as unknown as Awaited<ReturnType<typeof generateText>>);

/** step1에 실제로 전달된 프롬프트 */
const step1Prompt = (): string =>
  (vi.mocked(generateText).mock.calls[0]?.[0] as { prompt: string }).prompt;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('결함 ① — 폴백 프롬프트의 JSON Schema 블록', () => {
  it('zod v4 스키마가 폴백 프롬프트에 실린다 (빈 {} 회귀 방지)', async () => {
    const schema = z4.object({ summary: z4.string(), score: z4.number() });
    mockText('{"summary": "ok", "score": 90}');

    await analyzeStructured('분석해줘', schema, FALLBACK_OPTS);

    const prompt = step1Prompt();
    expect(prompt).toContain('summary');
    expect(prompt).toContain('score');
    // 수정 전에는 여기가 정확히 "{}" 였다
    expect(prompt).not.toContain('matching this schema:\n{}');
  });

  it('zod v3 스키마는 기존 openApi3 출력을 그대로 유지한다', async () => {
    // nullable은 openApi3와 draft-07이 갈리는 지점이다:
    //   openApi3 → {"type":"string","nullable":true}
    //   draft-07 → {"type":["string","null"]}
    const schema = z3.object({ note: z3.string().nullable() });
    mockText('{"note": null}');

    await analyzeStructured('분석해줘', schema, FALLBACK_OPTS);

    const prompt = step1Prompt();
    expect(prompt).toContain('"nullable": true');
    expect(prompt).not.toContain('"null"');
  });

  it('변환 불가 스키마는 빈 {}를 싣지 않고 섹션 자체를 생략한다', async () => {
    // z.unknown()은 제약이 없어 JSON Schema가 빈 객체가 된다.
    mockText('{"anything": 1}');

    await analyzeStructured('분석해줘', z3.unknown(), FALLBACK_OPTS);

    const prompt = step1Prompt();
    expect(prompt).not.toContain('matching this schema');
    expect(prompt).toContain('Output JSON only.');
  });

  it('스키마 힌트 없이 실패하면 그 사실이 에러에 남는다', async () => {
    mockText('not json');
    mockText('still not json');

    await expect(analyzeStructured('분석해줘', z3.unknown(), FALLBACK_OPTS)).rejects.toThrow(
      '스키마 힌트 없이 실행됨',
    );
  });
});

describe('검증기 없는 스키마 — 프로바이더 호출 전에 거부', () => {
  it('validate 없는 Schema는 LLM을 호출하기 전에 에러를 던진다', async () => {
    // jsonSchema()에 validate를 주지 않으면 검증기가 없다. native 경로의
    // Output.object는 이를 "검증 통과"로 취급하므로 진입 시점에 막아야 한다.
    const noValidator = jsonSchema<{ a: string }>({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
    });

    await expect(analyzeStructured('분석해줘', noValidator, FALLBACK_OPTS)).rejects.toThrow(
      'validate가 없어',
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it('validate를 준 Schema는 정상 실행된다', async () => {
    const withValidator = jsonSchema<{ a: string }>(
      { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
      { validate: (v) => ({ success: true, value: v as { a: string } }) },
    );
    mockText('{"a": "ok"}');

    const result = await analyzeStructured('분석해줘', withValidator, FALLBACK_OPTS);

    expect(result.object).toEqual({ a: 'ok' });
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});

describe('결함 ② — 출력 타입 추론', () => {
  it('zod v4 스키마의 결과 타입이 추론된다 (unknown 붕괴 회귀 방지)', async () => {
    const schema = z4.object({ summary: z4.string(), score: z4.number() });
    mockText('{"summary": "추론됨", "score": 42}');

    const result = await analyzeStructured('분석해줘', schema, FALLBACK_OPTS);

    // 아래 필드 접근은 pnpm typecheck가 검사한다 — 추론이 unknown이면 컴파일이 깨진다.
    const summary: string = result.object.summary;
    const score: number = result.object.score;
    expect(summary).toBe('추론됨');
    expect(score).toBe(42);
  });

  it('zod v3 스키마의 결과 타입도 그대로 추론된다', async () => {
    const schema = z3.object({ summary: z3.string(), score: z3.number() });
    mockText('{"summary": "v3", "score": 1}');

    const result = await analyzeStructured('분석해줘', schema, FALLBACK_OPTS);

    const summary: string = result.object.summary;
    expect(summary).toBe('v3');
  });

  it('.transform() 스키마는 입력이 아니라 출력 타입으로 추론된다', async () => {
    const schema = z4.object({ n: z4.string() }).transform((o) => ({ n: Number(o.n) }));
    mockText('{"n": "7"}');

    const result = await analyzeStructured('분석해줘', schema, FALLBACK_OPTS);

    const n: number = result.object.n;
    expect(n).toBe(7);
  });
});

describe('검증 경로 — v3·v4 동일 동작', () => {
  it('v4 스키마로 파싱·검증이 성공한다', async () => {
    const schema = z4.object({ a: z4.string() });
    const result = await tryParseAndValidate('{"a": "ok"}', schema);
    expect(result).toEqual({ ok: true, data: { a: 'ok' } });
  });

  it('v4 스키마 불일치 시 필드 수준 사유가 남는다', async () => {
    const schema = z4.object({ a: z4.string() });
    const result = await tryParseAndValidate('{"a": 1}', schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Zod 검증 실패');
      expect(result.reason).toContain('a:');
    }
  });
});
