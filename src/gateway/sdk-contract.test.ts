// AI SDK 계약 테스트 — 다른 스위트와 달리 `ai`를 **mock하지 않는다**.
//
// 나머지 테스트는 `vi.mock('ai')`로 `generateText`를 통째로 갈아끼운다. 그러면
// "우리 코드가 어떤 인자로 부르는가"까지만 고정되고, SDK가 그 인자를 실제로
// 어떻게 처리하는지 — Output.object의 responseFormat 변환, provider usage의
// 중첩→평면 정규화, output resolve 조건, 에러 종류 — 는 전부 mock 뒤에 가린다.
// SDK 메이저 업그레이드에서 그 계층이 바뀌어도 CI는 초록이다.
//
// 여기서는 mock 경계를 **provider 구현**까지 내린다. `@ai-sdk/*` 팩토리만
// MockLanguageModelV4를 반환하도록 바꾸고, 그 위의 `ai` core는 실제로 돌린다.
// 커버리지를 다시 얻자는 게 아니라, SDK 업그레이드가 깨뜨릴 지점만 고정하는
// 카나리다. 여기가 빨개지면 SDK의 계약이 움직인 것이다.
//
// mock 스펙 버전은 **실제 프로바이더가 쓰는 것과 맞춰야 한다**. `ai/test`는 V3와
// V4를 모두 export하고 core가 둘 다 받으므로 V3로도 테스트는 통과하지만, 그러면
// 소비자가 실제로 타지 않는 경로를 검증하게 된다. 확인 방법은
// `createAnthropic({apiKey:'x'})('m').specificationVersion` — ai@6 계열
// (@ai-sdk/* v3)은 'v3', ai@7 계열(v4)은 'v4'다.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { z as z4 } from 'zod/v4';

/** provider 레벨(LanguageModelV4 spec)의 usage — SDK가 평면 형태로 변환한다 */
function providerUsage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

type Turn = { text: string; finish?: 'stop' | 'length'; input?: number; output?: number };

const hoisted = vi.hoisted(() => ({
  /** 현재 테스트가 쓰는 모델. 팩토리 mock이 호출 시점에 읽는다. */
  model: null as unknown,
  /** provider 경계에 실제로 도달한 호출 인자 */
  calls: [] as Record<string, unknown>[],
}));

/** 턴 목록을 순서대로 응답하는 모델을 설치하고, provider가 받은 인자를 기록한다 */
function installModel(...turns: Turn[]): void {
  let i = 0;
  hoisted.calls = [];
  hoisted.model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      hoisted.calls.push(options as unknown as Record<string, unknown>);
      const turn = turns[Math.min(i++, turns.length - 1)];
      return {
        content: [{ type: 'text' as const, text: turn.text }],
        finishReason: { unified: turn.finish ?? 'stop', raw: turn.finish ?? 'stop' },
        usage: providerUsage(turn.input ?? 10, turn.output ?? 5),
        warnings: [],
      };
    },
  });
}

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => hoisted.model }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: () => () => hoisted.model }));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => Object.assign(() => hoisted.model, { chat: () => hoisted.model }),
}));

import { analyzeStructured, analyzeText } from './gateway';
import { StructuredOutputError } from './strategies';

const TestSchema = z.object({ summary: z.string(), score: z.number() });

beforeEach(() => {
  hoisted.calls = [];
});

