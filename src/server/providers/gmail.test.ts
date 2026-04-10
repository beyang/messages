import { describe, expect, it } from 'vitest';

import {
  buildReplyHeaderValues,
  extractMailedByFromAuthenticationResults,
  extractSignedByFromAuthenticationResults,
} from './gmail.js';

describe('extractMailedByFromAuthenticationResults', () => {
  it('extracts smtp.mailfrom domain from an spf=pass clause', () => {
    const headers = [
      {
        name: 'Authentication-Results',
        value:
          'mx.google.com; spf=pass smtp.mailfrom=<Sender@Mail.Example.com>; dkim=pass header.i=@example.com;',
      },
    ];

    expect(extractMailedByFromAuthenticationResults(headers)).toBe(
      'mail.example.com',
    );
  });

  it('falls back to smtp.from when smtp.mailfrom is absent', () => {
    const headers = [
      {
        name: 'Authentication-Results',
        value: 'mx.google.com; spf=pass smtp.from=@bounce.example.org;',
      },
    ];

    expect(extractMailedByFromAuthenticationResults(headers)).toBe(
      'bounce.example.org',
    );
  });

  it('returns undefined when no spf=pass clause is present', () => {
    const headers = [
      {
        name: 'Authentication-Results',
        value: 'mx.google.com; spf=fail smtp.mailfrom=sender.example.com;',
      },
    ];

    expect(extractMailedByFromAuthenticationResults(headers)).toBeUndefined();
  });
});

describe('extractSignedByFromAuthenticationResults', () => {
  it('extracts signing domain from header.i in a dkim=pass clause', () => {
    const headers = [
      {
        name: 'Authentication-Results',
        value:
          'mx.google.com; dkim=pass header.i=<News@Sub.Example.com> header.s=selector;',
      },
    ];

    expect(extractSignedByFromAuthenticationResults(headers)).toBe(
      'sub.example.com',
    );
  });

  it('falls back to header.d when header.i is absent', () => {
    const headers = [
      {
        name: 'Authentication-Results',
        value: 'mx.google.com; dkim=pass header.d=Example.ORG header.s=mail;',
      },
    ];

    expect(extractSignedByFromAuthenticationResults(headers)).toBe(
      'example.org',
    );
  });

  it('returns undefined when no dkim=pass clause is present', () => {
    const headers = [
      {
        name: 'Authentication-Results',
        value: 'mx.google.com; dkim=fail header.d=example.net;',
      },
    ];

    expect(extractSignedByFromAuthenticationResults(headers)).toBeUndefined();
  });
});

describe('buildReplyHeaderValues', () => {
  it('computes reply-all To/Cc headers by merging recipients, deduping, and excluding self', () => {
    const headers = [
      { name: 'Reply-To', value: 'Support Team <reply@example.com>' },
      { name: 'From', value: 'Original Sender <sender@example.com>' },
      {
        name: 'To',
        value:
          'Me <me@example.com>, Teammate <teammate@example.com>, reply@example.com',
      },
      {
        name: 'Cc',
        value: 'cc@example.com, teammate@example.com, ME@example.com',
      },
      { name: 'Subject', value: 'Status Update' },
      { name: 'Message-ID', value: '<message-123@example.com>' },
    ];

    expect(
      buildReplyHeaderValues(headers, 'me@example.com', true, 'message-123'),
    ).toEqual({
      to: 'reply@example.com, teammate@example.com',
      cc: 'cc@example.com',
      subject: 'Re: Status Update',
      inReplyTo: '<message-123@example.com>',
    });
  });

  it('keeps single-recipient Reply-To as-is for regular reply and ignores original To/Cc', () => {
    const headers = [
      { name: 'Reply-To', value: 'Support Team <reply@example.com>' },
      {
        name: 'To',
        value: 'Me <me@example.com>, Teammate <teammate@example.com>',
      },
      { name: 'Cc', value: 'cc@example.com' },
      { name: 'Subject', value: 'Re: Existing Subject' },
      { name: 'Message-ID', value: '<message-456@example.com>' },
    ];

    expect(
      buildReplyHeaderValues(headers, 'me@example.com', false, 'message-456'),
    ).toEqual({
      to: 'Support Team <reply@example.com>',
      subject: 'Re: Existing Subject',
      inReplyTo: '<message-456@example.com>',
    });
  });

  it('falls back to sanitized raw recipient and default subject when no parseable addresses are present', () => {
    const headers = [
      { name: 'Reply-To', value: 'undisclosed-recipients:;' },
      { name: 'Subject', value: '' },
      { name: 'Message-ID', value: '' },
    ];

    expect(
      buildReplyHeaderValues(headers, 'me@example.com', true, 'message-789'),
    ).toEqual({
      to: 'undisclosed-recipients:;',
      subject: 'Re:',
    });
  });
});
