import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type ForecastMonth = 1 | 3 | 6;
type BaseMapMode = "base" | "satellite";

type SimulationGridProps = {
  grid_id?: string | number;
  id?: string | number;

  risk_score?: number;
  field_priority_score_v3?: number;

  pine_ratio?: number;
  recent_pressure_score?: number;
  access_score_v3?: number;
  nearest_road_type?: string;
  distance_to_nearest_road_m_v3?: number;
  environment_caution_flag_v3?: number | string | boolean;

  currentRisk?: number;
  futureNoControlRisk?: number;
  futureControlRisk?: number;

  noControlIncrease?: number;
  controlReduction?: number;
  riskDelta?: number;

  distanceKmFromSelection?: number | null;
  isSelectedSource?: boolean;
};

type SimulationFeature = GeoJSON.Feature<GeoJSON.Geometry, SimulationGridProps>;

type TileLayerSet = {
  base: L.TileLayer;
  satellite: L.TileLayer;
  hybrid: L.TileLayer;
};

const GEOJSON_PATH = "/data/simulation_candidate_top15_v4.geojson";

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

const monthOptions: { label: string; value: ForecastMonth }[] = [
  { label: "1개월 후", value: 1 },
  { label: "3개월 후", value: 3 },
  { label: "6개월 후", value: 6 },
];

function formatNumber(value: unknown, digit = 1) {
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digit });
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getFeatureId(feature: SimulationFeature) {
  return String(feature.properties?.grid_id ?? feature.properties?.id ?? "");
}

function getFeatureCenter(feature: SimulationFeature): [number, number] | null {
  if (!feature.geometry) return null;

  const geometry: any = feature.geometry;

  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates?.[0];
    if (!coords || coords.length === 0) return null;

    let sumLng = 0;
    let sumLat = 0;

    coords.forEach((coord: [number, number]) => {
      sumLng += coord[0];
      sumLat += coord[1];
    });

    return [sumLat / coords.length, sumLng / coords.length];
  }

  if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates?.[0]?.[0];
    if (!coords || coords.length === 0) return null;

    let sumLng = 0;
    let sumLat = 0;

    coords.forEach((coord: [number, number]) => {
      sumLng += coord[0];
      sumLat += coord[1];
    });

    return [sumLat / coords.length, sumLng / coords.length];
  }

  return null;
}

function calculateDistanceKm(a: [number, number], b: [number, number]) {
  return L.latLng(a[0], a[1]).distanceTo(L.latLng(b[0], b[1])) / 1000;
}

function filterKoreaFeatures(features: SimulationFeature[]) {
  return features.filter((feature) => {
    const center = getFeatureCenter(feature);
    if (!center) return false;
    return KOREA_BOUNDS.contains(L.latLng(center[0], center[1]));
  });
}

function makeFeatureCollection(features: SimulationFeature[]) {
  return {
    type: "FeatureCollection",
    features,
  } as GeoJSON.FeatureCollection;
}

function getRiskColor(score: number) {
  if (score >= 85) return "#d90429";
  if (score >= 70) return "#ff2b57";
  if (score >= 55) return "#ff9f0a";
  if (score >= 40) return "#ffcc00";
  if (score > 0) return "#1fc16b";
  return "#d9d9d9";
}

