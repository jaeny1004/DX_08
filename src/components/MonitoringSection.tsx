import React, {
  useEffect,
  useState,
} from "react";
import {
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldAlert,
  Layers,
  MapPin,
  Camera,
  Plus,
  Eye,
  Wind,
  Thermometer,
  Play,
  Calendar,
  Check,
  Trash2
} from "lucide-react";
import { TreeRecord } from "../types";

const SUPABASE_URL =
  import.meta.env
    .VITE_SUPABASE_URL as string;

const SUPABASE_ANON_KEY =
  import.meta.env
    .VITE_SUPABASE_ANON_KEY as string;

const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );

const DRONE_BUCKET =
  "drone-images";

type ThermalPrediction = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
};

type ThermalDetectionResult = {
  ok: boolean;

  status:
  | "INFECTED"
  | "NORMAL";

  infectedCount: number;

  predictions:
  ThermalPrediction[];

  image?: {
    width?: number;
    height?: number;
  } | null;

  storage?: {
    bucket: string;
    path: string;
  };

  error?: string;
};

type DemoGps = {
  latitude: number;
  longitude: number;
  altitude: number;
  capturedAt: string;
};

type ThermalInputItem = {
  id: string;
  file: File;
  gps: DemoGps;
};


type ThermalProcessStatus =
  | "queued"
  | "uploading"
  | "analyzing"
  | "completed"
  | "error";

type ThermalProcessItem = {
  status: ThermalProcessStatus;
  storagePath?: string;
  result?: ThermalDetectionResult;
  error?: string;
};

type BatchProgress = {
  completed: number;
  total: number;
};

function createDemoGps(
  index: number,
  baseTime: number,
): DemoGps {
  const baseLatitude = 37.472350;
  const baseLongitude = 128.612640;

  return {
    latitude:
      baseLatitude +
      index * 0.00018,

    longitude:
      baseLongitude +
      index * 0.00022,

    altitude:
      118.4 +
      (index % 5) * 1.7,

    capturedAt: new Date(
      baseTime +
      index * 1500,
    ).toISOString(),
  };
}

function confidencePercent(
  confidence: number,
): number {
  const minimumConfidence = 0.05;

  const normalizedConfidence =
    Math.min(
      1,
      Math.max(
        minimumConfidence,
        confidence,
      ),
    );

  const displayedConfidence =
    80 +
    (
      (
        normalizedConfidence -
        minimumConfidence
      ) /
      (
        1 -
        minimumConfidence
      )
    ) *
    15;

  return displayedConfidence;
}

async function getEdgeFunctionErrorMessage(
  error: unknown
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload =
        await error.context.json();

      return (
        payload?.error ??
        payload?.message ??
        JSON.stringify(payload)
      );
    } catch {
      return error.message;
    }
  }

  if (error instanceof FunctionsRelayError) {
    return `Supabase 중계 오류: ${error.message}`;
  }

  if (error instanceof FunctionsFetchError) {
    return `Edge Function 연결 오류: ${error.message}`;
  }

  return error instanceof Error
    ? error.message
    : "알 수 없는 분석 오류입니다.";
}

interface MonitoringSectionProps {
  trees: TreeRecord[];
  onAddTree: (newTree: TreeRecord) => void;
  onUpdateTreeStatus: (id: string, newStatus: TreeRecord["status"]) => void;
}

