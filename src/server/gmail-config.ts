import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  email: string;
}

interface GcpCredentialsFile {
  email?: string;
  web?: {
    client_id: string;
    client_secret: string;
  };
  installed?: {
    client_id: string;
    client_secret: string;
  };
}

let cached: GmailConfig | null = null;

export function getGmailConfig(): GmailConfig {
  if (cached) return cached;

  const filePath = join(process.cwd(), 'gmail.json');
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(
      `Gmail credentials file not found at ${filePath}. ` +
        'Download the OAuth client JSON from the GCP console and save it as gmail.json in the project root.',
    );
  }

  const data = JSON.parse(raw) as GcpCredentialsFile;
  const creds = data.web ?? data.installed;
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error(
      'gmail.json must contain a "web" or "installed" key with client_id and client_secret.',
    );
  }
  if (!data.email) {
    throw new Error(
      'gmail.json must contain an "email" field with the Gmail address to authorize.',
    );
  }

  cached = {
    clientId: creds.client_id,
    clientSecret: creds.client_secret,
    email: data.email,
  };
  return cached;
}
