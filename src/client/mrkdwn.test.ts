import { describe, expect, it } from 'vitest';
import { parseMrkdwn } from './mrkdwn.js';

describe('parseMrkdwn', () => {
  it('returns plain text as-is', () => {
    expect(parseMrkdwn('hello world')).toEqual([
      { type: 'text', text: 'hello world' },
    ]);
  });

  it('parses a hyperlink with label', () => {
    expect(parseMrkdwn('see <https://example.com|Example>')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', url: 'https://example.com', text: 'Example' },
    ]);
  });

  it('parses a hyperlink without label', () => {
    expect(parseMrkdwn('<https://example.com>')).toEqual([
      { type: 'link', url: 'https://example.com', text: 'https://example.com' },
    ]);
  });

  it('parses user mentions with display name', () => {
    expect(parseMrkdwn('hey <@U123|alice>!')).toEqual([
      { type: 'text', text: 'hey ' },
      { type: 'mention', text: '@alice' },
      { type: 'text', text: '!' },
    ]);
  });

  it('parses user mentions without display name', () => {
    expect(parseMrkdwn('<@U123>')).toEqual([
      { type: 'mention', text: '@U123' },
    ]);
  });

  it('parses channel mentions', () => {
    expect(parseMrkdwn('in <#C456|general>')).toEqual([
      { type: 'text', text: 'in ' },
      { type: 'channel', text: '#general' },
    ]);
  });

  it('parses bold, italic, strike, code', () => {
    expect(parseMrkdwn('*bold* _italic_ ~strike~ `code`')).toEqual([
      { type: 'bold', text: 'bold' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'italic' },
      { type: 'text', text: ' ' },
      { type: 'strike', text: 'strike' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'code' },
    ]);
  });

  it('handles mixed content', () => {
    const result = parseMrkdwn(
      'Hey <@U1|Bob>, check <https://x.co|this> in <#C2|dev>',
    );
    expect(result).toEqual([
      { type: 'text', text: 'Hey ' },
      { type: 'mention', text: '@Bob' },
      { type: 'text', text: ', check ' },
      { type: 'link', url: 'https://x.co', text: 'this' },
      { type: 'text', text: ' in ' },
      { type: 'channel', text: '#dev' },
    ]);
  });
});
