import { describe, expect, it } from 'vitest';
import { selectStrategy } from './select-strategy';

describe('selectStrategy', () => {
  it('네이티브 구조화 출력 프로바이더는 native 전략', () => {
    expect(selectStrategy('anthropic')).toBe('native');
    expect(selectStrategy('openai')).toBe('native');
    expect(selectStrategy('gemini')).toBe('native');
    expect(selectStrategy('deepseek')).toBe('native');
    expect(selectStrategy('xai')).toBe('native');
  });

  it('requiresJsonMode 프로바이더(openrouter)도 native 전략 (v6는 mode 내부 선택)', () => {
    // AI SDK v6의 generateObject는 mode 플래그를 받지 않으므로 별도 전략이 없다.
    expect(selectStrategy('openrouter')).toBe('native');
  });

  it('구조화 출력 미지원 프로바이더는 text2step 전략', () => {
    expect(selectStrategy('claude-cli')).toBe('text2step');
    expect(selectStrategy('gemini-cli')).toBe('text2step');
    expect(selectStrategy('ollama')).toBe('text2step');
    expect(selectStrategy('custom')).toBe('text2step');
  });
});
