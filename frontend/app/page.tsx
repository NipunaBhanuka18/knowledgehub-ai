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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
    setIsMobileMenuOpen(false);
    setMessages([]);
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
    setIsMobileMenuOpen(false);

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

  /* Shared Sidebar Content Component for Desktop and Mobile Drawer */
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#151821] text-slate-200">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">KnowledgeHub AI</h1>
            <p className="text-[11px] tracking-tight text-slate-400">AWS Bedrock Document Assistant</p>
          </div>
        </div>
        {/* Close Button on Mobile */}
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          className="md:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      {/* Sidebar Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-7">
        {/* System Specs Group */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3 pl-1 text-slate-500">
            System Specs
          </h3>
          <div className="space-y-2.5 p-3.5 rounded-xl border bg-[#0f1117]/60 border-slate-800/80">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium text-slate-400">Cloud</span>
              <span className="bg-orange-950/40 text-orange-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-orange-800/40">
                AWS Native
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium text-slate-400">Engine</span>
              <span className="bg-blue-950/40 text-blue-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-blue-800/40">
                Bedrock KB (S3)
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium text-slate-400">Model</span>
              <span className="bg-purple-950/40 text-purple-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-purple-800/40">
                Amazon Nova Lite
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="text-[11px] font-medium text-slate-400">Protocol</span>
              <span className="bg-emerald-950/40 text-emerald-400 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-emerald-800/40">
                SSE Streaming
              </span>
            </div>
          </div>
        </div>

        {/* Quick Sample Tests */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider mb-3 pl-1 text-slate-500">
            Quick Sample Tests
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => handleSendMessage(undefined, "Summarize the key heraldic and industrial symbolism of the Sri Lankan State Emblem as published in the March 2026 Gazette.")}
              disabled={isLoading}
              className="w-full text-left p-3 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center justify-between group disabled:opacity-50 bg-[#1e2230] hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700"
            >
              <span className="truncate">1. State Emblem Symbolism</span>
              <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
            <button
              onClick={() => handleSendMessage(undefined, "What specific purchaser details and TIN requirements must be included on a tax invoice?")}
              disabled={isLoading}
              className="w-full text-left p-3 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center justify-between group disabled:opacity-50 bg-[#1e2230] hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700"
            >
              <span className="truncate">2. Tax Invoice Requirements</span>
              <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
            <button
              onClick={() => handleSendMessage(undefined, "Who issues the nine-digit tax registration number (TIN) mentioned in the document?")}
              disabled={isLoading}
              className="w-full text-left p-3 rounded-xl text-xs font-medium border transition-all duration-200 flex items-center justify-between group disabled:opacity-50 bg-[#1e2230] hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700"
            >
              <span className="truncate">3. TIN Issuing Authority</span>
              <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="p-5 border-t border-slate-800 bg-[#151821] flex flex-col gap-3.5">
        <button
          onClick={handleResetChat}
          className="w-full bg-[#2563EB] hover:bg-blue-600 text-white font-semibold text-xs py-3 rounded-xl shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-0.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
          + New Session
        </button>

        <div className="flex items-center justify-between pt-1 text-xs">
          <button
            onClick={handleExportChat}
            disabled={messages.length <= 1}
            className="flex items-center gap-1.5 font-medium transition-colors disabled:opacity-40 text-slate-400 hover:text-slate-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            <span>Export Log</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-500">
              {sessionId ? `ID:${sessionId.substring(0, 6)}...` : 'Ready'}
            </span>
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
              AI
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden bg-[#0f1117] text-slate-200">
      
      {/* 1. DESKTOP SIDEBAR (LEFT) */}
      <aside className="w-80 border-r border-slate-800 hidden md:flex flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* 2. MOBILE SIDEBAR DRAWER (MODAL) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fadeIn">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] h-full z-10 shadow-2xl">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* 3. THE MAIN CHAT CANVAS (CENTER) */}
      <main className="flex-1 flex flex-col relative w-full overflow-hidden bg-[#0f1117]">
        
        {/* Top Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-[#151821]/90 backdrop-blur-xl sticky top-0 z-20 text-white">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar Toggle Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
              title="Open Sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>

            <h1 className="font-bold tracking-tight text-base sm:text-lg">KnowledgeHub AI</h1>
            <span className="hidden lg:inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Amazon Bedrock SSE Engine Live
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex lg:hidden items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Bedrock Live
            </span>
            <button
              onClick={handleResetChat}
              className="text-xs font-semibold bg-[#2563EB] hover:bg-blue-600 text-white px-3 py-1.5 rounded-xl shadow transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              <span>New Chat</span>
            </button>
          </div>
        </header>

        {/* Chat Messages or Animated Hero Screen Section */}
        <section className="flex-1 overflow-y-auto px-3 sm:px-6 md:px-12 py-6 sm:py-8 space-y-6 sm:space-y-8 scroll-smooth flex flex-col justify-between">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[65vh] max-w-4xl mx-auto px-4 text-center animate-message-reveal pb-28">
              {/* Glowing Orb / AI Emblem */}
              <div className="relative mb-6">
                <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 opacity-60 blur-xl animate-pulse"></div>
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-[#151821] border border-slate-700 flex items-center justify-center shadow-2xl">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-transparent bg-clip-text bg-gradient-to-tr from-blue-400 via-indigo-300 to-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                </div>
              </div>

              {/* Dynamic Gradient Welcome Title */}
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent mb-4">
                Where Knowledge Meets Bedrock AI
              </h2>
              
              <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed mb-8">
                Your AWS-native regulatory and Gazette assistant. Ask questions about Sri Lankan legal frameworks, specimen tax invoices, or official state symbolism with real-time page citations.
              </p>

              {/* Starter Suggestion Pills / Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl text-left">
                <button
                  onClick={() => handleSendMessage(undefined, "What specific purchaser details and TIN requirements must be included on a tax invoice?")}
                  className="group p-4 rounded-2xl bg-[#151821]/80 hover:bg-[#1e2230] border border-slate-800 hover:border-blue-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] hover:-translate-y-0.5 cursor-pointer"
                >
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-blue-400 transition-colors line-clamp-2 mb-2">
                    Tax Invoice Requirements & TIN Details
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <span>Inspect Specimen Rules</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                  </span>
                </button>

                <button
                  onClick={() => handleSendMessage(undefined, "Summarize the key heraldic and industrial symbolism of the Sri Lankan State Emblem as published in the March 2026 Gazette.")}
                  className="group p-4 rounded-2xl bg-[#151821]/80 hover:bg-[#1e2230] border border-slate-800 hover:border-emerald-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_25px_rgba(16,185,129,0.15)] hover:-translate-y-0.5 cursor-pointer"
                >
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors line-clamp-2 mb-2">
                    State Emblem Heraldic Symbolism
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <span>Explore Gazette Insignia</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                  </span>
                </button>

                <button
                  onClick={() => handleSendMessage(undefined, "Who issues the nine-digit tax registration number (TIN) mentioned in the document?")}
                  className="group p-4 rounded-2xl bg-[#151821]/80 hover:bg-[#1e2230] border border-slate-800 hover:border-purple-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_25px_rgba(168,85,247,0.15)] hover:-translate-y-0.5 cursor-pointer"
                >
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-purple-400 transition-colors line-clamp-2 mb-2">
                    Nine-Digit TIN Issuing Authority
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <span>Verify Registration Body</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                  </span>
                </button>

                <button
                  onClick={() => handleSendMessage(undefined, "Can a supplier modify the specimen tax invoice format? What optional details can be included?")}
                  className="group p-4 rounded-2xl bg-[#151821]/80 hover:bg-[#1e2230] border border-slate-800 hover:border-amber-500/50 transition-all duration-200 flex flex-col justify-between hover:shadow-[0_0_25px_rgba(245,158,11,0.15)] hover:-translate-y-0.5 cursor-pointer"
                >
                  <span className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-amber-400 transition-colors line-clamp-2 mb-2">
                    Specimen Invoice Format Modifications
                  </span>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <span>Check Customization Rules</span>
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8 pb-36 w-full">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex animate-message-reveal w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  
                  {/* AI Avatar next to message */}
                  {msg.sender === 'agent' && (
                    <div className="w-8 h-8 rounded-full border flex items-center justify-center mr-3 mt-1 flex-shrink-0 font-bold text-[11px] shadow-sm bg-emerald-950/80 border-emerald-500/30 text-emerald-400">
                      AI
                    </div>
                  )}

                  {/* Bubble / Container */}
                  {msg.sender === 'user' ? (
                    <div className="max-w-[88%] sm:max-w-[80%] rounded-2xl rounded-tr-none p-4 shadow-sm bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8] text-white text-[14px] sm:text-[15px] leading-relaxed">
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                  ) : (
                    <div className="flex-1 max-w-[92%] sm:max-w-[90%] rounded-2xl p-4 sm:p-5 transition-colors bg-[#1e2230]/60 text-slate-200 border border-slate-800">
                      <div className="prose max-w-none text-[14px] sm:text-[15px] leading-relaxed prose-p:leading-relaxed prose-pre:border prose-ul:my-2 prose-li:my-1 prose-invert prose-pre:bg-[#0f1117] prose-pre:border-slate-700 text-slate-200 break-words">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text || (isLoading ? '...' : '')}
                        </ReactMarkdown>
                      </div>

                      {/* 3. SOURCES CITED CARDS (INSIDE CHAT) */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-800 space-y-3">
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              Retrieved Sources & Citations
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            {msg.citations.map((cite, index) => (
                              <div
                                key={index}
                                className="p-3.5 rounded-xl border transition-all duration-200 hover:shadow-md bg-[#151821] border-slate-800 text-slate-300"
                              >
                                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                                  <span className="flex items-center gap-1.5 text-emerald-400 font-mono">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                    {cite.document}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                    Page {cite.page}
                                  </span>
                                </div>

                                {cite.snippet && (
                                  <div className="mt-2.5 p-2.5 rounded-lg border font-mono text-[11px] leading-relaxed overflow-x-auto bg-[#0f1117] border-slate-800 text-slate-400">
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
          )}
        </section>

        {/* 4. FLOATING INPUT BAR (BOTTOM) */}
        <footer className="absolute bottom-3 sm:bottom-6 left-0 right-0 z-20 pointer-events-none">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 pointer-events-auto">
            <form
              onSubmit={(e) => handleSendMessage(e)}
              className="flex items-center gap-2 rounded-2xl p-2 transition-all border bg-[#1e2230]/95 border-slate-700 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl"
            >
              <div className="pl-2 hidden sm:flex items-center gap-1.5 text-[#9CA3AF]">
                <svg className="w-5 h-5 cursor-pointer hover:text-slate-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
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
                placeholder={isLoading ? "Generating response..." : "Ask your document assistant... (Press Enter)"}
                className="flex-1 bg-transparent border-none rounded-xl px-2 py-2.5 text-[14px] sm:text-[15px] focus:outline-none focus:ring-0 disabled:opacity-50 transition-all resize-none overflow-hidden min-h-[44px] max-h-[120px] text-slate-200 placeholder-slate-500 break-words"
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

            <div className="flex items-center justify-center gap-1.5 mt-2 text-[10px] sm:text-[11px] font-medium transition-colors text-slate-500 text-center px-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0 text-blue-500 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              <span>Grounded in official Gazette documents via S3 Vectors. Always verify critical clauses against citations.</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}