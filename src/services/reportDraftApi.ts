import { buildApiUrl } from "../config/api";
import { getAccessToken } from "./authApi";

const API_BASE = buildApiUrl("/api/report-drafts");

export type DraftReportType = "prediction" | "field_survey" | "control";
export type DraftExportFormat = "docx" | "pdf" | "xlsx";
export type DraftStatus = "draft" | "reviewed" | "approved" | "registered";

export interface DraftSection {
  key: string;
  heading: string;
  content: string;
}

export interface DraftIncludeSections {
  risk_summary: boolean;
  priority_summary: boolean;
  infection_history: boolean;
  workforce_plan: boolean;
  control_scenario: boolean;
}

export interface DraftTemplateOutput {
  status: string;
  center_grid_id: string | number;
  year: number;
  sido_name?: string | null;
  sigungu_name?: string | null;
  risk_score?: number | null;
  risk_grade?: string | null;
  priority_score?: number | null;
  priority_grade?: string | null;
  docx_path?: string;
  pdf_path?: string;
}

export interface RegisteredReport {
  report_type: DraftReportType;
  document_no: string;
  file_name: string;
}

export interface DraftDocument {
  draft_id: string;
  report_type: DraftReportType;
  title: string;
  year: number;
  start_date: string;
  end_date: string;
  sido_name: string;
  sigungu_name: string;
  center_grid_ids: string[];
  include_sections: DraftIncludeSections;
  user_notes: string;
  status: DraftStatus;
  sections: DraftSection[];
  data_summary?: Record<string, unknown>;
  template_output?: DraftTemplateOutput | null;
  registered_report?: RegisteredReport | null;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateDraftRequest {
  report_type: DraftReportType;
  title: string;
  year: number;
  start_date: string;
  end_date: string;
  sido_name: string;
  sigungu_name: string;
  center_grid_ids: string[];
  include_sections: DraftIncludeSections;
  user_notes: string;
}

export interface UpdateDraftRequest {
  title?: string;
  status?: DraftStatus;
  sections?: DraftSection[];
}

export interface RegisterDraftResponse {
  draft_id: string;
  status: string;
  registered_report: RegisteredReport;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAccessToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") return payload.detail;
    if (payload?.detail) return JSON.stringify(payload.detail);
  } catch {
    // JSON이 아니면 상태 문구 사용
  }
  return response.statusText || `요청에 실패했습니다. (${response.status})`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: authHeaders({
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) ?? {}),
    }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<T>;
}

async function requestBlob(url: string, init?: RequestInit): Promise<Blob> {
  const response = await fetch(url, {
    ...init,
    headers: authHeaders((init?.headers as Record<string, string>) ?? {}),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.blob();
}

function fileNameFromDisposition(response: Response, fallbackName: string): string {
  const disposition = response.headers.get("content-disposition");
  if (!disposition) return fallbackName;
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try { return decodeURIComponent(utf8Match[1]); } catch { return utf8Match[1]; }
  }
  const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallbackName;
}

export function createDraft(payload: CreateDraftRequest): Promise<DraftDocument> {
  return requestJson<DraftDocument>(API_BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDraft(draftId: string, payload: UpdateDraftRequest): Promise<DraftDocument> {
  return requestJson<DraftDocument>(`${API_BASE}/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchDraftPreviewPdf(draftId: string): Promise<Blob> {
  return requestBlob(`${API_BASE}/${encodeURIComponent(draftId)}/preview/pdf`);
}

export function registerDraftReport(draftId: string): Promise<RegisterDraftResponse> {
  return requestJson<RegisterDraftResponse>(
    `${API_BASE}/${encodeURIComponent(draftId)}/register`,
    { method: "POST" },
  );
}

export async function downloadDraftFile(draftId: string, format: DraftExportFormat): Promise<void> {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(draftId)}/export/${format}`,
    { method: "POST", headers: authHeaders() },
  );
  if (!response.ok) throw new Error(await readApiError(response));

  const blob = await response.blob();
  const fileName = fileNameFromDisposition(response, `${draftId}.${format}`);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
