import React, {
  useEffect,
  useMemo,
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
  Bot,
  CalendarDays,
  Camera,
  MapPin,
  MapPinned,
  Plus,
  Search,
  Thermometer,
  TreesIcon,
  UserRound,
  X,
  ImageIcon,
  LoaderCircle,
  Mic,
  PlayCircle,
} from "lucide-react";

import {
  FieldPhotoRecord,
  TreeRecord,
  FieldVoiceLogRecord,
} from "../types";
import type {
  TreeWorkflowStatus,
} from "../types";
import type {
  DispatchAssignment,
  DispatchTaskType,
} from "../types/dispatch";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL as string;

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

const DRONE_BUCKET = "drone-images";

const WORKERS_PATH = "/data/workforce_v2/workers.json";
const WORKER_CAPABILITIES_PATH =
  "/data/workforce_v2/worker_capabilities.json";
const WORKER_AVAILABILITY_PATH =
  "/data/workforce_v2/worker_availability.json";
const WORKER_CURRENT_STATUS_PATH =
  "/data/workforce_v2/worker_current_status.json";

type ControlWorkerCapability = {
  taskType: DispatchTaskType;
  skillLevel: number;
};

type ControlWorkerCandidate = {
  workerId: string;
  workerName: string;
  homeSidoName: string;
  homeSigunguCode: string;
  homeSigunguName: string;
  baseLatitude: number;
  baseLongitude: number;
  capabilities: ControlWorkerCapability[];
  availabilityStatus: string;
  currentStatus: string;
  remainingMinutes: number;
  batteryPercent: number | null;
};

type ControlWorkerRecommendation = {
  worker: ControlWorkerCandidate;
  skillLevel: number;
  distanceKm: number;
  assignmentType:
  | "지역 내 배정"
  | "인접지역 지원"
  | "광역 지원";
};

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateDistanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const toRadians = (degree: number) =>
    degree * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
    Math.cos(toRadians(latitude2)) *
    Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DISPLAY_MANAGEMENT_ID_PATTERN =
  /^PT-2026-(\d{4})$/;

function hashTreeId(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/**
 * 실제 DB ID는 그대로 유지하면서 화면에서만 사용할 4자리 관리 ID를 만듭니다.
 * 이미 PT-2026-0000 형식인 ID는 우선 보존하고, 나머지는 실제 ID를 기반으로
 * 결정적인 번호를 만든 뒤 현재 목록 안에서 중복되지 않게 조정합니다.
 */
function createDisplayManagementIdMap(
  trees: TreeRecord[],
): Map<string, string> {
  const result = new Map<string, string>();
  const usedNumbers = new Set<number>();

  const sortedTrees = [...trees].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  sortedTrees.forEach((tree) => {
    const matched = tree.id.match(
      DISPLAY_MANAGEMENT_ID_PATTERN,
    );

    if (!matched) {
      return;
    }

    const number = Number(matched[1]);

    if (usedNumbers.has(number)) {
      return;
    }

    usedNumbers.add(number);
    result.set(tree.id, tree.id);
  });

  sortedTrees.forEach((tree) => {
    if (result.has(tree.id)) {
      return;
    }

    let number = hashTreeId(tree.id) % 10000;

    while (usedNumbers.has(number)) {
      number = (number + 1) % 10000;
    }

    usedNumbers.add(number);
    result.set(
      tree.id,
      `PT-2026-${String(number).padStart(4, "0")}`,
    );
  });

  return result;
}

function parseCoordinatesFromRegion(
  region: string,
): { latitude: number; longitude: number } | null {
  const matched = region.match(
    /위도\s*(-?\d+(?:\.\d+)?)\s*[,·/]?\s*경도\s*(-?\d+(?:\.\d+)?)/i,
  );

  if (!matched) {
    return null;
  }

  const latitude = Number(matched[1]);
  const longitude = Number(matched[2]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return { latitude, longitude };
}

function getTreeLocationDisplay(tree: TreeRecord): {
  regionName: string;
  coordinateText: string;
} {
  const region = tree.region.trim();
  const coordinatesFromRegion =
    parseCoordinatesFromRegion(region);
  const hasNumericCoordinates =
    typeof tree.latitude === "number" &&
    Number.isFinite(tree.latitude) &&
    typeof tree.longitude === "number" &&
    Number.isFinite(tree.longitude);
  const coordinates = hasNumericCoordinates
    ? {
      latitude: tree.latitude as number,
      longitude: tree.longitude as number,
    }
    : coordinatesFromRegion;

  return {
    regionName: coordinatesFromRegion
      ? "좌표 기반 등록 지점"
      : region || "지역 정보 없음",
    coordinateText: coordinates
      ? `위도 ${coordinates.latitude.toFixed(6)} · 경도 ${coordinates.longitude.toFixed(6)}`
      : "좌표 정보 없음",
  };
}

type TimelineDateInfo = {
  timestamp: number | null;
  formatted: string;
};

function getTimelineDateInfo(
  value: string | null | undefined,
): TimelineDateInfo {
  const source = String(value ?? "").trim();

  if (!source) {
    return {
      timestamp: null,
      formatted: "시간 미기록",
    };
  }

  const pad = (number: number) =>
    String(number).padStart(2, "0");
  const localPattern =
    /^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})(?:\.?\s*(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  const localMatch = source.match(localPattern);
  const isIsoTimestamp =
    /^\d{4}-\d{2}-\d{2}T/.test(source);

  if (localMatch && !isIsoTimestamp) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const meridiem = localMatch[4];
    const hasTime = localMatch[5] !== undefined;
    let hour = hasTime ? Number(localMatch[5]) : 0;
    const minute = hasTime ? Number(localMatch[6]) : 0;
    const second = hasTime
      ? Number(localMatch[7] ?? 0)
      : 0;

    if (meridiem === "오후" && hour < 12) {
      hour += 12;
    }

    if (meridiem === "오전" && hour === 12) {
      hour = 0;
    }

    const timestamp = Date.UTC(
      year,
      month - 1,
      day,
      hour - 9,
      minute,
      second,
    );

    return {
      timestamp,
      formatted: hasTime
        ? `${year}.${pad(month)}.${pad(day)} ${pad(hour)}:${pad(minute)}`
        : `${year}.${pad(month)}.${pad(day)} --:--`,
    };
  }

  const parsed = new Date(source);

  if (Number.isNaN(parsed.getTime())) {
    return {
      timestamp: null,
      formatted: "시간 미기록",
    };
  }

  const hasTime =
    /T\d{1,2}:\d{2}|\d{1,2}:\d{2}/.test(source);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: hasTime ? "2-digit" : undefined,
    minute: hasTime ? "2-digit" : undefined,
    hourCycle: "h23",
  }).formatToParts(parsed);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const dateText =
    `${part("year")}.${part("month")}.${part("day")}`;

  return {
    timestamp: parsed.getTime(),
    formatted: hasTime
      ? `${dateText} ${part("hour")}:${part("minute")}`
      : `${dateText} --:--`,
  };
}

function formatTimelineDate(
  value: string | null | undefined,
): string {
  return getTimelineDateInfo(value).formatted;
}

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
    latitude: baseLatitude + index * 0.00018,
    longitude: baseLongitude + index * 0.00022,
    altitude: 118.4 + (index % 5) * 1.7,
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
    Math.max(minimumConfidence, confidence),
  );

  return (
    80 +
    ((normalizedConfidence - minimumConfidence) /
      (1 - minimumConfidence)) *
    15
  );
}

