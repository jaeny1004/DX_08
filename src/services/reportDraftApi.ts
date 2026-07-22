import { buildApiUrl } from "../config/api";
import { getAccessToken } from "./authApi";

const API_BASE = buildApiUrl("/api/report-drafts");

export type DraftReportType =
  | "prediction"
  | "field_survey_plan"
  | "field_survey_result"
  | "control_plan"
  | "integrated";

export type DraftExportFormat =
  | "docx"
  | "pdf"
  | "xlsx";

export type DraftStatus =
  | "draft"
  | "reviewed"
  | "approved";

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
  center_grid_id: number;
  year: number;
  sido_name?: string | null;
  sigungu_name?: string | null;
  risk_score?: number | null;
  risk_grade?: string | null;
  priority_score?: number | null;
  priority_grade?: string | null;
  block_grid_ids?: Array<number | string>;
  docx_path?: string;
  pdf_path?: string;
  map_path?: string;
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
  reference_document_nos: string[];
  include_sections: DraftIncludeSections;
  user_notes: string;
  status: DraftStatus;
  sections: DraftSection[];
  data_summary?: Record<string, unknown>;
  template_output?: DraftTemplateOutput | null;
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
  reference_document_nos: string[];
  include_sections: DraftIncludeSections;
  user_notes: string;
}

export interface UpdateDraftRequest {
  title?: string;
  status?: DraftStatus;
  sections?: DraftSection[];
}

export interface ApplyTemplateResponse {
  draft_id: string;
  status: string;
  template_output: DraftTemplateOutput;
}

function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const token = getAccessToken();

  return {
    ...(extra ?? {}),
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  };
}

async function readApiError(
  response: Response,
): Promise<string> {
  try {
    const payload = await response.json();

    if (
      payload &&
      typeof payload === "object" &&
      "detail" in payload
    ) {
      const detail = payload.detail;

      if (typeof detail === "string") {
        return detail;
      }

      return JSON.stringify(detail);
    }
  } catch {
    // JSON이 아닌 오류 응답은 상태 문구를 사용한다.
  }

  return (
    response.statusText ||
    `요청에 실패했습니다. (${response.status})`
  );
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: authHeaders({
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) ??
        {}),
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as T;
}

async function requestBlob(
  url: string,
  init?: RequestInit,
): Promise<Blob> {
  const response = await fetch(url, {
    ...init,
    headers: authHeaders(
      (init?.headers as Record<string, string>) ??
        {},
    ),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.blob();
}

function fileNameFromDisposition(
  response: Response,
  fallbackName: string,
): string {
  const disposition = response.headers.get(
    "content-disposition",
  );

  if (!disposition) {
    return fallbackName;
  }

  const utf8Match = disposition.match(
    /filename\*=UTF-8''([^;]+)/i,
  );

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = disposition.match(
    /filename="?([^";]+)"?/i,
  );

  return basicMatch?.[1] || fallbackName;
}

export async function createDraft(
  payload: CreateDraftRequest,
): Promise<DraftDocument> {
  return requestJson<DraftDocument>(API_BASE, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getDraft(
  draftId: string,
): Promise<DraftDocument> {
  return requestJson<DraftDocument>(
    `${API_BASE}/${encodeURIComponent(draftId)}`,
  );
}

export async function updateDraft(
  draftId: string,
  payload: UpdateDraftRequest,
): Promise<DraftDocument> {
  return requestJson<DraftDocument>(
    `${API_BASE}/${encodeURIComponent(draftId)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function applyDraftTemplate(
  draftId: string,
): Promise<ApplyTemplateResponse> {
  return requestJson<ApplyTemplateResponse>(
    `${API_BASE}/${encodeURIComponent(
      draftId,
    )}/apply-template`,
    {
      method: "POST",
    },
  );
}

export async function fetchDraftPreviewPdf(
  draftId: string,
): Promise<Blob> {
  return requestBlob(
    `${API_BASE}/${encodeURIComponent(
      draftId,
    )}/preview/pdf`,
    {
      method: "GET",
    },
  );
}

export async function downloadDraftFile(
  draftId: string,
  format: DraftExportFormat,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(
      draftId,
    )}/export/${format}`,
    {
      method: "POST",
      headers: authHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const blob = await response.blob();
  const fallbackName = `${draftId}.${format}`;
  const fileName = fileNameFromDisposition(
    response,
    fallbackName,
  );

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
