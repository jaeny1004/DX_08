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
  Camera
} from "lucide-react";

import Dashboard from "./components/Dashboard";
import MonitoringSection from "./components/MonitoringSection";
import FieldSection from "./components/FieldSection";
import ThermalAnalysisSection from "./components/ThermalAnalysisSection";
import DroneVisionAnalysisSection from "./components/DroneVisionAnalysisSection";
import ControlSection from "./components/ControlSection";
import SimulationSection from "./components/SimulationSection";
import AdminSection from "./components/AdminSection";
import Chatbot from "./components/Chatbot";
import AuthScreen from "./components/auth/AuthScreen";

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
  WorkerStatus,
  CrowdReport,
  ControlTask,
} from "./types";

import {
  DispatchAssignment,
  DispatchStatus,
} from "./types/dispatch";
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
        ? `위도 ${latitude.toFixed(5)}, 경도 ${longitude.toFixed(5)}`
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
  | "admin-species";

export default function App() {
  const [activeModule, setActiveModule] =
    useState<ModuleId>("dashboard");

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

  const [
    fieldVoiceLogs,
    setFieldVoiceLogs,
  ] = useState<FieldVoiceLogRecord[]>([]);



  const [selectedGrid, setSelectedGrid] =
    useState<any>(null);

  const [
    dispatchAssignments,
    setDispatchAssignments,
  ] = useState<DispatchAssignment[]>([]);

  const [isChatOpen, setIsChatOpen] =
    useState(false);

  const [isSidebarOpen, setIsSidebarOpen] =
    useState(false);

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

  const handleAssignWorker = (
    assignment: DispatchAssignment
  ) => {
    setDispatchAssignments((previous) => {
      const duplicated = previous.some(
        (item) =>
          item.workerId === assignment.workerId &&
          item.gridId === assignment.gridId
      );

      if (duplicated) {
        return previous;
      }

      return [assignment, ...previous];
    });
  };

  const handleUpdateDispatchStatus = (
    assignmentId: string,
    status: DispatchStatus
  ) => {
    setDispatchAssignments((previous) =>
      previous.map((assignment) =>
        assignment.assignmentId === assignmentId
          ? {
            ...assignment,
            status,
          }
          : assignment
      )
    );
  };

  const handleCancelDispatch = (
    assignmentId: string
  ) => {
    setDispatchAssignments((previous) =>
      previous.filter(
        (assignment) =>
          assignment.assignmentId !== assignmentId
      )
    );
  };

  const handleConfirmInfection = async (
    report: CrowdReport
  ) => {
    const newTree: TreeRecord = {
      id:
        `PT-${new Date().getFullYear()}-` +
        `${Math.floor(
          1000 + Math.random() * 9000
        )}`,
      region: report.region,
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

  const liveAlerts = [
    {
      id: "ALERT-001",
      time: "14:28",
      title: "고위험 후보 격자 위험도 상승",
      description:
        "신규 확산위험 후보지역의 위험도가 상승해 우선 예찰 검토가 필요합니다.",
      tone: "danger" as const,
      icon: Radio,
    },
    {
      id: "ALERT-002",
      time: "14:15",
      title: "접근 취약지역 드론 예찰 검토",
      description:
        "도로 접근성이 낮은 후보지역에 대한 드론 사전 예찰 검토가 요청됐습니다.",
      tone: "warning" as const,
      icon: MapPinned,
    },
    {
      id: "ALERT-003",
      time: "13:30",
      title: "현장 확인 결과 입력 대기",
      description:
        "현장 예찰 완료 격자의 활동보고서 입력 상태를 확인해야 합니다.",
      tone: "info" as const,
      icon: Clock3,
    },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[#F5F7FA] font-sans text-slate-800">
      <div
        className="grid h-full transition-[grid-template-columns] duration-300 ease-out"
        style={{
          gridTemplateColumns: isSidebarOpen
            ? "240px minmax(0, 1fr)"
            : "50px minmax(0, 1fr)",
        }}
      >
        <aside className="relative flex h-full min-w-0 flex-col border-r border-slate-200 bg-white py-4 shadow-sm">
          <div
            className={
              isSidebarOpen
                ? "flex w-full items-center gap-3 px-4"
                : "flex w-full justify-center"
            }
          >
            <button
              type="button"
              onClick={() =>
                setIsAlertPanelOpen((previous) => !previous)
              }
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
                onClick={() =>
                  setIsAlertPanelOpen((previous) => !previous)
                }
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
            onClick={() =>
              setIsSidebarOpen((previous) => !previous)
            }
            className="absolute -right-4 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:text-emerald-700"
            aria-label={
              isSidebarOpen
                ? "사이드바 닫기"
                : "사이드바 열기"
            }
            title={
              isSidebarOpen
                ? "사이드바 닫기"
                : "사이드바 열기"
            }
          >
            {isSidebarOpen ? (
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
                            ? "flex h-9 w-full items-center gap-3 rounded-lg bg-emerald-100 px-3 text-left text-emerald-900"
                            : "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-800"
                        }
                      >
                        <Camera
                          size={16}
                          className="shrink-0"
                        />

                        <span className="truncate text-xs font-extrabold">
                          실사 드론 사진 감염도 확인
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
                          실사 드론 사진 감염도 확인
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
                      title={activeModuleLabel}
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
                  />
                )}

                {activeModule === "field" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <FieldSection
                      workers={workers}
                      reports={reports}
                      dispatchAssignments={dispatchAssignments}
                      onUpdateDispatchStatus={handleUpdateDispatchStatus}
                      onCancelDispatch={handleCancelDispatch}
                      onUpdateWorkerStatus={handleUpdateWorkerStatus}
                      onConfirmInfection={handleConfirmInfection}
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
                      onAddTask={handleAddTask}
                      onUpdateTaskProgress={handleUpdateTaskProgress}
                    />
                  </div>
                )}

                {activeModule === "control-work" && (
                  <div className="h-full min-h-0 overflow-y-auto pr-1">
                    <SimulationSection />
                  </div>
                )}

                {(activeModule === "admin-report" ||
                  activeModule === "admin-species") && (
                  <div className="h-full overflow-y-auto pr-1">
                    <AdminSection
                      title={activeModuleLabel}
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
          <>
            <motion.button
              type="button"
              aria-label="실시간 알림 닫기"
              onClick={() => setIsAlertPanelOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[45] bg-slate-950/20"
            />

            <motion.aside
              initial={{
                opacity: 0,
                x: -18,
                scale: 0.98,
              }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                x: -18,
                scale: 0.98,
              }}
              transition={{
                duration: 0.18,
              }}
              className="fixed left-4 top-4 z-[50] flex max-h-[calc(100vh-32px)] w-[390px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
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
          </>
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
