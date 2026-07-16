import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  DispatchAssignment,
  DispatchWorkerType,
} from "../types/dispatch";


type BaseMapMode = "base" | "satellite";

type TileStatus =
  | "loading"
  | "success"
  | "error"
  | "fallback";


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
  worker_type:
    | "현장요원"
    | "드론요원"
    | "방제요원";

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


const VWORLD_KEY = String(
  import.meta.env.VITE_VWORLD_API_KEY ?? ""
).trim();

const HAS_VWORLD_KEY =
  VWORLD_KEY.length > 0;


const VWORLD_BASE_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/` +
  `${VWORLD_KEY}/Base/{z}/{y}/{x}.png`;

const VWORLD_SATELLITE_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/` +
  `${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`;

const VWORLD_HYBRID_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/` +
  `${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`;


const OSM_BASE_URL =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/" +
  "World_Imagery/MapServer/tile/{z}/{y}/{x}";


const GEOJSON_PATH =
  "/data/final_ui_candidate_v4.geojson";

const SIGUNGU_BOUNDARY_PATH =
  "/data/sigungu_boundary.geojson";

const WORKFORCE_SUMMARY_PATH =
  "/data/workforce/admin_workforce_ui_summary.json";


const WORKER_MASTER_PATH =
  "/data/workforce/worker_master.json";


const KOREA_BOUNDS = L.latLngBounds(
  L.latLng(32.5, 124.0),
  L.latLng(39.8, 132.2)
);


const priorityColors: Record<
  string,
  string
> = {
  "최우선 예찰": "#ff2b57",
  "우선 예찰": "#ff9f0a",
  "집중 관찰": "#ffcc00",
  "정기 관찰": "#1fc16b",
  "일반 관리": "#d9d9d9",
};


function formatNumber(
  value: unknown,
  digit = 1
) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "-";
  }

  return numberValue.toLocaleString(
    "ko-KR",
    {
      maximumFractionDigits: digit,
    }
  );
}


function safeNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : 0;
}


function normalizeCode(value: unknown) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const text = String(value).trim();

  if (!text || text === "nan") {
    return "";
  }

  return text.endsWith(".0")
    ? text.slice(0, -2)
    : text;
}


function normalizeRiskGrade(
  props: any
) {
  const label =
    props?.risk_stage_label;

  switch (label) {
    case "고위험 1순위 후보":
      return "매우 높음";

    case "고위험 2순위 후보":
      return "높음";

    case "고위험 3순위 후보":
      return "주의";

    case "고위험 4순위 후보":
      return "관찰";

    default:
      return (
        props?.risk_grade ??
        "낮음"
      );
  }
}


function normalizePriorityGrade(
  props: any
) {
  const validGrades = new Set([
    "최우선 예찰",
    "우선 예찰",
    "집중 관찰",
    "정기 관찰",
    "일반 관리",
  ]);

  const fieldGrade =
    props?.field_priority_grade_v3;

  if (validGrades.has(fieldGrade)) {
    return fieldGrade;
  }

  const priorityGrade =
    props?.priority_grade_v3;

  if (
    validGrades.has(priorityGrade)
  ) {
    return priorityGrade;
  }

  const label =
    props?.priority_stage_label;

  switch (label) {
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


function getPriorityColor(
  grade: string
) {
  return (
    priorityColors[grade] ??
    "#cccccc"
  );
}


function featureMatchesAdmin(
  props: any,
  selectedSigunguCode: string,
  selectedEmdCode: string
) {
  if (selectedEmdCode) {
    return (
      normalizeCode(
        props?.emd_code
      ) === selectedEmdCode
    );
  }

  if (selectedSigunguCode) {
    return (
      normalizeCode(
        props?.sigungu_code
      ) === selectedSigunguCode
    );
  }

  return true;
}


function getGridStyle(
  props: any,
  baseMapMode: BaseMapMode,
  isInsideSelectedAdmin: boolean,
  hasAdminSelection: boolean
): L.PathOptions {
  const grade =
    normalizePriorityGrade(props);

  const color =
    getPriorityColor(grade);

  const isGeneral =
    grade === "일반 관리";

  if (
    hasAdminSelection &&
    !isInsideSelectedAdmin
  ) {
    return {
      color: "transparent",
      weight: 0,
      fillColor: "#CBD5E1",
      fillOpacity: 0.01,
      interactive: false,
    };
  }

  const activeFillOpacity =
    baseMapMode === "satellite"
      ? 0.42
      : 0.72;

  const lowFillOpacity =
    baseMapMode === "satellite"
      ? 0.02
      : 0.05;

  return {
    color: isGeneral
      ? "transparent"
      : color,

    weight: isGeneral
      ? 0
      : baseMapMode === "satellite"
        ? 0.75
        : 0.6,

    fillColor: color,

    fillOpacity: isGeneral
      ? lowFillOpacity
      : activeFillOpacity,
  };
}


function buildSummary(
  features: any[],
  type: "sigungu" | "emd"
): AdminSummary | null {
  if (!features.length) {
    return null;
  }

  const first =
    features[0]?.properties ?? {};

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
    const props =
      feature?.properties ?? {};

    const riskGrade =
      normalizeRiskGrade(props);

    const priorityGrade =
      normalizePriorityGrade(props);

    const riskScore =
      safeNumber(
        props.risk_score
      );

    totalRisk += riskScore;

    maxRisk = Math.max(
      maxRisk,
      riskScore
    );

    totalPriority += safeNumber(
      props.field_priority_score_v3
    );

    totalPineArea += safeNumber(
      props.pine_area
    );

    const pressureValue =
      props.recent_pressure_score ??
      props.infection_pressure;

    if (
      pressureValue !== null &&
      pressureValue !== undefined &&
      Number.isFinite(
        Number(pressureValue)
      )
    ) {
      totalPressure += Number(
        pressureValue
      );

      pressureCount += 1;
    }

    const accessValue =
      props.access_score_v3;

    if (
      accessValue !== null &&
      accessValue !== undefined &&
      Number.isFinite(
        Number(accessValue)
      )
    ) {
      totalAccess += Number(
        accessValue
      );

      accessCount += 1;
    }

    if (
      riskGrade === "매우 높음"
    ) {
      veryHighGridCount += 1;
    }

    if (riskGrade === "높음") {
      highGridCount += 1;
    }

    if (
      priorityGrade ===
      "최우선 예찰"
    ) {
      topPriorityGridCount += 1;
    }

    if (
      priorityGrade ===
      "우선 예찰"
    ) {
      priorityGridCount += 1;
    }
  }

  return {
    adminType: type,

    sidoCode: normalizeCode(
      first.sido_code
    ),

    sidoName: String(
      first.sido_name ?? ""
    ),

    sigunguCode: normalizeCode(
      first.sigungu_code
    ),

    sigunguName: String(
      first.sigungu_name ?? ""
    ),

    emdCode:
      type === "emd"
        ? normalizeCode(
            first.emd_code
          )
        : undefined,

    emdName:
      type === "emd"
        ? String(
            first.emd_name ?? ""
          )
        : undefined,

    totalGridCount:
      features.length,

    veryHighGridCount,
    highGridCount,

    topPriorityGridCount,
    priorityGridCount,

    avgRiskScore:
      features.length > 0
        ? totalRisk /
          features.length
        : 0,

    maxRiskScore:
      maxRisk,

    totalPriorityScore:
      totalPriority,

    totalPineArea,

    avgInfectionPressure:
      pressureCount > 0
        ? totalPressure /
          pressureCount
        : 0,

    avgAccessScore:
      accessCount > 0
        ? totalAccess /
          accessCount
        : 0,
  };
}


function getHighRiskCount(
  summary: AdminSummary
) {
  return (
    summary.veryHighGridCount +
    summary.highGridCount
  );
}


function getPriorityTargetCount(
  summary: AdminSummary
) {
  return (
    summary.topPriorityGridCount +
    summary.priorityGridCount
  );
}


function buildActionItems(
  summary: AdminSummary
) {
  const actions: string[] = [];

  const priorityCount =
    getPriorityTargetCount(
      summary
    );

  const priorityRate =
    summary.totalGridCount > 0
      ? priorityCount /
        summary.totalGridCount
      : 0;

  actions.push(
    `최우선·우선 예찰 격자 ${formatNumber(
      priorityCount,
      0
    )}개를 1차 현장점검 대상으로 검토합니다.`
  );

  if (
    summary.avgInfectionPressure >=
    60
  ) {
    actions.push(
      "기존 발생지 인접 구간과 감염압력이 높은 격자를 먼저 방문합니다."
    );
  } else {
    actions.push(
      "고위험 후보격자부터 순차적으로 현장 확인합니다."
    );
  }

  if (
    summary.avgAccessScore < 50
  ) {
    actions.push(
      "접근 취약구간은 드론 예찰과 추가 이동시간을 함께 반영합니다."
    );
  } else {
    actions.push(
      "접근성이 양호한 구간은 인접 격자를 묶어 연속 예찰합니다."
    );
  }

  if (priorityRate >= 0.3) {
    actions.push(
      "예찰 대상이 집중된 읍면동에 가용 인력을 우선 배치합니다."
    );
  }

  return actions;
}


function buildWorkforceActionItems(
  workforce: WorkforceSummary
) {
  const actions: string[] = [];

  if (
    workforce.field_shortage_count >
    0
  ) {
    actions.push(
      `현장요원 ${formatNumber(
        workforce.field_shortage_count,
        0
      )}명이 부족하므로 인접 시군구 지원 또는 추가 인력 편성이 필요합니다.`
    );
  } else if (
    workforce.required_field_workers >
    0
  ) {
    actions.push(
      "현재 가용 현장요원으로 설정된 운영기간의 예찰 업무를 수행할 수 있습니다."
    );
  } else {
    actions.push(
      "현재 즉시 배치가 필요한 최우선·우선 예찰 격자가 없습니다."
    );
  }

  if (
    workforce.drone_shortage_count >
    0
  ) {
    actions.push(
      `접근 취약지역 대응을 위해 드론요원 ${formatNumber(
        workforce.drone_shortage_count,
        0
      )}명의 추가 지원이 필요합니다.`
    );
  } else if (
    workforce.required_drone_workers >
    0
  ) {
    actions.push(
      "현재 가용 드론요원을 접근 취약 우선예찰 격자에 먼저 배치합니다."
    );
  }

  if (
    workforce.unassigned_grid_count >
    0
  ) {
    actions.push(
      `현재 인력으로 처리하지 못하는 ${formatNumber(
        workforce.unassigned_grid_count,
        0
      )}개 격자는 권역 간 지원 또는 2차 예찰 일정으로 편성합니다.`
    );
  } else if (
    workforce.target_grid_count > 0
  ) {
    actions.push(
      "현재 예찰 대상 격자가 모두 담당 요원에게 배정되었습니다."
    );
  }

  if (
    workforce.required_control_standby >
    0
  ) {
    actions.push(
      `현장 확인 이후 대응을 위해 방제요원 ${formatNumber(
        workforce.required_control_standby,
        0
      )}명을 대기 인력으로 확보하는 것이 권장됩니다.`
    );
  }

  return actions;
}


function getShortageText(
  gap: number
) {
  if (gap < 0) {
    return `부족 ${formatNumber(
      Math.abs(gap),
      0
    )}명`;
  }

  if (gap > 0) {
    return `여유 ${formatNumber(
      gap,
      0
    )}명`;
  }

  return "적정";
}


function getShortageClass(
  gap: number
) {
  if (gap < 0) {
    return "text-rose-600";
  }

  if (gap > 0) {
    return "text-emerald-600";
  }

  return "text-slate-600";
}


interface DashboardRiskMapCardProps {
  dispatchAssignments: DispatchAssignment[];

  onAssignWorker: (
    assignment: DispatchAssignment
  ) => void;

  onGridSelect?: (
    grid: any
  ) => void;
}


export default function DashboardRiskMapCard({
  dispatchAssignments,
  onAssignWorker,
  onGridSelect,
}: DashboardRiskMapCardProps) {
  const mapRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const leafletMapRef =
    useRef<L.Map | null>(null);

  const geoJsonLayerRef =
    useRef<L.GeoJSON | null>(null);

  const sigunguLayerRef =
    useRef<L.GeoJSON | null>(null);

  const vworldBaseLayerRef =
    useRef<L.TileLayer | null>(
      null
    );

  const vworldSatelliteLayerRef =
    useRef<L.TileLayer | null>(
      null
    );

  const vworldHybridLayerRef =
    useRef<L.TileLayer | null>(
      null
    );

  const hasFittedBoundsRef =
    useRef(false);

  const tileErrorCountRef =
    useRef(0);


  const [geojson, setGeojson] =
    useState<any>(null);

  const [
    sigunguBoundary,
    setSigunguBoundary,
  ] = useState<any>(null);

  const [
    workforceSummaries,
    setWorkforceSummaries,
  ] = useState<
    WorkforceSummary[]
  >([]);


  const [
    geojsonError,
    setGeojsonError,
  ] = useState("");

  const [
    boundaryError,
    setBoundaryError,
  ] = useState("");

  const [
    workforceError,
    setWorkforceError,
  ] = useState("");


  const [
    workerMaster,
    setWorkerMaster,
  ] = useState<WorkerMasterRow[]>([]);

  const [
    workerMasterError,
    setWorkerMasterError,
  ] = useState("");

  const [
    recommendationTab,
    setRecommendationTab,
  ] = useState<DispatchWorkerType>("현장요원");

  const [
    assignmentMessage,
    setAssignmentMessage,
  ] = useState("");


  const [
    baseMapMode,
    setBaseMapMode,
  ] = useState<BaseMapMode>(
    "base"
  );

  const [
    selectedSigunguCode,
    setSelectedSigunguCode,
  ] = useState("");

  const [
    selectedEmdCode,
    setSelectedEmdCode,
  ] = useState("");

  const [
    selected,
    setSelected,
  ] = useState<any>(null);

  const [
    aiAdvice,
    setAiAdvice,
  ] = useState("");

  const [
    tileStatus,
    setTileStatus,
  ] = useState<TileStatus>(
    HAS_VWORLD_KEY
      ? "loading"
      : "fallback"
  );

  const [
    tileErrorMessage,
    setTileErrorMessage,
  ] = useState(
    HAS_VWORLD_KEY
      ? ""
      : "VWorld API 키가 없어 대체 배경지도를 표시합니다."
  );


  const features = useMemo(
    () =>
      Array.isArray(
        geojson?.features
      )
        ? geojson.features
        : [],
    [geojson]
  );


  const workforceSummaryMap =
    useMemo(() => {
      const summaryMap = new Map<
        string,
        WorkforceSummary
      >();

      for (
        const row of
        workforceSummaries
      ) {
        const code =
          normalizeCode(
            row.sigungu_code
          );

        if (code) {
          summaryMap.set(
            code,
            row
          );
        }
      }

      return summaryMap;
    }, [workforceSummaries]);


  const selectedWorkforceSummary =
    useMemo(() => {
      if (!selectedSigunguCode) {
        return null;
      }

      return (
        workforceSummaryMap.get(
          selectedSigunguCode
        ) ?? null
      );
    }, [
      workforceSummaryMap,
      selectedSigunguCode,
    ]);

  const sigunguOptions =
    useMemo(() => {
      const optionMap = new Map<
        string,
        {
          code: string;
          sidoName: string;
          sigunguName: string;
        }
      >();

      for (
        const feature of features
      ) {
        const props =
          feature?.properties ??
          {};

        const code =
          normalizeCode(
            props.sigungu_code
          );

        if (
          !code ||
          optionMap.has(code)
        ) {
          continue;
        }

        optionMap.set(code, {
          code,

          sidoName: String(
            props.sido_name ?? ""
          ),

          sigunguName: String(
            props.sigungu_name ?? ""
          ),
        });
      }

      return Array.from(
        optionMap.values()
      ).sort((a, b) =>
        `${a.sidoName} ${a.sigunguName}`.localeCompare(
          `${b.sidoName} ${b.sigunguName}`,
          "ko"
        )
      );
    }, [features]);


  const emdOptions = useMemo(
    () => {
      if (!selectedSigunguCode) {
        return [];
      }

      const optionMap = new Map<
        string,
        {
          code: string;
          name: string;
        }
      >();

      for (
        const feature of features
      ) {
        const props =
          feature?.properties ??
          {};

        if (
          normalizeCode(
            props.sigungu_code
          ) !==
          selectedSigunguCode
        ) {
          continue;
        }

        const code =
          normalizeCode(
            props.emd_code
          );

        if (
          !code ||
          optionMap.has(code)
        ) {
          continue;
        }

        optionMap.set(code, {
          code,

          name: String(
            props.emd_name ?? ""
          ),
        });
      }

      return Array.from(
        optionMap.values()
      ).sort((a, b) =>
        a.name.localeCompare(
          b.name,
          "ko"
        )
      );
    },
    [
      features,
      selectedSigunguCode,
    ]
  );


  const selectedAdminFeatures =
    useMemo(() => {
      if (selectedEmdCode) {
        return features.filter(
          (feature: any) =>
            normalizeCode(
              feature
                ?.properties
                ?.emd_code
            ) === selectedEmdCode
        );
      }

      if (selectedSigunguCode) {
        return features.filter(
          (feature: any) =>
            normalizeCode(
              feature
                ?.properties
                ?.sigungu_code
            ) ===
            selectedSigunguCode
        );
      }

      return [];
    }, [
      features,
      selectedSigunguCode,
      selectedEmdCode,
    ]);


  const selectedAdminSummary =
    useMemo(() => {
      if (selectedEmdCode) {
        return buildSummary(
          selectedAdminFeatures,
          "emd"
        );
      }

      if (
        selectedSigunguCode
      ) {
        return buildSummary(
          selectedAdminFeatures,
          "sigungu"
        );
      }

      return null;
    }, [
      selectedAdminFeatures,
      selectedSigunguCode,
      selectedEmdCode,
    ]);
  const recommendedWorkers = useMemo(() => {
    if (!selectedSigunguCode) {
      return [];
    }

    const alreadyAssignedIds = new Set(
      dispatchAssignments.map(
        (item) => item.workerId
      )
    );

    return workerMaster
      .filter(
        (worker) =>
          worker.worker_type === recommendationTab &&
          worker.status === "대기" &&
          !alreadyAssignedIds.has(worker.worker_id)
      )
      .map((worker) => {
        let recommendationScore = 0;

        let assignmentType:
          | "지역 내 배정"
          | "동일 시도 지원"
          | "권역 지원";

        if (
          worker.home_sigungu_code ===
          selectedSigunguCode
        ) {
          recommendationScore += 100;
          assignmentType = "지역 내 배정";
        } else if (
          worker.sido_name ===
          selectedAdminSummary?.sidoName
        ) {
          recommendationScore += 60;
          assignmentType = "동일 시도 지원";
        } else {
          recommendationScore += 20;
          assignmentType = "권역 지원";
        }

        const battery =
          worker.battery_percent ?? 0;

        recommendationScore +=
          battery * 0.2;

        const distance =
          worker.travel_distance_km ?? 999;

        recommendationScore -=
          Math.min(distance, 100) * 0.3;

        if (
          recommendationTab === "드론요원" &&
          selectedAdminSummary &&
          selectedAdminSummary.avgAccessScore < 50
        ) {
          recommendationScore += 20;
        }

        return {
          worker,
          assignmentType,
          recommendationScore,
        };
      })
      .sort(
        (a, b) =>
          b.recommendationScore -
          a.recommendationScore
      )
      .slice(0, 8);
  }, [
    workerMaster,
    dispatchAssignments,
    recommendationTab,
    selectedSigunguCode,
    selectedAdminSummary,
  ]);


  const hasAdminSelection =
    Boolean(
      selectedSigunguCode ||
        selectedEmdCode
    );


  useEffect(() => {
    if (!HAS_VWORLD_KEY) {
      console.warn(
        "VITE_VWORLD_API_KEY가 없습니다. 프로젝트 루트 .env 파일을 확인하세요."
      );
    }
  }, []);


  useEffect(() => {
    const controller =
      new AbortController();

    async function loadGridGeoJson() {
      try {
        setGeojsonError("");

        const response =
          await fetch(
            GEOJSON_PATH,
            {
              cache: "no-cache",
              signal:
                controller.signal,
            }
          );

        if (!response.ok) {
          throw new Error(
            `GeoJSON load failed: ${response.status}`
          );
        }

        const data =
          await response.json();

        if (
          !Array.isArray(
            data?.features
          )
        ) {
          throw new Error(
            "격자 GeoJSON 형식이 올바르지 않습니다."
          );
        }

        setGeojson(data);
      } catch (error) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "GeoJSON load error:",
          error
        );

        setGeojsonError(
          "500m 격자 데이터를 불러오지 못했습니다. " +
            `public${GEOJSON_PATH} 파일을 확인하세요.`
        );
      }
    }

    loadGridGeoJson();

    return () =>
      controller.abort();
  }, []);


  useEffect(() => {
    const controller =
      new AbortController();

    async function loadSigunguBoundary() {
      try {
        setBoundaryError("");

        const response =
          await fetch(
            SIGUNGU_BOUNDARY_PATH,
            {
              cache: "no-cache",
              signal:
                controller.signal,
            }
          );

        if (!response.ok) {
          throw new Error(
            `시군구 경계 로드 실패: ${response.status}`
          );
        }

        const data =
          await response.json();

        if (
          !Array.isArray(
            data?.features
          )
        ) {
          throw new Error(
            "시군구 경계 GeoJSON 형식이 올바르지 않습니다."
          );
        }

        setSigunguBoundary(data);
      } catch (error) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "시군구 경계 불러오기 오류:",
          error
        );

        setBoundaryError(
          "지도 클릭용 시군구 경계를 불러오지 못했습니다. " +
            "public/data/sigungu_boundary.geojson 파일을 확인하세요."
        );
      }
    }

    loadSigunguBoundary();

    return () =>
      controller.abort();
  }, []);


  useEffect(() => {
    const controller =
      new AbortController();

    async function loadWorkforceSummary() {
      try {
        setWorkforceError("");

        const response =
          await fetch(
            WORKFORCE_SUMMARY_PATH,
            {
              cache: "no-cache",
              signal:
                controller.signal,
            }
          );

        if (!response.ok) {
          throw new Error(
            `인력 요약 로드 실패: ${response.status}`
          );
        }

        const data =
          await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "인력 요약 JSON 형식이 올바르지 않습니다."
          );
        }

        setWorkforceSummaries(
          data.map(
            (
              row: any
            ): WorkforceSummary => ({
              sigungu_code:
                normalizeCode(
                  row.sigungu_code
                ),

              sido_name:
                String(
                  row.sido_name ??
                    ""
                ),

              sigungu_name:
                String(
                  row.sigungu_name ??
                    ""
                ),

              all_grid_count:
                safeNumber(
                  row.all_grid_count
                ),

              target_grid_count:
                safeNumber(
                  row.target_grid_count
                ),

              very_high_count:
                safeNumber(
                  row.very_high_count
                ),

              high_count:
                safeNumber(
                  row.high_count
                ),

              top_priority_count:
                safeNumber(
                  row.top_priority_count
                ),

              priority_count:
                safeNumber(
                  row.priority_count
                ),

              low_access_target_count:
                safeNumber(
                  row.low_access_target_count
                ),

              environment_caution_count:
                safeNumber(
                  row.environment_caution_count
                ),

              avg_risk_score:
                safeNumber(
                  row.avg_risk_score
                ),

              avg_infection_pressure:
                safeNumber(
                  row.avg_infection_pressure
                ),

              avg_access_score:
                safeNumber(
                  row.avg_access_score
                ),

              estimated_minutes:
                safeNumber(
                  row.estimated_minutes
                ),

              required_person_days:
                safeNumber(
                  row.required_person_days
                ),

              required_field_workers:
                safeNumber(
                  row.required_field_workers
                ),

              available_field_workers:
                safeNumber(
                  row.available_field_workers
                ),

              field_worker_gap:
                safeNumber(
                  row.field_worker_gap
                ),

              field_shortage_count:
                safeNumber(
                  row.field_shortage_count
                ),

              required_drone_workers:
                safeNumber(
                  row.required_drone_workers
                ),

              available_drone_workers:
                safeNumber(
                  row.available_drone_workers
                ),

              drone_worker_gap:
                safeNumber(
                  row.drone_worker_gap
                ),

              drone_shortage_count:
                safeNumber(
                  row.drone_shortage_count
                ),

              required_control_standby:
                safeNumber(
                  row.required_control_standby
                ),

              available_control_workers:
                safeNumber(
                  row.available_control_workers
                ),

              control_worker_gap:
                safeNumber(
                  row.control_worker_gap
                ),

              control_shortage_count:
                safeNumber(
                  row.control_shortage_count
                ),

              assigned_grid_count:
                safeNumber(
                  row.assigned_grid_count
                ),

              assigned_worker_count:
                safeNumber(
                  row.assigned_worker_count
                ),

              assigned_minutes:
                safeNumber(
                  row.assigned_minutes
                ),

              unassigned_grid_count:
                safeNumber(
                  row.unassigned_grid_count
                ),

              unassigned_minutes:
                safeNumber(
                  row.unassigned_minutes
                ),

              assignment_rate:
                safeNumber(
                  row.assignment_rate
                ),
            })
          )
        );
      } catch (error) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "인력 운영 요약 불러오기 오류:",
          error
        );

        setWorkforceError(
          "인력 운영 요약을 불러오지 못했습니다. " +
            "public/data/workforce/admin_workforce_ui_summary.json 파일을 확인하세요."
        );
      }
    }

    loadWorkforceSummary();

    return () =>
      controller.abort();
  }, []);


  useEffect(() => {
    const controller = new AbortController();

    async function loadWorkerMaster() {
      try {
        setWorkerMasterError("");

        const response = await fetch(
          WORKER_MASTER_PATH,
          {
            cache: "no-cache",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `요원 데이터 로드 실패: ${response.status}`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error(
            "요원 JSON 형식이 올바르지 않습니다."
          );
        }

        setWorkerMaster(
          data.map(
            (row: any): WorkerMasterRow => ({
              worker_id: String(row.worker_id ?? ""),
              worker_name: String(row.worker_name ?? ""),
              worker_type: String(
                row.worker_type ?? "현장요원"
              ) as WorkerMasterRow["worker_type"],
              home_sigungu_code: normalizeCode(
                row.home_sigungu_code
              ),
              sido_name: String(row.sido_name ?? ""),
              sigungu_name: String(
                row.sigungu_name ?? ""
              ),
              status: String(row.status ?? ""),
              availability_status: String(
                row.availability_status ?? ""
              ),
              travel_distance_km:
                row.travel_distance_km === null ||
                row.travel_distance_km === undefined
                  ? null
                  : safeNumber(row.travel_distance_km),
              travel_time_hour:
                row.travel_time_hour === null ||
                row.travel_time_hour === undefined
                  ? null
                  : safeNumber(row.travel_time_hour),
              battery_percent:
                row.battery_percent === null ||
                row.battery_percent === undefined
                  ? null
                  : safeNumber(row.battery_percent),
              battery_context: String(
                row.battery_context ?? ""
              ),
            })
          )
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "요원 마스터 로드 오류:",
          error
        );

        setWorkerMasterError(
          "추천 요원 데이터를 불러오지 못했습니다."
        );
      }
    }

    loadWorkerMaster();

    return () => controller.abort();
  }, []);


  useEffect(() => {
    if (
      !mapRef.current ||
      leafletMapRef.current
    ) {
      return;
    }

    const map = L.map(
      mapRef.current,
      {
        center: [
          36.35,
          127.7,
        ],

        zoom: 7,
        minZoom: 6,
        maxZoom: 19,

        maxBounds:
          KOREA_BOUNDS,

        maxBoundsViscosity:
          0.9,

        zoomControl: true,

        preferCanvas: true,

        attributionControl:
          true,
      }
    );


    const baseUrl =
      HAS_VWORLD_KEY
        ? VWORLD_BASE_URL
        : OSM_BASE_URL;

    const satelliteUrl =
      HAS_VWORLD_KEY
        ? VWORLD_SATELLITE_URL
        : ESRI_SATELLITE_URL;


    const baseLayer =
      L.tileLayer(
        baseUrl,
        {
          attribution:
            HAS_VWORLD_KEY
              ? "© VWorld"
              : "© OpenStreetMap contributors",

          minZoom: 6,
          maxZoom: 19,

          bounds:
            KOREA_BOUNDS,

          noWrap: true,

          updateWhenIdle:
            true,

          keepBuffer: 2,

          crossOrigin: true,
        }
      );


    const satelliteLayer =
      L.tileLayer(
        satelliteUrl,
        {
          attribution:
            HAS_VWORLD_KEY
              ? "© VWorld"
              : "Tiles © Esri",

          minZoom: 6,
          maxZoom: 19,

          bounds:
            KOREA_BOUNDS,

          noWrap: true,

          updateWhenIdle:
            true,

          keepBuffer: 2,

          crossOrigin: true,
        }
      );


    const hybridLayer =
      L.tileLayer(
        VWORLD_HYBRID_URL,
        {
          attribution:
            "© VWorld",

          minZoom: 6,
          maxZoom: 19,

          bounds:
            KOREA_BOUNDS,

          noWrap: true,

          updateWhenIdle:
            true,

          keepBuffer: 2,

          crossOrigin: true,

          opacity:
            HAS_VWORLD_KEY
              ? 1
              : 0,
        }
      );


    function handleTileLoad() {
      if (!HAS_VWORLD_KEY) {
        return;
      }

      setTileStatus(
        "success"
      );

      setTileErrorMessage(
        ""
      );
    }


    function handleTileError(
      event: any
    ) {
      if (!HAS_VWORLD_KEY) {
        return;
      }

      tileErrorCountRef.current +=
        1;

      console.error(
        "VWorld tile load error:",
        event
      );

      if (
        tileErrorCountRef.current >=
        3
      ) {
        setTileStatus(
          "error"
        );

        setTileErrorMessage(
          "VWorld 배경지도를 불러오지 못했습니다. API 키와 허용 도메인을 확인하세요."
        );
      }
    }


    baseLayer.on(
      "tileload",
      handleTileLoad
    );

    baseLayer.on(
      "tileerror",
      handleTileError
    );

    satelliteLayer.on(
      "tileload",
      handleTileLoad
    );

    satelliteLayer.on(
      "tileerror",
      handleTileError
    );

    hybridLayer.on(
      "tileload",
      handleTileLoad
    );

    hybridLayer.on(
      "tileerror",
      handleTileError
    );


    baseLayer.addTo(map);


    vworldBaseLayerRef.current =
      baseLayer;

    vworldSatelliteLayerRef.current =
      satelliteLayer;

    vworldHybridLayerRef.current =
      hybridLayer;

    leafletMapRef.current =
      map;


    window.setTimeout(() => {
      map.invalidateSize();
    }, 300);


    return () => {
      baseLayer.off();
      satelliteLayer.off();
      hybridLayer.off();

      map.remove();

      leafletMapRef.current =
        null;

      vworldBaseLayerRef.current =
        null;

      vworldSatelliteLayerRef.current =
        null;

      vworldHybridLayerRef.current =
        null;

      geoJsonLayerRef.current =
        null;

      sigunguLayerRef.current =
        null;
    };
  }, []);


  useEffect(() => {
    const map =
      leafletMapRef.current;

    const baseLayer =
      vworldBaseLayerRef.current;

    const satelliteLayer =
      vworldSatelliteLayerRef.current;

    const hybridLayer =
      vworldHybridLayerRef.current;

    if (
      !map ||
      !baseLayer ||
      !satelliteLayer ||
      !hybridLayer
    ) {
      return;
    }

    tileErrorCountRef.current =
      0;

    if (HAS_VWORLD_KEY) {
      setTileStatus(
        "loading"
      );
    }

    if (
      baseMapMode === "base"
    ) {
      if (
        map.hasLayer(
          satelliteLayer
        )
      ) {
        map.removeLayer(
          satelliteLayer
        );
      }

      if (
        map.hasLayer(
          hybridLayer
        )
      ) {
        map.removeLayer(
          hybridLayer
        );
      }

      if (
        !map.hasLayer(
          baseLayer
        )
      ) {
        baseLayer.addTo(
          map
        );
      }
    } else {
      if (
        map.hasLayer(
          baseLayer
        )
      ) {
        map.removeLayer(
          baseLayer
        );
      }

      if (
        !map.hasLayer(
          satelliteLayer
        )
      ) {
        satelliteLayer.addTo(
          map
        );
      }

      if (
        HAS_VWORLD_KEY &&
        !map.hasLayer(
          hybridLayer
        )
      ) {
        hybridLayer.addTo(
          map
        );
      }
    }

    geoJsonLayerRef.current
      ?.bringToFront();

    sigunguLayerRef.current
      ?.bringToFront();

    window.setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [baseMapMode]);


  useEffect(() => {
    const map =
      leafletMapRef.current;

    if (
      !map ||
      !geojson
    ) {
      return;
    }

    if (
      geoJsonLayerRef.current
    ) {
      geoJsonLayerRef.current.removeFrom(
        map
      );

      geoJsonLayerRef.current =
        null;
    }


    const canvasRenderer =
      L.canvas({
        padding: 0.3,
      });


    const layer = L.geoJSON(
      geojson,
      {
        renderer:
          canvasRenderer,

        style: (
          feature: any
        ) => {
          const props =
            feature?.properties ??
            {};

          const isInsideSelectedAdmin =
            featureMatchesAdmin(
              props,
              selectedSigunguCode,
              selectedEmdCode
            );

          return getGridStyle(
            props,
            baseMapMode,
            isInsideSelectedAdmin,
            hasAdminSelection
          );
        },

        onEachFeature: (
          feature: any,
          featureLayer: L.Layer
        ) => {
          const interactiveLayer =
            featureLayer as L.Path;

          const props =
            feature?.properties ??
            {};

          const isInsideSelectedAdmin =
            featureMatchesAdmin(
              props,
              selectedSigunguCode,
              selectedEmdCode
            );

          if (
            !hasAdminSelection ||
            !isInsideSelectedAdmin
          ) {
            return;
          }

          interactiveLayer.on({
            click: () => {
              setSelected(
                props
              );

              onGridSelect?.(
                props
              );

              setAiAdvice(
                props.field_recommended_action_v3 ??
                  "선택한 격자의 위험도·예찰 우선순위와 관련 백서 근거는 챗봇에서 통합 분석할 수 있습니다."
              );
            },

            mouseover: () => {
              interactiveLayer.setStyle(
                {
                  weight: 2,

                  fillOpacity:
                    baseMapMode ===
                    "satellite"
                      ? 0.58
                      : 0.88,
                }
              );
            },

            mouseout: () => {
              geoJsonLayerRef.current
                ?.resetStyle(
                  interactiveLayer
                );
            },
          });
        },
      }
    ).addTo(map);


    geoJsonLayerRef.current =
      layer;

    layer.bringToFront();


    if (
      !hasFittedBoundsRef.current
    ) {
      const bounds =
        layer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(
          bounds,
          {
            padding: [
              20,
              20,
            ],

            animate: false,

            maxZoom: 9,
          }
        );

        hasFittedBoundsRef.current =
          true;
      }
    }


    window.setTimeout(() => {
      map.invalidateSize();
    }, 300);
  }, [
    geojson,
    baseMapMode,
    selectedSigunguCode,
    selectedEmdCode,
    hasAdminSelection,
    onGridSelect,
  ]);


  useEffect(() => {
    const map =
      leafletMapRef.current;

    if (
      !map ||
      !sigunguBoundary
    ) {
      return;
    }

    if (
      sigunguLayerRef.current
    ) {
      sigunguLayerRef.current.removeFrom(
        map
      );

      sigunguLayerRef.current =
        null;
    }

    if (
      selectedSigunguCode
    ) {
      return;
    }


    const boundaryLayer =
      L.geoJSON(
        sigunguBoundary,
        {
          style: () => ({
            color:
              "transparent",

            weight: 0,

            fillColor:
              "transparent",

            fillOpacity:
              0.001,

            interactive: true,
          }),

          onEachFeature: (
            feature: any,
            featureLayer: L.Layer
          ) => {
            const pathLayer =
              featureLayer as L.Path;

            const props =
              feature?.properties ??
              {};

            const sigunguCode =
              normalizeCode(
                props.sigungu_code
              );

            pathLayer.bindTooltip(
              `${props.sido_name ?? ""} ${
                props.sigungu_name ??
                ""
              }`,
              {
                sticky: true,
                direction: "top",
              }
            );

            pathLayer.on({
              click: () => {
                if (
                  !sigunguCode
                ) {
                  return;
                }

                setSelectedSigunguCode(
                  sigunguCode
                );

                setSelectedEmdCode(
                  ""
                );

                setSelected(
                  null
                );

                setAiAdvice(
                  ""
                );

                onGridSelect?.(
                  null
                );
              },

              mouseover: () => {
                pathLayer.setStyle(
                  {
                    weight: 2.5,

                    color:
                      "#0F766E",

                    fillOpacity:
                      0.05,
                  }
                );
              },

              mouseout: () => {
                sigunguLayerRef.current
                  ?.resetStyle(
                    pathLayer
                  );
              },
            });
          },
        }
      ).addTo(map);


    sigunguLayerRef.current =
      boundaryLayer;

    boundaryLayer.bringToFront();


    return () => {
      boundaryLayer.removeFrom(
        map
      );
    };
  }, [
    sigunguBoundary,
    selectedSigunguCode,
    onGridSelect,
  ]);


  useEffect(() => {
    const map =
      leafletMapRef.current;

    if (
      !map ||
      !geojson
    ) {
      return;
    }

    setSelected(null);
    setAiAdvice("");

    onGridSelect?.(null);


    if (!hasAdminSelection) {
      const allBounds =
        L.geoJSON(
          geojson
        ).getBounds();

      if (
        allBounds.isValid()
      ) {
        map.fitBounds(
          allBounds,
          {
            padding: [
              20,
              20,
            ],

            animate: true,

            maxZoom: 9,
          }
        );
      }

      return;
    }


    const filteredGeoJson = {
      type:
        "FeatureCollection",

      features:
        selectedAdminFeatures,
    };


    const bounds =
      L.geoJSON(
        filteredGeoJson as any
      ).getBounds();


    if (bounds.isValid()) {
      map.fitBounds(
        bounds,
        {
          padding: [
            24,
            24,
          ],

          animate: true,

          maxZoom:
            selectedEmdCode
              ? 13
              : 11,
        }
      );
    }
  }, [
    geojson,
    selectedSigunguCode,
    selectedEmdCode,
    selectedAdminFeatures,
    hasAdminSelection,
    onGridSelect,
  ]);


  const selectedRiskGrade =
    selected
      ? normalizeRiskGrade(
          selected
        )
      : "-";


  const selectedPriorityGrade =
    selected
      ? normalizePriorityGrade(
          selected
        )
      : "-";


  function handleAssignRecommendedWorker(
    worker: WorkerMasterRow,
    assignmentType:
      | "지역 내 배정"
      | "동일 시도 지원"
      | "권역 지원"
  ) {
    if (!selected) {
      setAssignmentMessage(
        "먼저 지도에서 배정할 격자를 선택하세요."
      );
      return;
    }

    const gridId = String(
      selected.grid_id ??
        selected.id ??
        ""
    );

    if (!gridId) {
      setAssignmentMessage(
        "선택한 격자의 ID를 확인할 수 없습니다."
      );
      return;
    }

    const duplicated =
      dispatchAssignments.some(
        (assignment) =>
          assignment.workerId === worker.worker_id &&
          assignment.gridId === gridId
      );

    if (duplicated) {
      setAssignmentMessage(
        "이미 해당 격자에 배정된 요원입니다."
      );
      return;
    }

    let recommendationReason =
      "현재 대기 상태이며 선택 격자의 우선예찰 업무에 투입 가능한 추천 요원입니다.";

    if (recommendationTab === "드론요원") {
      recommendationReason =
        "접근성이 낮은 격자의 사전 항공예찰을 위한 추천입니다.";
    }

    if (recommendationTab === "방제요원") {
      recommendationReason =
        "현장 확인 이후 신속한 방제 대응을 준비하기 위한 대기 배정입니다.";
    }

    const assignment: DispatchAssignment = {
      assignmentId:
        `DISPATCH-${Date.now()}-${worker.worker_id}`,
      workerId: worker.worker_id,
      workerName: worker.worker_name,
      workerType: worker.worker_type,
      homeSidoName: worker.sido_name,
      homeSigunguCode: worker.home_sigungu_code,
      homeSigunguName: worker.sigungu_name,
      targetSidoName: String(
        selected.sido_name ??
          selectedAdminSummary?.sidoName ??
          ""
      ),
      targetSigunguCode: normalizeCode(
        selected.sigungu_code ??
          selectedSigunguCode
      ),
      targetSigunguName: String(
        selected.sigungu_name ??
          selectedAdminSummary?.sigunguName ??
          ""
      ),
      targetEmdCode: normalizeCode(
        selected.emd_code ??
          selectedEmdCode
      ),
      targetEmdName: String(
        selected.emd_name ??
          selectedAdminSummary?.emdName ??
          ""
      ),
      gridId,
      priorityGrade:
        normalizePriorityGrade(selected),
      riskGrade:
        normalizeRiskGrade(selected),
      riskScore:
        safeNumber(selected.risk_score),
      accessScore:
        safeNumber(selected.access_score_v3),
      distanceKm:
        worker.travel_distance_km,
      travelTimeHour:
        worker.travel_time_hour,
      batteryPercent:
        worker.battery_percent,
      recommendationReason,
      assignmentType,
      status: "배정 대기",
      assignedAt:
        new Date().toISOString(),
    };

    onAssignWorker(assignment);

    setAssignmentMessage(
      `${worker.worker_name} ${worker.worker_type}을(를) GRID-${gridId}에 배정했습니다.`
    );
  }


  function handleSigunguChange(
    code: string
  ) {
    setSelectedSigunguCode(
      code
    );

    setSelectedEmdCode(
      ""
    );
  }


  function handleResetAdmin() {
    setSelectedSigunguCode(
      ""
    );

    setSelectedEmdCode(
      ""
    );

    setSelected(
      null
    );

    setAiAdvice(
      ""
    );

    onGridSelect?.(
      null
    );
  }


  return (
    <div className="bg-white rounded-[28px] shadow-sm border border-[#E5E7EB] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={
              selectedSigunguCode
            }
            onChange={(
              event
            ) =>
              handleSigunguChange(
                event.target.value
              )
            }
            className="min-w-[220px] rounded-xl border border-[#D8DEE8] bg-white px-4 py-3 text-sm font-semibold text-[#334155] outline-none focus:border-[#0F766E]"
          >
            <option value="">
              시군구 선택
            </option>

            {sigunguOptions.map(
              (option) => (
                <option
                  key={
                    option.code
                  }
                  value={
                    option.code
                  }
                >
                  {
                    option.sidoName
                  }{" "}
                  {
                    option.sigunguName
                  }
                </option>
              )
            )}
          </select>


          <select
            value={
              selectedEmdCode
            }
            onChange={(
              event
            ) =>
              setSelectedEmdCode(
                event.target.value
              )
            }
            disabled={
              !selectedSigunguCode
            }
            className="min-w-[200px] rounded-xl border border-[#D8DEE8] bg-white px-4 py-3 text-sm font-semibold text-[#334155] outline-none focus:border-[#0F766E] disabled:cursor-not-allowed disabled:bg-[#F1F5F9] disabled:text-[#94A3B8]"
          >
            <option value="">
              읍면동 전체
            </option>

            {emdOptions.map(
              (option) => (
                <option
                  key={
                    option.code
                  }
                  value={
                    option.code
                  }
                >
                  {option.name}
                </option>
              )
            )}
          </select>


          <button
            type="button"
            onClick={
              handleResetAdmin
            }
            className="rounded-xl border border-[#D8DEE8] bg-white px-4 py-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]"
          >
            선택 초기화
          </button>
        </div>


        <div className="flex gap-2 bg-[#F3F4F6] rounded-xl p-1">
          <button
            type="button"
            onClick={() =>
              setBaseMapMode(
                "base"
              )
            }
            className={
              baseMapMode ===
              "base"
                ? "px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#111827] shadow"
                : "px-4 py-2 rounded-lg text-sm font-semibold text-[#6B7280]"
            }
          >
            일반지도
          </button>


          <button
            type="button"
            onClick={() =>
              setBaseMapMode(
                "satellite"
              )
            }
            className={
              baseMapMode ===
              "satellite"
                ? "px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#111827] shadow"
                : "px-4 py-2 rounded-lg text-sm font-semibold text-[#6B7280]"
            }
          >
            위성지도
          </button>
        </div>
      </div>


      {tileStatus ===
        "error" && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-bold">
            VWorld 지도 연결 오류
          </div>

          <div className="mt-1">
            {
              tileErrorMessage
            }
          </div>
        </div>
      )}


      {tileStatus ===
        "fallback" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {
            tileErrorMessage
          }
        </div>
      )}


      {geojsonError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {geojsonError}
        </div>
      )}


      {boundaryError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {boundaryError}
        </div>
      )}


      {workforceError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {workforceError}
        </div>
      )}


      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7">
          <div className="relative">
            <div
              ref={mapRef}
              className="rounded-[22px] overflow-hidden border border-[#DDE5E2] bg-[#EEF7F3]"
              style={{
                height: 560,
                width: "100%",
              }}
            />


            {tileStatus ===
              "loading" && (
              <div className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-[#475569] shadow">
                VWorld 지도 불러오는 중...
              </div>
            )}


            {!hasAdminSelection && (
              <div className="absolute left-3 bottom-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-[#475569] shadow">
                지도에서 시군구를 클릭하거나 상단 목록에서 선택하세요.
              </div>
            )}
          </div>


          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Legend
              color="#ff2b57"
              label="최우선 예찰"
            />

            <Legend
              color="#ff9f0a"
              label="우선 예찰"
            />

            <Legend
              color="#ffcc00"
              label="집중 관찰"
            />

            <Legend
              color="#1fc16b"
              label="정기 관찰"
            />
          </div>


          <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  추천 요원 배정
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  선택 지역의 대기 요원을 우선 추천하고,
                  부족할 경우 동일 시도와 타 권역의 대기
                  요원을 순차적으로 추천합니다.
                </p>
              </div>

              <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                {selected
                  ? `GRID-${selected.grid_id ?? selected.id}`
                  : "격자 미선택"}
              </div>
            </div>

            <div className="mt-4 flex gap-2 rounded-xl bg-slate-100 p-1">
              {(
                [
                  "현장요원",
                  "드론요원",
                  "방제요원",
                ] as DispatchWorkerType[]
              ).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setRecommendationTab(type);
                    setAssignmentMessage("");
                  }}
                  className={
                    recommendationTab === type
                      ? "flex-1 rounded-lg bg-white px-3 py-2 text-xs font-extrabold text-emerald-950 shadow-sm"
                      : "flex-1 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
                  }
                >
                  {type}
                </button>
              ))}
            </div>

            {workerMasterError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {workerMasterError}
              </div>
            )}

            {!selectedSigunguCode ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                먼저 시군구를 선택하세요.
              </div>
            ) : !selected ? (
              <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-8 text-center text-sm text-amber-700">
                지도에서 실제 배정 대상 격자를 클릭하면
                추천 요원을 배정할 수 있습니다.
              </div>
            ) : recommendedWorkers.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                현재 조건에 맞는 대기 요원이 없습니다.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {recommendedWorkers.map(
                  ({
                    worker,
                    assignmentType,
                  }) => (
                    <div
                      key={worker.worker_id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900">
                              {worker.worker_name}
                            </span>

                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              대기
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            {worker.sido_name}{" "}
                            {worker.sigungu_name}
                          </div>
                        </div>

                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">
                          {assignmentType}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-white px-2 py-2">
                          <div className="text-slate-400">
                            이동거리
                          </div>

                          <div className="mt-0.5 font-bold text-slate-700">
                            {worker.travel_distance_km === null
                              ? "-"
                              : `${formatNumber(
                                  worker.travel_distance_km,
                                  1
                                )}km`}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white px-2 py-2">
                          <div className="text-slate-400">
                            이동시간
                          </div>

                          <div className="mt-0.5 font-bold text-slate-700">
                            {worker.travel_time_hour === null
                              ? "-"
                              : `${formatNumber(
                                  worker.travel_time_hour,
                                  1
                                )}시간`}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white px-2 py-2">
                          <div className="text-slate-400">
                            배터리
                          </div>

                          <div className="mt-0.5 font-bold text-slate-700">
                            {worker.battery_percent === null
                              ? "-"
                              : `${formatNumber(
                                  worker.battery_percent,
                                  0
                                )}%`}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleAssignRecommendedWorker(
                            worker,
                            assignmentType
                          )
                        }
                        className="mt-3 w-full rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-emerald-800"
                      >
                        선택 격자에 배정
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            {assignmentMessage && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {assignmentMessage}
              </div>
            )}
          </div>
        </div>


        <div className="xl:col-span-5">
          <div className="rounded-[22px] border border-[#E5E7EB] p-5 bg-[#FBFBFC] min-h-[560px]">
            <h3 className="text-[22px] font-bold text-[#1F2937] mb-4">
              {selected
                ? "AI 격자 위험도 상세"
                : selectedAdminSummary
                  ? selectedAdminSummary.adminType ===
                    "emd"
                    ? "AI 읍면동 분석"
                    : "AI 시군구 분석"
                  : "AI 지역 분석"}
            </h3>


            {selected ? (
              <div className="space-y-3 text-[15px]">
                <InfoRow
                  label="격자 ID"
                  value={
                    selected.grid_id ??
                    selected.id ??
                    "-"
                  }
                />


                <InfoRow
                  label="AI 위험도"
                  value={`${formatNumber(
                    selected.risk_score,
                    3
                  )}점 / ${selectedRiskGrade}`}
                />


                <InfoRow
                  label="예찰 우선순위"
                  value={`${formatNumber(
                    selected.field_priority_score_v3
                  )}점 / ${selectedPriorityGrade}`}
                />


                <InfoRow
                  label="소나무류 비율"
                  value={`${formatNumber(
                    safeNumber(
                      selected.pine_ratio
                    ) * 100
                  )}%`}
                />


                <InfoRow
                  label="최근 감염압력"
                  value={`${formatNumber(
                    selected.recent_pressure_score ??
                      selected.infection_pressure
                  )}점`}
                />


                <InfoRow
                  label="접근성"
                  value={`${formatNumber(
                    selected.access_score_v3
                  )}점`}
                />


                <InfoRow
                  label="가장 가까운 도로"
                  value={
                    selected.nearest_road_type ??
                    selected.road_class_near ??
                    "-"
                  }
                />


                <InfoRow
                  label="도로까지 거리"
                  value={`${formatNumber(
                    selected.distance_to_nearest_road_m_v3 ??
                      selected.road_dist_m
                  )}m`}
                />


                <InfoRow
                  label="환경주의"
                  value={
                    safeNumber(
                      selected.environment_caution_flag_v3 ??
                        selected.env_flag
                    ) === 1
                      ? "필요"
                      : "해당 없음"
                  }
                />


                <div className="mt-5 rounded-xl bg-[#FFF7E8] border border-[#F5D28C] p-4">
                  <div className="font-bold text-[#7C5A14] mb-2">
                    생성형 AI 권장 조치
                  </div>

                  <div className="text-[14px] leading-6 text-[#5B4A1F] whitespace-pre-line">
                    {aiAdvice ||
                      selected.field_recommended_action_v3 ||
                      "권장 조치 정보 없음"}
                  </div>
                </div>
              </div>
            ) : selectedAdminSummary ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
                  <div className="text-xs font-bold text-[#0F766E]">
                    선택 행정구역
                  </div>

                  <div className="mt-1 text-xl font-extrabold text-[#0F172A]">
                    {
                      selectedAdminSummary.sidoName
                    }{" "}
                    {
                      selectedAdminSummary.sigunguName
                    }

                    {selectedAdminSummary.emdName
                      ? ` ${selectedAdminSummary.emdName}`
                      : ""}
                  </div>
                </div>


                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard
                    label="전체 후보"
                    value={`${formatNumber(
                      selectedAdminSummary.totalGridCount,
                      0
                    )}개`}
                  />

                  <SummaryCard
                    label="고위험 후보"
                    value={`${formatNumber(
                      getHighRiskCount(
                        selectedAdminSummary
                      ),
                      0
                    )}개`}
                    emphasis="danger"
                  />

                  <SummaryCard
                    label="우선 예찰"
                    value={`${formatNumber(
                      getPriorityTargetCount(
                        selectedAdminSummary
                      ),
                      0
                    )}개`}
                    emphasis="warning"
                  />
                </div>


                <div className="grid grid-cols-2 gap-3">
                  <MiniMetric
                    label="평균 위험도"
                    value={`${formatNumber(
                      selectedAdminSummary.avgRiskScore,
                      1
                    )}점`}
                  />

                  <MiniMetric
                    label="평균 접근성"
                    value={`${formatNumber(
                      selectedAdminSummary.avgAccessScore,
                      1
                    )}점`}
                  />
                </div>


                {selectedWorkforceSummary ? (
                  <div className="rounded-2xl border border-[#C7D2FE] bg-[#F5F7FF] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-extrabold text-[#3730A3]">
                          인력 운영 현황
                        </div>

                        <div className="mt-1 text-xs text-[#6366F1]">
                          시군구 단위 5일 운영 기준
                        </div>
                      </div>

                      <div className="rounded-full border border-[#C7D2FE] bg-white px-3 py-1 text-xs font-bold text-[#4338CA]">
                        배정률{" "}
                        {formatNumber(
                          selectedWorkforceSummary.assignment_rate,
                          1
                        )}
                        %
                      </div>
                    </div>


                    <div className="mt-4 space-y-3">
                      <WorkforceRow
                        title="현장요원"
                        required={
                          selectedWorkforceSummary.required_field_workers
                        }
                        available={
                          selectedWorkforceSummary.available_field_workers
                        }
                        gap={
                          selectedWorkforceSummary.field_worker_gap
                        }
                      />

                      <WorkforceRow
                        title="드론요원"
                        required={
                          selectedWorkforceSummary.required_drone_workers
                        }
                        available={
                          selectedWorkforceSummary.available_drone_workers
                        }
                        gap={
                          selectedWorkforceSummary.drone_worker_gap
                        }
                      />

                      <WorkforceRow
                        title="방제 대기"
                        required={
                          selectedWorkforceSummary.required_control_standby
                        }
                        available={
                          selectedWorkforceSummary.available_control_workers
                        }
                        gap={
                          selectedWorkforceSummary.control_worker_gap
                        }
                      />
                    </div>


                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <WorkloadCard
                        label="예찰 대상"
                        value={
                          selectedWorkforceSummary.target_grid_count
                        }
                      />

                      <WorkloadCard
                        label="배정 완료"
                        value={
                          selectedWorkforceSummary.assigned_grid_count
                        }
                        tone="success"
                      />

                      <WorkloadCard
                        label="미배정"
                        value={
                          selectedWorkforceSummary.unassigned_grid_count
                        }
                        tone="danger"
                      />
                    </div>


                    <div className="mt-3 rounded-xl border border-[#DDD6FE] bg-white px-3 py-3 text-xs leading-5 text-[#5B21B6]">
                      현재{" "}
                      {formatNumber(
                        selectedWorkforceSummary.assigned_worker_count,
                        0
                      )}
                      명의 대기 현장요원에게{" "}
                      {formatNumber(
                        selectedWorkforceSummary.assigned_grid_count,
                        0
                      )}
                      개 격자가 배정되었습니다.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
                    선택한 시군구의 인력 운영 요약이 없습니다.
                    `admin_workforce_ui_summary.json`의
                    시군구 코드를 확인하세요.
                  </div>
                )}


                <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
                  <div className="text-sm font-extrabold text-[#1D4ED8]">
                    핵심 판단
                  </div>

                  <div className="mt-2 text-sm leading-6 text-[#1E3A8A]">
                    전체 후보격자{" "}
                    {formatNumber(
                      selectedAdminSummary.totalGridCount,
                      0
                    )}
                    개 중 고위험 후보는{" "}
                    {formatNumber(
                      getHighRiskCount(
                        selectedAdminSummary
                      ),
                      0
                    )}
                    개이며, 최우선·우선 예찰 대상은{" "}
                    {formatNumber(
                      getPriorityTargetCount(
                        selectedAdminSummary
                      ),
                      0
                    )}
                    개입니다.
                  </div>
                </div>


                <div className="rounded-2xl border border-[#F5D28C] bg-[#FFF7E8] p-4">
                  <div className="text-sm font-extrabold text-[#8A5A00]">
                    권장 조치
                  </div>

                  <ol className="mt-3 space-y-2">
                    {(
                      selectedWorkforceSummary
                        ? buildWorkforceActionItems(
                            selectedWorkforceSummary
                          )
                        : buildActionItems(
                            selectedAdminSummary
                          )
                    ).map(
                      (
                        action,
                        index
                      ) => (
                        <li
                          key={`${index}-${action}`}
                          className="flex gap-3 text-sm leading-6 text-[#5B4A1F]"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-xs font-extrabold text-white">
                            {index + 1}
                          </span>

                          <span>
                            {action}
                          </span>
                        </li>
                      )
                    )}
                  </ol>
                </div>


                <div className="rounded-xl bg-[#F8FAFC] px-4 py-3 text-xs leading-5 text-[#64748B]">
                  본 결과는 감염 확정이 아닌 신규 확산위험
                  후보지역과 우선 예찰 검토지역을 제시하는
                  의사결정 지원 정보입니다. 인력 수요는 시연용
                  업무량 환산값이며, 현장 확인 후 최종 조치를
                  결정해야 합니다.
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-[#94A3B8] leading-7 min-h-[470px]">
                지도에서 시군구를 클릭하거나
                <br />

                상단 목록에서 지역을 선택하면
                <br />

                핵심 위험 현황과 인력 운영 분석이
                <br />

                표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function Legend(props: {
  color: string;
  label: string;
}) {
  const {
    color,
    label,
  } = props;

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-3.5 h-3.5 rounded-full"
        style={{
          backgroundColor:
            color,
        }}
      />

      <span className="text-[#475569]">
        {label}
      </span>
    </div>
  );
}


function InfoRow(props: {
  label: string;
  value: any;
}) {
  const {
    label,
    value,
  } = props;

  return (
    <div className="flex justify-between gap-3 border-b border-[#EDF1F3] pb-2">
      <span className="text-[#64748B]">
        {label}
      </span>

      <span className="font-semibold text-[#111827] text-right">
        {value}
      </span>
    </div>
  );
}


function SummaryCard(props: {
  label: string;
  value: string;
  emphasis?:
    | "danger"
    | "warning";
}) {
  const {
    label,
    value,
    emphasis,
  } = props;

  const className =
    emphasis === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : emphasis ===
          "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <div
      className={`rounded-2xl border p-4 ${className}`}
    >
      <div className="text-xs font-semibold">
        {label}
      </div>

      <div className="mt-1 text-xl font-extrabold">
        {value}
      </div>
    </div>
  );
}


function MiniMetric(props: {
  label: string;
  value: string;
}) {
  const {
    label,
    value,
  } = props;

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
      <div className="text-xs font-semibold text-[#64748B]">
        {label}
      </div>

      <div className="mt-1 text-lg font-extrabold text-[#0F172A]">
        {value}
      </div>
    </div>
  );
}


function WorkforceRow(props: {
  title: string;
  required: number;
  available: number;
  gap: number;
}) {
  const {
    title,
    required,
    available,
    gap,
  } = props;

  return (
    <div className="rounded-xl border border-[#E0E7FF] bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-extrabold text-[#312E81]">
          {title}
        </div>

        <div
          className={`text-xs font-extrabold ${getShortageClass(
            gap
          )}`}
        >
          {getShortageText(
            gap
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
          <div className="text-[#64748B]">
            필요
          </div>

          <div className="mt-0.5 text-base font-extrabold text-[#0F172A]">
            {formatNumber(
              required,
              0
            )}
            명
          </div>
        </div>

        <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
          <div className="text-[#64748B]">
            즉시 가용
          </div>

          <div className="mt-0.5 text-base font-extrabold text-[#0F172A]">
            {formatNumber(
              available,
              0
            )}
            명
          </div>
        </div>
      </div>
    </div>
  );
}


function WorkloadCard(props: {
  label: string;
  value: number;
  tone?:
    | "success"
    | "danger";
}) {
  const {
    label,
    value,
    tone,
  } = props;

  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${className}`}
    >
      <div className="text-[11px] font-bold">
        {label}
      </div>

      <div className="mt-1 text-lg font-extrabold">
        {formatNumber(
          value,
          0
        )}
        개
      </div>
    </div>
  );
}