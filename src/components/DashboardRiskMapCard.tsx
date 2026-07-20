// FINAL_INFECTION_SQUARE_TOP10_FIX_20260718
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  DispatchAssignment,
  DispatchTaskType,
} from "../types/dispatch";

type BaseMapMode = "base" | "satellite";
type MapDisplayMode = "priority" | "risk";
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

type TaskCapability = {
  taskType: DispatchTaskType;
  skillLevel: number;
  canWorkSolo: boolean;
  isPrimarySkill: boolean;
};

type ServiceArea = {
  sidoCode: string;
  sigunguCode: string;
  sigunguName: string;
  assignmentPriority: number;
  supportType: "PRIMARY" | "NEIGHBOR_SUPPORT" | "WIDE_AREA_SUPPORT";
  maxTravelKm: number;
};

type RegionWorkforceCapacity = {
  sigungu_code: string;
  sido_name: string;
  sigungu_name: string;
  registered_worker_count: number;
  available_worker_count: number;
  survey_available_count: number;
  drone_available_count: number;
  control_available_count: number;
  remaining_minutes: number;
  open_task_count: number;
  shortage_worker_count: number;
  support_required: number;
};

type WorkerMasterRow = {
  worker_id: string;
  worker_name: string;
  home_sido_code: string;
  home_sido_name: string;
  home_sigungu_code: string;
  home_sigungu_name: string;
  base_lat: number;
  base_lon: number;
  experience_years: number;
  capabilities: TaskCapability[];
  serviceAreas: ServiceArea[];
  availability_status: string;
  remaining_minutes: number;
  status: string;
  battery_percent: number | null;
};

type Recommendation = {
  worker: WorkerMasterRow;
  assignmentType: "지역 내 배정" | "인접지역 지원" | "광역 지원";
  recommendationScore: number;
  distanceKm: number | null;
  skillLevel: number;
  reason: string;
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
const INFECTION_HISTORY_PATH = "/data/infection_history_2016_2021.geojson";
const WORKERS_PATH = "/data/workforce_v2/workers.json";
const WORKER_CAPABILITIES_PATH = "/data/workforce_v2/worker_capabilities.json";
const WORKER_SERVICE_AREAS_PATH = "/data/workforce_v2/worker_service_areas.json";
const WORKER_AVAILABILITY_PATH = "/data/workforce_v2/worker_availability.json";
const WORKER_CURRENT_STATUS_PATH = "/data/workforce_v2/worker_current_status.json";
const REGION_WORKFORCE_CAPACITY_PATH = "/data/workforce_v2/region_workforce_capacity.json";

const KOREA_BOUNDS = L.latLngBounds(L.latLng(32.5, 124.0), L.latLng(39.8, 132.2));
const GRID_RENDERER = L.canvas({ padding: 0.25, tolerance: 4 });

const priorityColors: Record<string, string> = {
  "최우선 예찰": "#ff2b57",
  "우선 예찰": "#ff9f0a",
  "집중 관찰": "#ffcc00",
  "정기 관찰": "#1fc16b",
  "일반 관리": "#d9d9d9",
};

const riskColors: Record<string, string> = {
  // 예찰 우선순위와 단계별 색상을 동일하게 맞춤
  "매우 높음": "#ff2b57",
  "높음": "#ff9f0a",
  "주의": "#ffcc00",
  "관찰": "#1fc16b",
  "낮음": "#d9d9d9",
};

const INFECTION_HISTORY_COLOR = "#5b21b6";

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

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isEnabledFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "y", "yes"].includes(normalized);
}

function isTop10Candidate(props: any, mode: MapDisplayMode) {
  const flagValue =
    mode === "priority"
      ? props?.priority_candidate_flag
      : props?.risk_candidate_flag;

  if (hasValue(flagValue)) {
    return isEnabledFlag(flagValue);
  }

  const topPercentValue =
    mode === "priority"
      ? props?.priority_top_percent
      : props?.risk_top_percent;

  if (hasValue(topPercentValue) && Number.isFinite(Number(topPercentValue))) {
    return Number(topPercentValue) <= 10;
  }

  if (mode === "priority") {
    return normalizePriorityGrade(props) !== "일반 관리";
  }

  return ["매우 높음", "높음", "주의", "관찰"].includes(
    normalizeRiskGrade(props),
  );
}

type SpatialBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

function extendBoundsFromCoordinates(
  coordinates: any,
  bounds: SpatialBounds,
) {
  if (!Array.isArray(coordinates)) return;

  if (
    coordinates.length >= 2 &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]))
  ) {
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    return;
  }

  for (const child of coordinates) {
    extendBoundsFromCoordinates(child, bounds);
  }
}

function getFeaturesBounds(features: any[]): SpatialBounds | null {
  const bounds: SpatialBounds = {
    minLat: Number.POSITIVE_INFINITY,
    minLng: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
  };

  for (const feature of features) {
    extendBoundsFromCoordinates(feature?.geometry?.coordinates, bounds);
  }

  if (
    !Number.isFinite(bounds.minLat) ||
    !Number.isFinite(bounds.minLng) ||
    !Number.isFinite(bounds.maxLat) ||
    !Number.isFinite(bounds.maxLng)
  ) {
    return null;
  }

  return bounds;
}

function getFeatureCenter(feature: any): [number, number] | null {
  const bounds = getFeaturesBounds([feature]);
  if (!bounds) return null;
  return [
    (bounds.minLng + bounds.maxLng) / 2,
    (bounds.minLat + bounds.maxLat) / 2,
  ];
}

function isPointInsideBounds(
  lng: number,
  lat: number,
  bounds: SpatialBounds,
  padding = 0,
) {
  return (
    lng >= bounds.minLng - padding &&
    lng <= bounds.maxLng + padding &&
    lat >= bounds.minLat - padding &&
    lat <= bounds.maxLat + padding
  );
}

function isPointInRing(lng: number, lat: number, ring: any[]) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);

    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function isPointInPolygonCoordinates(
  lng: number,
  lat: number,
  polygonCoordinates: any[],
) {
  if (!polygonCoordinates.length) return false;
  if (!isPointInRing(lng, lat, polygonCoordinates[0])) return false;

  for (let index = 1; index < polygonCoordinates.length; index += 1) {
    if (isPointInRing(lng, lat, polygonCoordinates[index])) return false;
  }

  return true;
}

