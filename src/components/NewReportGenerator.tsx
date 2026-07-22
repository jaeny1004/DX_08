import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FilePlus2,
  Loader2,
  Save,
} from "lucide-react";

import {
  createDraft,
  getDraftExportUrl,
  updateDraft,
  type DraftDocument,
  type DraftExportFormat,
  type DraftReportType,
  type DraftSection,
} from "../services/reportDraftApi";

const REPORT_TYPES: Array<{ value: DraftReportType; label: string }> = [
  { value: "prediction", label: "신규 확산위험 분석 보고서" },
  { value: "field_survey_plan", label: "현장 예찰 계획서" },
  { value: "field_survey_result", label: "현장 예찰 결과보고서" },
  { value: "control_plan", label: "방제 검토 계획서" },
  { value: "integrated", label: "예측·예찰·방제 통합 보고서" },
];

function splitValues(value: string): string[] {
  return value.split(/[|,\n]/).map((v) => v.trim()).filter(Boolean);
}

function openDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function NewReportGenerator() {
  const today = new Date().toISOString().slice(0, 10);
  const [reportType, setReportType] = useState<DraftReportType>("prediction");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [sidoName, setSidoName] = useState("경상북도");
  const [sigunguName, setSigunguName] = useState("포항시");
  const [gridIds, setGridIds] = useState("");
  const [referenceNos, setReferenceNos] = useState("");
  const [notes, setNotes] = useState("");
  const [includeRisk, setIncludeRisk] = useState(true);
  const [includePriority, setIncludePriority] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includeWorkforce, setIncludeWorkforce] = useState(false);
  const [includeControl, setIncludeControl] = useState(false);
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState("");

  const summary = useMemo(() => Object.entries(draft?.data_summary || {}), [draft]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setSaved("");
    try {
      const result = await createDraft({
        report_type: reportType,
        title,
        year,
        start_date: startDate,
        end_date: endDate,
        sido_name: sidoName,
        sigungu_name: sigunguName,
        center_grid_ids: splitValues(gridIds),
        reference_document_nos: splitValues(referenceNos),
        include_sections: {
          risk_summary: includeRisk,
          priority_summary: includePriority,
          infection_history: includeHistory,
          workforce_plan: includeWorkforce,
          control_scenario: includeControl,
        },
        user_notes: notes,
      });
      setDraft(result);
      setSections(result.sections);
      setTitle(result.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateDraft(draft.draft_id, {
        title,
        status: "reviewed",
        sections,
      });
      setDraft(result);
      setSections(result.sections);
      setSaved("검토 내용이 저장되었습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <FilePlus2 size={19} className="text-emerald-800" /> 신규 행정문서 생성
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            현재 분석 수치를 사용하고 과거 보고서의 구조와 표현을 참고해 새 초안을 만듭니다.
          </p>
        </div>

        {error && (
          <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div className="space-y-3 text-xs font-semibold">
          <label className="block">문서 유형
            <select value={reportType} onChange={(e) => setReportType(e.target.value as DraftReportType)} className="mt-1 w-full rounded-xl border p-2.5">
              {REPORT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">문서 제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="비우면 자동 생성" className="mt-1 w-full rounded-xl border p-2.5" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label>연도<input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="mt-1 w-full rounded-xl border p-2.5" /></label>
            <label>시작일<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
            <label>종료일<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>시도<input value={sidoName} onChange={(e) => setSidoName(e.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
            <label>시군구<input value={sigunguName} onChange={(e) => setSigunguName(e.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
          </div>
          <label className="block">중심 격자 ID(선택)
            <textarea value={gridIds} onChange={(e) => setGridIds(e.target.value)} placeholder="922059 | 919652" rows={2} className="mt-1 w-full rounded-xl border p-2.5" />
          </label>
          <label className="block">참고 과거 문서번호(선택)
            <input value={referenceNos} onChange={(e) => setReferenceNos(e.target.value)} placeholder="1 | 2 | 3" className="mt-1 w-full rounded-xl border p-2.5" />
          </label>
          <div className="space-y-1 rounded-2xl bg-slate-50 p-3">
            {[
              ["위험도 요약", includeRisk, setIncludeRisk],
              ["예찰 우선순위", includePriority, setIncludePriority],
              ["감염 발생 이력 참고", includeHistory, setIncludeHistory],
              ["현장 예찰 운영", includeWorkforce, setIncludeWorkforce],
              ["방제 검토 시나리오", includeControl, setIncludeControl],
            ].map(([label, checked, setter]) => (
              <label key={label as string} className="flex items-center gap-2">
                <input type="checkbox" checked={checked as boolean} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)} />
                {label as string}
              </label>
            ))}
          </div>
          <label className="block">담당자 메모
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border p-2.5" />
          </label>
          <button onClick={generate} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 py-3 font-bold text-white disabled:bg-slate-300">
            {loading ? <><Loader2 size={15} className="animate-spin" /> 초안 작성 중</> : <><FilePlus2 size={15} /> 신규 초안 생성</>}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold">{draft ? draft.title : "신규 문서 초안 미리보기"}</h3>
            <p className="text-xs text-slate-500">{draft ? `${draft.draft_id} · ${draft.sido_name} ${draft.sigungu_name}` : "좌측 조건으로 새 초안을 생성해 주세요."}</p>
          </div>
          {draft && (
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white"><Save size={14} /> 저장</button>
              {(["docx", "pdf", "xlsx"] as DraftExportFormat[]).map((format) => (
                <button key={format} onClick={() => openDownload(getDraftExportUrl(draft.draft_id, format))} className="flex items-center gap-1 rounded-xl border bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900"><Download size={14} /> {format.toUpperCase()}</button>
              ))}
            </div>
          )}
        </div>

        {saved && <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><CheckCircle2 size={15} /> {saved}</div>}

        {!draft ? (
          <div className="flex min-h-[450px] flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 text-slate-400"><FilePlus2 size={42} /><p className="mt-2 font-bold">생성된 신규 초안이 없습니다.</p></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-emerald-50 p-3 sm:grid-cols-4">
              {summary.filter(([k]) => ["selected_grid_count", "average_risk_score", "maximum_risk_score", "average_priority_score"].includes(k)).map(([k, v]) => <div key={k}><span className="block text-[10px] text-emerald-700">{k}</span><strong>{String(v ?? "-")}</strong></div>)}
            </div>
            {sections.map((section, index) => (
              <div key={section.key} className="rounded-2xl border p-4">
                <input value={section.heading} onChange={(e) => setSections((current) => current.map((item, i) => i === index ? { ...item, heading: e.target.value } : item))} className="mb-2 w-full border-b pb-2 text-sm font-extrabold outline-none" />
                <textarea value={section.content} onChange={(e) => setSections((current) => current.map((item, i) => i === index ? { ...item, content: e.target.value } : item))} rows={Math.max(4, section.content.split("\n").length + 2)} className="w-full rounded-xl bg-slate-50 p-3 text-xs leading-relaxed" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
