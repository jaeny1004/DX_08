import { useState, useRef, useEffect } from 'react';
import { ScreenName } from '../types';
import { ChevronLeft, Send, Bot, User } from 'lucide-react';
import { motion } from 'motion/react';

interface ChatbotProps {
  navigate: (screen: ScreenName) => void;
}

type ChatMessage = {
  role: 'user' | 'bot';
  text: string;
};

/*
 * 웹 백엔드(FastAPI /chat)의 응답 형태.
 *
 * 예전에는 Supabase Edge Function chat-rag 를 불렀는데,
 * 그쪽은 rag-data/pine_rag_chunks.json(75KB)만 보고
 * 웹 대시보드 챗봇은 document_chunks(1,196행)를 봤다.
 * 같은 질문에 서로 다른 답이 나와서 백엔드 하나로 합쳤다.
 */
type ChatResponse = {
  answer?: string;
  sources?: {
    doc_name: string;
    page: number;
  }[];
  detail?: string;
};

/*
 * 챗봇 요청 주소.
 *
 * VITE_RAG_API_BASE 를 주면 그 백엔드를 직접 부른다(로컬 개발용).
 *   VITE_RAG_API_BASE=http://127.0.0.1:8788  ->  http://127.0.0.1:8788/chat
 *
 * 없으면 같은 도메인의 /api/chat 을 부른다. 배포 환경에서는 이쪽이다.
 * 브라우저가 다른 도메인의 백엔드를 직접 부르면 CORS 에 막히기 때문에
 * api/chat.ts 서버리스 함수가 대신 받아 넘긴다.
 */
const RAG_API_BASE = (
  (import.meta.env.VITE_RAG_API_BASE as
    | string
    | undefined) || ''
).replace(/\/+$/, '');

const CHAT_ENDPOINT = RAG_API_BASE
  ? `${RAG_API_BASE}/chat`
  : '/api/chat';

export function Chatbot({ navigate }: ChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: '안녕하세요! 산림 보호 및 소나무 재선충병 관련 궁금한 점을 물어보세요.',
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const userInput = input.trim();

    if (!userInput || isLoading) {
      return;
    }

    /*
     * 질문을 보내기 전까지의 대화 기록입니다.
     * 프론트의 bot 역할을 Edge Function에서 사용하는
     * assistant 역할로 변환합니다.
     */
    const history = messages.map((message) => ({
      role:
        message.role === 'bot'
          ? ('assistant' as const)
          : ('user' as const),
      content: message.text,
    }));

    setMessages((previous) => [
      ...previous,
      {
        role: 'user',
        text: userInput,
      },
    ]);

    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(
        CHAT_ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            question: userInput,
            history,
          }),
        },
      );

      const result =
        (await response.json()) as ChatResponse;

      if (!response.ok) {
        throw new Error(
          result.detail ||
            `챗봇 호출 실패: HTTP ${response.status}`,
        );
      }

      if (!result.answer) {
        throw new Error(
          '챗봇의 답변 내용이 비어 있습니다.',
        );
      }

      setMessages((previous) => [
        ...previous,
        {
          role: 'bot',
          text: result.answer!,
        },
      ]);

      console.log(
        'RAG 검색 출처:',
        result.sources,
      );
    } catch (error) {
      console.error('Chatbot error:', error);

      setMessages((previous) => [
        ...previous,
        {
          role: 'bot',
          text:
            error instanceof Error
              ? `답변을 불러오지 못했습니다. ${error.message}`
              : '답변을 불러오는 중 오류가 발생했습니다.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full bg-system-bg flex flex-col">
      <div className="bg-card-bg p-4 pt-4 flex items-center border-b border-[rgba(0,0,0,0.04)] shadow-sm z-10 shrink-0">
        <button
          onClick={() => navigate('home')}
          className="p-2 -ml-2 text-text-sub"
        >
          <ChevronLeft size={28} />
        </button>

        <div className="flex-1 flex items-center justify-center gap-2 mr-8">
          <div className="w-8 h-8 bg-system-bg rounded-full flex items-center justify-center text-primary">
            <Bot size={18} />
          </div>

          <span className="font-semibold text-text-main">
            AI 산림 컨설턴트
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <motion.div
            key={`${message.role}-${index}`}
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className={`flex gap-3 ${
              message.role === 'user'
                ? 'flex-row-reverse'
                : 'flex-row'
            }`}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary text-white">
              {message.role === 'user' ? (
                <User size={16} />
              ) : (
                <Bot size={16} />
              )}
            </div>

            <div
              className={`p-3 rounded-[15px] max-w-[75%] text-[13px] whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'bg-primary text-white'
                  : 'bg-[#f0f0f0] text-text-main'
              }`}
            >
              {message.text}
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="flex gap-3 flex-row"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary text-white">
              <Bot size={16} />
            </div>

            <div className="p-3 rounded-[15px] max-w-[75%] text-[13px] bg-[#f0f0f0] text-text-main">
              문서를 검색하고 답변을 작성하고 있습니다...
            </div>
          </motion.div>
        )}

        <div ref={endRef} />
      </div>

      <div className="bg-card-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[rgba(0,0,0,0.04)] shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing
              ) {
                void handleSend();
              }
            }}
            disabled={isLoading}
            placeholder={
              isLoading
                ? '답변 작성 중...'
                : '메시지 입력...'
            }
            className="flex-1 bg-system-bg rounded-[10px] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary text-[12px] disabled:opacity-60"
          />

          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading}
            className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center shrink-0 disabled:opacity-50"
          >
            <Send
              size={18}
              className="-ml-0.5"
            />
          </button>
        </div>
      </div>
    </div>
  );
}