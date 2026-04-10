import { describe, expect, it } from 'vitest';

import {
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
