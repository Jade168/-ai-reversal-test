import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage } from '../types/quant';

interface AiChatColumnProps {
  messages: ChatMessage[];
  aiReady: boolean;
  onInitAi: () => void;
  onSendLocal: (text: string) => void;
  onSendExpert: (text: string) => void;
  isSendingExpert?: boolean;
}

export const AiChatColumn: React.FC<AiChatColumnProps> = ({
  messages,
  aiReady,
  onInitAi,
  onSendLocal,
  onSendExpert,
  isSendingExpert = false
}) => {
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim()) {
        onSendLocal(inputText.trim());
        setInputText('');
      }
    }
  };

  const handleLocalClick = () => {
    if (!inputText.trim()) return;
    onSendLocal(inputText.trim());
    setInputText('');
  };

  const handleExpertClick = () => {
    if (!inputText.trim()) return;
    onSendExpert(inputText.trim());
    setInputText('');
  };

  return (
    <div className="bg-[#0a0a0a] p-2 rounded-md border border-[#8b5cf6] flex flex-col h-full min-h-[380px]">
      {/* Title */}
      <div className="text-[#8b5cf6] mb-1.5 text-[11px] font-semibold">
        🧠 數律AI大腦 v2.0｜東方財富真實數據·聯網分析·語音交互
      </div>

      {/* AI Init Row */}
      <div className="flex gap-1 mb-1.5">
        <button
          onClick={onInitAi}
          disabled={aiReady}
          className="flex-1 h-8 text-xs font-bold rounded text-white transition active:scale-98 disabled:opacity-80"
          style={{
            background: aiReady
              ? '#1f2937'
              : 'linear-gradient(135deg, #8b5cf6, #ec4899)'
          }}
        >
          {aiReady ? 'AI大腦已就緒' : '初始化AI'}
        </button>
        <span
          className="flex-1 h-8 text-xs rounded text-center flex items-center justify-center font-bold"
          style={{
            background: '#111',
            color: aiReady ? '#10b981' : '#94a3b8'
          }}
        >
          狀態: {aiReady ? '已連接 ✅' : '未連接'}
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-1.5 bg-[#050505] rounded-md mb-1.5 border border-[#222] space-y-2 text-xs">
        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div
                key={msg.id}
                className="w-full text-center p-2 rounded bg-cyan-500/10 text-cyan-300 text-[11px] whitespace-pre-wrap leading-relaxed"
              >
                {msg.text}
              </div>
            );
          }

          if (msg.role === 'error') {
            return (
              <div
                key={msg.id}
                className="w-full p-2 rounded bg-red-950/70 border border-red-800 text-red-200 text-[11px]"
              >
                {msg.text}
              </div>
            );
          }

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[88%] p-2 px-3 rounded-lg bg-linear-to-br from-[#8b5cf6] to-[#ec4899] text-white whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>
              </div>
            );
          }

          if (msg.role === 'expert') {
            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[94%] p-2.5 rounded-lg bg-[#1a0b2e] text-[#f5d0fe] border border-[#3b0764] whitespace-pre-wrap leading-relaxed text-[11.5px]">
                  <div className="font-bold text-[#d8b4fe] mb-1 flex items-center gap-1">
                    🌐 專家深度推演
                  </div>
                  {msg.text}
                </div>
              </div>
            );
          }

          // local AI
          return (
            <div key={msg.id} className="flex justify-start">
              <div className="max-w-[94%] p-2.5 rounded-lg bg-[#111] text-[#ddd] border border-[#333] whitespace-pre-wrap leading-relaxed">
                {msg.text}
              </div>
            </div>
          );
        })}
        {isSendingExpert && (
          <div className="text-center p-2 text-purple-300 text-[11px] animate-pulse">
            🌐 正在聯網調用專家大模型進行深度多維度推演...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Row */}
      <div className="flex gap-1 mb-1">
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="提問：TSLA後市點睇？00700支持位？邊隻值得買？"
          className="flex-1 h-8 px-2 text-xs bg-[#111] border border-[#333] rounded text-white outline-hidden focus:border-[#8b5cf6]"
          autoComplete="off"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1">
        <button
          onClick={handleLocalClick}
          className="flex-1 h-8 px-2 text-xs font-bold rounded bg-[#10b981] text-white hover:bg-[#059669] transition active:scale-98"
        >
          💬 AI對話
        </button>
        <button
          onClick={handleExpertClick}
          disabled={isSendingExpert}
          className="flex-1 h-8 px-2 text-xs font-bold rounded bg-[#8b5cf6] text-white hover:bg-[#7c3aed] transition active:scale-98 disabled:opacity-50"
        >
          🌐 專家分析
        </button>
      </div>
    </div>
  );
};
