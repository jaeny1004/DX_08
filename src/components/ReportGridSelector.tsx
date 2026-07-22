import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type GridFeature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;

interface ReportGridSelectorProps {
  sidoName: string;
  sigunguName: string;
  selectedGridId: string;
  onSidoChange: (value: string) => void;
  onSigunguChange: (value: string) => void;
  onGridSelect: (gridId: string) => void;
}

const GEOJSON_PATH = "/data/final_ui_candidate_v4.geojson";
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const KOREA_CENTER: [number, number] = [36.2, 127.8];

const SIDO_KEYS = ["sido_name", "sido", "ctpv_nm", "SIDO_NM"];
const SIGUNGU_KEYS = ["sigungu_name", "sigungu", "sgg_nm", "SIGUNGU_NM"];
const GRID_KEYS = ["grid_id", "id", "GRID_ID"];

function pick(props: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = props[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim().replace(/\.0$/, "");
    }
  }
  return "";
}

function riskColor(props: Record<string, unknown>): string {
  const grade = String(
    props.risk_grade ?? props.risk_stage_label ?? "",
  ).trim();

  if (grade.includes("매우 높음") || grade.includes("1순위")) return "#ff2b57";
  if (grade.includes("높음") || grade.includes("2순위")) return "#ff9f0a";
  if (grade.includes("주의") || grade.includes("3순위")) return "#ffcc00";
  if (grade.includes("관찰") || grade.includes("4순위")) return "#1fc16b";
  return "#94a3b8";
}

export default function ReportGridSelector({
  sidoName,
  sigunguName,
  selectedGridId,
  onSidoChange,
  onSigunguChange,
  onGridSelect,
}: ReportGridSelectorProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [features, setFeatures] = useState<GridFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(GEOJSON_PATH)
      .then((response) => {
        if (!response.ok) throw new Error(`격자 데이터를 불러오지 못했습니다. (${response.status})`);
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) {
          setFeatures(Array.isArray(payload?.features) ? payload.features : []);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "격자 데이터 오류");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sidos = useMemo(
    () => Array.from(new Set(features.map((feature) => pick(feature.properties || {}, SIDO_KEYS)).filter(Boolean))).sort(),
    [features],
  );

  const sigungus = useMemo(
    () => Array.from(new Set(
      features
        .filter((feature) => pick(feature.properties || {}, SIDO_KEYS) === sidoName)
        .map((feature) => pick(feature.properties || {}, SIGUNGU_KEYS))
        .filter(Boolean),
    )).sort(),
    [features, sidoName],
  );

  const regionFeatures = useMemo(
    () => features.filter((feature) => {
      const props = feature.properties || {};
      return (
        (!sidoName || pick(props, SIDO_KEYS) === sidoName) &&
        (!sigunguName || pick(props, SIGUNGU_KEYS) === sigunguName)
      );
    }),
    [features, sidoName, sigunguName],
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = L.map(mapElementRef.current, {
      preferCanvas: true,
      zoomControl: true,
    }).setView(KOREA_CENTER, 7);

    L.tileLayer(OSM_URL, {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }

    if (!sidoName || !sigunguName || regionFeatures.length === 0) return;

    const layer = L.geoJSON(
      { type: "FeatureCollection", features: regionFeatures } as GeoJSON.FeatureCollection,
      {
        style: (feature) => {
          const props = (feature?.properties || {}) as Record<string, unknown>;
          const gridId = pick(props, GRID_KEYS);
          const selected = gridId === selectedGridId;
          return {
            color: selected ? "#0f172a" : "#ffffff",
            weight: selected ? 3 : 0.7,
            fillColor: riskColor(props),
            fillOpacity: selected ? 0.9 : 0.55,
          };
        },
        onEachFeature: (feature, featureLayer) => {
          const props = (feature.properties || {}) as Record<string, unknown>;
          const gridId = pick(props, GRID_KEYS);
          featureLayer.bindTooltip(`격자 ${gridId}`, { sticky: true });
          featureLayer.on("click", () => onGridSelect(gridId));
        },
      },
    ).addTo(map);

    layerRef.current = layer;
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [18, 18], maxZoom: 13 });
  }, [regionFeatures, sidoName, sigunguName, selectedGridId, onGridSelect]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-slate-600">
          시도
          <select
            value={sidoName}
            onChange={(event) => {
              onSidoChange(event.target.value);
              onSigunguChange("");
              onGridSelect("");
            }}
            disabled={loading}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-800 outline-none focus:border-emerald-400"
          >
            <option value="">시도 선택</option>
            {sidos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-600">
          시군구
          <select
            value={sigunguName}
            onChange={(event) => {
              onSigunguChange(event.target.value);
              onGridSelect("");
            }}
            disabled={!sidoName || loading}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-800 outline-none focus:border-emerald-400 disabled:bg-slate-100"
          >
            <option value="">시군구 선택</option>
            {sigungus.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <div ref={mapElementRef} className="h-[310px] w-full" />
      </div>

      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[11px]">
        <span className="text-slate-500">
          {loading ? "격자 데이터 불러오는 중" : error || `${sigunguName ? regionFeatures.length : 0}개 격자 표시`}
        </span>
        <strong className="text-emerald-900">
          {selectedGridId ? `선택 격자 ${selectedGridId}` : "지도에서 중심 격자 1개 선택"}
        </strong>
      </div>
    </div>
  );
}
