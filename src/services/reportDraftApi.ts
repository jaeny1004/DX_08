import { getAccessToken } from "./authApi";
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

async function requestJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const token = getAccessToken();

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `요청 실패 (${response.status})`;

    try {
      const body = await response.json();

      if (typeof body?.detail === "string") {
        message = body.detail;
      }
    } catch {
      // JSON이 아닌 오류 응답이면 기본 메시지를 사용한다.
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

export async function downloadDraftFile(
  draftId: string,
  format: DraftExportFormat,
): Promise<void> {
  const token = getAccessToken();

  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(draftId)}/export/${format}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },
    },
  );

  if (!response.ok) {
    let message = `파일 다운로드 실패 (${response.status})`;

    try {
      const body = await response.json();

      if (typeof body?.detail === "string") {
        message = body.detail;
      }
    } catch {
      // JSON이 아닌 오류 응답이면 기본 메시지를 사용한다.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition =
    response.headers.get("Content-Disposition") || "";

  const utf8Filename = disposition.match(
    /filename\*=UTF-8''([^;]+)/i,
  )?.[1];

  const basicFilename = disposition.match(
    /filename="?([^";]+)"?/i,
  )?.[1];

  const filename = utf8Filename
    ? decodeURIComponent(utf8Filename)
    : basicFilename || `신규보고서.${format}`;

  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = blobUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(blobUrl);
}