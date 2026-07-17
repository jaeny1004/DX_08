import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  DispatchAssignment,
  DispatchWorkerType,
} from "../types/dispatch";

type BaseMapMode = "base" | "satellite";
type TileStatus = "loading" | "success" | "error" | "fallback";

type AdminSummary = {
  adminType: "sigungu" | "emd";
  sidoCode: string;
  sidoName: string;
  sigunguCode: string;
  sigunguName: string;
  emdCode?: string;
  emdName?: string;
  totalGridCount: number;
  veryHighGridCount: number;
  highGridCount: number;
  topPriorityGridCount: number;
  priorityGridCount: number;
  avgRiskScore: number;
  maxRiskScore: number;
  totalPriorityScore: number;
  totalPineArea: number;
  avgInfectionPressure: number;
  avgAccessScore: number;
};

type WorkforceSummary = {
  sigungu_code: string;
  sido_name: string;
  sigungu_name: string;
  all_grid_count: number;
  target_grid_count: number;
  very_high_count: number;
  high_count: number;
  top_priority_count: number;
  priority_count: number;
  low_access_target_count: number;
  environment_caution_count: number;
  avg_risk_score: number;
  avg_infection_pressure: number;
  avg_access_score: number;
  estimated_minutes: number;
  required_person_days: number;
  required_field_workers: number;
  available_field_workers: number;
  field_worker_gap: number;
  field_shortage_count: number;
  required_drone_workers: number;
  available_drone_workers: number;
  drone_worker_gap: number;
  drone_shortage_count: number;
  required_control_standby: number;
  available_control_workers: number;
  control_worker_gap: number;
  control_shortage_count: number;
  assigned_grid_count: number;
  assigned_worker_count: number;
  assigned_minutes: number;
  unassigned_grid_count: number;
  unassigned_minutes: number;
  assignment_rate: number;
};

type WorkerMasterRow = {
  worker_id: string;
  worker_name: string;
  worker_type: "현장요원" | "드론요원" | "방제요원";
  home_sigungu_code: string;
  sido_name: string;
  sigungu_name: string;
  status: string;
  availability_status: string;
  travel_distance_km: number | null;
  travel_time_hour: number | null;
  battery_percent: number | null;
  battery_context: string;
};

type Recommendation = {
  worker: WorkerMasterRow;
  assignmentType: "지역 내 배정" | "동일 시도 지원" | "권역 지원";
  recommendationScore: number;
};

const VWORLD_KEY = String(import.meta.env.VITE_VWORLD_API_KEY ?? "").trim();
const HAS_VWORLD_KEY = VWORLD_KEY.length > 0;
const VWORLD_BASE_URL = `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`;
const VWORLD_SATELLITE_URL = `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`;
const VWORLD_HYBRID_URL = `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`;
const OSM_BASE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const GEOJSON_PATH = "/data/final_ui_candidate_v4.geojson";
const SIGUNGU_BOUNDARY_PATH = "/data/sigungu_boundary.geojson";
const WORKFORCE_SUMMARY_PATH = "/data/workforce/admin_workforce_ui_summary.json";
const WORKER_MASTER_PATH = "/data/workforce/worker_master.json";

const KOREA_BOUNDS = L.latLngBounds(L.latLng(32.5, 124.0), L.latLng(39.8, 132.2));
const GRID_RENDERER = L.canvas({ padding: 0.25, tolerance: 4 });

const priorityColors: Record<string, string> = {
  "최우선 예찰": "#ff2b57",
  "우선 예찰": "#ff9f0a",
  "집중 관찰": "#ffcc00",
  "정기 관찰": "#1fc16b",
  "일반 관리": "#d9d9d9",
};

function formatNumber(value: unknown, digit = 1) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return numberValue.toLocaleString("ko-KR", { maximumFractionDigits: digit });
}

function safeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeCode(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text || text === "nan") return "";
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeRiskGrade(props: any) {
  switch (props?.risk_stage_label) {
    case "고위험 1순위 후보":
      return "매우 높음";
    case "고위험 2순위 후보":
      return "높음";
    case "고위험 3순위 후보":
      return "주의";
    case "고위험 4순위 후보":
      return "관찰";
    default:
      return props?.risk_grade ?? "낮음";
  }
}

function normalizePriorityGrade(props: any) {
  const validGrades = new Set([
    "최우선 예찰",
    "우선 예찰",
    "집중 관찰",
    "정기 관찰",
    "일반 관리",
  ]);
  if (validGrades.has(props?.field_priority_grade_v3)) return props.field_priority_grade_v3;
  if (validGrades.has(props?.priority_grade_v3)) return props.priority_grade_v3;
  switch (props?.priority_stage_label) {
    case "예찰 1순위 후보":
      return "최우선 예찰";
    case "예찰 2순위 후보":
      return "우선 예찰";
    case "예찰 3순위 후보":
      return "집중 관찰";
    case "예찰 4순위 후보":
      return "정기 관찰";
    default:
      return "일반 관리";
  }
}

function getGridStyle(props: any, baseMapMode: BaseMapMode): L.PathOptions {
  const grade = normalizePriorityGrade(props);
  const color = priorityColors[grade] ?? "#cccccc";
  const isGeneral = grade === "일반 관리";
  return {
    color: isGeneral ? "transparent" : color,
    weight: isGeneral ? 0 : baseMapMode === "satellite" ? 0.7 : 0.55,
    fillColor: color,
    fillOpacity: isGeneral
      ? baseMapMode === "satellite"
        ? 0.02
        : 0.05
      : baseMapMode === "satellite"
        ? 0.42
        : 0.72,
    interactive: true,
  };
}

