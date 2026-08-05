import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Image as ImageIcon,
  ListCheckIcon,
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
import { InventoryPanel } from "./InventoryPanel";
import {
  FIELD_WORKERS,
  type FieldWorkerMarker,
} from "../config/operationsMockData";

interface FieldSectionProps {
  reports: CrowdReport[];

  onUpdateReportStatus: (
    id: string,
    status: CrowdReport["status"]
  ) => void;

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
  onUpdateReportStatus,
  onConfirmInfection,
}: FieldSectionProps) {
  const [selectedReportId, setSelectedReportId] =
    useState<string | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] =
    useState<string | null>(null);

  const [convertedReportIds, setConvertedReportIds] =
    useState<Set<string>>(() => new Set());

  const selectedReport =
    reports.find(
      (report) =>
        String(report.id) === selectedReportId
    ) || null;

  const selectedWorker =
    FIELD_WORKERS.find(
      (worker) => worker.id === selectedWorkerId
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

  const handleToggleReport = (
    reportId: string
  ) => {
    setSelectedReportId((previous) =>
      previous === reportId
        ? null
        : reportId
    );
  };

  const handleConfirmReport = (
    report: CrowdReport
  ) => {
    const reportId = String(report.id);

    if (convertedReportIds.has(reportId)) {
      return;
    }

    onConfirmInfection?.(report);

    setConvertedReportIds((previous) => {
      const next = new Set(previous);
      next.add(reportId);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full w-full min-w-0 space-y-6"
    >
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
      {/* 왼쪽: 목록과 선택 항목 상세를 하나의 패널에 통합 */}
      <section className="min-w-0 xl:col-span-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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

          <div className="custom-scrollbar max-h-[calc(100vh-220px)] min-h-0 space-y-2 overflow-y-scroll p-4 pr-3">
            {reports.length === 0 && (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
                Supabase에 등록된 시민 제보가 없습니다.
              </div>
            )}

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

                              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                <label
                                  htmlFor={`report-status-${reportId}`}
                                  className="text-[10px] font-bold text-slate-400"
                                >
                                  민원 처리 상태
                                </label>

                                <select
                                  id={`report-status-${reportId}`}
                                  value={getReportStatusLabel(report.status)}
                                  onChange={(event) =>
                                    onUpdateReportStatus(
                                      reportId,
                                      event.target.value as CrowdReport["status"]
                                    )
                                  }
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-black text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                >
                                  <option value="접수 완료">접수 완료</option>
                                  <option value="조사 완료">조사 완료</option>
                                  <option value="방제 완료">방제 완료</option>
                                </select>
                              </div>

                              <div className="col-span-2 rounded-xl border border-rose-100 bg-rose-50 p-3">
                                <div className="text-[10px] font-bold text-rose-400">
                                  AI 감염 매핑지수
                                </div>

                                <div className="mt-1 text-lg font-black text-rose-600">
                                  {report.aiProbability}%
                                </div>
                              </div>
                            </div>

                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleConfirmReport(report)
                                }
                                disabled={
                                  convertedReportIds.has(reportId)
                                }
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-800 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-700"
                              >
                                <UserCheck size={14} />
                                {convertedReportIds.has(reportId)
                                  ? "확진목 전환 완료"
                                  : "확진목 전환"}
                              </button>
                            </div>
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
      <section className="min-w-0 xl:col-span-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                <Users size={12} /> 요원 {FIELD_WORKERS.length}명
              </span>
            </div>
          </header>

          <div className="h-[600px] w-full min-w-0">
            <LeafletMap
              records={reports}
              selectedRecordId={
                selectedReport?.id
              }
              onMarkerClick={(
                record: CrowdReport
              ) => {
                setSelectedWorkerId(null);
                setSelectedReportId(
                  String(record.id)
                );
              }}
              workers={FIELD_WORKERS}
              selectedWorkerId={selectedWorkerId}
              onWorkerClick={(worker: FieldWorkerMarker) => {
                setSelectedReportId(null);
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
                  : selectedWorker
                    ? selectedWorker.longitude.toFixed(7)
                    : "마커를 선택하세요"}
              </div>
            </div>
          </div>
        </div>
      </section>
      </div>

      <InventoryPanel />
    </motion.div>
  );
}
