import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type ForecastMonth = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type ViewMode = "current" | "noControl" | "control" | "effect";
type BaseMapMode = "base" | "satellite";

type GridProps = {
  grid_id?: string | number;
  risk_score?: number;
  risk_percentile?: number;
  risk_candidate_flag?: number | boolean;
  pine_ratio?: number;
  recent_pressure_score?: number;
  access_score_v3?: number;
  center_lat?: number;
  center_lng?: number;
};

type GridFeature = GeoJSON.Feature<GeoJSON.Geometry, GridProps>;

type SigunguProps = Record<string, unknown>;
type SigunguFeature = GeoJSON.Feature<GeoJSON.Geometry, SigunguProps>;

type SigunguIndexItem = {
  code: string;
  name: string;
  file: string;
  count: number;
  sizeMb: number;
  bounds: [number, number, number, number];
};

type SigunguIndex = {
  version: number;
  crs: string;
  totalFeatureCount: number;
  sigunguCount: number;
  items: SigunguIndexItem[];
};

type DerivedGrid = {
  current: number;
  noControl: number;
  control: number;
  reduction: number;
  zone: "direct" | "buffer2" | "buffer5" | "outside";
  selected: boolean;
};

type ControlArea = {
  bounds: L.LatLngBounds;
  selectedIds: Set<string>;
};

const SIGUNGU_BOUNDARY_PATH = "/data/sigungu_boundary.geojson";
const SIGUNGU_INDEX_PATH = "/data/simulation_sigungu/index.json";
const SIGUNGU_DATA_BASE = "/data/simulation_sigungu";

const MIN_ZOOM = 6;
const SIGUNGU_MAX_ZOOM = 9;
const GRID_MIN_ZOOM = 10;
const MAX_ZOOM = 15;

const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY;

const BASE_URL = VWORLD_KEY
  ? `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`
  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const SATELLITE_URL = VWORLD_KEY
  ? `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`
  : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const HYBRID_URL = VWORLD_KEY
  ? `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`
  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const KOREA_BOUNDS = L.latLngBounds(
  L.latLng(32.5, 124),
  L.latLng(39.8, 132.2)
);

const MONTHS: ForecastMonth[] = [0, 1, 2, 3, 4, 5, 6];

const NO_CONTROL_GROWTH: Record<ForecastMonth, number> = {
  0: 0,
  1: 0.25,
  2: 0.46,
  3: 0.66,
  4: 0.84,
  5: 1,
  6: 1.14,
};

const BUFFER_2_REDUCTION: Record<ForecastMonth, number> = {
  0: 0,
  1: 6,
  2: 9,
  3: 12,
  4: 14,
  5: 16,
  6: 18,
};

const BUFFER_5_REDUCTION: Record<ForecastMonth, number> = {
  0: 0,
  1: 2.5,
  2: 4,
  3: 5.5,
  4: 7,
  5: 8,
  6: 9,
};

const RISK_DISTRIBUTION = [
  [0.000033, 0],
  [0.001442, 1],
  [0.004373, 5],
  [0.009265, 10],
  [0.0403, 25],
  [0.247368, 50],
  [3.926575, 75],
  [37.210431, 90],
  [66.984112, 95],
  [93.481621, 99],
  [97.899562, 99.9],
  [99.159429, 100],
] as const;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getGridId(feature: GridFeature) {
  return String(feature.properties?.grid_id ?? "");
}

