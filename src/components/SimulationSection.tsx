import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type ForecastMonth = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type BaseMapMode = "base" | "satellite";
type ScenarioMode = "noControl" | "control";

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

  currentRisk?: number;
  futureNoControlRisk?: number;
  futureControlRisk?: number;
  noControlIncrease?: number;
  controlReduction?: number;
  riskDelta?: number;
  distanceKmFromSelection?: number | null;
  isSelectedSource?: boolean;
};

type SimulationFeature = GeoJSON.Feature<
  GeoJSON.Geometry,
  SimulationGridProps
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

const MANIFEST_PATH = "/data/simulation_tiles/manifest.json";
const TILE_BASE_PATH = "/data/simulation_tiles";
const MIN_GRID_ZOOM = 10;

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

function getFeatureCenter(
  feature: SimulationFeature
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

function calculateDistanceKm(
  a: [number, number],
  b: [number, number]
) {
  return (
    L.latLng(a[0], a[1]).distanceTo(
      L.latLng(b[0], b[1])
    ) / 1000
  );
}

function intersectsMapBounds(
  tile: TileManifestItem,
  mapBounds: L.LatLngBounds
) {
  const [minLng, minLat, maxLng, maxLat] = tile.bounds;

  const tileBounds = L.latLngBounds(
    L.latLng(minLat, minLng),
    L.latLng(maxLat, maxLng)
  );

  return mapBounds.intersects(tileBounds);
}

function makeFeatureCollection(
  features: SimulationFeature[]
) {
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
        (upper.percentile - lower.percentile) *
          localT
      );
    }
  }

  return 100;
}

function getCurrentVisualPercentile(
  props: SimulationGridProps
) {
  const riskPercentile = Number(
    props.risk_percentile
  );

  if (Number.isFinite(riskPercentile)) {
    return clamp(100 - riskPercentile);
  }

  return scoreToVisualPercentile(
    Number(props.risk_score ?? 0)
  );
}

function getScenarioVisualPercentile(
  props: SimulationGridProps,
  month: ForecastMonth,
  scenario: ScenarioMode
) {
  if (month === 0) {
    return getCurrentVisualPercentile(props);
  }

  return scoreToVisualPercentile(
    getScenarioScore(props, month, scenario)
  );
}