function actualConfidencePercent(
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

type TimelineImageSource =
  | "citizen"
  | "field-surveillance"
  | "field-control"
  | "thermal"
  | "drone-visible";

type TimelineImageData = {
  id: string;

  source:
  TimelineImageSource;

  title: string;

  capturedAt: string;

  latitude?: number;
  longitude?: number;

  directUrl?: string;

  storageBucket?: string;
  storagePath?: string;

  aiProbability?: number;

  analysisResult?:
  TreeRecord["analysisResult"];
};

type TimelineAudioData = {
  id: string;

  title: string;

  workMode:
  FieldVoiceLogRecord["workMode"];

  capturedAt: string;

  storageBucket: string;
  storagePath: string;

  mimeType?: string;

  durationSeconds?: number;

  transcript?: string;

  latitude?: number;
  longitude?: number;

  note?: string;
};

type TimelineDisplayItem = {
  id: string;
  stage: string;
  date: string;
  note: string;
  actor: string;

  image?: TimelineImageData;

  audio?: TimelineAudioData;
};

interface MonitoringSectionProps {
  trees: TreeRecord[];

  fieldPhotos:
  FieldPhotoRecord[];

  fieldVoiceLogs:
  FieldVoiceLogRecord[];

  onAddTree: (
    newTree: TreeRecord
  ) => void;

  onUpdateTreeStatus: (
    id: string,
    newStatus: TreeWorkflowStatus
  ) => void | Promise<void>;

  onDeleteTrees: (
    ids: string[]
  ) => Promise<string[]>;

  dispatchAssignments:
  DispatchAssignment[];

  onAssignWorker: (
    assignment: DispatchAssignment
  ) => Promise<boolean>;
}

export default function MonitoringSection({
  trees,
  fieldPhotos,
  fieldVoiceLogs,
  onAddTree,
  onUpdateTreeStatus,
  onDeleteTrees,
  dispatchAssignments,
  onAssignWorker,
}: MonitoringSectionProps) {

  // =========================================================
  // 신규 등록 폼
  // =========================================================

  const [region, setRegion] = useState("");

  const [species, setSpecies] =
    useState<TreeRecord["species"]>("소나무");

  const [severity, setSeverity] =
    useState<TreeRecord["severity"]>("중");

  const [gpsX, setGpsX] =
    useState("362947");

  const [gpsY, setGpsY] =
    useState("289014");

  const [inspector, setInspector] =
    useState("김지원");

  const [isRegistering, setIsRegistering] =
    useState(false);


  // =========================================================
  // 검색
  // =========================================================

  const [searchText, setSearchText] =
    useState("");

  const [isDeleteMode, setIsDeleteMode] =
    useState(false);

  const [selectedDeleteIds, setSelectedDeleteIds] =
    useState<Set<string>>(
      () => new Set()
    );

  const [isDeletingTrees, setIsDeletingTrees] =
    useState(false);

  const [controlAssignmentTreeId, setControlAssignmentTreeId] =
    useState<string | null>(null);

  const [controlWorkers, setControlWorkers] =
    useState<ControlWorkerCandidate[]>([]);

  const [isControlWorkersLoading, setIsControlWorkersLoading] =
    useState(true);

  const [controlWorkersError, setControlWorkersError] =
    useState("");

  const [controlAssignmentMessage, setControlAssignmentMessage] =
    useState("");

  useEffect(() => {
    const controller = new AbortController();

    setIsControlWorkersLoading(true);
    setControlWorkersError("");

    Promise.all([
      fetch(WORKERS_PATH, {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch(WORKER_CAPABILITIES_PATH, {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch(WORKER_AVAILABILITY_PATH, {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch(WORKER_CURRENT_STATUS_PATH, {
        cache: "no-cache",
        signal: controller.signal,
      }),
    ])
      .then(async (responses) => {
        for (const response of responses) {
          if (!response.ok) {
            throw new Error(
              `방제 요원 데이터 로드 실패 (${response.status})`,
            );
          }
        }

        const [
          workersData,
          capabilitiesData,
          availabilityData,
          currentStatusData,
        ] = await Promise.all(
          responses.map((response) => response.json()),
        );

        if (
          !Array.isArray(workersData) ||
          !Array.isArray(capabilitiesData) ||
          !Array.isArray(availabilityData) ||
          !Array.isArray(currentStatusData)
        ) {
          throw new Error(
            "방제 요원 데이터 형식이 올바르지 않습니다.",
          );
        }

        const capabilityMap = new Map<
          string,
          ControlWorkerCapability[]
        >();

        capabilitiesData.forEach((row: any) => {
          const workerId = String(row.worker_id ?? "");
          const taskType = String(
            row.task_type ?? "",
          ) as DispatchTaskType;

          if (
            !workerId ||
            !["SURVEY", "DRONE", "CONTROL"].includes(taskType)
          ) {
            return;
          }

          const capabilities = capabilityMap.get(workerId) ?? [];
          capabilities.push({
            taskType,
            skillLevel: safeNumber(row.skill_level),
          });
          capabilityMap.set(workerId, capabilities);
        });

        const availabilityMap = new Map<string, any>(
          availabilityData.map((row: any) => [
            String(row.worker_id ?? ""),
            row,
          ]),
        );
        const currentStatusMap = new Map<string, any>(
          currentStatusData.map((row: any) => [
            String(row.worker_id ?? ""),
            row,
          ]),
        );

        setControlWorkers(
          workersData.map((row: any) => {
            const workerId = String(row.worker_id ?? "");
            const availability = availabilityMap.get(workerId) ?? {};
            const currentStatus = currentStatusMap.get(workerId) ?? {};

            return {
              workerId,
              workerName: String(row.worker_name ?? ""),
              homeSidoName: String(row.home_sido_name ?? ""),
              homeSigunguCode: String(row.home_sigungu_code ?? ""),
              homeSigunguName: String(row.home_sigungu_name ?? ""),
              baseLatitude: safeNumber(row.base_lat),
              baseLongitude: safeNumber(row.base_lon),
              capabilities: capabilityMap.get(workerId) ?? [],
              availabilityStatus: String(
                availability.availability_status ?? "UNAVAILABLE",
              ),
              currentStatus: String(
                currentStatus.status ?? "UNAVAILABLE",
              ),
              remainingMinutes: safeNumber(
                availability.remaining_minutes,
              ),
              batteryPercent:
                currentStatus.battery_level == null
                  ? null
                  : safeNumber(currentStatus.battery_level),
            };
          }),
        );
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("방제 요원 데이터 로드 오류:", error);
        setControlWorkersError(
          error instanceof Error
            ? error.message
            : "방제 요원 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsControlWorkersLoading(false);
        }
      });

    return () => controller.abort();
  }, []);


  // =========================================================
  // 선택된 감염목
  // =========================================================

  const [selectedTreeId, setSelectedTreeId] =
    useState<string | null>(
      trees[0]?.id ?? null
    );

  const toggleDeleteSelection = (
    id: string
  ) => {
    setSelectedDeleteIds((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const cancelDeleteMode = () => {
    if (isDeletingTrees) {
      return;
    }

    setIsDeleteMode(false);
    setSelectedDeleteIds(new Set());
  };

  const handleDeleteSelectedTrees = async () => {
    const ids = Array.from(
      selectedDeleteIds
    );

    if (ids.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `선택한 확진목 ${ids.length}건을 삭제하시겠습니까?\n\n` +
      "확진목 목록과 타임라인에서는 사라지지만, " +
      "STT·이미지·시민 제보 원본은 Supabase에 보존됩니다."
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingTrees(true);

    try {
      const deletedIds = await onDeleteTrees(
        ids
      );

      if (deletedIds.length > 0) {
        const deletedIdSet = new Set(
          deletedIds
        );

        setSelectedDeleteIds((previous) => {
          const next = new Set(previous);

          deletedIds.forEach((id) => {
            next.delete(id);
          });

          return next;
        });

        if (
          selectedTreeId &&
          deletedIdSet.has(selectedTreeId)
        ) {
          setIsVideoOpen(false);
          setIsImageOpen(false);
          setSelectedImage(null);
          setIsAudioOpen(false);
          setSelectedAudio(null);
        }
      }

      if (deletedIds.length === ids.length) {
        setIsDeleteMode(false);
        setSelectedDeleteIds(new Set());
      }
    } finally {
      setIsDeletingTrees(false);
    }
  };

  // =========================================================
  // 영상 패널
  // =========================================================

  const [isVideoOpen, setIsVideoOpen] =
    useState(false);

  const [isImageOpen, setIsImageOpen] =
    useState(false);

  const [
    selectedImage,
    setSelectedImage,
  ] = useState<TimelineImageData | null>(
    null
  );

  const [
    selectedImageUrl,
    setSelectedImageUrl,
  ] = useState("");

  const [
    isImageLoading,
    setIsImageLoading,
  ] = useState(false);

  const [
    imageLoadError,
    setImageLoadError,
  ] = useState("");

  const [
    detailImageSize,
    setDetailImageSize,
  ] = useState({
    width: 0,
    height: 0,
  });


  // =========================================================
  // AI 드론 열화상 일괄 분석
  // =========================================================

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


  const [
    isAudioOpen,
    setIsAudioOpen,
  ] = useState(false);

  const [
    selectedAudio,
    setSelectedAudio,
  ] = useState<TimelineAudioData | null>(
    null
  );

  const [
    selectedAudioUrl,
    setSelectedAudioUrl,
  ] = useState("");

  const [
    isAudioLoading,
    setIsAudioLoading,
  ] = useState(false);

  const [
    audioLoadError,
    setAudioLoadError,
  ] = useState("");


  // =========================================================
  // trees가 변경될 경우 선택된 ID 유지
  // =========================================================

  useEffect(() => {

    if (trees.length === 0) {
      setSelectedTreeId(null);
      return;
    }

    const exists =
      selectedTreeId &&
      trees.some(
        (tree) =>
          tree.id === selectedTreeId
      );

    if (!exists) {
      setSelectedTreeId(
        trees[0].id
      );
    }

  }, [trees, selectedTreeId]);


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


  // =========================================================
  // 선택된 감염목
  // =========================================================

  const selectedTree =
    trees.find(
      (tree) =>
        tree.id === selectedTreeId
    ) ?? null;

  /**
   * 모바일 현장 기록은 구현 시점에 따라 확진목 ID, 원본 예찰 배정 ID,
   * 방제 배정 ID 또는 GRID 접두사가 붙은 값으로 저장될 수 있습니다.
   * 한 확진목에 연결될 수 있는 식별자를 모두 모아 동일 업무의 기록을
   * 안정적으로 찾습니다.
   */
  const getTreeRelatedIds = (
    tree: TreeRecord,
  ) => {
    const relatedIds = new Set<string>();

    const addId = (
      value?: string | number | null,
    ) => {
      if (
        value === undefined ||
        value === null
      ) {
        return;
      }

      const normalized = String(value).trim();

      if (!normalized) {
        return;
      }

      relatedIds.add(normalized);

      const gridId = normalized.replace(
        /^GRID-/i,
        "",
      );

      relatedIds.add(gridId);
      relatedIds.add(`GRID-${gridId}`);
    };

    addId(tree.id);
    addId(tree.sourceReportId);

    dispatchAssignments.forEach(
      (assignment) => {
        const assignmentIds = [
          assignment.assignmentId,
          assignment.gridId,
        ];

        const isRelated = assignmentIds.some(
          (value) => {
            const normalized = String(
              value,
            ).trim();
            const gridId = normalized.replace(
              /^GRID-/i,
              "",
            );

            return (
              relatedIds.has(normalized) ||
              relatedIds.has(gridId) ||
              relatedIds.has(`GRID-${gridId}`)
            );
          },
        );

        if (isRelated) {
          addId(assignment.assignmentId);
          addId(assignment.gridId);
        }
      },
    );

    return relatedIds;
  };

  const isRelatedRecordId = (
    relatedIds: Set<string>,
    value: string | number,
  ) => {
    const normalized = String(value).trim();
    const gridId = normalized.replace(
      /^GRID-/i,
      "",
    );

    return (
      relatedIds.has(normalized) ||
      relatedIds.has(gridId) ||
      relatedIds.has(`GRID-${gridId}`)
    );
  };

  const controlAssignmentTree =
    controlAssignmentTreeId
      ? trees.find(
        (tree) =>
          tree.id === controlAssignmentTreeId
      ) ?? null
      : null;

  const activeControlAssignment =
    controlAssignmentTree
      ? dispatchAssignments.find(
        (assignment) =>
          assignment.taskType === "CONTROL" &&
          assignment.gridId === controlAssignmentTree.id &&
          assignment.status !== "복귀 완료"
      ) ?? null
      : null;

  const recommendedControlWorkers =
    useMemo<ControlWorkerRecommendation[]>(() => {
      if (
        !controlAssignmentTree ||
        typeof controlAssignmentTree.latitude !== "number" ||
        !Number.isFinite(controlAssignmentTree.latitude) ||
        typeof controlAssignmentTree.longitude !== "number" ||
        !Number.isFinite(controlAssignmentTree.longitude)
      ) {
        return [];
      }

      const assignedWorkerIds = new Set(
        dispatchAssignments
          .filter(
            (assignment) =>
              assignment.status !== "복귀 완료"
          )
          .map((assignment) => assignment.workerId),
      );

      return controlWorkers
        .filter((worker) => {
          const controlCapability = worker.capabilities.find(
            (capability) => capability.taskType === "CONTROL",
          );
          const availabilityOk = [
            "AVAILABLE",
            "PARTIAL",
            "대기",
            "가능",
          ].includes(worker.availabilityStatus);
          const statusOk = [
            "AVAILABLE",
            "대기",
            "복귀",
          ].includes(worker.currentStatus);

          return Boolean(controlCapability) &&
            availabilityOk &&
            statusOk &&
            worker.remainingMinutes > 0 &&
            !assignedWorkerIds.has(worker.workerId);
        })
        .map((worker) => {
          const controlCapability = worker.capabilities.find(
            (capability) => capability.taskType === "CONTROL",
          )!;
          const localRegion = Boolean(
            worker.homeSigunguName &&
            controlAssignmentTree.region.includes(
              worker.homeSigunguName,
            ),
          );
          const distanceKm = calculateDistanceKm(
            worker.baseLatitude,
            worker.baseLongitude,
            controlAssignmentTree.latitude!,
            controlAssignmentTree.longitude!,
          );

          return {
            worker,
            skillLevel: controlCapability.skillLevel,
            distanceKm,
            assignmentType: localRegion
              ? "지역 내 배정" as const
              : "광역 지원" as const,
          };
        })
        .sort((left, right) => {
          const assignmentPriority =
            (left.assignmentType === "지역 내 배정" ? 1 : 0) -
            (right.assignmentType === "지역 내 배정" ? 1 : 0);

          if (assignmentPriority !== 0) {
            return -assignmentPriority;
          }

          if (left.distanceKm !== right.distanceKm) {
            return left.distanceKm - right.distanceKm;
          }

          return right.skillLevel - left.skillLevel;
        })
        .slice(0, 12);
    }, [
      controlAssignmentTree,
      controlWorkers,
      dispatchAssignments,
    ]);

  const selectedTreeRelatedIds =
    useMemo(
      () =>
        selectedTree
          ? getTreeRelatedIds(selectedTree)
          : new Set<string>(),
      [
        selectedTree,
        dispatchAssignments,
      ],
    );

  const selectedTreeFieldPhotos =
    useMemo(
      () =>
        selectedTree
          ? fieldPhotos.filter(
            (photo) =>
              isRelatedRecordId(
                selectedTreeRelatedIds,
                photo.relatedRecordId,
              ),
          )
          : [],
      [
        selectedTree,
        selectedTreeRelatedIds,
        fieldPhotos,
      ],
    );

  const selectedTreeDispatchAssignments =
    useMemo(
      () =>
        selectedTree
          ? dispatchAssignments.filter(
            (assignment) =>
              isRelatedRecordId(
                selectedTreeRelatedIds,
                assignment.assignmentId,
              ) ||
              isRelatedRecordId(
                selectedTreeRelatedIds,
                assignment.gridId,
              ),
          )
          : [],
      [
        selectedTree,
        selectedTreeRelatedIds,
        dispatchAssignments,
      ],
    );

  const selectedTreeVoiceLogs =
    useMemo(
      () => {
        if (!selectedTree) {
          return [];
        }

        return fieldVoiceLogs.filter(
          log =>
            isRelatedRecordId(
              selectedTreeRelatedIds,
              log.relatedRecordId,
            )
        );
      },
      [
        selectedTree,
        selectedTreeRelatedIds,
        fieldVoiceLogs,
      ]
    );

  const combinedTimeline =
    useMemo<TimelineDisplayItem[]>(() => {
      if (!selectedTree) {
        return [];
      }

      const items:
        TimelineDisplayItem[] =
        selectedTree.timeline.map(
          (item, index) => ({
            id:
              `base-${selectedTree.id}-${index}`,

            stage:
              item.stage,

            date:
              item.date,

            note:
              item.note,

            actor:
              item.actor,
          })
        );

      /*
       * 시민 신고에서 전환된 확진목의
       * 최초 신고 사진
       */
      if (
        selectedTree.imageSource ===
        "citizen" &&
        selectedTree.imageUrl
      ) {
        const image:
          TimelineImageData = {
          id:
            `citizen-${selectedTree.id}`,

          source:
            "citizen",

          title:
            "시민 신고 원본 이미지",

          capturedAt:
            selectedTree.confirmedDate,

          latitude:
            selectedTree.latitude,

          longitude:
            selectedTree.longitude,

          directUrl:
            selectedTree.imageUrl,

          aiProbability:
            selectedTree.aiProbability,
        };

        items.push({
          id:
            `timeline-citizen-${selectedTree.id}`,

          stage:
            "시민 신고 원본 이미지 등록",

          date:
            selectedTree.confirmedDate,

          note:
            "확진목 전환의 근거가 된 시민 신고 원본 사진과 신고 위치입니다.",

          actor:
            selectedTree.inspector,

          image,
        });
      }

      /*
       * 드론 열화상 분석에서 전환된 확진목
       */
      if (
        selectedTree.imageSource ===
        "thermal" &&
        (
          selectedTree.imagePath ||
          selectedTree.imageUrl
        )
      ) {
        const thermalPath =
          selectedTree.imagePath ||
          selectedTree.imageUrl;

        const isPublicUrl =
          thermalPath?.startsWith(
            "http"
          );

        const image:
          TimelineImageData = {
          id:
            `thermal-${selectedTree.id}`,

          source:
            "thermal",

          title:
            "드론 열화상 AI 판독 이미지",

          capturedAt:
            selectedTree
              .analysisResult
              ?.capturedAt ||
            selectedTree.confirmedDate,

          latitude:
            selectedTree.latitude,

          longitude:
            selectedTree.longitude,

          aiProbability:
            selectedTree.aiProbability,

          analysisResult:
            selectedTree.analysisResult,

          directUrl:
            isPublicUrl
              ? thermalPath
              : undefined,

          storageBucket:
            isPublicUrl
              ? undefined
              : (
                selectedTree
                  .imageBucket ||
                "drone-images"
              ),

          storagePath:
            isPublicUrl
              ? undefined
              : thermalPath,
        };

        items.push({
          id:
            `timeline-thermal-${selectedTree.id}`,

          stage:
            "드론 열화상 AI 판독 이미지",

          date:
            image.capturedAt,

          note:
            `열화상 AI 분석 결과입니다. ` +
            `감염 신뢰도: ` +
            `${selectedTree.aiProbability ?? 0}%`,

          actor:
            "드론 열화상 AI 시스템",

          image,
        });
      }

      /*
       * 가시광선 드론 비전 분석에서 전환된 확진목
       */
      if (
        selectedTree.imageSource ===
        "drone-visible" &&
        (
          selectedTree.imagePath ||
          selectedTree.imageUrl
        )
      ) {
        const visiblePath =
          selectedTree.imagePath ||
          selectedTree.imageUrl;

        const isPublicUrl =
          visiblePath?.startsWith("http");

        const image:
          TimelineImageData = {
          id:
            `drone-visible-${selectedTree.id}`,

          source:
            "drone-visible",

          title:
            "드론 실사 비전 AI 판독 이미지",

          capturedAt:
            selectedTree
              .analysisResult
              ?.capturedAt ||
            selectedTree.confirmedDate,

          latitude:
            selectedTree.latitude,

          longitude:
            selectedTree.longitude,

          aiProbability:
            selectedTree.aiProbability,

          analysisResult:
            selectedTree.analysisResult,

          directUrl:
            isPublicUrl
              ? visiblePath
              : undefined,

          storageBucket:
            isPublicUrl
              ? undefined
              : (
                selectedTree
                  .imageBucket ||
                "drone-images"
              ),

          storagePath:
            isPublicUrl
              ? undefined
              : visiblePath,
        };

        items.push({
          id:
            `timeline-drone-visible-${selectedTree.id}`,

          stage:
            "드론 실사 비전 AI 판독 이미지",

          date:
            image.capturedAt,

          note:
            `가시광선 비전 AI 분석 결과입니다. ` +
            `감염 신뢰도: ` +
            `${selectedTree.aiProbability ?? 0}%`,

          actor:
            "드론 실사 비전 AI 시스템",

          image,
        });
      }

      /*
       * 앱의 현장관리자가 촬영한 사진
       */
      selectedTreeFieldPhotos.forEach(
        photo => {
          const isSurveillance =
            photo.workMode ===
            "surveillance";

          const source:
            TimelineImageSource =
            isSurveillance
              ? "field-surveillance"
              : "field-control";

          const image:
            TimelineImageData = {
            id:
              `field-${photo.id}`,

            source,

            title:
              isSurveillance
                ? "예찰·조사 현장사진"
                : "방제·시공 현장사진",

            capturedAt:
              photo.capturedAt,

            latitude:
              photo.latitude,

            longitude:
              photo.longitude,

            storageBucket:
              "field-photos",

            storagePath:
              photo.storagePath,
          };

          items.push({
            id:
              `timeline-field-${photo.id}`,

            stage:
              isSurveillance
                ? "예찰·조사 현장사진 등록"
                : "방제·시공 현장사진 등록",

            date:
              photo.capturedAt,

            note:
              photo.note ||
              (
                isSurveillance
                  ? "현장관리자가 예찰·조사 과정에서 촬영한 사진입니다."
                  : "현장관리자가 방제·시공 과정에서 촬영한 사진입니다."
              ),

            actor:
              "현장관리자",

            image,
          });
        }
      );

      /*
 * 현장관리자의 음성 작업일지
 */
      selectedTreeVoiceLogs.forEach(
        voiceLog => {
          const isControl =
            voiceLog.workMode ===
            "control";

          const audio:
            TimelineAudioData = {
            id:
              `voice-${voiceLog.id}`,

            title:
              isControl
                ? "방제·시공 음성 작업일지"
                : "예찰·조사 음성 작업일지",

            workMode:
              voiceLog.workMode,

            capturedAt:
              voiceLog.capturedAt,

            storageBucket:
              voiceLog.storageBucket ||
              "field-audio",

            storagePath:
              voiceLog.storagePath,

            mimeType:
              voiceLog.mimeType,

            durationSeconds:
              voiceLog.durationSeconds,

            transcript:
              voiceLog.transcript,

            latitude:
              voiceLog.latitude,

            longitude:
              voiceLog.longitude,

            note:
              voiceLog.note,
          };

          items.push({
            id:
              `timeline-voice-${voiceLog.id}`,

            stage:
              isControl
                ? "방제·시공 음성 작업일지 등록"
                : "예찰·조사 음성 작업일지 등록",

            date:
              voiceLog.capturedAt,

            note:
              voiceLog.transcript ||
              voiceLog.note ||
              "현장관리자가 음성으로 등록한 작업일지입니다.",

            actor:
              "현장관리자",

            audio,
          });
        }
      );

      /*
       * 방제 업무에서 인증한 자재·약제 QR
       */
      selectedTreeDispatchAssignments.forEach(
        (assignment) => {
          if (
            assignment.taskType !== "CONTROL" ||
            !assignment.chemicalQrCode
          ) {
            return;
          }

          items.push({
            id:
              `timeline-chemical-qr-${assignment.assignmentId}`,

            stage:
              "자재·약제 QR 인증 완료",

            date:
              assignment.chemicalQrScannedAt ||
              assignment.completedAt ||
              assignment.startedAt ||
              assignment.assignedAt,

            note:
              `방제 작업에 사용한 자재·약제 QR ` +
              `(${assignment.chemicalQrCode}) 인증이 완료되었습니다.`,

            actor:
              assignment.workerName ||
              "현장관리자",
          });
        },
      );

      return items.sort(
        (first, second) => {
          const firstTime =
            getTimelineDateInfo(
              first.date,
            ).timestamp ?? 0;

          const secondTime =
            getTimelineDateInfo(
              second.date,
            ).timestamp ?? 0;

          return (
            secondTime - firstTime
          );
        }
      );
    }, [
      selectedTree,
      selectedTreeDispatchAssignments,
      selectedTreeFieldPhotos,
      selectedTreeVoiceLogs,
    ]);

  const handleOpenTimelineImage =
    async (
      image: TimelineImageData
    ) => {
      setSelectedImage(image);

      setDetailImageSize({
        width:
          image.analysisResult
            ?.image?.width ?? 0,

        height:
          image.analysisResult
            ?.image?.height ?? 0,
      });

      setIsImageOpen(true);
      setIsVideoOpen(false);
      setIsRegistering(false);

      setIsAudioOpen(false);
      setSelectedAudio(null);
      setSelectedAudioUrl("");

      setSelectedImageUrl("");
      setImageLoadError("");

      /*
       * 시민 신고처럼 이미 완성된
       * 공개 URL인 경우
       */
      if (image.directUrl) {
        setSelectedImageUrl(
          image.directUrl
        );

        return;
      }

      /*
       * 비공개 Storage 파일인 경우
       * Signed URL 생성
       */
      if (
        !image.storageBucket ||
        !image.storagePath
      ) {
        setImageLoadError(
          "이미지 저장 경로를 확인할 수 없습니다."
        );

        return;
      }

      try {
        setIsImageLoading(true);

        const {
          data,
          error,
        } = await supabase.storage
          .from(
            image.storageBucket
          )
          .createSignedUrl(
            image.storagePath,
            60 * 60
          );

        if (
          error ||
          !data?.signedUrl
        ) {
          throw new Error(
            error?.message ||
            "Signed URL 생성에 실패했습니다."
          );
        }

        setSelectedImageUrl(
          data.signedUrl
        );
      } catch (error) {
        console.error(
          "타임라인 이미지 불러오기 실패:",
          error
        );

        setImageLoadError(
          error instanceof Error
            ? error.message
            : "이미지를 불러오지 못했습니다."
        );
      } finally {
        setIsImageLoading(false);
      }
    };

  const handleCloseImagePanel = () => {
    setIsImageOpen(false);
    setSelectedImage(null);
    setSelectedImageUrl("");
    setImageLoadError("");
    setDetailImageSize({
      width: 0,
      height: 0,
    });
  };

  const handleOpenTimelineAudio =
    async (
      audio: TimelineAudioData
    ) => {
      setSelectedAudio(audio);

      setIsAudioOpen(true);
      setIsImageOpen(false);
      setIsVideoOpen(false);
      setIsRegistering(false);

      setSelectedAudioUrl("");
      setAudioLoadError("");
      setIsAudioLoading(false);

      if (
        !audio.storageBucket ||
        !audio.storagePath
      ) {
        setAudioLoadError(
          "녹음 파일의 저장 경로를 확인할 수 없습니다."
        );

        return;
      }

      try {
        setIsAudioLoading(true);

        const {
          data,
          error,
        } = await supabase.storage
          .from(
            audio.storageBucket
          )
          .createSignedUrl(
            audio.storagePath,
            60 * 60
          );

        if (
          error ||
          !data?.signedUrl
        ) {
          throw new Error(
            error?.message ||
            "녹음 파일 URL 생성에 실패했습니다."
          );
        }

        setSelectedAudioUrl(
          data.signedUrl
        );
      } catch (error) {
        console.error(
          "타임라인 녹음본 불러오기 실패:",
          error
        );

        setAudioLoadError(
          error instanceof Error
            ? error.message
            : "녹음본을 불러오지 못했습니다."
        );
      } finally {
        setIsAudioLoading(false);
      }
    };

  const handleCloseAudioPanel =
    () => {
      setIsAudioOpen(false);
      setSelectedAudio(null);
      setSelectedAudioUrl("");
      setAudioLoadError("");
      setIsAudioLoading(false);
    };

  // =========================================================
  // 검색 결과
  // =========================================================

  const displayManagementIdByTreeId = useMemo(
    () => createDisplayManagementIdMap(trees),
    [trees],
  );

  const getDisplayManagementId = (
    treeId: string,
  ) =>
    displayManagementIdByTreeId.get(treeId) ??
    treeId;

  const filteredTrees =
    trees.filter((tree) => {

      const keyword =
        searchText
          .trim()
          .toLowerCase();

      if (!keyword) {
        return true;
      }

      return (
        tree.id
          .toLowerCase()
          .includes(keyword) ||

        getDisplayManagementId(tree.id)
          .toLowerCase()
          .includes(keyword) ||

        tree.region
          .toLowerCase()
          .includes(keyword) ||

        tree.species
          .toLowerCase()
          .includes(keyword)
      );

    });

  const visibleTreeIds = filteredTrees.map(
    (tree) => tree.id
  );

  const allVisibleTreesSelected =
    visibleTreeIds.length > 0 &&
    visibleTreeIds.every((id) =>
      selectedDeleteIds.has(id)
    );

  const toggleAllVisibleTrees = () => {
    setSelectedDeleteIds((previous) => {
      const next = new Set(previous);

      if (allVisibleTreesSelected) {
        visibleTreeIds.forEach((id) => {
          next.delete(id);
        });
      } else {
        visibleTreeIds.forEach((id) => {
          next.add(id);
        });
      }

      return next;
    });
  };


  // =========================================================
  // 신규 감염목 등록
  // =========================================================

  const handleRegisterTree = (
    event: React.FormEvent
  ) => {

    event.preventDefault();

    if (!region.trim()) {
      return;
    }

    const newRecord: TreeRecord = {

      id:
        `PT-${new Date().getFullYear()}-` +
        `${Math.floor(
          1000 +
          Math.random() * 9000
        )}`,

      region,

      species,

      confirmedDate:
        new Date()
          .toISOString()
          .split("T")[0],

      status: "배정 대기",

      severity,

      x: Number(gpsX),

      y: Number(gpsY),

      inspector,

      timeline: [
        {
          stage:
            "현장 제보 등록 (MON-002)",

          date:
            new Date().toLocaleString(),

          note:
            `GPS 등록 완료 ` +
            `(EPSG:5186 가상 투영변환 완료). ` +
            `피해정도: ${severity}`,

          actor: inspector,
        },
      ],
    };


    // App.tsx의 trees 상태에 추가
    onAddTree(newRecord);


    // 새로 등록한 나무 선택
    setSelectedTreeId(
      newRecord.id
    );


    // 입력 초기화
    setRegion("");

    setIsRegistering(false);

  };


  // =========================================================
  // 열화상 분석 처리
  // =========================================================

  function updateThermalProcess(
    id: string,
    patch: Partial<ThermalProcessItem>,
  ) {
    setThermalProcessById((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? {
          status: "queued",
        }),
        ...patch,
      },
    }));
  }

  async function uploadThermalImage(
    file: File,
  ): Promise<string> {
    const originalExtension = file.name
      .split(".")
      .pop()
      ?.toLowerCase();

    const extension =
      originalExtension &&
        ["jpg", "jpeg", "png", "webp"].includes(
          originalExtension,
        )
        ? originalExtension
        : "jpg";

    const uploadDate = new Date()
      .toISOString()
      .slice(0, 10);

    const filePath =
      `thermal/${uploadDate}/` +
      `${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from(DRONE_BUCKET)
      .upload(filePath, file, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(
        `열화상 이미지 업로드 실패: ${error.message}`,
      );
    }

    return filePath;
  }

  async function analyzeThermalBatch(
    items: ThermalInputItem[],
  ) {
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
          error: undefined,
          result: undefined,
        });

        const storagePath =
          await uploadThermalImage(item.file);

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
            await getEdgeFunctionErrorMessage(error);
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
          completed: previous.completed + 1,
        }));
      }
    }

    setIsBatchAnalyzing(false);
  }

  function handleThermalFilesSelect(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
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
          thermalInputs.length + index,
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
    setThermalProcessById(initialProcessById);
    setSelectedThermalId(nextInputs[0].id);
    setBatchError("");

    void analyzeThermalBatch(nextInputs);

    event.target.value = "";
  }

  // =========================================================
  // 심각도 스타일
  // =========================================================

  const getSeverityClass = (
    value: TreeRecord["severity"]
  ) => {

    if (value === "심") {
      return "bg-red-100 text-red-700";
    }

    if (value === "중") {
      return "bg-yellow-100 text-yellow-700";
    }

    return "bg-lime-100 text-lime-700";

  };


  // =========================================================
  // 상태 스타일
  // =========================================================

  const getStatusClass = (
    status: TreeRecord["status"]
  ) => {

    if (status === "작업 완료") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }

    if (
      status === "출동" ||
      status === "현장 도착" ||
      status === "작업 중"
    ) {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }

    if (status === "배정 수락") {
      return "bg-violet-50 text-violet-700 border-violet-200";
    }

    if (status === "배정 대기") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }

    return "bg-slate-50 text-slate-700 border-slate-200";

  };

  const getTreeType = (
    tree: TreeRecord,
  ) => {
    const relatedIds =
      getTreeRelatedIds(tree);

    const relatedAssignments =
      dispatchAssignments.filter(
        (assignment) =>
          isRelatedRecordId(
            relatedIds,
            assignment.assignmentId,
          ) ||
          isRelatedRecordId(
            relatedIds,
            assignment.gridId,
          ),
      );

    const surveyMovedToControl =
      relatedAssignments.some(
        (assignment) =>
          assignment.taskType === "SURVEY" &&
          assignment.status === "작업 완료",
      );

    const hasControlWork =
      surveyMovedToControl ||
      relatedAssignments.some(
        (assignment) =>
          assignment.taskType === "CONTROL",
      ) ||
      fieldPhotos.some(
        (photo) =>
          photo.workMode === "control" &&
          isRelatedRecordId(
            relatedIds,
            photo.relatedRecordId,
          ),
      ) ||
      fieldVoiceLogs.some(
        (log) =>
          log.workMode === "control" &&
          isRelatedRecordId(
            relatedIds,
            log.relatedRecordId,
          ),
      );

    if (hasControlWork) {
      return "방제";
    }

    const hasSurveyWork =
      relatedAssignments.some(
        (assignment) =>
          assignment.taskType === "SURVEY",
      ) ||
      fieldPhotos.some(
        (photo) =>
          photo.workMode === "surveillance" &&
          isRelatedRecordId(
            relatedIds,
            photo.relatedRecordId,
          ),
      ) ||
      fieldVoiceLogs.some(
        (log) =>
          log.workMode === "surveillance" &&
          isRelatedRecordId(
            relatedIds,
            log.relatedRecordId,
          ),
      );

    if (hasSurveyWork) {
      return "예찰";
    }

    if (tree.imageSource === "thermal") {
      return "비가시";
    }

    if (tree.imageSource === "drone-visible") {
      return "가시";
    }

    if (tree.imageSource === "citizen") {
      return "시민신고";
    }

    const timelineText = tree.timeline
      .map(
        (item) =>
          `${item.stage} ${item.note} ${item.actor}`,
      )
      .join(" ");

    if (
      timelineText.includes("AI 예측") ||
      timelineText.includes("AI예측") ||
      tree.inspector.includes("AI 예측") ||
      tree.inspector.includes("AI예측")
    ) {
      return "AI 예측";
    }

    if (tree.sourceReportId) {
      return "시민신고";
    }

    return "수동등록";
  };

  const getTreeTypeClass = (
    type: string,
  ) => {
    if (type === "시민신고") {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    if (type === "AI 예측") {
      return "border-violet-200 bg-violet-50 text-violet-700";
    }

    if (type === "비가시") {
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    }

    if (type === "가시") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (type === "예찰") {
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
    }

    if (type === "방제") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-slate-200 bg-slate-50 text-slate-600";
  };

  const handleAssignControlWorker = async (
    recommendation: ControlWorkerRecommendation,
  ) => {
    if (!controlAssignmentTree) {
      return;
    }

    const latitude = controlAssignmentTree.latitude;
    const longitude = controlAssignmentTree.longitude;

    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      typeof longitude !== "number" ||
      !Number.isFinite(longitude)
    ) {
      setControlAssignmentMessage(
        "이 확진목에는 위도·경도가 없어 방제 요원을 배정할 수 없습니다.",
      );
      return;
    }

    if (activeControlAssignment) {
      setControlAssignmentMessage(
        `이미 ${activeControlAssignment.workerName} 요원이 배정되어 있습니다.`,
      );
      return;
    }

    const { worker, skillLevel, distanceKm, assignmentType } =
      recommendation;
    const duplicated = dispatchAssignments.some(
      (assignment) =>
        assignment.workerId === worker.workerId &&
        assignment.gridId === controlAssignmentTree.id &&
        assignment.status !== "복귀 완료",
    );

    if (duplicated) {
      setControlAssignmentMessage(
        "이미 이 확진목에 배정된 요원입니다.",
      );
      return;
    }

    const severityRiskScore =
      controlAssignmentTree.severity === "심"
        ? 90
        : controlAssignmentTree.severity === "중"
          ? 70
          : 50;
    const priorityGrade =
      controlAssignmentTree.severity === "심"
        ? "최우선 방제"
        : controlAssignmentTree.severity === "중"
          ? "우선 방제"
          : "일반 방제";
    const regionParts = controlAssignmentTree.region
      .split(/\s+/)
      .filter(Boolean);

    const assignment: DispatchAssignment = {
      assignmentId:
        `DISPATCH-${Date.now()}-${worker.workerId}`,
      workerId: worker.workerId,
      workerName: worker.workerName,
      workerType: "방제요원",
      taskType: "CONTROL",
      workerCapabilities: worker.capabilities.map(
        (capability) => ({
          taskType: capability.taskType,
          skillLevel: capability.skillLevel,
        }),
      ),
      assignedSkillLevel: skillLevel,
      homeSidoName: worker.homeSidoName,
      homeSigunguCode: worker.homeSigunguCode,
      homeSigunguName: worker.homeSigunguName,
      targetSidoName: regionParts[0] ?? "",
      targetSigunguCode: "",
      targetSigunguName: regionParts.slice(0, 2).join(" "),
      targetEmdCode: "",
      targetEmdName: regionParts.slice(2).join(" "),
      gridId: controlAssignmentTree.id,
      targetLatitude: latitude,
      targetLongitude: longitude,
      priorityGrade,
      riskGrade: controlAssignmentTree.severity,
      riskScore: severityRiskScore,
      accessScore: 0,
      distanceKm,
      travelTimeHour: distanceKm / 35,
      batteryPercent: worker.batteryPercent,
      remainingMinutesAtAssignment: worker.remainingMinutes,
      recommendationReason:
        `${assignmentType} · 방제 ${skillLevel}단계 · ` +
        `잔여 ${Math.round(worker.remainingMinutes)}분`,
      assignmentType,
      status: "배정 대기",
      assignedAt: new Date().toISOString(),
    };

    try {
      await onUpdateTreeStatus(
        controlAssignmentTree.id,
        "배정 대기",
      );
      const assignmentSaved = await onAssignWorker(assignment);

      if (!assignmentSaved) {
        throw new Error(
          "방제 업무 배정 정보를 저장하지 못했습니다.",
        );
      }

      /*
       * 저장이 완료된 뒤에만 우측 배정 패널을 닫습니다.
       * 실패하면 패널을 유지해 사용자가 다시 시도할 수 있습니다.
       */
      setControlAssignmentMessage("");
      setControlAssignmentTreeId(null);
    } catch (error) {
      console.error("방제 요원 배정 상태 변경 오류:", error);
      setControlAssignmentMessage(
        error instanceof Error
          ? error.message
          : "방제 요원을 배정하지 못했습니다.",
      );
    }
  };

  const getImageSourceLabel = (
    source: TimelineImageSource
  ) => {
    switch (source) {
      case "citizen":
        return "시민 신고 원본";

      case "field-surveillance":
        return "예찰·조사 현장사진";

      case "field-control":
        return "방제·시공 현장사진";

      case "thermal":
        return "드론 열화상 AI";

      case "drone-visible":
        return "드론 실사 비전 AI";

      default:
        return "현장 이미지";
    }
  };

  const selectedThermalInput =
    thermalInputs.find(
      (item) => item.id === selectedThermalId,
    ) ?? null;

  const selectedPreviewUrl =
    thermalPreviewById[selectedThermalId] ?? "";

  const selectedProcess =
    thermalProcessById[selectedThermalId];

  const selectedResult = selectedProcess?.result;

  const completedResults = Object.values(
    thermalProcessById,
  ).filter(
    (process) =>
      process.status === "completed" &&
      process.result,
  );

  const totalInfectedCount = completedResults.reduce(
    (sum, process) =>
      sum + (process.result?.infectedCount ?? 0),
    0,
  );
  const progressPercent =
    batchProgress.total > 0
      ? (
        batchProgress.completed /
        batchProgress.total
      ) * 100
      : 0;

  /*
   * 열화상 이미지는 저장된 분석 크기를 우선 사용합니다.
   * 시민·현장사진은 이미지 onLoad에서 확인한 크기를 사용합니다.
   */
  const detailSourceWidth =
    selectedImage?.analysisResult
      ?.image?.width ||
    detailImageSize.width ||
    16;

  const detailSourceHeight =
    selectedImage?.analysisResult
      ?.image?.height ||
    detailImageSize.height ||
    9;

  const detailImageWidth =
    Math.max(
      1,
      detailSourceWidth
    );

  const detailImageHeight =
    Math.max(
      1,
      detailSourceHeight
    );

  /*
   * 이미지 상세 영역은 16:9로 고정합니다.
   * AI 박스 계산에서도 같은 비율을 사용합니다.
   */
  const detailPanelWidth = 16;
  const detailPanelHeight = 9;

  // =========================================================
  // 화면
  // =========================================================

  return (

    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">

      {/* =====================================================
          메인 영역
          좌측 : 목록 + 타임라인
          우측 : 영상 패널
      ====================================================== */}

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">


        {/* ===================================================
            좌측
        ==================================================== */}

        <div
          className={
            isVideoOpen
              ? "flex min-h-0 min-w-0 flex-1 flex-col gap-4"
              : "flex min-h-0 min-w-0 flex-1 flex-col gap-4"
          }
        >


          {/* =================================================
              확진목 리스트 Header
          ================================================== */}

          <section className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">

              <div className="flex items-center justify-between gap-4">

                {/* 왼쪽 : 제목 */}
                <div className="min-w-0">

                  <div className="flex items-center gap-2">

                    <TreesIcon
                      size={18}
                      className="shrink-0 text-emerald-700"
                    />

                    <h2 className="text-base font-black text-slate-950">
                      확진목 리스트
                    </h2>

                  </div>

                  {/* 설명 : 제목 바로 밑 */}
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    소나무재선충병에 감염된 확진목의 상세 내역과 타임라인을 확인합니다.
                  </p>

                </div>


                {/* 오른쪽 : 검색 + 신규 등록 */}
                <div className="flex shrink-0 items-center gap-2">

                  {/* 검색 */}

                  <div className="relative">

                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      value={searchText}
                      onChange={(event) =>
                        setSearchText(
                          event.target.value
                        )
                      }
                      placeholder="관리 ID / 지역 / 수종 검색"
                      className="h-10 w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />

                  </div>

                  {/* 신규 등록 */}

                  <button
                    type="button"
                    onClick={() => {
                      setControlAssignmentTreeId(null);
                      setControlAssignmentMessage("");
                      setIsRegistering(true);
                      setIsVideoOpen(false);

                      setIsImageOpen(false);
                      setSelectedImage(null);
                    }}
                    className="flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800"
                  >
                    <Plus size={16} />
                    신규 등록
                  </button>

                </div>

              </div>

            </header>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-scroll">

              <table className="w-full border-collapse">

                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white">

                  <tr>

                    {isDeleteMode && (
                      <th className="w-12 px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={allVisibleTreesSelected}
                          onChange={toggleAllVisibleTrees}
                          disabled={
                            visibleTreeIds.length === 0 ||
                            isDeletingTrees
                          }
                          aria-label="현재 검색 결과 전체 선택"
                          className="h-4 w-4 cursor-pointer accent-rose-600 disabled:cursor-not-allowed"
                        />
                      </th>
                    )}

                    <th className="px-5 py-3 text-left text-[11px] font-black text-slate-500">
                      관리 ID
                    </th>

                    <th className="px-5 py-3 text-left text-[11px] font-black text-slate-500">
                      유형
                    </th>

                    <th className="px-5 py-3 text-left text-[11px] font-black text-slate-500">
                      발견 지역
                    </th>

                    <th className="px-5 py-3 text-left text-[11px] font-black text-slate-500">
                      수종
                    </th>

                    <th className="px-5 py-3 text-center text-[11px] font-black text-slate-500">
                      심각도
                    </th>

                    <th className="px-5 py-3 text-right text-[11px] font-black text-slate-500">
                      상태
                    </th>

                    <th className="px-5 py-3 text-right text-[11px] font-black text-slate-500">
                      배정 요원
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {filteredTrees.map(
                    (tree) => {

                      const selected =
                        selectedTreeId ===
                        tree.id;

                      const isCheckedForDelete =
                        selectedDeleteIds.has(
                          tree.id
                        );

                      const treeType =
                        getTreeType(tree);

                      const displayManagementId =
                        getDisplayManagementId(
                          tree.id,
                        );

                      const locationDisplay =
                        getTreeLocationDisplay(
                          tree,
                        );

                      const assignedControlWorker =
                        dispatchAssignments.find(
                          (assignment) =>
                            assignment.taskType === "CONTROL" &&
                            assignment.gridId === tree.id &&
                            assignment.status !== "복귀 완료",
                        ) ?? null;

                      return (

                        <tr
                          key={tree.id}
                          onClick={() => {
                            setControlAssignmentTreeId(null);
                            setControlAssignmentMessage("");
                            setSelectedTreeId(
                              tree.id
                            );

                            setIsVideoOpen(false);
                            setIsImageOpen(false);
                            setSelectedImage(null);
                          }}
                          className={
                            selected
                              ? "cursor-pointer border-b border-slate-100 bg-emerald-50"
                              : "cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                          }
                        >

                          {isDeleteMode && (
                            <td
                              className="w-12 px-3 py-4 text-center"
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                            >
                              <input
                                type="checkbox"
                                checked={isCheckedForDelete}
                                onChange={() =>
                                  toggleDeleteSelection(
                                    tree.id
                                  )
                                }
                                disabled={isDeletingTrees}
                                aria-label={`${displayManagementId} 삭제 선택`}
                                className="h-4 w-4 cursor-pointer accent-rose-600 disabled:cursor-not-allowed"
                              />
                            </td>
                          )}

                          <td className="px-5 py-4">

                            <div className="flex items-center gap-2">

                              {selected && (
                                <span className="h-7 w-1 rounded-full bg-emerald-600" />
                              )}

                              <span className="text-sm font-black text-emerald-700">
                                {displayManagementId}
                              </span>

                            </div>

                          </td>


                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-black ${getTreeTypeClass(
                                treeType,
                              )}`}
                            >
                              {treeType}
                            </span>
                          </td>


                          <td className="px-5 py-4">
                            <div className="text-xs font-bold text-slate-700">
                              {locationDisplay.coordinateText}
                            </div>
                          </td>


                          <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                            {tree.species}
                          </td>


                          <td className="px-5 py-4 text-center">

                            <span
                              className={`rounded-full px-3 py-1 text-[10px] font-black ${getSeverityClass(
                                tree.severity
                              )}`}
                            >
                              {tree.severity}
                            </span>

                          </td>


                          <td className="px-5 py-4 text-right">

                            <span
                              className={`inline-flex whitespace-nowrap rounded-lg border px-3 py-1.5 text-[10px] font-black ${getStatusClass(
                                tree.status
                              )}`}
                            >
                              {tree.status}
                            </span>

                          </td>

                          <td
                            className="px-5 py-4 text-right"
                            onClick={(event) =>
                              event.stopPropagation()
                            }
                          >
                            {assignedControlWorker ? (
                              <span className="inline-flex whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700">
                                {assignedControlWorker.workerName}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTreeId(tree.id);
                                  setIsRegistering(false);
                                  setIsVideoOpen(false);
                                  setIsImageOpen(false);
                                  setSelectedImage(null);
                                  setIsAudioOpen(false);
                                  setSelectedAudio(null);
                                  setControlAssignmentMessage("");
                                  setControlAssignmentTreeId(tree.id);
                                }}
                                disabled={isDeletingTrees}
                                className="inline-flex whitespace-nowrap rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                요원 배정
                              </button>
                            )}
                          </td>
                        </tr>

                      );

                    }
                  )}


                  {filteredTrees.length === 0 && (

                    <tr>

                      <td
                        colSpan={
                          isDeleteMode ? 8 : 7
                        }
                        className="px-5 py-20 text-center text-xs font-bold text-slate-400"
                      >
                        검색 결과가 없습니다.
                      </td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

          </section>



          {/* =================================================
              타임라인
          ================================================== */}

          {selectedTree && (

            <section className="shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm">

              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">

                <div className="flex items-center gap-3">

                  {/* 왼쪽 : 제목 */}
                  <div className="min-w-0">

                    <div className="flex items-center gap-2">

                      <TreesIcon
                        size={18}
                        className="shrink-0 text-emerald-700"
                      />

                      <h2 className="text-base font-black text-slate-950">
                        감염목 상세 타임라인
                      </h2>

                    </div>

                    {/* 설명 : 제목 바로 밑 */}
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      해당 확진목의 타임라인과 상세 정보를 제공합니다.
                    </p>

                  </div>

                </div>


                <div className="text-right">

                  <div className="text-[10px] font-black text-slate-400">
                    선택 관리 ID
                  </div>

                  <div className="mt-0.5 text-sm font-black text-emerald-700">
                    {getDisplayManagementId(
                      selectedTree.id,
                    )}
                  </div>

                </div>

              </div>


              <div className="max-h-[300px] overflow-y-auto px-6 py-5">

                <div className="relative ml-2 border-l-2 border-slate-200 pl-7">

                  {combinedTimeline.map(
                    (item) => {



                      return (

                        <div
                          key={item.id}
                          className="relative pb-7 last:pb-0"
                        >

                          <span className="absolute -left-[36px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-600 shadow-sm" />


                          <div className="flex items-start justify-between gap-6">

                            <div className="min-w-0">

                              <div className="flex flex-wrap items-center gap-2">

                                <h3 className="text-sm font-black text-slate-900">
                                  {item.stage}
                                </h3>


                                {item.image && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleOpenTimelineImage(
                                        item.image!
                                      )
                                    }
                                    className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[10px] font-black text-white shadow-sm transition hover:bg-emerald-800"
                                  >
                                    <ImageIcon size={13} />

                                    이미지 보기
                                  </button>
                                )}

                                {item.audio && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleOpenTimelineAudio(
                                        item.audio!
                                      )
                                    }
                                    className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-[10px] font-black text-white shadow-sm transition hover:bg-sky-700"
                                  >
                                    <PlayCircle size={13} />

                                    녹음본 듣기
                                  </button>
                                )}

                              </div>


                              <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-500">
                                {item.note}
                              </p>


                              <div className="mt-2 flex flex-wrap items-center gap-2">

                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">

                                  <UserRound
                                    size={11}
                                  />

                                  {item.actor}

                                </span>


                                {item.image && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">
                                    {item.image.source ===
                                      "thermal" ||
                                      item.image.source ===
                                      "drone-visible" ? (
                                      <Bot size={11} />
                                    ) : (
                                      <Camera size={11} />
                                    )}

                                    {getImageSourceLabel(
                                      item.image.source
                                    )}
                                  </span>
                                )}

                              </div>

                            </div>


                            <div className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-400">

                              <CalendarDays
                                size={12}
                              />

                              {/* ISO와 한국어 날짜 원본을 동일한 표시 형식으로 변환 */}
                              {formatTimelineDate(
                                item.date,
                              )}

                            </div>

                          </div>

                        </div>

                      );

                    }
                  )}

                </div>

              </div>

            </section>

          )}

        </div>

        {/* ===================================================
            우측 패널
            - 신규 등록
            - AI 드론 영상
        =================================================== */}

        {controlAssignmentTree ? (

          <aside className="flex w-[500px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex h-full min-h-0 flex-col"
            >

              <div className="flex shrink-0 items-center justify-between bg-emerald-900 px-5 py-4 text-white">
                <div>
                  <div className="flex items-center gap-2">
                    <UserRound size={17} />
                    <span className="text-[10px] font-black tracking-widest">
                      CONTROL WORKER ASSIGNMENT
                    </span>
                  </div>
                  <h3 className="mt-1 text-sm font-black">
                    방제 요원 배정
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setControlAssignmentTreeId(null);
                    setControlAssignmentMessage("");
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="방제 요원 배정 패널 닫기"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
                <div className="shrink-0 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-emerald-600">
                        방제 대상 확진목
                      </p>
                      <p className="mt-1 truncate text-sm font-black text-slate-950">
                        {controlAssignmentTree.id}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        {controlAssignmentTree.region}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-emerald-700 shadow-sm">
                      배정 대기
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                    <MapPin size={13} className="text-emerald-600" />
                    {typeof controlAssignmentTree.latitude === "number" &&
                      Number.isFinite(controlAssignmentTree.latitude) &&
                      typeof controlAssignmentTree.longitude === "number" &&
                      Number.isFinite(controlAssignmentTree.longitude)
                      ? `위도 ${controlAssignmentTree.latitude.toFixed(6)}, 경도 ${controlAssignmentTree.longitude.toFixed(6)}`
                      : "위도·경도 없음 — 요원 배정 불가"}
                  </div>
                </div>

                {controlAssignmentMessage && (
                  <div className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold ${activeControlAssignment
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}>
                    {controlAssignmentMessage}
                  </div>
                )}

                {activeControlAssignment && (
                  <div className="shrink-0 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black text-slate-400">
                          현재 배정 요원
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {activeControlAssignment.workerName}
                          <span className="ml-2 text-[10px] font-bold text-slate-400">
                            {activeControlAssignment.workerId}
                          </span>
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700">
                        {activeControlAssignment.status}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] font-semibold text-slate-500">
                      {activeControlAssignment.recommendationReason}
                    </p>
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-xs font-black text-slate-900">
                        배정 가능 방제 요원
                      </p>
                      <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
                        방제 역량·가용 상태·거리 순 추천
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                      {recommendedControlWorkers.length}명
                    </span>
                  </div>

                  <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                    {isControlWorkersLoading ? (
                      <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-xs font-bold text-slate-400">
                        <LoaderCircle size={22} className="animate-spin text-emerald-600" />
                        방제 요원을 불러오는 중입니다.
                      </div>
                    ) : controlWorkersError ? (
                      <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl bg-rose-50 px-4 text-center text-xs font-bold text-rose-600">
                        {controlWorkersError}
                      </div>
                    ) : recommendedControlWorkers.length === 0 ? (
                      <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-xs font-bold text-slate-400">
                        {typeof controlAssignmentTree.latitude !== "number" ||
                          !Number.isFinite(controlAssignmentTree.latitude) ||
                          typeof controlAssignmentTree.longitude !== "number" ||
                          !Number.isFinite(controlAssignmentTree.longitude)
                          ? "확진목 좌표를 등록한 뒤 요원을 배정해 주세요."
                          : activeControlAssignment
                            ? "이 확진목에는 이미 방제 요원이 배정되었습니다."
                            : "현재 배정 가능한 방제 요원이 없습니다."}
                      </div>
                    ) : (
                      recommendedControlWorkers.map((recommendation) => {
                        const { worker } = recommendation;

                        return (
                          <div
                            key={worker.workerId}
                            className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-xs font-black text-slate-900">
                                    {worker.workerName}
                                  </p>
                                  <span className="text-[9px] font-bold text-slate-400">
                                    {worker.workerId}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">
                                  {worker.homeSidoName} {worker.homeSigunguName}
                                </p>
                                <p className="mt-1 text-[9px] font-bold text-emerald-700">
                                  방제 {recommendation.skillLevel}단계 · {recommendation.assignmentType} · {recommendation.distanceKm.toFixed(1)}km
                                </p>
                                <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
                                  잔여 {Math.round(worker.remainingMinutes)}분
                                  {worker.batteryPercent == null
                                    ? ""
                                    : ` · 배터리 ${Math.round(worker.batteryPercent)}%`}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  void handleAssignControlWorker(recommendation)
                                }
                                disabled={Boolean(activeControlAssignment)}
                                className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                              >
                                {activeControlAssignment
                                  ? "배정 완료"
                                  : "배정"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </aside>

        ) : isRegistering ? (

          <aside className="flex w-[420px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

            <motion.form
              initial={{
                opacity: 0,
                x: 20,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              onSubmit={handleRegisterTree}
              className="flex h-full min-h-0 flex-col"
            >

              {/* =========================================
                  헤더
              ========================================= */}

              <div className="flex shrink-0 items-center justify-between bg-emerald-900 px-5 py-4 text-white">

                <div>

                  <div className="flex items-center gap-2">

                    <Camera size={17} />

                    <span className="text-[10px] font-black tracking-widest">
                      NEW TREE REGISTRATION
                    </span>

                  </div>

                  <h3 className="mt-1 text-sm font-black">
                    신규 확진 고사목 등록
                  </h3>

                </div>


                {/* 닫기 */}

                <button
                  type="button"
                  onClick={() =>
                    setIsRegistering(false)
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
                >

                  <X size={18} />

                </button>

              </div>


              {/* =========================================
                  폼 내용
              ========================================= */}

              <div className="flex-1 overflow-y-auto p-5">

                <div className="space-y-4">


                  {/* =====================================
                      지역
                  ====================================== */}

                  <div>

                    <label className="mb-1 block text-xs font-bold text-slate-600">
                      지역 상세 주소
                    </label>

                    <input
                      type="text"
                      required
                      value={region}
                      onChange={(event) =>
                        setRegion(
                          event.target.value
                        )
                      }
                      placeholder="예: 경북 포항시 북구 죽장면 산42"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />

                  </div>


                  {/* =====================================
                      수종
                  ====================================== */}

                  <div>

                    <label className="mb-1 block text-xs font-bold text-slate-600">
                      수종 선택
                    </label>

                    <select
                      value={species}
                      onChange={(event) =>
                        setSpecies(
                          event.target.value as TreeRecord["species"]
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none"
                    >

                      <option value="소나무">
                        소나무
                      </option>

                      <option value="해송">
                        해송
                      </option>

                      <option value="잣나무">
                        잣나무
                      </option>

                    </select>

                  </div>


                  {/* =====================================
                      심각도
                  ====================================== */}

                  <div>

                    <label className="mb-1 block text-xs font-bold text-slate-600">
                      피해 심각 정도
                    </label>

                    <div className="flex gap-3 pt-2">

                      {[
                        "경",
                        "중",
                        "심",
                      ].map(
                        (item) => (

                          <label
                            key={item}
                            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-white"
                          >

                            <input
                              type="radio"
                              name="severity"
                              checked={
                                severity === item
                              }
                              onChange={() =>
                                setSeverity(
                                  item as TreeRecord["severity"]
                                )
                              }
                              className="accent-emerald-700"
                            />

                            {item}

                          </label>

                        )
                      )}

                    </div>

                  </div>


                  {/* =====================================
                      담당 요원
                  ====================================== */}

                  <div>

                    <label className="mb-1 block text-xs font-bold text-slate-600">
                      담당 요원
                    </label>

                    <input
                      type="text"
                      value={inspector}
                      onChange={(event) =>
                        setInspector(
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium outline-none focus:border-emerald-500"
                    />

                  </div>


                  {/* =====================================
                      좌표
                  ====================================== */}

                  <div>

                    <label className="mb-1 block text-xs font-bold text-slate-600">
                      중부 원점 좌표 (EPSG:5186)
                    </label>

                    <div className="grid grid-cols-2 gap-3">


                      {/* X */}

                      <div>

                        <div className="mb-1 text-[10px] font-bold text-slate-400">
                          X
                        </div>

                        <input
                          type="text"
                          value={gpsX}
                          onChange={(event) =>
                            setGpsX(
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-emerald-500"
                        />

                      </div>


                      {/* Y */}

                      <div>

                        <div className="mb-1 text-[10px] font-bold text-slate-400">
                          Y
                        </div>

                        <input
                          type="text"
                          value={gpsY}
                          onChange={(event) =>
                            setGpsY(
                              event.target.value
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-emerald-500"
                        />

                      </div>

                    </div>

                  </div>

                </div>

              </div>


              {/* =========================================
                  하단 버튼
              ========================================= */}

              <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white p-5">

                <button
                  type="button"
                  onClick={() =>
                    setIsRegistering(false)
                  }
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  취소
                </button>

                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-emerald-800 py-3 text-xs font-black text-white shadow-md transition hover:bg-emerald-900"
                >
                  대장 추가 등록
                </button>

              </div>

            </motion.form>

          </aside>


        ) : isImageOpen && selectedImage ? (

          /* =================================================
              저장된 이미지 상세 패널
          ================================================= */

          <aside className="flex w-[500px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

            {/* 헤더 */}
            <div className="flex shrink-0 items-center justify-between bg-emerald-900 px-5 py-4 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <ImageIcon size={17} />

                  <span className="text-[14px] font-black">
                    이미지 상세 보기
                  </span>
                </div>

                <p className="mt-1 text-[10px] font-semibold text-white/65">
                  {getImageSourceLabel(
                    selectedImage.source
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseImagePanel}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* 이미지 영역 */}
            {/* 이미지 영역 */}
            <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-slate-100">

              {/* 이미지 로딩 */}
              {isImageLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950 text-white">
                  <LoaderCircle
                    size={28}
                    className="animate-spin"
                  />

                  <p className="mt-3 text-xs font-bold">
                    이미지를 불러오는 중입니다.
                  </p>
                </div>
              )}

              {/* 이미지 오류 */}
              {imageLoadError && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950 px-6 text-center text-xs font-bold text-rose-300">
                  {imageLoadError}
                </div>
              )}

              {/* 실제 이미지 */}
              {selectedImageUrl && (
                <div className="relative h-full w-full">

                  <img
                    src={selectedImageUrl}
                    alt={selectedImage.title}
                    onLoad={(event) => {
                      const image =
                        event.currentTarget;

                      if (
                        image.naturalWidth > 0 &&
                        image.naturalHeight > 0
                      ) {
                        setDetailImageSize({
                          width:
                            image.naturalWidth,

                          height:
                            image.naturalHeight,
                        });
                      }
                    }}
                    className="absolute inset-0 h-full w-full object-fill"
                  />

                  {/* 드론 AI 탐지 박스 */}
                  {(selectedImage.source ===
                    "thermal" ||
                    selectedImage.source ===
                    "drone-visible") &&
                    selectedImage.analysisResult
                      ?.predictions.map(
                        (
                          prediction,
                          index
                        ) => {
                          /*
                           * object-contain으로 표시된 실제 이미지 크기와
                           * 상하 또는 좌우 여백을 계산합니다.
                           */
                          const containScale =
                            Math.min(
                              detailPanelWidth /
                              detailImageWidth,

                              detailPanelHeight /
                              detailImageHeight
                            );

                          const renderedWidth =
                            detailImageWidth *
                            containScale;

                          const renderedHeight =
                            detailImageHeight *
                            containScale;

                          const offsetX =
                            (
                              detailPanelWidth -
                              renderedWidth
                            ) / 2;

                          const offsetY =
                            (
                              detailPanelHeight -
                              renderedHeight
                            ) / 2;

                          /*
                           * AI 픽셀 좌표를
                           * 16:9 상세 패널의 퍼센트 좌표로 변환합니다.
                           */
                          const left =
                            (
                              (
                                prediction.x -
                                prediction.width / 2
                              ) /
                              detailImageWidth
                            ) * 100;

                          const top =
                            (
                              (
                                prediction.y -
                                prediction.height / 2
                              ) /
                              detailImageHeight
                            ) * 100;

                          const width =
                            (
                              prediction.width /
                              detailImageWidth
                            ) * 100;

                          const height =
                            (
                              prediction.height /
                              detailImageHeight
                            ) * 100;

                          const selectedIndex =
                            selectedImage
                              .analysisResult
                              ?.selectedPredictionIndex;

                          const isSelected =
                            selectedIndex ===
                            index;

                          return (
                            <div
                              key={
                                `${prediction.x}-` +
                                `${prediction.y}-` +
                                `${index}`
                              }
                              className={
                                isSelected
                                  ? "absolute rounded-md border-2 border-yellow-300 bg-yellow-300/20"
                                  : "absolute rounded-md border border-yellow-200/70 bg-yellow-300/10"
                              }
                              style={{
                                left:
                                  `${left}%`,

                                top:
                                  `${top}%`,

                                width:
                                  `${width}%`,

                                height:
                                  `${height}%`,
                              }}
                            >
                              <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-yellow-300 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                                #{index + 1}{" "}
                                {(selectedImage.source ===
                                  "drone-visible"
                                  ? actualConfidencePercent(
                                    prediction.confidence
                                  )
                                  : confidencePercent(
                                    prediction.confidence
                                  )
                                ).toFixed(1)}
                                %
                              </span>
                            </div>
                          );
                        }
                      )}
                </div>
              )}
            </div>



            {/* 상세 정보 */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5">

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  이미지 기록
                </p>

                <h3 className="mt-1 text-base font-black text-slate-900">
                  {selectedImage.title}
                </h3>

                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {new Date(
                    selectedImage.capturedAt
                  ).toLocaleString("ko-KR")}
                </p>
              </div>

              {/* 위도·경도 */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MapPin
                    size={15}
                    className="text-emerald-700"
                  />

                  <span className="text-xs font-black text-slate-700">
                    촬영 위치
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400">
                      위도
                    </p>

                    <p className="mt-1 font-mono text-sm font-black text-slate-800">
                      {selectedImage.latitude !== undefined
                        ? selectedImage.latitude.toFixed(6)
                        : "정보 없음"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold text-slate-400">
                      경도
                    </p>

                    <p className="mt-1 font-mono text-sm font-black text-slate-800">
                      {selectedImage.longitude !== undefined
                        ? selectedImage.longitude.toFixed(6)
                        : "정보 없음"}
                    </p>
                  </div>
                </div>
              </div>

              {/* 드론 AI 판독 정보 */}
              {(selectedImage.source === "thermal" ||
                selectedImage.source === "drone-visible") && (
                  <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                    <div className="flex items-center gap-2">
                      <Bot
                        size={15}
                        className="text-rose-600"
                      />

                      <span className="text-xs font-black text-rose-700">
                        {selectedImage.source === "thermal"
                          ? "AI 열화상 판독 결과"
                          : "AI 실사 비전 판독 결과"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-[9px] font-bold text-slate-400">
                          감염 신뢰도
                        </p>

                        <p className="mt-1 text-lg font-black text-rose-600">
                          {selectedImage.aiProbability ?? 0}%
                        </p>
                      </div>

                      <div className="rounded-xl bg-white p-3">
                        <p className="text-[9px] font-bold text-slate-400">
                          감염 의심목
                        </p>

                        <p className="mt-1 text-lg font-black text-slate-900">
                          {selectedImage.analysisResult
                            ?.infectedCount ?? 1}
                          개
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[11px] font-bold text-emerald-700">
                {getImageSourceLabel(
                  selectedImage.source
                )} 기록입니다.
              </div>
            </div>
          </aside>


        ) : isAudioOpen && selectedAudio ? (

          <aside className="flex w-[500px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

            {/* 헤더 */}
            <div className="flex shrink-0 items-center justify-between bg-emerald-900 px-5 py-4 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <Mic size={17} />

                  <span className="text-[14px] font-black">
                    녹음본 상세 보기
                  </span>
                </div>

                <p className="mt-1 text-[10px] font-semibold text-white/65">
                  현장관리자 STT 작업일지
                </p>
              </div>

              <button
                type="button"
                onClick={
                  handleCloseAudioPanel
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  음성 기록
                </p>

                <h3 className="mt-1 text-base font-black text-slate-900">
                  {selectedAudio.title}
                </h3>

                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {new Date(
                    selectedAudio.capturedAt
                  ).toLocaleString(
                    "ko-KR"
                  )}
                </p>
              </div>

              {/* 음성 로딩 */}
              {isAudioLoading && (
                <div className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 p-6 text-xs font-bold text-slate-500">
                  <LoaderCircle
                    size={19}
                    className="animate-spin"
                  />

                  녹음본을 불러오는 중입니다.
                </div>
              )}

              {/* 오류 */}
              {audioLoadError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-600">
                  {audioLoadError}
                </div>
              )}

              {/* 재생기 */}
              {selectedAudioUrl && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <PlayCircle
                      size={16}
                      className="text-sky-700"
                    />

                    <span className="text-xs font-black text-sky-800">
                      현장 녹음본
                    </span>
                  </div>

                  <audio
                    src={
                      selectedAudioUrl
                    }
                    controls
                    preload="metadata"
                    className="w-full"
                  />
                </div>
              )}

              {/* STT 문장 */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Mic
                    size={15}
                    className="text-emerald-700"
                  />

                  <span className="text-xs font-black text-slate-700">
                    STT 변환 작업일지
                  </span>
                </div>

                <p className="text-sm font-semibold leading-6 text-slate-700">
                  {selectedAudio.transcript ||
                    "변환된 작업일지 내용이 없습니다."}
                </p>
              </div>

              {/* 업무 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold text-slate-400">
                    업무 구분
                  </p>

                  <p className="mt-1 text-sm font-black text-slate-800">
                    {selectedAudio.workMode ===
                      "control"
                      ? "방제·시공"
                      : "예찰·조사"}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[9px] font-bold text-slate-400">
                    녹음 길이
                  </p>

                  <p className="mt-1 text-sm font-black text-slate-800">
                    {selectedAudio
                      .durationSeconds !==
                      undefined
                      ? `${selectedAudio.durationSeconds.toFixed(
                        1
                      )}초`
                      : "정보 없음"}
                  </p>
                </div>
              </div>

              {/* 위치 */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MapPin
                    size={15}
                    className="text-emerald-700"
                  />

                  <span className="text-xs font-black text-slate-700">
                    녹음 위치
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400">
                      위도
                    </p>

                    <p className="mt-1 font-mono text-sm font-black text-slate-800">
                      {selectedAudio.latitude !==
                        undefined
                        ? selectedAudio.latitude.toFixed(
                          6
                        )
                        : "정보 없음"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] font-bold text-slate-400">
                      경도
                    </p>

                    <p className="mt-1 font-mono text-sm font-black text-slate-800">
                      {selectedAudio.longitude !==
                        undefined
                        ? selectedAudio.longitude.toFixed(
                          6
                        )
                        : "정보 없음"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[11px] font-bold text-emerald-700">
                현장관리자가 등록한 음성 작업일지입니다.
              </div>
            </div>
          </aside>

        ) : isVideoOpen && selectedTree ? (






          /* =================================================
            AI 드론 열화상 일괄 분석 패널
          ================================================= */

          <aside className="flex w-[500px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">

            <div className="flex shrink-0 items-center justify-between bg-emerald-900 px-5 py-4 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <Bot size={17} />
                  <span className="text-[14px] font-black tracking-widest">
                    AI 드론 열화상 일괄 분석
                  </span>
                </div>

                <p className="mt-1 text-[10px] font-semibold text-white/65">
                  열화상 이미지를 여러 장 선택하면 자동 분석합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsVideoOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative aspect-video shrink-0 overflow-hidden bg-slate-950">
              {selectedPreviewUrl ? (
                <div className="relative h-full w-full">
                  <img
                    src={selectedPreviewUrl}
                    alt={
                      selectedThermalInput?.file.name ??
                      "드론 열화상 이미지"
                    }
                    className="h-full w-full object-fill"
                  />

                  {selectedResult?.predictions.map(
                    (prediction, index) => {
                      const imageWidth =
                        selectedResult.image?.width ?? 1;

                      const imageHeight =
                        selectedResult.image?.height ?? 1;

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
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-black text-white">
                        Supabase Storage 업로드 중...
                      </div>
                    )}

                  {selectedProcess?.status ===
                    "analyzing" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-black text-white">
                        Roboflow AI 분석 중...
                      </div>
                    )}

                  {selectedThermalInput && (
                    <div className="absolute right-3 top-3 rounded-xl border border-white/10 bg-black/65 p-2.5 font-mono text-[9px] text-white backdrop-blur-sm">
                      <div>
                        ALT {selectedThermalInput.gps.altitude.toFixed(1)}m
                      </div>
                      <div>
                        LAT {selectedThermalInput.gps.latitude.toFixed(6)}
                      </div>
                      <div>
                        LNG {selectedThermalInput.gps.longitude.toFixed(6)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-400">
                  <Thermometer
                    size={40}
                    className="mb-3 opacity-70"
                  />
                  <p className="text-xs font-black">
                    열화상 이미지 묶음을 선택해 주세요.
                  </p>
                  <p className="mt-1 text-[10px] font-semibold">
                    JPG, PNG, WEBP 다중 선택 지원
                  </p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      분석 대상 확진목
                    </div>
                    <div className="mt-1 truncate text-sm font-black text-slate-950">
                      {getDisplayManagementId(
                        selectedTree.id,
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 truncate text-[10px] font-semibold text-slate-500">
                      <MapPin size={12} />
                      {selectedTree.region}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${getSeverityClass(
                      selectedTree.severity,
                    )}`}
                  >
                    심각도 {selectedTree.severity}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="block text-[11px] font-black text-slate-600">
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

                <p className="text-[9px] font-semibold leading-relaxed text-slate-400">
                  파일 선택 직후 Storage 업로드와 AI 분석이 자동으로 시작됩니다.
                </p>
              </div>

              {batchProgress.total > 0 && (
                <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between text-[10px] font-black">
                    <span className="text-slate-500">
                      일괄 분석 진행률
                    </span>
                    <span className="font-mono text-emerald-700">
                      {batchProgress.completed}/
                      {batchProgress.total}
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
                      <p className="text-[9px] font-black text-slate-400">
                        업로드 이미지
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-900">
                        {thermalInputs.length}장
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <p className="text-[9px] font-black text-slate-400">
                        감염 의심목 합계
                      </p>
                      <p className="mt-1 text-lg font-black text-rose-600">
                        {totalInfectedCount}개
                      </p>
                    </div>
                  </div>

                  {isBatchAnalyzing && (
                    <p className="text-center text-[9px] font-black text-amber-600">
                      이미지를 한 장씩 순차 분석하고 있습니다.
                    </p>
                  )}
                </div>
              )}

              {batchError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] font-bold leading-relaxed text-rose-700">
                  분석 오류: {batchError}
                </div>
              )}

              {thermalInputs.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    파일별 분석 결과
                  </div>

                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {thermalInputs.map((item, index) => {
                      const process =
                        thermalProcessById[item.id];
                      const result = process?.result;

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
                          className={`w-full rounded-xl border p-3 text-left transition ${selectedThermalId === item.id
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-black text-slate-800">
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
                                  item.gps.capturedAt,
                                ).toLocaleTimeString("ko-KR")}
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

              {selectedResult && (
                <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-600">
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
                      <p className="text-[9px] font-black text-slate-400">
                        감염 의심목
                      </p>
                      <p className="mt-1 text-xl font-black text-slate-900">
                        {selectedResult.infectedCount}개
                      </p>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[9px] font-black text-slate-400">
                        최고 신뢰도
                      </p>
                      <p className="mt-1 text-xl font-black text-rose-600">
                        {selectedResult.predictions.length > 0
                          ? Math.max(
                            ...selectedResult.predictions.map(
                              (prediction) =>
                                confidencePercent(
                                  prediction.confidence,
                                ),
                            ),
                          ).toFixed(1)
                          : "0.0"}
                        %
                      </p>
                    </div>
                  </div>

                  {selectedResult.status === "NORMAL" ? (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[10px] font-bold text-emerald-700">
                      열 이상 의심목이 탐지되지 않았습니다.
                    </div>
                  ) : (
                    <div className="max-h-40 space-y-2 overflow-y-auto">
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
                              중심 픽셀: ({prediction.x.toFixed(1)}, {" "}
                              {prediction.y.toFixed(1)})
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>

        ) : null}

      </div>

    </div>
  );
}

