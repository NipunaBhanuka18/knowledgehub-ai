'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Citation {
  document: string;
  page: number;
  snippet: string;
}

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: Date;
  citations?: Citation[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    handleResetChat();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleResetChat = () => {
    setSessionId(null);
    setInput('');
    setMessages([
      {
        id: 'welcome',
        sender: 'agent',
        text: 'Welcome to **KnowledgeHub AI**. I am your AWS-native document assistant powered by Amazon Bedrock Knowledge Bases and Anthropic Claude.\n\nAsk me any question about your indexed legal and tax PDF documents, and I will retrieve exact excerpts with page-level citations right below my answer!',
        timestamp: new Date(),
      },
    ]);
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;

    let chatText = `--- KnowledgeHub AI Session Log ---\n`;
    chatText += `Session ID: ${sessionId || 'N/A'}\n`;
    chatText += `Date: ${new Date().toLocaleString()}\n\n`;

    messages.forEach((msg) => {
      const sender = msg.sender === 'user' ? 'User' : 'KnowledgeHub Assistant';
      chatText += `[${sender} - ${msg.timestamp.toLocaleTimeString()}]\n${msg.text}\n`;
      if (msg.citations && msg.citations.length > 0) {
        chatText += `\nSources Cited:\n`;
        msg.citations.forEach((cite) => {
          chatText += `- ${cite.document} (Page ${cite.page}): "${cite.snippet.substring(0, 80)}..."\n`;
        });
      }
      chatText += `\n`;
    });

    const blob = new Blob([chatText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledgehub_session_${sessionId || 'log'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendMessage = async (e?: React.FormEvent, presetQuery?: string) => {
    if (e) e.preventDefault();
    const queryToProcess = presetQuery || input;
    if (!queryToProcess.trim() || isLoading) return;

    setInput('');

    const userMessage: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: queryToProcess,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const agentMsgId = Math.random().toString();
    setMessages((prev) => [
      ...prev,
      {
        id: agentMsgId,
        sender: 'agent',
        text: '',
        timestamp: new Date(),
        citations: [],
      },
    ]);

    let apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/chat';
    if (apiUrl && !apiUrl.endsWith('/api/chat')) {
      apiUrl = apiUrl.replace(/\/+$/, '') + '/api/chat';
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: queryToProcess, session_id: sessionId }),
      });

      if (!response.ok) {
        throw new Error(`Server Error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === 'token') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === agentMsgId ? { ...msg, text: msg.text + (data.text || '') } : msg
                  )
                );
              } else if (currentEvent === 'citation') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === agentMsgId
                      ? { ...msg, citations: [...(msg.citations || []), data] }
                      : msg
                  )
                );
              } else if (currentEvent === 'done') {
                if (data.session_id) {
                  setSessionId(data.session_id);
                }
              } else if (currentEvent === 'error') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === agentMsgId
                      ? { ...msg, text: msg.text + (msg.text ? '\n\n' : '') + `⚠️ Error: ${data.message}` }
                      : msg
                  )
                );
              }
            } catch (err) {
              console.error('Error parsing SSE data line:', line, err);
            }
          }
        }
      }
    } catch (error: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === agentMsgId
            ? {
                ...msg,
                text: msg.text || `Communication Error: Unable to connect to the KnowledgeHub backend. (${error.message || 'Check server status'})`,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={`flex h-screen font-sans overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#0f1117] text-slate-200' : 'bg-[#FFFFFF] text-gray-800'}`}>
      
      {/* 1. UNIFIED SIDEBAR (LEFT) */}
      <aside className={`w-80 flex flex-col hidden md:flex border-r transition-colors duration-300 ${
        isDark ? 'bg-[#151821] border-slate-800' : 'bg-[#F9FAFB] border-gray-200'
      }`}>
        
        {/* Header */}
        <div className={`p-6 border-b ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${
              isDark ? 'bg-blue-600 text-white' : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
            </div>
            <div>
              <h1 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                KnowledgeHub AI
              </h1>
              <p className={`text-[11px] tracking-tight ${isDark ? 'text-slate-400' : 'text-[#6B7280]'}`}>AWS Bedrock Document Assistant</p>
            </div>
          </div>
        </div>

        {/* Sidebar Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-7">
          
          {/* System Specs Group */}
          <div>
            <h3 className={`text-[11px] font-bold uppercase tracking-wider mb-3 pl-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              System Specs
            </h3>
            <div className={`space-y-2.5 p-3.5 rounded-xl border ${
              isDark ? 'bg-[#0f1117]/60 border-slate-800/80' : 'bg-white border-gray-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
            }`}>
              <div className="flex justify-between items-center">
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Cloud</span>
                <span className="bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-orange-200/60 dark:border-orange-800/40">
                  AWS Native
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Engine</span>
                <span className="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-blue-200/60 dark:border-blue-800/40">
                  Bedrock KB (S3)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Model</span>
                <span className="bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-purple-200/60 dark:border-purple-800/40">
                  Amazon Nova Lite
                </span>
              </div>
              <div className={`flex justify-between items-center pt-2 border-t ${isDark ? 'border-slate-800' : 'border-gray-100'}`}>
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Protocol</span>
                <span className="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-emerald-200/60 dark:border-emerald-800/40">
                  SSE Streaming
                </span>
              </div>
            </div>
          </div>

          {/* Quick Sample Tests */}
          <div>
            <h3 className={`text-[11px] font-bold uppercase tracking-wider mb-3 pl-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              Quick Sample Tests
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => handleSendMessage(undefined, "Summarize the key heraldic and industrial symbolism of the Sri Lankan State Emblem as published in the March 2026 Gazette.")}
                disabled={isLoading}
                className={`w-full text-left p-3 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center justify-between group disabled:opacity-50 ${
                  isDark
                    ? 'bg-[#1e2230] hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
                    : 'bg-white hover:bg-gray-50/90 text-gray-700 border-gray-200/90 hover:border-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-sm hover:-translate-y-0.5'
                }`}
              >
                <span>1. State Emblem Symbolism</span>
                <svg className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
              <button
                onClick={() => handleSendMessage(undefined, "What specific purchaser details and TIN requirements must be included on a tax invoice?")}
                disabled={isLoading}
                className={`w-full text-left p-3 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center justify-between group disabled:opacity-50 ${
                  isDark
                    ? 'bg-[#1e2230] hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
                    : 'bg-white hover:bg-gray-50/90 text-gray-700 border-gray-200/90 hover:border-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-sm hover:-translate-y-0.5'
                }`}
              >
                <span>2. Tax Invoice Requirements</span>
                <svg className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
              <button
                onClick={() => handleSendMessage(undefined, "Who issues the nine-digit tax registration number (TIN) mentioned in the document?")}
                disabled={isLoading}
                className={`w-full text-left p-3 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center justify-between group disabled:opacity-50 ${
                  isDark
                    ? 'bg-[#1e2230] hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
                    : 'bg-white hover:bg-gray-50/90 text-gray-700 border-gray-200/90 hover:border-gray-300 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-sm hover:-translate-y-0.5'
                }`}
              >
                <span>3. TIN Issuing Authority</span>
                <svg className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Actions & Minimal Footer Utility Row */}
        <div className={`p-5 border-t flex flex-col gap-3.5 ${isDark ? 'border-slate-800 bg-[#151821]' : 'border-gray-200 bg-[#F9FAFB]'}`}>
          <button
            onClick={handleResetChat}
            className="w-full bg-[#2563EB] hover:bg-blue-600 text-white font-semibold text-xs py-3 rounded-xl shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
            + New Session
          </button>

          {/* Minimal footer utility row */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              onClick={handleExportChat}
              disabled={messages.length <= 1}
              className={`flex items-center gap-1.5 font-medium transition-colors disabled:opacity-40 ${
                isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              <span>Export Log</span>
            </button>

            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-mono ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                {sessionId ? `ID:${sessionId.substring(0, 6)}...` : 'Ready'}
              </span>
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                AI
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. THE MAIN CHAT CANVAS (CENTER) */}
      <main className={`flex-1 flex flex-col relative transition-colors duration-300 ${
        isDark ? 'bg-[#0f1117]' : 'bg-[#FFFFFF]'
      }`}>
        
        {/* Top Header */}
        <header className={`flex items-center justify-between px-6 py-3.5 border-b backdrop-blur-xl sticky top-0 z-20 transition-colors duration-300 ${
          isDark ? 'bg-[#151821]/80 border-slate-800 text-white' : 'bg-white/90 border-gray-100 text-gray-800'
        }`}>
          <div className="flex items-center gap-3">
            <h1 className="font-bold tracking-tight md:hidden text-base">KnowledgeHub AI</h1>
            <span className={`hidden md:inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border ${
              isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-gray-50 text-gray-600 border-gray-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
            }`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Amazon Bedrock SSE Engine Live
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title="Toggle Light/Dark Theme"
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition-all ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 shadow-sm'
                  : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700 shadow-sm'
              }`}
            >
              {isDark ? (
                <>
                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                  <span>Dark Mode</span>
                </>
              )}
            </button>
            <button onClick={handleResetChat} className="md:hidden text-xs font-semibold bg-[#2563EB] text-white px-3 py-1.5 rounded-xl shadow">New Chat</button>
          </div>
        </header>

        {/* Chat Messages Section */}
        <section className="flex-1 overflow-y-auto px-4 md:px-12 py-8 space-y-8 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-8 pb-36">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex animate-message-reveal ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                
                {/* AI Avatar next to message */}
                {msg.sender === 'agent' && (
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center mr-3.5 mt-1 flex-shrink-0 font-bold text-[11px] shadow-sm ${
                    isDark ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200/80 text-emerald-600'
                  }`}>
                    AI
                  </div>
                )}

                {/* Bubble / Container */}
                {msg.sender === 'user' ? (
                  /* User Question: Soft modern pill/bubble shape with subtle gradient and white text */
                  <div className="max-w-[80%] rounded-2xl rounded-tr-none p-4 shadow-sm bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8] text-white text-[15px] leading-relaxed">
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                ) : (
                  /* AI Response Box: Clean on white canvas or wrapped in incredibly faint gray container (#F9FAFB) with soft border (border-gray-100) */
                  <div className={`flex-1 max-w-[92%] rounded-2xl p-5 transition-colors ${
                    isDark
                      ? 'bg-[#1e2230]/60 text-slate-200 border border-slate-800'
                      : 'bg-[#F9FAFB] text-[#1F2937] border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                  }`}>
                    {/* Markdown text in #1F2937 for high readability */}
                    <div className={`prose max-w-none text-[15px] leading-relaxed prose-p:leading-relaxed prose-pre:border prose-ul:my-2 prose-li:my-1 ${
                      isDark ? 'prose-invert prose-pre:bg-[#0f1117] prose-pre:border-slate-700 text-slate-200' : 'prose-slate text-[#1F2937] prose-pre:bg-gray-100 prose-pre:border-gray-200'
                    }`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text || (isLoading ? '...' : '')}
                      </ReactMarkdown>
                    </div>

                    {/* 3. SOURCES CITED CARDS (INSIDE CHAT) */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className={`mt-6 pt-5 border-t space-y-3 ${isDark ? 'border-slate-800' : 'border-gray-200/80'}`}>
                        <div className="flex items-center gap-1.5">
                          <svg className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            Retrieved Sources & Citations
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {msg.citations.map((cite, index) => (
                            /* Clean white cards that feature subtle shadow, 1px solid #E5E7EB, box-shadow: 0 1px 3px rgba(0,0,0,0.05) */
                            <div
                              key={index}
                              className={`p-3.5 rounded-xl border transition-all duration-200 hover:shadow-md ${
                                isDark
                                  ? 'bg-[#151821] border-slate-800 text-slate-300'
                                  : 'bg-[#FFFFFF] border-[#E5E7EB] text-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.05)]'
                              }`}
                            >
                              {/* Header Row: File name in bold dark gray, Page tag as tiny crisp badge on right */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                  <span className={`font-semibold text-xs truncate ${isDark ? 'text-white' : 'text-gray-800'}`}>
                                    {cite.document}
                                  </span>
                                </div>
                                <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded flex-shrink-0 border ${
                                  isDark
                                    ? 'bg-slate-800 text-slate-300 border-slate-700'
                                    : 'bg-gray-100 text-gray-600 border-gray-200/60'
                                }`}>
                                  Page {cite.page}
                                </span>
                              </div>

                              {/* Content Snippet inside using a monospace font styled in clean gray */}
                              {cite.snippet && (
                                <div className={`mt-2.5 p-2.5 rounded-lg border font-mono text-[11px] leading-relaxed overflow-x-auto ${
                                  isDark ? 'bg-[#0f1117] border-slate-800 text-slate-400' : 'bg-gray-50/80 border-gray-100 text-gray-600'
                                }`}>
                                  "{cite.snippet}"
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>
        </section>

        {/* 4. FLOATING INPUT BAR (BOTTOM) */}
        {/* Floating, elevated input capsule centered at the bottom of the chat viewport */}
        <footer className="absolute bottom-6 left-0 right-0 z-20 pointer-events-none">
          <div className="max-w-3xl mx-auto px-4 pointer-events-auto">
            <form
              onSubmit={(e) => handleSendMessage(e)}
              className={`flex items-center gap-2 rounded-2xl p-2 transition-all border ${
                isDark
                  ? 'bg-[#1e2230]/90 border-slate-700 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl'
                  : 'bg-[#FFFFFF] border-[#E5E7EB] shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08)]'
              }`}
            >
              {/* Clean minimal line-art icons in mid-gray (#9CA3AF) inside the input bar */}
              <div className="pl-2 flex items-center gap-1.5 text-[#9CA3AF]">
                <svg className="w-5 h-5 cursor-pointer hover:text-gray-600 dark:hover:text-slate-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isLoading}
                placeholder={isLoading ? "KnowledgeHub AI is generating response..." : "Ask your AWS-native document assistant... (Press Enter to send)"}
                className={`flex-1 bg-transparent border-none rounded-xl px-2 py-2.5 text-[15px] focus:outline-none focus:ring-0 disabled:opacity-50 transition-all resize-none overflow-hidden min-h-[44px] max-h-[120px] ${
                  isDark ? 'text-slate-200 placeholder-slate-500' : 'text-gray-800 placeholder-gray-400'
                }`}
                rows={1}
              />

              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2.5 bg-[#2563EB] hover:bg-blue-600 text-white rounded-xl disabled:opacity-30 disabled:hover:bg-[#2563EB] transition-all shadow-sm flex items-center justify-center flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
              </button>
            </form>

            <div className={`flex items-center justify-center gap-1.5 mt-2.5 text-[11px] font-medium transition-colors ${
              isDark ? 'text-slate-500' : 'text-gray-400'
            }`}>
              <svg className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              <span>Grounded in official Gazette documents via S3 Vectors. Always verify critical clauses against page-level citations.</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}