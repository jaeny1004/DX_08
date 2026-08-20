/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL as string;

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다."
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
import { motion, AnimatePresence } from "motion/react";
import {
  TreePine,
  MessageSquare,
  X,
  LayoutDashboard,
  Radar,
  Footprints,
  ShieldCheck,
  ClipboardCheck,
  FileText,
  Settings,
  FlaskConical,
  AlertTriangle,
  PanelLeftOpen,
  PanelLeftClose,
  Clock3,
  MapPinned,
  Radio,
  LogOut,
  Search,
  Plus,
  ChevronDown,
  History,
  Video,
  PlayCircle,
  MapPin,
  Bot,
  UserRound,
  CalendarDays,
  ShieldAlert,
  HomeIcon,
  TreesIcon,
  VideoIcon,
  MemoryStickIcon,
  FileUpIcon,
  ShieldOffIcon,
  ShieldHalfIcon,
  Camera,
  Download // lucide-react에서 Download 아이콘 추가 임포트
} from "lucide-react";

import Dashboard from "./components/Dashboard";
import MonitoringSection from "./components/MonitoringSection";
import FieldSection from "./components/FieldSection";
import ThermalAnalysisSection from "./components/ThermalAnalysisSection";
import DroneVisionAnalysisSection from "./components/DroneVisionAnalysisSection";
import ControlSection from "./components/ControlSection";
import SpreadSimulationCA from "./components/SpreadSimulationCA";
//import SimulationSection from "./components/SimulationSection";
import AdminSection from "./components/AdminSection";
import Chatbot from "./components/Chatbot";
import AuthScreen from "./components/auth/AuthScreen";

// 신규 DownloadPage 컴포넌트 임포트
import DownloadPage from "./DownloadPage";

import {
  getAccessToken,
  getCurrentUser,
  logout,
} from "./services/authApi";

import {
  AuthUser,
} from "./types/auth";

import {
  initialGrids,
  GridCell,
  FieldPhotoRecord,
  FieldVoiceLogRecord,
  TreeRecord,
  TreeWorkflowStatus,
  WorkerStatus,
  CrowdReport,
  ControlTask,
} from "./types";

import {
  DispatchAssignment,
  DispatchStatus,
} from "./types/dispatch";

const FIELD_DISPATCH_STATUS_SET = new Set<TreeWorkflowStatus>([
  "배정 대기",
  "배정 수락",
  "출동",
  "현장 도착",
  "작업 중",
  "작업 완료",
]);

function isTreeWorkflowStatus(
  status: DispatchStatus,
): status is TreeWorkflowStatus {
  return FIELD_DISPATCH_STATUS_SET.has(
    status as TreeWorkflowStatus,
  );
}
type PineRecordRow = {
  id: string | number;
  created_at?: string | null;
  phone_number?: string | null;
  reporter?: string | null;
  status?: string | null;
  dashboard_status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string | null;
  ai_probability?: number | null;
  ai_label?: string | null;
  ai_status?: string | null;
};

type ConfirmedTreeRow = {
  id: string;
  region: string;
  species: string;
  confirmed_date: string;
  status: string;
  severity: string;
  x: number;
  y: number;
  inspector: string;
  timeline: TreeRecord["timeline"] | null;

  source_report_id?: string | null;
  ai_probability?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string | null;
  image_source?:
  TreeRecord["imageSource"] | null;

  image_bucket?: string | null;
  image_path?: string | null;

  analysis_result?:
  TreeRecord["analysisResult"] | null;
};

type FieldPhotoRow = {
  id: string | number;

  work_mode:
  | "surveillance"
  | "control";

  related_record_id:
  string | number;

  storage_path: string;

  latitude:
  number | null;

  longitude:
  number | null;

  altitude?:
  number | null;

  captured_at:
  string;

  created_at?:
  string | null;

  uploader_id?:
  string | null;

  note?:
  string | null;
};

type FieldVoiceLogRow = {
  id: string | number;

  work_mode:
  | "surveillance"
  | "control";

  related_record_id:
  string | number;

  storage_bucket:
  string | null;

  storage_path:
  string;

  mime_type?:
  string | null;

  duration_seconds?:
  number | null;

  transcript?:
  string | null;

  stt_status:
  | "processing"
  | "completed"
  | "error";

  stt_error?:
  string | null;

  latitude?:
  number | null;

  longitude?:
  number | null;

  captured_at:
  string;

  created_at?:
  string | null;

  uploader_id?:
  string | null;

  note?:
  string | null;
};

type DispatchAssignmentRow = {
  assignment_id: string;
  worker_id: string;
  worker_name: string;
  worker_type: DispatchAssignment["workerType"];
  task_type: DispatchAssignment["taskType"];
  worker_capabilities: DispatchAssignment["workerCapabilities"] | null;
  assigned_skill_level: number;
  home_sido_name: string;
  home_sigungu_code: string;
  home_sigungu_name: string;
  target_sido_name: string;
  target_sigungu_code: string;
  target_sigungu_name: string;
  target_emd_code: string;
  target_emd_name: string;
  grid_id: string;
  target_latitude: number | null;
  target_longitude: number | null;
  priority_grade: string;
  risk_grade: string;
  risk_score: number;
  access_score: number;
  distance_km: number | null;
  travel_time_hour: number | null;
  battery_percent: number | null;
  remaining_minutes_at_assignment: number;
  recommendation_reason: string;
  assignment_type: DispatchAssignment["assignmentType"];
  status: DispatchStatus;
  assigned_at: string;
  accepted_at: string | null;
  departed_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  field_latitude: number | null;
  field_longitude: number | null;
  gps_marked_at: string | null;
  sample_qr_code: string | null;
  sample_qr_scanned_at: string | null;
  chemical_qr_code: string | null;
  chemical_qr_scanned_at: string | null;
};

function mapDispatchRow(
  row: DispatchAssignmentRow
): DispatchAssignment {
  return {
    assignmentId: row.assignment_id,
    workerId: row.worker_id,
    workerName: row.worker_name,
    workerType: row.worker_type,
    taskType: row.task_type,
    workerCapabilities: Array.isArray(row.worker_capabilities)
      ? row.worker_capabilities
      : [],
    assignedSkillLevel: Number(row.assigned_skill_level ?? 0),
    homeSidoName: row.home_sido_name ?? "",
    homeSigunguCode: row.home_sigungu_code ?? "",
    homeSigunguName: row.home_sigungu_name ?? "",
    targetSidoName: row.target_sido_name ?? "",
    targetSigunguCode: row.target_sigungu_code ?? "",
    targetSigunguName: row.target_sigungu_name ?? "",
    targetEmdCode: row.target_emd_code ?? "",
    targetEmdName: row.target_emd_name ?? "",
    gridId: row.grid_id,
    targetLatitude:
      row.target_latitude === null ? undefined : Number(row.target_latitude),
    targetLongitude:
      row.target_longitude === null ? undefined : Number(row.target_longitude),
    priorityGrade: row.priority_grade ?? "",
    riskGrade: row.risk_grade ?? "",
    riskScore: Number(row.risk_score ?? 0),
    accessScore: Number(row.access_score ?? 0),
    distanceKm:
      row.distance_km === null ? null : Number(row.distance_km),
    travelTimeHour:
      row.travel_time_hour === null ? null : Number(row.travel_time_hour),
    batteryPercent:
      row.battery_percent === null ? null : Number(row.battery_percent),
    remainingMinutesAtAssignment: Number(
      row.remaining_minutes_at_assignment ?? 0
    ),
    recommendationReason: row.recommendation_reason ?? "",
    assignmentType: row.assignment_type,
    status: row.status,
    assignedAt: row.assigned_at,
    acceptedAt: row.accepted_at,
    departedAt: row.departed_at,
    arrivedAt: row.arrived_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    fieldLatitude:
      row.field_latitude === null ? undefined : Number(row.field_latitude),
    fieldLongitude:
      row.field_longitude === null ? undefined : Number(row.field_longitude),
    gpsMarkedAt: row.gps_marked_at,
    sampleQrCode: row.sample_qr_code,
    sampleQrScannedAt: row.sample_qr_scanned_at,
    chemicalQrCode: row.chemical_qr_code,
    chemicalQrScannedAt: row.chemical_qr_scanned_at,
  };
}

function mapDispatchAssignment(
  assignment: DispatchAssignment
) {
  return {
    assignment_id: assignment.assignmentId,
    worker_id: assignment.workerId,
    worker_name: assignment.workerName,
    worker_type: assignment.workerType,
    task_type: assignment.taskType,
    worker_capabilities: assignment.workerCapabilities,
    assigned_skill_level: assignment.assignedSkillLevel,
    home_sido_name: assignment.homeSidoName,
    home_sigungu_code: assignment.homeSigunguCode,
    home_sigungu_name: assignment.homeSigunguName,
    target_sido_name: assignment.targetSidoName,
    target_sigungu_code: assignment.targetSigunguCode,
    target_sigungu_name: assignment.targetSigunguName,
    target_emd_code: assignment.targetEmdCode,
    target_emd_name: assignment.targetEmdName,
    grid_id: assignment.gridId,
    target_latitude: assignment.targetLatitude ?? null,
    target_longitude: assignment.targetLongitude ?? null,
    priority_grade: assignment.priorityGrade,
    risk_grade: assignment.riskGrade,
    risk_score: assignment.riskScore,
    access_score: assignment.accessScore,
    distance_km: assignment.distanceKm,
    travel_time_hour: assignment.travelTimeHour,
    battery_percent: assignment.batteryPercent,
    remaining_minutes_at_assignment:
      assignment.remainingMinutesAtAssignment,
    recommendation_reason: assignment.recommendationReason,
    assignment_type: assignment.assignmentType,
    status: assignment.status,
    assigned_at: assignment.assignedAt,
    accepted_at: assignment.acceptedAt ?? null,
    departed_at: assignment.departedAt ?? null,
    arrived_at: assignment.arrivedAt ?? null,
    started_at: assignment.startedAt ?? null,
    completed_at: assignment.completedAt ?? null,
    field_latitude: assignment.fieldLatitude ?? null,
    field_longitude: assignment.fieldLongitude ?? null,
    gps_marked_at: assignment.gpsMarkedAt ?? null,
    sample_qr_code: assignment.sampleQrCode ?? null,
    sample_qr_scanned_at: assignment.sampleQrScannedAt ?? null,
    chemical_qr_code: assignment.chemicalQrCode ?? null,
    chemical_qr_scanned_at: assignment.chemicalQrScannedAt ?? null,
  };
}

