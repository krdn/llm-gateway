// 프로바이더별 동시성 제어 — 같은 프로바이더의 모듈을 N개씩 묶어 순차 실행
import type { AnalysisModule, AnalysisModuleResult } from '../types';
import type { ConcurrencyAdapter } from '../adapters/concurrency';

/**
 * 모듈 배열을 프로바이더별로 그룹화하여 동시성을 제어한다.
 *
 * - 같은 프로바이더의 모듈은 어댑터가 정의한 limit만큼만 동시 실행
 * - 다른 프로바이더는 서로 독립 (전부 병렬)
 * - 각 모듈의 결과는 PromiseSettledResult로 반환 (부분 실패 허용)
 */
export async function runWithProviderGrouping<M extends AnalysisModule>(
  modules: M[],
  runner: (module: M) => Promise<AnalysisModuleResult>,
  concurrency: ConcurrencyAdapter,
): Promise<PromiseSettledResult<AnalysisModuleResult>[]> {
  // 1) provider별 그룹화
  const groups = new Map<string, M[]>();
  for (const m of modules) {
    const list = groups.get(m.provider) ?? [];
    list.push(m);
    groups.set(m.provider, list);
  }

  // 2) 각 그룹을 limit만큼 묶어 순차 실행하되, 그룹끼리는 병렬
  const groupPromises = Array.from(groups.entries()).map(async ([provider, mods]) => {
    const limit = await concurrency.getLimit(provider as M['provider']);
    const results: PromiseSettledResult<AnalysisModuleResult>[] = [];

    for (let i = 0; i < mods.length; i += limit) {
      const batch = mods.slice(i, i + limit);
      const batchResults = await Promise.allSettled(batch.map((m) => runner(m)));
      results.push(...batchResults);
    }
    return { provider, results };
  });

  const allResults = await Promise.all(groupPromises);

  // 3) 원본 모듈 순서대로 재정렬
  const moduleNameToResult = new Map<string, PromiseSettledResult<AnalysisModuleResult>>();
  for (const { provider, results } of allResults) {
    const groupModules = groups.get(provider)!;
    groupModules.forEach((m, idx) => {
      moduleNameToResult.set(m.name, results[idx]);
    });
  }

  return modules.map(
    (m) =>
      moduleNameToResult.get(m.name) ?? {
        status: 'rejected',
        reason: new Error(`module ${m.name} produced no result`),
      },
  );
}