function runSimulation(params: {
  features: SimulationFeature[];
  selectedIds: string[];
  month: ForecastMonth;
}) {
  const { features, selectedIds, month } = params;
  const selectedSet = new Set(selectedIds);

  const selectedCenters = features
    .filter((feature) => selectedSet.has(getFeatureId(feature)))
    .map((feature) => getFeatureCenter(feature))
    .filter(Boolean) as [number, number][];

  if (!selectedCenters.length) {
    return features.map((feature) => {
      const props = feature.properties || {};
      const baseRisk = Number(props.risk_score ?? 0);

      return {
        ...feature,
        properties: {
          ...props,
          currentRisk: baseRisk,
          futureNoControlRisk: baseRisk,
          futureControlRisk: baseRisk,
          noControlIncrease: 0,
          controlReduction: 0,
          riskDelta: 0,
          distanceKmFromSelection: null,
          isSelectedSource: false,
        },
      };
    });
  }

  const noControlGrowthMap: Record<ForecastMonth, number> = {
    1: 0.38,
    3: 0.82,
    6: 1.45,
  };

  const directControlMap: Record<ForecastMonth, number> = {
    1: 34,
    3: 48,
    6: 62,
  };

  const neighborControlMap: Record<ForecastMonth, number> = {
    1: 20,
    3: 34,
    6: 48,
  };

  const noControlGrowth = noControlGrowthMap[month];
  const directControlPower = directControlMap[month];
  const neighborControlPower = neighborControlMap[month];

  return features.map((feature) => {
    const props = feature.properties || {};
    const featureId = getFeatureId(feature);
    const center = getFeatureCenter(feature);

    const baseRisk = Number(props.risk_score ?? 0);
    const recentPressure = Number(props.recent_pressure_score ?? 0);
    const pineRatio = Number(props.pine_ratio ?? 0);
    const accessScore = Number(props.access_score_v3 ?? 0);

    const isSelectedSource = selectedSet.has(featureId);

    let minDistanceKm = 999;

    if (center) {
      minDistanceKm = Math.min(
        ...selectedCenters.map((selectedCenter) =>
          calculateDistanceKm(center, selectedCenter)
        )
      );
    }

    const spreadInfluence = Math.exp(-minDistanceKm / 18);
    const controlInfluence = Math.exp(-minDistanceKm / 10);
    const selectedBoost = isSelectedSource ? 1.45 : 1.0;

    const spreadPotential =
      10 + recentPressure * 0.55 + pineRatio * 30 + baseRisk * 0.2;

    const noControlIncrease =
      spreadPotential * noControlGrowth * spreadInfluence * selectedBoost;

    const futureNoControlRisk = clamp(baseRisk + noControlIncrease, 0, 100);

    const accessBonus = accessScore > 0 ? Math.min(accessScore / 100, 1) : 0.5;

    const directReduction = isSelectedSource
      ? directControlPower + recentPressure * 0.28 + accessBonus * 12
      : 0;

    const neighborReduction =
      neighborControlPower * controlInfluence * (0.85 + recentPressure / 150);

    const totalControlReduction = directReduction + neighborReduction;

    const futureControlRisk = clamp(
      futureNoControlRisk - totalControlReduction,
      0,
      100
    );

    const riskDelta = clamp(futureNoControlRisk - futureControlRisk, 0, 100);

    return {
      ...feature,
      properties: {
        ...props,
        currentRisk: baseRisk,
        futureNoControlRisk,
        futureControlRisk,
        noControlIncrease,
        controlReduction: totalControlReduction,
        riskDelta,
        distanceKmFromSelection: center ? minDistanceKm : null,
        isSelectedSource,
      },
    };
  });
}

function summarizeSimulation(features: SimulationFeature[]) {
  const total = features.length;

  const avgCurrent =
    features.reduce(
      (sum, feature) => sum + Number(feature.properties?.currentRisk ?? 0),
      0
    ) / Math.max(1, total);

  const avgNoControl =
    features.reduce(
      (sum, feature) =>
        sum + Number(feature.properties?.futureNoControlRisk ?? 0),
      0
    ) / Math.max(1, total);

  const avgControl =
    features.reduce(
      (sum, feature) =>
        sum + Number(feature.properties?.futureControlRisk ?? 0),
      0
    ) / Math.max(1, total);

  const highCurrent = features.filter(
    (feature) => Number(feature.properties?.currentRisk ?? 0) >= 70
  ).length;

  const highNoControl = features.filter(
    (feature) => Number(feature.properties?.futureNoControlRisk ?? 0) >= 70
  ).length;

  const highControl = features.filter(
    (feature) => Number(feature.properties?.futureControlRisk ?? 0) >= 70
  ).length;

  const increasedCount = features.filter(
    (feature) => Number(feature.properties?.noControlIncrease ?? 0) > 2
  ).length;

  const reducedCount = features.filter(
    (feature) => Number(feature.properties?.riskDelta ?? 0) > 2
  ).length;

  const strongReducedCount = features.filter(
    (feature) => Number(feature.properties?.riskDelta ?? 0) >= 10
  ).length;

  const avgIncrease = avgNoControl - avgCurrent;
  const avgReduction = avgNoControl - avgControl;

  return {
    total,
    avgCurrent,
    avgNoControl,
    avgControl,
    avgIncrease,
    avgReduction,
    highCurrent,
    highNoControl,
    highControl,
    increasedCount,
    reducedCount,
    strongReducedCount,
  };
}

