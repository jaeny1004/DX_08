import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type BaseMapMode = "base" | "satellite";
type ViewMode = "risk" | "priority";
type TileStatus = "loading" | "success" | "error" | "fallback";

const VWORLD_KEY = String(
  import.meta.env.VITE_VWORLD_API_KEY ?? ""
).trim();

const HAS_VWORLD_KEY = VWORLD_KEY.length > 0;

/**
 * VWorld WMTS URL
 *
 * 주의:
 * VWorld REST 경로는 {z}/{y}/{x} 순서를 사용한다.
 * 일반적인 OSM 타일의 {z}/{x}/{y}와 순서가 다르다.
 */
const VWORLD_BASE_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/` +
  `${VWORLD_KEY}/Base/{z}/{y}/{x}.png`;

const VWORLD_SATELLITE_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/` +
  `${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`;

const VWORLD_HYBRID_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/` +
  `${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`;

/**
 * VWorld 키가 없을 때만 사용하는 대체 지도
 */
const OSM_BASE_URL =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/" +
  "World_Imagery/MapServer/tile/{z}/{y}/{x}";

const GEOJSON_PATH = "/data/final_ui_candidate_v4.geojson";

const ADVICE_API_BASE = String(
  import.meta.env.VITE_ADVICE_API_BASE ??
    "http://127.0.0.1:8787"
).replace(/\/$/, "");

const KOREA_BOUNDS = L.latLngBounds(
  L.latLng(32.5, 124.0),
  L.latLng(39.8, 132.2)
);

const riskColors: Record<string, string> = {
  "매우 높음": "#ff2b57",
  높음: "#ff9f0a",
  주의: "#ffcc00",
  관찰: "#1fc16b",
  낮음: "#d9d9d9",
};

const priorityColors: Record<string, string> = {
  "최우선 예찰": "#ff2b57",
  "우선 예찰": "#ff9f0a",
  "집중 관찰": "#ffcc00",
  "정기 관찰": "#1fc16b",
  "일반 관리": "#d9d9d9",
};

function formatNumber(value: unknown, digit = 1) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "-";
  }

  return numberValue.toLocaleString("ko-KR", {
    maximumFractionDigits: digit,
  });
}

function getRiskColor(grade: string) {
  return riskColors[grade] ?? "#cccccc";
}

function getPriorityColor(grade: string) {
  return priorityColors[grade] ?? "#cccccc";
}

/**
 * Jenks 기반 위험도 라벨을 UI 표시용 라벨로 변환
 */
function normalizeRiskGrade(props: any) {
  const label = props?.risk_stage_label;

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
      return props?.risk_grade ?? "낮음";
  }
}

/**
 * Jenks 기반 예찰 라벨을 UI 표시용 라벨로 변환
 */
function normalizePriorityGrade(props: any) {
  const label = props?.priority_stage_label;

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
      return (
        props?.field_priority_grade_v3 ??
        props?.priority_grade_v3 ??
        "일반 관리"
      );
  }
}

function getDisplayGrade(
  props: any,
  viewMode: ViewMode
) {
  if (viewMode === "risk") {
    return normalizeRiskGrade(props);
  }

  return normalizePriorityGrade(props);
}

function getDisplayColor(
  props: any,
  viewMode: ViewMode
) {
  const grade = getDisplayGrade(props, viewMode);

  if (viewMode === "risk") {
    return getRiskColor(grade);
  }

  return getPriorityColor(grade);
}

function isLowDisplayGrade(
  props: any,
  viewMode: ViewMode
) {
  const grade = getDisplayGrade(props, viewMode);

  if (viewMode === "risk") {
    return grade === "낮음";
  }

  return grade === "일반 관리";
}

function getGridStyle(
  props: any,
  viewMode: ViewMode,
  baseMapMode: BaseMapMode
): L.PathOptions {
  const color = getDisplayColor(props, viewMode);
  const isLow = isLowDisplayGrade(props, viewMode);

  const activeFillOpacity =
    baseMapMode === "satellite" ? 0.42 : 0.72;

  const lowFillOpacity =
    baseMapMode === "satellite" ? 0.02 : 0.05;

  return {
    color: isLow ? "transparent" : color,
    weight:
      isLow
        ? 0
        : baseMapMode === "satellite"
          ? 0.75
          : 0.6,
    fillColor: color,
    fillOpacity:
      isLow
        ? lowFillOpacity
        : activeFillOpacity,
  };
}

interface DashboardRiskMapCardProps {
  onGridSelect?: (grid: any) => void;
}

export default function DashboardRiskMapCard({
  onGridSelect,
}: DashboardRiskMapCardProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  const leafletMapRef =
    useRef<L.Map | null>(null);

  const geoJsonLayerRef =
    useRef<L.GeoJSON | null>(null);

  const vworldBaseLayerRef =
    useRef<L.TileLayer | null>(null);

  const vworldSatelliteLayerRef =
    useRef<L.TileLayer | null>(null);

  const vworldHybridLayerRef =
    useRef<L.TileLayer | null>(null);

  const hasFittedBoundsRef =
    useRef(false);

  const tileErrorCountRef =
    useRef(0);

  const [geojson, setGeojson] =
    useState<any>(null);

  const [geojsonError, setGeojsonError] =
    useState("");

  const [viewMode, setViewMode] =
    useState<ViewMode>("risk");

  const [baseMapMode, setBaseMapMode] =
    useState<BaseMapMode>("base");

  const [selected, setSelected] =
    useState<any>(null);

  const [aiAdvice, setAiAdvice] =
    useState("");

  const [adviceLoading, setAdviceLoading] =
    useState(false);

  const [tileStatus, setTileStatus] =
    useState<TileStatus>(
      HAS_VWORLD_KEY ? "loading" : "fallback"
    );

  const [tileErrorMessage, setTileErrorMessage] =
    useState(
      HAS_VWORLD_KEY
        ? ""
        : "VWorld API 키가 없어 대체 배경지도를 표시합니다."
    );

  /**
   * VWorld API 키 확인
   */
  useEffect(() => {
    if (!HAS_VWORLD_KEY) {
      console.warn(
        "VITE_VWORLD_API_KEY가 없습니다. " +
          "프로젝트 루트 .env 파일을 확인하세요."
      );

      return;
    }

    console.log(
      "VWorld API 키 감지 완료:",
      `${VWORLD_KEY.slice(0, 4)}****`
    );
  }, []);

  /**
   * GeoJSON 로드
   */
  useEffect(() => {
    const controller = new AbortController();

    async function loadGeoJson() {
      try {
        setGeojsonError("");

        const response = await fetch(
          GEOJSON_PATH,
          {
            cache: "no-cache",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `GeoJSON load failed: ${response.status}`
          );
        }

        const data = await response.json();

        if (
          !data ||
          !Array.isArray(data.features)
        ) {
          throw new Error(
            "올바른 GeoJSON FeatureCollection이 아닙니다."
          );
        }

        console.log(
          "GeoJSON loaded:",
          data.features.length,
          "features"
        );

        console.log(
          "First feature properties:",
          data.features[0]?.properties
        );

        setGeojson(data);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
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

    loadGeoJson();

    return () => {
      controller.abort();
    };
  }, []);

  /**
   * Leaflet 지도 최초 생성
   */
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
        center: [36.35, 127.7],
        zoom: 7,
        minZoom: 6,
        maxZoom: 19,
        maxBounds: KOREA_BOUNDS,
        maxBoundsViscosity: 0.9,
        zoomControl: true,
        preferCanvas: true,
        attributionControl: true,
      }
    );

    /**
     * API 키가 있을 때 VWorld,
     * 없을 때 대체 배경지도 사용
     */
    const baseUrl =
      HAS_VWORLD_KEY
        ? VWORLD_BASE_URL
        : OSM_BASE_URL;

    const satelliteUrl =
      HAS_VWORLD_KEY
        ? VWORLD_SATELLITE_URL
        : ESRI_SATELLITE_URL;

    const baseLayer = L.tileLayer(
      baseUrl,
      {
        attribution:
          HAS_VWORLD_KEY
            ? "© VWorld"
            : "© OpenStreetMap contributors",

        minZoom: 6,
        maxZoom: 19,
        bounds: KOREA_BOUNDS,
        noWrap: true,
        updateWhenIdle: true,
        keepBuffer: 2,
        crossOrigin: true,
      }
    );

    const satelliteLayer = L.tileLayer(
      satelliteUrl,
      {
        attribution:
          HAS_VWORLD_KEY
            ? "© VWorld"
            : "Tiles © Esri",

        minZoom: 6,
        maxZoom: 19,
        bounds: KOREA_BOUNDS,
        noWrap: true,
        updateWhenIdle: true,
        keepBuffer: 2,
        crossOrigin: true,
      }
    );

    const hybridLayer = L.tileLayer(
      VWORLD_HYBRID_URL,
      {
        attribution: "© VWorld",
        minZoom: 6,
        maxZoom: 19,
        bounds: KOREA_BOUNDS,
        noWrap: true,
        updateWhenIdle: true,
        keepBuffer: 2,
        crossOrigin: true,
        opacity:
          HAS_VWORLD_KEY ? 1 : 0,
      }
    );

    function handleTileLoad() {
      if (!HAS_VWORLD_KEY) {
        return;
      }

      setTileStatus("success");
      setTileErrorMessage("");
    }

    function handleTileError(event: any) {
      if (!HAS_VWORLD_KEY) {
        return;
      }

      tileErrorCountRef.current += 1;

      console.error(
        "VWorld tile load error:",
        event
      );

      if (tileErrorCountRef.current >= 3) {
        setTileStatus("error");

        setTileErrorMessage(
          "VWorld 배경지도를 불러오지 못했습니다. " +
            "API 키, 허용 도메인, Network 응답을 확인하세요."
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

    leafletMapRef.current = map;

    window.setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      baseLayer.off();
      satelliteLayer.off();
      hybridLayer.off();

      map.remove();

      leafletMapRef.current = null;
      vworldBaseLayerRef.current = null;
      vworldSatelliteLayerRef.current = null;
      vworldHybridLayerRef.current = null;
      geoJsonLayerRef.current = null;
    };
  }, []);

  /**
   * 일반지도 / 위성지도 전환
   */
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

    tileErrorCountRef.current = 0;

    if (HAS_VWORLD_KEY) {
      setTileStatus("loading");
    }

    if (baseMapMode === "base") {
      if (map.hasLayer(satelliteLayer)) {
        map.removeLayer(satelliteLayer);
      }

      if (map.hasLayer(hybridLayer)) {
        map.removeLayer(hybridLayer);
      }

      if (!map.hasLayer(baseLayer)) {
        baseLayer.addTo(map);
      }
    } else {
      if (map.hasLayer(baseLayer)) {
        map.removeLayer(baseLayer);
      }

      if (!map.hasLayer(satelliteLayer)) {
        satelliteLayer.addTo(map);
      }

      /**
       * VWorld 위성지도에서는
       * Hybrid 라벨 레이어를 함께 표시
       */
      if (
        HAS_VWORLD_KEY &&
        !map.hasLayer(hybridLayer)
      ) {
        hybridLayer.addTo(map);
      }
    }

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.bringToFront();
    }

    window.setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [baseMapMode]);

  /**
   * 위험도 / 예찰 우선순위 격자 렌더링
   */
  useEffect(() => {
    const map =
      leafletMapRef.current;

    if (!map || !geojson) {
      return;
    }

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.removeFrom(map);
      geoJsonLayerRef.current = null;
    }

    const canvasRenderer = L.canvas({
      padding: 0.3,
    });

    const layer = L.geoJSON(
      geojson,
      {
        renderer: canvasRenderer,

        style: (feature: any) => {
          const properties =
            feature?.properties ?? {};

          return getGridStyle(
            properties,
            viewMode,
            baseMapMode
          );
        },

        onEachFeature: (
          feature: any,
          featureLayer: L.Layer
        ) => {
          const interactiveLayer =
            featureLayer as L.Path;

          interactiveLayer.on({
            click: () => {
              const properties =
                feature?.properties ?? {};

              setSelected(properties);
              onGridSelect?.(properties);

              console.log(
                "지도 선택 격자 전달:",
                properties
              );

              setAdviceLoading(false);
              setAiAdvice(
                properties.field_recommended_action_v3 ??
                  "선택한 격자의 위험도·예찰 우선순위와 관련 백서 근거는 챗봇에서 통합 분석할 수 있습니다."
              );
            },

            mouseover: () => {
              interactiveLayer.setStyle({
                weight: 2,
                fillOpacity:
                  baseMapMode === "satellite"
                    ? 0.58
                    : 0.88,
              });
            },

            mouseout: () => {
              geoJsonLayerRef.current?.resetStyle(
                interactiveLayer
              );
            },
          });
        },
      }
    ).addTo(map);

    geoJsonLayerRef.current = layer;

    layer.bringToFront();

    /**
     * 최초 1회만 데이터 범위에 맞춤
     */
    if (!hasFittedBoundsRef.current) {
      const bounds = layer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(
          bounds,
          {
            padding: [20, 20],
            animate: false,
            maxZoom: 9,
          }
        );

        hasFittedBoundsRef.current = true;
      }
    }

    window.setTimeout(() => {
      map.invalidateSize();
    }, 300);
  }, [
    geojson,
    viewMode,
    baseMapMode,
  ]);

  const selectedRiskGrade =
    selected
      ? normalizeRiskGrade(selected)
      : "-";

  const selectedPriorityGrade =
    selected
      ? normalizePriorityGrade(selected)
      : "-";

  const currentMapLabel =
    HAS_VWORLD_KEY
      ? baseMapMode === "base"
        ? "VWorld 일반지도"
        : "VWorld 위성지도"
      : baseMapMode === "base"
        ? "OpenStreetMap 대체지도"
        : "Esri 위성 대체지도";

  return (
    <div className="bg-white rounded-[28px] shadow-sm border border-[#E5E7EB] p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-[30px] font-extrabold text-[#1F2937] leading-tight">
            🗺️ 500m 격자 위험도 히트맵 및 확산 감시 지형
          </h2>

          <p className="text-[#94A3B8] mt-2 text-[15px]">
            500m 격자 기반 AI 위험도와 현장 예찰
            우선순위를 지도에서 확인합니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex gap-2 bg-[#F3F4F6] rounded-xl p-1">
            <button
              type="button"
              onClick={() =>
                setViewMode("risk")
              }
              className={
                viewMode === "risk"
                  ? "px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#111827] shadow"
                  : "px-4 py-2 rounded-lg text-sm font-semibold text-[#6B7280]"
              }
            >
              AI 위험도
            </button>

            <button
              type="button"
              onClick={() =>
                setViewMode("priority")
              }
              className={
                viewMode === "priority"
                  ? "px-4 py-2 rounded-lg text-sm font-semibold bg-white text-[#111827] shadow"
                  : "px-4 py-2 rounded-lg text-sm font-semibold text-[#6B7280]"
              }
            >
              AI 예찰 우선순위
            </button>
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
      </div>

      {tileStatus === "error" && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-bold">
            VWorld 지도 연결 오류
          </div>

          <div className="mt-1">
            {tileErrorMessage}
          </div>

          <div className="mt-1 text-xs">
            F12 → Network에서
            `api.vworld.kr` 요청의 상태코드를 확인하세요.
          </div>
        </div>
      )}

      {tileStatus === "fallback" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {tileErrorMessage}
        </div>
      )}

      {geojsonError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {geojsonError}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8">
          <div className="relative">
            <div
              ref={mapRef}
              className="rounded-[22px] overflow-hidden border border-[#DDE5E2] bg-[#EEF7F3]"
              style={{
                height: 520,
                width: "100%",
              }}
            />

            {tileStatus === "loading" && (
              <div className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-[#475569] shadow">
                VWorld 지도 불러오는 중...
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap gap-3">
              {viewMode === "risk" ? (
                <>
                  <Legend
                    color="#ff2b57"
                    label="매우 높음"
                  />

                  <Legend
                    color="#ff9f0a"
                    label="높음"
                  />

                  <Legend
                    color="#ffcc00"
                    label="주의"
                  />

                  <Legend
                    color="#1fc16b"
                    label="관찰"
                  />
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className="text-xs font-semibold text-[#64748B]">
              배경지도:{" "}
              <span className="text-[#111827]">
                {currentMapLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="col-span-4">
          <div className="rounded-[22px] border border-[#E5E7EB] p-5 bg-[#FBFBFC] min-h-[520px]">
            <h3 className="text-[22px] font-bold text-[#1F2937] mb-4">
              {viewMode === "risk"
                ? "AI 위험도 상세"
                : "AI 예찰 우선순위 상세"}
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
                    Number(
                      selected.pine_ratio ?? 0
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
                    Number(
                      selected.environment_caution_flag_v3 ??
                        selected.env_flag
                    ) === 1
                      ? "필요"
                      : "해당 없음"
                  }
                />

                <div className="mt-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] p-4">
                  <div className="font-bold text-[#1D4ED8] mb-2">
                    위성지도 기반 현장 확인 포인트
                  </div>

                  <div className="text-[13px] leading-6 text-[#1E3A8A] mb-2">
                    {baseMapMode === "satellite"
                      ? "현재 위성지도에서 실제 산림·도로·하천 맥락을 함께 확인할 수 있습니다."
                      : "위성지도 버튼을 누르면 해당 격자의 실제 산림·도로·하천 맥락을 확인할 수 있습니다."}
                  </div>

                  <ul className="text-[14px] leading-6 text-[#1E3A8A] list-disc pl-5">
                    <li>
                      실제 산림 연속성과 주변 식생 분포 확인
                    </li>

                    <li>
                      도로·임도 접근 가능성과 현장 진입 경로 검토
                    </li>

                    <li>
                      하천·마을 인접 여부에 따른 방제 주의사항 확인
                    </li>

                    <li>
                      AI 위험도와 실제 지형 맥락의 일치 여부 검토
                    </li>
                  </ul>
                </div>

                <div className="mt-5 rounded-xl bg-[#FFF7E8] border border-[#F5D28C] p-4">
                  <div className="font-bold text-[#7C5A14] mb-2">
                    생성형 AI 권장 조치
                  </div>

                  <div className="text-[14px] leading-6 text-[#5B4A1F] whitespace-pre-line">
                    {adviceLoading
                      ? "AI가 해당 격자의 위험도, 접근성, 감염압력 정보를 분석하고 있습니다..."
                      : aiAdvice ||
                        selected.field_recommended_action_v3 ||
                        "권장 조치 정보 없음"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-[#94A3B8] leading-7 min-h-[430px]">
                지도에서 격자를 클릭하면
                <br />
                AI 위험도, 예찰 우선순위,
                <br />
                접근성, 환경주의, 권장 조치가
                표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAFC] p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-[#334155]">
            🛰️ 위성지도 기반 현장 맥락 확인
          </div>

          <div className="text-sm text-[#94A3B8] mt-1">
            일반지도와 VWorld 위성지도를 전환하여
            AI 위험 격자의 실제 산림, 도로, 하천,
            주변 지형 맥락을 확인할 수 있습니다.
          </div>
        </div>

        <div className="text-sm font-bold text-[#0F766E]">
          2023 평가 결과 표시 중
        </div>
      </div>
    </div>
  );
}

function Legend(props: {
  color: string;
  label: string;
}) {
  const { color, label } = props;

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-3.5 h-3.5 rounded-full"
        style={{
          backgroundColor: color,
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
  const { label, value } = props;

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