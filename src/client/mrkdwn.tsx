import { Text } from 'ink';
import { sanitizeForTerminalText } from './terminal-text.js';

interface Segment {
  type:
    | 'text'
    | 'link'
    | 'mention'
    | 'channel'
    | 'bold'
    | 'italic'
    | 'strike'
    | 'code';
  text: string;
  url?: string;
}

/**
 * Parse Slack mrkdwn into an array of typed segments.
 *
 * Handles:
 *  - <https://…|label> and <https://…> hyperlinks
 *  - <@U123|name> and <@U123> user mentions
 *  - <#C123|channel> and <#C123> channel mentions
 *  - *bold*, _italic_, ~strike~, `code`
 */
export function parseMrkdwn(input: string): Segment[] {
  const normalizedInput = sanitizeForTerminalText(input);
  const segments: Segment[] = [];

  // First pass: split on Slack angle-bracket tokens  <…>
  const angleBracketRe = /<([^>]+)>/g;
  let cursor = 0;
  let match = angleBracketRe.exec(normalizedInput);

  while (match !== null) {
    if (match.index > cursor) {
      pushInlineSegments(segments, normalizedInput.slice(cursor, match.index));
    }
    const inner = match[1];
    if (inner.startsWith('@')) {
      // user mention  <@U123|Display Name> or <@U123>
      const parts = inner.slice(1).split('|');
      segments.push({ type: 'mention', text: `@${parts[1] ?? parts[0]}` });
    } else if (inner.startsWith('#')) {
      // channel mention  <#C123|general> or <#C123>
      const parts = inner.slice(1).split('|');
      segments.push({ type: 'channel', text: `#${parts[1] ?? parts[0]}` });
    } else {
      // hyperlink  <url|label> or <url>
      const pipe = inner.indexOf('|');
      if (pipe !== -1) {
        segments.push({
          type: 'link',
          url: inner.slice(0, pipe),
          text: inner.slice(pipe + 1),
        });
      } else {
        segments.push({ type: 'link', url: inner, text: inner });
      }
    }
    cursor = match.index + match[0].length;
    match = angleBracketRe.exec(normalizedInput);
  }

  if (cursor < normalizedInput.length) {
    pushInlineSegments(segments, normalizedInput.slice(cursor));
  }

  return segments;
}

/** Second pass: split plain text on inline formatting tokens. */
function pushInlineSegments(segments: Segment[], text: string): void {
  // Match *bold*, _italic_, ~strike~, `code`
  const inlineRe = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  let cursor = 0;
  let match = inlineRe.exec(text);

  while (match !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, match.index) });
    }
    const raw = match[1];
    const inner = raw.slice(1, -1);
    const ch = raw[0];
    if (ch === '*') {
      segments.push({ type: 'bold', text: inner });
    } else if (ch === '_') {
      segments.push({ type: 'italic', text: inner });
    } else if (ch === '~') {
      segments.push({ type: 'strike', text: inner });
    } else if (ch === '`') {
      segments.push({ type: 'code', text: inner });
    }
    cursor = match.index + raw.length;
    match = inlineRe.exec(text);
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }
}

/** Render parsed mrkdwn segments as Ink <Text> elements. */
export function MrkdwnText({ content }: { content: string }) {
  const segments = parseMrkdwn(content);

  return (
    <Text>
      {segments.map((seg, i) => {
        const key = i;
        switch (seg.type) {
          case 'text':
            return <Text key={key}>{seg.text}</Text>;
          case 'link':
            return (
              <Text key={key} color="cyan" underline>
                {seg.text}
              </Text>
            );
          case 'mention':
            return (
              <Text key={key} color="yellow" bold>
                {seg.text}
              </Text>
            );
          case 'channel':
            return (
              <Text key={key} color="blue" bold>
                {seg.text}
              </Text>
            );
          case 'bold':
            return (
              <Text key={key} bold>
                {seg.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={key} dimColor>
                {seg.text}
              </Text>
            );
          case 'strike':
            return (
              <Text key={key} strikethrough>
                {seg.text}
              </Text>
            );
          case 'code':
            return (
              <Text key={key} color="green">
                {seg.text}
              </Text>
            );
          default:
            return <Text key={key}>{seg.text}</Text>;
        }
      })}
    </Text>
  );
}
