import { describe, expect, it, vi, beforeEach } from 'vitest';

// SDK mock 객체
const mockAnthropicClient = vi.fn((model: string) => ({ provider: 'anthropic', model }));
const mockGoogleClient = vi.fn((model: string) => ({ provider: 'gemini', model }));
const mockOpenAIClient = Object.assign(
  vi.fn((model: string) => ({ provider: 'openai', model })),
  { chat: vi.fn((model: string) => ({ provider: 'openai-chat', model })) },
);
const mockGeminiCliClient = vi.fn((model: string) => ({ provider: 'gemini-cli', model }));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => mockAnthropicClient),
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => mockGoogleClient),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => mockOpenAIClient),
}));
vi.mock('ai-sdk-provider-gemini-cli', () => ({
  createGeminiProvider: vi.fn(() => mockGeminiCliClient),
}));

import { getModel } from './model-factory';
import type { AIProvider } from './provider-meta';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

beforeEach(() => {
  vi.clearAllMocks();
  const freshChat = vi.fn((model: string) => ({ provider: 'openai-chat', model }));
  const freshDirect = Object.assign(
    vi.fn((model: string) => ({ provider: 'openai', model })),
    { chat: freshChat },
  );
  vi.mocked(createOpenAI).mockReturnValue(freshDirect as unknown as ReturnType<typeof createOpenAI>);
  vi.mocked(createAnthropic).mockReturnValue(mockAnthropicClient as unknown as ReturnType<typeof createAnthropic>);
  vi.mocked(createGoogleGenerativeAI).mockReturnValue(mockGoogleClient as unknown as ReturnType<typeof createGoogleGenerativeAI>);
});

