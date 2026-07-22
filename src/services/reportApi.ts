import { buildApiUrl } from "../config/api";

export type ReportType = "prediction" | "field_survey" | "control";
export type ReportFormat = "pdf" | "docx" | "xlsx";

export interface ReportTypeOption {
  value: ReportType;
  label: string;
}

export interface ReportOptions {
  report_types: ReportTypeOption[];
  years: string[];
  sidos: string[];
  sigungus: string[];
}

export interface ReportItem {
  document_no: string;
  report_type: ReportType;
  report_type_label: string;
  file_name: string;
  year: string;
  center_grid_id: string;
  sido_name: string;
  sigungu_name: string;
  risk_score?: number | null;
  risk_grade?: string;
  priority_score?: number | null;
  priority_grade?: string;
  control_status?: string;
  suspicious_count?: number | null;
  sample_count?: number | null;
  planned_count?: number | null;
  planned_area_ha?: number | null;
  available_formats: ReportFormat[];
  [key: string]: unknown;
}

export interface ReportListResponse {
  report_type: ReportType;
  report_type_label: string;
  total: number;
  items: ReportItem[];
}

export interface LinkedReportEntry {
  exists: boolean;
  matched: boolean;
  item: ReportItem | null;
}

export interface LinkedReportStatus {
  document_no: string;
  year: string;
  center_grid_id: string;
  sido_name: string;
  sigungu_name: string;
  fully_linked: boolean;
  identity_matched: boolean;
  reports: {
    prediction: LinkedReportEntry;
    field_survey: LinkedReportEntry;
    control: LinkedReportEntry;
  };
}

export interface ReportQuery {
  report_type: ReportType;
  year?: string;
  sido_name?: string;
  sigungu_name?: string;
  center_grid_id?: string;
  document_no?: string;
}

const API_BASE = buildApiUrl("/api/reports");

function buildQuery(
  values: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value && value.trim()) {
      params.set(key, value.trim());
    }
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    let message = `요청에 실패했습니다. (${response.status})`;

    try {
      const body = await response.json();
      if (typeof body?.detail === "string") {
        message = body.detail;
      }
    } catch {
      // JSON 응답이 아니면 기본 메시지를 사용한다.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function fetchReportOptions(params: {
  report_type: ReportType;
  year?: string;
  sido_name?: string;
}): Promise<ReportOptions> {
  return requestJson<ReportOptions>(
    `${API_BASE}/options${buildQuery(params)}`,
  );
}

export function fetchReports(
  query: ReportQuery,
): Promise<ReportListResponse> {
  return requestJson<ReportListResponse>(
    `${API_BASE}${buildQuery(query)}`,
  );
}

export function fetchLinkedReportStatus(
  documentNo: string,
): Promise<LinkedReportStatus> {
  return requestJson<LinkedReportStatus>(
    `${API_BASE}/linked/${encodeURIComponent(documentNo)}`,
  );
}

export function getPreviewUrl(
  reportType: ReportType,
  documentNo: string,
): string {
  return (
    `${API_BASE}/${encodeURIComponent(reportType)}/` +
    `${encodeURIComponent(documentNo)}/preview`
  );
}

export function getDownloadUrl(
  reportType: ReportType,
  documentNo: string,
  format: ReportFormat,
): string {
  return (
    `${API_BASE}/${encodeURIComponent(reportType)}/` +
    `${encodeURIComponent(documentNo)}/download` +
    `?format=${encodeURIComponent(format)}`
  );
}

export function getLinkedZipDownloadUrl(
  documentNo: string,
): string {
  return (
    `${API_BASE}/linked/${encodeURIComponent(documentNo)}/download`
  );
}

export function getLinkedExcelDownloadUrl(params: {
  year?: string;
  sido_name?: string;
  sigungu_name?: string;
}): string {
  return (
    `${API_BASE}/export/linked.xlsx` +
    buildQuery(params)
  );
}