function mapConfirmedTreeRowToTreeRecord(
  row: ConfirmedTreeRow
): TreeRecord {
  return {
    id: row.id,
    region: row.region,
    species: row.species as TreeRecord["species"],
    confirmedDate: row.confirmed_date,
    status: row.status as TreeRecord["status"],
    severity: row.severity as TreeRecord["severity"],
    x: Number(row.x ?? 0),
    y: Number(row.y ?? 0),
    inspector: row.inspector,
    timeline: Array.isArray(row.timeline)
      ? row.timeline
      : [],

    sourceReportId:
      row.source_report_id || undefined,

    aiProbability:
      row.ai_probability === null ||
        row.ai_probability === undefined
        ? undefined
        : Number(row.ai_probability),

    latitude:
      row.latitude === null ||
        row.latitude === undefined
        ? undefined
        : Number(row.latitude),

    longitude:
      row.longitude === null ||
        row.longitude === undefined
        ? undefined
        : Number(row.longitude),

    imageUrl:
      row.image_url || undefined,

    imageSource:
      row.image_source || undefined,

    imageBucket:
      row.image_bucket || undefined,

    imagePath:
      row.image_path || undefined,

    analysisResult:
      row.analysis_result || undefined,
  };
}

function mapFieldPhotoRowToRecord(
  row: FieldPhotoRow
): FieldPhotoRecord {
  return {
    id:
      String(row.id),

    workMode:
      row.work_mode,

    relatedRecordId:
      String(
        row.related_record_id
      ),

    storagePath:
      row.storage_path,

    latitude:
      Number(
        row.latitude ?? 0
      ),

    longitude:
      Number(
        row.longitude ?? 0
      ),

    altitude:
      row.altitude === null ||
        row.altitude === undefined
        ? undefined
        : Number(row.altitude),

    capturedAt:
      row.captured_at,

    createdAt:
      row.created_at || undefined,

    uploaderId:
      row.uploader_id || undefined,

    note:
      row.note || undefined,
  };
}

function mapFieldVoiceLogRowToRecord(
  row: FieldVoiceLogRow
): FieldVoiceLogRecord {
  return {
    id:
      String(row.id),

    workMode:
      row.work_mode,

    relatedRecordId:
      String(
        row.related_record_id
      ),

    storageBucket:
      row.storage_bucket ||
      "field-audio",

    storagePath:
      row.storage_path,

    mimeType:
      row.mime_type ||
      undefined,

    durationSeconds:
      row.duration_seconds ===
        null ||
        row.duration_seconds ===
        undefined
        ? undefined
        : Number(
          row.duration_seconds
        ),

    transcript:
      row.transcript ||
      undefined,

    sttStatus:
      row.stt_status,

    sttError:
      row.stt_error ||
      undefined,

    latitude:
      row.latitude === null ||
        row.latitude === undefined
        ? undefined
        : Number(row.latitude),

    longitude:
      row.longitude === null ||
        row.longitude === undefined
        ? undefined
        : Number(row.longitude),

    capturedAt:
      row.captured_at,

    createdAt:
      row.created_at ||
      undefined,

    uploaderId:
      row.uploader_id ||
      undefined,

    note:
      row.note ||
      undefined,
  };
}

function mapPineStatusToCrowdStatus(
  status: string | null | undefined
): CrowdReport["status"] {
  switch (status) {
    case "pending":
      return "접수 완료";

    case "in_progress":
      return "조사 완료";

    case "completed":
      return "방제 완료";

    case "rejected":
      return "반려";

    default:
      return "접수 완료";
  }
}

function mapPineRecordToCrowdReport(
  row: PineRecordRow
): CrowdReport {
  const latitude =
    row.latitude === null || row.latitude === undefined
      ? undefined
      : Number(row.latitude);

  const longitude =
    row.longitude === null || row.longitude === undefined
      ? undefined
      : Number(row.longitude);

  return {
    id: String(row.id),

    reporter:
      row.reporter ||
      row.phone_number ||
      "시민 제보자",

    date: row.created_at
      ? new Date(row.created_at)
        .toISOString()
        .split("T")[0]
      : new Date()
        .toISOString()
        .split("T")[0],

    title: "시민 모바일 신고 건",

    region:
      latitude !== undefined &&
        longitude !== undefined
        ? `위도 ${latitude.toFixed(6)}, 경도 ${longitude.toFixed(6)}`
        : "위치 정보 미확인",

    description:
      "모바일 신고 앱에서 접수된 시민 제보입니다.",

    status:
      mapPineStatusToCrowdStatus(
        row.status
      ),

    aiProbability:
      Number(row.ai_probability ?? 0),

    photoUrl:
      row.image_url || "",

    latitude,
    longitude,

    phone_number:
      row.phone_number || undefined,

    created_at:
      row.created_at || undefined,
  };
}

// ModuleId 타입정의에 'download' 모듈 추가
type ModuleId =
  | "dashboard"
  | "monitoring"
  | "field"
  | "thermal-analysis"
  | "drone-vision-analysis"
  | "control"
  | "control-status"
  | "control-work"
  | "admin-report"
  | "admin-species"
  | "download";

const LIVE_ALERT_GROUPS = [
  [
    {
      id: "ALERT-G1-01",
      time: "9:12",
      title: "신규 시민 의심목 신고 접수",
      description:
        "시민 신고를 통해 신규 감염 의심목 사진과 위치 정보가 접수됐습니다.",
      tone: "danger" as const,
      icon: Radio,
    },
    {
      id: "ALERT-G1-02",
      time: "10:35",
      title: "AI 위험도 분석 완료",
      description:
        "접수된 의심목 이미지와 대상 격자의 AI 위험도 분석이 완료됐습니다.",
      tone: "info" as const,
      icon: Bot,
    },
    {
      id: "ALERT-G1-03",
      time: "11:47",
      title: "고위험 후보 격자 위험도 상승",
      description:
        "신규 확산위험 후보지역의 위험도가 상승해 우선 예찰 검토가 필요합니다.",
      tone: "danger" as const,
      icon: AlertTriangle,
    },
    {
      id: "ALERT-G1-04",
      time: "13:20",
      title: "현장 확인 결과 입력 대기",
      description:
        "현장 예찰을 마친 대상의 확인 결과와 활동보고서 입력을 기다리고 있습니다.",
      tone: "info" as const,
      icon: Clock3,
    },
    {
      id: "ALERT-G1-05",
      time: "14:56",
      title: "접근 취약지역 드론 예찰 검토",
      description:
        "도로 접근성이 낮은 후보지역에 대한 드론 사전 예찰 검토가 요청됐습니다.",
      tone: "warning" as const,
      icon: MapPinned,
    },
    {
      id: "ALERT-G1-06",
      time: "16:18",
      title: "방제 작업 결과 업로드 완료",
      description:
        "현장 방제 작업 결과와 증빙 자료가 통합 관제 시스템에 등록됐습니다.",
      tone: "info" as const,
      icon: FileUpIcon,
    },
  ],
  [
    {
      id: "ALERT-G2-01",
      time: "8:54",
      title: "예찰 일정 자동 생성 완료",
      description:
        "위험도와 현장 접근성을 반영한 당일 예찰 일정이 자동 생성됐습니다.",
      tone: "info" as const,
      icon: CalendarDays,
    },
    {
      id: "ALERT-G2-02",
      time: "10:12",
      title: "드론 촬영 데이터 업로드 완료",
      description:
        "예찰 대상지역의 드론 촬영 원본 데이터가 분석 저장소에 업로드됐습니다.",
      tone: "info" as const,
      icon: Camera,
    },
    {
      id: "ALERT-G2-03",
      time: "11:39",
      title: "감염 의심목 AI 분석 요청",
      description:
        "신규 드론 이미지에서 확인된 감염 의심목에 대한 AI 분석이 요청됐습니다.",
      tone: "danger" as const,
      icon: Bot,
    },
    {
      id: "ALERT-G2-04",
      time: "13:58",
      title: "현장 작업자 위치 동기화 완료",
      description:
        "출동 중인 현장 작업자의 최근 위치와 작업 상태가 동기화됐습니다.",
      tone: "info" as const,
      icon: MapPinned,
    },
    {
      id: "ALERT-G2-05",
      time: "15:21",
      title: "방제 이력 DB 업데이트 완료",
      description:
        "확진목별 방제 작업 이력과 처리 상태가 데이터베이스에 반영됐습니다.",
      tone: "warning" as const,
      icon: MemoryStickIcon,
    },
    {
      id: "ALERT-G2-06",
      time: "17:03",
      title: "행정 보고서 초안 자동 생성",
      description:
        "예찰·분석·방제 결과를 반영한 행정 보고서 초안이 자동 생성됐습니다.",
      tone: "info" as const,
      icon: FileText,
    },
  ],
  [
    {
      id: "ALERT-G3-01",
      time: "9:43",
      title: "수종 전환 후보지 분석 시작",
      description:
        "피해지의 기후·토양·고도 조건을 반영한 수종 전환 후보지 분석을 시작했습니다.",
      tone: "warning" as const,
      icon: TreesIcon,
    },
    {
      id: "ALERT-G3-02",
      time: "11:08",
      title: "수종 전환 적합 수종 추천 완료",
      description:
        "대상 격자의 입지 조건과 지역 분포를 반영한 적합 수종 추천이 완료됐습니다.",
      tone: "info" as const,
      icon: TreePine,
    },
    {
      id: "ALERT-G3-03",
      time: "13:46",
      title: "사업 계획 초안 생성 완료",
      description:
        "선정 지역의 수종 전환 방향과 개략 예산을 포함한 사업 계획 초안이 생성됐습니다.",
      tone: "info" as const,
      icon: ClipboardCheck,
    },
    {
      id: "ALERT-G3-04",
      time: "15:14",
      title: "RAG 기반 행정 질의 응답 처리",
      description:
        "등록된 산림 행정 문서와 지침을 근거로 행정 질의 응답을 처리했습니다.",
      tone: "info" as const,
      icon: MessageSquare,
    },
    {
      id: "ALERT-G3-05",
      time: "16:37",
      title: "확진목 추가 등록 및 타임라인 갱신",
      description:
        "신규 확진목이 등록되고 판독·전환 이력이 상세 타임라인에 반영됐습니다.",
      tone: "danger" as const,
      icon: TreePine,
    },
    {
      id: "ALERT-G3-06",
      time: "18:02",
      title: "산림행정기관 검토 요청 전송",
      description:
        "생성된 분석 결과와 행정 자료에 대한 담당 기관 검토 요청을 전송했습니다.",
      tone: "warning" as const,
      icon: FileUpIcon,
    },
  ],
];

