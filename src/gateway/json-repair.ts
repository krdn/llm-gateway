import type { z } from 'zod';

/**
 * LLM 텍스트 응답에서 JSON 문자열을 추출한다.
 *
 * 추출 우선순위:
 *   1. ```json ... ``` 또는 ``` ... ``` 코드블록 내부
 *   2. 최외곽 `{...}` 또는 `[...]`
 *   3. 위 둘 다 실패 시 입력 문자열 전체 (trim)
 *
 * 추출 후 `JSON.parse`로 유효성을 검사하고, 실패 시
 * `repairTruncatedJson()`으로 토큰 초과로 잘린 응답을 복구한다.
 */
export function extractJson(text: string): string {
  let json: string;
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    json = jsonMatch ? jsonMatch[1].trim() : text.trim();
  }

  try {
    JSON.parse(json);
    return json;
  } catch {
    return repairTruncatedJson(json);
  }
}

/**
 * 토큰 초과로 잘린 JSON 문자열을 복구한다.
 *
 * 알고리즘:
 *   1. 홀수 개의 `"` (열린 문자열)이 있으면 마지막 미완성 키-값을 잘라냄
 *   2. 마지막 `}`/`]` 뒤에 남은 부분 문자열에 `,`만 있으면 잘라냄
 *   3. 트레일링 쉼표 제거
 *   4. 스택 기반으로 열린 `{`/`[`를 역순으로 닫아 균형 맞춤
 */
export function repairTruncatedJson(json: string): string {
  let trimmed = json;

  const quoteCount = (trimmed.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    const lastQuote = trimmed.lastIndexOf('"');
    const beforeLastQuote = trimmed.lastIndexOf('"', lastQuote - 1);
    if (beforeLastQuote > 0) {
      trimmed = trimmed.substring(0, beforeLastQuote);
    }
  }

  const lastCloseBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (lastCloseBrace > 0) {
    const afterClose = trimmed.substring(lastCloseBrace + 1).trim();
    if (afterClose.startsWith(',')) {
      trimmed = trimmed.substring(0, lastCloseBrace + 1);
    }
  }

  trimmed = trimmed.replace(/,\s*$/, '');

  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }

  while (stack.length > 0) {
    const open = stack.pop();
    trimmed += open === '{' ? '}' : ']';
  }

  return trimmed;
}

/** JSON 추출 → 파싱 → Zod 검증. 실패 시 null 반환. */
export function tryParseAndValidate<T>(
  text: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T | null {
  if (!text || text.trim().length === 0) return null;

  const jsonStr = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    console.warn(`[llm-gateway] Zod 검증 실패: ${issues}`);
    return null;
  }
  return validated.data;
}
