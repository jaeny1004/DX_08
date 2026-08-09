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
    LoaderCircle,
    MapPin,
    Thermometer,
    UploadCloud,
    TreePine,
} from "lucide-react";

import {
    TreeRecord,
} from "../types";
import {
    formatGridLocation,
    loadGridLookup,
} from "../utils/gridLookup";
import { createTreeId } from "../utils/treeId";

const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL as string;

const SUPABASE_ANON_KEY =
    import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
);

const DRONE_BUCKET = "drone-images";

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
    status: "INFECTED" | "NORMAL";
    infectedCount: number;
    predictions: ThermalPrediction[];
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
    startedAt?: number;
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
    const minimumConfidence = 0.05;

    const normalizedConfidence = Math.min(
        1,
        Math.max(
            minimumConfidence,
            confidence,
        ),
    );

    return (
        80 +
        ((normalizedConfidence -
            minimumConfidence) /
            (1 - minimumConfidence)) *
        15
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

type ThermalAnalysisSectionProps = {
    onAddTree: (
        tree: TreeRecord
    ) => void;
    /** 관리 ID 번호를 이어서 매기기 위한 기존 ID 목록 */
    existingTreeIds?: string[];
};

export default function ThermalAnalysisSection({
    onAddTree,
    existingTreeIds = [],
}: ThermalAnalysisSectionProps) {
    // 확진목 전환 시 좌표를 행정동·격자ID로 바꿔야 하므로 미리 받아 둔다.
    useEffect(() => {
        void loadGridLookup();
    }, []);

    const [thermalInputs, setThermalInputs] =
        useState<ThermalInputItem[]>([]);

    const [thermalPreviewById, setThermalPreviewById] =
        useState<Record<string, string>>({});

    const [thermalProcessById, setThermalProcessById] =
        useState<Record<string, ThermalProcessItem>>({});

    const [selectedThermalId, setSelectedThermalId] =
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

    const [
        convertedThermalIds,
        setConvertedThermalIds,
    ] = useState<Set<string>>(
        () => new Set()
    );

    useEffect(() => {
        const nextPreviewById: Record<string, string> = {};

        thermalInputs.forEach((item) => {
            nextPreviewById[item.id] =
                URL.createObjectURL(item.file);
        });

        setThermalPreviewById(nextPreviewById);

        return () => {
            Object.values(nextPreviewById).forEach(
                (previewUrl) => {
                    URL.revokeObjectURL(previewUrl);
                },
            );
        };
    }, [thermalInputs]);

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

    const updateThermalProcess = (
        id: string,
        patch: Partial<ThermalProcessItem>,
    ) => {
        setThermalProcessById((previous) => ({
            ...previous,
            [id]: {
                ...(previous[id] ?? {
                    status: "queued",
                }),
                ...patch,
            },
        }));
    };

    const uploadThermalImage = async (
        file: File,
    ): Promise<string> => {
        const originalExtension = file.name
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

        const uploadDate = new Date()
            .toISOString()
            .slice(0, 10);

        const filePath =
            `thermal/${uploadDate}/` +
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
                `열화상 이미지 업로드 실패: ${error.message}`,
            );
        }

        return filePath;
    };

    const analyzeThermalBatch = async (
        items: ThermalInputItem[],
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
                updateThermalProcess(item.id, {
                    status: "uploading",
                    startedAt: Date.now(),
                    error: undefined,
                    result: undefined,
                });

                const storagePath =
                    await uploadThermalImage(
                        item.file,
                    );

                updateThermalProcess(item.id, {
                    status: "analyzing",
                    storagePath,
                });

                const { data, error } =
                    await supabase.functions.invoke<ThermalDetectionResult>(
                        "thermal-detection",
                        {
                            body: {
                                bucket: DRONE_BUCKET,
                                path: storagePath,
                                confidence: 10,
                                overlap: 30,
                            },
                        },
                    );

                if (error) {
                    const detail =
                        await getEdgeFunctionErrorMessage(
                            error,
                        );

                    throw new Error(detail);
                }

                if (!data?.ok) {
                    throw new Error(
                        data?.error ??
                        "Roboflow 분석에 실패했습니다.",
                    );
                }

                updateThermalProcess(item.id, {
                    status: "completed",
                    storagePath,
                    result: data,
                    error: undefined,
                });
            } catch (error) {
                console.error(
                    `열화상 파일 분석 실패: ${item.file.name}`,
                    error,
                );

                updateThermalProcess(item.id, {
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

    const handleThermalFilesSelect = (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const selectedFiles = Array.from(
            event.target.files ?? [],
        ).filter((file) =>
            file.type.startsWith("image/"),
        );

        if (selectedFiles.length === 0) {
            setBatchError(
                "분석할 열화상 이미지를 선택해 주세요.",
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
            ThermalProcessItem
        > = {};

        nextInputs.forEach((item) => {
            initialProcessById[item.id] = {
                status: "queued",
            };
        });

        setThermalInputs(nextInputs);
        setThermalProcessById(
            initialProcessById,
        );
        setSelectedThermalId(
            nextInputs[0].id,
        );
        setBatchError("");

        void analyzeThermalBatch(nextInputs);

        event.target.value = "";
    };

    const selectedThermalInput =
        thermalInputs.find(
            (item) =>
                item.id === selectedThermalId,
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

    const completedResults = Object.values(
        thermalProcessById,
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
                    (Object.values(
                        thermalProcessById,
                    ).some(
                        (process) =>
                            process.status ===
                            "analyzing",
                    )
                        ? 0.7
                        : Object.values(
                            thermalProcessById,
                        ).some(
                            (process) =>
                                process.status ===
                                "uploading",
                        )
                            ? 0.25
                            : 0)) /
                    batchProgress.total) *
                100,
            )
            : 0;

    const activeProcessEntry = thermalInputs
        .map((item) => ({
            item,
            process:
                thermalProcessById[item.id],
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
                        activeProcessEntry.process
                            .startedAt) /
                    1000,
                ),
            )
            : 0;

    const activeElapsedText =
        activeElapsedSeconds >= 60
            ? `${Math.floor(
                activeElapsedSeconds / 60,
            )}분 ${
                activeElapsedSeconds % 60
            }초`
            : `${activeElapsedSeconds}초`;

    const handleConvertThermalToTrees = () => {
        if (
            !selectedThermalInput ||
            !selectedResult ||
            !selectedProcess?.storagePath
        ) {
            window.alert(
                "확진목으로 전환할 열화상 분석 결과가 없습니다."
            );
            return;
        }
        const storagePath =
  selectedProcess.storagePath;

        if (
            selectedResult.status !== "INFECTED" ||
            selectedResult.predictions.length === 0
        ) {
            window.alert(
                "감염 의심목이 탐지된 이미지만 확진목으로 전환할 수 있습니다."
            );
            return;
        }

        if (
            convertedThermalIds.has(
                selectedThermalId
            )
        ) {
            window.alert(
                "이미 확진목으로 전환한 열화상 이미지입니다."
            );
            return;
        }

        const now = new Date();

        // 한 번에 여러 건을 만들 수 있어, 발급한 ID를 누적해야 번호가 겹치지 않는다.
        const issuedIds = [...existingTreeIds];

        selectedResult.predictions.forEach(
            (prediction, index) => {
                const aiProbability = Number(
                    confidencePercent(
                        prediction.confidence
                    ).toFixed(1)
                );

                /*
                 * 한 이미지에서 여러 나무가 탐지된 경우
                 * 완전히 같은 GPS에 겹치지 않도록
                 * 매우 작은 좌표 차이를 적용합니다.
                 */
                const coordinateOffset =
                    index * 0.00001;

                const latitude =
                    selectedThermalInput.gps.latitude +
                    coordinateOffset;

                const longitude =
                    selectedThermalInput.gps.longitude +
                    coordinateOffset;

                const severity:
                    TreeRecord["severity"] =
                    aiProbability >= 75
                        ? "심"
                        : aiProbability >= 45
                            ? "중"
                            : "경";

                const treeId = createTreeId(issuedIds, now);
                issuedIds.push(treeId);

                const newTree: TreeRecord = {
                    id: treeId,

                    // 좌표를 그대로 주소칸에 넣지 않고 행정동·격자ID로 바꾼다.
                    region: formatGridLocation(latitude, longitude),

                    species: "소나무",

                    confirmedDate:
                        now
                            .toISOString()
                            .split("T")[0],

                    status: "확진완료",

                    severity,

                    /*
                     * 기존 모니터링 화면에서 사용하는
                     * 임시 도면 좌표입니다.
                     */
                    x:
                        362947 +
                        Math.floor(
                            Math.random() * 400
                        ),

                    y:
                        289014 +
                        Math.floor(
                            Math.random() * 400
                        ),

                    inspector:
                        "드론 열화상 AI",

                    /*
                     * 같은 열화상 탐지 결과의
                     * 중복 DB 저장 방지용 값입니다.
                     */
                    sourceReportId:
                        `thermal:` +
                        `${storagePath}:` +
                        `${index}`,

                    aiProbability,

                    latitude,
                    longitude,

                    /*
                     * blob 미리보기 주소가 아니라
                     * Supabase Storage의 영구 경로를 저장합니다.
                     */
                    imageUrl:
                        storagePath,

                    imageSource:
                        "thermal",

                    imageBucket:
                        DRONE_BUCKET,

                    imagePath:
                        storagePath,

                    analysisResult: {
                        ok:
                            selectedResult.ok,

                        status:
                            selectedResult.status,

                        infectedCount:
                            selectedResult.infectedCount,

                        predictions:
                            selectedResult.predictions,

                        image:
                            selectedResult.image ?? null,

                        storage: {
                            bucket:
                                DRONE_BUCKET,

                            path:
                                storagePath,
                        },

                        selectedPredictionIndex:
                            index,

                        altitude:
                            selectedThermalInput.gps.altitude,

                        capturedAt:
                            selectedThermalInput.gps.capturedAt,
                    },

                    timeline: [
                        {
                            stage:
                                "드론 열화상 확진목 전환",

                            date:
                                now.toLocaleString(),

                            note:
                                `드론 열화상 AI 분석에서 ` +
                                `감염 의심목 #${index + 1} 탐지. ` +
                                `AI 신뢰도 ${aiProbability}%, ` +
                                `중심 픽셀 ` +
                                `(${prediction.x.toFixed(1)}, ` +
                                `${prediction.y.toFixed(1)}).`,

                            actor:
                                "드론 열화상 AI 시스템",
                        },
                    ],
                };

                onAddTree(newTree);
            }
        );

        setConvertedThermalIds(
            (previous) => {
                const next = new Set(previous);

                next.add(selectedThermalId);

                return next;
            }
        );

        window.alert(
            `${selectedResult.predictions.length}개의 감염 의심목을 ` +
            `확진목 모니터링에 등록했습니다.`
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
                            드론 열화상 감염도 확인
                        </h2>
                    </div>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                        드론 비행 후 수집된 열화상 이미지를 일괄 업로드하고 감염 의심 영역을 자동 분석합니다.
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
                                        selectedThermalInput
                                            ?.file.name ??
                                        "드론 열화상 이미지"
                                    }
                                    className="h-full w-full object-fill"
                                />

                                {selectedResult?.predictions.map(
                                    (prediction, index) => {
                                        const imageWidth =
                                            selectedResult.image
                                                ?.width ?? 1;

                                        const imageHeight =
                                            selectedResult.image
                                                ?.height ?? 1;

                                        const left =
                                            ((prediction.x -
                                                prediction.width / 2) /
                                                imageWidth) *
                                            100;

                                        const top =
                                            ((prediction.y -
                                                prediction.height / 2) /
                                                imageHeight) *
                                            100;

                                        const width =
                                            (prediction.width /
                                                imageWidth) *
                                            100;

                                        const height =
                                            (prediction.height /
                                                imageHeight) *
                                            100;

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
                                                    ? "열화상 이미지를 업로드하고 있습니다."
                                                    : "비전 AI가 열 이상 영역을 탐지하고 있습니다."}
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

                                {selectedThermalInput && (
                                    <div className="absolute right-4 top-4 space-y-1 rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-[10px] text-white backdrop-blur-md">
                                        <div>
                                            ALT: {selectedThermalInput.gps.altitude.toFixed(1)}m
                                        </div>
                                        <div>
                                            LAT: {selectedThermalInput.gps.latitude.toFixed(6)}
                                        </div>
                                        <div>
                                            LNG: {selectedThermalInput.gps.longitude.toFixed(6)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center text-slate-400">
                                <Thermometer
                                    size={44}
                                    className="mx-auto mb-3 opacity-70"
                                />
                                <p className="text-xs font-bold">
                                    열화상 이미지 묶음을 선택해 주세요.
                                </p>
                                <p className="mt-1 text-[10px]">
                                    JPG, PNG, WEBP 다중 선택을 지원합니다.
                                </p>
                            </div>
                        )}

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="relative h-[82%] w-[88%] rounded-2xl border border-dashed border-white/25">
                                <div className="absolute left-4 top-4 h-4 w-4 border-l-2 border-t-2 border-white" />
                                <div className="absolute right-4 top-4 h-4 w-4 border-r-2 border-t-2 border-white" />
                                <div className="absolute bottom-4 left-4 h-4 w-4 border-b-2 border-l-2 border-white" />
                                <div className="absolute bottom-4 right-4 h-4 w-4 border-b-2 border-r-2 border-white" />
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="min-h-0 space-y-3 overflow-y-auto lg:col-span-4">
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                            <UploadCloud
                                size={16}
                                className="text-emerald-700"
                            />
                            비가시 열화상 이미지 일괄 업로드
                        </div>

                        <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            disabled={isBatchAnalyzing}
                            onChange={handleThermalFilesSelect}
                            className="block w-full rounded-xl border border-slate-200 bg-white p-2 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                        />

                        <p className="text-[10px] font-medium leading-relaxed text-slate-400">
                            파일을 선택하면 Storage 업로드와 AI 분석이 자동으로 시작됩니다.
                        </p>
                    </div>

                    {batchProgress.total > 0 && (
                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="text-slate-600">
                                    일괄 분석 진행률
                                </span>
                                <span className="font-mono text-emerald-700">
                                    {batchProgress.completed}/
                                    {batchProgress.total}
                                </span>
                            </div>

                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
                                    <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                                        <LoaderCircle
                                            size={16}
                                            className="shrink-0 animate-spin text-emerald-700"
                                        />

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[10px] font-black text-emerald-900">
                                                {activeProcessEntry.process
                                                    .status ===
                                                "uploading"
                                                    ? "열화상 이미지를 안전하게 업로드하고 있습니다."
                                                    : "비전 AI가 열 이상 영역을 탐지하고 있습니다."}
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

                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-[9px] font-bold text-slate-400">
                                        업로드 이미지
                                    </p>
                                    <p className="mt-1 text-lg font-black text-slate-900">
                                        {thermalInputs.length}장
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

                            {isBatchAnalyzing && (
                                <p className="text-center text-[10px] font-bold text-amber-600">
                                    이미지를 한 장씩 순차 분석하고 있습니다.
                                </p>
                            )}
                        </div>
                    )}

                    {batchError && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold leading-relaxed text-rose-700">
                            분석 오류: {batchError}
                        </div>
                    )}

                    {thermalInputs.length > 0 && (
                        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                파일별 분석 결과
                            </div>

                            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                {thermalInputs.map(
                                    (item, index) => {
                                        const process =
                                            thermalProcessById[
                                            item.id
                                            ];

                                        const result =
                                            process?.result;

                                        let statusText = "대기";
                                        let statusClass =
                                            "bg-slate-100 text-slate-600";

                                        if (
                                            process?.status ===
                                            "uploading"
                                        ) {
                                            statusText = "업로드 중";
                                            statusClass =
                                                "bg-sky-100 text-sky-700";
                                        }

                                        if (
                                            process?.status ===
                                            "analyzing"
                                        ) {
                                            statusText = "AI 분석 중";
                                            statusClass =
                                                "bg-amber-100 text-amber-700";
                                        }

                                        if (
                                            process?.status ===
                                            "completed"
                                        ) {
                                            if (
                                                result?.status ===
                                                "INFECTED"
                                            ) {
                                                statusText = `감염 ${result.infectedCount}개`;
                                                statusClass =
                                                    "bg-rose-100 text-rose-700";
                                            } else {
                                                statusText = "정상";
                                                statusClass =
                                                    "bg-emerald-100 text-emerald-700";
                                            }
                                        }

                                        if (
                                            process?.status ===
                                            "error"
                                        ) {
                                            statusText = "오류";
                                            statusClass =
                                                "bg-rose-100 text-rose-700";
                                        }

                                        const isProcessing =
                                            process?.status ===
                                                "uploading" ||
                                            process?.status ===
                                                "analyzing";

                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() =>
                                                    setSelectedThermalId(
                                                        item.id,
                                                    )
                                                }
                                                className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedThermalId ===
                                                    item.id
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
                                                            {(item.file.size /
                                                                1024 /
                                                                1024).toFixed(2)}{" "}
                                                            MB
                                                        </p>
                                                    </div>

                                                    <span
                                                        className={`flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black ${statusClass}`}
                                                    >
                                                        {isProcessing && (
                                                            <LoaderCircle
                                                                size={9}
                                                                className="animate-spin"
                                                            />
                                                        )}
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
                                                                item.gps.capturedAt,
                                                            ).toLocaleTimeString(
                                                                "ko-KR",
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
                                    },
                                )}
                            </div>
                        </div>
                    )}

                    {selectedResult && (
                        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-600">
                                    선택 이미지 분석
                                </span>
                                <span
                                    className={`rounded px-2 py-1 text-[9px] font-black ${selectedResult.status ===
                                        "INFECTED"
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

                            {selectedResult.status ===
                                "INFECTED" && (
                                    <button
                                        type="button"
                                        onClick={
                                            handleConvertThermalToTrees
                                        }
                                        disabled={
                                            convertedThermalIds.has(
                                                selectedThermalId
                                            )
                                        }
                                        className={
                                            convertedThermalIds.has(
                                                selectedThermalId
                                            )
                                                ? "flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 py-3 text-xs font-black text-slate-500"
                                                : "flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white transition hover:bg-emerald-800"
                                        }
                                    >
                                        <TreePine size={15} />

                                        {convertedThermalIds.has(
                                            selectedThermalId
                                        )
                                            ? "확진목 전환 완료"
                                            : `확진목 전환 (${selectedResult.infectedCount}그루)`}
                                    </button>
                                )}

                            {selectedResult.status ===
                                "NORMAL" ? (
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
                                                            prediction.confidence,
                                                        ).toFixed(1)}
                                                        %
                                                    </span>
                                                </div>
                                                <div className="mt-1 font-mono text-slate-500">
                                                    중심 픽셀: ({prediction.x.toFixed(1)},{" "}
                                                    {prediction.y.toFixed(1)})
                                                </div>
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}

                            {selectedThermalInput && (
                                <div className="flex items-start gap-2 border-t border-slate-100 pt-3 text-[9px] leading-relaxed text-slate-400">
                                    <MapPin
                                        size={13}
                                        className="mt-0.5 shrink-0"
                                    />
                                    표시된 GPS·고도·촬영 시각은 시연용 좌표입니다.
                                </div>
                            )}
                        </div>
                    )}
                </aside>
            </div>
        </motion.section>
    );
}