export default function App() {
  const [activeModule, setActiveModule] =
    useState<ModuleId>("dashboard");

  const [liveAlerts] = useState(() => {
    const randomGroupIndex = Math.floor(
      Math.random() * LIVE_ALERT_GROUPS.length
    );

    return LIVE_ALERT_GROUPS[randomGroupIndex];
  });

  const [grids] =
    useState<GridCell[]>(initialGrids);

  const [trees, setTrees] =
    useState<TreeRecord[]>([]);

  const handleAddTree = (
    newTree: TreeRecord
  ) => {
    setTrees((previous) => {
      const exists = previous.some(
        (tree) => tree.id === newTree.id
      );

      return exists
        ? previous
        : [newTree, ...previous];
    });

    void (async () => {
      const { error } = await supabase
        .from("confirmed_trees")
        .insert({
          id: newTree.id,
          region: newTree.region,
          species: newTree.species,
          confirmed_date:
            newTree.confirmedDate,
          status: newTree.status,
          severity: newTree.severity,
          x: newTree.x,
          y: newTree.y,
          inspector: newTree.inspector,
          timeline: newTree.timeline,

          source_report_id:
            newTree.sourceReportId ?? null,

          ai_probability:
            newTree.aiProbability ?? null,

          latitude:
            newTree.latitude ?? null,

          longitude:
            newTree.longitude ?? null,

          image_url:
            newTree.imageUrl ?? null,

          image_source:
            newTree.imageSource ?? null,

          image_bucket:
            newTree.imageBucket ?? null,

          image_path:
            newTree.imagePath ?? null,

          analysis_result:
            newTree.analysisResult ?? null,
        });

      if (error) {
        console.error(
          "확진목 저장 실패:",
          error
        );

        setTrees((previous) =>
          previous.filter(
            (tree) =>
              tree.id !== newTree.id
          )
        );

        window.alert(
          "확진목을 저장하지 못했습니다."
        );
      }
    })();
  };

  const [workers, setWorkers] =
    useState<WorkerStatus[]>([]);

  const [tasks, setTasks] =
    useState<ControlTask[]>([]);

  const [reports, setReports] =
    useState<CrowdReport[]>([]);

  const [
    fieldPhotos,
    setFieldPhotos,
  ] = useState<FieldPhotoRecord[]>([]);

  const [fieldPhotoUrls, setFieldPhotoUrls] =
    useState<Record<string, string>>({});

  const [
    fieldVoiceLogs,
    setFieldVoiceLogs,
  ] = useState<FieldVoiceLogRecord[]>([]);



  const [selectedGrid, setSelectedGrid] =
    useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    if (fieldPhotos.length === 0) {
      setFieldPhotoUrls({});
      return () => {
        cancelled = true;
      };
    }

    const loadSignedUrls = async () => {
      const entries = await Promise.all(
        fieldPhotos.map(async photo => {
          const { data, error } = await supabase.storage
            .from("field-photos")
            .createSignedUrl(photo.storagePath, 60 * 60);

          if (error || !data?.signedUrl) {
            console.warn(
              "예찰 현장사진 Signed URL 생성 실패:",
              photo.storagePath,
              error
            );
            return null;
          }

          return [photo.storagePath, data.signedUrl] as const;
        })
      );

      if (cancelled) return;

      setFieldPhotoUrls(
        Object.fromEntries(
          entries.filter(
            (entry): entry is readonly [string, string] => entry !== null
          )
        )
      );
    };

    void loadSignedUrls();

    return () => {
      cancelled = true;
    };
  }, [fieldPhotos]);

  const [
    dispatchAssignments,
    setDispatchAssignments,
  ] = useState<DispatchAssignment[]>([]);

  useEffect(() => {
    let active = true;

    const fetchDispatchAssignments = async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("*")
        .order("assigned_at", { ascending: false });

      if (error) {
        console.error("현장 업무 배정 목록 조회 실패:", error);
        return;
      }

      if (active) {
        setDispatchAssignments(
          ((data ?? []) as DispatchAssignmentRow[]).map(mapDispatchRow)
        );
      }
    };

    void fetchDispatchAssignments();

    const channel = supabase
      .channel("dashboard-dispatch-assignments")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatch_assignments",
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String(
              (payload.old as { assignment_id?: string }).assignment_id ?? ""
            );
            setDispatchAssignments((previous) =>
              previous.filter((item) => item.assignmentId !== deletedId)
            );
            return;
          }

          const changed = mapDispatchRow(
            payload.new as DispatchAssignmentRow
          );

          setDispatchAssignments((previous) => {
            const exists = previous.some(
              (item) => item.assignmentId === changed.assignmentId
            );

            return exists
              ? previous.map((item) =>
                item.assignmentId === changed.assignmentId
                  ? changed
                  : item
              )
              : [changed, ...previous];
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  /*
   * 모바일 앱은 dispatch_assignments의 진행 상태를 변경합니다.
   * 확진목 목록은 confirmed_trees.status를 표시하므로, 방제(CONTROL)
   * 배정의 최신 상태를 확진목 상태와 타임라인에도 동기화합니다.
   *
   * Realtime 이벤트를 놓쳤더라도 다음 목록 조회 시 다시 맞춰집니다.
   */
  useEffect(() => {
    const latestControlByTreeId = new Map<
      string,
      DispatchAssignment & {
        status: TreeWorkflowStatus;
      }
    >();

    dispatchAssignments.forEach((assignment) => {
      if (
        assignment.taskType !== "CONTROL" ||
        !isTreeWorkflowStatus(assignment.status) ||
        latestControlByTreeId.has(assignment.gridId)
      ) {
        return;
      }

      latestControlByTreeId.set(
        assignment.gridId,
        assignment as DispatchAssignment & {
          status: TreeWorkflowStatus;
        },
      );
    });

    const changes = trees.flatMap((tree) => {
      const assignment = latestControlByTreeId.get(tree.id);

      if (!assignment || tree.status === assignment.status) {
        return [];
      }

      const timeline = [
        ...tree.timeline,
        {
          stage: `상태 변경: ${assignment.status}`,
          date: new Date().toLocaleString("ko-KR"),
          note:
            `${assignment.workerName} 요원이 모바일 현장 앱에서 ` +
            `업무 상태를 [${assignment.status}](으)로 변경했습니다.`,
          actor: assignment.workerName,
        },
      ];

      return [{
        id: tree.id,
        status: assignment.status,
        timeline,
      }];
    });

    if (changes.length === 0) {
      return;
    }

    const changesById = new Map(
      changes.map((change) => [change.id, change]),
    );

    setTrees((previous) =>
      previous.map((tree) => {
        const change = changesById.get(tree.id);

        return change
          ? {
            ...tree,
            status: change.status,
            timeline: change.timeline,
          }
          : tree;
      }),
    );

    void Promise.all(
      changes.map(async (change) => {
        const { error } = await supabase
          .from("confirmed_trees")
          .update({
            status: change.status,
            timeline: change.timeline,
          })
          .eq("id", change.id);

        if (error) {
          console.error(
            "모바일 방제 상태의 확진목 동기화 실패:",
            change.id,
            error,
          );
        }
      }),
    );
  }, [dispatchAssignments, trees]);

  const [isChatOpen, setIsChatOpen] =
    useState(false);

  const [
    isSidebarPinnedOpen,
    setIsSidebarPinnedOpen,
  ] = useState(false);

  const [
    isSidebarHovered,
    setIsSidebarHovered,
  ] = useState(false);

  const isSidebarOpen =
    isSidebarPinnedOpen ||
    isSidebarHovered;

  const [isAlertPanelOpen, setIsAlertPanelOpen] =
    useState(false);

  const [authUser, setAuthUser] =
    useState<AuthUser | null>(null);

  const [isAuthChecking, setIsAuthChecking] =
    useState(true);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      setIsAuthChecking(false);
      return;
    }

    getCurrentUser()
      .then((user) => {
        setAuthUser(user);
      })
      .catch(() => {
        logout();
        setAuthUser(null);
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    if (!authUser) {
      setReports([]);
      return;
    }

    let cancelled = false;

    const fetchPineRecords = async () => {
      const { data, error } = await supabase
        .from("pine_records")
        .select("*")
        .or(
          "dashboard_status.is.null,dashboard_status.neq.confirmed"
        )
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "pine_records 조회 실패:",
          error
        );
        return;
      }

      if (cancelled) {
        return;
      }

      const mappedReports = (data || []).map(
        (row) =>
          mapPineRecordToCrowdReport(
            row as PineRecordRow
          )
      );

      setReports(mappedReports);
    };

    void fetchPineRecords();

    const channel = supabase
      .channel(
        `pine-records-dashboard-${authUser.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pine_records",
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String(
              (
                payload.old as {
                  id?: string | number;
                }
              ).id
            );

            setReports((previous) =>
              previous.filter(
                (report) =>
                  report.id !== deletedId
              )
            );

            return;
          }

          const changedRow =
            payload.new as PineRecordRow;

          /*
           * 확진목으로 전환된 제보는
           * 예찰 리스트에서 제거합니다.
           */
          if (
            changedRow.dashboard_status ===
            "confirmed"
          ) {
            const convertedReportId =
              String(changedRow.id);

            setReports(previous =>
              previous.filter(
                report =>
                  report.id !==
                  convertedReportId
              )
            );

            return;
          }

          const changedReport =
            mapPineRecordToCrowdReport(
              changedRow
            );

          setReports((previous) => {
            const exists = previous.some(
              (report) =>
                report.id === changedReport.id
            );

            if (!exists) {
              return [
                changedReport,
                ...previous,
              ];
            }

            return previous.map((report) =>
              report.id === changedReport.id
                ? changedReport
                : report
            );
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [authUser]);


  useEffect(() => {
    if (!authUser) {
      setTrees([]);
      return;
    }

    let cancelled = false;

    const fetchConfirmedTrees = async () => {
      const { data, error } = await supabase
        .from("confirmed_trees")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(
          "confirmed_trees 조회 실패:",
          error
        );
        return;
      }

      if (cancelled) {
        return;
      }

      setTrees(
        (data || []).map((row) =>
          mapConfirmedTreeRowToTreeRecord(
            row as ConfirmedTreeRow
          )
        )
      );
    };

    void fetchConfirmedTrees();

    const channel = supabase
      .channel(
        `confirmed-trees-${authUser.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "confirmed_trees",
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deletedId = String(
              (
                payload.old as {
                  id?: string;
                }
              ).id
            );

            setTrees((previous) =>
              previous.filter(
                (tree) =>
                  tree.id !== deletedId
              )
            );

            return;
          }

          const changedTree =
            mapConfirmedTreeRowToTreeRecord(
              payload.new as ConfirmedTreeRow
            );

          setTrees((previous) => {
            const exists = previous.some(
              (tree) =>
                tree.id === changedTree.id
            );

            if (!exists) {
              return [
                changedTree,
                ...previous,
              ];
            }

            return previous.map((tree) =>
              tree.id === changedTree.id
                ? changedTree
                : tree
            );
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [authUser]);


  useEffect(() => {
    if (!authUser) {
      setFieldPhotos([]);
      return;
    }

    let cancelled = false;

    const fetchFieldPhotos =
      async () => {
        const { data, error } =
          await supabase
            .from("field_photos")
            .select("*")
            .order(
              "captured_at",
              {
                ascending: false,
              }
            );

        if (error) {
          console.error(
            "field_photos 조회 실패:",
            error
          );

          return;
        }

        if (cancelled) {
          return;
        }

        setFieldPhotos(
          (data || []).map(
            row =>
              mapFieldPhotoRowToRecord(
                row as FieldPhotoRow
              )
          )
        );
      };

    void fetchFieldPhotos();

    const channel = supabase
      .channel(
        `field-photos-${authUser.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "field_photos",
        },
        payload => {
          if (
            payload.eventType ===
            "DELETE"
          ) {
            const deletedId =
              String(
                (
                  payload.old as {
                    id?: string | number;
                  }
                ).id
              );

            setFieldPhotos(
              previous =>
                previous.filter(
                  photo =>
                    photo.id !==
                    deletedId
                )
            );

            return;
          }

          const changedPhoto =
            mapFieldPhotoRowToRecord(
              payload.new as FieldPhotoRow
            );

          setFieldPhotos(
            previous => {
              const exists =
                previous.some(
                  photo =>
                    photo.id ===
                    changedPhoto.id
                );

              if (!exists) {
                return [
                  changedPhoto,
                  ...previous,
                ];
              }

              return previous.map(
                photo =>
                  photo.id ===
                    changedPhoto.id
                    ? changedPhoto
                    : photo
              );
            }
          );
        }
      )
      .subscribe(status => {
        console.log(
          "field_photos Realtime:",
          status
        );
      });

    return () => {
      cancelled = true;

      void supabase.removeChannel(
        channel
      );
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      setFieldVoiceLogs([]);
      return;
    }

    let cancelled = false;

    const fetchFieldVoiceLogs =
      async () => {
        const {
          data,
          error,
        } = await supabase
          .from(
            "field_voice_logs"
          )
          .select("*")
          .order(
            "captured_at",
            {
              ascending: false,
            }
          );

        if (error) {
          console.error(
            "field_voice_logs 조회 실패:",
            error
          );

          return;
        }

        if (cancelled) {
          return;
        }

        setFieldVoiceLogs(
          (data || []).map(
            row =>
              mapFieldVoiceLogRowToRecord(
                row as FieldVoiceLogRow
              )
          )
        );
      };

    void fetchFieldVoiceLogs();

    const channel = supabase
      .channel(
        `field-voice-logs-${authUser.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table:
            "field_voice_logs",
        },
        payload => {
          if (
            payload.eventType ===
            "DELETE"
          ) {
            const deletedId =
              String(
                (
                  payload.old as {
                    id?:
                    string |
                    number;
                  }
                ).id
              );

            setFieldVoiceLogs(
              previous =>
                previous.filter(
                  log =>
                    log.id !==
                    deletedId
                )
            );

            return;
          }

          const changedLog =
            mapFieldVoiceLogRowToRecord(
              payload.new as
              FieldVoiceLogRow
            );

          setFieldVoiceLogs(
            previous => {
              const exists =
                previous.some(
                  log =>
                    log.id ===
                    changedLog.id
                );

              if (!exists) {
                return [
                  changedLog,
                  ...previous,
                ];
              }

              return previous.map(
                log =>
                  log.id ===
                    changedLog.id
                    ? changedLog
                    : log
              );
            }
          );
        }
      )
      .subscribe(status => {
        console.log(
          "field_voice_logs Realtime:",
          status
        );
      });

    return () => {
      cancelled = true;

      void supabase.removeChannel(
        channel
      );
    };
  }, [authUser]);



  const handleUpdateTreeStatus = async (
    id: string,
    newStatus: TreeRecord["status"]
  ) => {
    const targetTree = trees.find(
      (tree) => tree.id === id
    );

    if (!targetTree) {
      window.alert(
        "상태를 변경할 확진목을 찾을 수 없습니다."
      );
      return;
    }

    const previousTrees = trees;

    const updatedTimeline = [
      ...targetTree.timeline,
      {
        stage: `상태 변경: ${newStatus}`,
        date: new Date().toLocaleString(),
        note:
          `운영 서버에서 상태를 ` +
          `[${targetTree.status}]에서 ` +
          `[${newStatus}]로 변경했습니다.`,
        actor: "산림청 통합시스템",
      },
    ];

    // 화면을 먼저 변경
    setTrees((previous) =>
      previous.map((tree) =>
        tree.id === id
          ? {
            ...tree,
            status: newStatus,
            timeline: updatedTimeline,
          }
          : tree
      )
    );

    // Supabase에도 영구 저장
    const { error } = await supabase
      .from("confirmed_trees")
      .update({
        status: newStatus,
        timeline: updatedTimeline,
      })
      .eq("id", id);

    if (error) {
      console.error(
        "확진목 상태 저장 실패:",
        error
      );

      // 저장 실패 시 화면 원상복구
      setTrees(previousTrees);

      window.alert(
        "확진목 상태를 저장하지 못했습니다."
      );
    }
  };

  const handleDeleteTrees = async (
    ids: string[]
  ): Promise<string[]> => {
    const uniqueIds = Array.from(
      new Set(ids.filter(Boolean))
    );

    if (uniqueIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("confirmed_trees")
      .delete()
      .in("id", uniqueIds)
      .select("id");

    if (error) {
      console.error(
        "확진목 삭제 실패:",
        error
      );

      window.alert(
        "확진목을 삭제하지 못했습니다. Supabase DELETE 정책과 콘솔 오류를 확인해 주세요."
      );

      return [];
    }

    const deletedIds = Array.isArray(data)
      ? data.map((row) => String(row.id))
      : [];

    if (deletedIds.length === 0) {
      window.alert(
        "삭제 요청은 처리됐지만 실제 삭제된 행이 없습니다. Supabase DELETE 정책을 확인해 주세요."
      );

      return [];
    }

    const deletedIdSet = new Set(
      deletedIds
    );

    setTrees((previous) =>
      previous.filter(
        (tree) =>
          !deletedIdSet.has(tree.id)
      )
    );

    if (
      deletedIds.length !==
      uniqueIds.length
    ) {
      window.alert(
        `${uniqueIds.length}건 중 ${deletedIds.length}건만 삭제되었습니다.`
      );
    }

    return deletedIds;
  };

  const handleUpdateWorkerStatus = (
    id: string,
    status: WorkerStatus["status"]
  ) => {
    setWorkers((prev) =>
      prev.map((worker) =>
        worker.id === id
          ? {
            ...worker,
            status,
          }
          : worker
      )
    );
  };

  const handleAssignWorker = async (
    assignment: DispatchAssignment
  ): Promise<boolean> => {
    const duplicated = dispatchAssignments.some(
      (item) =>
        item.workerId === assignment.workerId &&
        item.gridId === assignment.gridId &&
        item.status !== "복귀 완료"
    );

    if (duplicated) {
      return false;
    }

    setDispatchAssignments((previous) => [
      assignment,
      ...previous.filter(
        (item) => item.assignmentId !== assignment.assignmentId
      ),
    ]);

    const { error } = await supabase
      .from("dispatch_assignments")
      .upsert(mapDispatchAssignment(assignment), {
        onConflict: "assignment_id",
      });

    if (error) {
      console.error("현장 업무 배정 저장 실패:", error);
      setDispatchAssignments((previous) =>
        previous.filter(
          (item) => item.assignmentId !== assignment.assignmentId
        )
      );
      window.alert(
        "업무 배정을 저장하지 못했습니다. dispatch_assignments 테이블과 RLS 정책을 확인해 주세요."
      );
      return false;
    }

    return true;
  };

  const handleUpdateDispatchStatus = async (
    assignmentId: string,
    status: DispatchStatus
  ) => {
    const previousAssignment = dispatchAssignments.find(
      (assignment) => assignment.assignmentId === assignmentId
    );
    const changedAt = new Date().toISOString();
    const timestampPatch =
      status === "배정 수락"
        ? { acceptedAt: changedAt }
        : status === "출동"
          ? { departedAt: changedAt }
          : status === "현장 도착"
            ? { arrivedAt: changedAt }
            : status === "작업 중"
              ? { startedAt: changedAt }
              : status === "작업 완료"
                ? { completedAt: changedAt }
                : {};

    setDispatchAssignments((previous) =>
      previous.map((assignment) =>
        assignment.assignmentId === assignmentId
          ? {
            ...assignment,
            status,
            ...timestampPatch,
          }
          : assignment
      )
    );

    const databasePatch: Record<string, string> = { status };
    if (status === "배정 수락") databasePatch.accepted_at = changedAt;
    if (status === "출동") databasePatch.departed_at = changedAt;
    if (status === "현장 도착") databasePatch.arrived_at = changedAt;
    if (status === "작업 중") databasePatch.started_at = changedAt;
    if (status === "작업 완료") databasePatch.completed_at = changedAt;

    const { error } = await supabase
      .from("dispatch_assignments")
      .update(databasePatch)
      .eq("assignment_id", assignmentId);

    if (error) {
      console.error("현장 업무 상태 변경 실패:", error);
      if (previousAssignment) {
        setDispatchAssignments((previous) =>
          previous.map((assignment) =>
            assignment.assignmentId === assignmentId
              ? previousAssignment
              : assignment
          )
        );
      }
    }
  };

  const handleCancelDispatch = async (
    assignmentId: string
  ) => {
    const previousAssignment = dispatchAssignments.find(
      (assignment) => assignment.assignmentId === assignmentId
    );

    setDispatchAssignments((previous) =>
      previous.filter(
        (assignment) =>
          assignment.assignmentId !== assignmentId
      )
    );

    const { error } = await supabase
      .from("dispatch_assignments")
      .delete()
      .eq("assignment_id", assignmentId);

    if (error) {
      console.error("현장 업무 배정 취소 실패:", error);
      if (previousAssignment) {
        setDispatchAssignments((previous) => [
          previousAssignment,
          ...previous.filter(
            (item) => item.assignmentId !== assignmentId
          ),
        ]);
      }
    }
  };

  const handleConfirmInfection = async (
    report: CrowdReport
  ) => {
    const confirmedTreeRegion =
      typeof report.latitude === "number" &&
        Number.isFinite(report.latitude) &&
        typeof report.longitude === "number" &&
        Number.isFinite(report.longitude)
        ? `위도 ${report.latitude.toFixed(6)}, 경도 ${report.longitude.toFixed(6)}`
        : "위치 정보 미확인";

    const newTree: TreeRecord = {
      id:
        `PT-${new Date().getFullYear()}-` +
        `${Math.floor(
          1000 + Math.random() * 9000
        )}`,
      region: confirmedTreeRegion,
      species: "소나무",
      confirmedDate:
        new Date()
          .toISOString()
          .split("T")[0],
      status: "확진완료",
      severity:
        report.aiProbability >= 75
          ? "심"
          : report.aiProbability >= 45
            ? "중"
            : "경",
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
        "시민 " + report.reporter,

      sourceReportId:
        String(report.id),

      aiProbability:
        report.aiProbability,

      latitude:
        report.latitude,

      longitude:
        report.longitude,

      imageUrl:
        (
          report as CrowdReport & {
            photoUrl?: string;
            image_url?: string;
            imageUrl?: string;
          }
        ).photoUrl ||

        (
          report as CrowdReport & {
            image_url?: string;
            imageUrl?: string;
          }
        ).image_url ||
        (
          report as CrowdReport & {
            imageUrl?: string;
          }
        ).imageUrl,

      imageSource:
        "citizen",

      timeline: [
        {
          stage:
            "시민 제보 확진 대장 전환 완료 " +
            "(FR-FLD-006)",
          date:
            new Date().toLocaleString(),
          note:
            `시민 제보 [${report.title}] ` +
            `기반으로 전주기 타임라인 대입 연동. ` +
            `AI 신뢰도: ${report.aiProbability}%`,
          actor: "행정관 주무관",
        },
      ],
    };

    /*
 * 1. confirmed_trees에 확진목 추가
 */
    handleAddTree(newTree);

    /*
     * 2. 원본 시민 제보를 확진 전환 완료 상태로 표시
     *
     * pine_records 자체를 삭제하지는 않습니다.
     * 사진·현장사진·음성 기록의 연결 기준으로
     * 계속 사용해야 하기 때문입니다.
     */
    const {
      error: reportUpdateError,
    } = await supabase
      .from("pine_records")
      .update({
        dashboard_status:
          "confirmed",
      })
      .eq(
        "id",
        report.id
      );

    if (reportUpdateError) {
      console.error(
        "시민 제보 확진 전환 상태 저장 실패:",
        reportUpdateError
      );

      window.alert(
        "확진목은 등록됐지만 원본 제보의 전환 상태를 저장하지 못했습니다."
      );

      return false;
    }

    /*
     * 3. 현재 화면에서도 즉시 제거
     */
    setReports(previous =>
      previous.filter(
        item =>
          item.id !==
          String(report.id)
      )
    );

    /*
     * 4. 확진목 모니터링 화면으로 이동
     */
    setActiveModule(
      "monitoring"
    );

    return true;
  };

  const handleConfirmAssignmentInfection = async (
    assignment: DispatchAssignment
  ): Promise<boolean> => {
    /*
     * 이미 같은 예찰 배정으로 생성된 확진목이 있는지 확인합니다.
     * 이전 클릭에서 DB 저장만 성공한 경우에도 중복 등록하지 않습니다.
     */
    const {
      data: existingRows,
      error: lookupError,
    } = await supabase
      .from("confirmed_trees")
      .select("*")
      .eq(
        "source_report_id",
        assignment.assignmentId
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

    if (lookupError) {
      console.error(
        "기존 확진목 조회 실패:",
        lookupError
      );

      window.alert(
        `확진목 전환 상태를 확인하지 못했습니다.\n${lookupError.message}`
      );

      return false;
    }

    const existingRow =
      existingRows?.[0] as
      | ConfirmedTreeRow
      | undefined;

    /*
     * 이미 DB에 저장된 확진목이면
     * 새로 insert하지 않고 화면 상태만 복구합니다.
     */
    if (existingRow) {
      const existingTree =
        mapConfirmedTreeRowToTreeRecord(
          existingRow
        );

      setTrees((previous) => [
        existingTree,
        ...previous.filter(
          (tree) =>
            tree.id !== existingTree.id
        ),
      ]);

      /*
       * 복귀 완료 상태는 FieldSection의
       * surveyAssignments 필터에서 제외됩니다.
       */
      await handleUpdateDispatchStatus(
        assignment.assignmentId,
        "복귀 완료"
      );

      setActiveModule("monitoring");

      return true;
    }

    const latitude =
      assignment.fieldLatitude ??
      assignment.targetLatitude;

    const longitude =
      assignment.fieldLongitude ??
      assignment.targetLongitude;

    const probability =
      Number.isFinite(
        Number(assignment.riskScore)
      )
        ? Number(assignment.riskScore)
        : 0;

    const confirmedTreeRegion =
      Number.isFinite(Number(latitude)) &&
        Number.isFinite(Number(longitude))
        ? `위도 ${Number(latitude).toFixed(6)}, 경도 ${Number(longitude).toFixed(6)}`
        : "위치 정보 미확인";

    /*
     * 해당 예찰 배정에서 가장 최근에 촬영한 사진을 찾습니다.
     */
    const relatedPhoto = [...fieldPhotos]
      .filter((photo) => {
        if (
          photo.workMode !==
          "surveillance"
        ) {
          return false;
        }

        const relatedId = String(
          photo.relatedRecordId
        );

        return (
          relatedId ===
          assignment.assignmentId ||
          relatedId === assignment.gridId ||
          relatedId ===
          `GRID-${assignment.gridId}`
        );
      })
      .sort(
        (left, right) =>
          new Date(
            right.capturedAt
          ).getTime() -
          new Date(
            left.capturedAt
          ).getTime()
      )[0];

    const imageUrl = relatedPhoto
      ? fieldPhotoUrls[
      relatedPhoto.storagePath
      ] || null
      : null;

    const year =
      new Date().getFullYear();

    const treeId =
      `PT-${year}-` +
      String(
        Math.floor(
          Math.random() * 10000
        )
      ).padStart(4, "0");

    const timeline = [
      {
        stage: "현장 예찰 확진목 전환",
        date:
          new Date().toLocaleString(
            "ko-KR"
          ),
        note:
          `GRID-${assignment.gridId} ` +
          `${assignment.workerName} 요원의 ` +
          `현장 예찰 결과를 확진목으로 전환했습니다.`,
        actor: assignment.workerName,
      },
    ];

    const {
      data: insertedRow,
      error: insertError,
    } = await supabase
      .from("confirmed_trees")
      .insert({
        id: treeId,
        region: confirmedTreeRegion,
        species: "소나무",
        confirmed_date:
          new Date()
            .toISOString()
            .split("T")[0],
        status: "확진완료",
        severity:
          probability >= 75
            ? "심"
            : probability >= 45
              ? "중"
              : "경",
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
          assignment.workerName,
        timeline,

        source_report_id:
          assignment.assignmentId,

        ai_probability:
          probability,

        latitude:
          latitude ?? null,

        longitude:
          longitude ?? null,

        image_url:
          imageUrl,

        image_source:
          relatedPhoto
            ? "manual"
            : null,

        image_source:
          relatedPhoto
            ? "manual"
            : null,

        image_bucket:
          relatedPhoto
            ? "field-photos"
            : null,

        image_path:
          relatedPhoto?.storagePath ??
          null,

        analysis_result: null,
      })
      .select("*")
      .single();

    if (
      insertError ||
      !insertedRow
    ) {
      console.error(
        "예찰 배정 확진목 저장 실패:",
        insertError
      );

      window.alert(
        `확진목을 저장하지 못했습니다.\n${insertError?.message ??
        "저장 결과가 없습니다."
        }`
      );

      return false;
    }

    const savedTree =
      mapConfirmedTreeRowToTreeRecord(
        insertedRow as ConfirmedTreeRow
      );

    /*
     * Realtime 수신을 기다리지 않고
     * 화면에 즉시 추가합니다.
     */
    setTrees((previous) => [
      savedTree,
      ...previous.filter(
        (tree) =>
          tree.id !== savedTree.id
      ),
    ]);

    /*
     * 복귀 완료로 바꾸면 예찰 목록에서는 제거되지만
     * dispatch_assignments 이력은 DB에 보존됩니다.
     */
    await handleUpdateDispatchStatus(
      assignment.assignmentId,
      "복귀 완료"
    );

    setActiveModule("monitoring");

    return true;
  };

  const handleRejectReport = async (
    report: CrowdReport
  ) => {
    const confirmed = window.confirm(
      `제보 [${report.title}]을 반려하고 원본 데이터를 삭제하시겠습니까?\n\n` +
      "삭제한 제보 데이터는 복구할 수 없습니다."
    );

    if (!confirmed) {
      return false;
    }

    const { data, error } = await supabase
      .from("pine_records")
      .delete()
      .eq("id", report.id)
      .select("id");

    if (error) {
      console.error(
        "시민 제보 반려 삭제 실패:",
        error
      );

      window.alert(
        `반려 처리 중 데이터를 삭제하지 못했습니다.\n${error.message}`
      );

      return false;
    }

    if (!data || data.length === 0) {
      window.alert(
        "삭제된 데이터가 없습니다. pine_records의 DELETE 정책을 확인해 주세요."
      );

      return false;
    }

    setReports((previous) =>
      previous.filter(
        (item) => String(item.id) !== String(report.id)
      )
    );

    return true;
  };

  const handleAddTask = (
    newTask: ControlTask
  ) => {
    setTasks((prev) => [
      newTask,
      ...prev,
    ]);
  };

  const handleUpdateTaskProgress = (
    id: string,
    progress: number
  ) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const isComplete =
          progress >= 100;

        return {
          ...task,
          progress,
          status:
            isComplete
              ? "완료"
              : ("진행" as any),
        };
      })
    );
  };

  const adminGroup = {
    id: "admin",
    label: "행정 기안 지원",
    icon: FileText,
    items: [
      {
        id: "admin-report",
        label: "보고서 생성 및 조회",
        icon: FileText,
      },
      {
        id: "admin-species",
        label: "AI 친환경 수종전환 추천",
        icon: TreePine,
      },
    ],
  } as const;

  const modules = [
    {
      id: "dashboard",
      label: "홈",
      icon: HomeIcon,
    },
    {
      id: "monitoring",
      label: "확진목 모니터링",
      icon: TreesIcon,
    },
    {
      id: "control",
      label: "방제",
      icon: ShieldCheck,
    },
    ...adminGroup.items,
  ] as const;

  const activeModuleLabel =
    modules.find((module) => module.id === activeModule)?.label ??
    "종합 상황판";

  if (isAuthChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center text-white">
          <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-emerald-600">
            <TreePine size={27} />
          </div>
          <div className="mt-4 text-sm font-extrabold">
            로그인 상태 확인 중...
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthScreen
        onAuthenticated={(user) => {
          setAuthUser(user);
        }}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F5F7FA] font-sans text-slate-800">
      <div
        className="grid h-full"
        style={{
          gridTemplateColumns:
            "50px minmax(0, 1fr)",
        }}
      >
        <aside
          onMouseMove={(event) => {
            const target =
              event.target as HTMLElement;

            // 실시간 알림 영역에서는
            // 마우스 호버로 사이드바를 열지 않음
            if (
              target.closest(
                "[data-sidebar-alert-trigger]"
              )
            ) {
              setIsSidebarHovered(false);
              return;
            }

            setIsSidebarHovered(true);
          }}
          onMouseLeave={() => {
            setIsSidebarHovered(false);
          }}
          style={{
            width: isSidebarOpen
              ? "240px"
              : "50px",
          }}
          className="relative z-[30000] flex h-full min-w-0 flex-col overflow-visible border-r border-slate-200 bg-white py-4 shadow-xl transition-[width] duration-300 ease-out"
        >
          <div
            data-sidebar-alert-trigger
            className={
              isSidebarOpen
                ? "flex w-full items-center gap-3 px-4"
                : "flex w-full justify-center"
            }
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsSidebarHovered(false);

                setIsAlertPanelOpen(
                  previous => !previous
                );
              }}
              className={
                isAlertPanelOpen
                  ? "relative flex h-10 w-10 shrink-0 items-center justify-center text-rose-700 transition hover:text-rose-900"
                  : liveAlerts.length > 0
                    ? "relative flex h-10 w-10 shrink-0 items-center justify-center text-rose-600 transition hover:text-rose-700"
                    : "relative flex h-10 w-10 shrink-0 items-center justify-center text-emerald-800 transition hover:text-emerald-900"
              }
              aria-label="실시간 알림 열기"
              title="실시간 알림"
            >
              <AlertTriangle size={22} />
            </button>

            {isSidebarOpen && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsSidebarHovered(false);

                  setIsAlertPanelOpen(
                    previous => !previous
                  );
                }}
                className="min-w-0 text-left"
              >
                <div className="truncate text-lg font-black text-slate-950">
                  실시간 알림
                </div>

                <div className="mt-0.5 truncate text-[10px] font-bold text-slate-400">
                  미확인 {liveAlerts.length}건
                </div>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (isSidebarPinnedOpen) {
                setIsSidebarPinnedOpen(false);
                setIsSidebarHovered(false);
                return;
              }

              setIsSidebarPinnedOpen(true);
            }}
            className="absolute -right-4 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:text-emerald-700"
            aria-label={
              isSidebarPinnedOpen
                ? "사이드바 닫기"
                : "사이드바 열린 상태 고정"
            }
            title={
              isSidebarPinnedOpen
                ? "사이드바 닫기"
                : "사이드바 열린 상태 고정"
            }
          >
            {isSidebarPinnedOpen ? (
              <PanelLeftClose size={17} />
            ) : (
              <PanelLeftOpen size={17} />
            )}
          </button>

          <div
            className={
              isSidebarOpen
                ? "mx-4 my-4 h-px bg-slate-200"
                : "mx-auto my-4 h-px w-10 bg-slate-200"
            }
          />

          <nav
            className={
              isSidebarOpen
                ? "flex flex-1 flex-col gap-0.5 px-2"
                : "flex flex-1 flex-col items-center gap-1"
            }
          >
            {/* =========================
                홈
            ========================== */}
            {(() => {
              const module = modules.find(
                (item) => item.id === "dashboard"
              );

              if (!module) return null;

              const Icon = module.icon;
              const active =
                activeModule === module.id;

              return (
                <button
                  type="button"
                  onClick={() =>
                    setActiveModule(module.id)
                  }
                  title={module.label}
                  aria-label={module.label}
                  className={
                    isSidebarOpen
                      ? active
                        ? "group relative flex h-10 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                        : "group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                      : active
                        ? "group relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900"
                        : "group relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                  }
                >
                  <Icon size={20} className="shrink-0" />

                  {isSidebarOpen ? (
                    <span className="truncate text-sm font-extrabold">
                      {module.label}
                    </span>
                  ) : (
                    <span className="pointer-events-none absolute left-[58px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg group-hover:block">
                      {module.label}
                    </span>
                  )}
                </button>
              );
            })()}

            {/* =========================
                재선충 모니터링
            ========================== */}
            {(() => {
              const module = modules.find(
                (item) => item.id === "monitoring"
              );

              if (!module) return null;

              const Icon = module.icon;
              const active =
                activeModule === module.id;

              return (
                <button
                  type="button"
                  onClick={() =>
                    setActiveModule(module.id)
                  }
                  title={module.label}
                  aria-label={module.label}
                  className={
                    isSidebarOpen
                      ? active
                        ? "group relative flex h-10 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                        : "group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                      : active
                        ? "group relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900"
                        : "group relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                  }
                >
                  <Icon size={20} className="shrink-0" />

                  {isSidebarOpen ? (
                    <span className="truncate text-sm font-extrabold">
                      {module.label}
                    </span>
                  ) : (
                    <span className="pointer-events-none absolute left-[58px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg group-hover:block">
                      {module.label}
                    </span>
                  )}
                </button>
              );
            })()}

            {/* =========================
    예찰
========================== */}
            <div className="group relative mt-1">

              {/* 예찰 부모 메뉴 */}
              <div
                className={
                  isSidebarOpen
                    ? "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                    : "flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                }
              >
                <Footprints
                  size={20}
                  className="shrink-0"
                />

                {isSidebarOpen && (
                  <span className="truncate text-sm font-extrabold">
                    예찰
                  </span>
                )}

                {!isSidebarOpen && (
                  <span className="pointer-events-none absolute left-[58px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg group-hover:block">
                    예찰
                  </span>
                )}
              </div>

              {/* 사이드바 펼침 상태 */}
              {isSidebarOpen && (
                <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-200 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                  <div className="overflow-hidden">
                    <div className="mt-1 space-y-1 pl-8">

                      {/* 실시간 예찰 현황 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule("field")
                        }
                        className={
                          activeModule === "field"
                            ? "flex h-9 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                            : "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <Radar
                          size={16}
                          className="shrink-0"
                        />

                        <span className="truncate text-xs font-extrabold">
                          실시간 예찰 현황
                        </span>
                      </button>

                      {/* 열화상 감염도 확인 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule(
                            "thermal-analysis"
                          )
                        }
                        className={
                          activeModule ===
                            "thermal-analysis"
                            ? "flex h-9 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                            : "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <MemoryStickIcon
                          size={16}
                          className="shrink-0"
                        />

                        <span className="truncate text-xs font-extrabold">
                          열화상 감염도 확인
                        </span>
                      </button>

                      {/*  드론 실사 감염도 확인
 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule(
                            "drone-vision-analysis"
                          )
                        }
                        className={
                          activeModule ===
                            "drone-vision-analysis"
                            ? "flex h-9 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                            : "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <Camera
                          size={16}
                          className="shrink-0"
                        />

                        <span className="truncate text-xs font-extrabold">
                          드론 실사 감염도 확인
                        </span>
                      </button>

                    </div>
                  </div>
                </div>
              )}

              {/* 사이드바 접힘 상태 */}
              {!isSidebarOpen && (
                <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-200 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                  <div className="overflow-hidden">
                    <div className="mt-1 flex flex-col items-center gap-1">

                      {/* 실시간 예찰 현황 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule("field")
                        }
                        className={
                          activeModule === "field"
                            ? "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                            : "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <Radar size={18} />

                        <span className="pointer-events-none absolute left-[58px] z-[100] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition group-hover/submenu:opacity-100">
                          실시간 예찰 현황
                        </span>
                      </button>

                      {/* 열화상 감염도 확인 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule(
                            "thermal-analysis"
                          )
                        }
                        className={
                          activeModule ===
                            "thermal-analysis"
                            ? "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                            : "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <MemoryStickIcon size={18} />

                        <span className="pointer-events-none absolute left-[58px] z-[100] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition group-hover/submenu:opacity-100">
                          열화상 감염도 확인
                        </span>
                      </button>

                      {/* 실사 드론 사진 감염도 확인 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule(
                            "drone-vision-analysis"
                          )
                        }
                        className={
                          activeModule ===
                            "drone-vision-analysis"
                            ? "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                            : "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <Camera size={18} />

                        <span className="pointer-events-none absolute left-[58px] z-[100] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition group-hover/submenu:opacity-100">
                          드론 실사 감염도 확인
                        </span>
                      </button>

                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* =========================
                방제
                ========================= */}
            <div className="group relative mt-1">

              {/* 방제 부모 메뉴 */}
              <div
                className={
                  isSidebarOpen
                    ? "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                    : "flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                }
              >
                <ShieldCheck
                  size={20}
                  className="shrink-0"
                />

                {isSidebarOpen && (
                  <span className="truncate text-sm font-extrabold">
                    방제
                  </span>
                )}

                {/* 접힌 상태에서 방제 이름 Tooltip */}
                {!isSidebarOpen && (
                  <span className="pointer-events-none absolute left-[58px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg group-hover:block">
                    방제
                  </span>
                )}
              </div>


              {/* ==================================================
                  사이드바 펼침 상태
                  기존처럼 텍스트 메뉴
              ================================================== */}
              {isSidebarOpen && (
                <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-200 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                  <div className="overflow-hidden">
                    <div className="mt-1 space-y-1 pl-8">

                      {/* 작업 현황 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule("control-status")
                        }
                        className={
                          activeModule === "control-status"
                            ? "flex h-9 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                            : "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <ShieldOffIcon
                          size={16}
                          className="shrink-0"
                        />

                        <span className="truncate text-xs font-extrabold">
                          작업 현황
                        </span>
                      </button>


                      {/* 시뮬레이션 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule("control-work")
                        }
                        className={
                          activeModule === "control-work"
                            ? "flex h-9 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                            : "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <VideoIcon
                          size={16}
                          className="shrink-0"
                        />

                        <span className="truncate text-xs font-extrabold">
                          시뮬레이션
                        </span>
                      </button>

                    </div>
                  </div>
                </div>
              )}


              {/* ==================================================
                  사이드바 접힘 상태
                  같은 메뉴 영역 안에서 아래로 확장
                  → Admin이 아래로 밀림
              ================================================== */}
              {!isSidebarOpen && (
                <div
                  className="
                    grid
                    grid-rows-[0fr]
                    opacity-0
                    transition-all
                    duration-200
                    group-hover:grid-rows-[1fr]
                    group-hover:opacity-100
                  "
                >
                  <div className="overflow-hidden">
                    <div className="mt-1 flex flex-col items-center gap-1">

                      {/* 작업 현황 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule("control-status")
                        }
                        className={
                          activeModule === "control-status"
                            ? "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                            : "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <ShieldOffIcon size={18} />

                        {/* 아이콘 Tooltip */}
                        <span className="pointer-events-none absolute left-[58px] z-[100] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition group-hover/submenu:opacity-100">
                          작업 현황
                        </span>
                      </button>


                      {/* 시뮬레이션 */}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveModule("control-work")
                        }
                        className={
                          activeModule === "control-work"
                            ? "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                            : "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <VideoIcon size={18} />

                        {/* 아이콘 Tooltip */}
                        <span className="pointer-events-none absolute left-[58px] z-[100] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition group-hover/submenu:opacity-100">
                          시뮬레이션
                        </span>
                      </button>

                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* =========================
                행정 기안 지원
            ========================== */}
            <div className="group relative mt-1">
              <div
                className={
                  isSidebarOpen
                    ? adminGroup.items.some(
                      (item) =>
                        item.id === activeModule
                    )
                      ? "flex h-10 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-emerald-900"
                      : "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                    : adminGroup.items.some(
                      (item) =>
                        item.id === activeModule
                    )
                      ? "flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900"
                      : "flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                }
              >
                <FileText
                  size={20}
                  className="shrink-0"
                />

                {isSidebarOpen ? (
                  <span className="truncate text-sm font-extrabold">
                    {adminGroup.label}
                  </span>
                ) : (
                  <span className="pointer-events-none absolute left-[58px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg group-hover:block">
                    {adminGroup.label}
                  </span>
                )}
              </div>

              <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-200 group-hover:grid-rows-[1fr] group-hover:opacity-100">
                <div className="overflow-hidden">
                  <div
                    className={
                      isSidebarOpen
                        ? "mt-1 space-y-1 pl-8"
                        : "mt-1 flex flex-col items-center gap-1"
                    }
                  >
                    {adminGroup.items.map(
                      (item) => {
                        const Icon = item.icon;
                        const active =
                          activeModule === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setActiveModule(
                                item.id
                              )
                            }
                            title={item.label}
                            aria-label={item.label}
                            className={
                              isSidebarOpen
                                ? active
                                  ? "flex h-9 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                                  : "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                                : active
                                  ? "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                                  : "group/submenu relative flex h-10 w-12 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                            }
                          >
                            <Icon
                              size={
                                isSidebarOpen
                                  ? 16
                                  : 18
                              }
                              className="shrink-0"
                            />

                            {isSidebarOpen ? (
                              <span className="truncate text-xs font-extrabold">
                                {item.label}
                              </span>
                            ) : (
                              <span className="pointer-events-none absolute left-[58px] z-[100] whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition group-hover/submenu:opacity-100">
                                {item.label}
                              </span>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            </div>
          </nav>

          <div className="mt-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              className={
                isSidebarOpen
                  ? "mx-3 flex h-12 w-[calc(100%-24px)] items-center gap-3 rounded-xl px-3 text-slate-600 transition hover:bg-slate-50"
                  : "mx-auto flex h-12 w-12 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50"
              }
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-800">
                {authUser.name?.slice(0, 1)}
              </div>

              {isSidebarOpen && (
                <div className="min-w-0 text-left">
                  <div className="truncate text-xs font-extrabold">
                    {authUser.name}
                  </div>

                  <div className="truncate text-[9px] font-bold text-slate-400">
                    {authUser.organization}
                  </div>
                </div>
              )}
            </button>

            <div
              className={
                isSidebarOpen
                  ? "mx-3 mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2"
                  : "mx-auto mt-2 flex h-9 w-12 items-center justify-center rounded-xl bg-emerald-50"
              }
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />

              {isSidebarOpen && (
                <span className="text-[10px] font-bold text-emerald-700">
                  행정망 연동 정상
                </span>
              )}
            </div>

            {isSidebarOpen && (
              <div className="mx-3 mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500">
                PR-AUC 0.3183
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                logout();
                setAuthUser(null);
                setSelectedGrid(null);
                setIsChatOpen(false);
                setIsAlertPanelOpen(false);
              }}
              className={
                isSidebarOpen
                  ? "mx-3 mt-2 flex h-11 w-[calc(100%-24px)] items-center gap-3 rounded-xl px-3 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                  : "mx-auto mt-2 flex h-11 w-12 items-center justify-center rounded-xl text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
              }
            >
              <LogOut size={19} />

              {isSidebarOpen && (
                <span className="text-xs font-extrabold">
                  로그아웃
                </span>
              )}
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <main className="min-h-0 flex-1 overflow-hidden p-3 xl:p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="h-full min-h-0"
              >
                {activeModule === "dashboard" && (
                  <div className="h-full min-h-0 overflow-y-auto pr-1">
                    <Dashboard
                      grids={grids}
                      trees={trees}
                      workers={workers}
                      reports={reports}
                      dispatchAssignments={dispatchAssignments}
                      onAssignWorker={handleAssignWorker}
                      onGridSelect={setSelectedGrid}
                      authUser={authUser}
                      liveAlerts={liveAlerts}
                    />
                  </div>
                )}

                {activeModule === "monitoring" && (
                  <MonitoringSection
                    trees={trees}
                    fieldPhotos={fieldPhotos}
                    fieldVoiceLogs={
                      fieldVoiceLogs
                    }
                    onAddTree={handleAddTree}
                    onUpdateTreeStatus={
                      handleUpdateTreeStatus
                    }
                    onDeleteTrees={
                      handleDeleteTrees
                    }
                    dispatchAssignments={
                      dispatchAssignments
                    }
                    onAssignWorker={
                      handleAssignWorker
                    }
                  />
                )}

                {activeModule === "field" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <FieldSection
                      workers={workers}
                      reports={reports}
                      fieldPhotos={fieldPhotos}
                      fieldPhotoUrls={fieldPhotoUrls}
                      dispatchAssignments={dispatchAssignments}
                      onUpdateDispatchStatus={handleUpdateDispatchStatus}
                      onCancelDispatch={handleCancelDispatch}
                      onUpdateWorkerStatus={handleUpdateWorkerStatus}
                      onConfirmInfection={handleConfirmInfection}
                      onConfirmAssignmentInfection={
                        handleConfirmAssignmentInfection
                      }
                      onRejectReport={handleRejectReport}
                      onAssignWorker={handleAssignWorker}
                    />
                  </div>
                )}

                {activeModule === "thermal-analysis" && (
                  <div className="h-full min-h-0 overflow-y-auto pr-1">
                    <ThermalAnalysisSection
                      onAddTree={handleAddTree}
                    />
                  </div>
                )}

                {activeModule === "drone-vision-analysis" && (
                  <div className="h-full min-h-0 overflow-y-auto pr-1">
                    <DroneVisionAnalysisSection
                      onAddTree={handleAddTree}
                    />
                  </div>
                )}

                {activeModule === "control-status" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <ControlSection
                      mode="status"
                      tasks={tasks}
                      grids={grids}
                      dispatchAssignments={dispatchAssignments}
                      fieldPhotos={fieldPhotos}
                      fieldPhotoUrls={fieldPhotoUrls}
                      fieldVoiceLogs={fieldVoiceLogs}
                      onAddTask={handleAddTask}
                      onUpdateTaskProgress={handleUpdateTaskProgress}
                      onUpdateDispatchStatus={handleUpdateDispatchStatus}
                    />
                  </div>
                )}

                {activeModule === "control-work" && (
                  <div className="h-full min-h-0 overflow-y-auto pr-1">
                    <SpreadSimulationCA />
                  </div>
                )}

                {(activeModule === "admin-report" ||
                  activeModule === "admin-species") && (
                    <div className="h-full overflow-y-auto pr-1">
                      <AdminSection
                        title={activeModuleLabel} // 필수 프로퍼티인 title에 현재 활성 모듈의 라벨을 전달합니다.
                        view={
                          activeModule ===
                            "admin-species"
                            ? "species"
                            : "report"
                        }
                      />
                    </div>
                  )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {isAlertPanelOpen && (
          <motion.aside
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            transition={{
              duration: 0.18,
            }}
            style={{
              left: "58px",
              top: "16px",
              zIndex: 50000,
            }}
            className="fixed flex max-h-[calc(100vh-32px)] w-[390px] max-w-[calc(100vw-74px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  실시간 통합 알림
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsAlertPanelOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="실시간 알림 닫기"
              >
                <X size={19} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {liveAlerts.map((alert) => {
                const Icon = alert.icon;

                const toneClass =
                  alert.tone === "danger"
                    ? "text-rose-800"
                    : alert.tone === "warning"
                      ? "text-amber-800"
                      : "text-blue-800";

                return (
                  <article
                    key={alert.id}
                    className={`p-1 ${toneClass}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex shrink-0 items-center justify-center">
                        <Icon size={18} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-extrabold">
                            {alert.title}
                          </h3>

                          <span className="shrink-0 text-[10px] font-black opacity-70">
                            {alert.time}
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
                          {alert.description}
                        </p>

                        <div className="mt-2 text-[10px] font-black opacity-60">
                          {alert.id}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-semibold leading-5 text-slate-500">
              알림은 감염 확정이 아닌 신규 확산위험 후보와 현장 확인 필요사항을 안내합니다.
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.button
              type="button"
              aria-label="챗봇 닫기"
              onClick={() => setIsChatOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2000] bg-slate-950/25 backdrop-blur-[1px]"
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 34,
              }}
              className="fixed bottom-0 right-0 top-0 z-[2010] w-full border-l border-slate-200 bg-white shadow-2xl sm:w-[480px]"
            >
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="absolute right-5 top-5 z-50 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="챗봇 닫기"
              >
                <X size={20} />
              </button>

              <Chatbot selectedGrid={selectedGrid} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {!isChatOpen && (
        <motion.button
          type="button"
          onClick={() => setIsChatOpen(true)}
          whileHover={{ width: 62 }}
          whileTap={{ scale: 0.95 }}
          className="group fixed right-0 top-1/2 z-50 flex h-15 w-10 -translate-y-1/2 flex-col items-center justify-center rounded-l-2xl border border-emerald-700 border-r-0 bg-emerald-800 text-white shadow-xl transition-all hover:bg-emerald-900"
          aria-label="AI 챗봇 열기"
        >
          <MessageSquare size={23} />

          <span className="mt-2 text-[9px] font-black tracking-[0.2em] [writing-mode:vertical-rl]">

          </span>

          <span className="absolute -left-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-amber-400 px-1 text-[8px] font-black text-emerald-950">
            AI
          </span>

          <span className="pointer-events-none absolute right-14 whitespace-nowrap rounded-xl bg-slate-900/90 px-3 py-2 text-[10px] font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
            위험격자·백서 통합 질의 비서
          </span>
        </motion.button>
      )}
    </div>
  );
}