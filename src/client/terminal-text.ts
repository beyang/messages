import { stripVTControlCharacters } from 'node:util';

function shouldDropCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x00 && codePoint <= 0x08) ||
    (codePoint >= 0x0b && codePoint <= 0x1f) ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

function stripUnsafeCodePoints(text: string): string {
  let result = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && !shouldDropCodePoint(codePoint)) {
      result += char;
    }
  }
  return result;
}

export function sanitizeForTerminalText(text: string): string {
  const normalized = stripVTControlCharacters(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ');
  return stripUnsafeCodePoints(normalized);
}
