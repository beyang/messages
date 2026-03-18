export interface Message {
  id: string;
  sourceURL: string;
  content: string;
}

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
  threads: Convo[];
  providers: ProviderConfig[];
}

export interface Provider<A extends JsonSerializable = JsonSerializable> {
  type: string;
  id: string;
  fetchConvos(args: A): Convo[];
}
