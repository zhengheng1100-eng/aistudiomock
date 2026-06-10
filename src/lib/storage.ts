import { Conversation, Message } from '@/types';

const CONVERSATIONS_KEY = 'ai_studio_conversations';
const AUTH_KEY = 'ai_studio_auth';

export function getConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(CONVERSATIONS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
}

export function createConversation(model: string, webSearch: boolean): Conversation {
  const conv: Conversation = {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    model,
    webSearch,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const conversations = getConversations();
  conversations.unshift(conv);
  saveConversations(conversations);
  return conv;
}

export function updateConversation(id: string, updates: Partial<Conversation>): Conversation | null {
  const conversations = getConversations();
  const index = conversations.findIndex((c) => c.id === id);
  if (index === -1) return null;
  conversations[index] = { ...conversations[index], ...updates, updatedAt: Date.now() };
  // Move to top
  const [conv] = conversations.splice(index, 1);
  conversations.unshift(conv);
  saveConversations(conversations);
  return conversations[0];
}

export function deleteConversation(id: string): void {
  const conversations = getConversations().filter((c) => c.id !== id);
  saveConversations(conversations);
}

export function addMessage(conversationId: string, message: Message): Conversation | null {
  return updateConversation(conversationId, {
    messages: [
      ...(getConversations().find((c) => c.id === conversationId)?.messages || []),
      message,
    ],
    title: message.role === 'user' && message.content.length > 0
      ? message.content.slice(0, 40) + (message.content.length > 40 ? '...' : '')
      : undefined,
  } as Partial<Conversation>);
}

// Auth helpers
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(AUTH_KEY) === 'true';
}

export function login(username: string, password: string): boolean {
  if (username === 'admin36' && password === 'admin36') {
    localStorage.setItem(AUTH_KEY, 'true');
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}