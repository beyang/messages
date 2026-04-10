import { z } from 'zod';

type AssertTrue<T extends true> = T;

export interface Author {
  username: string;
  displayName?: string;
}

export const authorSchema: z.ZodType<Author> = z.object({
  username: z.string(),
  displayName: z.string().optional(),
});

type _authorSatisfiesAuthorSchema = AssertTrue<
  Author extends z.input<typeof authorSchema> ? true : false
>;
type _authorSchemaProducesAuthor = AssertTrue<
  z.output<typeof authorSchema> extends Author ? true : false
>;

export interface Message {
  id: string;
  sourceURL: string;
  providerID: string;
  hasStar?: boolean;
  isArchived?: boolean;
  content: string;
  subject?: string;
  author?: Author;
  timestamp?: number;
}

const NUMERIC_TIMESTAMP_PATTERN = /^-?\d+(\.\d+)?$/;

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (NUMERIC_TIMESTAMP_PATTERN.test(trimmed)) {
    const numericTimestamp = Number.parseFloat(trimmed);
    if (!Number.isFinite(numericTimestamp)) {
      return undefined;
    }

    const unsigned = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
    const [secondsPart, subSecondPart] = unsigned.split('.');
    if (subSecondPart || (secondsPart?.length ?? 0) <= 10) {
      return numericTimestamp * 1000;
    }

    return numericTimestamp;
  }

  const parsedTimestamp = Date.parse(trimmed);
  return Number.isNaN(parsedTimestamp) ? undefined : parsedTimestamp;
}

export const messageSchema: z.ZodType<Message> = z
  .object({
    id: z.string(),
    sourceURL: z.string(),
    providerID: z.unknown().optional(),
    hasStar: z.unknown().optional(),
    isArchived: z.unknown().optional(),
    content: z.string(),
    subject: z.unknown().optional(),
    author: authorSchema.optional(),
    timestamp: z.unknown().optional(),
  })
  .transform((entry): Message => {
    const providerID =
      typeof entry.providerID === 'string' && entry.providerID.length > 0
        ? entry.providerID
        : 'legacy-unknown';

    const message: Message = {
      id: entry.id,
      sourceURL: entry.sourceURL,
      providerID,
      content: entry.content,
    };
    if (typeof entry.hasStar === 'boolean') {
      message.hasStar = entry.hasStar;
    }
    if (typeof entry.isArchived === 'boolean') {
      message.isArchived = entry.isArchived;
    }
    if (typeof entry.subject === 'string') {
      message.subject = entry.subject;
    }
    if (entry.author) {
      message.author = entry.author;
    }
    const normalizedTimestamp = normalizeTimestamp(entry.timestamp);
    if (normalizedTimestamp !== undefined) {
      message.timestamp = normalizedTimestamp;
    }
    return message;
  });
type _messageSatisfiesMessageSchema = AssertTrue<
  Message extends z.input<typeof messageSchema> ? true : false
>;
type _messageSchemaProducesMessage = AssertTrue<
  z.output<typeof messageSchema> extends Message ? true : false
>;

export interface Convo {
  id: string;
  sourceURL: string;
  messages: Message[];
}

export const convoSchema: z.ZodType<Convo> = z.object({
  id: z.string(),
  sourceURL: z.string(),
  messages: z.array(messageSchema),
});

type _convoSatisfiesConvoSchema = AssertTrue<
  Convo extends z.input<typeof convoSchema> ? true : false
>;
type _convoSchemaProducesConvo = AssertTrue<
  z.output<typeof convoSchema> extends Convo ? true : false
>;

export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | JsonSerializable[]
  | { [key: string]: JsonSerializable };

export const jsonSerializableSchema: z.ZodType<JsonSerializable> = z.json();

type _jsonSerializableSatisfiesJsonSerializableSchema = AssertTrue<
  JsonSerializable extends z.input<typeof jsonSerializableSchema> ? true : false
>;
type _jsonSerializableSchemaProducesJsonSerializable = AssertTrue<
  z.output<typeof jsonSerializableSchema> extends JsonSerializable
    ? true
    : false
>;

export type ProviderIdentity = { [key: string]: JsonSerializable };

export const providerIdentitySchema: z.ZodType<ProviderIdentity> = z.record(
  z.string(),
  jsonSerializableSchema,
);

type _providerIdentitySatisfiesProviderIdentitySchema = AssertTrue<
  ProviderIdentity extends z.input<typeof providerIdentitySchema> ? true : false
>;
type _providerIdentitySchemaProducesProviderIdentity = AssertTrue<
  z.output<typeof providerIdentitySchema> extends ProviderIdentity
    ? true
    : false
>;

export interface ProviderConfig<I extends ProviderIdentity = ProviderIdentity> {
  id: number;
  secretsValue: string;
  type: string;
  identity: I;
}

export const providerConfigSchema: z.ZodType<ProviderConfig> = z.object({
  id: z.number().int(),
  secretsValue: z.string(),
  type: z.string(),
  identity: providerIdentitySchema,
});

type _providerConfigSatisfiesProviderConfigSchema = AssertTrue<
  ProviderConfig extends z.input<typeof providerConfigSchema> ? true : false
>;
type _providerConfigSchemaProducesProviderConfig = AssertTrue<
  z.output<typeof providerConfigSchema> extends ProviderConfig ? true : false
>;

export interface Inbox {
  id: string;
  convos: Convo[];
}

export const inboxSchema: z.ZodType<Inbox> = z.object({
  id: z.string(),
  convos: z.array(convoSchema),
});

type _inboxSatisfiesInboxSchema = AssertTrue<
  Inbox extends z.input<typeof inboxSchema> ? true : false
>;
type _inboxSchemaProducesInbox = AssertTrue<
  z.output<typeof inboxSchema> extends Inbox ? true : false
>;

export type FetchConvosResult = {
  convos: Convo[];
  needsAuth?: { url: string };
  errors?: string[];
};

export const fetchConvosResultSchema: z.ZodType<FetchConvosResult> = z.object({
  convos: z.array(convoSchema),
  needsAuth: z
    .object({
      url: z.string(),
    })
    .optional(),
  errors: z.array(z.string()).optional(),
});

type _fetchConvosResultSatisfiesFetchConvosResultSchema = AssertTrue<
  FetchConvosResult extends z.input<typeof fetchConvosResultSchema>
    ? true
    : false
>;
type _fetchConvosResultSchemaProducesFetchConvosResult = AssertTrue<
  z.output<typeof fetchConvosResultSchema> extends FetchConvosResult
    ? true
    : false
>;

export interface Provider<
  I extends JsonSerializable,
  Q extends JsonSerializable,
> {
  type: string;
  id: number;
  fetchConvos(identity: I, query: Q): Promise<FetchConvosResult>;
  setStar(
    identity: I,
    messageSourceURL: string,
    starred: boolean,
  ): Promise<void>;
  setArchived(
    identity: I,
    messageSourceURL: string,
    archived: boolean,
  ): Promise<void>;
  reply(identity: I, messageSourceURL: string, content: string): Promise<void>;
  authInitURL?(identity: I, baseURL: string): string;
  handleAuthCallback?(secret: string): void;
}
