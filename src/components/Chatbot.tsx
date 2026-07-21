import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  User,
} from "lucide-react";

import {
  askRagChat,
  getRagSourceUrl,
  type ChatHistoryItem,
  type GridContext,
  type RagSource,
} from "../services/ragApi";

interface ChatbotProps {
  selectedGrid?: any;
}

function createMessageId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return createMessageId();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: RagSource[];
  error?: boolean;
}

const INITIAL_MESSAGE: Message = {
  id: "initial",
  role: "assistant",
  text:
    "안녕하세요. 소나무재선충병 예찰·방제지원 AI입니다.\n\n" +
    "등록된 백서·방제지침·연구자료와 지도에서 선택한 위험격자 정보를 함께 분석합니다.\n" +
    "답변 하단에서 가장 관련성이 높은 근거 문서와 페이지를 확인할 수 있습니다.\n\n" +
    "AI 답변은 의사결정 지원을 위한 참고자료이며, 최종 판단은 담당자의 검토가 필요합니다.",
  sources: [],
};

function getSelectedGridProperties(
  selectedGrid: any,
): Record<string, any> | null {
  if (!selectedGrid || typeof selectedGrid !== "object") {
    return null;
  }

  if (
    selectedGrid.properties &&
    typeof selectedGrid.properties === "object"
  ) {
    return selectedGrid.properties;
  }

  return selectedGrid;
}

function buildGridContext(
  selectedGrid: any,
): GridContext | null {
  const properties = getSelectedGridProperties(selectedGrid);

  if (!properties) {
    return null;
  }

  const gridId =
    properties.grid_id ??
    properties.id;

  if (
    gridId === null ||
    gridId === undefined ||
    String(gridId).trim() === ""
  ) {
    return null;
  }

  return {
    grid_id: String(gridId).trim(),

    risk_score:
      properties.risk_score,

    risk_grade:
      properties.risk_grade,

    risk_stage_label:
      properties.risk_stage_label,

    field_priority_score_v3:
      properties.field_priority_score_v3,

    field_priority_grade_v3:
      properties.field_priority_grade_v3 ??
      properties.priority_grade_v3,

    priority_stage_label:
      properties.priority_stage_label,

    pine_ratio:
      properties.pine_ratio,

    infection_pressure:
      properties.infection_pressure ??
      properties.recent_pressure_score,

    recent_pressure_score:
      properties.recent_pressure_score ??
      properties.infection_pressure,

    access_score_v3:
      properties.access_score_v3,

    road_class_near:
      properties.road_class_near ??
      properties.nearest_road_type,

    road_dist_m:
      properties.road_dist_m ??
      properties.distance_to_nearest_road_m_v3,

    river_dist_m:
      properties.river_dist_m,

    env_flag:
      properties.env_flag ??
      properties.environment_caution_flag_v3,

    field_recommended_action_v3:
      properties.field_recommended_action_v3,
  };
}

function isGridReferenceQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();

  return [
    /이\s*격자/,
    /해당\s*격자/,
    /선택(?:한|된)?\s*격자/,
    /현재\s*격자/,
    /격자.*(?:위험도|우선순위|예찰|조치|분석|설명)/,
    /격자.*(?:골랐|선택했|클릭했)/,
  ].some((item) => item.test(normalized));
}

