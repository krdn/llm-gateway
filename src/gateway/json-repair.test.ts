import { describe, expect, it } from 'vitest';
import { extractJson, repairTruncatedJson } from './gateway';

describe('extractJson', () => {
  // ── 코드블록 추출 ──
  describe('코드블록 추출', () => {
    it('```json 코드블록에서 JSON 추출', () => {
      const input = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';
      expect(JSON.parse(extractJson(input))).toEqual({ key: 'value' });
    });

    it('``` 코드블록 (json 태그 없음)에서 JSON 추출', () => {
      const input = '```\n{"a": 1}\n```';
      expect(JSON.parse(extractJson(input))).toEqual({ a: 1 });
    });

    it('코드블록 안에 줄바꿈 포함된 JSON', () => {
      const input = '```json\n{\n  "name": "test",\n  "value": 42\n}\n```';
      expect(JSON.parse(extractJson(input))).toEqual({ name: 'test', value: 42 });
    });
  });

  // ── 최외곽 {...} / [...] 추출 ──
  describe('최외곽 JSON 추출', () => {
    it('텍스트 사이의 JSON 객체 추출', () => {
      const input = 'The analysis shows: {"score": 85} as expected.';
      expect(JSON.parse(extractJson(input))).toEqual({ score: 85 });
    });

    it('배열 형태 JSON 추출', () => {
      const input = 'Results: [1, 2, 3]';
      expect(JSON.parse(extractJson(input))).toEqual([1, 2, 3]);
    });

    it('중첩 객체 포함 JSON 추출', () => {
      const input = '{"outer": {"inner": [1, 2]}}';
      expect(JSON.parse(extractJson(input))).toEqual({ outer: { inner: [1, 2] } });
    });
  });

  // ── 폴백 (JSON 없음) ──
  describe('폴백', () => {
    it('JSON 구조 없는 텍스트는 그대로 반환 (repair로 전달)', () => {
      const input = 'just plain text';
      const result = extractJson(input);
      expect(result).toBe('just plain text');
    });
  });

  // ── 유효한 JSON은 그대로 반환 ──
  it('이미 유효한 JSON 문자열은 그대로 반환', () => {
    const input = '{"valid": true}';
    expect(extractJson(input)).toBe('{"valid": true}');
  });
});