function buildSummary(features: any[], type: "sigungu" | "emd"): AdminSummary | null {
  if (!features.length) return null;
  const first = features[0]?.properties ?? {};
  let totalRisk = 0;
  let maxRisk = 0;
  let totalPriority = 0;
  let totalPineArea = 0;
  let totalPressure = 0;
  let pressureCount = 0;
  let totalAccess = 0;
  let accessCount = 0;
  let veryHighGridCount = 0;
  let highGridCount = 0;
  let topPriorityGridCount = 0;
  let priorityGridCount = 0;

  for (const feature of features) {
    const props = feature?.properties ?? {};
    const riskGrade = normalizeRiskGrade(props);
    const priorityGrade = normalizePriorityGrade(props);
    const riskScore = safeNumber(props.risk_score);
    totalRisk += riskScore;
    maxRisk = Math.max(maxRisk, riskScore);
    totalPriority += safeNumber(props.field_priority_score_v3);
    totalPineArea += safeNumber(props.pine_area);

    const pressure = props.recent_pressure_score ?? props.infection_pressure;
    if (pressure !== null && pressure !== undefined && Number.isFinite(Number(pressure))) {
      totalPressure += Number(pressure);
      pressureCount += 1;
    }
    const access = props.access_score_v3;
    if (access !== null && access !== undefined && Number.isFinite(Number(access))) {
      totalAccess += Number(access);
      accessCount += 1;
    }
    if (riskGrade === "매우 높음") veryHighGridCount += 1;
    if (riskGrade === "높음") highGridCount += 1;
    if (priorityGrade === "최우선 예찰") topPriorityGridCount += 1;
    if (priorityGrade === "우선 예찰") priorityGridCount += 1;
  }

  return {
    adminType: type,
    sidoCode: normalizeCode(first.sido_code),
    sidoName: String(first.sido_name ?? ""),
    sigunguCode: normalizeCode(first.sigungu_code),
    sigunguName: String(first.sigungu_name ?? ""),
    emdCode: type === "emd" ? normalizeCode(first.emd_code) : undefined,
    emdName: type === "emd" ? String(first.emd_name ?? "") : undefined,
    totalGridCount: features.length,
    veryHighGridCount,
    highGridCount,
    topPriorityGridCount,
    priorityGridCount,
    avgRiskScore: totalRisk / features.length,
    maxRiskScore: maxRisk,
    totalPriorityScore: totalPriority,
    totalPineArea,
    avgInfectionPressure: pressureCount ? totalPressure / pressureCount : 0,
    avgAccessScore: accessCount ? totalAccess / accessCount : 0,
  };
}

function getHighRiskCount(summary: AdminSummary) {
  return summary.veryHighGridCount + summary.highGridCount;
}

function getPriorityTargetCount(summary: AdminSummary) {
  return summary.topPriorityGridCount + summary.priorityGridCount;
}

function getShortageText(gap: number) {
  if (gap < 0) return `부족 ${formatNumber(Math.abs(gap), 0)}명`;
  if (gap > 0) return `여유 ${formatNumber(gap, 0)}명`;
  return "적정";
}

function getShortageClass(gap: number) {
  if (gap < 0) return "text-rose-600";
  if (gap > 0) return "text-emerald-600";
  return "text-slate-600";
}

function createAdminPopupHtml(summary: AdminSummary, workforce: WorkforceSummary | null) {
  const regionName = [summary.sidoName, summary.sigunguName, summary.emdName]
    .filter(Boolean)
    .join(" ");
  return `
    <div style="min-width:240px;font-family:Pretendard,Arial,sans-serif;color:#0f172a">
      <div style="font-size:16px;font-weight:800;margin-bottom:10px">AI ${summary.adminType === "emd" ? "읍면동" : "시군구"} 분석</div>
      <div style="font-size:13px;color:#0f766e;font-weight:700">선택 행정구역</div>
      <div style="font-size:18px;font-weight:800;margin:3px 0 12px">${escapeHtml(regionName)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr><td style="padding:5px 0;color:#64748b">전체 후보</td><td style="text-align:right;font-weight:700">${formatNumber(summary.totalGridCount, 0)}개</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">고위험 후보</td><td style="text-align:right;font-weight:700;color:#e11d48">${formatNumber(getHighRiskCount(summary), 0)}개</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">우선 예찰</td><td style="text-align:right;font-weight:700;color:#c2410c">${formatNumber(getPriorityTargetCount(summary), 0)}개</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">평균 위험도</td><td style="text-align:right;font-weight:700">${formatNumber(summary.avgRiskScore, 1)}점</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">평균 접근성</td><td style="text-align:right;font-weight:700">${formatNumber(summary.avgAccessScore, 1)}점</td></tr>
        ${workforce ? `<tr><td style="padding:5px 0;color:#64748b">인력 배정률</td><td style="text-align:right;font-weight:700">${formatNumber(workforce.assignment_rate, 1)}%</td></tr>` : ""}
      </table>
      <div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.5">감염 확정이 아닌 신규 확산위험 후보 및 우선 예찰 검토지역입니다.</div>
    </div>`;
}

