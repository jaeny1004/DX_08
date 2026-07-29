import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FilePlus2,
  Loader2,
  Send,
} from "lucide-react";

import {
  createDraft,
  downloadDraftFile,
  fetchDraftPreviewPdf,
  registerDraftReport,
  type DraftDocument,
  type DraftExportFormat,
  type DraftReportType,
} from "../services/reportDraftApi";
import ReportGridSelector from "./ReportGridSelector";

const REPORT_TYPES: Array<{ value: DraftReportType; label: string }> = [
  { value: "prediction", label: "신규 확산위험 분석 보고서" },
  { value: "field_survey", label: "현장 예찰 결과 보고서" },
  { value: "control", label: "방제 결과 보고서" },
];

interface NewReportGeneratorProps {
  onRegistered?: () => void;
}

export default function NewReportGenerator({ onRegistered }: NewReportGeneratorProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [reportType, setReportType] = useState<DraftReportType>("prediction");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [sidoName, setSidoName] = useState("");
  const [sigunguName, setSigunguName] = useState("");
  const [gridId, setGridId] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [exporting, setExporting] = useState<DraftExportFormat | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const replacePreview = (url: string | null) => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
  };

  const generate = async () => {
    if (!sidoName || !sigunguName) {
      setError("시도와 시군구를 선택해 주세요.");
      return;
    }
    if (!gridId) {
      setError("지도에서 중심 격자 1개를 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    replacePreview(null);

    try {
      const result = await createDraft({
        report_type: reportType,
        title,
        year,
        start_date: startDate,
        end_date: endDate,
        sido_name: sidoName,
        sigungu_name: sigunguName,
        center_grid_ids: [gridId],
        include_sections: {
          risk_summary: true,
          priority_summary: true,
          infection_history: true,
          workforce_plan: reportType === "field_survey",
          control_scenario: reportType === "control",
        },
        user_notes: notes,
      });

      setDraft(result);
      setTitle(result.title);
      const pdf = await fetchDraftPreviewPdf(result.draft_id);
      replacePreview(URL.createObjectURL(pdf));
      setMessage("선택한 문서 유형의 행정양식이 자동 적용되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "보고서 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    if (!draft) return;
    setRegistering(true);
    setError("");
    setMessage("");
    try {
      const response = await registerDraftReport(draft.draft_id);
      setDraft({
        ...draft,
        status: "registered",
        registered_report: response.registered_report,
      });
      setMessage(`문서번호 ${response.registered_report.document_no}로 보고서가 등록되었습니다.`);
      onRegistered?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "보고서 등록에 실패했습니다.");
    } finally {
      setRegistering(false);
    }
  };

  const download = async (format: DraftExportFormat) => {
    if (!draft) return;
    setExporting(format);
    setError("");
    try {
      await downloadDraftFile(draft.draft_id, format);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "다운로드에 실패했습니다.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <FilePlus2 size={19} className="text-emerald-800" />
            신규 행정문서 생성
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            지역과 중심 격자를 선택하면 해당 문서 유형의 빈 행정양식에 분석 결과를 자동 입력합니다.
          </p>
        </div>

        {error && (
          <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
            <AlertCircle size={15} className="shrink-0" /> {error}
          </div>
        )}
        {message && (
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
            <CheckCircle2 size={15} className="shrink-0" /> {message}
          </div>
        )}

        <div className="space-y-3 text-xs font-semibold">
          <label className="block text-slate-600">
            문서 유형
            <select
              value={reportType}
              onChange={(event) => {
                setReportType(event.target.value as DraftReportType);
                setDraft(null);
                replacePreview(null);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 outline-none focus:border-emerald-400"
            >
              {REPORT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label className="block text-slate-600">
            문서 제목
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="비우면 자동 생성"
              className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 outline-none focus:border-emerald-400"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-slate-600">연도
              <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5" />
            </label>
            <label className="text-slate-600">시작일
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5" />
            </label>
            <label className="text-slate-600">종료일
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5" />
            </label>
          </div>

          <ReportGridSelector
            sidoName={sidoName}
            sigunguName={sigunguName}
            selectedGridId={gridId}
            onSidoChange={setSidoName}
            onSigunguChange={setSigunguName}
            onGridSelect={setGridId}
          />

          <label className="block text-slate-600">
            담당자 메모
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-xl border border-slate-200 p-2.5" />
          </label>

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 py-3 font-bold text-white hover:bg-emerald-900 disabled:bg-slate-300"
          >
            {loading ? <><Loader2 size={15} className="animate-spin" />행정양식 작성 중</> : <><FilePlus2 size={15} />신규 초안 생성</>}
          </button>
        </div>
      </section>

      <section className="flex min-h-[720px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">{draft?.title || "신규 문서 초안 미리보기"}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {draft ? `${draft.sido_name} ${draft.sigungu_name} · 중심 격자 ${draft.center_grid_ids[0]}` : "신규 초안을 생성하면 행정양식 PDF가 즉시 표시됩니다."}
            </p>
          </div>

          {draft && (
            <div className="flex flex-wrap gap-2">
              {(["pdf", "docx"] as DraftExportFormat[]).map((format) => (
                <button key={format} type="button" onClick={() => download(format)} disabled={exporting !== null} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  {exporting === format ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {format.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                onClick={register}
                disabled={registering || draft.status === "registered"}
                className="flex items-center gap-1 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 disabled:bg-slate-300"
              >
                {registering ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {draft.status === "registered" ? "등록 완료" : "보고서 등록"}
              </button>
            </div>
          )}
        </div>

        {previewUrl ? (
          <iframe title="행정양식 PDF 미리보기" src={previewUrl} className="min-h-[650px] w-full flex-1 bg-white" />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50 text-center text-slate-400">
            <FilePlus2 size={45} />
            <p className="text-sm font-bold">생성된 행정양식이 없습니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}
