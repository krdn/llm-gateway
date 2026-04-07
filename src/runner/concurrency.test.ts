import { describe, expect, it } from 'vitest';
import { runWithProviderGrouping } from './concurrency';
import type { AnalysisModule, AnalysisModuleResult } from '../types';
import type { ConcurrencyAdapter } from '../adapters/concurrency';
import { z } from 'zod';

function makeModule(name: string, provider: AnalysisModule['provider']): AnalysisModule {
  return {
    name,
    displayName: name,
    provider,
    model: 'test-model',
    schema: z.object({}),
    buildPrompt: () => '',
    buildSystemPrompt: () => '',
  };
}

const staticConcurrency = (limit: number): ConcurrencyAdapter => ({
  async getLimit() {
    return limit;
  },
});

describe('runWithProviderGrouping', () => {
  it('빈 배열 → 빈 결과', async () => {
    const results = await runWithProviderGrouping([], async () => {
      throw new Error('should not run');
    }, staticConcurrency(1));
    expect(results).toEqual([]);
  });

  it('모든 모듈이 성공하면 fulfilled로 반환', async () => {
    const modules = [
      makeModule('a', 'anthropic'),
      makeModule('b', 'openai'),
    ];
    const results = await runWithProviderGrouping(
      modules,
      async (m) => ({ module: m.name, status: 'completed' as const }),
      staticConcurrency(2),
    );
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
  });

  it('원본 모듈 순서를 유지한다', async () => {
    const modules = [
      makeModule('first', 'anthropic'),
      makeModule('second', 'openai'),
      makeModule('third', 'anthropic'),
    ];
    const results = await runWithProviderGrouping(
      modules,
      async (m) => ({ module: m.name, status: 'completed' as const }),
      staticConcurrency(1),
    );
    const names = results.map((r) =>
      r.status === 'fulfilled' ? (r.value as AnalysisModuleResult).module : null,
    );
    expect(names).toEqual(['first', 'second', 'third']);
  });

  it('실패는 rejected로 격리되고 다른 모듈은 계속 실행', async () => {
    const modules = [
      makeModule('ok1', 'anthropic'),
      makeModule('boom', 'anthropic'),
      makeModule('ok2', 'openai'),
    ];
    const results = await runWithProviderGrouping(
      modules,
      async (m) => {
        if (m.name === 'boom') throw new Error('explode');
        return { module: m.name, status: 'completed' as const };
      },
      staticConcurrency(1),
    );
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
  });

  it('동일 프로바이더는 limit 단위로 배치 처리', async () => {
    const modules = [
      makeModule('m1', 'anthropic'),
      makeModule('m2', 'anthropic'),
      makeModule('m3', 'anthropic'),
      makeModule('m4', 'anthropic'),
    ];

    let inFlight = 0;
    let maxInFlight = 0;
    const results = await runWithProviderGrouping(
      modules,
      async (m) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { module: m.name, status: 'completed' as const };
      },
      staticConcurrency(2),
    );
    expect(results).toHaveLength(4);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('서로 다른 프로바이더는 병렬로 실행 (limit 무관)', async () => {
    const modules = [
      makeModule('a', 'anthropic'),
      makeModule('o', 'openai'),
      makeModule('g', 'gemini'),
    ];

    let inFlight = 0;
    let maxInFlight = 0;
    await runWithProviderGrouping(
      modules,
      async (m) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { module: m.name, status: 'completed' as const };
      },
      staticConcurrency(1),
    );
    // 3개 프로바이더가 각각 limit=1이지만 서로 독립적이므로 3개 동시 실행 가능
    expect(maxInFlight).toBe(3);
  });
});