describe('SDK 계약 — native 구조화 출력', () => {
  it('Output.object가 provider 경계에 실제 JSON Schema를 responseFormat으로 내린다', async () => {
    installModel({ text: '{"summary":"ok","score":42}' });

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'anthropic' });

    expect(result.object).toEqual({ summary: 'ok', score: 42 });
    // 스키마가 프롬프트 텍스트가 아니라 responseFormat으로 간다 — 이 경로가 바뀌면
    // 프로바이더는 제약 없는 JSON을 받게 되고 우리는 알아채지 못한다.
    const format = hoisted.calls[0]?.responseFormat as { type: string; schema?: unknown };
    expect(format.type).toBe('json');
    expect(format.schema).toMatchObject({
      type: 'object',
      properties: { summary: { type: 'string' }, score: { type: 'number' } },
      required: ['summary', 'score'],
    });
  });

  it('스키마 제약(minimum/maxLength)이 provider까지 보존된다', async () => {
    installModel({ text: '{"score":5,"tag":"ab"}' });
    const Constrained = z.object({
      score: z.number().min(1).max(10),
      tag: z.string().max(8),
    });

    await analyzeStructured('분석해줘', Constrained, { provider: 'anthropic' });

    const schema = (hoisted.calls[0]?.responseFormat as { schema: Record<string, unknown> }).schema;
    expect(schema).toMatchObject({
      properties: {
        score: { minimum: 1, maximum: 10 },
        tag: { maxLength: 8 },
      },
    });
  });

  it('provider의 중첩 usage가 NormalizedUsage 평면 형태로 도달한다', async () => {
    installModel({ text: '{"summary":"ok","score":1}', input: 120, output: 34 });

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'openai' });

    // provider는 { inputTokens: { total } } 중첩으로 주고 SDK가 평면화한다.
    // 그 변환이 바뀌면 소비자의 비용 집계가 조용히 0이 된다.
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 34, totalTokens: 154 });
  });

  it('토큰 절단(finishReason=length)은 usage를 실은 진단 가능한 에러가 된다', async () => {
    // SDK는 finishReason이 'stop'일 때만 output을 resolve한다. 그대로 두면
    // result.output 접근이 NoOutputGeneratedError를 던지고, 과금된 usage가
    // 함께 유실돼 runModule의 실패-usage 보존 경로가 무력해진다.
    installModel({ text: '{"summary":"잘린', finish: 'length', input: 200, output: 4096 });

    await expect(
      analyzeStructured('분석해줘', TestSchema, { provider: 'anthropic' }),
    ).rejects.toThrow(StructuredOutputError);

    await expect(
      analyzeStructured('분석해줘', TestSchema, { provider: 'anthropic' }),
    ).rejects.toMatchObject({
      usage: { inputTokens: 200, outputTokens: 4096, totalTokens: 4296 },
    });
  });

  it('절단 에러 메시지가 finishReason을 밝힌다', async () => {
    installModel({ text: '{"partial', finish: 'length' });

    await expect(
      analyzeStructured('분석해줘', TestSchema, { provider: 'anthropic' }),
    ).rejects.toThrow(/length/);
  });

  it('스키마 위반 응답은 SDK의 NoObjectGeneratedError로 올라온다', async () => {
    installModel({ text: '{"summary":"ok","score":"문자열이라 위반"}' });

    // runModule이 이 에러 타입으로 실패-usage를 보존한다 (run-module.ts).
    await expect(
      analyzeStructured('분석해줘', TestSchema, { provider: 'anthropic' }),
    ).rejects.toMatchObject({ name: 'AI_NoObjectGeneratedError' });
  });

  it('anthropic은 classic tool_use 모드를 providerOptions로 지정한다', async () => {
    installModel({ text: '{"summary":"ok","score":1}' });

    await analyzeStructured('분석해줘', TestSchema, { provider: 'anthropic' });

    expect(hoisted.calls[0]?.providerOptions).toMatchObject({
      anthropic: { structuredOutputMode: 'jsonTool' },
    });
  });
});