function getMapStyle(
  props: SimulationGridProps,
  mode: "current" | "noControl" | "control",
  baseMapMode: BaseMapMode
): L.PathOptions {
  const current = Number(props.currentRisk ?? props.risk_score ?? 0);
  const noControl = Number(props.futureNoControlRisk ?? current);
  const control = Number(props.futureControlRisk ?? current);

  const isSelectedSource = Boolean(props.isSelectedSource);
  const increase = Number(props.noControlIncrease ?? 0);
  const reduction = Number(props.riskDelta ?? 0);

  const normalOpacity = baseMapMode === "satellite" ? 0.42 : 0.64;
  const strongOpacity = baseMapMode === "satellite" ? 0.58 : 0.84;

  if (mode === "current") {
    const color = getRiskColor(current);

    return {
      color: isSelectedSource ? "#2563eb" : color,
      weight: isSelectedSource ? 1.5 : 0.35,
      fillColor: color,
      fillOpacity: normalOpacity,
    };
  }

  if (mode === "noControl") {
    const color = getRiskColor(noControl);

    return {
      color: increase > 5 ? "#b91c1c" : color,
      weight: increase > 5 ? 1.0 : 0.35,
      fillColor: color,
      fillOpacity: increase > 5 ? strongOpacity : normalOpacity,
    };
  }

  const color = getRiskColor(control);

  return {
    color: isSelectedSource ? "#2563eb" : reduction > 5 ? "#16a34a" : color,
    weight: isSelectedSource ? 1.7 : reduction > 5 ? 1.0 : 0.35,
    fillColor: color,
    fillOpacity: reduction > 5 ? strongOpacity : normalOpacity,
  };
}

