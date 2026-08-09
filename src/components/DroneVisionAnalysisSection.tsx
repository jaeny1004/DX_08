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
import { motion } from "motion/react";
import {
  Camera,
  Clock3,
  ImageIcon,
  LoaderCircle,
  MapPin,
  ScanSearch,
  UploadCloud,
} from "lucide-react";

import { TreeRecord } from "../types";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL as string;

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

const DRONE_BUCKET = "drone-images";

type VisionPrediction = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
};

type VisionDetectionResult = {
  ok: boolean;
  status: "INFECTED" | "NORMAL";
  infectedCount: number;
  predictions: VisionPrediction[];
  image?: {
    width?: number;
    height?: number;
  } | null;
  error?: string;
};

type DemoGps = {
  latitude: number;
  longitude: number;
  altitude: number;
  capturedAt: string;
};

type VisionInputItem = {
  id: string;
  file: File;
  gps: DemoGps;
};

type VisionProcessStatus =
  | "queued"
  | "uploading"
  | "analyzing"
  | "completed"
  | "error";

type VisionProcessItem = {
  status: VisionProcessStatus;
  startedAt?: number;
  storagePath?: string;
  result?: VisionDetectionResult;
  error?: string;
};

type BatchProgress = {
  completed: number;
  total: number;
};

type ImageSize = {
  width: number;
  height: number;
};

type DroneVisionAnalysisSectionProps = {
  onAddTree: (
    tree: TreeRecord
  ) => void;
};

function createDemoGps(
  index: number,
  baseTime: number,
): DemoGps {
  const baseLatitude = 37.47235;
  const baseLongitude = 128.61264;

  return {
    latitude:
      baseLatitude + index * 0.00018,
    longitude:
      baseLongitude + index * 0.00022,
    altitude:
      118.4 + (index % 5) * 1.7,
    capturedAt: new Date(
      baseTime + index * 1500,
    ).toISOString(),
  };
}

function confidencePercent(
  confidence: number,
): number {
  if (!Number.isFinite(confidence)) {
    return 0;
  }

  return confidence > 1
    ? Math.min(confidence, 100)
    : Math.max(
      0,
      Math.min(confidence * 100, 100),
    );
}

