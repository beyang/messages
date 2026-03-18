import type { Inbox } from '../shared/types';

export const DUMMY_DATA: Inbox[] = [
  {
    id: 'personal',
    providers: [{ id: 'dummy-1', type: 'dummy', args: null }],
    threads: [
      {
        id: 'convo-alex',
        sourceURL: 'https://chat.example.com/threads/alex',
        messages: [
          {
            id: 'msg-alex-1',
            sourceURL: 'https://chat.example.com/messages/alex-1',
            content: 'Hey! Are you free for dinner tomorrow?',
          },
          {
            id: 'msg-alex-2',
            sourceURL: 'https://chat.example.com/messages/alex-2',
            content: 'I can do 7pm near downtown.',
          },
        ],
      },
      {
        id: 'convo-family',
        sourceURL: 'https://chat.example.com/threads/family',
        messages: [
          {
            id: 'msg-family-1',
            sourceURL: 'https://chat.example.com/messages/family-1',
            content: 'Weekend plans: hiking or brunch?',
          },
        ],
      },
    ],
  },
  {
    id: 'work',
    providers: [],
    threads: [
      {
        id: 'convo-phoenix',
        sourceURL: 'https://mail.example.com/threads/project-phoenix',
        messages: [
          {
            id: 'msg-phoenix-1',
            sourceURL: 'https://mail.example.com/messages/phoenix-1',
            content: 'Can you review the latest API proposal today?',
          },
          {
            id: 'msg-phoenix-2',
            sourceURL: 'https://mail.example.com/messages/phoenix-2',
            content: 'Also adding a migration script for old records.',
          },
        ],
      },
      {
        id: 'convo-oncall',
        sourceURL: 'https://mail.example.com/threads/oncall',
        messages: [
          {
            id: 'msg-oncall-1',
            sourceURL: 'https://mail.example.com/messages/oncall-1',
            content: 'Reminder: you are primary on-call this Friday.',
          },
        ],
      },
    ],
  },
];
