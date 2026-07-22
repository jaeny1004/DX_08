import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type ForecastMonth = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type BaseMapMode = "base" | "satellite";
type MapViewMode = "current" | "noControl" | "control" | "effect";

type SimulationGridProps = {
  grid_id?: string | number;
  id?: string | number;

  risk_score?: number;
  risk_percentile?: number;
  risk_grade?: string;
  risk_candidate_flag?: number | boolean;

  pine_ratio?: number;
  recent_pressure_score?: number;
  access_score_v3?: number;

  sigungu_code?: string | number;
  sigungu_cd?: string | number;
  sgg_cd?: string | number;
  SIG_CD?: string | number;

  sigungu_name?: string;
  sigungu_nm?: string;
  sgg_nm?: string;
  SIG_KOR_NM?: string;

  currentRisk?: number;
  futureNoControlRisk?: number;
  futureControlRisk?: number;
  noControlIncrease?: number;
  controlReduction?: number;
  effectDifference?: number;

  distanceKmFromControl?: number | null;
  controlZone?: "direct" | "buffer2" | "buffer5" | "outside";
  isSelectedSource?: boolean;
};

type SimulationFeature = GeoJSON.Feature<
  GeoJSON.Geometry,
  SimulationGridProps
>;

type SigunguProps = Record<string, unknown>;

type SigunguFeature = GeoJSON.Feature<
  GeoJSON.Geometry,
  SigunguProps
>;

type TileManifestItem = {
  file: string;
  count: number;
  bounds: [number, number, number, number];
};

type TileManifest = {
  version: number;
  crs: string;
  tileSizeDegrees: number;
  totalFeatureCount: number;
  tileCount: number;
  tiles: TileManifestItem[];
};

type TileLayerSet = {
  base: L.TileLayer;
  satellite: L.TileLayer;
  hybrid: L.TileLayer;
};

type SelectedControlArea = {
  bounds: L.LatLngBounds;
  selectedIds: string[];
};

const MANIFEST_PATH = "/data/simulation_tiles/manifest.json";

/*
 * 시군구 경계 GeoJSON을 아래 위치에 둡니다.
 * 실제 파일명이 다르면 이 상수만 수정하세요.
 */
const SIGUNGU_PATH = "/data/sigungu_boundary.geojson";

const TILE_BASE_PATH = "/data/simulation_tiles";

const MIN_MAP_ZOOM = 6;
const SIGUNGU_MAX_ZOOM = 9;
const GRID_MIN_ZOOM = 10;
const MAX_MAP_ZOOM = 15;

const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY;

const VWORLD_BASE_URL = VWORLD_KEY
  ? `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`
  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const VWORLD_SATELLITE_URL = VWORLD_KEY
  ? `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`
  : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const VWORLD_HYBRID_URL = VWORLD_KEY
  ? `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`
  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const KOREA_BOUNDS = L.latLngBounds(
  L.latLng(32.5, 124.0),
  L.latLng(39.8, 132.2)
);

const MONTH_OPTIONS: ForecastMonth[] = [0, 1, 2, 3, 4, 5, 6];

const RISK_DISTRIBUTION = [
  { score: 0.000033, percentile: 0 },
  { score: 0.001442, percentile: 1 },
  { score: 0.004373, percentile: 5 },
  { score: 0.009265, percentile: 10 },
  { score: 0.0403, percentile: 25 },
  { score: 0.247368, percentile: 50 },
  { score: 3.926575, percentile: 75 },
  { score: 37.210431, percentile: 90 },
  { score: 66.984112, percentile: 95 },
  { score: 93.481621, percentile: 99 },
  { score: 97.899562, percentile: 99.9 },
  { score: 99.159429, percentile: 100 },
] as const;

/*
 * 월별 시나리오 계수.
 * 실제 월별 학습모델의 결과가 아니라 의사결정용 상대위험 시나리오입니다.
 */
const NO_CONTROL_GROWTH: Record<ForecastMonth, number> = {
  0: 0,
  1: 0.25,
  2: 0.46,
  3: 0.66,
  4: 0.84,
  5: 1.0,
  6: 1.14,
};

const DIRECT_CONTROL_REDUCTION: Record<ForecastMonth, number> = {
  0: 0,
  1: 11,
  2: 16,
  3: 20,
  4: 23,
  5: 26,
  6: 29,
};

const BUFFER_2KM_REDUCTION: Record<ForecastMonth, number> = {
  0: 0,
  1: 6,
  2: 9,
  3: 12,
  4: 14,
  5: 16,
  6: 18,
};

const BUFFER_5KM_REDUCTION: Record<ForecastMonth, number> = {
  0: 0,
  1: 2.5,
  2: 4,
  3: 5.5,
  4: 7,
  5: 8,
  6: 9,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: unknown, digit = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";

  return n.toLocaleString("ko-KR", {
    maximumFractionDigits: digit,
  });
}