function isPointInGeometry(lng: number, lat: number, geometry: any) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return isPointInPolygonCoordinates(lng, lat, geometry.coordinates ?? []);
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates ?? []).some((polygon: any[]) =>
      isPointInPolygonCoordinates(lng, lat, polygon),
    );
  }

  return false;
}

function getGridStyle(
  props: any,
  baseMapMode: BaseMapMode,
  mapDisplayMode: MapDisplayMode,
): L.PathOptions {
  const grade =
    mapDisplayMode === "priority"
      ? normalizePriorityGrade(props)
      : normalizeRiskGrade(props);
  const color =
    mapDisplayMode === "priority"
      ? priorityColors[grade] ?? "#cccccc"
      : riskColors[grade] ?? "#cccccc";
  const isLow =
    mapDisplayMode === "priority"
      ? grade === "일반 관리"
      : grade === "낮음";

  return {
    color: isLow ? "transparent" : color,
    weight: isLow ? 0 : baseMapMode === "satellite" ? 0.7 : 0.55,
    fillColor: color,
    fillOpacity: isLow
      ? baseMapMode === "satellite"
        ? 0.02
        : 0.05
      : baseMapMode === "satellite"
        ? 0.42
        : 0.72,
    interactive: true,
  };
}

function getInfectionHistoryStyle(
  baseMapMode: BaseMapMode,
): L.PathOptions {
  return {
    color: INFECTION_HISTORY_COLOR,
    weight: baseMapMode === "satellite" ? 1.35 : 1.15,
    opacity: 1,
    fill: true,
    fillColor: INFECTION_HISTORY_COLOR,
    fillOpacity: baseMapMode === "satellite" ? 0.48 : 0.56,
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

function createAdminPopupHtml(summary: AdminSummary, workforce: RegionWorkforceCapacity | null) {
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
        <tr><td style="padding:5px 0;color:#64748b">최우선 예찰</td><td style="text-align:right;font-weight:700;color:#c2410c">${formatNumber(summary.topPriorityGridCount, 0)}개</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">평균 위험도</td><td style="text-align:right;font-weight:700">${formatNumber(summary.avgRiskScore, 1)}점</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">평균 접근성</td><td style="text-align:right;font-weight:700">${formatNumber(summary.avgAccessScore, 1)}점</td></tr>
        ${workforce ? `<tr><td style="padding:5px 0;color:#64748b">현재 가용요원</td><td style="text-align:right;font-weight:700">${formatNumber(workforce.available_worker_count, 0)}명</td></tr>` : ""}
      </table>
      <div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.5">감염 확정이 아닌 신규 확산위험 후보 및 우선 예찰 검토지역입니다.</div>
    </div>`;
}

function createGridPopupHtml(
  props: any,
  infectionHistory: any | null,
) {
  const riskGrade = normalizeRiskGrade(props);
  const priorityGrade = normalizePriorityGrade(props);
  const hasInfectionHistory =
    safeNumber(infectionHistory?.infection_history_flag_2021) === 1 ||
    safeNumber(infectionHistory?.infection_count_2016_2021) > 0;
  const infectionCount = safeNumber(
    infectionHistory?.infection_count_2016_2021,
  );

  return `
    <div style="min-width:250px;font-family:Pretendard,Arial,sans-serif;color:#0f172a">
      <div style="font-size:16px;font-weight:800;margin-bottom:9px">격자 분석 상세</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tr><td style="padding:5px 0;color:#64748b">격자 ID</td><td style="text-align:right;font-weight:700">${escapeHtml(props.grid_id ?? props.id ?? "-")}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">AI 위험도</td><td style="text-align:right;font-weight:700">${formatNumber(props.risk_score, 2)}점 / ${escapeHtml(riskGrade)}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">예찰 우선순위</td><td style="text-align:right;font-weight:700">${formatNumber(props.field_priority_score_v3, 2)}점 / ${escapeHtml(priorityGrade)}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">2016~2021년 감염 발생 이력</td><td style="text-align:right;font-weight:800;color:${hasInfectionHistory ? INFECTION_HISTORY_COLOR : "#64748b"}">${hasInfectionHistory ? "있음" : "없음"}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">누적 발생 건수</td><td style="text-align:right;font-weight:700">${formatNumber(infectionCount, 0)}건</td></tr>
        ${
          hasInfectionHistory
            ? `<tr><td style="padding:5px 0;color:#64748b">최초 발생 이력 연도</td><td style="text-align:right;font-weight:700">${formatNumber(infectionHistory?.infection_first_year, 0)}년</td></tr>
               <tr><td style="padding:5px 0;color:#64748b">최근 발생 이력 연도</td><td style="text-align:right;font-weight:700">${formatNumber(infectionHistory?.infection_last_year, 0)}년</td></tr>`
            : ""
        }
        <tr><td style="padding:5px 0;color:#64748b">소나무류 비율</td><td style="text-align:right;font-weight:700">${formatNumber(safeNumber(props.pine_ratio) * 100, 1)}%</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">주변 발생 이력 기반 확산압력</td><td style="text-align:right;font-weight:700">${formatNumber(props.recent_pressure_score ?? props.infection_pressure, 1)}점</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">접근성</td><td style="text-align:right;font-weight:700">${formatNumber(props.access_score_v3, 1)}점</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">가장 가까운 도로</td><td style="text-align:right;font-weight:700">${escapeHtml(props.nearest_road_type ?? props.road_class_near ?? "-")}</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">도로까지 거리</td><td style="text-align:right;font-weight:700">${formatNumber(props.distance_to_nearest_road_m_v3 ?? props.road_dist_m, 1)}m</td></tr>
        <tr><td style="padding:5px 0;color:#64748b">환경주의</td><td style="text-align:right;font-weight:700">${safeNumber(props.environment_caution_flag_v3 ?? props.env_flag) === 1 ? "현장 확인 필요" : "해당 없음"}</td></tr>
      </table>
      <div style="margin-top:9px;padding:7px 9px;border-radius:8px;background:#f5f3ff;color:#4c1d95;font-size:10px;line-height:1.5">감염 발생 이력은 2016~2021년 조사자료 기준이며, 2022년 이후는 예측·검증·평가 구간으로 별도 관리합니다.</div>
    </div>`;
}

interface DashboardRiskMapCardProps {
  dispatchAssignments: DispatchAssignment[];
  onAssignWorker: (assignment: DispatchAssignment) => void;
  onGridSelect?: (grid: any) => void;
  initialSigunguCode?: string;
  initialSigunguName?: string;
}

export default function DashboardRiskMapCard({
  dispatchAssignments,
  onAssignWorker,
  onGridSelect,
  initialSigunguCode,
  initialSigunguName,
}: DashboardRiskMapCardProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const gridLayerRef = useRef<L.GeoJSON | null>(null);
  const infectionHistoryLayerRef = useRef<L.GeoJSON | null>(null);
  const sigunguLayerRef = useRef<L.GeoJSON | null>(null);
  const popupRef = useRef<L.Popup | null>(null);
  const vworldBaseLayerRef = useRef<L.TileLayer | null>(null);
  const vworldSatelliteLayerRef = useRef<L.TileLayer | null>(null);
  const vworldHybridLayerRef = useRef<L.TileLayer | null>(null);
  const tileErrorCountRef = useRef(0);
  const onGridSelectRef = useRef(onGridSelect);
  const selectedAdminSummaryRef = useRef<AdminSummary | null>(null);
  const selectedRegionCapacityRef = useRef<RegionWorkforceCapacity | null>(null);
  const infectionHistoryIndexRef = useRef<Map<string, any>>(new Map());
  const initialRegionAppliedRef = useRef(false);

  const [geojson, setGeojson] = useState<any>(null);
  const [infectionHistory, setInfectionHistory] = useState<any>(null);
  const [sigunguBoundary, setSigunguBoundary] = useState<any>(null);
  const [regionCapacities, setRegionCapacities] = useState<RegionWorkforceCapacity[]>([]);
  const [workerMaster, setWorkerMaster] = useState<WorkerMasterRow[]>([]);
  const [geojsonError, setGeojsonError] = useState("");
  const [boundaryError, setBoundaryError] = useState("");
  const [infectionHistoryError, setInfectionHistoryError] = useState("");
  const [infectionHistoryLoading, setInfectionHistoryLoading] = useState(true);
  const [visibleInfectionHistoryFeatures, setVisibleInfectionHistoryFeatures] =
    useState<any[]>([]);
  const [workforceError, setWorkforceError] = useState("");
  const [workerMasterError, setWorkerMasterError] = useState("");
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("base");
  const [mapDisplayMode, setMapDisplayMode] =
    useState<MapDisplayMode>("priority");
  const [showInfectionHistory, setShowInfectionHistory] = useState(true);
  const [selectedSigunguCode, setSelectedSigunguCode] = useState("");
  const [selectedEmdCode, setSelectedEmdCode] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [selectedTaskType, setSelectedTaskType] =
    useState<DispatchTaskType>("SURVEY");
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

  useEffect(() => {
    const controller = new AbortController();
    setInfectionHistoryLoading(true);
    setInfectionHistoryError("");

    fetch(INFECTION_HISTORY_PATH, {
      cache: "no-cache",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`감염 발생 이력 데이터 로드 ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data?.features)) {
          throw new Error("감염 발생 이력 GeoJSON 형식 오류");
        }
        setInfectionHistory(data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("감염 발생 이력 데이터 로드 오류:", error);
        setInfectionHistoryError(
          error instanceof Error
            ? error.message
            : "감염 발생 이력 데이터를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setInfectionHistoryLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const features = useMemo(
    () => (Array.isArray(geojson?.features) ? geojson.features : []),
    [geojson],
  );

  const infectionHistoryFeatures = useMemo(
    () =>
      Array.isArray(infectionHistory?.features)
        ? infectionHistory.features
        : [],
    [infectionHistory],
  );

  const infectionHistoryIndex = useMemo(() => {
    const index = new Map<string, any>();
    for (const feature of infectionHistoryFeatures) {
      const props = feature?.properties ?? {};
      const id = normalizeCode(props.id ?? props.grid_id);
      if (id) index.set(id, feature);
    }
    return index;
  }, [infectionHistoryFeatures]);

  useEffect(() => {
    const propertyIndex = new Map<string, any>();
    for (const [id, feature] of infectionHistoryIndex.entries()) {
      propertyIndex.set(id, feature?.properties ?? {});
    }
    infectionHistoryIndexRef.current = propertyIndex;
  }, [infectionHistoryIndex]);

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

  useEffect(() => {
    if (initialRegionAppliedRef.current || !sigunguOptions.length) return;

    const requestedCode = normalizeCode(initialSigunguCode);
    const requestedName = String(initialSigunguName ?? "").trim();

    const matched =
      sigunguOptions.find((option) => option.code === requestedCode) ??
      sigunguOptions.find((option) =>
        requestedName && option.sigunguName === requestedName,
      );

    initialRegionAppliedRef.current = true;

    if (!matched) {
      console.warn("로그인 계정 지역을 지도 데이터에서 찾지 못했습니다.", {
        initialSigunguCode,
        initialSigunguName,
      });
      return;
    }

    setSelectedSigunguCode(matched.code);
    setSelectedEmdCode("");
  }, [sigunguOptions, initialSigunguCode, initialSigunguName]);

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

  const selectedDisplayFeatures = useMemo(
    () =>
      selectedAdminFeatures.filter((feature) =>
        isTop10Candidate(feature?.properties ?? {}, mapDisplayMode),
      ),
    [selectedAdminFeatures, mapDisplayMode],
  );

  const infectionSpatialFeatures = useMemo(
    () =>
      infectionHistoryFeatures
        .map((feature) => ({
          feature,
          center: getFeatureCenter(feature),
        }))
        .filter(
          (item): item is { feature: any; center: [number, number] } =>
            item.center !== null,
        ),
    [infectionHistoryFeatures],
  );

  const selectedSigunguBoundaryFeature = useMemo(() => {
    if (!selectedSigunguCode || !Array.isArray(sigunguBoundary?.features)) {
      return null;
    }

    return (
      sigunguBoundary.features.find((feature: any) =>
        normalizeCode(feature?.properties?.sigungu_code) === selectedSigunguCode,
      ) ?? null
    );
  }, [sigunguBoundary, selectedSigunguCode]);

  useEffect(() => {
    if (
      !showInfectionHistory ||
      !selectedSigunguCode ||
      !infectionSpatialFeatures.length
    ) {
      setVisibleInfectionHistoryFeatures([]);
      return;
    }

    const emdBounds = selectedEmdCode
      ? getFeaturesBounds(selectedAdminFeatures)
      : null;

    const visible = infectionSpatialFeatures
      .filter(({ center }) => {
        const [lng, lat] = center;

        if (selectedEmdCode && emdBounds) {
          return isPointInsideBounds(lng, lat, emdBounds, 0.0001);
        }

        if (selectedSigunguBoundaryFeature?.geometry) {
          return isPointInGeometry(
            lng,
            lat,
            selectedSigunguBoundaryFeature.geometry,
          );
        }

        const fallbackBounds = getFeaturesBounds(selectedAdminFeatures);
        return fallbackBounds
          ? isPointInsideBounds(lng, lat, fallbackBounds, 0.0001)
          : false;
      })
      .map(({ feature }) => feature);

    setVisibleInfectionHistoryFeatures(visible);
  }, [
    infectionSpatialFeatures,
    showInfectionHistory,
    selectedSigunguCode,
    selectedEmdCode,
    selectedSigunguBoundaryFeature,
    selectedAdminFeatures,
  ]);

  const selectedAdminSummary = useMemo(() => {
    if (selectedEmdCode) return buildSummary(selectedAdminFeatures, "emd");
    if (selectedSigunguCode) return buildSummary(selectedAdminFeatures, "sigungu");
    return null;
  }, [selectedAdminFeatures, selectedSigunguCode, selectedEmdCode]);

  const regionCapacityMap = useMemo(() => {
    const map = new Map<string, RegionWorkforceCapacity>();
    for (const row of regionCapacities) {
      const code = normalizeCode(row.sigungu_code);
      if (code) map.set(code, row);
    }
    return map;
  }, [regionCapacities]);

  const selectedRegionCapacity = useMemo(() => {
    if (!selectedSigunguCode) return null;
    return regionCapacityMap.get(selectedSigunguCode) ?? null;
  }, [regionCapacityMap, selectedSigunguCode]);

  useEffect(() => {
    selectedAdminSummaryRef.current = selectedAdminSummary;
  }, [selectedAdminSummary]);
  useEffect(() => {
    selectedRegionCapacityRef.current = selectedRegionCapacity;
  }, [selectedRegionCapacity]);

  const selectedTaskLabel =
    selectedTaskType === "SURVEY"
      ? "예찰"
      : selectedTaskType === "DRONE"
        ? "드론"
        : "방제";

  const recommendedWorkers = useMemo<Recommendation[]>(() => {
    if (!selectedSigunguCode) return [];
    const alreadyAssignedIds = new Set(
      dispatchAssignments
        .filter((item) => item.status !== "복귀 완료")
        .map((item) => item.workerId),
    );
    const targetLat = selected ? safeNumber(selected.__lat) : null;
    const targetLon = selected ? safeNumber(selected.__lon) : null;

    return workerMaster
      .filter((worker) => {
        const capability = worker.capabilities.find(
          (item) => item.taskType === selectedTaskType,
        );
        if (!capability) return false;
        const availabilityOk = [
          "AVAILABLE",
          "PARTIAL",
          "대기",
          "가능",
        ].includes(worker.availability_status);
        const statusOk = [
          "AVAILABLE",
          "대기",
          "복귀",
        ].includes(worker.status);
        if (!availabilityOk || !statusOk) return false;
        if (worker.remaining_minutes <= 0) return false;
        if (alreadyAssignedIds.has(worker.worker_id)) return false;

        const homeRegionMatch =
          worker.home_sigungu_code === selectedSigunguCode;
        const serviceAreaMatch = worker.serviceAreas.some(
          (area) =>
            area.sigunguCode === selectedSigunguCode ||
            (area.supportType === "WIDE_AREA_SUPPORT" &&
              area.sidoCode === selectedAdminSummary?.sidoCode),
        );

        return homeRegionMatch || serviceAreaMatch;
      })
      .map((worker) => {
        const capability = worker.capabilities.find(
          (item) => item.taskType === selectedTaskType,
        )!;
        const serviceArea =
          worker.serviceAreas.find(
            (area) =>
              area.sigunguCode === selectedSigunguCode && area.supportType === "PRIMARY",
          ) ??
          worker.serviceAreas.find(
            (area) =>
              area.sigunguCode === selectedSigunguCode &&
              area.supportType === "NEIGHBOR_SUPPORT",
          ) ??
          worker.serviceAreas.find(
            (area) =>
              area.supportType === "WIDE_AREA_SUPPORT" &&
              area.sidoCode === selectedAdminSummary?.sidoCode,
          ) ??
          (worker.home_sigungu_code === selectedSigunguCode
            ? {
                sidoCode: worker.home_sido_code,
                sigunguCode: worker.home_sigungu_code,
                sigunguName: worker.home_sigungu_name,
                assignmentPriority: 1,
                supportType: "PRIMARY" as const,
                maxTravelKm: 35,
              }
            : undefined);

        const assignmentType: Recommendation["assignmentType"] =
          serviceArea?.supportType === "PRIMARY"
            ? "지역 내 배정"
            : serviceArea?.supportType === "NEIGHBOR_SUPPORT"
              ? "인접지역 지원"
              : "광역 지원";

        const distanceKm =
          targetLat !== null && targetLon !== null
            ? calculateDistanceKm(
                worker.base_lat,
                worker.base_lon,
                targetLat,
                targetLon,
              )
            : null;

        let recommendationScore =
          assignmentType === "지역 내 배정"
            ? 40
            : assignmentType === "인접지역 지원"
              ? 25
              : 12;
        recommendationScore += capability.skillLevel * 12;
        recommendationScore += Math.min(worker.remaining_minutes / 30, 14);
        recommendationScore += capability.canWorkSolo ? 6 : 0;
        recommendationScore += Math.min(worker.experience_years, 10) * 0.8;
        if (distanceKm !== null) recommendationScore -= Math.min(distanceKm, 100) * 0.25;

        const reason = `${assignmentType} · ${selectedTaskLabel} ${capability.skillLevel}단계 · 잔여 ${formatNumber(worker.remaining_minutes, 0)}분`;
        return {
          worker,
          assignmentType,
          recommendationScore,
          distanceKm,
          skillLevel: capability.skillLevel,
          reason,
        };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 12);
  }, [
    workerMaster,
    dispatchAssignments,
    selectedTaskType,
    selectedSigunguCode,
    selectedAdminSummary,
    selected,
    selectedTaskLabel,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(GEOJSON_PATH, { cache: "force-cache", signal: controller.signal }),
      fetch(SIGUNGU_BOUNDARY_PATH, { cache: "force-cache", signal: controller.signal }),
      fetch(WORKERS_PATH, { cache: "no-cache", signal: controller.signal }),
      fetch(WORKER_CAPABILITIES_PATH, { cache: "no-cache", signal: controller.signal }),
      fetch(WORKER_SERVICE_AREAS_PATH, { cache: "no-cache", signal: controller.signal }),
      fetch(WORKER_AVAILABILITY_PATH, { cache: "no-cache", signal: controller.signal }),
      fetch(WORKER_CURRENT_STATUS_PATH, { cache: "no-cache", signal: controller.signal }),
      fetch(REGION_WORKFORCE_CAPACITY_PATH, { cache: "no-cache", signal: controller.signal }),
    ])
      .then(async (responses) => {
        for (const response of responses) {
          if (!response.ok) throw new Error(`데이터 로드 ${response.status}`);
        }
        const [
          gridData,
          boundaryData,
          workersData,
          capabilitiesData,
          serviceAreasData,
          availabilityData,
          currentStatusData,
          capacityData,
        ] = await Promise.all(responses.map((response) => response.json()));

        if (!Array.isArray(gridData?.features)) throw new Error("격자 GeoJSON 형식 오류");
        if (!Array.isArray(boundaryData?.features)) throw new Error("시군구 경계 형식 오류");
        for (const data of [
          workersData,
          capabilitiesData,
          serviceAreasData,
          availabilityData,
          currentStatusData,
          capacityData,
        ]) {
          if (!Array.isArray(data)) throw new Error("현장요원 v2 데이터 형식 오류");
        }

        const capabilityMap = new Map<string, TaskCapability[]>();
        for (const row of capabilitiesData) {
          const workerId = String(row.worker_id ?? "");
          const taskType = String(row.task_type ?? "") as DispatchTaskType;
          if (!workerId || !["SURVEY", "DRONE", "CONTROL"].includes(taskType)) continue;
          const list = capabilityMap.get(workerId) ?? [];
          list.push({
            taskType,
            skillLevel: safeNumber(row.skill_level),
            canWorkSolo: safeNumber(row.can_work_solo) === 1,
            isPrimarySkill: safeNumber(row.is_primary_skill) === 1,
          });
          capabilityMap.set(workerId, list);
        }

        const serviceAreaMap = new Map<string, ServiceArea[]>();
        for (const row of serviceAreasData) {
          const workerId = String(row.worker_id ?? "");
          if (!workerId) continue;
          const list = serviceAreaMap.get(workerId) ?? [];
          list.push({
            sidoCode: normalizeCode(row.sido_code),
            sigunguCode: normalizeCode(row.sigungu_code),
            sigunguName: String(row.sigungu_name ?? ""),
            assignmentPriority: safeNumber(row.assignment_priority),
            supportType: String(row.support_type ?? "PRIMARY") as ServiceArea["supportType"],
            maxTravelKm: safeNumber(row.max_travel_km),
          });
          serviceAreaMap.set(workerId, list);
        }

        const availabilityMap = new Map(
          availabilityData.map((row: any) => [String(row.worker_id ?? ""), row]),
        );
        const currentStatusMap = new Map(
          currentStatusData.map((row: any) => [String(row.worker_id ?? ""), row]),
        );

        setGeojson(gridData);
        setSigunguBoundary(boundaryData);
        setRegionCapacities(
          capacityData.map((row: any) => ({
            sigungu_code: normalizeCode(row.sigungu_code),
            sido_name: String(row.sido_name ?? ""),
            sigungu_name: String(row.sigungu_name ?? ""),
            registered_worker_count: safeNumber(row.registered_worker_count),
            available_worker_count: safeNumber(row.available_worker_count),
            survey_available_count: safeNumber(row.survey_available_count),
            drone_available_count: safeNumber(row.drone_available_count),
            control_available_count: safeNumber(row.control_available_count),
            remaining_minutes: safeNumber(row.remaining_minutes),
            open_task_count: safeNumber(row.open_task_count),
            shortage_worker_count: safeNumber(row.shortage_worker_count),
            support_required: safeNumber(row.support_required),
          })),
        );
        setWorkerMaster(
          workersData.map((row: any) => {
            const workerId = String(row.worker_id ?? "");
            const availability = availabilityMap.get(workerId) ?? {};
            const currentStatus = currentStatusMap.get(workerId) ?? {};
            return {
              worker_id: workerId,
              worker_name: String(row.worker_name ?? ""),
              home_sido_code: normalizeCode(row.home_sido_code),
              home_sido_name: String(row.home_sido_name ?? ""),
              home_sigungu_code: normalizeCode(row.home_sigungu_code),
              home_sigungu_name: String(row.home_sigungu_name ?? ""),
              base_lat: safeNumber(row.base_lat),
              base_lon: safeNumber(row.base_lon),
              experience_years: safeNumber(row.experience_years),
              capabilities: capabilityMap.get(workerId) ?? [],
              serviceAreas: serviceAreaMap.get(workerId) ?? [],
              availability_status: String(availability.availability_status ?? "UNAVAILABLE"),
              remaining_minutes: safeNumber(availability.remaining_minutes),
              status: String(currentStatus.status ?? "UNAVAILABLE"),
              battery_percent:
                currentStatus.battery_level == null
                  ? null
                  : safeNumber(currentStatus.battery_level),
            };
          }),
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("대시보드 데이터 로드 오류:", error);
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        if (message.includes("격자")) setGeojsonError(message);
        else if (message.includes("경계")) setBoundaryError(message);
        else setWorkerMasterError(message);
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
      infectionHistoryLayerRef.current = null;
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
      getGridStyle(feature?.properties ?? {}, baseMapMode, mapDisplayMode),
    );
    infectionHistoryLayerRef.current?.setStyle(
      getInfectionHistoryStyle(baseMapMode),
    );
    gridLayerRef.current?.bringToFront();
    infectionHistoryLayerRef.current?.bringToFront();
    sigunguLayerRef.current?.bringToFront();
  }, [baseMapMode, mapDisplayMode]);

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

    if (!selectedAdminSummary) {
      map.fitBounds(KOREA_BOUNDS, { padding: [20, 20], animate: false, maxZoom: 7 });
      return;
    }

    if (!selectedDisplayFeatures.length) {
      const adminCollection = {
        type: "FeatureCollection",
        features: selectedAdminFeatures,
      } as any;
      const adminLayer = L.geoJSON(adminCollection);
      const adminBounds = adminLayer.getBounds();
      if (adminBounds.isValid()) {
        map.fitBounds(adminBounds, {
          padding: [28, 28],
          animate: false,
          maxZoom: selectedEmdCode ? 13 : 11,
        });
      }
      return;
    }

    const selectedCollection = {
      type: "FeatureCollection",
      features: selectedDisplayFeatures,
    } as any;
    const layer = L.geoJSON(selectedCollection, {
      renderer: GRID_RENDERER,
      style: (feature) =>
        getGridStyle(feature?.properties ?? {}, baseMapMode, mapDisplayMode),
      onEachFeature: (feature, featureLayer) => {
        const path = featureLayer as L.Path;
        const props = feature?.properties ?? {};
        path.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          setSelected({ ...props, __lat: event.latlng.lat, __lon: event.latlng.lng });
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
            .setContent(
              createGridPopupHtml(
                props,
                infectionHistoryIndexRef.current.get(
                  normalizeCode(props.grid_id ?? props.id),
                ) ?? null,
              ),
            )
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
            createAdminPopupHtml(currentSummary, selectedRegionCapacityRef.current),
          )
          .openOn(map);
      }, 80);
    }
    return () => {
      layer.removeFrom(map);
      if (gridLayerRef.current === layer) gridLayerRef.current = null;
    };
  }, [selectedDisplayFeatures, selectedAdminFeatures, selectedAdminSummary, selectedEmdCode]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    infectionHistoryLayerRef.current?.removeFrom(map);
    infectionHistoryLayerRef.current = null;

    if (
      !showInfectionHistory ||
      !selectedSigunguCode ||
      !visibleInfectionHistoryFeatures.length
    ) {
      return;
    }

    const infectionCollection = {
      type: "FeatureCollection",
      features: visibleInfectionHistoryFeatures,
    } as any;

    const layer = L.geoJSON(infectionCollection, {
      renderer: GRID_RENDERER,
      style: getInfectionHistoryStyle(baseMapMode),
      onEachFeature: (feature, featureLayer) => {
        const props = feature?.properties ?? {};
        const path = featureLayer as L.Path;

        path.bindTooltip(
          `2016~2021년 감염 발생 이력 · 누적 ${formatNumber(
            props.infection_count_2016_2021,
            0,
          )}건`,
          { sticky: true, direction: "top" },
        );

        path.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event);
          popupRef.current?.remove();
          popupRef.current = L.popup({
            maxWidth: 300,
            minWidth: 230,
            closeButton: true,
            autoPan: true,
            offset: L.point(12, -8),
            className: "pine-infection-history-popup",
          })
            .setLatLng(event.latlng)
            .setContent(`
              <div style="min-width:220px;font-family:Pretendard,Arial,sans-serif;color:#0f172a">
                <div style="font-size:15px;font-weight:800;color:${INFECTION_HISTORY_COLOR};margin-bottom:9px">2016~2021년 감염 발생 이력</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                  <tr><td style="padding:5px 0;color:#64748b">격자 ID</td><td style="text-align:right;font-weight:700">${escapeHtml(props.id ?? props.grid_id ?? "-")}</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b">누적 발생 건수</td><td style="text-align:right;font-weight:800;color:${INFECTION_HISTORY_COLOR}">${formatNumber(props.infection_count_2016_2021, 0)}건</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b">최초 발생 이력</td><td style="text-align:right;font-weight:700">${formatNumber(props.infection_first_year, 0)}년</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b">최근 발생 이력</td><td style="text-align:right;font-weight:700">${formatNumber(props.infection_last_year, 0)}년</td></tr>
                </table>
                <div style="margin-top:9px;padding:8px;border-radius:8px;background:#f5f3ff;color:#5b21b6;font-size:11px;line-height:1.5">학습 기준기간인 2016~2021년 감염 발생 이력 격자입니다.</div>
              </div>
            `)
            .openOn(map);
        });
      },
    }).addTo(map);

    infectionHistoryLayerRef.current = layer;
    layer.bringToFront();

    return () => {
      layer.removeFrom(map);
      if (infectionHistoryLayerRef.current === layer) {
        infectionHistoryLayerRef.current = null;
      }
    };
  }, [
    visibleInfectionHistoryFeatures,
    showInfectionHistory,
    selectedSigunguCode,
    baseMapMode,
  ]);

  function handleAssignRecommendedWorker(
    recommendation: Recommendation,
  ) {
    if (!selected) {
      setAssignmentMessage("먼저 지도에서 배정할 격자를 선택하세요.");
      return;
    }
    const { worker, assignmentType, distanceKm, skillLevel } = recommendation;
    const gridId = String(selected.grid_id ?? selected.id ?? "");
    if (!gridId) {
      setAssignmentMessage("선택한 격자의 ID를 확인할 수 없습니다.");
      return;
    }
    const duplicated = dispatchAssignments.some(
      (assignment) =>
        assignment.workerId === worker.worker_id &&
        assignment.gridId === gridId &&
        assignment.status !== "복귀 완료",
    );
    if (duplicated) {
      setAssignmentMessage("이미 해당 격자에 배정된 요원입니다.");
      return;
    }

    const taskLabel =
      selectedTaskType === "SURVEY"
        ? "현장요원"
        : selectedTaskType === "DRONE"
          ? "드론요원"
          : "방제요원";
    const travelTimeHour = distanceKm === null ? null : distanceKm / 35;
    const recommendationReason = `${assignmentType} · ${selectedTaskLabel} ${skillLevel}단계 · 잔여 ${formatNumber(worker.remaining_minutes, 0)}분`;

    const assignment: DispatchAssignment = {
      assignmentId: `DISPATCH-${Date.now()}-${worker.worker_id}`,
      workerId: worker.worker_id,
      workerName: worker.worker_name,
      workerType: taskLabel,
      taskType: selectedTaskType,
      workerCapabilities: worker.capabilities.map((item) => ({
        taskType: item.taskType,
        skillLevel: item.skillLevel,
      })),
      assignedSkillLevel: skillLevel,
      homeSidoName: worker.home_sido_name,
      homeSigunguCode: worker.home_sigungu_code,
      homeSigunguName: worker.home_sigungu_name,
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
      distanceKm,
      travelTimeHour,
      batteryPercent: worker.battery_percent,
      remainingMinutesAtAssignment: worker.remaining_minutes,
      recommendationReason,
      assignmentType,
      status: "배정 대기",
      assignedAt: new Date().toISOString(),
    };
    onAssignWorker(assignment);
    setAssignmentMessage(
      `${worker.worker_name} 요원을 GRID-${gridId} ${selectedTaskLabel} 업무에 배정했습니다.`,
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



  const regionName = selectedAdminSummary
    ? [
        selectedAdminSummary.sidoName,
        selectedAdminSummary.sigunguName,
        selectedAdminSummary.emdName,
      ]
        .filter(Boolean)
        .join(" ")
    : "전국";

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
    const sourceFeatures = selectedAdminFeatures.length
      ? selectedAdminFeatures
      : features;
    const riskCandidateFeatures = sourceFeatures.filter((feature) =>
      isTop10Candidate(feature?.properties ?? {}, "risk"),
    );

    const buildRiskRow = (
      grade: "매우 높음" | "높음" | "주의",
      status: string,
      tone: "danger" | "warning" | "success",
    ) => {
      const gradeFeatures = riskCandidateFeatures.filter(
        (feature) => normalizeRiskGrade(feature?.properties ?? {}) === grade,
      );
      const topPriorityCount = gradeFeatures.filter(
        (feature) =>
          normalizePriorityGrade(feature?.properties ?? {}) === "최우선 예찰",
      ).length;

      return {
        label: `위험도 ${grade}`,
        candidate: gradeFeatures.length,
        priority: topPriorityCount,
        status,
        tone,
      };
    };

    return [
      buildRiskRow("매우 높음", "즉시 검토", "danger"),
      buildRiskRow("높음", "우선 확인", "warning"),
      buildRiskRow("주의", "집중 관찰", "success"),
    ];
  }, [selectedAdminFeatures, features]);

  const selectedGridId = selected
    ? String(selected.grid_id ?? selected.id ?? "-")
    : "";

  const mapLegendItems =
    mapDisplayMode === "priority"
      ? [
          { color: priorityColors["최우선 예찰"], label: "최우선 예찰" },
          { color: priorityColors["우선 예찰"], label: "우선 예찰" },
          { color: priorityColors["집중 관찰"], label: "집중 관찰" },
          { color: priorityColors["정기 관찰"], label: "정기 관찰" },
        ]
      : [
          { color: riskColors["매우 높음"], label: "매우 높음" },
          { color: riskColors["높음"], label: "높음" },
          { color: riskColors["주의"], label: "주의" },
          { color: riskColors["관찰"], label: "관찰" },
        ];

  return (
    <div className="h-full min-h-0">
      <div
        className="grid h-full min-h-0 gap-4"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gridTemplateRows: "auto minmax(0, 1fr)",
        }}
      >
        <div className="col-span-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
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

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMapDisplayMode("priority")}
                className={
                  mapDisplayMode === "priority"
                    ? "rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-emerald-700 shadow-sm"
                    : "rounded-lg px-3 py-2 text-xs font-bold text-slate-500"
                }
              >
                예찰 우선순위
              </button>
              <button
                type="button"
                onClick={() => setMapDisplayMode("risk")}
                className={
                  mapDisplayMode === "risk"
                    ? "rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-rose-700 shadow-sm"
                    : "rounded-lg px-3 py-2 text-xs font-bold text-slate-500"
                }
              >
                AI 위험도
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowInfectionHistory((value) => !value)}
              disabled={infectionHistoryLoading || Boolean(infectionHistoryError)}
              className={
                showInfectionHistory
                  ? "rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-extrabold text-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                  : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              }
              title={
                infectionHistoryLoading
                  ? "감염 발생 이력 데이터를 불러오는 중입니다."
                  : infectionHistoryError ||
                    "2016~2021년 감염 발생 이력 레이어를 켜거나 끕니다."
              }
            >
              {infectionHistoryLoading
                ? "감염 이력 로딩 중"
                : showInfectionHistory
                  ? `감염 발생 이력 ON (${formatNumber(visibleInfectionHistoryFeatures.length, 0)}개)`
                  : "감염 발생 이력 OFF"}
            </button>

            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setBaseMapMode("base")}
                className={
                  baseMapMode === "base"
                    ? "rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-slate-900 shadow-sm"
                    : "rounded-lg px-3 py-2 text-xs font-bold text-slate-500"
                }
              >
                일반지도
              </button>
              <button
                type="button"
                onClick={() => setBaseMapMode("satellite")}
                className={
                  baseMapMode === "satellite"
                    ? "rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-slate-900 shadow-sm"
                    : "rounded-lg px-3 py-2 text-xs font-bold text-slate-500"
                }
              >
                위성지도
              </button>
            </div>
          </div>
        </div>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          {[
            geojsonError,
            boundaryError,
            infectionHistoryError,
            workforceError,
            workerMasterError,
          ]
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

            {showInfectionHistory && selectedSigunguCode && !infectionHistoryError && (
              <div className="absolute bottom-3 right-3 z-[1000] rounded-lg border border-violet-200 bg-white/95 px-3 py-2 text-xs font-extrabold text-violet-800 shadow">
                감염 발생 이력 {formatNumber(visibleInfectionHistoryFeatures.length, 0)}개 표시
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
            <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-600">
              {mapLegendItems.map((item) => (
                <Legend
                  key={item.label}
                  color={item.color}
                  label={item.label}
                />
              ))}
              {showInfectionHistory && !infectionHistoryError && (
                <FilledSquareLegend
                  color={INFECTION_HISTORY_COLOR}
                  label="2016~2021년 감염 발생 이력"
                />
              )}
            </div>

            <div className="text-[11px] font-semibold text-slate-400">
              {mapDisplayMode === "priority"
                ? "상위 10% 우선 예찰 검토지역 표시"
                : "상위 10% AI 신규 확산위험 후보 표시"}
              {showInfectionHistory && !infectionHistoryError
                ? " · 보라색 사각형은 2016~2021년 감염 발생 이력"
                : ""}
            </div>
          </div>
        </section>

        <aside
          className="grid min-h-0 min-w-0 gap-3"
          style={{
            gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
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
                    <th className="px-3 py-2.5 text-right">최우선 예찰</th>
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


        </aside>

        <aside className="min-h-0 min-w-0">
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900">
                👥 지역 인력풀 및 출동 배정
              </h3>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                복수 역량
              </span>
            </div>

            {!selectedSigunguCode ? (
              <div className="flex flex-1 items-center justify-center px-4 text-center text-xs font-semibold text-slate-400">
                시군구를 선택하면 지역별 등록요원과 업무별 가용인원을 표시합니다.
              </div>
            ) : !selected ? (
              <div className="mt-3 grid flex-1 grid-cols-2 gap-2 overflow-y-auto">
                <WorkforceMetric
                  label="등록요원"
                  value={selectedRegionCapacity?.registered_worker_count ?? 0}
                />
                <WorkforceMetric
                  label="현재 가용"
                  value={selectedRegionCapacity?.available_worker_count ?? 0}
                />
                <WorkforceMetric
                  label="예찰 가능"
                  value={selectedRegionCapacity?.survey_available_count ?? 0}
                />
                <WorkforceMetric
                  label="드론 가능"
                  value={selectedRegionCapacity?.drone_available_count ?? 0}
                />
                <WorkforceMetric
                  label="방제 가능"
                  value={selectedRegionCapacity?.control_available_count ?? 0}
                />
                <WorkforceMetric
                  label="추가 필요"
                  value={selectedRegionCapacity?.shortage_worker_count ?? 0}
                  danger={(selectedRegionCapacity?.shortage_worker_count ?? 0) > 0}
                />
                <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-semibold leading-5 text-slate-500">
                  지도에서 격자를 클릭하면 예찰·드론·방제 업무별 추천요원을 확인하고 출동 배정할 수 있습니다.
                </div>
              </div>
            ) : (
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-700">
                    GRID-{selectedGridId}
                  </div>
                  <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                    {([
                      ["SURVEY", "예찰"],
                      ["DRONE", "드론"],
                      ["CONTROL", "방제"],
                    ] as const).map(([taskType, label]) => (
                      <button
                        key={taskType}
                        type="button"
                        onClick={() => setSelectedTaskType(taskType)}
                        className={
                          selectedTaskType === taskType
                            ? "rounded-md bg-white px-2.5 py-1.5 text-[10px] font-extrabold text-emerald-700 shadow-sm"
                            : "rounded-md px-2.5 py-1.5 text-[10px] font-bold text-slate-500"
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {assignmentMessage && (
                  <div className="shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
                    {assignmentMessage}
                  </div>
                )}

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {recommendedWorkers.length ? (
                    recommendedWorkers.map((item) => {
                      const capabilityText = item.worker.capabilities
                        .map((capability) =>
                          `${capability.taskType === "SURVEY" ? "예찰" : capability.taskType === "DRONE" ? "드론" : "방제"} ${capability.skillLevel}`,
                        )
                        .join(" · ");
                      return (
                        <div
                          key={item.worker.worker_id}
                          className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-extrabold text-slate-800">
                                {item.worker.worker_name}
                                <span className="ml-1 text-[9px] font-bold text-slate-400">
                                  {item.worker.worker_id}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-[9px] font-semibold text-slate-500">
                                {capabilityText}
                              </div>
                              <div className="mt-1 text-[9px] font-semibold text-emerald-700">
                                {item.assignmentType} · 잔여 {formatNumber(item.worker.remaining_minutes, 0)}분
                                {item.distanceKm !== null
                                  ? ` · 약 ${formatNumber(item.distanceKm, 1)}km`
                                  : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAssignRecommendedWorker(item)}
                              className="shrink-0 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[10px] font-extrabold text-white hover:bg-emerald-800"
                            >
                              배정
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-xl bg-amber-50 px-3 py-3 text-center text-[10px] font-semibold text-amber-700">
                      선택 업무에 배정 가능한 요원이 없습니다. 인접지역 또는 광역 지원 인력을 확인하세요.
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function WorkforceMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[9px] font-bold text-slate-400">{label}</div>
      <div
        className={`mt-1 text-lg font-black ${danger ? "text-rose-600" : "text-slate-800"}`}
      >
        {formatNumber(value, 0)}명
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

function FilledSquareLegend({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded-[2px] border"
        style={{
          borderColor: color,
          backgroundColor: color,
          opacity: 0.72,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