export default function SimulationSection() {
  const currentMapRef = useRef<HTMLDivElement | null>(null);
  const noControlMapRef = useRef<HTMLDivElement | null>(null);
  const controlMapRef = useRef<HTMLDivElement | null>(null);

  const currentLeafletMapRef = useRef<L.Map | null>(null);
  const noControlLeafletMapRef = useRef<L.Map | null>(null);
  const controlLeafletMapRef = useRef<L.Map | null>(null);

  const currentLayerRef = useRef<L.GeoJSON | null>(null);
  const noControlLayerRef = useRef<L.GeoJSON | null>(null);
  const controlLayerRef = useRef<L.GeoJSON | null>(null);

  const currentTileLayersRef = useRef<TileLayerSet | null>(null);
  const noControlTileLayersRef = useRef<TileLayerSet | null>(null);
  const controlTileLayersRef = useRef<TileLayerSet | null>(null);

  const selectionRectangleRef = useRef<L.Rectangle | null>(null);
  const isSelectingRef = useRef(false);
  const selectStartRef = useRef<L.LatLng | null>(null);
  const featuresRef = useRef<SimulationFeature[]>([]);
  const hasFittedRef = useRef(false);
  const isSyncingRef = useRef(false);
  const selectionModeRef = useRef(false);

  const [features, setFeatures] = useState<SimulationFeature[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [month, setMonth] = useState<ForecastMonth>(3);
  const [selectionMode, setSelectionMode] = useState(false);
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("base");

  useEffect(() => {
    if (!VWORLD_KEY) {
      console.warn(
        "VITE_VWORLD_API_KEY가 없습니다. 프로젝트 루트 .env 파일을 확인하세요."
      );
    }
  }, []);

  useEffect(() => {
    selectionModeRef.current = selectionMode;

    const currentMap = currentLeafletMapRef.current;
    if (!currentMap) return;

    if (selectionMode) {
      currentMap.dragging.disable();
      currentMap.getContainer().style.cursor = "crosshair";
    } else {
      currentMap.dragging.enable();
      currentMap.getContainer().style.cursor = "";
    }
  }, [selectionMode]);

  useEffect(() => {
    fetch(GEOJSON_PATH)
      .then((res) => {
        if (!res.ok) throw new Error(`GeoJSON load failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const loaded = filterKoreaFeatures(data.features || []);
        setFeatures(loaded);
      })
      .catch((err) => console.error("Simulation GeoJSON load error:", err));
  }, []);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  function createVworldTileLayers(map: L.Map): TileLayerSet {
    const base = L.tileLayer(VWORLD_BASE_URL, {
      attribution: VWORLD_KEY ? "VWorld" : "© OpenStreetMap contributors",
      maxZoom: 19,
      bounds: KOREA_BOUNDS,
      noWrap: true,
      updateWhenIdle: true,
      keepBuffer: 1,
    });

    const satellite = L.tileLayer(VWORLD_SATELLITE_URL, {
      attribution: VWORLD_KEY ? "VWorld" : "© OpenStreetMap contributors",
      maxZoom: 19,
      bounds: KOREA_BOUNDS,
      noWrap: true,
      updateWhenIdle: true,
      keepBuffer: 1,
    });

    const hybrid = L.tileLayer(VWORLD_HYBRID_URL, {
      attribution: VWORLD_KEY ? "VWorld" : "© OpenStreetMap contributors",
      maxZoom: 19,
      bounds: KOREA_BOUNDS,
      noWrap: true,
      updateWhenIdle: true,
      keepBuffer: 1,
    });

    base.addTo(map);

    return {
      base,
      satellite,
      hybrid,
    };
  }

  function createBaseMap(container: HTMLDivElement, mapKind: "current" | "noControl" | "control") {
    const map = L.map(container, {
      center: [36.35, 127.7],
      zoom: 7,
      minZoom: 6,
      maxZoom: 13,
      maxBounds: KOREA_BOUNDS,
      maxBoundsViscosity: 0.8,
      zoomControl: true,
      preferCanvas: true,
    });

    const tileLayers = createVworldTileLayers(map);

    if (mapKind === "current") {
      currentTileLayersRef.current = tileLayers;
    }

    if (mapKind === "noControl") {
      noControlTileLayersRef.current = tileLayers;
    }

    if (mapKind === "control") {
      controlTileLayersRef.current = tileLayers;
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return map;
  }

  function applyBaseMapModeToMap(
    map: L.Map | null,
    tileLayers: TileLayerSet | null
  ) {
    if (!map || !tileLayers) return;

    const { base, satellite, hybrid } = tileLayers;

    if (baseMapMode === "base") {
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      if (map.hasLayer(hybrid)) map.removeLayer(hybrid);
      if (!map.hasLayer(base)) base.addTo(map);
    }

    if (baseMapMode === "satellite") {
      if (map.hasLayer(base)) map.removeLayer(base);
      if (!map.hasLayer(satellite)) satellite.addTo(map);
      if (!map.hasLayer(hybrid)) hybrid.addTo(map);
    }
  }

  useEffect(() => {
    applyBaseMapModeToMap(
      currentLeafletMapRef.current,
      currentTileLayersRef.current
    );
    applyBaseMapModeToMap(
      noControlLeafletMapRef.current,
      noControlTileLayersRef.current
    );
    applyBaseMapModeToMap(
      controlLeafletMapRef.current,
      controlTileLayersRef.current
    );

    currentLayerRef.current?.bringToFront();
    noControlLayerRef.current?.bringToFront();
    controlLayerRef.current?.bringToFront();

    if (selectionRectangleRef.current) {
      selectionRectangleRef.current.bringToFront();
    }
  }, [baseMapMode]);

  useEffect(() => {
    if (!currentMapRef.current || currentLeafletMapRef.current) return;

    const map = createBaseMap(currentMapRef.current, "current");
    currentLeafletMapRef.current = map;

    map.on("mousedown", (event: L.LeafletMouseEvent) => {
      if (!selectionModeRef.current) return;

      isSelectingRef.current = true;
      selectStartRef.current = event.latlng;

      if (selectionRectangleRef.current) {
        selectionRectangleRef.current.removeFrom(map);
        selectionRectangleRef.current = null;
      }

      selectionRectangleRef.current = L.rectangle(
        L.latLngBounds(event.latlng, event.latlng),
        {
          color: "#2563eb",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 0.08,
          dashArray: "6 4",
        }
      ).addTo(map);
    });

    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      if (!selectionModeRef.current) return;
      if (!isSelectingRef.current || !selectStartRef.current) return;
      if (!selectionRectangleRef.current) return;

      const bounds = L.latLngBounds(selectStartRef.current, event.latlng);
      selectionRectangleRef.current.setBounds(bounds);
    });

    map.on("mouseup", (event: L.LeafletMouseEvent) => {
      if (!selectionModeRef.current) return;
      if (!isSelectingRef.current || !selectStartRef.current) return;

      isSelectingRef.current = false;

      const bounds = L.latLngBounds(selectStartRef.current, event.latlng);
      selectStartRef.current = null;

      if (selectionRectangleRef.current) {
        selectionRectangleRef.current.setBounds(bounds);
      }

      const nextSelectedIds = featuresRef.current
        .filter((feature) => {
          const center = getFeatureCenter(feature);
          if (!center) return false;
          return bounds.contains(L.latLng(center[0], center[1]));
        })
        .map((feature) => getFeatureId(feature));

      setSelectedIds(nextSelectedIds);
    });
  }, []);

  useEffect(() => {
    if (!noControlMapRef.current || noControlLeafletMapRef.current) return;
    noControlLeafletMapRef.current = createBaseMap(
      noControlMapRef.current,
      "noControl"
    );
  }, []);

  useEffect(() => {
    if (!controlMapRef.current || controlLeafletMapRef.current) return;
    controlLeafletMapRef.current = createBaseMap(controlMapRef.current, "control");
  }, []);

  useEffect(() => {
    const maps = [
      currentLeafletMapRef.current,
      noControlLeafletMapRef.current,
      controlLeafletMapRef.current,
    ].filter(Boolean) as L.Map[];

    if (maps.length !== 3) return;

    const syncMap = (source: L.Map) => {
      if (isSyncingRef.current) return;

      isSyncingRef.current = true;

      maps.forEach((target) => {
        if (target === source) return;
        target.setView(source.getCenter(), source.getZoom(), {
          animate: false,
        });
      });

      isSyncingRef.current = false;
    };

    const handlers = maps.map((map) => {
      const handler = () => syncMap(map);
      map.on("moveend zoomend", handler);
      return { map, handler };
    });

    return () => {
      handlers.forEach(({ map, handler }) => {
        map.off("moveend zoomend", handler);
      });
    };
  }, [features.length]);

  const simulatedFeatures = useMemo(() => {
    return runSimulation({
      features,
      selectedIds,
      month,
    });
  }, [features, selectedIds, month]);

  const summary = useMemo(() => {
    return summarizeSimulation(simulatedFeatures);
  }, [simulatedFeatures]);

  function renderLayer(
    map: L.Map | null,
    layerRef: React.MutableRefObject<L.GeoJSON | null>,
    mode: "current" | "noControl" | "control"
  ) {
    if (!map || !simulatedFeatures.length) return;

    if (layerRef.current) {
      layerRef.current.removeFrom(map);
      layerRef.current = null;
    }

    const collection = makeFeatureCollection(simulatedFeatures);

    const layer = L.geoJSON(collection, {
      renderer: L.canvas({ padding: 0.3 }),
      interactive: false,
      style: (feature: any) => {
        const props = feature?.properties || {};
        return getMapStyle(props, mode, baseMapMode);
      },
    }).addTo(map);

    layerRef.current = layer;
    layer.bringToFront();

    if (!hasFittedRef.current) {
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        [
          currentLeafletMapRef.current,
          noControlLeafletMapRef.current,
          controlLeafletMapRef.current,
        ].forEach((targetMap) => {
          targetMap?.fitBounds(bounds, { padding: [20, 20], animate: false });
        });

        hasFittedRef.current = true;
      }
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 120);
  }

  useEffect(() => {
    renderLayer(currentLeafletMapRef.current, currentLayerRef, "current");
    renderLayer(noControlLeafletMapRef.current, noControlLayerRef, "noControl");
    renderLayer(controlLeafletMapRef.current, controlLayerRef, "control");

    if (selectionRectangleRef.current) {
      selectionRectangleRef.current.bringToFront();
    }
  }, [simulatedFeatures, baseMapMode]);

  function resetSimulation() {
    setSelectedIds([]);
    setMonth(3);
    setSelectionMode(false);

    const currentMap = currentLeafletMapRef.current;

    if (selectionRectangleRef.current && currentMap) {
      selectionRectangleRef.current.removeFrom(currentMap);
      selectionRectangleRef.current = null;
    }

    isSelectingRef.current = false;
    selectStartRef.current = null;

    if (currentMap) {
      currentMap.dragging.enable();
      currentMap.getContainer().style.cursor = "";
    }
  }

  return (
    <div className="bg-white rounded-[28px] shadow-sm border border-[#E5E7EB] p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-[30px] font-extrabold text-[#1F2937] leading-tight">
            🧪 확산 시뮬레이션
          </h2>
          <p className="text-[#94A3B8] mt-2 text-[15px]">
            현재 상태에서 방제 대상 구역을 선택하면, 미방제 미래와 방제 후 미래를
            3개 지도에서 비교합니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="text-sm font-bold text-[#0F766E] bg-[#ECFDF5] px-4 py-2 rounded-xl">
            SIM-001 현재·미방제·방제 비교
          </div>

          <div className="flex gap-2 bg-[#F3F4F6] rounded-xl p-1">
            <button
              type="button"
              onClick={() => setBaseMapMode("base")}
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
              onClick={() => setBaseMapMode("satellite")}
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
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="font-bold text-[#334155]">예측 시점</div>

        <div className="flex gap-2 bg-[#F3F4F6] rounded-xl p-1">
          {monthOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMonth(option.value)}
              className={
                month === option.value
                  ? "px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#111827] shadow"
                  : "px-4 py-2 rounded-lg text-sm font-semibold text-[#6B7280]"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSelectionMode((prev) => !prev)}
          className={
            selectionMode
              ? "px-4 py-2 rounded-xl text-sm font-bold bg-[#2563eb] text-white shadow"
              : "px-4 py-2 rounded-xl text-sm font-bold bg-white text-[#334155] border border-[#E5E7EB]"
          }
        >
          {selectionMode ? "현재 지도에서 선택 중" : "영역 선택 켜기"}
        </button>

        <button
          type="button"
          onClick={resetSimulation}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-white text-[#64748B] border border-[#E5E7EB]"
        >
          시뮬레이션 초기화
        </button>

        <div className="ml-auto text-sm text-[#64748B]">
          선택 격자{" "}
          <span className="font-bold text-[#111827]">{selectedIds.length}</span>개
        </div>
      </div>

      <div className="mb-4 rounded-[16px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-[#64748B]">
          배경지도{" "}
          <span className="font-bold text-[#111827]">
            {baseMapMode === "base" ? "VWorld 일반지도" : "VWorld 위성지도"}
          </span>
          를 기준으로 현재·미방제·방제 후 3개 지도가 동기화됩니다.
        </div>
        <div className="text-xs font-semibold text-[#0F766E]">
          위성지도에서는 격자 투명도를 낮춰 실제 산림 배경을 확인합니다.
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 mb-5">
        <MapPanel
          title="현재 상태"
          badge="현재 AI 위험도"
          mapRef={currentMapRef}
          selectedHint="이 지도에서 영역 선택"
        />

        <MapPanel
          title="미방제 미래"
          badge={`${month}개월 후 위험 증가`}
          mapRef={noControlMapRef}
          selectedHint="조치하지 않을 경우"
        />

        <MapPanel
          title="방제 후 미래"
          badge={`${month}개월 후 위험 감소`}
          mapRef={controlMapRef}
          selectedHint="선택 구역 방제 시행"
        />
      </div>

      <div className="grid grid-cols-12 gap-4 mb-5">
        <div className="col-span-4">
          <div className="rounded-[18px] bg-white border border-[#E5E7EB] p-4 h-full">
            <div className="font-bold text-[#334155] mb-3">선택 결과</div>
            <div className="space-y-2 text-[14px]">
              <InfoRow
                label="선택 격자 수"
                value={`${formatNumber(selectedIds.length, 0)}개`}
              />
              <InfoRow label="시뮬레이션 시점" value={`${month}개월 후`} />
              <InfoRow label="지도 구성" value="현재 / 미방제 / 방제" />
              <InfoRow label="데이터 범위" value="상위 15% 후보 격자" />
              <InfoRow
                label="배경지도"
                value={baseMapMode === "base" ? "VWorld 일반지도" : "VWorld 위성지도"}
              />
            </div>
          </div>
        </div>

        <div className="col-span-8">
          <div className="rounded-[18px] bg-[#F8FAFC] border border-[#E5E7EB] p-4">
            <div className="font-bold text-[#334155] mb-3">
              시뮬레이션 비교 결과
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <TripleCompareCard
                title="평균 위험도"
                current={formatNumber(summary.avgCurrent, 1)}
                noControl={formatNumber(summary.avgNoControl, 1)}
                control={formatNumber(summary.avgControl, 1)}
              />
              <TripleCompareCard
                title="고위험 격자(70+)"
                current={`${formatNumber(summary.highCurrent, 0)}개`}
                noControl={`${formatNumber(summary.highNoControl, 0)}개`}
                control={`${formatNumber(summary.highControl, 0)}개`}
              />
              <TripleCompareCard
                title="변화 격자"
                current="-"
                noControl={`${formatNumber(summary.increasedCount, 0)}개 증가`}
                control={`${formatNumber(summary.reducedCount, 0)}개 감소`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="미방제 평균 증가"
                value={`${formatNumber(summary.avgIncrease, 1)}점`}
              />
              <MetricCard
                label="방제 평균 저감"
                value={`${formatNumber(summary.avgReduction, 1)}점`}
              />
              <MetricCard
                label="강한 감소 격자"
                value={`${formatNumber(summary.strongReducedCount, 0)}개`}
              />
              <MetricCard
                label="고위험 해소 격자"
                value={`${formatNumber(
                  summary.highNoControl - summary.highControl,
                  0
                )}개`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[18px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
        <div className="font-semibold text-[#334155] mb-1">
          시뮬레이션 해석 기준
        </div>
        <div className="text-sm text-[#94A3B8] leading-6">
          현재 상태는 AI 모델이 산정한 기준 위험도입니다. 미방제 미래는 아무 조치를
          하지 않았을 때 1·3·6개월 후 선택 구역 주변 위험도가 증가하는 시나리오이고,
          방제 후 미래는 선택 구역의 위험도와 주변 감염압력이 낮아지는 시나리오입니다.
          VWorld 위성지도 전환을 통해 방제 전후 위험 변화가 실제 산림·도로·하천
          환경과 어떻게 맞물리는지 함께 확인할 수 있습니다. 본 결과는 실제 확정 예측이
          아니라 방제 의사결정을 위한 상대위험 변화입니다.
        </div>
      </div>
    </div>
  );
}

function MapPanel(props: {
  title: string;
  badge: string;
  selectedHint: string;
  mapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { title, badge, selectedHint, mapRef } = props;

  return (
    <div className="col-span-4">
      <div className="rounded-[18px] border border-[#E5E7EB] bg-[#FBFBFC] p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="text-[17px] font-bold text-[#1F2937]">{title}</div>
          <div className="text-[11px] font-bold text-[#0F766E] bg-white border border-[#E5E7EB] px-2 py-1 rounded-full whitespace-nowrap">
            {badge}
          </div>
        </div>

        <div
          ref={mapRef}
          className="rounded-[18px] overflow-hidden border border-[#DDE5E2] bg-[#EEF7F3]"
          style={{ height: 430, width: "100%" }}
        />

        <div className="mt-3 text-xs text-[#64748B] font-semibold">
          {selectedHint}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Legend color="#d90429" label="극고위험" />
          <Legend color="#ff2b57" label="매우 높음" />
          <Legend color="#ff9f0a" label="높음" />
          <Legend color="#ffcc00" label="주의" />
          <Legend color="#1fc16b" label="관찰" />
          <Legend color="#2563eb" label="선택" />
        </div>
      </div>
    </div>
  );
}

function TripleCompareCard(props: {
  title: string;
  current: string;
  noControl: string;
  control: string;
}) {
  const { title, current, noControl, control } = props;

  return (
    <div className="rounded-xl bg-white border border-[#E5E7EB] p-3">
      <div className="text-xs text-[#64748B] mb-2">{title}</div>

      <div className="text-[12px] text-[#64748B]">현재</div>
      <div className="text-sm font-bold text-[#111827] mb-1">{current}</div>

      <div className="text-[12px] text-[#64748B]">미방제</div>
      <div className="text-sm font-bold text-[#b91c1c] mb-1">{noControl}</div>

      <div className="text-[12px] text-[#64748B]">방제 후</div>
      <div className="text-sm font-bold text-[#0F766E]">{control}</div>
    </div>
  );
}

function MetricCard(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="rounded-xl bg-white border border-[#E5E7EB] p-3">
      <div className="text-xs text-[#64748B] mb-1">{label}</div>
      <div className="text-lg font-extrabold text-[#111827]">{value}</div>
    </div>
  );
}

function Legend(props: { color: string; label: string }) {
  const { color, label } = props;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[#475569]">{label}</span>
    </div>
  );
}

function InfoRow(props: { label: string; value: any }) {
  const { label, value } = props;

  return (
    <div className="flex justify-between gap-3 border-b border-[#EDF1F3] pb-2">
      <span className="text-[#64748B]">{label}</span>
      <span className="font-semibold text-[#111827] text-right">{value}</span>
    </div>
  );
}