export default function Chatbot({
  selectedGrid,
}: ChatbotProps) {
  const [messages, setMessages] =
    useState<Message[]>([INITIAL_MESSAGE]);

  const [inputValue, setInputValue] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [isPresetOpen, setIsPresetOpen] =
    useState(false);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const gridContext = useMemo(
    () => buildGridContext(selectedGrid),
    [selectedGrid],
  );

  const selectedGridId =
    gridContext?.grid_id
      ? String(gridContext.grid_id)
      : "";

  const hasSelectedGrid =
    selectedGridId.length > 0;

  const previousGridIdRef =
    useRef<string | null>(null);

  useEffect(() => {
    const previousGridId = previousGridIdRef.current;

    if (
      previousGridId !== null &&
      previousGridId !== selectedGridId
    ) {
      setMessages([INITIAL_MESSAGE]);
      setInputValue("");
      setIsPresetOpen(false);
      setIsLoading(false);
    }

    previousGridIdRef.current = selectedGridId;
  }, [selectedGridId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  const handleSendMessage = async (
    rawText: string,
  ) => {
    const text = rawText.trim();

    if (!text || isLoading) {
      return;
    }

    const history: ChatHistoryItem[] =
      messages
        .filter(
          (message) =>
            message.id !== "initial",
        )
        .map((message) => ({
          role: message.role,
          content: message.text,
        }));

    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      text,
    };

    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setInputValue("");

    if (
      !hasSelectedGrid &&
      isGridReferenceQuestion(text)
    ) {
      const guideMessage: Message = {
        id: createMessageId(),
        role: "assistant",
        text:
          "현재 지도에서 선택된 격자가 없습니다.\n\n" +
          "지도에서 분석하려는 500m 격자를 한 번 클릭한 뒤 다시 질문해 주세요. " +
          "격자가 선택되면 격자 ID·위험도·예찰 우선순위·소나무류 비율·접근성 정보를 함께 분석합니다.\n\n" +
          "일반적인 소나무재선충병 예찰·방제 기준이나 백서 내용은 격자를 선택하지 않아도 질문할 수 있습니다.",
        sources: [],
      };

      setMessages((previous) => [
        ...previous,
        guideMessage,
      ]);

      return;
    }

    setIsLoading(true);

    try {
      const result = await askRagChat(
        text,
        history,
        gridContext,
      );

      const assistantMessage: Message = {
        id: createMessageId(),
        role: "assistant",
        text: result.answer,
        sources: Array.isArray(result.sources)
          ? result.sources.slice(0, 1)
          : [],
      };

      setMessages((previous) => [
        ...previous,
        assistantMessage,
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "질문 처리 중 알 수 없는 오류가 발생했습니다.";

      setMessages((previous) => [
        ...previous,
        {
          id: createMessageId(),
          role: "assistant",
          text:
            "지식엔진에 연결하지 못했습니다.\n\n" +
            `${errorMessage}\n\n` +
            "RAG 백엔드가 8788 포트에서 실행 중인지 확인해 주세요.",
          sources: [],
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const presetQuestions = hasSelectedGrid
    ? [
        "현재 선택한 격자의 위험도를 설명해줘.",
        "이 격자를 우선 예찰해야 하는 이유는?",
        "이 격자에서 현장 확인할 사항은?",
        "관련 백서 근거를 바탕으로 조치를 추천해줘.",
      ]
    : [
        "솔수염하늘소와 북방수염하늘소의 우화 시기 차이는?",
        "소나무재선충병 예찰 대상지역 선정 기준은?",
        "표준 훈증 처리 시 확인해야 할 사항은?",
        "예찰 시 송진 분비 저하 여부는 어떻게 확인하나요?",
      ];

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="flex justify-between items-center border-b border-slate-200 px-6 py-5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-800 to-green-600 flex items-center justify-center text-white shrink-0">
            <Bot size={19} />
          </div>

          <div className="min-w-0">
            <span className="text-sm font-extrabold text-slate-900 block leading-tight">
              소나무재선충병 예찰·방제지원 AI
            </span>

            <span className="text-[11px] text-slate-400 font-bold">
              {hasSelectedGrid
                ? `선택 격자 GRID-${selectedGridId} 연계 중`
                : "격자 미선택 · 백서 중심 분석"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-bold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 shrink-0">
          <Sparkles
            size={11}
            className="text-emerald-600"
          />
          <span>RAG 지식엔진</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 max-w-[88%] ${
              message.role === "user"
                ? "ml-auto flex-row-reverse"
                : ""
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                message.role === "user"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {message.role === "user" ? (
                <User size={15} />
              ) : (
                <Bot size={15} />
              )}
            </div>

            <div className="min-w-0">
              <div
                className={`px-4 py-3 rounded-2xl leading-7 font-medium whitespace-pre-wrap break-words ${
                  message.role === "user"
                    ? "bg-emerald-800 text-white rounded-tr-none"
                    : message.error
                      ? "bg-rose-50 text-rose-700 rounded-tl-none border border-rose-200"
                      : "bg-slate-100 text-slate-700 rounded-tl-none border border-slate-200/70"
                }`}
              >
                {message.text}
              </div>

              {message.sources &&
                message.sources.length > 0 && (
                  <div className="mt-2.5 border border-emerald-100 bg-emerald-50/60 rounded-xl p-3">
                    <strong className="text-[11px] text-emerald-800 block mb-1.5">
                      가장 관련성 높은 근거 자료
                    </strong>

                    {message.sources
                      .slice(0, 1)
                      .map((source, index) => (
                        <a
                          key={`${source.doc_name}-${source.page}-${index}`}
                          href={getRagSourceUrl(source)}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[11px] leading-5 text-slate-600 hover:text-emerald-800 hover:underline break-words"
                        >
                          {source.doc_name}
                          {" · "}
                          {source.page}쪽
                        </a>
                      ))}
                  </div>
                )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 max-w-[80%]">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Loader2
                size={15}
                className="animate-spin"
              />
            </div>

            <div className="bg-slate-100 text-slate-500 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-200/70">
              {hasSelectedGrid
                ? "선택 격자 정보와 백서 근거를 함께 분석하고 있습니다..."
                : "등록된 백서와 방제지침에서 근거를 검색하고 있습니다..."}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 bg-white px-6 py-4 shrink-0">
        <button
          type="button"
          onClick={() =>
            setIsPresetOpen(
              (previous) => !previous
            )
          }
          className="w-full flex items-center justify-between rounded-xl px-2 py-2 text-left text-slate-500 hover:bg-slate-50 transition-colors"
          aria-expanded={isPresetOpen}
        >
          <span className="text-[11px] font-bold flex items-center gap-1.5">
            <HelpCircle size={12} />
            {hasSelectedGrid
              ? "선택 격자 추천 질문"
              : "자주 하는 행정·예찰 질의"}
          </span>

          <ChevronDown
            size={15}
            className={`transition-transform ${
              isPresetOpen
                ? "rotate-180"
                : ""
            }`}
          />
        </button>

        {isPresetOpen && (
          <div className="flex flex-wrap gap-2 pt-2 pb-3">
            {presetQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() =>
                  handleSendMessage(question)
                }
                disabled={isLoading}
                className="text-[11px] bg-slate-50 border border-slate-200 hover:border-emerald-500 rounded-lg py-1.5 px-2.5 text-slate-600 font-semibold text-left transition-all disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSendMessage(inputValue);
          }}
          className="flex gap-2 pt-2"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(event) =>
              setInputValue(event.target.value)
            }
            disabled={isLoading}
            placeholder={
              hasSelectedGrid
                ? "선택 격자의 위험도·예찰 조치를 질문하세요..."
                : "등록된 백서·방제지침에 대해 질문하세요..."
            }
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:bg-white focus:border-emerald-800 transition-colors"
          />

          <button
            type="submit"
            disabled={
              !inputValue.trim() ||
              isLoading
            }
            className="w-12 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl flex items-center justify-center transition-colors disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Send size={17} />
          </button>
        </form>

        <p className="text-[10px] text-slate-400 leading-relaxed mt-3">
          위험도는 감염 확정값이 아닌 신규 발생 후보지역 예측 결과입니다.
          최종 예찰·방제 판단은 담당자의 현장 검토가 필요합니다.
        </p>
      </div>
    </div>
  );
}
