import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Package,
  TreePine,
} from "lucide-react";

import {
  fetchLinkedReportStatus,
  fetchReportOptions,
  fetchReports,
  getDownloadUrl,
  getLinkedExcelDownloadUrl,
  getLinkedZipDownloadUrl,
  getPreviewUrl,
  type LinkedReportStatus,
  type ReportFormat,
  type ReportItem,
  type ReportOptions,
  type ReportType,
} from "../services/reportApi";
import NewReportGenerator from "./NewReportGenerator";
import ReportGridSelector from "./ReportGridSelector";
import SectionTitle from "./SectionTitle";
import {
  recommendSpecies,
  type SpeciesRecommendation,
} from "../services/speciesApi";

interface AdminSectionProps {
  title: string;
  view?: "report" | "species";
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  prediction: "발생 예측",
  field_survey: "현장 예찰",
  control: "방제",
};


const FORMAT_LABELS: Record<ReportFormat, string> = {
  pdf: "PDF",
  docx: "DOCX",
  xlsx: "XLSX",
};


function openDownload(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}


function scoreText(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return Number(value).toFixed(1);
}


export default function AdminSection({
  title,
  view = "report",
}: AdminSectionProps) {
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);
  const [reportMode, setReportMode] = useState<"create" | "browse">("create");

  // --------------------------------------------
  // 실제 행정 보고서 조회·미리보기·다운로드 상태
  // --------------------------------------------
  const [reportType, setReportType] = useState<ReportType>("prediction");
  const [format, setFormat] = useState<ReportFormat>("pdf");

  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSido, setSelectedSido] = useState("");
  const [selectedSigungu, setSelectedSigungu] = useState("");
  const [selectedDocumentNo, setSelectedDocumentNo] = useState("");

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [linkedStatus, setLinkedStatus] = useState<LinkedReportStatus | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // --------------------------------------------
  // AI 친환경 수종전환 추천 (격자 기반)
  // 지도에서 위험후보 격자를 선택하면 해당 격자의 입지·수종구성 근거로 추천한다.
  // --------------------------------------------
  const [speciesSido, setSpeciesSido] = useState("");
  const [speciesSigungu, setSpeciesSigungu] = useState("");
  const [speciesGridId, setSpeciesGridId] = useState("");
  const [reforestData, setReforestData] = useState<SpeciesRecommendation | null>(
    null,
  );
  const [reforestLoading, setReforestLoading] = useState(false);
  const [reforestError, setReforestError] = useState<string | null>(null);

  const selectedReport = useMemo(
    () => reports.find((item) => item.document_no === selectedDocumentNo) ?? null,
    [reports, selectedDocumentNo],
  );

  // 보고서 유형 변경 시 하위 필터를 초기화한다.
  useEffect(() => {
    setSelectedYear("");
    setSelectedSido("");
    setSelectedSigungu("");
    setSelectedDocumentNo("");
    setReports([]);
    setLinkedStatus(null);
    setPreviewUrl(null);
    setReportError(null);
  }, [reportType]);

  // 유형·연도·시도에 따라 선택 가능한 옵션을 가져온다.
  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setOptionsLoading(true);
      setReportError(null);

      try {
        const data = await fetchReportOptions({
          report_type: reportType,
          year: selectedYear || undefined,
          sido_name: selectedSido || undefined,
        });

        if (!cancelled) {
          setOptions(data);
        }
      } catch (error) {
        if (!cancelled) {
          setReportError(
            error instanceof Error
              ? error.message
              : "보고서 선택 옵션을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setOptionsLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [reportType, selectedYear, selectedSido]);

  // 선택된 필터에 해당하는 보고서 목록을 가져온다.
  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setReportsLoading(true);
      setReportError(null);
      setSelectedDocumentNo("");
      setLinkedStatus(null);
      setPreviewUrl(null);

      try {
        const data = await fetchReports({
          report_type: reportType,
          year: selectedYear || undefined,
          sido_name: selectedSido || undefined,
          sigungu_name: selectedSigungu || undefined,
        });

        if (!cancelled) {
          setReports(data.items);
        }
      } catch (error) {
        if (!cancelled) {
          setReports([]);
          setReportError(
            error instanceof Error
              ? error.message
              : "보고서 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setReportsLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [reportType, selectedYear, selectedSido, selectedSigungu, reportsRefreshKey]);

  // 문서번호를 선택하면 3종 연결 상태를 확인한다.
  useEffect(() => {
    let cancelled = false;

    async function loadLinkedStatus() {
      if (!selectedDocumentNo) {
        setLinkedStatus(null);
        return;
      }

      setLinkedLoading(true);
      setReportError(null);

      try {
        const data = await fetchLinkedReportStatus(selectedDocumentNo);

        if (!cancelled) {
          setLinkedStatus(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLinkedStatus(null);
          setReportError(
            error instanceof Error
              ? error.message
              : "연결 보고서 상태를 확인하지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLinkedLoading(false);
        }
      }
    }

    void loadLinkedStatus();

    return () => {
      cancelled = true;
    };
  }, [selectedDocumentNo]);

  const handlePreview = () => {
    if (!selectedDocumentNo) {
      setReportError("미리보기할 보고서를 먼저 선택해 주세요.");
      return;
    }

    setFormat("pdf");
    setReportError(null);
    setPreviewUrl(getPreviewUrl(reportType, selectedDocumentNo));
  };

  const handleDownload = () => {
    if (!selectedDocumentNo) {
      setReportError("다운로드할 보고서를 먼저 선택해 주세요.");
      return;
    }

    openDownload(
      getDownloadUrl(reportType, selectedDocumentNo, format),
    );
  };

  const handleLinkedZipDownload = () => {
    if (!selectedDocumentNo) {
      setReportError("연결 보고서를 먼저 선택해 주세요.");
      return;
    }

    if (!linkedStatus?.fully_linked) {
      setReportError(
        "예측·현장예찰·방제 보고서 3종이 모두 연결된 문서만 ZIP으로 받을 수 있습니다.",
      );
      return;
    }

    openDownload(getLinkedZipDownloadUrl(selectedDocumentNo));
  };

  const handleLinkedExcelDownload = () => {
    openDownload(
      getLinkedExcelDownloadUrl({
        year: selectedYear || undefined,
        sido_name: selectedSido || undefined,
        sigungu_name: selectedSigungu || undefined,
      }),
    );
  };

  // --------------------------------------------
  // AI 친환경 수종전환 추천 — 선택 격자 기반 백엔드 호출
  // --------------------------------------------
  const handleRecommendReforest = async () => {
    if (!speciesGridId) {
      setReforestError("지도에서 위험후보 격자를 먼저 선택하세요.");
      return;
    }

    setReforestLoading(true);
    setReforestData(null);
    setReforestError(null);

    try {
      const data = await recommendSpecies(Number(speciesGridId));
      setReforestData(data);
    } catch (err) {
      setReforestError(
        err instanceof Error
          ? err.message
          : "수종전환 추천을 불러오지 못했습니다.",
      );
    } finally {
      setReforestLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle title={title} />

      <AnimatePresence mode="wait">
        {view === "report" && (
          <motion.div
            key="report-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* 생성/조회 세그먼트 토글 */}
            <div className="flex max-w-xs rounded-2xl border border-slate-200 bg-slate-100 p-1 text-sm font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setReportMode("create")}
                className={`flex-1 rounded-xl py-2 transition-all ${
                  reportMode === "create"
                    ? "bg-white text-emerald-950 shadow-sm"
                    : "hover:text-slate-900"
                }`}
              >
                ✨ 신규 생성
              </button>
              <button
                type="button"
                onClick={() => setReportMode("browse")}
                className={`flex-1 rounded-xl py-2 transition-all ${
                  reportMode === "browse"
                    ? "bg-white text-emerald-950 shadow-sm"
                    : "hover:text-slate-900"
                }`}
              >
                📚 과거 조회
              </button>
            </div>

            {reportMode === "create" ? (
              <NewReportGenerator
                onRegistered={() => {
                  setReportsRefreshKey((current) => current + 1);
                  setReportMode("browse");
                }}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* 왼쪽: 보고서 필터·다운로드 */}
                <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 text-xs font-semibold shadow-sm lg:col-span-5">
              <div>
                <h3 className="flex items-center gap-2 text-base font-black text-slate-950">
                  <FileText size={19} className="text-emerald-800" />
                  실제 행정 보고서 조회·다운로드
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  생성 완료된 발생 예측·현장 예찰·방제 보고서를
                  연도와 지역, 중심 격자 기준으로 조회합니다.
                </p>
              </div>

              {reportError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{reportError}</span>
                </div>
              )}

              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-slate-600">보고서 업무 단계</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map(
                      (type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setReportType(type)}
                          className={`rounded-xl border px-2 py-2.5 font-bold transition ${
                            reportType === type
                              ? "border-emerald-800 bg-emerald-800 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {REPORT_TYPE_LABELS[type]}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-slate-600">분석 연도</label>
                    <select
                      value={selectedYear}
                      onChange={(event) => {
                        setSelectedYear(event.target.value);
                        setSelectedSido("");
                        setSelectedSigungu("");
                      }}
                      disabled={optionsLoading}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-bold text-slate-800 outline-none disabled:opacity-60"
                    >
                      <option value="">전체 연도</option>
                      {options?.years.map((year) => (
                        <option key={year} value={year}>
                          {year}년
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-600">시도</label>
                    <select
                      value={selectedSido}
                      onChange={(event) => {
                        setSelectedSido(event.target.value);
                        setSelectedSigungu("");
                      }}
                      disabled={optionsLoading}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-bold text-slate-800 outline-none disabled:opacity-60"
                    >
                      <option value="">전체 시도</option>
                      {options?.sidos.map((sido) => (
                        <option key={sido} value={sido}>
                          {sido}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600">시군구</label>
                  <select
                    value={selectedSigungu}
                    onChange={(event) => setSelectedSigungu(event.target.value)}
                    disabled={optionsLoading}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-bold text-slate-800 outline-none disabled:opacity-60"
                  >
                    <option value="">전체 시군구</option>
                    {options?.sigungus.map((sigungu) => (
                      <option key={sigungu} value={sigungu}>
                        {sigungu}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-600">연결 보고서 선택</label>
                    <span className="text-3xs text-slate-400">
                      {reportsLoading ? "조회 중" : `${reports.length}건`}
                    </span>
                  </div>

                  <select
                    value={selectedDocumentNo}
                    onChange={(event) => {
                      setSelectedDocumentNo(event.target.value);
                      setPreviewUrl(null);
                      setReportError(null);
                    }}
                    disabled={reportsLoading || reports.length === 0}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-bold text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">
                      {reportsLoading
                        ? "보고서 조회 중..."
                        : reports.length === 0
                          ? "조건에 해당하는 보고서가 없습니다."
                          : "문서번호 · 중심 격자 · 위험도를 선택하세요"}
                    </option>

                    {reports.map((item) => (
                      <option
                        key={`${item.report_type}-${item.document_no}`}
                        value={item.document_no}
                      >
                        문서 {item.document_no} · 격자 {item.center_grid_id} ·{" "}
                        {item.sido_name} {item.sigungu_name} ·{" "}
                        {item.risk_grade || "등급 없음"}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedReport && (
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                    <div>
                      <span className="block text-3xs text-emerald-700">
                        신규 확산위험
                      </span>
                      <strong className="text-sm text-emerald-950">
                        {selectedReport.risk_grade || "-"}{" "}
                        {scoreText(selectedReport.risk_score)}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-3xs text-emerald-700">
                        예찰 우선순위
                      </span>
                      <strong className="text-sm text-emerald-950">
                        {selectedReport.priority_grade || "-"}{" "}
                        {scoreText(selectedReport.priority_score)}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-3xs text-emerald-700">
                        중심 격자
                      </span>
                      <strong className="text-sm text-emerald-950">
                        {selectedReport.center_grid_id}
                      </strong>
                    </div>

                    <div>
                      <span className="block text-3xs text-emerald-700">
                        기준 지역
                      </span>
                      <strong className="text-sm text-emerald-950">
                        {selectedReport.sido_name} {selectedReport.sigungu_name}
                      </strong>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-slate-600">출력 형식</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["pdf", "docx", "xlsx"] as ReportFormat[]).map(
                      (itemFormat) => (
                        <button
                          key={itemFormat}
                          type="button"
                          onClick={() => setFormat(itemFormat)}
                          className={`rounded-lg border py-2 font-bold ${
                            format === itemFormat
                              ? "border-emerald-800 bg-emerald-800 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {FORMAT_LABELS[itemFormat]}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={!selectedDocumentNo}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-3 font-bold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Eye size={14} />
                    PDF 미리보기
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!selectedDocumentNo}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-3 py-3 font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Download size={14} />
                    {FORMAT_LABELS[format]} 다운로드
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleLinkedZipDownload}
                    disabled={!linkedStatus?.fully_linked}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 font-bold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <Package size={14} />
                    연결 보고서 3종 ZIP
                  </button>

                  <button
                    type="button"
                    onClick={handleLinkedExcelDownload}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <FileSpreadsheet size={14} />
                    조건별 통합 XLSX
                  </button>
                </div>
              </div>
                </div>

                {/* 오른쪽: 실제 PDF 미리보기 및 연결 상태 */}
                <div className="space-y-4 lg:col-span-7">
              <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-sm">
                <div className="flex min-h-[520px] flex-col">
                  <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                    <span className="text-3xs font-bold tracking-[0.18em] text-slate-500">
                      OFFICIAL FORESTRY REPORT PREVIEW
                    </span>
                    {previewUrl && (
                      <span className="rounded-full bg-emerald-900/50 px-2.5 py-1 text-3xs font-bold text-emerald-300">
                        실제 PDF
                      </span>
                    )}
                  </div>

                  {previewUrl ? (
                    <iframe
                      title="행정 보고서 PDF 미리보기"
                      src={previewUrl}
                      className="min-h-[475px] w-full flex-1 bg-white"
                    />
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center space-y-3 px-8 text-center text-slate-500">
                      <FileText size={42} className="text-slate-600" />
                      <div>
                        <p className="font-bold text-slate-400">
                          보고서와 문서번호를 선택해 주세요.
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">
                          PDF 미리보기 버튼을 누르면 서버에 생성된 실제
                          보고서 파일이 이 영역에 표시됩니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                    <Link2 size={16} className="text-emerald-700" />
                    예측·현장예찰·방제 3종 연결 상태
                  </h4>

                  {linkedLoading && (
                    <Loader2 size={15} className="animate-spin text-slate-400" />
                  )}
                </div>

                {!selectedDocumentNo ? (
                  <p className="text-xs text-slate-400">
                    문서번호를 선택하면 연결 상태를 확인합니다.
                  </p>
                ) : linkedStatus ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["prediction", "발생 예측"],
                        ["field_survey", "현장 예찰"],
                        ["control", "방제"],
                      ] as const
                    ).map(([key, label]) => {
                      const item = linkedStatus.reports[key];
                      const complete = item.exists && item.matched;

                      return (
                        <div
                          key={key}
                          className={`rounded-xl border p-3 ${
                            complete
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-amber-200 bg-amber-50"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {complete ? (
                              <CheckCircle2
                                size={15}
                                className="text-emerald-700"
                              />
                            ) : (
                              <AlertCircle
                                size={15}
                                className="text-amber-700"
                              />
                            )}
                            <span className="font-bold text-slate-800">
                              {label}
                            </span>
                          </div>
                          <p className="mt-1 text-3xs text-slate-500">
                            {complete
                              ? "연결 완료"
                              : item.exists
                                ? "파일 존재 · 연결값 확인 필요"
                                : "보고서 미연결"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    연결 상태를 불러오는 중입니다.
                  </p>
                )}

                {linkedStatus?.fully_linked && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-bold text-white">
                    <CheckCircle2 size={15} />
                    문서번호 {linkedStatus.document_no}는 예측 → 현장 예찰 →
                    방제 검토 계획이 정상 연결되어 있습니다.
                  </div>
                )}
                </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* AI 친환경 수종전환 추천 */}
        {view === "species" && (
          <motion.div
            key="species-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-12"
          >
            <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 text-xs font-semibold shadow-sm lg:col-span-5">
              <div>
                <h3 className="flex items-center gap-1.5 text-base font-black text-slate-950">
                  🌱 피해지 친환경 AI 수종 전환 분석
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  지도에서 위험후보 격자를 선택하면, 해당 격자의 입지(기후대·
                  산림토양형·토심)와 임상 수종구성, 같은 시군구의 실제 활엽수
                  분포를 근거로 대체 수종과 조림 방향을 제시합니다.
                </p>
              </div>

              <ReportGridSelector
                sidoName={speciesSido}
                sigunguName={speciesSigungu}
                selectedGridId={speciesGridId}
                onSidoChange={setSpeciesSido}
                onSigunguChange={setSpeciesSigungu}
                onGridSelect={setSpeciesGridId}
              />

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleRecommendReforest}
                  disabled={reforestLoading || !speciesGridId}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-800 py-3 font-bold text-white hover:bg-emerald-900 disabled:bg-slate-300"
                >
                  {reforestLoading
                    ? "AI 수종전환 적합성 분석 중..."
                    : "AI 수종 전환 및 예산 분석 시작"}
                </button>
                {reforestError && (
                  <p className="flex items-center gap-1 text-3xs font-bold text-rose-600">
                    <AlertCircle size={12} /> {reforestError}
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="flex min-h-[420px] flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 text-base font-black text-slate-950">
                  <span>📃 AI 추천 대체 수종 및 조림 방향</span>
                  {reforestData && (
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-3xs font-black text-emerald-800">
                      {reforestData.is_ai_generated ? "AI 서술" : "근거 기반"}
                    </span>
                  )}
                </h3>

                {reforestLoading ? (
                  <div className="flex flex-1 flex-col items-center justify-center space-y-2 py-12 text-slate-400">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-800" />
                    <span className="text-xs font-bold text-slate-500">
                      선택 격자의 입지·임상 근거를 분석 중입니다...
                    </span>
                  </div>
                ) : reforestData ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 space-y-4 text-xs font-semibold leading-relaxed text-slate-700"
                  >
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <span className="mb-1.5 block text-3xs font-black uppercase tracking-wider text-slate-400">
                        대상 격자 {reforestData.grid_id} · {reforestData.region}
                      </span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
                        <span>
                          기후대{" "}
                          <b className="text-slate-900">
                            {reforestData.site_summary.climate_zone ?? "-"}
                          </b>
                        </span>
                        <span>
                          산림토양형{" "}
                          <b className="text-slate-900">
                            {reforestData.site_summary.forest_soil_type ?? "-"}
                          </b>
                        </span>
                        <span>
                          토심{" "}
                          <b className="text-slate-900">
                            {reforestData.site_summary.soil_depth_class ?? "-"}
                          </b>
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-100/60 bg-emerald-50 p-4">
                      <span className="mb-2 block text-3xs font-black uppercase tracking-wider text-emerald-800">
                        추천 대체 수종
                      </span>
                      <div className="space-y-2">
                        {reforestData.recommended_species.map((item, index) => (
                          <div
                            key={index}
                            className="rounded-lg border border-emerald-200 bg-white p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-emerald-950">
                                {index + 1}. {item.species}
                              </span>
                              {typeof item.suit_score === "number" && (
                                <span className="shrink-0 rounded-md bg-emerald-800 px-2 py-0.5 text-3xs font-black text-white">
                                  적합도 {Math.round(item.suit_score * 100)}점
                                </span>
                              )}
                            </div>

                            {item.breakdown ? (
                              <div className="mt-2 space-y-1">
                                {(
                                  [
                                    ["기후 일치", item.breakdown.climate_match],
                                    ["토양 일치", item.breakdown.soil_match],
                                    ["고도 일치", item.breakdown.elev_match],
                                    ["지역 적응", item.breakdown.regional_adaptation],
                                  ] as [string, number][]
                                ).map(([label, val]) => (
                                  <div
                                    key={label}
                                    className="flex items-center gap-2"
                                  >
                                    <span className="w-14 shrink-0 text-3xs font-bold text-slate-500">
                                      {label}
                                    </span>
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                      <div
                                        className="h-full rounded-full bg-emerald-500"
                                        style={{
                                          width: `${Math.round(val * 100)}%`,
                                        }}
                                      />
                                    </div>
                                    <span className="w-8 shrink-0 text-right text-3xs font-bold text-slate-600">
                                      {Math.round(val * 100)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-0.5 font-medium leading-relaxed text-slate-600">
                                {item.reason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <span className="mb-1 block text-3xs font-black uppercase tracking-wider text-slate-400">
                          현재 임상 수종구성
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(reforestData.current_composition).map(
                            ([name, ratio]) => (
                              <span
                                key={name}
                                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-3xs font-bold text-slate-700"
                              >
                                {name} {Math.round(ratio * 100)}%
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <span className="mb-1 block text-3xs font-black uppercase tracking-wider text-slate-400">
                          지역 실제 우점 활엽수(근거)
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {reforestData.regional_broadleaf.map((item) => (
                            <span
                              key={item.species}
                              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-3xs font-bold text-slate-700"
                            >
                              {item.species}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <span className="mb-1 block text-3xs font-black uppercase tracking-wider text-slate-400">
                        조림 예산(개략) 및 유의사항
                      </span>
                      <p className="font-medium leading-relaxed text-slate-600">
                        {reforestData.budget_estimate}
                      </p>
                      {reforestData.rationale && (
                        <p className="mt-1 font-medium leading-relaxed text-slate-600">
                          {reforestData.rationale}
                        </p>
                      )}
                      {reforestData.notes && (
                        <p className="mt-1 text-3xs font-bold text-amber-700">
                          {reforestData.notes}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center space-y-2 py-12 text-center text-xs text-slate-400">
                    <TreePine
                      size={32}
                      className="animate-pulse stroke-[1.5] text-slate-300"
                    />
                    <span>
                      좌측 지도에서 위험후보 격자를 선택하고
                      <br />
                      "AI 수종 전환 분석" 버튼을 누르면 추천이 실행됩니다.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