function getSigunguCode(props: SigunguProps) {
  for (const key of [
    "sigungu_code",
    "sigungu_cd",
    "sgg_cd",
    "SIG_CD",
    "SIGUNGU_CD",
    "code",
    "CODE",
  ]) {
    const value = props[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return "";
}

function getSigunguName(props: SigunguProps) {
  for (const key of [
    "sigungu_name",
    "sigungu_nm",
    "sgg_nm",
    "SIG_KOR_NM",
    "SIGUNGU_NM",
    "name",
    "NAME",
  ]) {
    const value = props[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return "시군구";
}

function getCenter(feature: GridFeature): [number, number] | null {
  const props = feature.properties || {};
  const lat = Number(props.center_lat);
  const lng = Number(props.center_lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return [lat, lng];
  }

  return null;
}

function expandBoundsByKm(bounds: L.LatLngBounds, km: number) {
  const center = bounds.getCenter();
  const latDelta = km / 111.32;
  const lngDelta =
    km /
    Math.max(
      111.32 * Math.cos((center.lat * Math.PI) / 180),
      1
    );

  return L.latLngBounds(
    L.latLng(
      bounds.getSouth() - latDelta,
      bounds.getWest() - lngDelta
    ),
    L.latLng(
      bounds.getNorth() + latDelta,
      bounds.getEast() + lngDelta
    )
  );
}

function distanceToBoundsKm(
  center: [number, number],
  bounds: L.LatLngBounds
) {
  const [lat, lng] = center;

  if (bounds.contains(L.latLng(lat, lng))) {
    return 0;
  }

  const clampedLat = Math.max(
    bounds.getSouth(),
    Math.min(bounds.getNorth(), lat)
  );

  const clampedLng = Math.max(
    bounds.getWest(),
    Math.min(bounds.getEast(), lng)
  );

  return (
    L.latLng(lat, lng).distanceTo(
      L.latLng(clampedLat, clampedLng)
    ) / 1000
  );
}

function scoreToPercentile(score: number) {
  const value = clamp(score);

  for (let index = 1; index < RISK_DISTRIBUTION.length; index += 1) {
    const [lowerScore, lowerPercentile] =
      RISK_DISTRIBUTION[index - 1];

    const [upperScore, upperPercentile] =
      RISK_DISTRIBUTION[index];

    if (value <= upperScore) {
      const ratio =
        (value - lowerScore) /
        Math.max(upperScore - lowerScore, Number.EPSILON);

      return (
        lowerPercentile +
        (upperPercentile - lowerPercentile) * ratio
      );
    }
  }

  return 100;
}

function riskColor(percentile: number) {
  const t = clamp(percentile) / 100;

  const stops = [
    [0, [255, 247, 247]],
    [0.5, [254, 226, 226]],
    [0.75, [252, 165, 165]],
    [0.9, [248, 113, 113]],
    [0.95, [220, 38, 38]],
    [0.99, [153, 27, 27]],
    [1, [69, 10, 10]],
  ] as const;

  for (let index = 1; index < stops.length; index += 1) {
    const [lowerT, lowerRgb] = stops[index - 1];
    const [upperT, upperRgb] = stops[index];

    if (t <= upperT) {
      const ratio = (t - lowerT) / Math.max(upperT - lowerT, Number.EPSILON);

      const rgb = lowerRgb.map((value, rgbIndex) =>
        Math.round(
          value +
            (upperRgb[rgbIndex] - value) * ratio
        )
      );

      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }
  }

  return "rgb(69, 10, 10)";
}

function effectColor(reduction: number) {
  const t = clamp(reduction, 0, 30) / 30;
  const start = [236, 253, 245];
  const end = [13, 148, 136];

  const rgb = start.map((value, index) =>
    Math.round(value + (end[index] - value) * t)
  );

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function calculateDerived(
  feature: GridFeature,
  controlArea: ControlArea | null,
  month: ForecastMonth
): DerivedGrid {
  const props = feature.properties || {};

  const current = clamp(Number(props.risk_score ?? 0));
  const pineRatioRaw = Number(props.pine_ratio ?? 0);
  const pineRatio = pineRatioRaw > 1 ? pineRatioRaw / 100 : pineRatioRaw;
  const recentPressure = clamp(
    Number(props.recent_pressure_score ?? 0)
  );

  const center = getCenter(feature);
  const id = getGridId(feature);

  let zone: DerivedGrid["zone"] = "outside";
  let selected = false;
  let distanceKm: number | null = null;

  if (controlArea && center) {
    selected = controlArea.selectedIds.has(id);
    distanceKm = distanceToBoundsKm(center, controlArea.bounds);

    if (selected || distanceKm === 0) {
      zone = "direct";
    } else if (distanceKm <= 2) {
      zone = "buffer2";
    } else if (distanceKm <= 5) {
      zone = "buffer5";
    }
  }

  const baseSpreadPotential =
    2.5 +
    recentPressure * 0.09 +
    clamp(pineRatio, 0, 1) * 15 +
    current * 0.065;

  const spreadBoost =
    zone === "direct"
      ? 1.14
      : zone === "buffer2"
      ? 1.07
      : zone === "buffer5"
      ? 1.03
      : 1;

  const noControl = clamp(
    current +
      Math.min(
        baseSpreadPotential *
          NO_CONTROL_GROWTH[month] *
          spreadBoost,
        20
      )
  );

  let control = noControl;

  if (month > 0 && controlArea) {
    if (zone === "direct") {
      control = 0;
    } else if (zone === "buffer2") {
      const distanceWeight =
        1 - Math.min(distanceKm ?? 2, 2) / 2;

      control = clamp(
        noControl -
          BUFFER_2_REDUCTION[month] *
            (0.72 + distanceWeight * 0.28) *
            (0.9 + recentPressure / 800)
      );
    } else if (zone === "buffer5") {
      const bufferDistance = Math.max(
        0,
        (distanceKm ?? 5) - 2
      );

      const distanceWeight =
        1 - Math.min(bufferDistance, 3) / 3;

      control = clamp(
        noControl -
          BUFFER_5_REDUCTION[month] *
            (0.65 + distanceWeight * 0.35) *
            (0.9 + recentPressure / 1000)
      );
    }
  }

  return {
    current,
    noControl,
    control,
    reduction: noControl - control,
    zone,
    selected,
  };
}

function getDisplayScore(
  derived: DerivedGrid,
  month: ForecastMonth,
  mode: ViewMode
) {
  if (month === 0 || mode === "current") {
    return derived.current;
  }

  if (mode === "noControl") {
    return derived.noControl;
  }

  return derived.control;
}

export default function SimulationSection() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const sigunguLayerRef = useRef<L.GeoJSON | null>(null);
  const gridLayerRef = useRef<L.GeoJSON | null>(null);

  const directLayerRef = useRef<L.Rectangle | null>(null);
  const buffer2LayerRef = useRef<L.Rectangle | null>(null);
  const buffer5LayerRef = useRef<L.Rectangle | null>(null);
  const previewLayerRef = useRef<L.Rectangle | null>(null);

  const featureLayerByIdRef = useRef<Map<string, L.Path>>(new Map());
  const gridCacheRef = useRef<Map<string, GridFeature[]>>(new Map());

  const featuresRef = useRef<GridFeature[]>([]);
  const selectedSigunguRef = useRef<SigunguFeature | null>(null);

  const sigunguFeaturesRef = useRef<SigunguFeature[]>([]);
  const indexRef = useRef<SigunguIndex | null>(null);

  const selectionStartRef = useRef<L.LatLng | null>(null);
  const selectionActiveRef = useRef(false);
  const selectionModeRef = useRef(false);

  const [sigunguReady, setSigunguReady] = useState(false);
  const [selectedSigungu, setSelectedSigungu] =
    useState<SigunguFeature | null>(null);

  const [selectedIndexItem, setSelectedIndexItem] =
    useState<SigunguIndexItem | null>(null);

  const [features, setFeatures] = useState<GridFeature[]>([]);
  const [controlArea, setControlArea] = useState<ControlArea | null>(null);

  const [month, setMonth] = useState<ForecastMonth>(0);
  const [viewMode, setViewMode] = useState<ViewMode>("current");
  const [baseMapMode, setBaseMapMode] =
    useState<BaseMapMode>("base");

  const [selectionMode, setSelectionMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(8);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    selectedSigunguRef.current = selectedSigungu;
  }, [selectedSigungu]);

  const derivedById = useMemo(() => {
    const map = new Map<string, DerivedGrid>();

    for (const feature of features) {
      map.set(
        getGridId(feature),
        calculateDerived(feature, controlArea, month)
      );
    }

    return map;
  }, [features, controlArea, month]);

  const summary = useMemo(() => {
    const values = [...derivedById.values()];
    const selectedValues = values.filter((value) => value.selected);
    const target = selectedValues.length ? selectedValues : values;

    const average = (key: keyof DerivedGrid) => {
      if (!target.length) return 0;

      return (
        target.reduce(
          (sum, value) =>
            sum +
            (typeof value[key] === "number"
              ? Number(value[key])
              : 0),
          0
        ) / target.length
      );
    };

    const resolvedHighRisk = target.filter(
      (value) =>
        value.noControl >= 70 && value.control < 70
    ).length;

    return {
      selectedCount: selectedValues.length,
      selectedArea: selectedValues.length * 0.25,
      current: average("current"),
      noControl: average("noControl"),
      control: average("control"),
      reduction: average("reduction"),
      directCount: values.filter((value) => value.zone === "direct").length,
      buffer2Count: values.filter((value) => value.zone === "buffer2").length,
      buffer5Count: values.filter((value) => value.zone === "buffer5").length,
      resolvedHighRisk,
      suppressedArea:
        values.filter((value) => value.reduction >= 3).length * 0.25,
    };
  }, [derivedById]);

  useEffect(() => {
    Promise.all([
      fetch(SIGUNGU_BOUNDARY_PATH).then((response) => {
        if (!response.ok) throw new Error(`시군구 경계 ${response.status}`);
        return response.json();
      }),
      fetch(SIGUNGU_INDEX_PATH).then((response) => {
        if (!response.ok) throw new Error(`시군구 인덱스 ${response.status}`);
        return response.json();
      }),
    ])
      .then(([sigunguData, indexData]) => {
        sigunguFeaturesRef.current =
          (sigunguData.features || []) as SigunguFeature[];

        indexRef.current = indexData as SigunguIndex;
        setSigunguReady(true);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoadError(
          "시군구 경계 또는 simulation_sigungu/index.json을 불러오지 못했습니다."
        );
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [36.35, 127.7],
      zoom: 8,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: KOREA_BOUNDS,
      maxBoundsViscosity: 0.8,
      preferCanvas: true,
    });

    const base = L.tileLayer(BASE_URL, {
      maxZoom: 19,
      noWrap: true,
      bounds: KOREA_BOUNDS,
      attribution: VWORLD_KEY
        ? "VWorld"
        : "© OpenStreetMap contributors",
    });

    const satellite = L.tileLayer(SATELLITE_URL, {
      maxZoom: 19,
      noWrap: true,
      bounds: KOREA_BOUNDS,
      attribution: VWORLD_KEY ? "VWorld" : "Esri World Imagery",
    });

    const hybrid = L.tileLayer(HYBRID_URL, {
      maxZoom: 19,
      noWrap: true,
      bounds: KOREA_BOUNDS,
      attribution: VWORLD_KEY
        ? "VWorld"
        : "© OpenStreetMap contributors",
    });

    base.addTo(map);

    (map as any).__simulationLayers = {
      base,
      satellite,
      hybrid,
    };

    mapRef.current = map;

    map.on("zoomend", () => {
      setCurrentZoom(map.getZoom());
    });

    map.on("mousedown", (event: L.LeafletMouseEvent) => {
      if (
        !selectionModeRef.current ||
        map.getZoom() < GRID_MIN_ZOOM ||
        !selectedSigunguRef.current
      ) {
        return;
      }

      selectionActiveRef.current = true;
      selectionStartRef.current = event.latlng;

      previewLayerRef.current?.removeFrom(map);

      previewLayerRef.current = L.rectangle(
        L.latLngBounds(event.latlng, event.latlng),
        {
          color: "#2563eb",
          weight: 2,
          dashArray: "7 5",
          fillColor: "#2563eb",
          fillOpacity: 0.08,
        }
      ).addTo(map);
    });

    map.on("mousemove", (event: L.LeafletMouseEvent) => {
      if (
        !selectionActiveRef.current ||
        !selectionStartRef.current ||
        !previewLayerRef.current
      ) {
        return;
      }

      previewLayerRef.current.setBounds(
        L.latLngBounds(selectionStartRef.current, event.latlng)
      );
    });

    map.on("mouseup", (event: L.LeafletMouseEvent) => {
      if (
        !selectionActiveRef.current ||
        !selectionStartRef.current
      ) {
        return;
      }

      selectionActiveRef.current = false;

      const bounds = L.latLngBounds(
        selectionStartRef.current,
        event.latlng
      );

      selectionStartRef.current = null;

      const selectedIds = new Set(
        featuresRef.current
          .filter((feature) => {
            const center = getCenter(feature);
            return center
              ? bounds.contains(L.latLng(center[0], center[1]))
              : false;
          })
          .map(getGridId)
      );

      if (!selectedIds.size) {
        previewLayerRef.current?.removeFrom(map);
        previewLayerRef.current = null;
        return;
      }

      setControlArea({
        bounds,
        selectedIds,
      });

      setMonth(0);
      setViewMode("current");
      setSelectionMode(false);
    });

    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    selectionModeRef.current = selectionMode;

    const map = mapRef.current;
    if (!map) return;

    if (selectionMode) {
      map.dragging.disable();
      map.getContainer().style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = "";
    }
  }, [selectionMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers = (map as any).__simulationLayers;
    if (!layers) return;

    if (baseMapMode === "base") {
      map.removeLayer(layers.satellite);
      map.removeLayer(layers.hybrid);
      if (!map.hasLayer(layers.base)) {
        layers.base.addTo(map);
      }
    } else {
      map.removeLayer(layers.base);

      if (!map.hasLayer(layers.satellite)) {
        layers.satellite.addTo(map);
      }

      if (!map.hasLayer(layers.hybrid)) {
        layers.hybrid.addTo(map);
      }
    }

    gridLayerRef.current?.bringToFront();
    sigunguLayerRef.current?.bringToFront();
  }, [baseMapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sigunguReady) return;

    sigunguLayerRef.current?.removeFrom(map);
    sigunguLayerRef.current = null;

    if (currentZoom > SIGUNGU_MAX_ZOOM) return;

    const selectedCode = selectedSigungu
      ? getSigunguCode(selectedSigungu.properties || {})
      : "";

    const layer = L.geoJSON(
      {
        type: "FeatureCollection",
        features: sigunguFeaturesRef.current,
      } as GeoJSON.FeatureCollection,
      {
        style: (feature: any) => {
          const code = getSigunguCode(feature?.properties || {});
          const selected = Boolean(selectedCode) && code === selectedCode;

          return {
            color: selected ? "#0f766e" : "#64748b",
            weight: selected ? 2.5 : 1,
            fillColor: selected ? "#14b8a6" : "#f8fafc",
            fillOpacity: selected ? 0.24 : 0.08,
          };
        },
        onEachFeature: (feature: any, featureLayer) => {
          const code = getSigunguCode(feature.properties || {});
          const name = getSigunguName(feature.properties || {});

          featureLayer.bindTooltip(name, {
            sticky: true,
          });

          featureLayer.on("click", async () => {
            const indexItem = indexRef.current?.items.find(
              (item) =>
                item.code === code ||
                item.name === name
            );

            if (!indexItem) {
              setLoadError(
                `${name}에 대응하는 시뮬레이션 파일을 index.json에서 찾지 못했습니다.`
              );
              return;
            }

            setLoading(true);
            setLoadError("");
            setPlaying(false);
            setMonth(0);
            setViewMode("current");
            setControlArea(null);
            setSelectedSigungu(feature as SigunguFeature);
            setSelectedIndexItem(indexItem);

            try {
              let nextFeatures = gridCacheRef.current.get(indexItem.code);

              if (!nextFeatures) {
                const response = await fetch(
                  `${SIGUNGU_DATA_BASE}/${indexItem.file}`
                );

                if (!response.ok) {
                  throw new Error(`${indexItem.file}: ${response.status}`);
                }

                const data = await response.json();
                nextFeatures = (data.features || []) as GridFeature[];
                gridCacheRef.current.set(indexItem.code, nextFeatures);
              }

              setFeatures(nextFeatures);
              setLoading(false);

              const bounds = L.latLngBounds(
                L.latLng(indexItem.bounds[1], indexItem.bounds[0]),
                L.latLng(indexItem.bounds[3], indexItem.bounds[2])
              );

              /*
               * React 상태 갱신 직후에도 동일한 Leaflet map 인스턴스를 유지하므로
               * 제거된 지도에 fitBounds를 호출하는 문제가 발생하지 않습니다.
               */
              window.requestAnimationFrame(() => {
                const currentMap = mapRef.current;

                if (!currentMap) return;

                currentMap.fitBounds(bounds, {
                  padding: [24, 24],
                  maxZoom: GRID_MIN_ZOOM,
                  animate: false,
                });

                if (currentMap.getZoom() < GRID_MIN_ZOOM) {
                  currentMap.setZoom(GRID_MIN_ZOOM, {
                    animate: false,
                  });
                }
              });
            } catch (error) {
              console.error("시군구 격자 로딩 오류:", error);
              setLoadError(
                `${name} 격자 파일을 불러오지 못했습니다. 브라우저 Network에서 ${indexItem.file} 응답을 확인하세요.`
              );
              setLoading(false);
            }
          });
        },
      }
    ).addTo(map);

    sigunguLayerRef.current = layer;
  }, [sigunguReady, currentZoom, selectedSigungu]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    gridLayerRef.current?.removeFrom(map);
    gridLayerRef.current = null;
    featureLayerByIdRef.current.clear();

    if (!features.length || currentZoom < GRID_MIN_ZOOM) {
      return;
    }

    const layer = L.geoJSON(
      {
        type: "FeatureCollection",
        features,
      } as GeoJSON.FeatureCollection,
      {
        renderer: L.canvas({ padding: 0.25 }),
        style: () => ({
          color: "transparent",
          weight: 0,
          fillColor: "#fff7f7",
          fillOpacity: 0.03,
        }),
        onEachFeature: (feature: any, featureLayer) => {
          const id = getGridId(feature as GridFeature);
          featureLayerByIdRef.current.set(id, featureLayer as L.Path);
        },
      }
    ).addTo(map);

    gridLayerRef.current = layer;
  }, [features, currentZoom]);

  /*
   * 핵심 최적화:
   * 월·모드 변경 시 GeoJSON 레이어를 다시 만들지 않고 setStyle만 실행합니다.
   */
  useEffect(() => {
    for (const feature of features) {
      const id = getGridId(feature);
      const layer = featureLayerByIdRef.current.get(id);
      const derived = derivedById.get(id);

      if (!layer || !derived) continue;

      const props = feature.properties || {};
      const candidate =
        props.risk_candidate_flag === true ||
        Number(props.risk_candidate_flag) === 1;

      if (month > 0 && viewMode === "effect") {
        layer.setStyle({
          color: derived.selected ? "#1d4ed8" : "transparent",
          weight: derived.selected ? 1.6 : 0,
          fillColor: effectColor(derived.reduction),
          fillOpacity:
            derived.reduction <= 0.25
              ? 0.03
              : 0.18 +
                (clamp(derived.reduction, 0, 30) / 30) * 0.7,
        });

        continue;
      }

      const score = getDisplayScore(derived, month, viewMode);

      const percentile =
        month === 0 &&
        Number.isFinite(Number(props.risk_percentile))
          ? clamp(100 - Number(props.risk_percentile))
          : scoreToPercentile(score);

      layer.setStyle({
        color: derived.selected
          ? "#2563eb"
          : candidate
          ? "#991b1b"
          : "transparent",
        weight: derived.selected ? 1.8 : candidate ? 0.5 : 0,
        fillColor: riskColor(percentile),
        fillOpacity:
          0.03 + Math.pow(percentile / 100, 1.22) * 0.8,
      });

      layer.bindTooltip(
        `
          <div style="min-width:190px">
            <div style="font-weight:800;margin-bottom:5px">
              격자 ${id}
            </div>
            <div>현재 ${derived.current.toFixed(2)}점</div>
            <div>${month}개월 미방제 ${derived.noControl.toFixed(2)}점</div>
            <div>${month}개월 방제 적용 ${derived.control.toFixed(2)}점</div>
            <div>저감효과 ${derived.reduction.toFixed(2)}점</div>
          </div>
        `,
        {
          sticky: true,
        }
      );
    }
  }, [features, derivedById, month, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    directLayerRef.current?.removeFrom(map);
    buffer2LayerRef.current?.removeFrom(map);
    buffer5LayerRef.current?.removeFrom(map);

    if (!controlArea) return;

    const buffer2 = expandBoundsByKm(controlArea.bounds, 2);
    const buffer5 = expandBoundsByKm(controlArea.bounds, 5);

    buffer5LayerRef.current = L.rectangle(buffer5, {
      color: "#60a5fa",
      weight: 1.4,
      dashArray: "8 6",
      fillColor: "#93c5fd",
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(map);

    buffer2LayerRef.current = L.rectangle(buffer2, {
      color: "#3b82f6",
      weight: 1.7,
      dashArray: "6 4",
      fillColor: "#60a5fa",
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(map);

    directLayerRef.current = L.rectangle(controlArea.bounds, {
      color: "#1d4ed8",
      weight: 2.5,
      fillColor: "#2563eb",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
  }, [controlArea]);

  useEffect(() => {
    if (!playing) return;

    const timer = window.setInterval(() => {
      setMonth((previous) => {
        if (previous >= 6) {
          setPlaying(false);
          return 6;
        }

        return (previous + 1) as ForecastMonth;
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [playing]);

  function resetControl() {
    setControlArea(null);
    setMonth(0);
    setViewMode("current");
    setPlaying(false);
    setSelectionMode(false);

    const map = mapRef.current;
    if (map) {
      previewLayerRef.current?.removeFrom(map);
    }

    previewLayerRef.current = null;
  }

  function resetSigungu() {
    resetControl();
    setFeatures([]);
    setSelectedSigungu(null);
    setSelectedIndexItem(null);

    mapRef.current?.setView([36.35, 127.7], 8);
  }

  return (
    <div className="bg-white rounded-[28px] shadow-sm border border-[#E5E7EB] p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-[30px] font-extrabold text-[#1F2937]">
            확산위험 방제 시뮬레이션
          </h2>

          <p className="mt-2 text-[15px] text-[#94A3B8]">
            시군구별 경량 파일을 불러와 빠르게 표시하고,
            월 변경 시 기존 격자의 색상만 갱신합니다.
          </p>
        </div>

        <div className="flex gap-2 bg-[#F3F4F6] rounded-xl p-1">
          <button
            type="button"
            onClick={() => setBaseMapMode("base")}
            className={
              baseMapMode === "base"
                ? "px-4 py-2 rounded-lg bg-white shadow font-bold"
                : "px-4 py-2 rounded-lg text-[#64748B] font-bold"
            }
          >
            일반지도
          </button>

          <button
            type="button"
            onClick={() => setBaseMapMode("satellite")}
            className={
              baseMapMode === "satellite"
                ? "px-4 py-2 rounded-lg bg-white shadow font-bold"
                : "px-4 py-2 rounded-lg text-[#64748B] font-bold"
            }
          >
            위성지도
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="px-4 py-2 rounded-xl bg-[#F8FAFC] border text-sm">
          시군구{" "}
          <b className="text-[#0F766E]">
            {selectedIndexItem?.name ?? "미선택"}
          </b>
        </div>

        <button
          type="button"
          disabled={!features.length}
          onClick={() => setSelectionMode((value) => !value)}
          className={
            features.length
              ? selectionMode
                ? "px-4 py-2 rounded-xl bg-[#2563EB] text-white font-bold"
                : "px-4 py-2 rounded-xl border font-bold"
              : "px-4 py-2 rounded-xl bg-[#F1F5F9] text-[#94A3B8] font-bold"
          }
        >
          {selectionMode ? "방제 구역 선택 중" : "방제 구역 선택"}
        </button>

        <button
          type="button"
          disabled={!controlArea}
          onClick={() => {
            if (!controlArea) return;

            if (playing) {
              setPlaying(false);
              return;
            }

            if (month >= 6) {
              setMonth(0);
              window.setTimeout(() => setPlaying(true), 200);
              return;
            }

            setPlaying(true);
          }}
          className={
            controlArea
              ? "px-4 py-2 rounded-xl bg-[#0F766E] text-white font-bold"
              : "px-4 py-2 rounded-xl bg-[#F1F5F9] text-[#94A3B8] font-bold"
          }
        >
          {playing ? "⏸ 일시정지" : "▶ 시뮬레이션 재생"}
        </button>

        <button
          type="button"
          onClick={resetControl}
          className="px-4 py-2 rounded-xl border font-bold text-[#64748B]"
        >
          방제 선택 초기화
        </button>

        <button
          type="button"
          onClick={resetSigungu}
          className="px-4 py-2 rounded-xl border font-bold text-[#64748B]"
        >
          시군구 다시 선택
        </button>

        <div className="ml-auto text-sm text-[#64748B]">
          표시 격자{" "}
          <b className="text-[#111827]">
            {features.length.toLocaleString("ko-KR")}
          </b>
          개
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-9">
          <div className="relative overflow-hidden rounded-[20px] border bg-[#EEF7F3]">
            <div
              ref={mapContainerRef}
              style={{ width: "100%", height: 650 }}
            />

            {loading && (
              <div className="absolute z-[700] left-1/2 top-4 -translate-x-1/2 rounded-full bg-white px-5 py-2 shadow font-bold text-sm">
                데이터를 불러오는 중입니다.
              </div>
            )}

            {loadError && (
              <div className="absolute z-[710] left-4 right-4 top-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 font-bold text-sm">
                {loadError}
              </div>
            )}

            {currentZoom <= SIGUNGU_MAX_ZOOM && (
              <div className="absolute z-[650] left-1/2 top-4 -translate-x-1/2 rounded-full bg-white px-5 py-2 shadow font-bold text-sm">
                지도에서 분석할 시군구를 선택하세요
              </div>
            )}

            {selectionMode && (
              <div className="absolute z-[660] left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#2563EB] text-white px-5 py-2 shadow font-bold text-sm">
                직접 방제할 구역을 드래그하세요
              </div>
            )}
          </div>

          <div className="mt-4 rounded-[18px] border bg-[#F8FAFC] p-4">
            <div className="grid grid-cols-4 gap-2 mb-4">
              {(
                [
                  ["current", "현재 위험도"],
                  ["noControl", "미방제 미래"],
                  ["control", "방제 적용"],
                  ["effect", "방제 효과"],
                ] as [ViewMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={
                    viewMode === mode
                      ? mode === "noControl"
                        ? "py-3 rounded-xl bg-[#B91C1C] text-white font-extrabold"
                        : "py-3 rounded-xl bg-[#0F766E] text-white font-extrabold"
                      : "py-3 rounded-xl bg-white border text-[#64748B] font-bold"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {MONTHS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMonth(value);
                    if (value === 0) {
                      setPlaying(false);
                    }
                  }}
                  className={
                    month === value
                      ? "py-3 rounded-xl bg-[#0F766E] text-white font-extrabold"
                      : "py-3 rounded-xl bg-white border text-[#64748B] font-bold"
                  }
                >
                  {value === 0 ? "현재" : `${value}개월`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="col-span-3 space-y-4">
          <div className="rounded-[20px] border p-5">
            <h3 className="font-extrabold text-lg mb-4">시뮬레이션 조건</h3>
            <InfoRow label="선택 시군구" value={selectedIndexItem?.name ?? "-"} />
            <InfoRow label="시점" value={month === 0 ? "현재" : `${month}개월 후`} />
            <InfoRow label="직접 방제" value={`${summary.directCount.toLocaleString("ko-KR")}개`} />
            <InfoRow label="2km 영향권" value={`${summary.buffer2Count.toLocaleString("ko-KR")}개`} />
            <InfoRow label="5km 영향권" value={`${summary.buffer5Count.toLocaleString("ko-KR")}개`} />
          </div>

          <div className="rounded-[20px] border bg-[#F8FAFC] p-5">
            <h3 className="font-extrabold text-lg mb-4">위험 변화</h3>
            <Metric label="현재 평균" value={`${summary.current.toFixed(1)}점`} />
            <Metric label="미방제" value={`${summary.noControl.toFixed(1)}점`} danger />
            <Metric label="방제 적용" value={`${summary.control.toFixed(1)}점`} safe />

            <div className="grid grid-cols-2 gap-2 mt-3">
              <SmallMetric label="평균 저감" value={`${summary.reduction.toFixed(1)}점`} />
              <SmallMetric label="고위험 해소" value={`${summary.resolvedHighRisk.toLocaleString("ko-KR")}개`} />
              <SmallMetric label="선택 면적" value={`${summary.selectedArea.toFixed(2)}㎢`} />
              <SmallMetric label="억제 면적" value={`${summary.suppressedArea.toFixed(1)}㎢`} />
            </div>
          </div>

          <div className="rounded-[20px] border border-[#DCEAE5] bg-[#F0FDF4] p-5">
            <h3 className="font-extrabold text-[#14532D] text-lg mb-2">
              AI 종합 해석
            </h3>

            <p className="text-sm leading-6 text-[#3F5F4D]">
              {month === 0
                ? "현재 시점에서는 선택한 비교 모드와 관계없이 현재 위험분포를 유지합니다. 시뮬레이션 재생 후 1개월부터 선택한 모드가 적용됩니다."
                : viewMode === "control"
                ? `직접 방제구역은 방제 완료 가정으로 0점 처리되고, 주변 2km·5km는 거리별로 상대위험이 감소합니다.`
                : viewMode === "effect"
                ? `미방제 대비 평균 ${summary.reduction.toFixed(1)}점의 상대위험 저감효과를 표시합니다.`
                : `선택 지역의 ${month}개월 후 상대위험 변화를 표시합니다.`}
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-5 rounded-[18px] border bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
        위험점수는 실제 감염확률이 아닌 상대위험 점수이며,
        월별 결과는 방제 의사결정을 위한 시나리오입니다.
      </div>
    </div>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b">
      <span className="text-[#64748B]">{props.label}</span>
      <span className="font-bold">{props.value}</span>
    </div>
  );
}

function Metric(props: {
  label: string;
  value: string;
  danger?: boolean;
  safe?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white border p-3 mb-2">
      <div className="text-xs text-[#64748B]">{props.label}</div>
      <div
        className={
          props.danger
            ? "text-xl font-extrabold text-[#B91C1C]"
            : props.safe
            ? "text-xl font-extrabold text-[#0F766E]"
            : "text-xl font-extrabold"
        }
      >
        {props.value}
      </div>
    </div>
  );
}

function SmallMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border p-3">
      <div className="text-[11px] text-[#64748B]">{props.label}</div>
      <div className="text-sm font-extrabold">{props.value}</div>
    </div>
  );
}
