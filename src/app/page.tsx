'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Conversation, Message } from '@/types';
import { getConversations, createConversation, deleteConversation, updateConversation, addMessage } from '@/lib/storage';
import { AVAILABLE_MODELS } from '@/lib/models';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';

function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  return getConversations();
}

export default function HomePage() {
  const { authenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarCollapsed] = useState(false);
  const prevAuthRef = useRef(authenticated);

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.push('/login');
    }
  }, [authenticated, authLoading, router]);

  useEffect(() => {
    if (authenticated && !prevAuthRef.current) {
      setConversations(getConversations());
    }
    prevAuthRef.current = authenticated;
  }, [authenticated]);

  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  const handleNew = useCallback(() => {
    const conv = createConversation(AVAILABLE_MODELS[0].id, false);
    setConversations(getConversations());
    setActiveId(conv.id);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleDelete = useCallback((id: string) => {
    deleteConversation(id);
    setConversations(getConversations());
    if (activeId === id) {
      const remaining = getConversations();
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [activeId]);

  const handleUpdateConversation = useCallback((id: string, updates: Partial<Conversation>) => {
    updateConversation(id, updates);
    setConversations(getConversations());
  }, []);

  const handleAddMessage = useCallback((conversationId: string, message: Message) => {
    addMessage(conversationId, message);
    setConversations(getConversations());
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        collapsed={sidebarCollapsed}
      />
      <ChatArea
        conversation={activeConversation}
        onUpdateConversation={handleUpdateConversation}
        onAddMessage={handleAddMessage}
      />
    </div>
  );
}