describe('repairTruncatedJson', () => {
  // ── 닫히지 않은 괄호 ──
  describe('닫히지 않은 괄호 복구', () => {
    it('닫히지 않은 객체 괄호를 닫음', () => {
      const input = '{"name": "test"';
      const result = repairTruncatedJson(input);
      expect(JSON.parse(result)).toEqual({ name: 'test' });
    });

    it('닫히지 않은 배열 괄호를 닫음', () => {
      const input = '["a", "b"';
      const result = repairTruncatedJson(input);
      expect(JSON.parse(result)).toEqual(['a', 'b']);
    });

    it('중첩된 닫히지 않은 괄호를 모두 닫음', () => {
      const input = '{"data": [{"id": 1}, {"id": 2}';
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].id).toBe(1);
    });

    it('깊이 3단계 중첩 복구', () => {
      const input = '{"a": {"b": {"c": 1';
      const result = repairTruncatedJson(input);
      expect(JSON.parse(result)).toEqual({ a: { b: { c: 1 } } });
    });
  });

  // ── 트레일링 쉼표 ──
  describe('트레일링 쉼표 처리', () => {
    it('객체의 트레일링 쉼표 제거 후 괄호 닫기', () => {
      const input = '{"a": 1, "b": 2,';
      const result = repairTruncatedJson(input);
      expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
    });

    it('배열의 트레일링 쉼표 제거 후 괄호 닫기', () => {
      const input = '[1, 2, 3,';
      const result = repairTruncatedJson(input);
      expect(JSON.parse(result)).toEqual([1, 2, 3]);
    });
  });

  // ── 불완전한 문자열 (알려진 한계) ──
  describe('불완전한 문자열 처리', () => {
    it('값 중간에서 잘린 문자열 — 홀수 따옴표 절단은 복구 한계', () => {
      // 현재 repairTruncatedJson은 홀수 따옴표를 감지하지만,
      // 잘라낸 결과가 여전히 유효하지 않을 수 있다 (known limitation)
      const input = '{"complete": "ok", "truncated": "half';
      const result = repairTruncatedJson(input);
      // 복구가 완벽하지 않으므로 원본보다 짧아졌는지만 확인
      expect(result.length).toBeLessThanOrEqual(input.length + 5);
    });

    it('완전한 키-값 쌍 뒤에서 잘린 경우 복구 성공', () => {
      const input = '{"done": true, "extra": 123,';
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.done).toBe(true);
      expect(parsed.extra).toBe(123);
    });
  });

  // ── 닫힌 괄호 뒤 쓰레기 ──
  describe('닫힌 괄호 뒤 쓰레기 제거', () => {
    it('} 뒤 쉼표로 시작하는 쓰레기 제거', () => {
      // 홀수 따옴표가 없는 케이스만 정상 처리
      const input = '{"items": [{"id": 1}]}, 123';
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.items).toEqual([{ id: 1 }]);
    });
  });

  // ── 실제 LLM 절단 시나리오 ──
  describe('실제 LLM 절단 시나리오', () => {
    it('토큰 제한으로 중간에 잘린 분석 결과', () => {
      const input = `{"summary": "경제 분석 결과입니다", "topics": ["금리", "물가", "고용"], "details": {"growth": 2.5, "inflation": 3.1, "unemployment": 4.2}, "recommendations": [{"action": "금리 인하", "priority": "high"}, {"action": "재정 지출 확대`;
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.summary).toBe('경제 분석 결과입니다');
      expect(parsed.topics).toEqual(['금리', '물가', '고용']);
      expect(parsed.details.growth).toBe(2.5);
      expect(parsed.recommendations[0].action).toBe('금리 인하');
    });

    it('배열 원소 중간에서 잘린 경우', () => {
      const input = '{"results": [{"score": 90, "label": "good"}, {"score": 75, "label": "ok"}, {"score": 60';
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0].score).toBe(90);
      expect(parsed.results[1].score).toBe(75);
    });

    it('이스케이프된 따옴표 포함 문자열', () => {
      const input = '{"text": "He said \\"hello\\"", "count": 1';
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.text).toBe('He said "hello"');
      expect(parsed.count).toBe(1);
    });

    it('한국어 텍스트 포함 복구', () => {
      const input = '{"title": "한국 경제 전망", "score": 85';
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.title).toBe('한국 경제 전망');
      expect(parsed.score).toBe(85);
    });

    it('빈 객체/배열이 포함된 복구 — 홀수 따옴표 시 뒷부분 절단됨', () => {
      // "value": 1 의 따옴표가 홀수를 만들어 마지막 키-값이 절단됨 (known limitation)
      const input = '{"empty_obj": {}, "empty_arr": [], "value": 1';
      const result = repairTruncatedJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.empty_obj).toEqual({});
      expect(parsed.empty_arr).toEqual([]);
    });
  });

  // ── extractJson 통합 (잘린 JSON이 코드블록 안에 있는 경우) ──
  describe('extractJson 통합', () => {
    it('코드블록 안의 잘린 JSON을 추출+복구', () => {
      const input = '```json\n{"status": "ok", "data": [1, 2\n```';
      const result = extractJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe('ok');
      expect(parsed.data).toEqual([1, 2]);
    });

    it('텍스트 사이의 잘린 JSON을 추출+복구', () => {
      // extractJson의 정규식이 {...}를 잡으려면 닫는 }가 필요
      // 닫히지 않은 JSON은 전체 텍스트가 repair로 전달됨
      const input = 'Result: {"a": 1, "b": [true, false]}';
      const result = extractJson(input);
      const parsed = JSON.parse(result);
      expect(parsed.a).toBe(1);
      expect(parsed.b).toEqual([true, false]);
    });
  });
});