describe('SDK 계약 — text2step 폴백', () => {
  it('step1이 유효 JSON이면 1회 호출로 끝나고 스키마 힌트가 프롬프트에 실린다', async () => {
    installModel({ text: '{"summary":"폴백 성공","score":7}' });

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama', model: 'llama3.2' });

    expect(result.object).toEqual({ summary: '폴백 성공', score: 7 });
    expect(hoisted.calls).toHaveLength(1);
    // 폴백은 responseFormat을 쓸 수 없으므로 스키마가 프롬프트 본문에 들어간다.
    expect(hoisted.calls[0]?.responseFormat).toBeUndefined();
    expect(JSON.stringify(hoisted.calls[0]?.prompt)).toContain('summary');
  });

  it('step1 실패 시 step2 변환 호출이 이어지고 두 호출의 usage가 합산된다', async () => {
    installModel(
      { text: '분석 결과는 대체로 긍정적입니다.', input: 100, output: 20 },
      { text: '{"summary":"긍정적","score":8}', input: 50, output: 10 },
    );

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama', model: 'llama3.2' });

    expect(result.object).toEqual({ summary: '긍정적', score: 8 });
    expect(hoisted.calls).toHaveLength(2);
    expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 30, totalTokens: 180 });
  });

  it('이중 실패는 두 호출의 usage를 실은 StructuredOutputError가 된다', async () => {
    installModel(
      { text: 'JSON이 아닙니다', input: 100, output: 20 },
      { text: '여전히 JSON이 아닙니다', input: 50, output: 10 },
    );

    await expect(
      analyzeStructured('분석해줘', TestSchema, { provider: 'ollama', model: 'llama3.2' }),
    ).rejects.toMatchObject({
      name: 'StructuredOutputError',
      usage: { inputTokens: 150, outputTokens: 30, totalTokens: 180 },
    });
  });

  it('마크다운 코드펜스에 싸인 JSON을 실제 추출 경로가 복구한다', async () => {
    installModel({ text: '```json\n{"summary":"펜스","score":3}\n```' });

    const result = await analyzeStructured('분석해줘', TestSchema, { provider: 'ollama', model: 'llama3.2' });

    expect(result.object).toEqual({ summary: '펜스', score: 3 });
    expect(hoisted.calls).toHaveLength(1);
  });
});

describe('SDK 계약 — zod v4 스키마도 같은 계약을 만족', () => {
  const V4Schema = z4.object({ summary: z4.string(), score: z4.number() });

  it('native 경로에서 v4 스키마가 responseFormat으로 변환된다', async () => {
    installModel({ text: '{"summary":"v4 ok","score":9}' });

    const result = await analyzeStructured('분석해줘', V4Schema, { provider: 'anthropic' });

    expect(result.object).toEqual({ summary: 'v4 ok', score: 9 });
    const format = hoisted.calls[0]?.responseFormat as { schema: Record<string, unknown> };
    expect(format.schema).toMatchObject({
      properties: { summary: { type: 'string' }, score: { type: 'number' } },
    });
  });

  it('폴백 경로에서 v4 스키마의 필드명이 프롬프트에 실린다', async () => {
    installModel({ text: '{"summary":"v4 폴백","score":2}' });

    const result = await analyzeStructured('분석해줘', V4Schema, { provider: 'ollama', model: 'llama3.2' });

    expect(result.object).toEqual({ summary: 'v4 폴백', score: 2 });
    // zod-to-json-schema는 v4에서 {}를 반환하므로 asSchema 경로를 타야 한다.
    expect(JSON.stringify(hoisted.calls[0]?.prompt)).toContain('summary');
  });
});

describe('SDK 계약 — analyzeText', () => {
  it('usage가 프로바이더 원본 필드와 정규화 필드를 함께 담는다', async () => {
    installModel({ text: '자유 텍스트 응답', input: 11, output: 22 });

    const result = await analyzeText('분석해줘', { provider: 'anthropic' });

    expect(result.text).toBe('자유 텍스트 응답');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toMatchObject({ inputTokens: 11, outputTokens: 22, totalTokens: 33 });
    // SDK가 붙이는 상세 필드도 살아 있어야 한다 (원본 병합 계약).
    expect(result.usage).toHaveProperty('outputTokenDetails');
  });

  it('abortSignal이 provider 호출까지 전파된다', async () => {
    installModel({ text: 'ok' });

    await analyzeText('분석해줘', { provider: 'anthropic' });

    expect(hoisted.calls[0]?.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
