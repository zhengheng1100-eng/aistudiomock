'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { Message, Conversation, Attachment } from '@/types';
import { AVAILABLE_MODELS } from '@/lib/models';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatAreaProps {
  conversation: Conversation | null;
  onUpdateConversation: (id: string, updates: Partial<Conversation>) => void;
  onAddMessage: (conversationId: string, message: Message) => void;
}

const ACCEPTED_TYPES = 'image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.ppt,.pptx';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Render message content: markdown for assistant, plain text for user */
function MessageContent({ content, role }: { content: string; role: string }) {
  if (role === 'assistant') {
    return (
      <div className="text-sm leading-relaxed markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }
  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>;
}

export default function ChatArea({
  conversation,
  onUpdateConversation,
  onAddMessage,
}: ChatAreaProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevConvIdRef = useRef(conversation?.id ?? '');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages, streamingContent]);

  if (prevConvIdRef.current !== (conversation?.id ?? '')) {
    prevConvIdRef.current = conversation?.id ?? '';
    setStreamingContent('');
    setPendingAttachments([]);
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];
    const readers: Promise<void>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      readers.push(
        new Promise<void>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            newAttachments.push({
              id: crypto.randomUUID(),
              name: file.name,
              mimeType: file.type,
              data: base64,
              size: file.size,
            });
            resolve();
          };
          reader.readAsDataURL(file);
        })
      );
    }

    Promise.all(readers).then(() => {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const hasText = input.trim().length > 0;
    if ((!hasText && pendingAttachments.length === 0) || !conversation || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      timestamp: Date.now(),
    };

    onAddMessage(conversation.id, userMessage);
    setInput('');
    setPendingAttachments([]);
    setLoading(true);
    setStreamingContent('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...conversation.messages, userMessage],
          model: conversation.model,
          webSearch: conversation.webSearch,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let fullContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        fullContent += text;
        setStreamingContent(fullContent);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
      };
      onAddMessage(conversation.id, assistantMessage);
      setStreamingContent('');
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now(),
      };
      onAddMessage(conversation.id, errorMessage);
      setStreamingContent('');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-50 mb-4">
            <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Welcome to AI Studio</h2>
          <p className="text-gray-400">Select a conversation or start a new chat</p>
        </div>
      </div>
    );
  }

  const modelInfo = AVAILABLE_MODELS.find((m) => m.id === conversation.model);

  return (
    <div className="flex-1 flex flex-col bg-white h-full">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <select
            value={conversation.model}
            onChange={(e) => onUpdateConversation(conversation.id, { model: e.target.value })}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">{modelInfo?.description}</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Web Search</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={conversation.webSearch}
                onChange={(e) => onUpdateConversation(conversation.id, { webSearch: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-indigo-600 transition-colors"></div>
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
            </div>
          </label>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {conversation.messages.length === 0 && !streamingContent && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-600 mb-1">Start a conversation</h3>
              <p className="text-sm text-gray-400">Type a message or upload an image/file to begin</p>
            </div>
          </div>
        )}

        {conversation.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {/* Render attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className={`flex flex-wrap gap-2 mb-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.attachments.map((att) => (
                    <div key={att.id} className="relative group">
                      {att.mimeType.startsWith('image/') ? (
                        <img
                          src={`data:${att.mimeType};base64,${att.data}`}
                          alt={att.name}
                          className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20 text-sm">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="truncate max-w-[100px]">{att.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <MessageContent content={msg.content} role={msg.role} />
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </div>
        ))}

        {/* Streaming message */}
        {streamingContent && (
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-gray-100 text-gray-800">
              <div className="text-sm leading-relaxed markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
              </div>
              <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-middle"></span>
            </div>
          </div>
        )}

        {loading && !streamingContent && (
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="rounded-2xl px-4 py-3 bg-gray-100">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="px-6 py-4 border-t border-gray-200">
        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {pendingAttachments.map((att) => (
              <div key={att.id} className="relative group bg-gray-50 rounded-lg border border-gray-200 p-2 pr-8">
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {att.mimeType.startsWith('image/') ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={`data:${att.mimeType};base64,${att.data}`}
                      alt={att.name}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="text-xs text-gray-500">
                      <p className="font-medium text-gray-700 truncate max-w-[120px]">{att.name}</p>
                      <p>{formatFileSize(att.size)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="text-xs text-gray-500">
                      <p className="font-medium text-gray-700 truncate max-w-[120px]">{att.name}</p>
                      <p>{formatFileSize(att.size)}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-sm"
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
          </div>

          {/* File upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex-shrink-0 w-12 h-12 bg-gray-100 text-gray-500 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            title="Attach file or image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            type="submit"
            disabled={(input.trim().length === 0 && pendingAttachments.length === 0) || loading}
            className="flex-shrink-0 w-12 h-12 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}