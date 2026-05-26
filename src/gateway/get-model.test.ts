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

import { getModel } from './gateway';
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
      expect(mockAnthropicClient).toHaveBeenCalledWith('claude-sonnet-4-6');
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
      expect(mockGoogleClient).toHaveBeenCalledWith('gemini-2.5-flash');
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
      await getModel('claude-cli', 'claude-sonnet-4-6');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'http://localhost:8317/v1',
        apiKey: 'cli-proxy',
      });
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client.chat).toHaveBeenCalledWith('claude-sonnet-4-6');
    });

    it('커스텀 baseUrl에 /v1 suffix 자동 추가', async () => {
      await getModel('claude-cli', 'claude-sonnet-4-6', 'http://myproxy:9000');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'http://myproxy:9000/v1',
        apiKey: 'cli-proxy',
      });
    });

    it('이미 /v1으로 끝나는 baseUrl은 그대로 사용', async () => {
      await getModel('claude-cli', 'claude-sonnet-4-6', 'http://myproxy:9000/v1');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: 'http://myproxy:9000/v1',
        apiKey: 'cli-proxy',
      });
    });

    it('apiKey 전달 시 cli-proxy 대신 사용', async () => {
      await getModel('claude-cli', 'claude-sonnet-4-6', undefined, 'my-key');
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'my-key' }),
      );
    });
  });

  // ── OpenAI 호환 그룹 (ollama, deepseek, xai, openrouter, custom) ──
  describe.each([
    ['ollama', 'http://localhost:11434/v1', 'ollama'],
    ['deepseek', 'https://api.deepseek.com/v1', 'ollama'],
    ['xai', 'https://api.x.ai/v1', 'ollama'],
    ['openrouter', 'https://openrouter.ai/api/v1', 'ollama'],
    ['custom', 'http://localhost:11434/v1', 'ollama'],
  ] as const)('%s', (provider, expectedBaseUrl, expectedDefaultApiKey) => {
    it(`createOpenAI + client.chat() 호출, 기본 baseUrl=${expectedBaseUrl}`, async () => {
      await getModel(provider, 'test-model');
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: expectedBaseUrl,
        apiKey: expectedDefaultApiKey,
      });
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client.chat).toHaveBeenCalledWith('test-model');
    });

    it('커스텀 baseUrl에 /v1 suffix 자동 추가', async () => {
      await getModel(provider, 'test-model', 'http://custom:8080');
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://custom:8080/v1' }),
      );
    });

    it('이미 /v1으로 끝나는 baseUrl은 그대로', async () => {
      await getModel(provider, 'test-model', 'http://custom:8080/v1');
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://custom:8080/v1' }),
      );
    });

    it('trailing slash 제거', async () => {
      await getModel(provider, 'test-model', 'http://custom:8080/');
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://custom:8080/v1' }),
      );
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
      expect(client).toHaveBeenCalledWith('gpt-4.1-nano');
    });
  });

  // ── 기본 모델 해소 ──
  describe('기본 모델 해소', () => {
    it('deepseek: 기본 모델 deepseek-chat', async () => {
      await getModel('deepseek');
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client.chat).toHaveBeenCalledWith('deepseek-chat');
    });

    it('DEFAULT_MODELS에 없는 프로바이더는 gpt-4.1-nano 폴백', async () => {
      await getModel('ollama');
      const client = vi.mocked(createOpenAI).mock.results[0]?.value;
      expect(client.chat).toHaveBeenCalledWith('gpt-4.1-nano');
    });
  });
});
