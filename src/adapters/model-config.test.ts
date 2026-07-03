import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryModelConfig } from './model-config';

describe('createInMemoryModelConfig', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('기본 modules 매핑을 그대로 해석', async () => {
    const adapter = createInMemoryModelConfig({
      modules: {
        'macro-view': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      },
    });
    const cfg = await adapter.resolve('macro-view');
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.model).toBe('claude-sonnet-4-6');
  });

  it('알 수 없는 모듈명은 명확한 에러', async () => {
    const adapter = createInMemoryModelConfig({ modules: {} });
    await expect(adapter.resolve('unknown')).rejects.toThrow(/Unknown module/);
  });

  it('override.provider로 프로바이더를 바꾸면 바뀐 프로바이더의 defaults가 적용됨', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
      overrides: { mod: { provider: 'openai', model: 'gpt-4.1-nano' } },
      providerDefaults: {
        openai: { apiKey: 'sk-openai' },
        anthropic: { baseUrl: 'https://claude-proxy' },
      },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.provider).toBe('openai');
    expect(cfg.apiKey).toBe('sk-openai'); // openai defaults 적용
    expect(cfg.baseUrl).toBeUndefined(); // anthropic defaults가 새어들지 않음
  });

  it('provider 전환 시 새 프로바이더의 providerDefaults.model이 base.model보다 우선', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
      overrides: { mod: { provider: 'openai' } },
      providerDefaults: { openai: { model: 'gpt-4.1-nano' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.provider).toBe('openai');
    expect(cfg.model).toBe('gpt-4.1-nano');
  });

  it('override.timeoutMs 반영', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
      overrides: { mod: { timeoutMs: 120_000 } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.timeoutMs).toBe(120_000);
  });

  it('환경변수에서 apiKey 자동 추론 (Anthropic)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.apiKey).toBe('sk-ant-test');
  });

  it('환경변수 GOOGLE_GENERATIVE_AI_API_KEY 우선, GEMINI_API_KEY 폴백', async () => {
    process.env.GEMINI_API_KEY = 'gem-fallback';
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'gemini', model: 'gemini-2.5-flash' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.apiKey).toBe('gem-fallback');

    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'gem-primary';
    const cfg2 = await adapter.resolve('mod');
    expect(cfg2.apiKey).toBe('gem-primary');
  });

  it('providerDefaults가 환경변수보다 우선', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
      providerDefaults: { anthropic: { apiKey: 'default-key' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.apiKey).toBe('default-key');
  });

  it('모듈별 override가 providerDefaults보다 우선', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
      providerDefaults: { anthropic: { apiKey: 'default-key', baseUrl: 'https://default' } },
      overrides: { mod: { apiKey: 'override-key', baseUrl: 'https://override' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.apiKey).toBe('override-key');
    expect(cfg.baseUrl).toBe('https://override');
  });

  it('override.model이 base.model을 덮어씀', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'openai', model: 'gpt-4.1-nano' } },
      overrides: { mod: { model: 'gpt-4o-mini' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.model).toBe('gpt-4o-mini');
  });

  it('override.provider 변경 가능', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'openai', model: 'gpt-4.1-nano' } },
      overrides: { mod: { provider: 'anthropic', model: 'claude-sonnet-4-6' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.model).toBe('claude-sonnet-4-6');
  });

  it('apiKey/baseUrl이 없으면 결과 객체에 포함되지 않음', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'ollama', model: 'llama3' } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg).not.toHaveProperty('apiKey');
    expect(cfg).not.toHaveProperty('baseUrl');
    expect(cfg).not.toHaveProperty('maxOutputTokens');
  });

  it('maxOutputTokens override 반영', async () => {
    const adapter = createInMemoryModelConfig({
      modules: { mod: { provider: 'openai', model: 'gpt-4.1-nano' } },
      overrides: { mod: { maxOutputTokens: 16384 } },
    });
    const cfg = await adapter.resolve('mod');
    expect(cfg.maxOutputTokens).toBe(16384);
  });
});
