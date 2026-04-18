import { EventEmitter } from 'node:events';

export const appEvents = new EventEmitter();

export interface MentionEvent {
  type: 'user' | 'page' | 'date' | 'agent';
  targetId: string;
  pageId: string;
  blockId: string;
  mentionedBy: string;
}