function createGridPopupHtml(props: any) {
  const riskGrade = normalizeRiskGrade(props);
  const priorityGrade = normalizePriorityGrade(props);
  return `
    <div style="min-width:230px;font-family:Pretendard,Arial,sans-serif;color:#0f172a">
      <div style="font-size:16px;font-weight:800;margin-bottom:9px">AI 위험도 상세</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr><td style="padding:5px 0;color:#64748b">격자 ID</td><td style="text-align:right;font-weight:700">${escapeHtml(props.grid_id ?? props.id ?? "-")}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">AI 위험도</td><td style="text-align:right;font-weight:700">${formatNumber(props.risk_score, 2)}점 / ${escapeHtml(riskGrade)}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">예찰 우선순위</td><td style="text-align:right;font-weight:700">${formatNumber(props.field_priority_score_v3, 2)}점 / ${escapeHtml(priorityGrade)}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">소나무류 비율</td><td style="text-align:right;font-weight:700">${formatNumber(safeNumber(props.pine_ratio) * 100, 1)}%</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">최근 감염압력</td><td style="text-align:right;font-weight:700">${formatNumber(props.recent_pressure_score ?? props.infection_pressure, 1)}점</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">접근성</td><td style="text-align:right;font-weight:700">${formatNumber(props.access_score_v3, 1)}점</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">가장 가까운 도로</td><td style="text-align:right;font-weight:700">${escapeHtml(props.nearest_road_type ?? props.road_class_near ?? "-")}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">도로까지 거리</td><td style="text-align:right;font-weight:700">${formatNumber(props.distance_to_nearest_road_m_v3 ?? props.road_dist_m, 1)}m</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">환경주의</td><td style="text-align:right;font-weight:700">${safeNumber(props.environment_caution_flag_v3 ?? props.env_flag) === 1 ? "현장 확인 필요" : "해당 없음"}</td></tr>
      </table>
    </div>`;
}

interface DashboardRiskMapCardProps {
  dispatchAssignments: DispatchAssignment[];
  onAssignWorker: (assignment: DispatchAssignment) => void;
  onGridSelect?: (grid: any) => void;
}

