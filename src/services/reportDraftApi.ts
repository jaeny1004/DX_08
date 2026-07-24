export type DraftReportType =
  | "prediction"
  | "field_survey_plan"
  | "field_survey_result"
  | "control_plan"
  | "integrated";

export type DraftStatus = "draft" | "reviewed" | "approved";
export type DraftExportFormat = "docx" | "pdf" | "xlsx";

export interface DraftSection {
  key: string;
  heading: string;
  content: string;
}

export interface DraftCreatePayload {
  report_type: DraftReportType;
  title: string;
  year: number;
  start_date: string;
  end_date: string;
  sido_name: string;
  sigungu_name: string;
  center_grid_ids: string[];
  reference_document_nos: string[];
  include_sections: {
    risk_summary: boolean;
    priority_summary: boolean;
    infection_history: boolean;
    workforce_plan: boolean;
    control_scenario: boolean;
  };
  user_notes: string;
}

export interface DraftDocument {
  draft_id: string;
  report_type: DraftReportType;
  title: string;
  status: DraftStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  year: number;
  start_date: string;
  end_date: string;
  sido_name: string;
  sigungu_name: string;
  center_grid_ids: string[];
  reference_document_nos: string[];
  reference_reports: Array<Record<string, unknown>>;
  data_summary: Record<string, unknown>;
  sections: DraftSection[];
  user_notes: string;
}

const API_BASE = "/api/report-drafts";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `요청 실패 (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch {
      // 기본 메시지 사용
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function createDraft(payload: DraftCreatePayload): Promise<DraftDocument> {
  return requestJson<DraftDocument>(API_BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDraft(
  draftId: string,
  payload: { title?: string; status?: DraftStatus; sections?: DraftSection[] },
): Promise<DraftDocument> {
  return requestJson<DraftDocument>(`${API_BASE}/${encodeURIComponent(draftId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getDraftExportUrl(
  draftId: string,
  format: DraftExportFormat,
): string {
  return `${API_BASE}/${encodeURIComponent(draftId)}/export/${format}`;
}
