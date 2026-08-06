import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Battery,
  CircleX,
  Image as ImageIcon,
  ListCheckIcon,
  LoaderCircle,
  MapPin,
  UserCheck,
  Users,
} from "lucide-react";

import {
  CrowdReport,
  WorkerStatus,
} from "../types";

import {
  DispatchAssignment,
  DispatchStatus,
} from "../types/dispatch";

import { LeafletMap } from "./LeafletMap";
import {
  FIELD_WORKERS,
  type FieldWorkerMarker,
} from "../config/operationsMockData";

type SurveyWorkerCandidate = {
  workerId: string;
  workerName: string;
  homeSidoName: string;
  homeSigunguCode: string;
  homeSigunguName: string;
  baseLatitude: number;
  baseLongitude: number;
  skillLevel: number;
  batteryPercent: number | null;
  remainingMinutes: number;
};

interface FieldSectionProps {
  reports: CrowdReport[];

  /*
   * 현재 App.tsx 호출부와의 호환성을 위해 유지합니다.
   * 이 화면에서는 시민 제보 관련 기능만 사용합니다.
   */
  workers?: WorkerStatus[];
  dispatchAssignments?: DispatchAssignment[];

  onUpdateDispatchStatus?: (
    assignmentId: string,
    status: DispatchStatus
  ) => void;

  onCancelDispatch?: (
    assignmentId: string
  ) => void;

  onUpdateWorkerStatus?: (
    id: string,
    status: WorkerStatus["status"]
  ) => void;

  onConfirmInfection?: (
    report: CrowdReport
  ) => boolean | Promise<boolean>;

  onRejectReport?: (
    report: CrowdReport
  ) => boolean | Promise<boolean>;

  onAssignWorker?: (
    assignment: DispatchAssignment
  ) => void;
}

type FlexibleCrowdReport = CrowdReport & {
  image_url?: string;
  imageUrl?: string;
  photo_url?: string;
  photoUrl?: string;
  image?: string;
  file_url?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
};

function getReportImageUrl(report?: CrowdReport): string {
  if (!report) return "";

  const flexibleReport = report as FlexibleCrowdReport;

  return (
    flexibleReport.image_url ||
    flexibleReport.imageUrl ||
    flexibleReport.photo_url ||
    flexibleReport.photoUrl ||
    flexibleReport.image ||
    flexibleReport.file_url ||
    ""
  );
}

function getReportLatitude(
  report?: CrowdReport
): number | string | undefined {
  if (!report) return undefined;

  const flexibleReport = report as FlexibleCrowdReport;

  return (
    flexibleReport.latitude ??
    flexibleReport.lat
  );
}

function getReportLongitude(
  report?: CrowdReport
): number | string | undefined {
  if (!report) return undefined;

  const flexibleReport = report as FlexibleCrowdReport;

  return (
    flexibleReport.longitude ??
    flexibleReport.lng
  );
}

function formatCoordinate(
  value: number | string | undefined
): string {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "좌표 없음";
  }

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return numericValue.toFixed(7);
  }

  return String(value);
}

function toFiniteNumber(
  value: unknown,
  fallback = 0
): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue
    : fallback;
}


function getReportStatusLabel(
  status: CrowdReport["status"]
): string {
  switch (String(status)) {
    case "pending":
    case "접수 완료":
      return "접수 완료";

    case "in_progress":
    case "조사 완료":
      return "조사 완료";

    case "completed":
    case "방제 완료":
      return "방제 완료";

    default:
      return String(status);
  }
}

