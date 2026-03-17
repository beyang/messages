import type { Inbox } from '../shared/types';

export const DUMMY_DATA: Inbox[] = [
  {
    id: 'personal',
    threads: [
      {
        sourceURL: 'https://chat.example.com/threads/alex',
        messages: [
          {
            sourceURL: 'https://chat.example.com/messages/alex-1',
            content: 'Hey! Are you free for dinner tomorrow?',
          },
          {
            sourceURL: 'https://chat.example.com/messages/alex-2',
            content: 'I can do 7pm near downtown.',
          },
        ],
      },
      {
        sourceURL: 'https://chat.example.com/threads/family',
        messages: [
          {
            sourceURL: 'https://chat.example.com/messages/family-1',
            content: 'Weekend plans: hiking or brunch?',
          },
        ],
      },
    ],
  },
  {
    id: 'work',
    threads: [
      {
        sourceURL: 'https://mail.example.com/threads/project-phoenix',
        messages: [
          {
            sourceURL: 'https://mail.example.com/messages/phoenix-1',
            content: 'Can you review the latest API proposal today?',
          },
          {
            sourceURL: 'https://mail.example.com/messages/phoenix-2',
            content: 'Also adding a migration script for old records.',
          },
        ],
      },
      {
        sourceURL: 'https://mail.example.com/threads/oncall',
        messages: [
          {
            sourceURL: 'https://mail.example.com/messages/oncall-1',
            content: 'Reminder: you are primary on-call this Friday.',
          },
        ],
      },
    ],
  },
];
