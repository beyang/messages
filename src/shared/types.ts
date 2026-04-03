import { z } from 'zod';

type AssertTrue<T extends true> = T;

export interface Message {
  id: string;
  sourceURL: string;
  content: string;
  subject?: string;
}

export const messageSchema: z.ZodType<Message> = z
  .object({
    id: z.string(),
    sourceURL: z.string(),
    content: z.string(),
    subject: z.unknown().optional(),
  })
  .transform((entry): Message => {
    const message: Message = {
      id: entry.id,
      sourceURL: entry.sourceURL,
      content: entry.content,
    };
    if (typeof entry.subject === 'string') {
      message.subject = entry.subject;
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

export interface ProviderConfig<A extends JsonSerializable = JsonSerializable> {
  id: string;
  type: string;
  args: A;
}

export const providerConfigSchema: z.ZodType<ProviderConfig> = z.object({
  id: z.string(),
  type: z.string(),
  args: jsonSerializableSchema,
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
  providers: ProviderConfig[];
}

export const inboxSchema: z.ZodType<Inbox> = z.object({
  id: z.string(),
  convos: z.array(convoSchema),
  providers: z.array(providerConfigSchema),
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

export interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export const secretStoreSchema: z.ZodType<SecretStore> = z.object({
  get: z.function({
    input: [z.string()],
    output: z.string().nullable(),
  }),
  set: z.function({
    input: [z.string(), z.string()],
    output: z.void(),
  }),
  delete: z.function({
    input: [z.string()],
    output: z.void(),
  }),
});

type _secretStoreSatisfiesSecretStoreSchema = AssertTrue<
  SecretStore extends z.input<typeof secretStoreSchema> ? true : false
>;
type _secretStoreSchemaProducesSecretStore = AssertTrue<
  z.output<typeof secretStoreSchema> extends SecretStore ? true : false
>;

export interface Provider<A extends JsonSerializable = JsonSerializable> {
  type: string;
  id: string;
  fetchConvos(args: A, secrets: SecretStore): Promise<FetchConvosResult>;
  authInitURL?(args: A, baseURL: string): string;
  handleAuthCallback?(secret: string, secrets: SecretStore): void;
}

export const providerSchema: z.ZodType<Provider> = z.object({
  type: z.string(),
  id: z.string(),
  fetchConvos: z.function({
    input: [jsonSerializableSchema, secretStoreSchema],
    output: z.promise(fetchConvosResultSchema),
  }),
  authInitURL: z
    .function({
      input: [jsonSerializableSchema, z.string()],
      output: z.string(),
    })
    .optional(),
  handleAuthCallback: z
    .function({
      input: [z.string(), secretStoreSchema],
      output: z.void(),
    })
    .optional(),
});

type _providerSatisfiesProviderSchema = AssertTrue<
  Provider extends z.input<typeof providerSchema> ? true : false
>;
type _providerSchemaProducesProvider = AssertTrue<
  z.output<typeof providerSchema> extends Provider ? true : false
>;