function getReportStatusClass(
  status: CrowdReport["status"]
): string {
  switch (String(status)) {
    case "접수 완료":
    case "pending":
      return "bg-sky-100 text-sky-700";

    case "조사 완료":
    case "in_progress":
      return "bg-amber-100 text-amber-700";

    case "방제 완료":
    case "completed":
    case "확진전환":
      return "bg-emerald-100 text-emerald-700";

    case "반려":
      return "bg-slate-200 text-slate-600";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function FieldSection({
  reports,
  onConfirmInfection,
  onRejectReport,
  onAssignWorker,
  dispatchAssignments = [],
}: FieldSectionProps) {
  const [selectedReportId, setSelectedReportId] =
    useState<string | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] =
    useState<string | null>(null);

  const [selectedAssignmentId, setSelectedAssignmentId] =
    useState<string | null>(null);

  const [convertedReportIds, setConvertedReportIds] =
    useState<Set<string>>(() => new Set());

  const [assignmentReportId, setAssignmentReportId] =
    useState<string | null>(null);

  const [processingReportId, setProcessingReportId] =
    useState<string | null>(null);

  const [rejectingReportId, setRejectingReportId] =
    useState<string | null>(null);

  const [surveyWorkerCandidates, setSurveyWorkerCandidates] =
    useState<SurveyWorkerCandidate[]>([]);

  const [workerLoadError, setWorkerLoadError] =
    useState("");

  const selectedReport =
    reports.find(
      (report) =>
        String(report.id) === selectedReportId
    ) || null;

  const selectedWorker =
    FIELD_WORKERS.find(
      (worker) => worker.id === selectedWorkerId
    ) || null;

  const surveyAssignments = useMemo(
    () => dispatchAssignments.filter(
      (assignment) =>
        assignment.taskType === "SURVEY" &&
        assignment.status !== "복귀 완료"
    ),
    [dispatchAssignments]
  );

  const availableSurveyWorkers = useMemo(() => {
    const assignedWorkerIds = new Set(
      surveyAssignments.map(
        (assignment) => assignment.workerId
      )
    );

    return surveyWorkerCandidates
      .filter(
        (worker) =>
          !assignedWorkerIds.has(worker.workerId)
      )
      .slice(0, 8);
  }, [surveyAssignments, surveyWorkerCandidates]);

  const selectedAssignment =
    surveyAssignments.find(
      (assignment) =>
        assignment.assignmentId ===
        selectedAssignmentId
    ) || null;

  useEffect(() => {
    if (
      selectedReportId !== null &&
      !reports.some(
        (report) =>
          String(report.id) === selectedReportId
      )
    ) {
      setSelectedReportId(null);
    }
  }, [reports, selectedReportId]);

  useEffect(() => {
    if (
      selectedAssignmentId !== null &&
      !surveyAssignments.some(
        (assignment) =>
          assignment.assignmentId ===
          selectedAssignmentId
      )
    ) {
      setSelectedAssignmentId(null);
    }
  }, [surveyAssignments, selectedAssignmentId]);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch("/data/workforce_v2/workers.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch("/data/workforce_v2/worker_capabilities.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch("/data/workforce_v2/worker_availability.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch("/data/workforce_v2/worker_current_status.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
    ])
      .then(async (responses) => {
        for (const response of responses) {
          if (!response.ok) {
            throw new Error(
              `요원 데이터 로드 실패 (${response.status})`
            );
          }
        }

        const [
          workersData,
          capabilitiesData,
          availabilityData,
          currentStatusData,
        ] = await Promise.all(
          responses.map((response) => response.json())
        );

        if (
          !Array.isArray(workersData) ||
          !Array.isArray(capabilitiesData) ||
          !Array.isArray(availabilityData) ||
          !Array.isArray(currentStatusData)
        ) {
          throw new Error("요원 데이터 형식이 올바르지 않습니다.");
        }

        const surveySkillMap = new Map<string, number>();
        for (const row of capabilitiesData) {
          if (String(row.task_type ?? "") !== "SURVEY") {
            continue;
          }

          surveySkillMap.set(
            String(row.worker_id ?? ""),
            toFiniteNumber(row.skill_level, 1)
          );
        }

        const availabilityMap = new Map(
          availabilityData.map((row: any) => [
            String(row.worker_id ?? ""),
            row,
          ])
        );

        const currentStatusMap = new Map(
          currentStatusData.map((row: any) => [
            String(row.worker_id ?? ""),
            row,
          ])
        );

        const candidates = workersData
          .map((row: any): SurveyWorkerCandidate | null => {
            const workerId = String(row.worker_id ?? "");
            const skillLevel = surveySkillMap.get(workerId);

            if (!workerId || skillLevel === undefined) {
              return null;
            }

            const availability =
              availabilityMap.get(workerId) ?? {};
            const currentStatus =
              currentStatusMap.get(workerId) ?? {};
            const availabilityStatus = String(
              availability.availability_status ?? "UNAVAILABLE"
            );
            const status = String(
              currentStatus.status ?? "UNAVAILABLE"
            );

            if (
              !["AVAILABLE", "PARTIAL", "대기", "가능"].includes(
                availabilityStatus
              ) ||
              !["AVAILABLE", "대기", "복귀"].includes(status) ||
              toFiniteNumber(availability.remaining_minutes) <= 0
            ) {
              return null;
            }

            return {
              workerId,
              workerName: String(row.worker_name ?? "현장 요원"),
              homeSidoName: String(row.home_sido_name ?? ""),
              homeSigunguCode: String(row.home_sigungu_code ?? ""),
              homeSigunguName: String(row.home_sigungu_name ?? ""),
              baseLatitude: toFiniteNumber(row.base_lat),
              baseLongitude: toFiniteNumber(row.base_lon),
              skillLevel,
              batteryPercent:
                currentStatus.battery_level == null
                  ? null
                  : toFiniteNumber(currentStatus.battery_level),
              remainingMinutes: toFiniteNumber(
                availability.remaining_minutes
              ),
            };
          })
          .filter(
            (worker: SurveyWorkerCandidate | null): worker is SurveyWorkerCandidate =>
              worker !== null
          )
          .sort(
            (left, right) =>
              right.skillLevel - left.skillLevel ||
              right.remainingMinutes - left.remainingMinutes
          );

        setSurveyWorkerCandidates(candidates);
        setWorkerLoadError("");
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("예찰 요원 데이터 로드 실패:", error);
        setWorkerLoadError(
          error instanceof Error
            ? error.message
            : "요원 목록을 불러오지 못했습니다."
        );
      });

    return () => controller.abort();
  }, []);

  const handleToggleReport = (
    reportId: string
  ) => {
    setSelectedReportId((previous) =>
      previous === reportId
        ? null
        : reportId
    );
  };

  const handleAssignAndConfirm = async (
    report: CrowdReport,
    worker: SurveyWorkerCandidate
  ) => {
    const reportId = String(report.id);

    if (
      convertedReportIds.has(reportId) ||
      processingReportId === reportId
    ) {
      return;
    }

    setProcessingReportId(reportId);

    try {
      const confirmed = await onConfirmInfection?.(report);

      if (confirmed === false) {
        return;
      }

      const latitude = toFiniteNumber(
        getReportLatitude(report),
        worker.baseLatitude
      );
      const longitude = toFiniteNumber(
        getReportLongitude(report),
        worker.baseLongitude
      );
      const regionParts = String(report.region ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      onAssignWorker?.({
        assignmentId: `REPORT-${reportId}-${Date.now()}`,
        workerId: worker.workerId,
        workerName: worker.workerName,
        workerType: "현장요원",
        taskType: "SURVEY",
        workerCapabilities: [
          {
            taskType: "SURVEY",
            skillLevel: worker.skillLevel,
          },
        ],
        assignedSkillLevel: worker.skillLevel,
        homeSidoName: worker.homeSidoName,
        homeSigunguCode: worker.homeSigunguCode,
        homeSigunguName: worker.homeSigunguName,
        targetSidoName: regionParts[0] ?? "",
        targetSigunguCode: "",
        targetSigunguName: regionParts[1] ?? report.region ?? "",
        targetEmdCode: "",
        targetEmdName: regionParts.slice(2).join(" "),
        gridId: `CIVIL-${reportId}`,
        targetLatitude: latitude,
        targetLongitude: longitude,
        priorityGrade: "현장 확인",
        riskGrade:
          report.aiProbability >= 75
            ? "매우 높음"
            : report.aiProbability >= 45
              ? "높음"
              : "주의",
        riskScore: report.aiProbability,
        accessScore: 0,
        distanceKm: null,
        travelTimeHour: null,
        batteryPercent: worker.batteryPercent,
        remainingMinutesAtAssignment: worker.remainingMinutes,
        recommendationReason:
          `시민 제보 ${reportId} 확진 전환 후 현장 확인 배정`,
        assignmentType: "지역 내 배정",
        status: "출동",
        assignedAt: new Date().toISOString(),
      });

      setConvertedReportIds((previous) => {
        const next = new Set(previous);
        next.add(reportId);
        return next;
      });
      setAssignmentReportId(null);
    } finally {
      setProcessingReportId(null);
    }
  };

  const handleRejectReport = async (
    report: CrowdReport
  ) => {
    const reportId = String(report.id);

    if (rejectingReportId === reportId) {
      return;
    }

    setRejectingReportId(reportId);

    try {
      const rejected = await onRejectReport?.(report);

      if (rejected !== false) {
        setAssignmentReportId(null);
        setSelectedReportId(null);
      }
    } finally {
      setRejectingReportId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full min-h-0 w-full min-w-0"
    >
      <div className="grid h-full min-h-0 grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
      {/* 왼쪽: 목록과 선택 항목 상세를 하나의 패널에 통합 */}
      <section className="min-h-0 min-w-0 xl:col-span-6">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <ListCheckIcon
                size={18}
                className="shrink-0 text-emerald-700"
              />

              <h2 className="text-base font-black text-slate-950">
                감염 의심목 예찰 리스트
              </h2>
            </div>

            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              항목을 선택하면 현장 이미지와 처리 정보를 확인할 수 있습니다.
            </p>
          </header>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pr-3">
            {reports.length === 0 && surveyAssignments.length === 0 && (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
                등록된 시민 제보 또는 예찰 배정이 없습니다.
              </div>
            )}

            {surveyAssignments.map((assignment) => {
              const isSelected =
                selectedAssignmentId ===
                assignment.assignmentId;
              const latitude =
                assignment.targetLatitude;
              const longitude =
                assignment.targetLongitude;

              return (
                <article
                  key={assignment.assignmentId}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    isSelected
                      ? "border-emerald-300 shadow-sm"
                      : "border-emerald-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssignmentId(
                        assignment.assignmentId
                      );
                      setSelectedReportId(null);
                      setSelectedWorkerId(null);
                    }}
                    className={`w-full p-4 text-left transition ${
                      isSelected
                        ? "bg-emerald-50"
                        : "bg-emerald-50/40 hover:bg-emerald-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-emerald-600" />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400">
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-700">
                              격자 예찰 배정
                            </span>
                            <span>
                              {new Date(
                                assignment.assignedAt
                              ).toLocaleDateString("ko-KR")}
                            </span>
                          </div>

                          <h3 className="mt-1 truncate text-sm font-bold text-slate-800">
                            GRID-{assignment.gridId} 예찰 작업
                          </h3>

                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            위도 {formatCoordinate(latitude)}, 경도 {formatCoordinate(longitude)}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-bold text-slate-400">
                          담당 요원
                        </div>
                        <div className="mt-0.5 text-sm font-black text-emerald-700">
                          {assignment.workerName}
                        </div>
                        <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">
                          {assignment.status}
                        </span>
                      </div>
                    </div>
                  </button>
                </article>
              );
            })}

            {reports.map((report) => {
              const reportId = String(report.id);
              const isSelected =
                selectedReportId === reportId;
              const imageUrl =
                getReportImageUrl(report);
              const latitude =
                getReportLatitude(report);
              const longitude =
                getReportLongitude(report);

              return (
                <article
                  key={reportId}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    isSelected
                      ? "border-emerald-300 shadow-sm"
                      : "border-slate-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleReport(reportId)
                    }
                    className={`w-full p-4 text-left transition ${
                      isSelected
                        ? "bg-emerald-50"
                        : "bg-slate-50/60 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <span
                          className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
                            report.aiProbability >= 75
                              ? "bg-rose-500"
                              : report.aiProbability >= 45
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                        />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400">
                            <span className="font-mono">
                              {reportId}
                            </span>
                            <span>{report.date}</span>
                          </div>

                          <h3 className="mt-1 truncate text-sm font-bold text-slate-800">
                            {report.title}
                          </h3>

                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            위도 {formatCoordinate(latitude)}, 경도 {formatCoordinate(longitude)}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-bold text-slate-400">
                          AI 감염 가능성
                        </div>

                        <div
                          className={`text-lg font-black ${
                            report.aiProbability >= 75
                              ? "text-rose-600"
                              : report.aiProbability >= 45
                                ? "text-amber-600"
                                : "text-emerald-600"
                          }`}
                        >
                          {report.aiProbability}%
                        </div>

                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${getReportStatusClass(
                            report.status
                          )}`}
                        >
                          {getReportStatusLabel(report.status)}
                        </span>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isSelected && (
                      <motion.div
                        initial={{
                          height: 0,
                          opacity: 0,
                        }}
                        animate={{
                          height: "auto",
                          opacity: 1,
                        }}
                        exit={{
                          height: 0,
                          opacity: 0,
                        }}
                        transition={{ duration: 0.24 }}
                        className="overflow-hidden border-t border-emerald-200 bg-white"
                      >
                        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                          {/* 상세 정보 */}
                          <div className="space-y-3">
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <div className="text-[10px] font-bold text-slate-400">
                                제보 상세 내용
                              </div>

                              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                                {report.description ||
                                  "등록된 상세 설명이 없습니다."}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                <div className="text-[10px] font-bold text-slate-400">
                                  위치
                                </div>

                                <div className="mt-1 break-all font-mono text-[11px] font-black leading-5 text-slate-800">
                                  위도 {formatCoordinate(latitude)}
                                  <br />
                                  경도 {formatCoordinate(longitude)}
                                </div>
                              </div>

                              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                                <div className="text-[10px] font-bold text-rose-400">
                                  AI 감염 매핑지수
                                </div>

                                <div className="mt-1 text-lg font-black text-rose-600">
                                  {report.aiProbability}%
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setAssignmentReportId((previous) =>
                                    previous === reportId
                                      ? null
                                      : reportId
                                  );
                                }}
                                disabled={
                                  convertedReportIds.has(reportId) ||
                                  processingReportId === reportId ||
                                  rejectingReportId === reportId
                                }
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-800 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-700"
                              >
                                <UserCheck size={14} />
                                {convertedReportIds.has(reportId)
                                  ? "확진목 전환 완료"
                                  : "확진목 전환"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void handleRejectReport(report);
                                }}
                                disabled={
                                  processingReportId === reportId ||
                                  rejectingReportId === reportId
                                }
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {rejectingReportId === reportId ? (
                                  <LoaderCircle
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <CircleX size={14} />
                                )}
                                {rejectingReportId === reportId
                                  ? "삭제 중"
                                  : "반려"}
                              </button>
                            </div>

                            {assignmentReportId === reportId && (
                              <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50">
                                <div className="border-b border-emerald-100 px-3 py-2.5">
                                  <div className="text-xs font-black text-emerald-900">
                                    예찰 요원 선택
                                  </div>
                                  <div className="mt-0.5 text-[10px] font-semibold text-emerald-700/70">
                                    배정하면 확진목 전환과 현장 출동이 함께 처리됩니다.
                                  </div>
                                </div>

                                <div className="custom-scrollbar max-h-56 space-y-2 overflow-y-auto p-2">
                                  {workerLoadError && (
                                    <div className="rounded-lg border border-rose-100 bg-white p-3 text-[11px] font-bold text-rose-600">
                                      {workerLoadError}
                                    </div>
                                  )}

                                  {!workerLoadError &&
                                    availableSurveyWorkers.length === 0 && (
                                      <div className="rounded-lg border border-dashed border-emerald-200 bg-white p-4 text-center text-[11px] font-bold text-slate-400">
                                        현재 배정 가능한 예찰 요원이 없습니다.
                                      </div>
                                    )}

                                  {availableSurveyWorkers.map((worker) => (
                                    <div
                                      key={worker.workerId}
                                      className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-white p-3"
                                    >
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="truncate text-xs font-black text-slate-800">
                                            {worker.workerName}
                                          </span>
                                          <span className="font-mono text-[9px] font-bold text-slate-400">
                                            {worker.workerId}
                                          </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">
                                          <span>예찰 {worker.skillLevel}단계</span>
                                          <span>{worker.homeSigunguName}</span>
                                          <span className="flex items-center gap-1">
                                            <Battery size={11} />
                                            {worker.batteryPercent ?? "-"}%
                                          </span>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          void handleAssignAndConfirm(
                                            report,
                                            worker
                                          );
                                        }}
                                        disabled={processingReportId === reportId}
                                        className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {processingReportId === reportId ? (
                                          <LoaderCircle
                                            size={12}
                                            className="animate-spin"
                                          />
                                        ) : (
                                          <UserCheck size={12} />
                                        )}
                                        배정
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 현장 이미지 */}
                          <div className="space-y-3">
                            <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl bg-slate-950">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt="시민 제보 현장 이미지"
                                  className="max-h-[360px] w-full object-contain"
                                  onError={(event) => {
                                    event.currentTarget.style.display =
                                      "none";
                                  }}
                                />
                              ) : (
                                <div className="p-6 text-center text-slate-400">
                                  <ImageIcon
                                    size={36}
                                    className="mx-auto mb-3 opacity-60"
                                  />

                                  <p className="text-xs font-bold">
                                    등록된 제보 이미지가 없습니다.
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <MapPin size={13} />
                                제보 위치 좌표
                              </div>

                              <p className="mt-1 break-all font-mono text-[11px] font-bold text-slate-700">
                                latitude: {formatCoordinate(latitude)} / longitude: {formatCoordinate(longitude)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 오른쪽: 위치 지도 */}
      <section className="min-h-0 min-w-0 xl:col-span-6">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin
                    size={18}
                    className="shrink-0 text-rose-500"
                  />

                  <h2 className="text-base font-black text-slate-950">
                    시민 제보 및 현장 예찰 요원 지도
                  </h2>
                </div>

                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  제보 마커와 현장 예찰 요원의 현재 위치를 함께 확인합니다.
                </p>
              </div>

              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                <Users size={12} /> 요원 {surveyAssignments.length}명
              </span>
            </div>
          </header>

          <div className="h-[360px] w-full min-w-0">
            <LeafletMap
              records={reports}
              selectedRecordId={
                selectedReport?.id
              }
              onMarkerClick={(
                record: CrowdReport
              ) => {
                setSelectedWorkerId(null);
                setSelectedAssignmentId(null);
                setSelectedReportId(
                  String(record.id)
                );
              }}
              workers={FIELD_WORKERS}
              assignments={surveyAssignments}
              selectedAssignmentId={selectedAssignmentId}
              onAssignmentClick={(assignment: DispatchAssignment) => {
                setSelectedReportId(null);
                setSelectedWorkerId(null);
                setSelectedAssignmentId(
                  assignment.assignmentId
                );
              }}
              selectedWorkerId={selectedWorkerId}
              onWorkerClick={(worker: FieldWorkerMarker) => {
                setSelectedReportId(null);
                setSelectedAssignmentId(null);
                setSelectedWorkerId(worker.id);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-black uppercase text-slate-400">
                위도
              </div>

              <div className="mt-1 break-all font-mono text-xs font-bold text-slate-800">
                {selectedReport
                  ? formatCoordinate(
                      getReportLatitude(
                        selectedReport
                      )
                    )
                  : selectedAssignment &&
                      typeof selectedAssignment.targetLatitude === "number"
                    ? selectedAssignment.targetLatitude.toFixed(7)
                  : selectedWorker
                    ? selectedWorker.latitude.toFixed(7)
                    : "마커를 선택하세요"}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-black uppercase text-slate-400">
                경도
              </div>

              <div className="mt-1 break-all font-mono text-xs font-bold text-slate-800">
                {selectedReport
                  ? formatCoordinate(
                      getReportLongitude(
                        selectedReport
                      )
                    )
                  : selectedAssignment &&
                      typeof selectedAssignment.targetLongitude === "number"
                    ? selectedAssignment.targetLongitude.toFixed(7)
                  : selectedWorker
                    ? selectedWorker.longitude.toFixed(7)
                    : "마커를 선택하세요"}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-emerald-700" />
                  <h3 className="text-sm font-black text-slate-900">
                    출동 중인 예찰 요원
                  </h3>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  현재 배정된 요원의 위치와 작업 상태입니다.
                </p>
              </div>

              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                {surveyAssignments.length}명
              </span>
            </div>

            <div className="custom-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {surveyAssignments.length === 0 && (
                <div className="flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-400">
                  현재 출동 중인 예찰 요원이 없습니다.
                </div>
              )}

              {surveyAssignments.map((assignment) => (
                <button
                  key={assignment.assignmentId}
                  type="button"
                  onClick={() => {
                    setSelectedReportId(null);
                    setSelectedWorkerId(null);
                    setSelectedAssignmentId(
                      assignment.assignmentId
                    );
                  }}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border p-3 text-left transition ${
                    selectedAssignmentId === assignment.assignmentId
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-100 bg-slate-50/70 hover:border-emerald-200 hover:bg-emerald-50/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-black text-slate-800">
                        {assignment.workerName}
                      </span>
                      <span className="font-mono text-[9px] font-bold text-slate-400">
                        {assignment.workerId}
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">
                        {assignment.status}
                      </span>
                    </div>

                    <div className="mt-1.5 grid gap-1 text-[10px] font-semibold text-slate-500 sm:grid-cols-2">
                      <span>작업 ID: {assignment.assignmentId}</span>
                      <span>
                        위치: {formatCoordinate(assignment.targetLatitude)}, {formatCoordinate(assignment.targetLongitude)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[10px] font-black text-slate-600 shadow-sm">
                    <Battery size={12} className="text-emerald-600" />
                    {assignment.batteryPercent ?? "-"}%
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      </div>
    </motion.div>
  );
}
