export interface Message {
  sourceURL: string;
  content: string;
}

export interface Convo {
  sourceURL: string;
  messages: Message[];
}

export interface Inbox {
  id: string;
  threads: Convo[];
}
