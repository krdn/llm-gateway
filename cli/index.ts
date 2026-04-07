#!/usr/bin/env node
// @krdn/ai-analysis-kit CLI
// Usage:
//   ai-analysis list
//   ai-analysis run <module> --input ./sample.json [--provider <p>] [--model <m>]
//   ai-analysis run-all --input ./sample.json --output ./results
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { cac } from 'cac';
import {
  ALL_MODULES,
  getModuleByName,
  runModule,
  createInMemoryModelConfig,
  type AnalysisInput,
} from '../src';

const cli = cac('ai-analysis');

cli.command('list', '12개 분석 모듈 목록 출력').action(() => {
  console.log('Available analysis modules:\n');
  for (const m of ALL_MODULES) {
    console.log(`  ${m.name.padEnd(20)} ${m.provider}/${m.model}  — ${m.displayName}`);
  }
});

cli
  .command('run <module>', '단일 모듈 실행')
  .option('--input <path>', '입력 JSON 파일 경로')
  .option('--provider <provider>', '프로바이더 오버라이드 (anthropic|gemini|openai|...)')
  .option('--model <model>', '모델 오버라이드')
  .option('--output <path>', '결과 출력 파일 경로 (생략 시 stdout)')
  .action(async (moduleName: string, opts: Record<string, string | undefined>) => {
    const module = getModuleByName(moduleName);
    if (!module) {
      console.error(`Unknown module: ${moduleName}`);
      console.error(`Run 'ai-analysis list' to see available modules.`);
      process.exit(1);
    }
    if (!opts.input) {
      console.error('--input <path> is required');
      process.exit(1);
    }

    const input = await loadInput(opts.input);
    const configAdapter = createInMemoryModelConfig({
      overrides: {
        [moduleName]: {
          ...(opts.provider ? { provider: opts.provider as never } : {}),
          ...(opts.model ? { model: opts.model } : {}),
        },
      },
    });

    const result = await runModule(module, input, {
      configAdapter,
      onProgress: (e) => {
        if (e.phase === 'start') console.error(`▶ ${e.module} 시작`);
        if (e.phase === 'retry') console.error(`↻ ${e.module} ${e.message}`);
        if (e.phase === 'complete') console.error(`✓ ${e.module} 완료`);
        if (e.phase === 'fail') console.error(`✗ ${e.module} 실패: ${e.message}`);
      },
    });

    const out = JSON.stringify(result, null, 2);
    if (opts.output) {
      await mkdir(dirname(opts.output), { recursive: true });
      await writeFile(opts.output, out, 'utf8');
      console.error(`✓ 결과 저장: ${opts.output}`);
    } else {
      console.log(out);
    }
  });

cli
  .command('run-all', '모든 모듈 실행 (병렬 + 의존성 순서)')
  .option('--input <path>', '입력 JSON 파일 경로')
  .option('--output <dir>', '결과 디렉토리 (모듈별 JSON)')
  .action(async (opts: Record<string, string | undefined>) => {
    if (!opts.input || !opts.output) {
      console.error('--input <path> and --output <dir> are required');
      process.exit(1);
    }
    const input = await loadInput(opts.input);
    const configAdapter = createInMemoryModelConfig();
    await mkdir(opts.output, { recursive: true });

    const priorResults: Record<string, unknown> = {};
    for (const m of ALL_MODULES) {
      console.error(`[${m.name}] 실행 중...`);
      const result = await runModule(m, input, { configAdapter }, priorResults);
      if (result.status === 'completed') priorResults[m.name] = result.result;
      await writeFile(
        join(opts.output, `${m.name}.json`),
        JSON.stringify(result, null, 2),
        'utf8',
      );
    }
    console.error(`✓ 전체 ${ALL_MODULES.length}개 모듈 완료`);
  });

cli
  .command('eval', '스냅샷 회귀 테스트 (TODO: harness 구현)')
  .option('--update', '스냅샷 갱신')
  .action(() => {
    console.error('eval harness는 다음 릴리스에서 제공됩니다.');
    process.exit(2);
  });

cli.help();
cli.version('1.0.0');
cli.parse();

async function loadInput(path: string): Promise<AnalysisInput> {
  const raw = await readFile(resolve(path), 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const dr = parsed.dateRange as { start: string; end: string } | undefined;
  if (dr) {
    (parsed as Record<string, unknown>).dateRange = {
      start: new Date(dr.start),
      end: new Date(dr.end),
    };
  }
  return parsed as unknown as AnalysisInput;
}