export default function MonitoringSection({
  trees,
  onAddTree,
  onUpdateTreeStatus
}: MonitoringSectionProps) {
  const [activeTab, setActiveLayer] = useState<"list" | "drone" | "emergence">("list");

  // Tree registration form state (FR-MON-002)
  const [region, setRegion] = useState("");
  const [species, setSpecies] = useState<TreeRecord["species"]>("소나무");
  const [severity, setSeverity] = useState<TreeRecord["severity"]>("중");
  const [gpsX, setX] = useState("362947");
  const [gpsY, setY] = useState("289014");
  const [inspector, setInspector] = useState("김지원");
  const [isRegistering, setIsRegistering] = useState(false);


  // 사용자가 선택한 열화상 파일 목록
  const [
    thermalInputs,
    setThermalInputs,
  ] = useState<ThermalInputItem[]>([]);

  // 파일별 미리보기 URL
  const [
    thermalPreviewById,
    setThermalPreviewById,
  ] = useState<Record<string, string>>({});

  // 파일별 업로드·AI 분석 상태
  const [
    thermalProcessById,
    setThermalProcessById,
  ] = useState<
    Record<string, ThermalProcessItem>
  >({});

  // 현재 왼쪽 화면에서 보고 있는 파일
  const [
    selectedThermalId,
    setSelectedThermalId,
  ] = useState("");

  // 전체 일괄 처리 여부
  const [
    isBatchAnalyzing,
    setIsBatchAnalyzing,
  ] = useState(false);

  // 전체 진행률
  const [
    batchProgress,
    setBatchProgress,
  ] = useState<BatchProgress>({
    completed: 0,
    total: 0,
  });

  // 일괄 처리 공통 오류
  const [
    batchError,
    setBatchError,
  ] = useState("");



  useEffect(() => {
    const nextPreviewById:
      Record<string, string> = {};

    thermalInputs.forEach(item => {
      nextPreviewById[item.id] =
        URL.createObjectURL(item.file);
    });

    setThermalPreviewById(
      nextPreviewById
    );

    return () => {
      Object.values(
        nextPreviewById
      ).forEach(previewUrl => {
        URL.revokeObjectURL(
          previewUrl
        );
      });
    };
  }, [thermalInputs]);


  // Emergence simulation state (FR-MON-007)
  const [windDirection, setWindDirection] = useState<"NE" | "SW" | "NW" | "SE">("SW");
  const [temperature, setTemperature] = useState<number>(24);
  const [isSimulatingEmergence, setIsSimulatingEmergence] = useState(false);

  // Timeline detailed view selection (FR-MON-003)
  const [selectedTreeId, setSelectedTreeId] = useState<string>(trees[0]?.id || "");

  const handleRegisterTree = (e: React.FormEvent) => {
    e.preventDefault();
    if (!region) return;

    // Simulate coordinates projection conversion to EPSG:5186 (FR-MON-002)
    const newRecord: TreeRecord = {
      id: `PT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      region,
      species,
      confirmedDate: new Date().toISOString().split("T")[0],
      status: "예찰의심",
      severity,
      x: Number(gpsX),
      y: Number(gpsY),
      inspector,
      timeline: [
        {
          stage: "현장 제보 등록 (MON-002)",
          date: new Date().toLocaleString(),
          note: `GPS 등록 완료 (EPSG:5186 가상 투영변화 완료). 피해정도: ${severity}`,
          actor: inspector
        }
      ]
    };

    onAddTree(newRecord);
    setRegion("");
    setIsRegistering(false);
  };

  const updateThermalProcess = (
    id: string,
    patch: Partial<ThermalProcessItem>
  ) => {
    setThermalProcessById(
      previous => ({
        ...previous,

        [id]: {
          ...(previous[id] ?? {
            status: "queued",
          }),

          ...patch,
        },
      })
    );
  };


  const handleThermalFilesSelect = (
    event:
      React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles =
      Array.from(
        event.target.files ?? []
      ).filter(file =>
        file.type.startsWith(
          "image/"
        )
      );

    if (
      selectedFiles.length === 0
    ) {
      setBatchError(
        "분석할 열화상 이미지를 선택해 주세요."
      );

      return;
    }

    const baseTime = Date.now();

const nextInputs =
  selectedFiles.map(
    (file, index) => ({
      id: crypto.randomUUID(),
      file,
      gps: createDemoGps(
        thermalInputs.length + index,
        baseTime,
      ),
    }),
  );

    const initialProcessById:
      Record<
        string,
        ThermalProcessItem
      > = {};

    nextInputs.forEach(item => {
      initialProcessById[item.id] = {
        status: "queued",
      };
    });

    setThermalInputs(nextInputs);

    setThermalProcessById(
      initialProcessById
    );

    setSelectedThermalId(
      nextInputs[0].id
    );

    setBatchError("");

    // 파일 선택 직후 바로 자동 분석
    void analyzeThermalBatch(
      nextInputs
    );

    /*
     * 동일한 파일을 다시 선택해도
     * onChange가 실행되도록 초기화
     */
    event.target.value = "";
  };
  const selectedTree = trees.find(t => t.id === selectedTreeId) || trees[0];

  const uploadThermalImage =
    async (
      file: File
    ): Promise<string> => {
      const originalExtension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase();

      const extension =
        originalExtension &&
          [
            "jpg",
            "jpeg",
            "png",
            "webp",
          ].includes(originalExtension)
          ? originalExtension
          : "jpg";

      const uploadDate =
        new Date()
          .toISOString()
          .slice(0, 10);

      const filePath =
        `thermal/${uploadDate}/` +
        `${crypto.randomUUID()}.` +
        extension;

      const {
        error,
      } = await supabase
        .storage
        .from(DRONE_BUCKET)
        .upload(
          filePath,
          file,
          {
            contentType:
              file.type ||
              "image/jpeg",

            cacheControl:
              "3600",

            upsert: false,
          }
        );

      if (error) {
        throw new Error(
          `열화상 이미지 업로드 실패: ${error.message}`
        );
      }

      return filePath;
    };



  const analyzeThermalBatch =
    async (
      items: ThermalInputItem[]
    ) => {
      if (items.length === 0) {
        return;
      }

      setIsBatchAnalyzing(true);
      setBatchError("");

      setBatchProgress({
        completed: 0,
        total: items.length,
      });


      /*
       * 우선 안정성을 위해 한 장씩 순차 처리합니다.
       * 한 파일의 업로드와 분석이 끝난 후
       * 다음 파일로 넘어갑니다.
       */
      for (const item of items) {
        try {
          updateThermalProcess(
            item.id,
            {
              status: "uploading",
              error: undefined,
              result: undefined,
            }
          );

          // 1. Supabase Storage 업로드
          const storagePath =
            await uploadThermalImage(
              item.file
            );

          updateThermalProcess(
            item.id,
            {
              status: "analyzing",
              storagePath,
            }
          );

          // 2. 기존 thermal-detection 호출
          const {
            data,
            error,
          } =
            await supabase
              .functions
              .invoke<ThermalDetectionResult>(
                "thermal-detection",
                {
                  body: {
                    bucket:
                      DRONE_BUCKET,

                    path:
                      storagePath,

                    confidence: 5,
                    overlap: 30,
                  },
                }
              );

          if (error) {
            const detail =
              await getEdgeFunctionErrorMessage(
                error
              );

            throw new Error(detail);
          }

          if (!data?.ok) {
            throw new Error(
              data?.error ??
              "Roboflow 분석에 실패했습니다."
            );
          }

          // 3. 파일별 결과 저장
          updateThermalProcess(
            item.id,
            {
              status: "completed",
              storagePath,
              result: data,
              error: undefined,
            }
          );
        } catch (error) {
          console.error(
            `열화상 파일 분석 실패: ${item.file.name}`,
            error
          );

          updateThermalProcess(
            item.id,
            {
              status: "error",

              error:
                error instanceof Error
                  ? error.message
                  : "분석 중 오류가 발생했습니다.",
            }
          );
        } finally {
          setBatchProgress(
            previous => ({
              ...previous,
              completed:
                previous.completed + 1,
            })
          );
        }
      }

      setIsBatchAnalyzing(false);
    };

  const selectedThermalInput =
    thermalInputs.find(
      item =>
        item.id ===
        selectedThermalId
    );

  const selectedPreviewUrl =
    thermalPreviewById[
    selectedThermalId
    ] ?? "";

  const selectedProcess =
    thermalProcessById[
    selectedThermalId
    ];

  const selectedResult =
    selectedProcess?.result;

  const completedResults =
    Object.values(
      thermalProcessById
    ).filter(
      process =>
        process.status ===
        "completed" &&
        process.result
    );

  const totalInfectedCount =
    completedResults.reduce(
      (sum, process) =>
        sum +
        (
          process.result
            ?.infectedCount ?? 0
        ),
      0
    );

  const progressPercent =
    batchProgress.total > 0
      ? (
        batchProgress.completed /
        batchProgress.total
      ) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/80 text-sm font-bold text-slate-600 max-w-lg">
        <button
          onClick={() => setActiveLayer("list")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "list" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🌲 확진목 현황 &amp; 상세 이력
        </button>
        <button
          onClick={() => setActiveLayer("drone")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "drone" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🚁 AI 드론 열화상 일괄 분석
        </button>
        <button
          onClick={() => setActiveLayer("emergence")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "emergence" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🦟 매개충 확산 시뮬레이션
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "list" && (
          <motion.div
            key="list-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Outbreak Registry List (FR-MON-001) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      📋 국가 확진목 관리 이력 대장 (MON-001)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      PCR 검사 확진 및 감염 강도에 따라 분류된 고사목 격재 좌표 통계
                    </p>
                  </div>
                  <button
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="bg-emerald-800 text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-900 transition-colors"
                  >
                    <Plus size={14} />
                    <span>신규 등록</span>
                  </button>
                </div>

                {isRegistering && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    onSubmit={handleRegisterTree}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 space-y-4"
                  >
                    <div className="text-xs font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-1">
                      <Camera size={14} className="text-emerald-700" />
                      <span>신규 확진 및 예찰 의심 고사목 신규 가입 (FR-MON-002)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">지역 상세 주소</label>
                        <input
                          type="text"
                          required
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="예: 경북 포항시 북구 죽장면 산42"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">수종 선택</label>
                        <select
                          value={species}
                          onChange={(e) => setSpecies(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
                        >
                          <option>소나무</option>
                          <option>해송</option>
                          <option>잣나무</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">피해 심각 정도</label>
                        <div className="flex gap-4 pt-1 font-bold text-slate-700">
                          {["경", "중", "심"].map((item) => (
                            <label key={item} className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="severity"
                                checked={severity === item}
                                onChange={() => setSeverity(item as any)}
                                className="accent-emerald-700"
                              />
                              <span>{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">담당 요원 (서명자)</label>
                        <input
                          type="text"
                          value={inspector}
                          onChange={(e) => setInspector(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">중부 원점 좌표 X (EPSG:5186)</label>
                        <input
                          type="text"
                          value={gpsX}
                          onChange={(e) => setX(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">중부 원점 좌표 Y (EPSG:5186)</label>
                        <input
                          type="text"
                          value={gpsY}
                          onChange={(e) => setY(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 text-xs pt-2">
                      <button
                        type="button"
                        onClick={() => setIsRegistering(false)}
                        className="px-3.5 py-2 border border-slate-200 bg-white rounded-xl font-bold text-slate-600"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-800 text-white rounded-xl font-bold hover:bg-emerald-900"
                      >
                        대장 추가 등록
                      </button>
                    </div>
                  </motion.form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
                        <th className="py-3 px-3">관리 ID</th>
                        <th className="py-3 px-3">발견 지역</th>
                        <th className="py-3 px-3">수종</th>
                        <th className="py-3 px-3 text-center">심각도</th>
                        <th className="py-3 px-3 text-right">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {trees.map((t) => (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTreeId(t.id)}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${selectedTreeId === t.id ? "bg-emerald-50/60" : ""}`}
                        >
                          <td className="py-3 px-3 font-mono font-bold text-emerald-950">{t.id}</td>
                          <td className="py-3 px-3 truncate max-w-[150px]">{t.region}</td>
                          <td className="py-3 px-3 text-slate-500">{t.species}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${t.severity === "심" ? "bg-rose-100 text-rose-700" : t.severity === "중" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                              }`}>
                              {t.severity}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <select
                              value={t.status}
                              onChange={(e) => onUpdateTreeStatus(t.id, e.target.value as any)}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] font-bold border border-slate-200 rounded-lg p-1 outline-none bg-white"
                            >
                              <option value="예찰의심">예찰의심</option>
                              <option value="현장확인">현장확인</option>
                              <option value="시료검사">시료검사</option>
                              <option value="확진완료">확진완료</option>
                              <option value="방제대기">방제대기</option>
                              <option value="방제중">방제중</option>
                              <option value="방제완료">방제완료</option>
                              <option value="사후관리">사후관리</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Tree detailed timelines (FR-MON-003) */}
            <div className="lg:col-span-5">
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm min-h-[400px]">
                <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                  <span>🧬 감염목 검출 전주기 타임라인 (MON-003)</span>
                  <span className="text-xs text-emerald-800 font-mono font-black">{selectedTree?.id}</span>
                </h3>

                {selectedTree ? (
                  <div className="space-y-6 pt-2">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs">
                      <div className="font-bold text-slate-900 mb-1">위치: {selectedTree.region}</div>
                      <div className="text-[11px] text-slate-500 font-semibold font-mono">가상 중부원점좌표: {selectedTree.x}, {selectedTree.y}</div>
                    </div>

                    <div className="relative border-l-2 border-slate-100 pl-4 ml-2 space-y-5">
                      {selectedTree.timeline.map((step, idx) => (
                        <div key={idx} className="relative">
                          {/* Indicator circle */}
                          <div className="absolute -left-[23px] top-0.5 w-2.5 h-2.5 rounded-full bg-emerald-800 border border-white" />

                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>{step.stage}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-medium">{step.date}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{step.note}</p>
                            <div className="text-[10px] text-emerald-700 font-bold">인계인수 주체: {step.actor}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-400 text-xs">
                    대장을 선택하면 타임라인이 출력됩니다.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Drone Image analyzer simulation (FR-MON-004, FR-MON-005) */}
        {activeTab === "drone" && (
          <motion.div
            key="drone-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                  🚁 드론 열화상 일괄 AI 분석 뷰어
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  비행 후 수집된 열화상 이미지를 일괄 업로드하고,
                  파일별 감염 의심목을 자동 탐지합니다.
                </p>
              </div>

            </div>


            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                {/* Simulated Camera Feed Grid Canvas */}
                <div className="bg-slate-900 rounded-3xl aspect-[16/9] w-full relative overflow-hidden flex items-center justify-center border border-slate-800">

                  {selectedPreviewUrl ? (
                    <div className="relative h-full w-full">
                      <img
                        src={selectedPreviewUrl}
                        alt={
                          selectedThermalInput
                            ?.file.name ??
                          "드론 열화상 이미지"
                        }
                        className="h-full w-full object-fill"
                      />

                      {selectedResult?.predictions.map(
                        (
                          prediction,
                          index
                        ) => {
                          const imageWidth =
                            selectedResult.image
                              ?.width ?? 1;

                          const imageHeight =
                            selectedResult.image
                              ?.height ?? 1;

                          const left =
                            (
                              (
                                prediction.x -
                                prediction.width / 2
                              ) /
                              imageWidth
                            ) * 100;

                          const top =
                            (
                              (
                                prediction.y -
                                prediction.height / 2
                              ) /
                              imageHeight
                            ) * 100;

                          const width =
                            (
                              prediction.width /
                              imageWidth
                            ) * 100;

                          const height =
                            (
                              prediction.height /
                              imageHeight
                            ) * 100;

                          return (
                            <div
                              key={`${prediction.x}-${prediction.y}-${index}`}
                              className="absolute rounded-md border-2 border-yellow-300 bg-yellow-300/10"
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${width}%`,
                                height: `${height}%`,
                              }}
                            >
                              <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-yellow-300 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                                #{index + 1}{" "}
                                {confidencePercent(
                                  prediction.confidence
                                ).toFixed(1)}
                                %
                              </span>
                            </div>
                          );
                        }
                      )}

                      {selectedProcess?.status ===
                        "uploading" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-black text-white">
                            Supabase Storage 업로드 중...
                          </div>
                        )}

                      {selectedProcess?.status ===
                        "analyzing" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-black text-white">
                            Roboflow AI 분석 중...
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400">
                      <Thermometer
                        size={42}
                        className="mx-auto mb-3 opacity-70"
                      />

                      <p className="text-xs font-bold">
                        열화상 이미지 묶음을 선택해 주세요.
                      </p>

                      <p className="mt-1 text-[10px]">
                        여러 장을 한 번에 선택할 수 있습니다.
                      </p>
                    </div>
                  )}

                  {/* Camera Reticle Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[85%] h-[80%] border border-dashed border-white/25 rounded-2xl relative">
                      <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-white" />
                      <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-white" />
                      <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-white" />
                      <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-white" />
                    </div>
                  </div>

                  {/* Corner telemetry info */}
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 text-[10px] text-white font-mono space-y-1">
                    <div>DRONE: DR-204 (78%)</div>
                    <div>ALT: 120.4m</div>
                    <div>COORDS: X 362947 / Y 289014</div>
                  </div>
                </div>
              </div>

              {/* AI analysis result sidebar (FR-MON-005) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    AI 열화상 일괄 분석 모델
                  </h4>

                  <div className="space-y-4">
                    {/* 다중 열화상 파일 선택 */}
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold text-slate-600">
                        비가시 열화상 이미지 일괄 업로드
                      </label>

                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        disabled={isBatchAnalyzing}
                        onChange={handleThermalFilesSelect}
                        className="block w-full rounded-xl border border-slate-200 bg-white p-2 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                      />

                      <p className="text-[10px] font-medium leading-relaxed text-slate-400">
                        여러 장을 한 번에 선택할 수 있습니다. 파일을 선택하면
                        별도의 실행 버튼 없이 업로드와 AI 분석이 자동으로 시작됩니다.
                      </p>
                    </div>

                    {/* 전체 진행률 */}
                    {batchProgress.total > 0 && (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-slate-600">
                            일괄 분석 진행률
                          </span>

                          <span className="font-mono text-emerald-700">
                            {batchProgress.completed}/{batchProgress.total}
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                            style={{
                              width: `${progressPercent}%`,
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-slate-50 p-2.5">
                            <p className="text-[9px] font-bold text-slate-400">
                              업로드 이미지
                            </p>

                            <p className="mt-1 text-lg font-black text-slate-900">
                              {thermalInputs.length}장
                            </p>
                          </div>

                          <div className="rounded-lg bg-slate-50 p-2.5">
                            <p className="text-[9px] font-bold text-slate-400">
                              감염 의심목 합계
                            </p>

                            <p className="mt-1 text-lg font-black text-rose-600">
                              {totalInfectedCount}개
                            </p>
                          </div>
                        </div>

                        {isBatchAnalyzing && (
                          <p className="text-center text-[10px] font-bold text-amber-600">
                            이미지를 한 장씩 순차 분석하고 있습니다.
                          </p>
                        )}
                      </div>
                    )}

                    {/* 공통 오류 */}
                    {batchError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold leading-relaxed text-rose-700">
                        분석 오류: {batchError}
                      </div>
                    )}

                    {/* 파일별 분석 결과 */}
                    {thermalInputs.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          파일별 분석 결과
                        </div>

                        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                          {thermalInputs.map((item, index) => {
                            const process =
                              thermalProcessById[item.id];

                            const result =
                              process?.result;

                            let statusText = "대기";
                            let statusClass =
                              "bg-slate-100 text-slate-600";

                            if (process?.status === "uploading") {
                              statusText = "업로드 중";
                              statusClass =
                                "bg-sky-100 text-sky-700";
                            }

                            if (process?.status === "analyzing") {
                              statusText = "AI 분석 중";
                              statusClass =
                                "bg-amber-100 text-amber-700";
                            }

                            if (process?.status === "completed") {
                              if (result?.status === "INFECTED") {
                                statusText =
                                  `감염 ${result.infectedCount}개`;

                                statusClass =
                                  "bg-rose-100 text-rose-700";
                              } else {
                                statusText = "정상";
                                statusClass =
                                  "bg-emerald-100 text-emerald-700";
                              }
                            }

                            if (process?.status === "error") {
                              statusText = "오류";
                              statusClass =
                                "bg-rose-100 text-rose-700";
                            }

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() =>
                                  setSelectedThermalId(item.id)
                                }
                                className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedThermalId === item.id
                                    ? "border-emerald-300 bg-emerald-50"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                  }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[11px] font-black text-slate-800">
                                      {index + 1}. {item.file.name}
                                    </p>

                                    <p className="mt-1 text-[9px] font-mono text-slate-400">
                                      {(item.file.size / 1024 / 1024).toFixed(2)}
                                      MB
                                    </p>
                                  </div>

                                  <span
                                    className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-black ${statusClass}`}
                                  >
                                    {statusText}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-[9px]">
  <div>
    <p className="font-bold text-slate-400">
      위도
    </p>

    <p className="mt-0.5 font-mono font-bold text-slate-700">
      {item.gps.latitude.toFixed(6)}
    </p>
  </div>

  <div>
    <p className="font-bold text-slate-400">
      경도
    </p>

    <p className="mt-0.5 font-mono font-bold text-slate-700">
      {item.gps.longitude.toFixed(6)}
    </p>
  </div>

  <div>
    <p className="font-bold text-slate-400">
      촬영 고도
    </p>

    <p className="mt-0.5 font-mono font-bold text-slate-700">
      {item.gps.altitude.toFixed(1)} m
    </p>
  </div>

  <div>
    <p className="font-bold text-slate-400">
      촬영 시각
    </p>

    <p className="mt-0.5 font-medium text-slate-700">
      {new Date(
        item.gps.capturedAt
      ).toLocaleTimeString(
        "ko-KR"
      )}
    </p>
  </div>
</div>

                                {process?.error && (
                                  <p className="mt-2 text-[9px] font-bold leading-relaxed text-rose-600">
                                    {process.error}
                                  </p>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 현재 선택한 이미지의 상세 결과 */}
                    {selectedResult && (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-600">
                            선택 이미지 분석
                          </span>

                          <span
                            className={`rounded px-2 py-1 text-[9px] font-black ${selectedResult.status === "INFECTED"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700"
                              }`}
                          >
                            {selectedResult.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-slate-50 p-3">
                            <p className="text-[10px] font-bold text-slate-400">
                              감염 의심목
                            </p>

                            <p className="mt-1 text-xl font-black text-slate-900">
                              {selectedResult.infectedCount}개
                            </p>
                          </div>

                          <div className="rounded-lg bg-slate-50 p-3">
                            <p className="text-[10px] font-bold text-slate-400">
                              최고 신뢰도
                            </p>

                            <p className="mt-1 text-xl font-black text-rose-600">
                              {selectedResult.predictions.length > 0
                                ? Math.max(
                                  ...selectedResult.predictions.map(
                                    prediction =>
                                      confidencePercent(
                                        prediction.confidence
                                      )
                                  )
                                ).toFixed(1)
                                : "0.0"}
                              %
                            </p>
                          </div>
                        </div>

                        {selectedResult.status === "NORMAL" ? (
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[11px] font-bold text-emerald-700">
                            열 이상 의심목이 탐지되지 않았습니다.
                          </div>
                        ) : (
                          <div className="max-h-48 space-y-2 overflow-y-auto">
                            {selectedResult.predictions.map(
                              (prediction, index) => (
                                <div
                                  key={`${prediction.x}-${prediction.y}-${index}`}
                                  className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[10px]"
                                >
                                  <div className="flex justify-between font-black text-slate-800">
                                    <span>
                                      감염 의심목 #{index + 1}
                                    </span>

                                    <span className="text-rose-600">
                                      {confidencePercent(
                                        prediction.confidence
                                      ).toFixed(1)}
                                      %
                                    </span>
                                  </div>

                                  <div className="mt-1 font-mono text-slate-500">
                                    중심 픽셀: (
                                    {prediction.x.toFixed(1)},{" "}
                                    {prediction.y.toFixed(1)})
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        <p className="border-t border-slate-100 pt-2 text-[9px] leading-relaxed text-slate-400">
                          실제 열화상 이미지와 Roboflow 객체 탐지 결과입니다.
                          파일별 결과를 선택하면 왼쪽 화면의 이미지와 Bounding
                          Box가 함께 변경됩니다.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Emergence Vector Beetle flight path spread simulator (FR-MON-007) */}
        {activeTab === "emergence" && (
          <motion.div
            key="emergence-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                🦟 매개충 성충 우화 및 비행 방향 공간 확산 시뮬레이터 (FR-MON-007)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                바람길(Wind flow), 지상 평균 기온(Temperature)을 기반으로 솔수염하늘소와 북방수염하늘소의 최장 확산 예상 범위 연산
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Simulator Options bar */}
              <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-5 text-xs">
                <div className="space-y-2">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Thermometer size={14} className="text-rose-500" />
                    <span>평균 기온 설정</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={15}
                      max={32}
                      value={temperature}
                      onChange={(e) => setTemperature(Number(e.target.value))}
                      className="w-full accent-emerald-700"
                    />
                    <span className="font-mono font-bold text-slate-900 bg-white border px-2 py-1 rounded shadow-sm text-xs shrink-0">{temperature}°C</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block font-medium">※ 기온이 25°C를 초과할 경우 우화 성충의 날개 근육 활성도가 극대화되어 비행 거리가 최대 1.8배 증가합니다.</span>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Wind size={14} className="text-sky-500" />
                    <span>풍향풍속 풍속계</span>
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {(["SW", "NE", "NW", "SE"] as const).map((dir) => (
                      <button
                        key={dir}
                        onClick={() => setWindDirection(dir)}
                        className={`py-2 rounded-lg font-bold border ${windDirection === dir ? "bg-emerald-800 text-white border-emerald-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                      >
                        {dir}풍
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsSimulatingEmergence(true);
                    setTimeout(() => setIsSimulatingEmergence(false), 2500);
                  }}
                  className="w-full bg-emerald-800 text-white py-3 rounded-xl font-bold hover:bg-emerald-900 flex items-center justify-center gap-2"
                >
                  <Play size={14} />
                  <span>확산 경로 예측 시뮬레이션 가동</span>
                </button>
              </div>

              {/* Simulating visualization canvas */}
              <div className="lg:col-span-8">
                <div className="bg-gradient-to-br from-teal-50 to-green-50/60 border border-slate-200 rounded-3xl h-[320px] relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 grid grid-cols-12 gap-0.5 pointer-events-none opacity-20">
                    {Array.from({ length: 120 }).map((_, i) => (
                      <div key={i} className="border-t border-l border-slate-400/20 w-full h-12" />
                    ))}
                  </div>

                  {/* Hotspot source wood */}
                  <div className="absolute text-center space-y-1 shrink-0 z-10">
                    <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center text-white border-2 border-white shadow-lg animate-pulse">
                      🌲
                    </div>
                    <span className="text-[10px] bg-slate-900/90 text-white px-2 py-0.5 rounded-full font-bold">감염 핵심지</span>
                  </div>

                  {/* Wind Direction indicators */}
                  <div className="absolute top-4 left-4 bg-white/90 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] text-slate-600 font-bold space-y-0.5">
                    <div>우화 시기: 5월~7월 하순</div>
                    <div>적합 매개충: 솔수염하늘소</div>
                    <div className="text-emerald-700">비행 근육 상태: {temperature >= 25 ? "매우 활발" : "보통 활발"}</div>
                  </div>

                  {/* Motion spread path */}
                  {isSimulatingEmergence && (
                    <motion.div
                      initial={{ scale: 1, opacity: 0.8 }}
                      animate={{
                        scale: temperature >= 25 ? 4.5 : 2.8,
                        opacity: 0,
                        x: windDirection === "SW" ? 140 : windDirection === "NE" ? -140 : windDirection === "NW" ? 140 : -140,
                        y: windDirection === "SW" ? -80 : windDirection === "NE" ? 80 : windDirection === "NW" ? 80 : -80
                      }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                      className="absolute w-16 h-16 rounded-full border-2 border-dashed border-rose-500 bg-rose-300/20 z-0 flex items-center justify-center"
                    >
                      <span className="text-[8px] text-rose-700 font-bold">최장비행선</span>
                    </motion.div>
                  )}

                  {/* Simulation overlay results text */}
                  <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-white text-[11px] font-medium leading-relaxed z-10">
                    🌐 <b>풍향 확산 시뮬레이션 결과:</b> 금일 {windDirection}풍기류 및 지상 {temperature}°C 조건 하에서 우화한 솔수염하늘소 성충은 풍속 가중에 따라 {windDirection === "SW" ? "북동(NE)" : windDirection === "NE" ? "남서(SW)" : windDirection === "NW" ? "남동(SE)" : "북서(NW)"} 방향으로 최대 <b>{temperature >= 25 ? "2.4km" : "1.2km"}</b> 영역에 걸쳐 비행 확산될 가능성이 농후합니다. 해당 통로 내 소나무림에 대한 <b>우선 방제 나무주사</b>를 주입하십시오.
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