export default function DashboardRiskMapCard({
  dispatchAssignments,
  onAssignWorker,
  onGridSelect,
}: DashboardRiskMapCardProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const gridLayerRef = useRef<L.GeoJSON | null>(null);
  const sigunguLayerRef = useRef<L.GeoJSON | null>(null);
  const popupRef = useRef<L.Popup | null>(null);
  const vworldBaseLayerRef = useRef<L.TileLayer | null>(null);
  const vworldSatelliteLayerRef = useRef<L.TileLayer | null>(null);
  const vworldHybridLayerRef = useRef<L.TileLayer | null>(null);
  const tileErrorCountRef = useRef(0);
  const onGridSelectRef = useRef(onGridSelect);
  const selectedAdminSummaryRef = useRef<AdminSummary | null>(null);
  const selectedWorkforceSummaryRef = useRef<WorkforceSummary | null>(null);

  const [geojson, setGeojson] = useState<any>(null);
  const [sigunguBoundary, setSigunguBoundary] = useState<any>(null);
  const [workforceSummaries, setWorkforceSummaries] = useState<WorkforceSummary[]>([]);
  const [workerMaster, setWorkerMaster] = useState<WorkerMasterRow[]>([]);
  const [geojsonError, setGeojsonError] = useState("");
  const [boundaryError, setBoundaryError] = useState("");
  const [workforceError, setWorkforceError] = useState("");
  const [workerMasterError, setWorkerMasterError] = useState("");
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("base");
  const [selectedSigunguCode, setSelectedSigunguCode] = useState("");
  const [selectedEmdCode, setSelectedEmdCode] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [recommendationTab, setRecommendationTab] =
    useState<DispatchWorkerType>("현장요원");
  const [assignmentMessage, setAssignmentMessage] = useState("");
  const [tileStatus, setTileStatus] = useState<TileStatus>(
    HAS_VWORLD_KEY ? "loading" : "fallback",
  );
  const [tileErrorMessage, setTileErrorMessage] = useState(
    HAS_VWORLD_KEY ? "" : "VWorld API 키가 없어 대체 배경지도를 표시합니다.",
  );

  useEffect(() => {
    onGridSelectRef.current = onGridSelect;
  }, [onGridSelect]);

  const features = useMemo(
    () => (Array.isArray(geojson?.features) ? geojson.features : []),
    [geojson],
  );

  const featureIndex = useMemo(() => {
    const sigungu = new Map<string, any[]>();
    const emd = new Map<string, any[]>();
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const sigunguCode = normalizeCode(props.sigungu_code);
      const emdCode = normalizeCode(props.emd_code);
      if (sigunguCode) {
        const list = sigungu.get(sigunguCode);
        if (list) list.push(feature);
        else sigungu.set(sigunguCode, [feature]);
      }
      if (emdCode) {
        const list = emd.get(emdCode);
        if (list) list.push(feature);
        else emd.set(emdCode, [feature]);
      }
    }
    return { sigungu, emd };
  }, [features]);

  const sigunguOptions = useMemo(() => {
    const options = new Map<string, { code: string; sidoName: string; sigunguName: string }>();
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const code = normalizeCode(props.sigungu_code);
      if (!code || options.has(code)) continue;
      options.set(code, {
        code,
        sidoName: String(props.sido_name ?? ""),
        sigunguName: String(props.sigungu_name ?? ""),
      });
    }
    return [...options.values()].sort((a, b) =>
      `${a.sidoName} ${a.sigunguName}`.localeCompare(
        `${b.sidoName} ${b.sigunguName}`,
        "ko",
      ),
    );
  }, [features]);

  const emdOptions = useMemo(() => {
    if (!selectedSigunguCode) return [];
    const options = new Map<string, { code: string; name: string }>();
    for (const feature of featureIndex.sigungu.get(selectedSigunguCode) ?? []) {
      const props = feature?.properties ?? {};
      const code = normalizeCode(props.emd_code);
      if (!code || options.has(code)) continue;
      options.set(code, { code, name: String(props.emd_name ?? "") });
    }
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [featureIndex, selectedSigunguCode]);

  const selectedAdminFeatures = useMemo(() => {
    if (selectedEmdCode) return featureIndex.emd.get(selectedEmdCode) ?? [];
    if (selectedSigunguCode) return featureIndex.sigungu.get(selectedSigunguCode) ?? [];
    return [];
  }, [featureIndex, selectedSigunguCode, selectedEmdCode]);

  const selectedAdminSummary = useMemo(() => {
    if (selectedEmdCode) return buildSummary(selectedAdminFeatures, "emd");
    if (selectedSigunguCode) return buildSummary(selectedAdminFeatures, "sigungu");
    return null;
  }, [selectedAdminFeatures, selectedSigunguCode, selectedEmdCode]);

  const workforceSummaryMap = useMemo(() => {
    const map = new Map<string, WorkforceSummary>();
    for (const row of workforceSummaries) {
      const code = normalizeCode(row.sigungu_code);
      if (code) map.set(code, row);
    }
    return map;
  }, [workforceSummaries]);

  const selectedWorkforceSummary = useMemo(() => {
    if (!selectedSigunguCode) return null;
    return workforceSummaryMap.get(selectedSigunguCode) ?? null;
  }, [workforceSummaryMap, selectedSigunguCode]);

  useEffect(() => {
    selectedAdminSummaryRef.current = selectedAdminSummary;
  }, [selectedAdminSummary]);
  useEffect(() => {
    selectedWorkforceSummaryRef.current = selectedWorkforceSummary;
  }, [selectedWorkforceSummary]);

  const recommendedWorkers = useMemo<Recommendation[]>(() => {
    if (!selectedSigunguCode) return [];
    const alreadyAssignedIds = new Set(dispatchAssignments.map((item) => item.workerId));
    return workerMaster
      .filter(
        (worker) =>
          worker.worker_type === recommendationTab &&
          worker.status === "대기" &&
          !alreadyAssignedIds.has(worker.worker_id),
      )
      .map((worker) => {
        let recommendationScore = 0;
        let assignmentType: Recommendation["assignmentType"];
        if (worker.home_sigungu_code === selectedSigunguCode) {
          recommendationScore += 100;
          assignmentType = "지역 내 배정";
        } else if (worker.sido_name === selectedAdminSummary?.sidoName) {
          recommendationScore += 60;
          assignmentType = "동일 시도 지원";
        } else {
          recommendationScore += 20;
          assignmentType = "권역 지원";
        }
        recommendationScore += (worker.battery_percent ?? 0) * 0.2;
        recommendationScore -= Math.min(worker.travel_distance_km ?? 999, 100) * 0.3;
        if (
          recommendationTab === "드론요원" &&
          selectedAdminSummary &&
          selectedAdminSummary.avgAccessScore < 50
        ) {
          recommendationScore += 20;
        }
        return { worker, assignmentType, recommendationScore };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 8);
  }, [
    workerMaster,
    dispatchAssignments,
    recommendationTab,
    selectedSigunguCode,
    selectedAdminSummary,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(GEOJSON_PATH, { cache: "force-cache", signal: controller.signal }),
      fetch(SIGUNGU_BOUNDARY_PATH, { cache: "force-cache", signal: controller.signal }),
      fetch(WORKFORCE_SUMMARY_PATH, { cache: "force-cache", signal: controller.signal }),
      fetch(WORKER_MASTER_PATH, { cache: "force-cache", signal: controller.signal }),
    ])
      .then(async ([gridResponse, boundaryResponse, workforceResponse, workerResponse]) => {
        if (!gridResponse.ok) throw new Error(`격자 GeoJSON ${gridResponse.status}`);
        if (!boundaryResponse.ok) throw new Error(`시군구 경계 ${boundaryResponse.status}`);
        if (!workforceResponse.ok) throw new Error(`인력 요약 ${workforceResponse.status}`);
        if (!workerResponse.ok) throw new Error(`요원 마스터 ${workerResponse.status}`);
        const [gridData, boundaryData, workforceData, workerData] = await Promise.all([
          gridResponse.json(),
          boundaryResponse.json(),
          workforceResponse.json(),
          workerResponse.json(),
        ]);
        if (!Array.isArray(gridData?.features)) throw new Error("격자 GeoJSON 형식 오류");
        if (!Array.isArray(boundaryData?.features)) throw new Error("시군구 경계 형식 오류");
        if (!Array.isArray(workforceData)) throw new Error("인력 요약 형식 오류");
        if (!Array.isArray(workerData)) throw new Error("요원 마스터 형식 오류");
        setGeojson(gridData);
        setSigunguBoundary(boundaryData);
        setWorkforceSummaries(
          workforceData.map((row: any) => ({
            ...row,
            sigungu_code: normalizeCode(row.sigungu_code),
            sido_name: String(row.sido_name ?? ""),
            sigungu_name: String(row.sigungu_name ?? ""),
            all_grid_count: safeNumber(row.all_grid_count),
            target_grid_count: safeNumber(row.target_grid_count),
            very_high_count: safeNumber(row.very_high_count),
            high_count: safeNumber(row.high_count),
            top_priority_count: safeNumber(row.top_priority_count),
            priority_count: safeNumber(row.priority_count),
            low_access_target_count: safeNumber(row.low_access_target_count),
            environment_caution_count: safeNumber(row.environment_caution_count),
            avg_risk_score: safeNumber(row.avg_risk_score),
            avg_infection_pressure: safeNumber(row.avg_infection_pressure),
            avg_access_score: safeNumber(row.avg_access_score),
            estimated_minutes: safeNumber(row.estimated_minutes),
            required_person_days: safeNumber(row.required_person_days),
            required_field_workers: safeNumber(row.required_field_workers),
            available_field_workers: safeNumber(row.available_field_workers),
            field_worker_gap: safeNumber(row.field_worker_gap),
            field_shortage_count: safeNumber(row.field_shortage_count),
            required_drone_workers: safeNumber(row.required_drone_workers),
            available_drone_workers: safeNumber(row.available_drone_workers),
            drone_worker_gap: safeNumber(row.drone_worker_gap),
            drone_shortage_count: safeNumber(row.drone_shortage_count),
            required_control_standby: safeNumber(row.required_control_standby),
            available_control_workers: safeNumber(row.available_control_workers),
            control_worker_gap: safeNumber(row.control_worker_gap),
            control_shortage_count: safeNumber(row.control_shortage_count),
            assigned_grid_count: safeNumber(row.assigned_grid_count),
            assigned_worker_count: safeNumber(row.assigned_worker_count),
            assigned_minutes: safeNumber(row.assigned_minutes),
            unassigned_grid_count: safeNumber(row.unassigned_grid_count),
            unassigned_minutes: safeNumber(row.unassigned_minutes),
            assignment_rate: safeNumber(row.assignment_rate),
          })),
        );
        setWorkerMaster(
          workerData.map((row: any) => ({
            worker_id: String(row.worker_id ?? ""),
            worker_name: String(row.worker_name ?? ""),
            worker_type: String(row.worker_type ?? "현장요원") as WorkerMasterRow["worker_type"],
            home_sigungu_code: normalizeCode(row.home_sigungu_code),
            sido_name: String(row.sido_name ?? ""),
            sigungu_name: String(row.sigungu_name ?? ""),
            status: String(row.status ?? ""),
            availability_status: String(row.availability_status ?? ""),
            travel_distance_km:
              row.travel_distance_km == null ? null : safeNumber(row.travel_distance_km),
            travel_time_hour:
              row.travel_time_hour == null ? null : safeNumber(row.travel_time_hour),
            battery_percent:
              row.battery_percent == null ? null : safeNumber(row.battery_percent),
            battery_context: String(row.battery_context ?? ""),
          })),
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("대시보드 데이터 로드 오류:", error);
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        if (message.includes("격자")) setGeojsonError(message);
        else if (message.includes("경계")) setBoundaryError(message);
        else if (message.includes("요원 마스터")) setWorkerMasterError(message);
        else setWorkforceError(message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    const map = L.map(mapRef.current, {
      center: [36.35, 127.7],
      zoom: 7,
      minZoom: 6,
      maxZoom: 19,
      maxBounds: KOREA_BOUNDS,
      maxBoundsViscosity: 0.9,
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true,
    });
    const baseLayer = L.tileLayer(HAS_VWORLD_KEY ? VWORLD_BASE_URL : OSM_BASE_URL, {
      attribution: HAS_VWORLD_KEY ? "© VWorld" : "© OpenStreetMap contributors",
      minZoom: 6,
      maxZoom: 19,
      bounds: KOREA_BOUNDS,
      noWrap: true,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
      crossOrigin: true,
    });
    const satelliteLayer = L.tileLayer(
      HAS_VWORLD_KEY ? VWORLD_SATELLITE_URL : ESRI_SATELLITE_URL,
      {
        attribution: HAS_VWORLD_KEY ? "© VWorld" : "Tiles © Esri",
        minZoom: 6,
        maxZoom: 19,
        bounds: KOREA_BOUNDS,
        noWrap: true,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 1,
        crossOrigin: true,
      },
    );
    const hybridLayer = L.tileLayer(VWORLD_HYBRID_URL, {
      attribution: "© VWorld",
      minZoom: 6,
      maxZoom: 19,
      bounds: KOREA_BOUNDS,
      noWrap: true,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
      crossOrigin: true,
      opacity: HAS_VWORLD_KEY ? 1 : 0,
    });
    const handleTileLoad = () => {
      if (HAS_VWORLD_KEY) {
        setTileStatus("success");
        setTileErrorMessage("");
      }
    };
    const handleTileError = () => {
      if (!HAS_VWORLD_KEY) return;
      tileErrorCountRef.current += 1;
      if (tileErrorCountRef.current >= 3) {
        setTileStatus("error");
        setTileErrorMessage(
          "VWorld 배경지도를 불러오지 못했습니다. API 키와 허용 도메인을 확인하세요.",
        );
      }
    };
    for (const layer of [baseLayer, satelliteLayer, hybridLayer]) {
      layer.on("tileload", handleTileLoad);
      layer.on("tileerror", handleTileError);
    }
    baseLayer.addTo(map);
    leafletMapRef.current = map;
    vworldBaseLayerRef.current = baseLayer;
    vworldSatelliteLayerRef.current = satelliteLayer;
    vworldHybridLayerRef.current = hybridLayer;
    window.setTimeout(() => map.invalidateSize(), 200);
    return () => {
      map.remove();
      leafletMapRef.current = null;
      gridLayerRef.current = null;
      sigunguLayerRef.current = null;
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletMapRef.current;
    const base = vworldBaseLayerRef.current;
    const satellite = vworldSatelliteLayerRef.current;
    const hybrid = vworldHybridLayerRef.current;
    if (!map || !base || !satellite || !hybrid) return;
    tileErrorCountRef.current = 0;
    if (HAS_VWORLD_KEY) setTileStatus("loading");
    if (baseMapMode === "base") {
      map.removeLayer(satellite);
      map.removeLayer(hybrid);
      if (!map.hasLayer(base)) base.addTo(map);
    } else {
      map.removeLayer(base);
      if (!map.hasLayer(satellite)) satellite.addTo(map);
      if (HAS_VWORLD_KEY && !map.hasLayer(hybrid)) hybrid.addTo(map);
    }
    gridLayerRef.current?.setStyle((feature) =>
      getGridStyle(feature?.properties ?? {}, baseMapMode),
    );
    gridLayerRef.current?.bringToFront();
    sigunguLayerRef.current?.bringToFront();
  }, [baseMapMode]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !sigunguBoundary) return;
    sigunguLayerRef.current?.removeFrom(map);
    sigunguLayerRef.current = null;
    if (selectedSigunguCode) return;

    const layer = L.geoJSON(sigunguBoundary, {
      renderer: GRID_RENDERER,
      style: {
        color: "transparent",
        weight: 0,
        fillColor: "transparent",
        fillOpacity: 0.001,
        interactive: true,
      },
      onEachFeature: (feature, featureLayer) => {
        const path = featureLayer as L.Path;
        const props = feature?.properties ?? {};
        const code = normalizeCode(props.sigungu_code);
        path.bindTooltip(`${props.sido_name ?? ""} ${props.sigungu_name ?? ""}`, {
          sticky: true,
          direction: "top",
        });
        path.on("click", (event: L.LeafletMouseEvent) => {
          if (!code) return;
          setSelectedSigunguCode(code);
          setSelectedEmdCode("");
          setSelected(null);
          setAssignmentMessage("");
          onGridSelectRef.current?.(null);
          map.panTo(event.latlng, { animate: false });
        });
      },
    }).addTo(map);
    sigunguLayerRef.current = layer;
    layer.bringToFront();
    return () => {
      layer.removeFrom(map);
      if (sigunguLayerRef.current === layer) sigunguLayerRef.current = null;
    };
  }, [sigunguBoundary, selectedSigunguCode]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    gridLayerRef.current?.removeFrom(map);
    gridLayerRef.current = null;
    popupRef.current?.remove();
    popupRef.current = null;
    setSelected(null);
    setAssignmentMessage("");
    onGridSelectRef.current?.(null);

    if (!selectedAdminFeatures.length || !selectedAdminSummary) {
      map.fitBounds(KOREA_BOUNDS, { padding: [20, 20], animate: false, maxZoom: 7 });
      return;
    }

    const selectedCollection = {
      type: "FeatureCollection",
      features: selectedAdminFeatures,
    } as any;
    const layer = L.geoJSON(selectedCollection, {
      renderer: GRID_RENDERER,
      style: (feature) => getGridStyle(feature?.properties ?? {}, baseMapMode),
      onEachFeature: (feature, featureLayer) => {
        const path = featureLayer as L.Path;
        const props = feature?.properties ?? {};
        path.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          setSelected(props);
          setAssignmentMessage("");
          onGridSelectRef.current?.(props);
          popupRef.current?.remove();
          popupRef.current = L.popup({
            maxWidth: 310,
            minWidth: 230,
            closeButton: true,
            autoPan: true,
            offset: L.point(14, -10),
            className: "pine-risk-popup",
          })
            .setLatLng(event.latlng)
            .setContent(createGridPopupHtml(props))
            .openOn(map);
        });
      },
    }).addTo(map);
    gridLayerRef.current = layer;
    layer.bringToFront();

    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [28, 28],
        animate: false,
        maxZoom: selectedEmdCode ? 13 : 11,
      });
      window.setTimeout(() => {
        const currentSummary = selectedAdminSummaryRef.current;
        if (!currentSummary) return;
        popupRef.current?.remove();
        popupRef.current = L.popup({
          maxWidth: 320,
          minWidth: 240,
          closeButton: true,
          autoPan: true,
          offset: L.point(18, -8),
          className: "pine-admin-popup",
        })
          .setLatLng(map.getCenter())
          .setContent(
            createAdminPopupHtml(currentSummary, selectedWorkforceSummaryRef.current),
          )
          .openOn(map);
      }, 80);
    }
    return () => {
      layer.removeFrom(map);
      if (gridLayerRef.current === layer) gridLayerRef.current = null;
    };
  }, [selectedAdminFeatures, selectedAdminSummary, selectedEmdCode]);

  function handleAssignRecommendedWorker(
    worker: WorkerMasterRow,
    assignmentType: Recommendation["assignmentType"],
  ) {
    if (!selected) {
      setAssignmentMessage("먼저 지도에서 배정할 격자를 선택하세요.");
      return;
    }
    const gridId = String(selected.grid_id ?? selected.id ?? "");
    if (!gridId) {
      setAssignmentMessage("선택한 격자의 ID를 확인할 수 없습니다.");
      return;
    }
    const duplicated = dispatchAssignments.some(
      (assignment) => assignment.workerId === worker.worker_id && assignment.gridId === gridId,
    );
    if (duplicated) {
      setAssignmentMessage("이미 해당 격자에 배정된 요원입니다.");
      return;
    }
    let recommendationReason =
      "현재 대기 상태이며 선택 격자의 우선예찰 업무에 투입 가능한 추천 요원입니다.";
    if (recommendationTab === "드론요원") {
      recommendationReason = "접근성이 낮은 격자의 사전 항공예찰을 위한 추천입니다.";
    }
    if (recommendationTab === "방제요원") {
      recommendationReason =
        "현장 확인 이후 신속한 방제 대응을 준비하기 위한 대기 배정입니다.";
    }
    const assignment: DispatchAssignment = {
      assignmentId: `DISPATCH-${Date.now()}-${worker.worker_id}`,
      workerId: worker.worker_id,
      workerName: worker.worker_name,
      workerType: worker.worker_type,
      homeSidoName: worker.sido_name,
      homeSigunguCode: worker.home_sigungu_code,
      homeSigunguName: worker.sigungu_name,
      targetSidoName: String(selected.sido_name ?? selectedAdminSummary?.sidoName ?? ""),
      targetSigunguCode: normalizeCode(selected.sigungu_code ?? selectedSigunguCode),
      targetSigunguName: String(
        selected.sigungu_name ?? selectedAdminSummary?.sigunguName ?? "",
      ),
      targetEmdCode: normalizeCode(selected.emd_code ?? selectedEmdCode),
      targetEmdName: String(selected.emd_name ?? selectedAdminSummary?.emdName ?? ""),
      gridId,
      priorityGrade: normalizePriorityGrade(selected),
      riskGrade: normalizeRiskGrade(selected),
      riskScore: safeNumber(selected.risk_score),
      accessScore: safeNumber(selected.access_score_v3),
      distanceKm: worker.travel_distance_km,
      travelTimeHour: worker.travel_time_hour,
      batteryPercent: worker.battery_percent,
      recommendationReason,
      assignmentType,
      status: "배정 대기",
      assignedAt: new Date().toISOString(),
    };
    onAssignWorker(assignment);
    setAssignmentMessage(
      `${worker.worker_name} ${worker.worker_type}을(를) GRID-${gridId}에 배정했습니다.`,
    );
  }

  function handleResetAdmin() {
    setSelectedSigunguCode("");
    setSelectedEmdCode("");
    setSelected(null);
    setAssignmentMessage("");
    popupRef.current?.remove();
    popupRef.current = null;
    onGridSelectRef.current?.(null);
  }



  const assignedGridCount =
    selectedWorkforceSummary?.assigned_grid_count ?? 0;

  const unassignedGridCount =
    selectedWorkforceSummary?.unassigned_grid_count ?? 0;

  const regionName = selectedAdminSummary
    ? [
        selectedAdminSummary.sidoName,
        selectedAdminSummary.sigunguName,
        selectedAdminSummary.emdName,
      ]
        .filter(Boolean)
        .join(" ")
    : "전국";

  const highRiskCount = selectedAdminSummary
    ? getHighRiskCount(selectedAdminSummary)
    : 0;

  const priorityTargetCount = selectedAdminSummary
    ? getPriorityTargetCount(selectedAdminSummary)
    : 0;

  const weeklyTrend = useMemo(() => {
    const base = Math.max(
      selectedAdminSummary?.totalGridCount ?? 100,
      40,
    );

    return [
      { label: "1주", report: Math.round(base * 0.08), field: Math.round(base * 0.04) },
      { label: "2주", report: Math.round(base * 0.11), field: Math.round(base * 0.06) },
      { label: "3주", report: Math.round(base * 0.15), field: Math.round(base * 0.08) },
      { label: "4주", report: Math.round(base * 0.19), field: Math.round(base * 0.11) },
      { label: "5주", report: Math.round(base * 0.14), field: Math.round(base * 0.09) },
      { label: "6주", report: Math.round(base * 0.18), field: Math.round(base * 0.12) },
      { label: "7주", report: Math.round(base * 0.23), field: Math.round(base * 0.15) },
    ];
  }, [selectedAdminSummary]);

  const maxTrendValue = Math.max(
    ...weeklyTrend.flatMap((item) => [item.report, item.field]),
    1,
  );

  const controlRows = useMemo(() => {
    if (!selectedAdminSummary) {
      return [
        { label: "경상북도", candidate: 1240, priority: 420, status: "집중 관찰", tone: "danger" as const },
        { label: "경상남도", candidate: 865, priority: 278, status: "우선 검토", tone: "warning" as const },
        { label: "강원특별자치도", candidate: 510, priority: 164, status: "현장 확인", tone: "warning" as const },
        { label: "전라남도", candidate: 340, priority: 92, status: "정기 관찰", tone: "success" as const },
      ];
    }

    return [
      {
        label: "전체 후보",
        candidate: selectedAdminSummary.totalGridCount,
        priority: priorityTargetCount,
        status: "실시간 집계",
        tone: "neutral" as const,
      },
      {
        label: "고위험 후보",
        candidate: highRiskCount,
        priority: selectedAdminSummary.veryHighGridCount,
        status: "현장 확인",
        tone: "danger" as const,
      },
      {
        label: "최우선 예찰",
        candidate: selectedAdminSummary.topPriorityGridCount,
        priority: selectedAdminSummary.topPriorityGridCount,
        status: "우선 검토",
        tone: "warning" as const,
      },
      {
        label: "우선 예찰",
        candidate: selectedAdminSummary.priorityGridCount,
        priority: selectedAdminSummary.priorityGridCount,
        status: "일정 편성",
        tone: "success" as const,
      },
    ];
  }, [selectedAdminSummary, highRiskCount, priorityTargetCount]);

  const selectedGridId = selected
    ? String(selected.grid_id ?? selected.id ?? "-")
    : "";

  return (
    <div className="h-full min-h-0">
      <div
        className="grid h-full min-h-0 gap-4"
        style={{
          gridTemplateColumns: "minmax(0, 1.42fr) minmax(410px, 0.88fr)",
          gridTemplateRows: "auto minmax(0, 1fr)",
        }}
      >
        <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <select
              value={selectedSigunguCode}
              onChange={(event) => {
                setSelectedSigunguCode(event.target.value);
                setSelectedEmdCode("");
                setSelected(null);
                setAssignmentMessage("");
              }}
              className="min-w-[220px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 outline-none focus:border-emerald-700"
            >
              <option value="">위치(시/군/구) 선택</option>
              {sigunguOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.sidoName} {option.sigunguName}
                </option>
              ))}
            </select>

            <select
              value={selectedEmdCode}
              onChange={(event) => {
                setSelectedEmdCode(event.target.value);
                setSelected(null);
                setAssignmentMessage("");
              }}
              disabled={!selectedSigunguCode}
              className="min-w-[180px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">읍면동 전체</option>
              {emdOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleResetAdmin}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              선택 초기화
            </button>

            <div className="hidden text-xs font-bold text-slate-400 xl:block">
              {selectedGridId
                ? `선택 격자 GRID-${selectedGridId}`
                : `선택 지역 ${regionName}`}
            </div>
          </div>

          <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setBaseMapMode("base")}
              className={
                baseMapMode === "base"
                  ? "rounded-lg bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm"
                  : "rounded-lg px-4 py-2 text-sm font-bold text-slate-500"
              }
            >
              일반지도
            </button>
            <button
              type="button"
              onClick={() => setBaseMapMode("satellite")}
              className={
                baseMapMode === "satellite"
                  ? "rounded-lg bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm"
                  : "rounded-lg px-4 py-2 text-sm font-bold text-slate-500"
              }
            >
              위성지도
            </button>
          </div>
        </div>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          {[geojsonError, boundaryError, workforceError, workerMasterError]
            .filter(Boolean)
            .map((message) => (
              <div
                key={message}
                className="m-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                {message}
              </div>
            ))}

          {tileStatus === "error" && (
            <div className="m-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {tileErrorMessage}
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            <div
              ref={mapRef}
              className="h-full w-full bg-[#EEF7F3]"
            />

            {tileStatus === "loading" && (
              <div className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-bold text-slate-600 shadow">
                VWorld 지도 불러오는 중...
              </div>
            )}

            {!selectedSigunguCode && (
              <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-bold text-slate-600 shadow">
                지도에서 시군구를 클릭하거나 상단 목록에서 선택하세요.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
            <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-600">
              <Legend color="#ff2b57" label="최우선 예찰" />
              <Legend color="#ff9f0a" label="우선 예찰" />
              <Legend color="#ffcc00" label="집중 관찰" />
              <Legend color="#1fc16b" label="정기 관찰" />
            </div>

            <div className="text-[11px] font-semibold text-slate-400">
              감염 확정이 아닌 신규 확산위험 후보 및 우선 예찰 검토지역
            </div>
          </div>
        </section>

        <aside
          className="grid min-h-0 min-w-0 gap-3"
          style={{
            gridTemplateRows:
              "minmax(175px, 0.92fr) minmax(190px, 1fr) minmax(150px, 0.82fr)",
          }}
        >
          <section className="min-h-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900">
                📈 주간 예찰 제보 및 현장 확인 추이
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                최근 7주
              </span>
            </div>

            <div className="mt-3 flex h-[118px] items-end justify-between gap-2 px-1">
              {weeklyTrend.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div className="flex h-[92px] items-end gap-1">
                    <div
                      className="w-3 rounded-t bg-sky-400"
                      style={{
                        height: `${Math.max(
                          12,
                          (item.report / maxTrendValue) * 88,
                        )}px`,
                      }}
                    />
                    <div
                      className="w-3 rounded-t bg-rose-500"
                      style={{
                        height: `${Math.max(
                          8,
                          (item.field / maxTrendValue) * 88,
                        )}px`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-1 flex justify-center gap-4 text-[10px] font-bold text-slate-500">
              <Legend color="#38bdf8" label="예찰 제보" />
              <Legend color="#f43f5e" label="현장 확인" />
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900">
                📋 지역별 위험후보 및 우선순위
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                실시간 집계
              </span>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 text-left">구분</th>
                    <th className="px-3 py-2.5 text-right">후보 격자</th>
                    <th className="px-3 py-2.5 text-right">우선 예찰</th>
                    <th className="px-3 py-2.5 text-right">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {controlRows.map((row) => (
                    <ControlRow
                      key={row.label}
                      label={row.label}
                      candidate={row.candidate}
                      priority={row.priority}
                      status={row.status}
                      tone={row.tone}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900">
                👥 시민 제보·현장 확인 관제
              </h3>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                실시간
              </span>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              <ControlNotice
                tone="danger"
                title={
                  selectedGridId
                    ? `GRID-${selectedGridId} 현장 확인 검토`
                    : "고위험 후보 현장 확인 필요"
                }
                description={
                  selectedGridId
                    ? `${normalizePriorityGrade(selected)} · 위험도 ${formatNumber(
                        selected?.risk_score,
                        1,
                      )}점`
                    : `${formatNumber(highRiskCount, 0)}개 후보지역 우선 검토`
                }
              />
              <ControlNotice
                tone="warning"
                title="접근 취약지역 드론 예찰 검토"
                description={
                  selectedAdminSummary
                    ? `평균 접근성 ${formatNumber(
                        selectedAdminSummary.avgAccessScore,
                        1,
                      )}점`
                    : "시군구 선택 후 접근성 기반 우선지역 표시"
                }
              />
              <ControlNotice
                tone="info"
                title="행정구역별 예찰 일정 연계"
                description={`${formatNumber(
                  priorityTargetCount,
                  0,
                )}개 최우선·우선 예찰 검토지역`}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ControlRow({
  label,
  candidate,
  priority,
  status,
  tone,
}: {
  label: string;
  candidate: number;
  priority: number;
  status: string;
  tone: "danger" | "warning" | "success" | "neutral";
}) {
  const badge =
    tone === "danger"
      ? "bg-rose-50 text-rose-600"
      : tone === "warning"
        ? "bg-amber-50 text-amber-600"
        : tone === "success"
          ? "bg-emerald-50 text-emerald-600"
          : "bg-slate-100 text-slate-600";

  return (
    <tr>
      <td className="px-3 py-2.5 font-semibold text-slate-700">{label}</td>
      <td className="px-3 py-2.5 text-right text-slate-600">
        {formatNumber(candidate, 0)}개
      </td>
      <td className="px-3 py-2.5 text-right text-slate-600">
        {formatNumber(priority, 0)}개
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${badge}`}>
          {status}
        </span>
      </td>
    </tr>
  );
}

function ControlNotice({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "danger" | "warning" | "info";
}) {
  const className =
    tone === "danger"
      ? "border-rose-100 bg-rose-50 text-rose-800"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50 text-amber-800"
        : "border-blue-100 bg-blue-50 text-blue-800";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${className}`}>
      <div className="text-xs font-extrabold">{title}</div>
      <div className="mt-1 text-[10px] font-semibold opacity-80">
        {description}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}
