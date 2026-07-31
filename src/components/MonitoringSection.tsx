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
  | "thermal";

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
    newStatus:
      TreeRecord["status"]
  ) => void;
}

export default function MonitoringSection({
  trees,
  fieldPhotos,
  fieldVoiceLogs,
  onAddTree,
  onUpdateTreeStatus,
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


  // =========================================================
  // 선택된 감염목
  // =========================================================

  const [selectedTreeId, setSelectedTreeId] =
    useState<string | null>(
      trees[0]?.id ?? null
    );


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

  const selectedTreeFieldPhotos =
    selectedTree?.sourceReportId
      ? fieldPhotos.filter(
        photo =>
          photo.relatedRecordId ===
          selectedTree.sourceReportId
      )
      : [];

  const selectedTreeVoiceLogs =
    useMemo(
      () => {
        if (
          !selectedTree
            ?.sourceReportId
        ) {
          return [];
        }

        return fieldVoiceLogs.filter(
          log =>
            log.relatedRecordId ===
            selectedTree
              .sourceReportId &&
            log.sttStatus ===
            "completed"
        );
      },
      [
        selectedTree
          ?.sourceReportId,
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

      return items.sort(
        (first, second) => {
          const firstTime =
            new Date(
              first.date
            ).getTime();

          const secondTime =
            new Date(
              second.date
            ).getTime();

          const safeFirst =
            Number.isNaN(firstTime)
              ? 0
              : firstTime;

          const safeSecond =
            Number.isNaN(secondTime)
              ? 0
              : secondTime;

          return (
            safeSecond - safeFirst
          );
        }
      );
    }, [
      selectedTree,
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

        tree.region
          .toLowerCase()
          .includes(keyword) ||

        tree.species
          .toLowerCase()
          .includes(keyword)
      );

    });


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

      status: "예찰의심",

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

    if (status === "확진완료") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }

    if (status === "방제중") {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }

    return "bg-slate-50 text-slate-700 border-slate-200";

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

    <div className="flex min-h-0 flex-col gap-4">

      {/* =====================================================
          메인 영역
          좌측 : 목록 + 타임라인
          우측 : 영상 패널
      ====================================================== */}

      <div className="flex min-h-0 flex-1 gap-4">


        {/* ===================================================
            좌측
        ==================================================== */}

        <div
          className={
            isVideoOpen
              ? "flex min-w-0 flex-1 flex-col gap-4"
              : "flex min-w-0 flex-1 flex-col gap-4"
          }
        >


          {/* =================================================
              확진목 리스트 Header
          ================================================== */}

          <section className="min-h-[300px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <header className="border-b border-slate-200 bg-white px-5 py-4">

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


                  {/* AI 드론 분석 */}

                  <button
                    type="button"
                    onClick={() => {
                      setIsVideoOpen(true);
                      setIsRegistering(false);

                      setIsImageOpen(false);
                      setSelectedImage(null);
                    }}
                    className="flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <Bot size={16} />
                    AI 드론 분석
                  </button>


                  {/* 신규 등록 */}

                  <button
                    type="button"
                    onClick={() => {
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

            <div className="h-full overflow-y-auto">

              <table className="w-full border-collapse">

                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white">

                  <tr>

                    <th className="px-5 py-3 text-left text-[11px] font-black text-slate-500">
                      관리 ID
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

                  </tr>

                </thead>


                <tbody>

                  {filteredTrees.map(
                    (tree) => {

                      const selected =
                        selectedTreeId ===
                        tree.id;

                      return (

                        <tr
                          key={tree.id}
                          onClick={() => {
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

                          <td className="px-5 py-4">

                            <div className="flex items-center gap-2">

                              {selected && (
                                <span className="h-7 w-1 rounded-full bg-emerald-600" />
                              )}

                              <span className="text-sm font-black text-emerald-700">
                                {tree.id}
                              </span>

                            </div>

                          </td>


                          <td className="px-5 py-4 text-xs font-semibold text-slate-700">
                            {tree.region}
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

                            <select
                              value={
                                tree.status
                              }
                              onChange={(event) =>
                                onUpdateTreeStatus(
                                  tree.id,
                                  event.target.value as TreeRecord["status"]
                                )
                              }
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                              className={`rounded-lg border px-3 py-1.5 text-[10px] font-black outline-none ${getStatusClass(
                                tree.status
                              )}`}
                            >

                              <option value="예찰의심">
                                예찰의심
                              </option>

                              <option value="현장확인">
                                현장확인
                              </option>

                              <option value="시료검사">
                                시료검사
                              </option>

                              <option value="확진완료">
                                확진완료
                              </option>

                              <option value="방제대기">
                                방제대기
                              </option>

                              <option value="방제중">
                                방제중
                              </option>

                              <option value="방제완료">
                                방제완료
                              </option>

                              <option value="사후관리">
                                사후관리
                              </option>

                            </select>

                          </td>

                        </tr>

                      );

                    }
                  )}


                  {filteredTrees.length === 0 && (

                    <tr>

                      <td
                        colSpan={5}
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
                    {selectedTree.id}
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
                                      "thermal" ? (
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

                              {item.date}

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

        {isRegistering ? (

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

                  {/* 열화상 AI 탐지 박스 */}
                  {selectedImage.source ===
                    "thermal" &&
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
                                {confidencePercent(
                                  prediction.confidence
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

              {/* 열화상 AI 정보 */}
              {selectedImage.source === "thermal" && (
                <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                  <div className="flex items-center gap-2">
                    <Bot
                      size={15}
                      className="text-rose-600"
                    />

                    <span className="text-xs font-black text-rose-700">
                      AI 열화상 판독 결과
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
                    {selectedTree.id}
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