describe('getModel', () => {
  // ── anthropic ──
  describe('anthropic', () => {
    it('createAnthropic으로 클라이언트 생성 후 client(modelName) 호출', async () => {
      await getModel('anthropic', 'claude-sonnet-4-6');
      expect(createAnthropic).toHaveBeenCalledWith({});
      expect(mockAnthropicClient).toHaveBeenCalledWith('claude-sonnet-4-6');
    });

    it('apiKey 전달 시 SDK에 전달', async () => {
      await getModel('anthropic', 'claude-sonnet-4-6', undefined, 'sk-test');
      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    });

    it('baseUrl 전달 시 SDK에 전달', async () => {
      await getModel('anthropic', 'claude-sonnet-4-6', 'https://custom.api');
      expect(createAnthropic).toHaveBeenCalledWith({ baseURL: 'https://custom.api' });
    });

    it('model 미지정 시 기본 모델 사용', async () => {
      await getModel('anthropic');
      expect(mockAnthropicClient).toHaveBeenCalledWith('claude-sonnet-5');
    });

    it('apiKey 미전달 시 throw하지 않음 (AI SDK의 환경변수 폴백 허용)', async () => {
      await expect(getModel('anthropic')).resolves.toBeDefined();
    });
  });

  // ── gemini ──
  describe('gemini', () => {
    it('createGoogleGenerativeAI로 클라이언트 생성 후 client(modelName) 호출', async () => {
      await getModel('gemini', 'gemini-2.5-flash');
      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({});
      expect(mockGoogleClient).toHaveBeenCalledWith('gemini-2.5-flash');
    });

    it('apiKey/baseUrl 전달', async () => {
      await getModel('gemini', 'gemini-2.5-flash', 'https://custom', 'gem-key');
      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'gem-key',
        baseURL: 'https://custom',
      });
    });

    it('model 미지정 시 기본 모델 사용', async () => {
      await getModel('gemini');
      expect(mockGoogleClient).toHaveBeenCalledWith('gemini-3.7-flash');
    });
  });

  // ── gemini-cli (동적 import) ──
  describe('gemini-cli', () => {
    it('동적 import로 createGeminiProvider 호출, authType=oauth-personal', async () => {
      await getModel('gemini-cli', 'gemini-2.5-flash');
      const { createGeminiProvider } = await import('ai-sdk-provider-gemini-cli');
      expect(createGeminiProvider).toHaveBeenCalledWith({ authType: 'oauth-personal' });
      expect(mockGeminiCliClient).toHaveBeenCalledWith('gemini-2.5-flash');
    });
  });

  // ── claude-cli ──
  describe('claude-cli', () => {
    it('createOpenAI + client.chat() 호출, 기본 baseUrl=http://localhost:8317/v1', async () => {
      await getModel('claude-cli', 'claude-sonnet-4-6', undefined, 'my-key');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8317/v1',
        apiKey: 'my-key',
      });
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client.chat).toHaveBeenCalledWith('claude-sonnet-4-6');
    });

    it('커스텀 baseUrl에 /v1 suffix 자동 추가', async () => {
      await getModel('claude-cli', 'claude-sonnet-4-6', 'http://myproxy:9000', 'my-key');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'http://myproxy:9000/v1',
        apiKey: 'my-key',
      });
    });

    it('이미 /v1으로 끝나는 baseUrl은 그대로 사용', async () => {
      await getModel('claude-cli', 'claude-sonnet-4-6', 'http://myproxy:9000/v1', 'my-key');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'http://myproxy:9000/v1',
        apiKey: 'my-key',
      });
    });

    it('apiKey 미전달 시 명시적 에러 — cli-proxy-api는 api-keys를 검증하므로 기본 키가 없다', async () => {
      await expect(getModel('claude-cli', 'claude-sonnet-4-6')).rejects.toThrow(
        /apiKey가 필요합니다/,
      );
      expect(createOpenAI).not.toHaveBeenCalled();
    });
  });

  // ── OpenAI 호환 chat 그룹 ──
  describe.each([
    ['ollama', 'http://localhost:11434/v1', undefined, 'ollama'],
    ['deepseek', 'https://api.deepseek.com/v1', 'sk-deep', 'sk-deep'],
    ['xai', 'https://api.x.ai/v1', 'sk-xai', 'sk-xai'],
    ['openrouter', 'https://openrouter.ai/api/v1', 'sk-or', 'sk-or'],
  ] as const)('%s', (provider, expectedBaseUrl, apiKey, expectedApiKey) => {
    it(`createOpenAI + client.chat() 호출, 기본 baseUrl=${expectedBaseUrl}`, async () => {
      await getModel(provider, 'test-model', undefined, apiKey);
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: expectedBaseUrl,
        apiKey: expectedApiKey,
      });
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client.chat).toHaveBeenCalledWith('test-model');
    });

    it('커스텀 baseUrl에 /v1 suffix 자동 추가', async () => {
      await getModel(provider, 'test-model', 'http://custom:8080', apiKey);
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://custom:8080/v1' }),
      );
    });

    it('이미 /v1으로 끝나는 baseUrl은 그대로', async () => {
      await getModel(provider, 'test-model', 'http://custom:8080/v1', apiKey);
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://custom:8080/v1' }),
      );
    });

    it('trailing slash 제거', async () => {
      await getModel(provider, 'test-model', 'http://custom:8080/', apiKey);
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://custom:8080/v1' }),
      );
    });
  });

  // ── custom (baseUrl 필수) ──
  describe('custom', () => {
    it('baseUrl 지정 시 정상 동작 (기본 apiKey=ollama)', async () => {
      await getModel('custom', 'test-model', 'http://my-server:8080');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'http://my-server:8080/v1',
        apiKey: 'ollama',
      });
    });

    it('baseUrl 미지정 시 명시적 에러 (localhost 폴백 금지)', async () => {
      await expect(getModel('custom', 'test-model')).rejects.toThrow(
        /baseUrl이 필요합니다/,
      );
      expect(createOpenAI).not.toHaveBeenCalled();
    });
  });

  // ── openai ──
  describe('openai', () => {
    it('createOpenAI + client(modelName) 호출 (chat 아님)', async () => {
      await getModel('openai', 'gpt-4.1-nano');
      expect(createOpenAI).toHaveBeenCalledWith({});
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client).toHaveBeenCalledWith('gpt-4.1-nano');
      expect(client.chat).not.toHaveBeenCalled();
    });

    it('apiKey/baseUrl 전달', async () => {
      await getModel('openai', 'gpt-4.1-nano', 'https://custom', 'sk-test');
      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-test',
        baseURL: 'https://custom',
      });
    });

    it('model 미지정 시 기본 모델 사용', async () => {
      await getModel('openai');
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client).toHaveBeenCalledWith('gpt-5.6-luna');
    });
  });

  // ── 레지스트리 불변식 강제 ──
  describe('레지스트리 불변식 강제', () => {
    it('deepseek: 기본 모델 deepseek-v4-flash', async () => {
      await getModel('deepseek', undefined, undefined, 'sk-deep');
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client.chat).toHaveBeenCalledWith('deepseek-v4-flash');
    });

    it('기본 모델이 없는 프로바이더에 model 미지정 시 명시적 에러 (임의 폴백 금지)', async () => {
      await expect(getModel('ollama')).rejects.toThrow(/기본 모델이 없습니다/);
      expect(createOpenAI).not.toHaveBeenCalled();
    });

    it('requiresApiKey인 chat 프로바이더에 apiKey 미전달 시 명시적 에러 (가짜 키 전송 금지)', async () => {
      await expect(getModel('deepseek', 'deepseek-chat')).rejects.toThrow(
        /apiKey가 필요합니다/,
      );
      expect(createOpenAI).not.toHaveBeenCalled();
    });

    it('알 수 없는 provider는 명시적 에러 (사용 가능 목록 포함)', async () => {
      await expect(
        getModel('not-a-provider' as AIProvider, 'some-model'),
      ).rejects.toThrow(/알 수 없는 provider.*anthropic/);
    });
  });
});
