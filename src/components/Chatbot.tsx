import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Bot, User, HelpCircle, Loader2, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "model";
  text: string;
}

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: "안녕하세요! 국립산림과학원 소나무재선충병 백서 및 표준 방제 지침(FR-HOM-006)을 숙지한 AI 비서입니다. 매개 하늘소의 우화시기, 수간주사 화합물 기준, 혹은 훈증천막 시방 규격에 대해 무엇이든 여쭤보십시오."
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: messages
        })
      });

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "model", text: data.text }]);
    } catch (error) {
      console.error("Chat API error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: "지침 모델 로딩 지연이 감지되었습니다. 훈증은 메탐소듐을 활용하여 노란색 기밀성 타프로 밀폐하고, 매개 솔수염하늘소는 5~7월 저지대 우화, 북방수염하늘소는 4~6월 잣나무 우화가 산림청 공식 표준 규격입니다."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const presetQuestions = [
    "솔수염하늘소와 북방수염하늘소 우화시기 차이는?",
    "표준 훈증 타프 밀폐 처리 요령은?",
    "예찰 시 송진 분비 저하 여부 확인법은?",
    "XGBoost 500m 격자 모델 설명해줘"
  ];

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col h-[520px] justify-between">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-800 to-green-600 flex items-center justify-center text-white">
            <Bot size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 block leading-tight">국가 산림 백서 통합 AI Assistant</span>
            <span className="text-[10px] text-slate-400 font-bold font-mono">v2.3.1 Gemini 3.5 Grounding (FR-HOM-006)</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
          <Sparkles size={10} className="text-emerald-600" />
          <span>RAG 지식엔진 가동</span>
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : ""}`}
          >
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              msg.role === "user" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
            }`}>
              {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
            </div>

            {/* Bubble */}
            <div className={`p-3 rounded-2xl leading-relaxed font-medium font-sans whitespace-pre-wrap ${
              msg.role === "user" ? "bg-emerald-800 text-white rounded-tr-none" : "bg-slate-100 text-slate-700 rounded-tl-none border border-slate-200/50"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 max-w-[80%]">
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Loader2 size={14} className="animate-spin" />
            </div>
            <div className="bg-slate-100 text-slate-400 p-3 rounded-2xl rounded-tl-none border border-slate-200/50">
              산림 백서 및 방제 특별 규정 대조 기안 중...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Preset fast questions block */}
      <div className="border-t border-slate-100 pt-3 space-y-2">
        <span className="text-[10px] text-slate-400 font-bold block flex items-center gap-1">
          <HelpCircle size={10} />
          <span>자주 하는 행정 실무 질의</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {presetQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(q)}
              disabled={isLoading}
              className="text-[10px] bg-slate-50 border border-slate-200 hover:border-emerald-500 rounded-lg py-1 px-2 text-slate-600 font-semibold text-left transition-all"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input box */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputValue);
          }}
          className="flex gap-2 pt-2"
        >
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder="재선충병 및 방제 규칙에 대해 지참을 구하십시오..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:bg-white focus:border-emerald-800 transition-colors"
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isLoading}
            className="bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl px-3 flex items-center justify-center transition-colors disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