function interpolateRiskColor(
  visualPercentile: number
) {
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

  const upperIndex = stops.findIndex(
    (stop) => stop.t >= t
  );

  if (upperIndex <= 0) {
    const [r, g, b] = stops[0].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }

  if (upperIndex === -1) {
    const [r, g, b] =
      stops[stops.length - 1].rgb;

    return `rgb(${r}, ${g}, ${b})`;
  }

  const lower = stops[upperIndex - 1];
  const upper = stops[upperIndex];
  const localT =
    (t - lower.t) / (upper.t - lower.t);

  const rgb = lower.rgb.map(
    (start, index) =>
      Math.round(
        start +
          (upper.rgb[index] - start) *
            localT
      )
  );

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function getRiskOpacity(
  visualPercentile: number,
  baseMapMode: BaseMapMode
) {
  const t = clamp(visualPercentile) / 100;
  const curved = Math.pow(t, 1.25);

  const minOpacity =
    baseMapMode === "satellite" ? 0.015 : 0.025;

  const maxOpacity =
    baseMapMode === "satellite" ? 0.58 : 0.82;

  return (
    minOpacity +
    (maxOpacity - minOpacity) * curved
  );
}

function getRiskLabel(score: number) {
  if (score >= 85) return "극고위험";
  if (score >= 70) return "매우 높음";
  if (score >= 55) return "높음";
  if (score >= 40) return "주의";
  if (score > 0) return "관찰";
  return "낮음";
}

function getScenarioScore(
  props: SimulationGridProps,
  month: ForecastMonth,
  scenario: ScenarioMode
) {
  const current = Number(
    props.currentRisk ??
      props.risk_score ??
      0
  );

  if (month === 0) return clamp(current);

  if (scenario === "noControl") {
    return clamp(
      Number(
        props.futureNoControlRisk ?? current
      )
    );
  }

  return clamp(
    Number(props.futureControlRisk ?? current)
  );
}

function runSimulation(params: {
  features: SimulationFeature[];
  selectedIds: string[];
  month: ForecastMonth;
}) {
  const { features, selectedIds, month } = params;
  const selectedSet = new Set(selectedIds);

  const selectedCenters = features
    .filter((feature) =>
      selectedSet.has(getFeatureId(feature))
    )
    .map((feature) => getFeatureCenter(feature))
    .filter(Boolean) as [number, number][];

  const noControlGrowthMap: Record<
    ForecastMonth,
    number
  > = {
    0: 0,
    1: 0.26,
    2: 0.48,
    3: 0.68,
    4: 0.86,
    5: 1.02,
    6: 1.16,
  };

  const directControlMap: Record<
    ForecastMonth,
    number
  > = {
    0: 0,
    1: 12,
    2: 17,
    3: 21,
    4: 24,
    5: 27,
    6: 30,
  };

  const neighborControlMap: Record<
    ForecastMonth,
    number
  > = {
    0: 0,
    1: 5,
    2: 8,
    3: 11,
    4: 14,
    5: 16,
    6: 18,
  };

  if (
    !selectedCenters.length ||
    month === 0
  ) {
    return features.map((feature) => {
      const props = feature.properties || {};
      const currentRisk = clamp(
        Number(props.risk_score ?? 0)
      );

      return {
        ...feature,
        properties: {
          ...props,
          currentRisk,
          futureNoControlRisk: currentRisk,
          futureControlRisk: currentRisk,
          noControlIncrease: 0,
          controlReduction: 0,
          riskDelta: 0,
          distanceKmFromSelection: null,
          isSelectedSource: selectedSet.has(
            getFeatureId(feature)
          ),
        },
      };
    });
  }

  return features.map((feature) => {
    const props = feature.properties || {};
    const featureId = getFeatureId(feature);
    const center = getFeatureCenter(feature);

    const baseRisk = clamp(
      Number(props.risk_score ?? 0)
    );

    const recentPressure = clamp(
      Number(
        props.recent_pressure_score ?? 0
      )
    );

    const pineRatio = clamp(
      normalizeRatio(props.pine_ratio),
      0,
      1
    );

    const accessScore = clamp(
      Number(props.access_score_v3 ?? 50)
    );

    const isSelectedSource =
      selectedSet.has(featureId);

    let minDistanceKm =
      Number.POSITIVE_INFINITY;

    if (center) {
      minDistanceKm = Math.min(
        ...selectedCenters.map(
          (selectedCenter) =>
            calculateDistanceKm(
              center,
              selectedCenter
            )
        )
      );
    }

    const spreadInfluence =
      Number.isFinite(minDistanceKm)
        ? Math.exp(-minDistanceKm / 18)
        : 0;

    const controlInfluence =
      Number.isFinite(minDistanceKm)
        ? Math.exp(-minDistanceKm / 10)
        : 0;

    const spreadPotential =
      4 +
      recentPressure * 0.11 +
      pineRatio * 18 +
      baseRisk * 0.08;

    const rawIncrease =
      spreadPotential *
      noControlGrowthMap[month] *
      spreadInfluence *
      (isSelectedSource ? 1.2 : 1);

    const noControlIncrease = Math.min(
      rawIncrease,
      20
    );

    const futureNoControlRisk = clamp(
      baseRisk + noControlIncrease
    );

    const directReduction =
      isSelectedSource
        ? directControlMap[month] +
          recentPressure * 0.05 +
          (accessScore / 100) * 4
        : 0;

    const neighborReduction =
      neighborControlMap[month] *
      controlInfluence *
      (0.8 + recentPressure / 500);

    const controlReduction = Math.min(
      directReduction + neighborReduction,
      30
    );

    const futureControlRisk = clamp(
      futureNoControlRisk -
        controlReduction
    );

    return {
      ...feature,
      properties: {
        ...props,
        currentRisk: baseRisk,
        futureNoControlRisk,
        futureControlRisk,
        noControlIncrease,
        controlReduction,
        riskDelta:
          futureNoControlRisk -
          futureControlRisk,
        distanceKmFromSelection:
          Number.isFinite(minDistanceKm)
            ? minDistanceKm
            : null,
        isSelectedSource,
      },
    };
  });
}

function summarizeSimulation(
  features: SimulationFeature[],
  selectedIds: string[]
) {
  const selectedSet = new Set(selectedIds);

  const selectedFeatures = features.filter(
    (feature) =>
      selectedSet.has(getFeatureId(feature))
  );

  const targetFeatures =
    selectedFeatures.length > 0
      ? selectedFeatures
      : features;

  const total = targetFeatures.length;

  const avg = (
    key: keyof SimulationGridProps
  ) =>
    targetFeatures.reduce(
      (sum, feature) =>
        sum +
        Number(
          feature.properties?.[key] ?? 0
        ),
      0
    ) / Math.max(1, total);

  const avgCurrent = avg("currentRisk");
  const avgNoControl = avg(
    "futureNoControlRisk"
  );
  const avgControl = avg(
    "futureControlRisk"
  );

  const highNoControl =
    targetFeatures.filter(
      (feature) =>
        Number(
          feature.properties
            ?.futureNoControlRisk ?? 0
        ) >= 70
    ).length;

  const highControl =
    targetFeatures.filter(
      (feature) =>
        Number(
          feature.properties
            ?.futureControlRisk ?? 0
        ) >= 70
    ).length;

  const affectedNeighborCount =
    features.filter((feature) => {
      const distance = Number(
        feature.properties
          ?.distanceKmFromSelection ??
          Number.POSITIVE_INFINITY
      );

      return distance > 0 && distance <= 5;
    }).length;

  return {
    selectedCount: selectedIds.length,
    selectedAreaKm2:
      selectedIds.length * 0.25,
    avgCurrent,
    avgNoControl,
    avgControl,
    avgIncrease:
      avgNoControl - avgCurrent,
    avgReduction:
      avgNoControl - avgControl,
    resolvedHighRisk: Math.max(
      0,
      highNoControl - highControl
    ),
    affectedNeighborCount,
  };
}

export default function SimulationSection() {
  const mapContainerRef =
    useRef<HTMLDivElement | null>(null);

  const leafletMapRef =
    useRef<L.Map | null>(null);

  const geoJsonLayerRef =
    useRef<L.GeoJSON | null>(null);

  const tileLayersRef =
    useRef<TileLayerSet | null>(null);

  const manifestRef =
    useRef<TileManifest | null>(null);

  const tileCacheRef = useRef<
    Map<string, SimulationFeature[]>
  >(new Map());

  const visibleTileFilesRef =
    useRef<string[]>([]);

  const requestSequenceRef = useRef(0);

  const selectionRectangleRef =
    useRef<L.Rectangle | null>(null);

  const selectionStartRef =
    useRef<L.LatLng | null>(null);

  const isSelectingRef = useRef(false);
  const selectionModeRef = useRef(false);
  const featuresRef =
    useRef<SimulationFeature[]>([]);

  const [features, setFeatures] = useState<
    SimulationFeature[]
  >([]);

  const [selectedIds, setSelectedIds] =
    useState<string[]>([]);

  const [month, setMonth] =
    useState<ForecastMonth>(0);

  const [scenario, setScenario] =
    useState<ScenarioMode>("noControl");

  const [selectionMode, setSelectionMode] =
    useState(false);

  const [baseMapMode, setBaseMapMode] =
    useState<BaseMapMode>("base");

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

  async function loadVisibleTiles() {
    const map = leafletMapRef.current;
    const manifest = manifestRef.current;

    if (!map || !manifest) return;

    const zoom = map.getZoom();
    setCurrentZoom(zoom);

    if (zoom < MIN_GRID_ZOOM) {
      requestSequenceRef.current += 1;
      visibleTileFilesRef.current = [];
      setFeatures([]);
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

    const paddedBounds = map
      .getBounds()
      .pad(0.12);

    const visibleTiles =
      manifest.tiles.filter((tile) =>
        intersectsMapBounds(
          tile,
          paddedBounds
        )
      );

    const visibleFiles =
      visibleTiles.map((tile) => tile.file);

    visibleTileFilesRef.current =
      visibleFiles;

    setVisibleTileCount(
      visibleFiles.length
    );

    try {
      await Promise.all(
        visibleFiles.map(async (file) => {
          if (
            tileCacheRef.current.has(file)
          ) {
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
            (data.features ||
              []) as SimulationFeature[]
          );
        })
      );

      if (
        requestSequence !==
        requestSequenceRef.current
      ) {
        return;
      }

      const nextFeatures =
        visibleFiles.flatMap(
          (file) =>
            tileCacheRef.current.get(file) ??
            []
        );

      setFeatures(nextFeatures);
      setLoadedFeatureCount(
        nextFeatures.length
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
        "현재 지도 범위의 격자 타일을 불러오지 못했습니다. public/data/simulation_tiles 폴더를 확인하세요."
      );

      setLoading(false);
    }
  }

  useEffect(() => {
    fetch(MANIFEST_PATH)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `manifest: ${response.status}`
          );
        }

        return response.json();
      })
      .then((manifest: TileManifest) => {
        manifestRef.current = manifest;
        setLoading(false);
        void loadVisibleTiles();
      })
      .catch((error) => {
        console.error(
          "Simulation manifest load error:",
          error
        );

        setLoadError(
          "simulation_tiles/manifest.json을 불러오지 못했습니다."
        );

        setLoading(false);
      });
  }, []);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    selectionModeRef.current =
      selectionMode;

    const map = leafletMapRef.current;

    if (!map) return;

    if (selectionMode) {
      map.dragging.disable();
      map.getContainer().style.cursor =
        "crosshair";
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor =
        "";
    }
  }, [selectionMode]);

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
        minZoom: 6,
        maxZoom: 15,
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
      void loadVisibleTiles();
    });

    map.on(
      "mousedown",
      (event: L.LeafletMouseEvent) => {
        if (
          !selectionModeRef.current ||
          map.getZoom() < MIN_GRID_ZOOM
        ) {
          return;
        }

        isSelectingRef.current = true;
        selectionStartRef.current =
          event.latlng;

        if (
          selectionRectangleRef.current
        ) {
          selectionRectangleRef.current.removeFrom(
            map
          );
        }

        selectionRectangleRef.current =
          L.rectangle(
            L.latLngBounds(
              event.latlng,
              event.latlng
            ),
            {
              color: "#2563eb",
              weight: 2,
              fillColor: "#2563eb",
              fillOpacity: 0.05,
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
          !selectionRectangleRef.current
        ) {
          return;
        }

        selectionRectangleRef.current.setBounds(
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

        selectionRectangleRef.current?.setBounds(
          bounds
        );

        const nextSelectedIds =
          featuresRef.current
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

        setSelectedIds(nextSelectedIds);
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

    geoJsonLayerRef.current?.bringToFront();
    selectionRectangleRef.current?.bringToFront();
  }, [baseMapMode]);

  const simulatedFeatures = useMemo(
    () =>
      runSimulation({
        features,
        selectedIds,
        month,
      }),
    [features, selectedIds, month]
  );

  const summary = useMemo(
    () =>
      summarizeSimulation(
        simulatedFeatures,
        selectedIds
      ),
    [simulatedFeatures, selectedIds]
  );

  useEffect(() => {
    const map = leafletMapRef.current;

    if (!map) return;

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.removeFrom(
        map
      );

      geoJsonLayerRef.current = null;
    }

    if (
      currentZoom < MIN_GRID_ZOOM ||
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

          const score = getScenarioScore(
            safeProps,
            month,
            scenario
          );

          const visualPercentile =
            getScenarioVisualPercentile(
              safeProps,
              month,
              scenario
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

          return {
            color: selected
              ? "#2563eb"
              : candidate
              ? "#991b1b"
              : "transparent",
            weight: selected
              ? 1.8
              : candidate
              ? 0.55
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

          const score = getScenarioScore(
            props,
            month,
            scenario
          );

          const visualPercentile =
            getScenarioVisualPercentile(
              props,
              month,
              scenario
            );

          featureLayer.bindTooltip(
            `
              <div style="min-width:170px">
                <div style="font-weight:800;margin-bottom:4px">
                  격자 ${
                    props.grid_id ??
                    props.id ??
                    "-"
                  }
                </div>
                <div>위험도 ${score.toFixed(
                  2
                )}점</div>
                <div>위험등급 ${getRiskLabel(
                  score
                )}</div>
                <div>상대분포 상위 ${Math.max(
                  0,
                  100 - visualPercentile
                ).toFixed(1)}%</div>
                <div>${
                  month === 0
                    ? "현재 위험도"
                    : `${month}개월 후 · ${
                        scenario ===
                        "noControl"
                          ? "미방제"
                          : "방제 적용"
                      }`
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

    geoJsonLayerRef.current = layer;
    layer.bringToFront();

    selectionRectangleRef.current?.bringToFront();
  }, [
    simulatedFeatures,
    month,
    scenario,
    baseMapMode,
    currentZoom,
  ]);

  function resetSimulation() {
    setSelectedIds([]);
    setMonth(0);
    setScenario("noControl");
    setSelectionMode(false);

    const map = leafletMapRef.current;

    if (
      selectionRectangleRef.current &&
      map
    ) {
      selectionRectangleRef.current.removeFrom(
        map
      );

      selectionRectangleRef.current = null;
    }

    isSelectingRef.current = false;
    selectionStartRef.current = null;

    if (map) {
      map.dragging.enable();
      map.getContainer().style.cursor =
        "";
    }
  }

  const interpretation = useMemo(() => {
    if (currentZoom < MIN_GRID_ZOOM) {
      return "지도를 확대하면 현재 화면 범위의 500m 격자를 불러와 위험분포를 표시합니다.";
    }

    if (summary.selectedCount === 0) {
      return "지도에서 방제 검토 구역을 선택하면 선택 지역의 현재 위험도와 월별 미방제·방제 적용 시나리오를 비교합니다.";
    }

    if (month === 0) {
      return `선택한 ${summary.selectedCount.toLocaleString(
        "ko-KR"
      )}개 격자의 현재 평균 위험도는 ${summary.avgCurrent.toFixed(
        1
      )}점입니다.`;
    }

    if (scenario === "noControl") {
      return `선택한 ${summary.selectedCount.toLocaleString(
        "ko-KR"
      )}개 격자를 방제하지 않을 경우 ${month}개월 후 평균 위험도가 ${summary.avgCurrent.toFixed(
        1
      )}점에서 ${summary.avgNoControl.toFixed(
        1
      )}점으로 높아지는 상대위험 시나리오입니다.`;
    }

    return `선택한 ${summary.selectedCount.toLocaleString(
      "ko-KR"
    )}개 격자에 방제를 적용하면 ${month}개월 후 평균 위험도가 미방제 ${summary.avgNoControl.toFixed(
      1
    )}점에서 ${summary.avgControl.toFixed(
      1
    )}점으로 낮아지는 상대위험 시나리오입니다.`;
  }, [
    currentZoom,
    summary,
    month,
    scenario,
  ]);

  return (
    <div className="bg-white rounded-[28px] shadow-sm border border-[#E5E7EB] p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[30px] font-extrabold text-[#1F2937] leading-tight">
            확산위험 방제 시뮬레이션
          </h2>

          <p className="text-[#94A3B8] mt-2 text-[15px]">
            신규 확산위험 예측 대상
            375,490개 격자 전체를 기반으로,
            현재 지도 범위의 500m 격자를
            동적으로 표시합니다.
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
        <button
          type="button"
          disabled={
            currentZoom < MIN_GRID_ZOOM
          }
          onClick={() =>
            setSelectionMode(
              (previous) => !previous
            )
          }
          className={
            currentZoom < MIN_GRID_ZOOM
              ? "px-4 py-2 rounded-xl text-sm font-bold bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed"
              : selectionMode
              ? "px-4 py-2 rounded-xl text-sm font-bold bg-[#2563EB] text-white shadow"
              : "px-4 py-2 rounded-xl text-sm font-bold bg-white text-[#334155] border border-[#E5E7EB]"
          }
        >
          {selectionMode
            ? "지도에서 선택 중"
            : "방제 구역 선택"}
        </button>

        <button
          type="button"
          onClick={resetSimulation}
          className="px-4 py-2 rounded-xl text-sm font-bold bg-white text-[#64748B] border border-[#E5E7EB]"
        >
          초기화
        </button>

        <div className="ml-auto flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm text-[#64748B]">
          <span>
            표시 타일{" "}
            <b className="text-[#111827]">
              {visibleTileCount.toLocaleString(
                "ko-KR"
              )}
            </b>
            개
          </span>

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
              {selectedIds.length.toLocaleString(
                "ko-KR"
              )}
            </b>
            개 ·{" "}
            <b className="text-[#111827]">
              {formatNumber(
                summary.selectedAreaKm2,
                2
              )}
            </b>
            ㎢
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

            {loading &&
              currentZoom >= MIN_GRID_ZOOM && (
                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-[650] rounded-full bg-white/95 border border-[#E5E7EB] px-4 py-2 text-sm font-bold text-[#475569] shadow">
                  현재 지도 범위의 격자를
                  불러오는 중입니다.
                </div>
              )}

            {loadError && (
              <div className="absolute left-4 right-4 top-4 z-[700] rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">
                {loadError}
              </div>
            )}

            {currentZoom <
              MIN_GRID_ZOOM && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[600] rounded-2xl bg-white/95 border border-[#E5E7EB] px-6 py-5 text-center shadow-xl">
                <div className="text-lg font-extrabold text-[#1F2937]">
                  지도를 더 확대해 주세요
                </div>

                <div className="mt-2 text-sm leading-6 text-[#64748B]">
                  확대 단계{" "}
                  <b>{MIN_GRID_ZOOM}</b>
                  부터 현재 화면 범위의
                  500m 격자를 표시합니다.
                </div>

                <div className="mt-1 text-xs text-[#94A3B8]">
                  현재 확대 단계:{" "}
                  {currentZoom}
                </div>
              </div>
            )}

            {selectionMode && (
              <div className="absolute left-1/2 top-4 -translate-x-1/2 z-[600] rounded-full bg-[#2563EB] text-white px-4 py-2 text-sm font-bold shadow-lg">
                마우스로 방제 검토 구역을
                드래그하세요.
              </div>
            )}

            <div className="absolute left-4 bottom-4 z-[600] rounded-xl bg-white/95 border border-[#E5E7EB] shadow px-4 py-3">
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
                <span>상위 5%</span>
                <span>상위 1%</span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[11px] text-[#64748B]">
                <span className="inline-block w-5 h-3 border-2 border-[#991b1b] bg-transparent" />
                상위 10% 후보 외곽선
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-[#334155]">
                월별 시점
              </div>

              <div className="text-sm text-[#64748B]">
                선택 시점{" "}
                <span className="font-extrabold text-[#111827]">
                  {month === 0
                    ? "현재"
                    : `${month}개월 후`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {MONTH_OPTIONS.map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      setMonth(option)
                    }
                    className={
                      month === option
                        ? "py-3 rounded-xl bg-[#0F766E] text-white text-sm font-extrabold shadow"
                        : "py-3 rounded-xl bg-white border border-[#E5E7EB] text-[#64748B] text-sm font-bold"
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
              label="기준 시점"
              value={
                month === 0
                  ? "현재"
                  : `${month}개월 후`
              }
            />

            <InfoRow
              label="표시 범위"
              value={`${loadedFeatureCount.toLocaleString(
                "ko-KR"
              )}개 격자`}
            />

            <InfoRow
              label="선택 격자"
              value={`${summary.selectedCount.toLocaleString(
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

            {month > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 bg-[#F3F4F6] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() =>
                    setScenario("noControl")
                  }
                  className={
                    scenario === "noControl"
                      ? "py-2 rounded-lg bg-white text-[#B91C1C] text-sm font-extrabold shadow"
                      : "py-2 rounded-lg text-[#64748B] text-sm font-bold"
                  }
                >
                  미방제
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setScenario("control")
                  }
                  className={
                    scenario === "control"
                      ? "py-2 rounded-lg bg-white text-[#0F766E] text-sm font-extrabold shadow"
                      : "py-2 rounded-lg text-[#64748B] text-sm font-bold"
                  }
                >
                  방제 적용
                </button>
              </div>
            )}
          </div>

          <div className="rounded-[20px] border border-[#E5E7EB] bg-[#F8FAFC] p-5">
            <div className="font-extrabold text-[#1F2937] text-lg mb-4">
              위험 변화
            </div>

            <MetricCard
              label="현재 평균 위험도"
              value={`${formatNumber(
                summary.avgCurrent,
                1
              )}점`}
            />

            <MetricCard
              label={`${month || 1}개월 미방제`}
              value={`${formatNumber(
                summary.avgNoControl,
                1
              )}점`}
              emphasis="danger"
            />

            <MetricCard
              label={`${month || 1}개월 방제 적용`}
              value={`${formatNumber(
                summary.avgControl,
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
                  summary.avgReduction,
                  1
                )}점`}
              />

              <SmallMetric
                label="고위험 해소"
                value={`${summary.resolvedHighRisk.toLocaleString(
                  "ko-KR"
                )}개`}
              />

              <SmallMetric
                label="주변 5km 격자"
                value={`${summary.affectedNeighborCount.toLocaleString(
                  "ko-KR"
                )}개`}
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
                고위험 중심 격자를 우선 현장
                확인 대상으로 검토
              </li>
              <li>
                주변 5km 후보격자를 드론 예찰
                범위에 포함
              </li>
              <li>
                접근성이 낮은 지역은 드론 선행
                확인 후 현장 투입
              </li>
              <li>
                방제 완료 후 1개월 단위로
                위험도 재분석
              </li>
            </ol>
          </div>
        </aside>
      </div>

      <div className="mt-5 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
        화면의 숫자는 실제 0~100점
        상대위험 점수이며, 색상 농도는 전체
        예측 대상에서의 상대분포를 기준으로
        표현합니다. 월별 결과는 실제 감염
        발생을 확정하는 값이 아니라 방제
        의사결정을 위한 상대위험 변화
        시나리오입니다.
      </div>
    </div>
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