function formatConfidenceRange(
  confidences: number[],
): string {
  const values = confidences
    .map(confidencePercent)
    .filter(Number.isFinite);

  if (values.length === 0) {
    return "-";
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  return minimum === maximum
    ? `${minimum.toFixed(1)}%`
    : `${minimum.toFixed(1)}~${maximum.toFixed(1)}%`;
}

async function getEdgeFunctionErrorMessage(
  error: unknown,
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();

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

export default function DroneVisionAnalysisSection({
  onAddTree,
}: DroneVisionAnalysisSectionProps) {
  const [visionInputs, setVisionInputs] =
    useState<VisionInputItem[]>([]);

  const [previewById, setPreviewById] =
    useState<Record<string, string>>({});

  const [previewSizeById, setPreviewSizeById] =
    useState<Record<string, ImageSize>>({});

  const [processById, setProcessById] =
    useState<Record<string, VisionProcessItem>>({});

  const [selectedVisionId, setSelectedVisionId] =
    useState("");

  const [isBatchAnalyzing, setIsBatchAnalyzing] =
    useState(false);

  const [batchProgress, setBatchProgress] =
    useState<BatchProgress>({
      completed: 0,
      total: 0,
    });

  const [batchError, setBatchError] =
    useState("");

  const [elapsedTick, setElapsedTick] =
    useState(() => Date.now());

  const [convertedVisionIds, setConvertedVisionIds] =
    useState<Set<string>>(
      () => new Set(),
    );

  useEffect(() => {
    const nextPreviewById: Record<string, string> = {};

    visionInputs.forEach((item) => {
      nextPreviewById[item.id] =
        URL.createObjectURL(item.file);
    });

    setPreviewById(nextPreviewById);

    return () => {
      Object.values(nextPreviewById).forEach(
        (previewUrl) => {
          URL.revokeObjectURL(previewUrl);
        },
      );
    };
  }, [visionInputs]);

  useEffect(() => {
    if (!isBatchAnalyzing) {
      return;
    }

    setElapsedTick(Date.now());

    const timer = window.setInterval(() => {
      setElapsedTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isBatchAnalyzing]);

  const updateProcess = (
    id: string,
    patch: Partial<VisionProcessItem>,
  ) => {
    setProcessById((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? {
          status: "queued",
        }),
        ...patch,
      },
    }));
  };

  const uploadVisibleImage = async (
    file: File,
  ): Promise<string> => {
    const originalExtension = file.name
      .split(".")
      .pop()
      ?.toLowerCase();

    const extension =
      originalExtension &&
        ["jpg", "jpeg", "png", "webp"]
          .includes(originalExtension)
        ? originalExtension
        : "jpg";

    const uploadDate = new Date()
      .toISOString()
      .slice(0, 10);

    const filePath =
      `visible/${uploadDate}/` +
      `${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase
      .storage
      .from(DRONE_BUCKET)
      .upload(filePath, file, {
        contentType:
          file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(
        `실사 드론 이미지 업로드 실패: ${error.message}`,
      );
    }

    return filePath;
  };

  const requestRoboflowAnalysis = async (
    storagePath: string,
  ): Promise<VisionDetectionResult> => {
    const { data, error } =
      await supabase.functions.invoke<VisionDetectionResult>(
        "drone-visible-detection",
        {
          body: {
            bucket: DRONE_BUCKET,
            path: storagePath,
            confidence: 15,
            overlap: 30,
          },
        },
      );

    if (error) {
      const detail =
        await getEdgeFunctionErrorMessage(error);

      throw new Error(detail);
    }

    if (!data?.ok) {
      throw new Error(
        data?.error ??
        "Roboflow 분석에 실패했습니다.",
      );
    }

    return data;
  };

  const analyzeBatch = async (
    items: VisionInputItem[],
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

    for (const item of items) {
      try {
        updateProcess(item.id, {
          status: "uploading",
          startedAt: Date.now(),
          result: undefined,
          error: undefined,
        });

        const storagePath =
          await uploadVisibleImage(item.file);

        updateProcess(item.id, {
          status: "analyzing",
          storagePath,
        });

        const result =
          await requestRoboflowAnalysis(
            storagePath,
          );

        updateProcess(item.id, {
          status: "completed",
          storagePath,
          result,
          error: undefined,
        });
      } catch (error) {
        console.error(
          `실사 드론 이미지 분석 실패: ${item.file.name}`,
          error,
        );

        updateProcess(item.id, {
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "분석 중 오류가 발생했습니다.",
        });
      } finally {
        setBatchProgress((previous) => ({
          ...previous,
          completed:
            previous.completed + 1,
        }));
      }
    }

    setIsBatchAnalyzing(false);
  };

  const handleFilesSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(
      event.target.files ?? [],
    ).filter((file) =>
      file.type.startsWith("image/"),
    );

    if (selectedFiles.length === 0) {
      setBatchError(
        "분석할 가시광선 드론 이미지를 선택해 주세요.",
      );
      return;
    }

    const baseTime = Date.now();

    const nextInputs = selectedFiles.map(
      (file, index) => ({
        id: crypto.randomUUID(),
        file,
        gps: createDemoGps(
          index,
          baseTime,
        ),
      }),
    );

    const initialProcessById: Record<
      string,
      VisionProcessItem
    > = {};

    nextInputs.forEach((item) => {
      initialProcessById[item.id] = {
        status: "queued",
      };
    });

    setVisionInputs(nextInputs);
    setProcessById(initialProcessById);
    setSelectedVisionId(nextInputs[0].id);
    setConvertedVisionIds(new Set());
    setPreviewSizeById({});
    setBatchError("");

    void analyzeBatch(nextInputs);

    event.target.value = "";
  };

  const selectedInput =
    visionInputs.find(
      (item) =>
        item.id === selectedVisionId,
    ) ?? null;

  const selectedPreviewUrl =
    previewById[selectedVisionId] ?? "";

  const selectedProcess =
    processById[selectedVisionId];

  const selectedResult =
    selectedProcess?.result;

  const completedResults = Object.values(
    processById,
  ).filter(
    (process) =>
      process.status === "completed" &&
      process.result,
  );

  const totalInfectedCount =
    completedResults.reduce(
      (sum, process) =>
        sum +
        (process.result
          ?.infectedCount ?? 0),
      0,
    );

  const progressPercent =
    batchProgress.total > 0
      ? Math.min(
        100,
        ((batchProgress.completed +
          (Object.values(processById).some(
            (process) =>
              process.status === "analyzing",
          )
            ? 0.7
            : Object.values(processById).some(
              (process) =>
                process.status === "uploading",
            )
              ? 0.25
              : 0)) /
          batchProgress.total) * 100,
      )
      : 0;

  const activeProcessEntry =
    visionInputs
      .map((item) => ({
        item,
        process: processById[item.id],
      }))
      .find(
        ({ process }) =>
          process?.status === "uploading" ||
          process?.status === "analyzing",
      );

  const activeElapsedSeconds =
    activeProcessEntry?.process?.startedAt
      ? Math.max(
        0,
        Math.floor(
          (elapsedTick -
            activeProcessEntry.process.startedAt) /
          1000,
        ),
      )
      : 0;

  const activeElapsedText =
    activeElapsedSeconds >= 60
      ? `${Math.floor(activeElapsedSeconds / 60)}분 ${
        activeElapsedSeconds % 60
      }초`
      : `${activeElapsedSeconds}초`;

  const sourceImageWidth =
    selectedResult?.image?.width ||
    previewSizeById[selectedVisionId]
      ?.width ||
    1;

  const sourceImageHeight =
    selectedResult?.image?.height ||
    previewSizeById[selectedVisionId]
      ?.height ||
    1;

  const handleConvertToTrees = () => {
    if (
      !selectedInput ||
      !selectedResult ||
      !selectedProcess?.storagePath
    ) {
      window.alert(
        "확진목으로 전환할 실사 드론 분석 결과가 없습니다.",
      );
      return;
    }

    if (
      selectedResult.status !== "INFECTED" ||
      selectedResult.predictions.length === 0
    ) {
      window.alert(
        "감염 의심목이 탐지된 이미지만 확진목으로 전환할 수 있습니다.",
      );
      return;
    }

    if (
      convertedVisionIds.has(
        selectedVisionId,
      )
    ) {
      window.alert(
        "이미 확진목으로 전환한 실사 드론 이미지입니다.",
      );
      return;
    }

    const now = new Date();
    const storagePath =
      selectedProcess.storagePath;

    selectedResult.predictions.forEach(
      (prediction, index) => {
        const aiProbability = Number(
          confidencePercent(
            prediction.confidence,
          ).toFixed(1),
        );

        const coordinateOffset =
          index * 0.00001;

        const latitude =
          selectedInput.gps.latitude +
          coordinateOffset;

        const longitude =
          selectedInput.gps.longitude +
          coordinateOffset;

        const severity:
          TreeRecord["severity"] =
          aiProbability >= 75
            ? "심"
            : aiProbability >= 45
              ? "중"
              : "경";

        const newTree: TreeRecord = {
          id:
            `PT-${now.getFullYear()}-` +
            crypto
              .randomUUID()
              .slice(0, 8)
              .toUpperCase(),

          region:
            `위도 ${latitude.toFixed(6)}, ` +
            `경도 ${longitude.toFixed(6)}`,

          species: "소나무",

          confirmedDate:
            now
              .toISOString()
              .split("T")[0],

          status: "확진완료",
          severity,

          x:
            362947 +
            Math.floor(
              Math.random() * 400,
            ),

          y:
            289014 +
            Math.floor(
              Math.random() * 400,
            ),

          inspector:
            "드론 실사 비전 AI",

          sourceReportId:
            `drone-visible:` +
            `${storagePath}:` +
            `${index}`,

          aiProbability,
          latitude,
          longitude,

          imageUrl: storagePath,
          imageSource: "drone-visible",
          imageBucket: DRONE_BUCKET,
          imagePath: storagePath,

          analysisResult: {
            ok: selectedResult.ok,
            status: selectedResult.status,
            infectedCount:
              selectedResult.infectedCount,
            predictions:
              selectedResult.predictions,
            image: {
              width: sourceImageWidth,
              height: sourceImageHeight,
            },
            storage: {
              bucket: DRONE_BUCKET,
              path: storagePath,
            },
            selectedPredictionIndex: index,
            altitude:
              selectedInput.gps.altitude,
            capturedAt:
              selectedInput.gps.capturedAt,
          },

          timeline: [
            {
              stage:
                "드론 실사 AI 확진목 전환",
              date:
                now.toLocaleString(),
              note:
                `가시광선 드론 비전 AI 분석에서 ` +
                `감염 의심목 #${index + 1} 탐지. ` +
                `AI 신뢰도 ${aiProbability}%, ` +
                `중심 픽셀 ` +
                `(${prediction.x.toFixed(1)}, ` +
                `${prediction.y.toFixed(1)}).`,
              actor:
                "드론 실사 비전 AI 시스템",
            },
          ],
        };

        onAddTree(newTree);
      },
    );

    setConvertedVisionIds(
      (previous) => {
        const next = new Set(previous);
        next.add(selectedVisionId);
        return next;
      },
    );

    window.alert(
      `${selectedResult.predictions.length}개의 감염 의심목을 ` +
      `확진목 모니터링에 등록했습니다.`,
    );
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Camera
              size={18}
              className="text-emerald-700"
            />
            <h2 className="text-base font-black text-slate-950">
              실사 드론 사진 감염도 확인
            </h2>
          </div>
          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            드론 비행 후 수집된 가시광선 이미지를 일괄 업로드하고 감염 의심목을 비전 AI로 자동 탐지합니다.
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        <div className="min-h-0 lg:col-span-8">
          <div className="relative flex h-full min-h-[420px] items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            {selectedPreviewUrl ? (
              <div className="relative h-full w-full">
                <img
                  src={selectedPreviewUrl}
                  alt={
                    selectedInput?.file.name ??
                    "실사 드론 이미지"
                  }
                  className="h-full w-full object-fill"
                  onLoad={(event) => {
                    const image =
                      event.currentTarget;

                    setPreviewSizeById(
                      (previous) => ({
                        ...previous,
                        [selectedVisionId]: {
                          width:
                            image.naturalWidth,
                          height:
                            image.naturalHeight,
                        },
                      }),
                    );
                  }}
                />

                {selectedResult?.predictions.map(
                  (prediction, index) => {
                    const left =
                      ((prediction.x -
                        prediction.width / 2) /
                        sourceImageWidth) *
                      100;

                    const top =
                      ((prediction.y -
                        prediction.height / 2) /
                        sourceImageHeight) *
                      100;

                    const width =
                      (prediction.width /
                        sourceImageWidth) *
                      100;

                    const height =
                      (prediction.height /
                        sourceImageHeight) *
                      100;

                    return (
                      <div
                        key={
                          `${prediction.x}-` +
                          `${prediction.y}-${index}`
                        }
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
                            prediction.confidence,
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    );
                  },
                )}

                {(selectedProcess?.status ===
                  "uploading" ||
                  selectedProcess?.status ===
                  "analyzing") && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-slate-950/65 text-white backdrop-blur-[1px]">
                    {selectedProcess.status ===
                      "analyzing" && (
                      <motion.div
                        className="absolute left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_14px_rgba(110,231,183,0.9)]"
                        animate={{
                          top: [
                            "12%",
                            "88%",
                            "12%",
                          ],
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                    )}

                    <div className="relative flex min-w-[260px] flex-col items-center rounded-2xl border border-white/15 bg-slate-950/75 px-7 py-6 text-center shadow-2xl backdrop-blur-md">
                      <LoaderCircle
                        size={32}
                        className={`animate-spin ${
                          selectedProcess.status ===
                          "uploading"
                            ? "text-sky-300"
                            : "text-emerald-300"
                        }`}
                      />

                      <p className="mt-3 text-sm font-black">
                        {selectedProcess.status ===
                        "uploading"
                          ? "실사 이미지를 업로드하고 있습니다."
                          : "비전 AI가 감염 의심목을 탐지하고 있습니다."}
                      </p>

                      <p className="mt-1 text-[10px] font-semibold text-white/65">
                        정상적으로 처리 중입니다. 잠시만 기다려 주세요.
                      </p>

                      <span className="mt-3 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black tabular-nums text-white/85">
                        <Clock3 size={12} />
                        경과 {activeElapsedText}
                      </span>
                    </div>
                  </div>
                )}

                {selectedInput && (
                  <div className="absolute right-4 top-4 z-30 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-[9px] font-bold leading-5 text-white shadow-xl backdrop-blur">
                    <div>
                      ALT: {selectedInput.gps.altitude.toFixed(1)}m
                    </div>
                    <div>
                      LAT: {selectedInput.gps.latitude.toFixed(6)}
                    </div>
                    <div>
                      LNG: {selectedInput.gps.longitude.toFixed(6)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="absolute inset-[7%] flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 text-center">
                <ImageIcon
                  size={38}
                  className="text-slate-500"
                />
                <p className="mt-4 text-xs font-black text-slate-400">
                  가시광선 드론 이미지 묶음을 선택해 주세요.
                </p>
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  JPG, PNG, WEBP 다중 선택을 지원합니다.
                </p>
              </div>
            )}

            <span className="pointer-events-none absolute left-[7.7%] top-[9%] h-4 w-4 border-l-2 border-t-2 border-white" />
            <span className="pointer-events-none absolute right-[7.7%] top-[9%] h-4 w-4 border-r-2 border-t-2 border-white" />
            <span className="pointer-events-none absolute bottom-[9%] left-[7.7%] h-4 w-4 border-b-2 border-l-2 border-white" />
            <span className="pointer-events-none absolute bottom-[9%] right-[7.7%] h-4 w-4 border-b-2 border-r-2 border-white" />
          </div>
        </div>

        <div className="min-h-0 space-y-3 overflow-y-auto lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-[11px] font-black text-slate-700">
              <UploadCloud
                size={15}
                className="text-emerald-700"
              />
              가시광선 드론 이미지 일괄 업로드
            </div>

            <label className="mt-3 flex cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFilesSelect}
                disabled={isBatchAnalyzing}
                className="block w-full text-[10px] file:mr-2 file:rounded-md file:border-0 file:bg-transparent file:p-0 file:text-[10px] file:font-black file:text-slate-600"
              />
            </label>

            <p className="mt-3 text-[9px] font-semibold leading-relaxed text-slate-400">
              파일을 선택하면 Storage 업로드와 Roboflow 분석이 자동으로 시작됩니다.
            </p>
          </div>

          {(batchProgress.total > 0 ||
            isBatchAnalyzing) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-[10px] font-black text-slate-600">
                <span>일괄 분석 진행률</span>
                <span className="text-emerald-700">
                  {batchProgress.completed}/
                  {batchProgress.total}
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-emerald-600 transition-all duration-500 ${
                    isBatchAnalyzing
                      ? "animate-pulse"
                      : ""
                  }`}
                  style={{
                    width: `${progressPercent}%`,
                  }}
                />
              </div>

              {isBatchAnalyzing &&
                activeProcessEntry && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                    <LoaderCircle
                      size={16}
                      className="shrink-0 animate-spin text-emerald-700"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-black text-emerald-900">
                        {activeProcessEntry.process.status ===
                        "uploading"
                          ? "이미지를 안전하게 업로드하고 있습니다."
                          : "비전 AI가 감염 의심목을 탐지하고 있습니다."}
                      </p>
                      <p className="mt-0.5 text-[8px] font-semibold text-emerald-700/70">
                        정상적으로 처리 중입니다. 완료될 때까지 창을 닫지 마세요.
                      </p>
                    </div>

                    <span className="flex shrink-0 items-center gap-1 text-[9px] font-black tabular-nums text-emerald-700">
                      <Clock3 size={11} />
                      {activeElapsedText}
                    </span>
                  </div>
                )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold text-slate-400">
                    업로드 이미지
                  </p>
                  <p className="mt-1 text-lg font-black text-slate-900">
                    {visionInputs.length}장
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold text-slate-400">
                    감염 의심목 합계
                  </p>
                  <p className="mt-1 text-lg font-black text-rose-600">
                    {totalInfectedCount}개
                  </p>
                </div>
              </div>
            </div>
          )}

          {batchError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold leading-relaxed text-rose-700">
              분석 오류: {batchError}
            </div>
          )}

          {visionInputs.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                파일별 분석 결과
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {visionInputs.map(
                  (item, index) => {
                    const process =
                      processById[item.id];
                    const result =
                      process?.result;

                    let statusText = "대기";
                    let statusClass =
                      "bg-slate-100 text-slate-600";

                    if (process?.status === "uploading") {
                      statusText = "업로드 중";
                      statusClass =
                        "bg-blue-100 text-blue-700";
                    }

                    if (process?.status === "analyzing") {
                      statusText = "AI 분석 중";
                      statusClass =
                        "bg-amber-100 text-amber-700";
                    }

                    if (process?.status === "completed") {
                      statusText = result?.infectedCount
                        ? `감염 ${result.infectedCount}개`
                        : "정상";
                      statusClass = result?.infectedCount
                        ? "bg-rose-100 text-rose-700"
                        : "bg-emerald-100 text-emerald-700";
                    }

                    if (process?.status === "error") {
                      statusText = "오류";
                      statusClass =
                        "bg-rose-100 text-rose-700";
                    }

                    const isProcessing =
                      process?.status === "uploading" ||
                      process?.status === "analyzing";

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          setSelectedVisionId(
                            item.id,
                          )
                        }
                        className={
                          selectedVisionId === item.id
                            ? "w-full rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-left"
                            : "w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-emerald-200"
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-black text-slate-800">
                              {index + 1}. {item.file.name}
                            </p>
                            <p className="mt-1 text-[9px] font-semibold text-slate-400">
                              {(item.file.size /
                                1024 /
                                1024)
                                .toFixed(2)} MB
                            </p>
                          </div>

                          <span className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[8px] font-black ${statusClass}`}>
                            {isProcessing && (
                              <LoaderCircle
                                size={9}
                                className="animate-spin"
                              />
                            )}
                            {statusText}
                          </span>
                        </div>

                        {process?.error && (
                          <p className="mt-2 line-clamp-2 text-[9px] font-bold text-rose-600">
                            {process.error}
                          </p>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white/80 p-2 text-[8px] font-semibold text-slate-500">
                          <span>
                            위도<br />
                            <b className="text-slate-700">
                              {item.gps.latitude.toFixed(6)}
                            </b>
                          </span>
                          <span>
                            경도<br />
                            <b className="text-slate-700">
                              {item.gps.longitude.toFixed(6)}
                            </b>
                          </span>
                          <span>
                            촬영 고도<br />
                            <b className="text-slate-700">
                              {item.gps.altitude.toFixed(1)}m
                            </b>
                          </span>
                          <span>
                            촬영 시각<br />
                            <b className="text-slate-700">
                              {new Date(
                                item.gps.capturedAt,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </b>
                          </span>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          )}

          {selectedResult && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <ScanSearch size={14} />
                  선택 이미지 분석
                </div>

                <span className={
                  selectedResult.status === "INFECTED"
                    ? "rounded-md bg-rose-100 px-2 py-1 text-[8px] font-black text-rose-700"
                    : "rounded-md bg-emerald-100 px-2 py-1 text-[8px] font-black text-emerald-700"
                }>
                  {selectedResult.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[9px] font-bold text-slate-400">
                    감염 의심목
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {selectedResult.infectedCount}개
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[9px] font-bold text-slate-400">
                    탐지 신뢰도 범위
                  </p>
                  <p className="mt-1 text-xl font-black text-rose-600">
                    {formatConfidenceRange(
                      selectedResult.predictions.map(
                        (prediction) =>
                          prediction.confidence,
                      ),
                    )}
                  </p>
                </div>
              </div>

              {selectedResult.status === "NORMAL" ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[11px] font-bold text-emerald-700">
                  감염 의심목이 탐지되지 않았습니다.
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleConvertToTrees}
                    disabled={
                      convertedVisionIds.has(
                        selectedVisionId,
                      )
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-[11px] font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <MapPin size={14} />
                    {convertedVisionIds.has(
                      selectedVisionId,
                    )
                      ? "확진목 전환 완료"
                      : `확진목 전환 (${selectedResult.predictions.length}그루)`}
                  </button>

                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {selectedResult.predictions.map(
                      (prediction, index) => (
                        <div
                          key={
                            `${prediction.x}-` +
                            `${prediction.y}-${index}`
                          }
                          className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[10px]"
                        >
                          <div className="flex justify-between font-black text-slate-800">
                            <span>
                              감염 의심목 #{index + 1}
                            </span>
                            <span className="text-rose-600">
                              {confidencePercent(
                                prediction.confidence,
                              ).toFixed(1)}%
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 font-mono text-slate-500">
                            <span>
                              중심 픽셀: ({prediction.x.toFixed(1)}, {prediction.y.toFixed(1)})
                            </span>
                            <span className="truncate">
                              {prediction.class}
                            </span>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </>
              )}

              <div className="flex items-start gap-2 border-t border-slate-100 pt-3 text-[9px] font-semibold leading-relaxed text-slate-400">
                <MapPin
                  size={12}
                  className="mt-0.5 shrink-0"
                />
                표시된 GPS·고도·촬영 시각은 시연용 좌표입니다.
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