function normalizeRatio(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function getFeatureId(feature: SimulationFeature) {
  return String(
    feature.properties?.grid_id ??
      feature.properties?.id ??
      ""
  );
}

function getGridSigunguCode(props: SimulationGridProps) {
  return String(
    props.sigungu_code ??
      props.sigungu_cd ??
      props.sgg_cd ??
      props.SIG_CD ??
      ""
  );
}

function getGridSigunguName(props: SimulationGridProps) {
  return String(
    props.sigungu_name ??
      props.sigungu_nm ??
      props.sgg_nm ??
      props.SIG_KOR_NM ??
      ""
  );
}

function getSigunguCode(props: SigunguProps) {
  const aliases = [
    "sigungu_code",
    "sigungu_cd",
    "sgg_cd",
    "SIG_CD",
    "SIGUNGU_CD",
    "code",
    "CODE",
  ];

  for (const key of aliases) {
    const value = props[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return "";
}

function getSigunguName(props: SigunguProps) {
  const aliases = [
    "sigungu_name",
    "sigungu_nm",
    "sgg_nm",
    "SIG_KOR_NM",
    "SIGUNGU_NM",
    "name",
    "NAME",
  ];

  for (const key of aliases) {
    const value = props[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return "시군구";
}

function getFeatureCenter(
  feature: GeoJSON.Feature<GeoJSON.Geometry, any>
): [number, number] | null {
  const geometry: any = feature.geometry;

  let coords: [number, number][] | undefined;

  if (geometry?.type === "Polygon") {
    coords = geometry.coordinates?.[0];
  } else if (geometry?.type === "MultiPolygon") {
    coords = geometry.coordinates?.[0]?.[0];
  }

  if (!coords?.length) return null;

  let sumLng = 0;
  let sumLat = 0;

  coords.forEach(([lng, lat]) => {
    sumLng += lng;
    sumLat += lat;
  });

  return [
    sumLat / coords.length,
    sumLng / coords.length,
  ];
}

function pointInRing(
  point: [number, number],
  ring: [number, number][]
) {
  const [lng, lat] = point;
  let inside = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > lat !== yj > lat &&
      lng <
        ((xj - xi) * (lat - yi)) /
          ((yj - yi) || Number.EPSILON) +
          xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInGeometry(
  point: [number, number],
  geometry: GeoJSON.Geometry
) {
  const anyGeometry: any = geometry;

  if (geometry.type === "Polygon") {
    const rings = anyGeometry.coordinates as [number, number][][];

    if (!rings.length || !pointInRing(point, rings[0])) {
      return false;
    }

    for (let index = 1; index < rings.length; index += 1) {
      if (pointInRing(point, rings[index])) return false;
    }

    return true;
  }

  if (geometry.type === "MultiPolygon") {
    const polygons =
      anyGeometry.coordinates as [number, number][][][];

    return polygons.some((rings) => {
      if (!rings.length || !pointInRing(point, rings[0])) {
        return false;
      }

      for (let index = 1; index < rings.length; index += 1) {
        if (pointInRing(point, rings[index])) return false;
      }

      return true;
    });
  }

  return false;
}

function intersectsMapBounds(
  tile: TileManifestItem,
  mapBounds: L.LatLngBounds
) {
  const [minLng, minLat, maxLng, maxLat] = tile.bounds;

  return mapBounds.intersects(
    L.latLngBounds(
      L.latLng(minLat, minLng),
      L.latLng(maxLat, maxLng)
    )
  );
}

function makeFeatureCollection(features: SimulationFeature[]) {
  return {
    type: "FeatureCollection",
    features,
  } as GeoJSON.FeatureCollection;
}

function scoreToVisualPercentile(score: number) {
  const value = clamp(score);

  if (value <= RISK_DISTRIBUTION[0].score) return 0;

  for (
    let index = 1;
    index < RISK_DISTRIBUTION.length;
    index += 1
  ) {
    const lower = RISK_DISTRIBUTION[index - 1];
    const upper = RISK_DISTRIBUTION[index];

    if (value <= upper.score) {
      const denominator = upper.score - lower.score;
      const localT =
        denominator <= 0
          ? 0
          : (value - lower.score) / denominator;

      return (
        lower.percentile +
        (upper.percentile - lower.percentile) * localT
      );
    }
  }

  return 100;
}

function getVisualPercentile(
  props: SimulationGridProps,
  score: number,
  mode: MapViewMode
) {
  if (mode === "current") {
    const riskPercentile = Number(props.risk_percentile);

    if (Number.isFinite(riskPercentile)) {
      return clamp(100 - riskPercentile);
    }
  }

  return scoreToVisualPercentile(score);
}

function interpolateRiskColor(visualPercentile: number) {
  const t = clamp(visualPercentile) / 100;

  const stops = [
    { t: 0.0, rgb: [255, 247, 247] },
    { t: 0.5, rgb: [254, 226, 226] },
    { t: 0.75, rgb: [252, 165, 165] },
    { t: 0.9, rgb: [248, 113, 113] },
    { t: 0.95, rgb: [220, 38, 38] },
    { t: 0.99, rgb: [153, 27, 27] },
    { t: 1.0, rgb: [69, 10, 10] },
  ];

  const upperIndex = stops.findIndex((stop) => stop.t >= t);

  if (upperIndex <= 0) {
    const [r, g, b] = stops[0].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }

  if (upperIndex === -1) {
    const [r, g, b] = stops[stops.length - 1].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }

  const lower = stops[upperIndex - 1];
  const upper = stops[upperIndex];
  const localT = (t - lower.t) / (upper.t - lower.t);

  const rgb = lower.rgb.map((start, index) =>
    Math.round(
      start +
        (upper.rgb[index] - start) * localT
    )
  );

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function getEffectColor(effectDifference: number) {
  /*
   * 양수: 방제로 위험이 감소한 값.
   * 0에 가까우면 투명, 감소가 클수록 청록색.
   */
  const t = clamp(effectDifference, 0, 30) / 30;

  const start = [236, 253, 245];
  const end = [13, 148, 136];

  const rgb = start.map((value, index) =>
    Math.round(value + (end[index] - value) * t)
  );

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function getRiskOpacity(
  visualPercentile: number,
  baseMapMode: BaseMapMode
) {
  const t = clamp(visualPercentile) / 100;
  const curved = Math.pow(t, 1.22);

  const minOpacity =
    baseMapMode === "satellite" ? 0.02 : 0.035;

  const maxOpacity =
    baseMapMode === "satellite" ? 0.62 : 0.84;

  return (
    minOpacity +
    (maxOpacity - minOpacity) * curved
  );
}

function getEffectOpacity(effectDifference: number) {
  if (effectDifference <= 0.25) return 0.03;
  return 0.18 + clamp(effectDifference, 0, 30) / 30 * 0.7;
}

function getRiskLabel(score: number) {
  if (score >= 85) return "극고위험";
  if (score >= 70) return "매우 높음";
  if (score >= 55) return "높음";
  if (score >= 40) return "주의";
  if (score > 0) return "관찰";
  return "낮음";
}

function expandBoundsByKm(
  bounds: L.LatLngBounds,
  km: number
) {
  const center = bounds.getCenter();

  const latitudeDegree = km / 111.32;
  const longitudeDegree =
    km /
    Math.max(
      111.32 *
        Math.cos((center.lat * Math.PI) / 180),
      1
    );

  return L.latLngBounds(
    L.latLng(
      bounds.getSouth() - latitudeDegree,
      bounds.getWest() - longitudeDegree
    ),
    L.latLng(
      bounds.getNorth() + latitudeDegree,
      bounds.getEast() + longitudeDegree
    )
  );
}

function distanceToBoundsKm(
  point: [number, number],
  bounds: L.LatLngBounds
) {
  const [lat, lng] = point;

  const clampedLat = Math.max(
    bounds.getSouth(),
    Math.min(bounds.getNorth(), lat)
  );

  const clampedLng = Math.max(
    bounds.getWest(),
    Math.min(bounds.getEast(), lng)
  );

  if (
    lat >= bounds.getSouth() &&
    lat <= bounds.getNorth() &&
    lng >= bounds.getWest() &&
    lng <= bounds.getEast()
  ) {
    return 0;
  }

  return (
    L.latLng(lat, lng).distanceTo(
      L.latLng(clampedLat, clampedLng)
    ) / 1000
  );
}

function runSimulation(params: {
  features: SimulationFeature[];
  controlArea: SelectedControlArea | null;
  month: ForecastMonth;
}) {
  const { features, controlArea, month } = params;
  const selectedSet = new Set(
    controlArea?.selectedIds ?? []
  );

  return features.map((feature) => {
    const props = feature.properties || {};
    const featureId = getFeatureId(feature);

    const currentRisk = clamp(
      Number(props.risk_score ?? 0)
    );

    const recentPressure = clamp(
      Number(props.recent_pressure_score ?? 0)
    );

    const pineRatio = clamp(
      normalizeRatio(props.pine_ratio),
      0,
      1
    );

    const accessScore = clamp(
      Number(props.access_score_v3 ?? 50)
    );

    const center = getFeatureCenter(feature);

    const distanceKm =
      controlArea && center
        ? distanceToBoundsKm(center, controlArea.bounds)
        : null;

    const isSelectedSource = selectedSet.has(featureId);

    let controlZone:
      | "direct"
      | "buffer2"
      | "buffer5"
      | "outside" = "outside";

    if (controlArea && distanceKm !== null) {
      if (isSelectedSource || distanceKm === 0) {
        controlZone = "direct";
      } else if (distanceKm <= 2) {
        controlZone = "buffer2";
      } else if (distanceKm <= 5) {
        controlZone = "buffer5";
      }
    }

    /*
     * 선택 여부와 관계없이 해당 월의 기본 미방제 위험변화를 계산합니다.
     * 선택된 방제구역은 확산 출발점 역할이 강한 것으로 가정합니다.
     */
    const baseSpreadPotential =
      2.5 +
      recentPressure * 0.09 +
      pineRatio * 15 +
      currentRisk * 0.065;

    const localSpreadBoost =
      controlZone === "direct"
        ? 1.14
        : controlZone === "buffer2"
        ? 1.07
        : controlZone === "buffer5"
        ? 1.03
        : 1;

    const noControlIncrease = Math.min(
      baseSpreadPotential *
        NO_CONTROL_GROWTH[month] *
        localSpreadBoost,
      20
    );

    const futureNoControlRisk = clamp(
      currentRisk + noControlIncrease
    );

    let controlReduction = 0;

    if (month > 0 && controlArea) {
      if (controlZone === "direct") {
        controlReduction =
          DIRECT_CONTROL_REDUCTION[month] +
          recentPressure * 0.045 +
          (accessScore / 100) * 3.5;
      } else if (controlZone === "buffer2") {
        const distanceWeight =
          1 - Math.min(distanceKm ?? 2, 2) / 2;

        controlReduction =
          BUFFER_2KM_REDUCTION[month] *
          (0.72 + distanceWeight * 0.28) *
          (0.9 + recentPressure / 800);
      } else if (controlZone === "buffer5") {
        const bufferDistance = Math.max(
          0,
          (distanceKm ?? 5) - 2
        );

        const distanceWeight =
          1 - Math.min(bufferDistance, 3) / 3;

        controlReduction =
          BUFFER_5KM_REDUCTION[month] *
          (0.65 + distanceWeight * 0.35) *
          (0.9 + recentPressure / 1000);
      }
    }

    controlReduction = Math.min(
      controlReduction,
      30
    );

    const futureControlRisk = clamp(
      futureNoControlRisk - controlReduction
    );

    return {
      ...feature,
      properties: {
        ...props,
        currentRisk,
        futureNoControlRisk,
        futureControlRisk,
        noControlIncrease,
        controlReduction,
        effectDifference:
          futureNoControlRisk - futureControlRisk,
        distanceKmFromControl: distanceKm,
        controlZone,
        isSelectedSource,
      },
    };
  });
}

function summarizeSimulation(
  features: SimulationFeature[],
  controlArea: SelectedControlArea | null
) {
  const selectedSet = new Set(
    controlArea?.selectedIds ?? []
  );

  const selectedFeatures = features.filter((feature) =>
    selectedSet.has(getFeatureId(feature))
  );

  const targetFeatures =
    selectedFeatures.length > 0
      ? selectedFeatures
      : features;

  const total = targetFeatures.length;

  const avg = (key: keyof SimulationGridProps) =>
    targetFeatures.reduce(
      (sum, feature) =>
        sum +
        Number(feature.properties?.[key] ?? 0),
      0
    ) / Math.max(1, total);

  const avgCurrent = avg("currentRisk");
  const avgNoControl = avg("futureNoControlRisk");
  const avgControl = avg("futureControlRisk");

  const directCount = features.filter(
    (feature) =>
      feature.properties?.controlZone === "direct"
  ).length;

  const buffer2Count = features.filter(
    (feature) =>
      feature.properties?.controlZone === "buffer2"
  ).length;

  const buffer5Count = features.filter(
    (feature) =>
      feature.properties?.controlZone === "buffer5"
  ).length;

  const highNoControl = targetFeatures.filter(
    (feature) =>
      Number(
        feature.properties?.futureNoControlRisk ?? 0
      ) >= 70
  ).length;

  const highControl = targetFeatures.filter(
    (feature) =>
      Number(
        feature.properties?.futureControlRisk ?? 0
      ) >= 70
  ).length;

  const suppressedAreaKm2 =
    features.filter(
      (feature) =>
        Number(
          feature.properties?.effectDifference ?? 0
        ) >= 3
    ).length * 0.25;

  return {
    selectedCount: controlArea?.selectedIds.length ?? 0,
    selectedAreaKm2:
      (controlArea?.selectedIds.length ?? 0) * 0.25,
    avgCurrent,
    avgNoControl,
    avgControl,
    avgIncrease: avgNoControl - avgCurrent,
    avgReduction: avgNoControl - avgControl,
    resolvedHighRisk: Math.max(
      0,
      highNoControl - highControl
    ),
    directCount,
    buffer2Count,
    buffer5Count,
    suppressedAreaKm2,
  };
}

function useAnimatedNumber(
  target: number,
  duration = 500
) {
  const [display, setDisplay] = useState(target);
  const previousRef = useRef(target);

  useEffect(() => {
    const startValue = previousRef.current;
    const difference = target - startValue;
    const startTime = performance.now();

    let frameId = 0;

    const animate = (time: number) => {
      const progress = Math.min(
        1,
        (time - startTime) / duration
      );

      const eased =
        1 - Math.pow(1 - progress, 3);

      setDisplay(startValue + difference * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        previousRef.current = target;
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return display;
}

export default function SimulationSection() {
  const mapContainerRef =
    useRef<HTMLDivElement | null>(null);

  const leafletMapRef = useRef<L.Map | null>(null);

  const gridLayerRef = useRef<L.GeoJSON | null>(null);
  const sigunguLayerRef = useRef<L.GeoJSON | null>(null);

  const directAreaLayerRef =
    useRef<L.Rectangle | null>(null);

  const buffer2LayerRef =
    useRef<L.Rectangle | null>(null);

  const buffer5LayerRef =
    useRef<L.Rectangle | null>(null);

  const pulseLayerRef =
    useRef<L.Circle | null>(null);

  const selectionPreviewRef =
    useRef<L.Rectangle | null>(null);

  const tileLayersRef =
    useRef<TileLayerSet | null>(null);

  const manifestRef =
    useRef<TileManifest | null>(null);

  const tileCacheRef = useRef<
    Map<string, SimulationFeature[]>
  >(new Map());

  const sigunguFeaturesRef =
    useRef<SigunguFeature[]>([]);

  const selectedSigunguRef =
    useRef<SigunguFeature | null>(null);

  const requestSequenceRef = useRef(0);

  const selectionStartRef =
    useRef<L.LatLng | null>(null);

  const isSelectingRef = useRef(false);
  const selectionModeRef = useRef(false);

  const visibleFeaturesRef =
    useRef<SimulationFeature[]>([]);

  const [visibleFeatures, setVisibleFeatures] =
    useState<SimulationFeature[]>([]);

  const [
    selectedSigungu,
    setSelectedSigungu,
  ] = useState<SigunguFeature | null>(null);

  const [
    selectedControlArea,
    setSelectedControlArea,
  ] = useState<SelectedControlArea | null>(null);

  const [month, setMonth] =
    useState<ForecastMonth>(0);

  const [viewMode, setViewMode] =
    useState<MapViewMode>("current");

  const [baseMapMode, setBaseMapMode] =
    useState<BaseMapMode>("base");

  const [selectionMode, setSelectionMode] =
    useState(false);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [temporaryNoControl, setTemporaryNoControl] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

  const [currentZoom, setCurrentZoom] =
    useState(8);

  const [visibleTileCount, setVisibleTileCount] =
    useState(0);

  const [loadedFeatureCount, setLoadedFeatureCount] =
    useState(0);

  const selectedSigunguCode = selectedSigungu
    ? getSigunguCode(selectedSigungu.properties || {})
    : "";

  const selectedSigunguName = selectedSigungu
    ? getSigunguName(selectedSigungu.properties || {})
    : "";

  const effectiveViewMode =
    temporaryNoControl && month > 0
      ? "noControl"
      : viewMode;

  async function loadVisibleTiles() {
    const map = leafletMapRef.current;
    const manifest = manifestRef.current;
    const sigungu = selectedSigunguRef.current;

    if (!map || !manifest) return;

    const zoom = map.getZoom();
    setCurrentZoom(zoom);

    /*
     * 줌 6~9에서는 시군구 선택만 사용합니다.
     * 시군구 선택 후 줌 10부터 격자를 표시합니다.
     */
    if (zoom < GRID_MIN_ZOOM || !sigungu) {
      requestSequenceRef.current += 1;
      setVisibleFeatures([]);
      setVisibleTileCount(0);
      setLoadedFeatureCount(0);
      setLoading(false);
      return;
    }

    const requestSequence =
      requestSequenceRef.current + 1;

    requestSequenceRef.current =
      requestSequence;

    setLoading(true);
    setLoadError("");

    const sigunguBounds =
      L.geoJSON(sigungu as any).getBounds();

    const visibleTiles = manifest.tiles.filter(
      (tile) =>
        intersectsMapBounds(tile, sigunguBounds)
    );

    const visibleFiles = visibleTiles.map(
      (tile) => tile.file
    );

    setVisibleTileCount(visibleFiles.length);

    try {
      await Promise.all(
        visibleFiles.map(async (file) => {
          if (tileCacheRef.current.has(file)) {
            return;
          }

          const response = await fetch(
            `${TILE_BASE_PATH}/${file}`
          );

          if (!response.ok) {
            throw new Error(
              `${file}: ${response.status}`
            );
          }

          const data = await response.json();

          tileCacheRef.current.set(
            file,
            (data.features || []) as SimulationFeature[]
          );
        })
      );

      if (
        requestSequence !==
        requestSequenceRef.current
      ) {
        return;
      }

      const candidateFeatures =
        visibleFiles.flatMap(
          (file) =>
            tileCacheRef.current.get(file) ?? []
        );

      const sigunguCode =
        getSigunguCode(sigungu.properties || {});

      const sigunguName =
        getSigunguName(sigungu.properties || {});

      /*
       * 1차: 격자에 시군구 코드가 있으면 코드 기준 필터링.
       * 2차: 코드가 없으면 격자 중심점이 시군구 polygon 안에 있는지 확인.
       */
      const filteredFeatures =
        candidateFeatures.filter((feature) => {
          const props = feature.properties || {};
          const gridCode = getGridSigunguCode(props);
          const gridName = getGridSigunguName(props);

          if (gridCode && sigunguCode) {
            return gridCode === sigunguCode;
          }

          if (gridName && sigunguName) {
            return gridName === sigunguName;
          }

          const center = getFeatureCenter(feature);

          if (!center) return false;

          return pointInGeometry(
            [center[1], center[0]],
            sigungu.geometry
          );
        });

      setVisibleFeatures(filteredFeatures);
      setLoadedFeatureCount(
        filteredFeatures.length
      );
      setLoading(false);
    } catch (error) {
      console.error(
        "Simulation tile load error:",
        error
      );

      if (
        requestSequence !==
        requestSequenceRef.current
      ) {
        return;
      }

      setLoadError(
        "선택 시군구의 시뮬레이션 격자를 불러오지 못했습니다."
      );

      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch(MANIFEST_PATH).then((response) => {
        if (!response.ok) {
          throw new Error(
            `manifest: ${response.status}`
          );
        }

        return response.json() as Promise<TileManifest>;
      }),

      fetch(SIGUNGU_PATH).then((response) => {
        if (!response.ok) {
          throw new Error(
            `sigungu: ${response.status}`
          );
        }

        return response.json() as Promise<
          GeoJSON.FeatureCollection<
            GeoJSON.Geometry,
            SigunguProps
          >
        >;
      }),
    ])
      .then(([manifest, sigunguData]) => {
        manifestRef.current = manifest;
        sigunguFeaturesRef.current =
          (sigunguData.features ||
            []) as SigunguFeature[];

        setLoading(false);
      })
      .catch((error) => {
        console.error(
          "Simulation base data load error:",
          error
        );

        setLoadError(
          "시군구 경계 또는 시뮬레이션 타일 정보를 불러오지 못했습니다. SIGUNGU_PATH와 public/data 경로를 확인하세요."
        );

        setLoading(false);
      });
  }, []);

  useEffect(() => {
    visibleFeaturesRef.current =
      visibleFeatures;
  }, [visibleFeatures]);

  useEffect(() => {
    selectedSigunguRef.current =
      selectedSigungu;

    void loadVisibleTiles();
  }, [selectedSigungu]);

  useEffect(() => {
    selectionModeRef.current =
      selectionMode;

    const map = leafletMapRef.current;

    if (!map) return;

    if (
      selectionMode &&
      selectedSigungu &&
      map.getZoom() >= GRID_MIN_ZOOM
    ) {
      map.dragging.disable();
      map.getContainer().style.cursor =
        "crosshair";
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    }
  }, [selectionMode, selectedSigungu]);

  useEffect(() => {
    if (
      !mapContainerRef.current ||
      leafletMapRef.current
    ) {
      return;
    }

    const map = L.map(
      mapContainerRef.current,
      {
        center: [36.35, 127.7],
        zoom: 8,
        minZoom: MIN_MAP_ZOOM,
        maxZoom: MAX_MAP_ZOOM,
        maxBounds: KOREA_BOUNDS,
        maxBoundsViscosity: 0.8,
        zoomControl: true,
        preferCanvas: true,
      }
    );

    const base = L.tileLayer(
      VWORLD_BASE_URL,
      {
        attribution: VWORLD_KEY
          ? "VWorld"
          : "© OpenStreetMap contributors",
        maxZoom: 19,
        bounds: KOREA_BOUNDS,
        noWrap: true,
        updateWhenIdle: true,
        keepBuffer: 1,
      }
    );

    const satellite = L.tileLayer(
      VWORLD_SATELLITE_URL,
      {
        attribution: VWORLD_KEY
          ? "VWorld"
          : "Esri World Imagery",
        maxZoom: 19,
        bounds: KOREA_BOUNDS,
        noWrap: true,
        updateWhenIdle: true,
        keepBuffer: 1,
      }
    );

    const hybrid = L.tileLayer(
      VWORLD_HYBRID_URL,
      {
        attribution: VWORLD_KEY
          ? "VWorld"
          : "© OpenStreetMap contributors",
        maxZoom: 19,
        bounds: KOREA_BOUNDS,
        noWrap: true,
        updateWhenIdle: true,
        keepBuffer: 1,
      }
    );

    base.addTo(map);

    tileLayersRef.current = {
      base,
      satellite,
      hybrid,
    };

    leafletMapRef.current = map;

    map.on("moveend", () => {
      void loadVisibleTiles();
    });

    map.on("zoomend", () => {
      setCurrentZoom(map.getZoom());
      void loadVisibleTiles();
    });

    map.on(
      "mousedown",
      (event: L.LeafletMouseEvent) => {
        if (
          !selectionModeRef.current ||
          !selectedSigunguRef.current ||
          map.getZoom() < GRID_MIN_ZOOM
        ) {
          return;
        }

        isSelectingRef.current = true;
        selectionStartRef.current =
          event.latlng;

        selectionPreviewRef.current?.removeFrom(
          map
        );

        selectionPreviewRef.current =
          L.rectangle(
            L.latLngBounds(
              event.latlng,
              event.latlng
            ),
            {
              color: "#2563eb",
              weight: 2,
              fillColor: "#2563eb",
              fillOpacity: 0.08,
              dashArray: "7 5",
            }
          ).addTo(map);
      }
    );

    map.on(
      "mousemove",
      (event: L.LeafletMouseEvent) => {
        if (
          !selectionModeRef.current ||
          !isSelectingRef.current ||
          !selectionStartRef.current ||
          !selectionPreviewRef.current
        ) {
          return;
        }

        selectionPreviewRef.current.setBounds(
          L.latLngBounds(
            selectionStartRef.current,
            event.latlng
          )
        );
      }
    );

    map.on(
      "mouseup",
      (event: L.LeafletMouseEvent) => {
        if (
          !selectionModeRef.current ||
          !isSelectingRef.current ||
          !selectionStartRef.current
        ) {
          return;
        }

        isSelectingRef.current = false;

        const bounds = L.latLngBounds(
          selectionStartRef.current,
          event.latlng
        );

        selectionStartRef.current = null;

        const nextSelectedIds =
          visibleFeaturesRef.current
            .filter((feature) => {
              const center =
                getFeatureCenter(feature);

              if (!center) return false;

              return bounds.contains(
                L.latLng(
                  center[0],
                  center[1]
                )
              );
            })
            .map(getFeatureId);

        if (nextSelectedIds.length === 0) {
          selectionPreviewRef.current?.removeFrom(
            map
          );

          selectionPreviewRef.current = null;
          return;
        }

        setSelectedControlArea({
          bounds,
          selectedIds: nextSelectedIds,
        });

        setMonth(0);
        setViewMode("current");
        setSelectionMode(false);
      }
    );

    setTimeout(
      () => map.invalidateSize(),
      200
    );

    return () => {
      requestSequenceRef.current += 1;
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletMapRef.current;
    const tileLayers = tileLayersRef.current;

    if (!map || !tileLayers) return;

    const {
      base,
      satellite,
      hybrid,
    } = tileLayers;

    if (baseMapMode === "base") {
      if (map.hasLayer(satellite)) {
        map.removeLayer(satellite);
      }

      if (map.hasLayer(hybrid)) {
        map.removeLayer(hybrid);
      }

      if (!map.hasLayer(base)) {
        base.addTo(map);
      }
    } else {
      if (map.hasLayer(base)) {
        map.removeLayer(base);
      }

      if (!map.hasLayer(satellite)) {
        satellite.addTo(map);
      }

      if (!map.hasLayer(hybrid)) {
        hybrid.addTo(map);
      }
    }

    gridLayerRef.current?.bringToFront();
    sigunguLayerRef.current?.bringToFront();
    buffer5LayerRef.current?.bringToFront();
    buffer2LayerRef.current?.bringToFront();
    directAreaLayerRef.current?.bringToFront();
  }, [baseMapMode]);

  /*
   * 줌 6~9에서는 시군구 경계를 표시하고 클릭 가능하게 합니다.
   * 선택된 시군구가 있더라도 다시 축소하면 시군구 선택 화면으로 돌아옵니다.
   */
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    sigunguLayerRef.current?.removeFrom(map);
    sigunguLayerRef.current = null;

    if (
      currentZoom > SIGUNGU_MAX_ZOOM ||
      sigunguFeaturesRef.current.length === 0
    ) {
      return;
    }

    const layer = L.geoJSON(
      {
        type: "FeatureCollection",
        features:
          sigunguFeaturesRef.current,
      } as GeoJSON.FeatureCollection,
      {
        interactive: true,
        style: (feature: any) => {
          const featureCode = getSigunguCode(
            feature?.properties || {}
          );

          const selected =
            Boolean(selectedSigunguCode) &&
            featureCode === selectedSigunguCode;

          return {
            color: selected
              ? "#0f766e"
              : "#64748b",
            weight: selected ? 2.6 : 1,
            fillColor: selected
              ? "#14b8a6"
              : "#f8fafc",
            fillOpacity: selected ? 0.24 : 0.08,
          };
        },
        onEachFeature: (
          feature: any,
          featureLayer
        ) => {
          const name = getSigunguName(
            feature.properties || {}
          );

          featureLayer.bindTooltip(name, {
            sticky: true,
            direction: "top",
          });

          featureLayer.on("click", () => {
            const selected =
              feature as SigunguFeature;

            setSelectedSigungu(selected);
            setSelectedControlArea(null);
            setMonth(0);
            setViewMode("current");
            setIsPlaying(false);

            const bounds = (
              featureLayer as L.GeoJSON
            ).getBounds?.() ??
              L.geoJSON(feature).getBounds();

            map.fitBounds(bounds, {
              padding: [24, 24],
              maxZoom: GRID_MIN_ZOOM,
              animate: true,
            });

            setTimeout(() => {
              if (
                map.getZoom() <
                GRID_MIN_ZOOM
              ) {
                map.setZoom(
                  GRID_MIN_ZOOM
                );
              }
            }, 350);
          });
        },
      }
    ).addTo(map);

    sigunguLayerRef.current = layer;
  }, [
    currentZoom,
    selectedSigunguCode,
    selectedSigungu,
  ]);

  const simulatedFeatures = useMemo(
    () =>
      runSimulation({
        features: visibleFeatures,
        controlArea: selectedControlArea,
        month,
      }),
    [
      visibleFeatures,
      selectedControlArea,
      month,
    ]
  );

  const summary = useMemo(
    () =>
      summarizeSimulation(
        simulatedFeatures,
        selectedControlArea
      ),
    [
      simulatedFeatures,
      selectedControlArea,
    ]
  );

  useEffect(() => {
    const map = leafletMapRef.current;

    if (!map) return;

    gridLayerRef.current?.removeFrom(map);
    gridLayerRef.current = null;

    if (
      currentZoom < GRID_MIN_ZOOM ||
      !selectedSigungu ||
      simulatedFeatures.length === 0
    ) {
      return;
    }

    const layer = L.geoJSON(
      makeFeatureCollection(
        simulatedFeatures
      ),
      {
        renderer: L.canvas({
          padding: 0.35,
        }),
        interactive: true,
        style: (feature: any) => {
          const props:
            | SimulationGridProps
            | undefined =
            feature?.properties;

          const safeProps = props || {};

          const currentRisk = Number(
            safeProps.currentRisk ??
              safeProps.risk_score ??
              0
          );

          const noControlRisk = Number(
            safeProps.futureNoControlRisk ??
              currentRisk
          );

          const controlRisk = Number(
            safeProps.futureControlRisk ??
              currentRisk
          );

          const effectDifference = Number(
            safeProps.effectDifference ?? 0
          );

          let score = currentRisk;

          if (
            effectiveViewMode ===
            "noControl"
          ) {
            score = noControlRisk;
          } else if (
            effectiveViewMode === "control"
          ) {
            score = controlRisk;
          }

          const visualPercentile =
            getVisualPercentile(
              safeProps,
              score,
              effectiveViewMode
            );

          const selected = Boolean(
            safeProps.isSelectedSource
          );

          const candidate =
            safeProps.risk_candidate_flag ===
              true ||
            Number(
              safeProps.risk_candidate_flag
            ) === 1;

          if (
            effectiveViewMode === "effect"
          ) {
            return {
              color: selected
                ? "#1d4ed8"
                : "transparent",
              weight: selected ? 1.6 : 0,
              fillColor:
                getEffectColor(
                  effectDifference
                ),
              fillOpacity:
                getEffectOpacity(
                  effectDifference
                ),
            };
          }

          return {
            color: selected
              ? "#2563eb"
              : candidate
              ? "#991b1b"
              : "transparent",
            weight: selected
              ? 1.8
              : candidate
              ? 0.5
              : 0,
            fillColor:
              interpolateRiskColor(
                visualPercentile
              ),
            fillOpacity: getRiskOpacity(
              visualPercentile,
              baseMapMode
            ),
          };
        },
        onEachFeature: (
          feature: any,
          featureLayer
        ) => {
          const props:
            SimulationGridProps =
            feature.properties || {};

          const currentRisk = Number(
            props.currentRisk ??
              props.risk_score ??
              0
          );

          const noControlRisk = Number(
            props.futureNoControlRisk ??
              currentRisk
          );

          const controlRisk = Number(
            props.futureControlRisk ??
              currentRisk
          );

          const effectDifference = Number(
            props.effectDifference ?? 0
          );

          featureLayer.bindTooltip(
            `
              <div style="min-width:190px">
                <div style="font-weight:800;margin-bottom:5px">
                  격자 ${
                    props.grid_id ??
                    props.id ??
                    "-"
                  }
                </div>
                <div>현재 위험도 ${currentRisk.toFixed(
                  2
                )}점</div>
                <div>${month}개월 미방제 ${noControlRisk.toFixed(
                  2
                )}점</div>
                <div>${month}개월 방제 적용 ${controlRisk.toFixed(
                  2
                )}점</div>
                <div>방제 저감효과 ${effectDifference.toFixed(
                  2
                )}점</div>
                <div>영향구역 ${
                  props.controlZone === "direct"
                    ? "직접 방제구역"
                    : props.controlZone === "buffer2"
                    ? "2km 강한 영향권"
                    : props.controlZone === "buffer5"
                    ? "5km 간접 영향권"
                    : "영향권 밖"
                }</div>
              </div>
            `,
            {
              sticky: true,
              direction: "top",
            }
          );
        },
      }
    ).addTo(map);

    gridLayerRef.current = layer;
    layer.bringToFront();

    directAreaLayerRef.current?.bringToFront();
  }, [
    simulatedFeatures,
    effectiveViewMode,
    month,
    baseMapMode,
    currentZoom,
    selectedSigungu,
  ]);

  /*
   * 선택 방제구역과 2km·5km 영향권을 지도에 표시합니다.
   */
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    directAreaLayerRef.current?.removeFrom(map);
    buffer2LayerRef.current?.removeFrom(map);
    buffer5LayerRef.current?.removeFrom(map);
    pulseLayerRef.current?.removeFrom(map);

    directAreaLayerRef.current = null;
    buffer2LayerRef.current = null;
    buffer5LayerRef.current = null;
    pulseLayerRef.current = null;

    if (!selectedControlArea) return;

    const directBounds =
      selectedControlArea.bounds;

    const buffer2Bounds =
      expandBoundsByKm(directBounds, 2);

    const buffer5Bounds =
      expandBoundsByKm(directBounds, 5);

    buffer5LayerRef.current =
      L.rectangle(buffer5Bounds, {
        color: "#60a5fa",
        weight: 1.5,
        dashArray: "8 6",
        fillColor: "#93c5fd",
        fillOpacity: 0.055,
        interactive: false,
      }).addTo(map);

    buffer2LayerRef.current =
      L.rectangle(buffer2Bounds, {
        color: "#3b82f6",
        weight: 1.8,
        dashArray: "6 4",
        fillColor: "#60a5fa",
        fillOpacity: 0.09,
        interactive: false,
      }).addTo(map);

    directAreaLayerRef.current =
      L.rectangle(directBounds, {
        color: "#1d4ed8",
        weight: 2.6,
        fillColor: "#2563eb",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);

    const center = directBounds.getCenter();

    const pulseRadius =
      effectiveViewMode === "noControl"
        ? 1800 + month * 900
        : effectiveViewMode === "control" ||
          effectiveViewMode === "effect"
        ? 1000 + month * 400
        : 700;

    pulseLayerRef.current =
      L.circle(center, {
        radius: pulseRadius,
        color:
          effectiveViewMode === "noControl"
            ? "#dc2626"
            : "#0f766e",
        weight: 2,
        dashArray: "7 7",
        fillColor:
          effectiveViewMode === "noControl"
            ? "#ef4444"
            : "#14b8a6",
        fillOpacity: 0.035,
        opacity: 0.75,
        interactive: false,
      }).addTo(map);

    buffer5LayerRef.current.bringToFront();
    buffer2LayerRef.current.bringToFront();
    pulseLayerRef.current.bringToFront();
    directAreaLayerRef.current.bringToFront();
  }, [
    selectedControlArea,
    month,
    effectiveViewMode,
  ]);

  /*
   * 자동재생: 현재 → 1개월 → ... → 6개월.
   */
  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setMonth((previous) => {
        if (previous >= 6) {
          setIsPlaying(false);
          return 6;
        }

        const next =
          (previous + 1) as ForecastMonth;

        if (next > 0 && viewMode === "current") {
          setViewMode("noControl");
        }

        return next;
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [isPlaying, viewMode]);

  function resetControlArea() {
    setSelectedControlArea(null);
    setMonth(0);
    setViewMode("current");
    setSelectionMode(false);
    setIsPlaying(false);
    setTemporaryNoControl(false);

    const map = leafletMapRef.current;

    selectionPreviewRef.current?.removeFrom(
      map as L.Map
    );

    selectionPreviewRef.current = null;
  }

  function resetSigungu() {
    resetControlArea();
    setSelectedSigungu(null);
    setVisibleFeatures([]);
    setLoadedFeatureCount(0);
    setVisibleTileCount(0);

    const map = leafletMapRef.current;

    if (map) {
      map.setView([36.35, 127.7], 8, {
        animate: true,
      });
    }
  }

  function startPlayback() {
    if (!selectedControlArea) return;

    if (month >= 6) {
      setMonth(0);
      setViewMode("current");

      window.setTimeout(() => {
        setViewMode("noControl");
        setIsPlaying(true);
      }, 250);

      return;
    }

    if (month === 0) {
      setViewMode("noControl");
    }

    setIsPlaying(true);
  }

  const interpretation = useMemo(() => {
    if (!selectedSigungu) {
      return "줌 6~9에서 분석할 시군구를 선택하세요. 선택 후 해당 시군구의 500m 격자만 불러옵니다.";
    }

    if (!selectedControlArea) {
      return `${selectedSigunguName}의 신규 확산위험 격자를 표시하고 있습니다. 방제 검토 구역을 드래그하면 직접 방제구역과 주변 2km·5km 영향권을 비교합니다.`;
    }

    if (month === 0) {
      return `선택한 ${summary.selectedCount.toLocaleString(
        "ko-KR"
      )}개 격자의 현재 평균 상대위험은 ${summary.avgCurrent.toFixed(
        1
      )}점입니다.`;
    }

    if (effectiveViewMode === "noControl") {
      return `${month}개월 미방제 시 선택 구역의 평균 상대위험이 ${summary.avgCurrent.toFixed(
        1
      )}점에서 ${summary.avgNoControl.toFixed(
        1
      )}점으로 높아지는 시나리오입니다.`;
    }

    if (effectiveViewMode === "control") {
      return `${month}개월 방제 적용 시 직접 방제구역과 주변 2km·5km 영향권에서 평균 ${summary.avgReduction.toFixed(
        1
      )}점의 상대위험 저감효과가 나타나는 시나리오입니다.`;
    }

    if (effectiveViewMode === "effect") {
      return `청록색이 진할수록 미방제 대비 방제 적용 시 상대위험 저감효과가 큰 격자입니다. 3점 이상 저감되는 면적은 약 ${summary.suppressedAreaKm2.toFixed(
        1
      )}㎢입니다.`;
    }

    return "현재 위험분포를 표시하고 있습니다.";
  }, [
    selectedSigungu,
    selectedSigunguName,
    selectedControlArea,
    summary,
    month,
    effectiveViewMode,
  ]);

  const animatedCurrent = useAnimatedNumber(
    summary.avgCurrent
  );

  const animatedNoControl = useAnimatedNumber(
    summary.avgNoControl
  );

  const animatedControl = useAnimatedNumber(
    summary.avgControl
  );

  const animatedReduction = useAnimatedNumber(
    summary.avgReduction
  );

  return (
    <div className="bg-white rounded-[28px] shadow-sm border border-[#E5E7EB] p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[30px] font-extrabold text-[#1F2937] leading-tight">
            확산위험 방제 시뮬레이션
          </h2>

          <p className="text-[#94A3B8] mt-2 text-[15px]">
            줌 6~9에서는 시군구를 선택하고,
            선택 후 해당 시군구의 500m 격자에서
            미방제·방제 적용·방제효과를 비교합니다.
          </p>
        </div>

        <div className="flex gap-2 bg-[#F3F4F6] rounded-xl p-1">
          <button
            type="button"
            onClick={() =>
              setBaseMapMode("base")
            }
            className={
              baseMapMode === "base"
                ? "px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#111827] shadow"
                : "px-4 py-2 rounded-lg text-sm font-semibold text-[#6B7280]"
            }
          >
            일반지도
          </button>

          <button
            type="button"
            onClick={() =>
              setBaseMapMode("satellite")
            }
            className={
              baseMapMode === "satellite"
                ? "px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#111827] shadow"
                : "px-4 py-2 rounded-lg text-sm font-semibold text-[#6B7280]"
            }
          >
            위성지도
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] px-4 py-2 text-sm">
          시군구{" "}
          <b className="text-[#0F766E]">
            {selectedSigunguName || "미선택"}
          </b>
        </div>

        <button
          type="button"
          disabled={
            !selectedSigungu ||
            currentZoom < GRID_MIN_ZOOM
          }
          onClick={() =>
            setSelectionMode(
              (previous) => !previous
            )
          }
          className={
            !selectedSigungu ||
            currentZoom < GRID_MIN_ZOOM
              ? "px-4 py-2 rounded-xl text-sm font-bold bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed"
              : selectionMode
              ? "px-4 py-2 rounded-xl text-sm font-bold bg-[#2563EB] text-white shadow"
              : "px-4 py-2 rounded-xl text-sm font-bold bg-white text-[#334155] border border-[#E5E7EB]"
          }
        >
          {selectionMode
            ? "방제 구역 선택 중"
            : "방제 구역 선택"}
        </button>

        <button
          type="button"
          disabled={!selectedControlArea}
          onClick={
            isPlaying
              ? () => setIsPlaying(false)
              : startPlayback
          }
          className={
            selectedControlArea
              ? "px-4 py-2 rounded-xl text-sm font-bold bg-[#0F766E] text-white shadow"
              : "px-4 py-2 rounded-xl text-sm font-bold bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed"
          }
        >
          {isPlaying
            ? "⏸ 일시정지"
            : "▶ 시뮬레이션 재생"}
        </button>

        <button
          type="button"
          onClick={resetControlArea}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-white text-[#64748B] border border-[#E5E7EB]"
        >
          방제 선택 초기화
        </button>

        <button
          type="button"
          onClick={resetSigungu}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-white text-[#64748B] border border-[#E5E7EB]"
        >
          시군구 다시 선택
        </button>

        <div className="ml-auto flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm text-[#64748B]">
          <span>
            표시 격자{" "}
            <b className="text-[#111827]">
              {loadedFeatureCount.toLocaleString(
                "ko-KR"
              )}
            </b>
            개
          </span>

          <span>
            선택 격자{" "}
            <b className="text-[#111827]">
              {summary.selectedCount.toLocaleString(
                "ko-KR"
              )}
            </b>
            개
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-9">
          <div className="rounded-[20px] border border-[#DDE5E2] overflow-hidden relative bg-[#EEF7F3]">
            <div
              ref={mapContainerRef}
              style={{
                width: "100%",
                height: 650,
              }}
            />

            {loading && (
              <div className="absolute left-1/2 top-4 -translate-x-1/2 z-[650] rounded-full bg-white/95 border border-[#E5E7EB] px-4 py-2 text-sm font-bold text-[#475569] shadow">
                지도 데이터를 불러오는 중입니다.
              </div>
            )}

            {loadError && (
              <div className="absolute left-4 right-4 top-4 z-[700] rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">
                {loadError}
              </div>
            )}

            {currentZoom <= SIGUNGU_MAX_ZOOM && (
              <div className="absolute left-1/2 top-4 -translate-x-1/2 z-[600] rounded-full bg-white/95 border border-[#CBD5E1] px-5 py-2 text-sm font-extrabold text-[#334155] shadow">
                지도에서 분석할 시군구를 선택하세요
              </div>
            )}

            {selectedSigungu &&
              currentZoom >= GRID_MIN_ZOOM &&
              !selectedControlArea &&
              !selectionMode && (
                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-[600] rounded-full bg-white/95 border border-[#CBD5E1] px-5 py-2 text-sm font-extrabold text-[#334155] shadow">
                  방제 구역 선택 버튼을 누른 뒤
                  지도에서 범위를 드래그하세요
                </div>
              )}

            {selectionMode && (
              <div className="absolute left-1/2 top-4 -translate-x-1/2 z-[610] rounded-full bg-[#2563EB] text-white px-5 py-2 text-sm font-bold shadow-lg">
                마우스로 직접 방제할 구역을
                드래그하세요
              </div>
            )}

            {selectedControlArea &&
              month > 0 && (
                <div className="absolute top-4 right-4 z-[610] rounded-2xl bg-white/95 border border-[#E5E7EB] shadow-lg px-4 py-3 min-w-[180px]">
                  <div className="text-xs text-[#64748B]">
                    현재 재생 시점
                  </div>

                  <div className="text-2xl font-extrabold text-[#111827] mt-1">
                    {month}개월 후
                  </div>

                  <div
                    className={
                      effectiveViewMode ===
                      "noControl"
                        ? "text-sm font-bold text-[#B91C1C] mt-1"
                        : effectiveViewMode ===
                          "effect"
                        ? "text-sm font-bold text-[#0F766E] mt-1"
                        : "text-sm font-bold text-[#0F766E] mt-1"
                    }
                  >
                    {effectiveViewMode ===
                    "noControl"
                      ? "미방제 확산"
                      : effectiveViewMode ===
                        "effect"
                      ? "방제 저감효과"
                      : "방제 적용"}
                  </div>
                </div>
              )}

            <div className="absolute left-4 bottom-4 z-[600] rounded-xl bg-white/95 border border-[#E5E7EB] shadow px-4 py-3">
              {effectiveViewMode === "effect" ? (
                <>
                  <div className="text-xs font-bold text-[#334155] mb-2">
                    미방제 대비 방제 저감효과
                  </div>

                  <div
                    className="h-3 w-64 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg,#ecfdf5 0%,#99f6e4 40%,#2dd4bf 70%,#0f766e 100%)",
                    }}
                  />

                  <div className="mt-1 flex justify-between text-[11px] text-[#64748B]">
                    <span>변화 적음</span>
                    <span>3점</span>
                    <span>10점</span>
                    <span>20점+</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-[#334155] mb-2">
                    신규 확산위험 상대분포
                  </div>

                  <div
                    className="h-3 w-64 rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg,#fff7f7 0%,#fee2e2 50%,#fca5a5 75%,#f87171 90%,#dc2626 95%,#991b1b 99%,#450a0a 100%)",
                    }}
                  />

                  <div className="mt-1 flex justify-between text-[11px] text-[#64748B]">
                    <span>낮음</span>
                    <span>상위 25%</span>
                    <span>상위 10%</span>
                    <span>상위 1%</span>
                  </div>
                </>
              )}

              <div className="mt-3 space-y-1 text-[11px] text-[#64748B]">
                <div>
                  <span className="inline-block w-5 h-3 border-2 border-[#1d4ed8] bg-blue-100/40 mr-2 align-middle" />
                  직접 방제구역
                </div>

                <div>
                  <span className="inline-block w-5 h-3 border border-[#3b82f6] bg-blue-100/30 mr-2 align-middle" />
                  주변 2km 강한 영향권
                </div>

                <div>
                  <span className="inline-block w-5 h-3 border border-dashed border-[#60a5fa] bg-blue-50/20 mr-2 align-middle" />
                  주변 5km 간접 영향권
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
            <div className="grid grid-cols-4 gap-2 mb-4">
              <ModeButton
                active={
                  effectiveViewMode ===
                  "current"
                }
                label="현재 위험도"
                onClick={() =>
                  setViewMode("current")
                }
              />

              <ModeButton
                active={
                  effectiveViewMode ===
                  "noControl"
                }
                label="미방제 미래"
                onClick={() => {
                  setViewMode("noControl");

                  if (month === 0) {
                    setMonth(1);
                  }
                }}
                danger
              />

              <ModeButton
                active={
                  effectiveViewMode ===
                  "control"
                }
                label="방제 적용"
                onClick={() => {
                  setViewMode("control");

                  if (month === 0) {
                    setMonth(1);
                  }
                }}
              />

              <ModeButton
                active={
                  effectiveViewMode ===
                  "effect"
                }
                label="방제 효과"
                onClick={() => {
                  setViewMode("effect");

                  if (month === 0) {
                    setMonth(1);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-[#334155]">
                월별 시점
              </div>

              <button
                type="button"
                disabled={
                  !selectedControlArea ||
                  month === 0
                }
                onPointerDown={() => {
                  if (
                    selectedControlArea &&
                    month > 0
                  ) {
                    setTemporaryNoControl(true);
                  }
                }}
                onPointerUp={() =>
                  setTemporaryNoControl(false)
                }
                onPointerLeave={() =>
                  setTemporaryNoControl(false)
                }
                className={
                  selectedControlArea &&
                  month > 0
                    ? "px-3 py-2 rounded-lg border border-[#FCA5A5] bg-white text-[#B91C1C] text-xs font-extrabold"
                    : "px-3 py-2 rounded-lg border border-[#E5E7EB] bg-white text-[#94A3B8] text-xs font-bold cursor-not-allowed"
                }
              >
                누르고 미방제 비교
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {MONTH_OPTIONS.map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setMonth(option);

                      if (option === 0) {
                        setViewMode("current");
                      } else if (
                        viewMode === "current"
                      ) {
                        setViewMode(
                          "noControl"
                        );
                      }
                    }}
                    className={
                      month === option
                        ? "py-3 rounded-xl bg-[#0F766E] text-white text-sm font-extrabold shadow scale-[1.02] transition-transform"
                        : "py-3 rounded-xl bg-white border border-[#E5E7EB] text-[#64748B] text-sm font-bold transition-transform hover:scale-[1.02]"
                    }
                  >
                    {option === 0
                      ? "현재"
                      : `${option}개월`}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <aside className="col-span-3 space-y-4">
          <div className="rounded-[20px] border border-[#E5E7EB] bg-white p-5">
            <div className="font-extrabold text-[#1F2937] text-lg mb-4">
              시뮬레이션 조건
            </div>

            <InfoRow
              label="선택 시군구"
              value={selectedSigunguName || "-"}
            />

            <InfoRow
              label="기준 시점"
              value={
                month === 0
                  ? "현재"
                  : `${month}개월 후`
              }
            />

            <InfoRow
              label="직접 방제"
              value={`${summary.directCount.toLocaleString(
                "ko-KR"
              )}개`}
            />

            <InfoRow
              label="2km 영향권"
              value={`${summary.buffer2Count.toLocaleString(
                "ko-KR"
              )}개`}
            />

            <InfoRow
              label="5km 영향권"
              value={`${summary.buffer5Count.toLocaleString(
                "ko-KR"
              )}개`}
            />

            <InfoRow
              label="선택 면적"
              value={`${formatNumber(
                summary.selectedAreaKm2,
                2
              )}㎢`}
            />
          </div>

          <div className="rounded-[20px] border border-[#E5E7EB] bg-[#F8FAFC] p-5">
            <div className="font-extrabold text-[#1F2937] text-lg mb-4">
              위험 변화
            </div>

            <MetricCard
              label="현재 평균 위험도"
              value={`${formatNumber(
                animatedCurrent,
                1
              )}점`}
            />

            <MetricCard
              label={`${month || 1}개월 미방제`}
              value={`${formatNumber(
                animatedNoControl,
                1
              )}점`}
              emphasis="danger"
            />

            <MetricCard
              label={`${month || 1}개월 방제 적용`}
              value={`${formatNumber(
                animatedControl,
                1
              )}점`}
              emphasis="safe"
            />

            <div className="grid grid-cols-2 gap-2 mt-3">
              <SmallMetric
                label="평균 위험 증가"
                value={`${formatNumber(
                  summary.avgIncrease,
                  1
                )}점`}
              />

              <SmallMetric
                label="평균 위험 저감"
                value={`${formatNumber(
                  animatedReduction,
                  1
                )}점`}
              />

              <SmallMetric
                label="고위험 후보 해소"
                value={`${summary.resolvedHighRisk.toLocaleString(
                  "ko-KR"
                )}개`}
              />

              <SmallMetric
                label="확산 억제 면적"
                value={`${formatNumber(
                  summary.suppressedAreaKm2,
                  1
                )}㎢`}
              />
            </div>
          </div>

          <div className="rounded-[20px] border border-[#DCEAE5] bg-[#F0FDF4] p-5">
            <div className="font-extrabold text-[#14532D] text-lg mb-2">
              AI 종합 해석
            </div>

            <p className="text-sm leading-6 text-[#3F5F4D]">
              {interpretation}
            </p>
          </div>

          <div className="rounded-[20px] border border-[#E5E7EB] bg-white p-5">
            <div className="font-extrabold text-[#1F2937] text-lg mb-3">
              대응 권고
            </div>

            <ol className="space-y-2 text-sm leading-5 text-[#475569] list-decimal pl-5">
              <li>
                직접 방제구역의 고위험 후보를
                우선 현장 확인 대상으로 검토
              </li>
              <li>
                주변 2km 구역은 집중 드론
                예찰과 추가 방제 여부 검토
              </li>
              <li>
                주변 5km 구역은 신규 확산위험
                변화 모니터링
              </li>
              <li>
                방제 완료 후 1개월 단위로
                위험도를 재분석
              </li>
            </ol>
          </div>
        </aside>
      </div>

      <div className="mt-5 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
        화면의 위험점수는 실제 감염확률이 아닌
        0~100점 상대위험 점수입니다. 월별 결과는
        학습된 월별 감염예측값이 아니라 현재
        위험요인과 방제구역·주변 영향권을 반영한
        의사결정용 상대위험 변화 시나리오입니다.
      </div>
    </div>
  );
}

function ModeButton(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const activeClass = props.danger
    ? "bg-[#B91C1C] text-white border-[#B91C1C] shadow"
    : "bg-[#0F766E] text-white border-[#0F766E] shadow";

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        props.active
          ? `py-3 rounded-xl border text-sm font-extrabold ${activeClass}`
          : "py-3 rounded-xl bg-white border border-[#E5E7EB] text-[#64748B] text-sm font-bold"
      }
    >
      {props.label}
    </button>
  );
}

function InfoRow(props: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#EDF1F3] py-2">
      <span className="text-[#64748B]">
        {props.label}
      </span>

      <span className="font-bold text-[#111827] text-right">
        {props.value}
      </span>
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  emphasis?: "danger" | "safe";
}) {
  const valueClass =
    props.emphasis === "danger"
      ? "text-[#B91C1C]"
      : props.emphasis === "safe"
      ? "text-[#0F766E]"
      : "text-[#111827]";

  return (
    <div className="rounded-xl bg-white border border-[#E5E7EB] p-3 mb-2">
      <div className="text-xs text-[#64748B] mb-1">
        {props.label}
      </div>

      <div
        className={`text-xl font-extrabold ${valueClass}`}
      >
        {props.value}
      </div>
    </div>
  );
}

function SmallMetric(props: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-[#E5E7EB] p-3">
      <div className="text-[11px] text-[#64748B] mb-1">
        {props.label}
      </div>

      <div className="text-sm font-extrabold text-[#111827]">
        {props.value}
      </div>
    </div>
  );
}
