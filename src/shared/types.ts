import { z } from 'zod';

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

type AssertTrue<T extends true> = T;
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

export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | JsonSerializable[]
  | { [key: string]: JsonSerializable };

export interface ProviderConfig<A extends JsonSerializable = JsonSerializable> {
  id: string;
  type: string;
  args: A;
}

export interface Inbox {
  id: string;
  convos: Convo[];
  providers: ProviderConfig[];
}

export type FetchConvosResult = {
  convos: Convo[];
  needsAuth?: { url: string };
  errors?: string[];
};

export interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export interface Provider<A extends JsonSerializable = JsonSerializable> {
  type: string;
  id: string;
  fetchConvos(args: A, secrets: SecretStore): Promise<FetchConvosResult>;
  authInitURL?(args: A, baseURL: string): string;
  handleAuthCallback?(secret: string, secrets: SecretStore): void;
}
