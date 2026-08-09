import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  CircleDot,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { MAP_TILE_CONFIG } from "../utils/mapTileConfig";
import {
  CA_STEPS,
  runRollout,
  toMonthlyFrames,
  type CaGrid,
  type CaWeights,
} from "../utils/caEngine";

const WEIGHTS_PATH = "/data/ca_sim/ca_weights.json";
const GRID_PATH = "/data/ca_sim/ca_grid.json";
const CELLS_PATH = "/data/ca_sim/pilot_cells.geojson";

/** 방제 반경 선택지(km). 간접 영향권은 직접 구역의 두 배로 잡는다. */
const RADIUS_OPTIONS_KM = [0.5, 1, 2, 3, 5];

/** 감염 확률을 붉은 계열 한 축으로 표현한다. */
function riskColor(probability: number): string {
  if (probability >= 0.75) return "#7f1d1d";
  if (probability >= 0.55) return "#b91c1c";
  if (probability >= 0.35) return "#ef4444";
  if (probability >= 0.18) return "#fb923c";
  return "#fed7aa";
}

function riskOpacity(probability: number): number {
  if (probability < 0.18) return 0.25;
  return 0.4 + Math.min(probability, 1) * 0.45;
}

interface CellFeature {
  row: number;
  column: number;
  gridId: number;
  seeded: boolean;
  layer: L.Path;
  index: number;
  latitude: number;
  longitude: number;
}

export default function SpreadSimulationCA() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const cellsRef = useRef<CellFeature[]>([]);
  const controlCircleRef = useRef<L.Circle | null>(null);
  const indirectCircleRef = useRef<L.Circle | null>(null);

  const [weights, setWeights] = useState<CaWeights | null>(null);
  const [grid, setGrid] = useState<CaGrid | null>(null);
  const [loadError, setLoadError] = useState("");

  const [frames, setFrames] = useState<Float32Array[]>([]);
  const [month, setMonth] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progressText, setProgressText] = useState("");

  // 방제 구역 중심. 지도를 클릭해 옮긴다.
  const [controlCenter, setControlCenter] =
    useState<{ lat: number; lng: number } | null>(null);
  const [controlApplied, setControlApplied] = useState(false);
  const [radiusKm, setRadiusKm] = useState(2);

  /**
   * 방제 전후를 나란히 보기 위해 기본 시나리오 결과를 따로 들고 있는다.
   * 같은 시점끼리 비교해야 방제 효과가 얼마인지 말할 수 있다.
   */
  const [baselineFrames, setBaselineFrames] = useState<Float32Array[]>([]);

  const directRadiusM = radiusKm * 1000;
  const indirectRadiusM = directRadiusM * 2;

  // ---------------------------------------------------------------
  // 데이터 로드
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(WEIGHTS_PATH).then((response) => response.json()),
      fetch(GRID_PATH).then((response) => response.json()),
      fetch(CELLS_PATH).then((response) => response.json()),
    ])
      .then(([weightsData, gridData, cellsData]) => {
        if (cancelled) return;
        setWeights(weightsData);
        setGrid(gridData);
        buildCellLayers(gridData, cellsData);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            "시뮬레이션 데이터를 불러오지 못했습니다. public/data/ca_sim 파일을 확인해 주세요.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------
  // 지도 생성 (한 번만)
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [35.95, 129.28],
      zoom: 10,
      minZoom: 8,
      maxZoom: 15,
      preferCanvas: true,
      zoomControl: true,
    });

    L.tileLayer(MAP_TILE_CONFIG.base.url, {
      attribution: MAP_TILE_CONFIG.base.attribution,
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      setControlCenter({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    leafletMapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 200);

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      leafletMapRef.current = null;
      cellsRef.current = [];
    };
  }, []);

  /** 격자 폴리곤을 한 번만 만들어 두고, 이후에는 setStyle만 바꾼다. */
  function buildCellLayers(gridData: CaGrid, cellsData: any) {
    const map = leafletMapRef.current;
    if (!map) return;

    const renderer = L.canvas({ padding: 0.3 });
    const built: CellFeature[] = [];

    const layer = L.geoJSON(cellsData, {
      renderer,
      interactive: false,
      style: { weight: 0, fillOpacity: 0.3, color: "transparent" },
      onEachFeature: (feature, featureLayer) => {
        const properties = feature?.properties ?? {};
        const row = Number(properties.r);
        const column = Number(properties.c);
        const center = (featureLayer as L.Polygon).getBounds().getCenter();
        built.push({
          row,
          column,
          gridId: Number(properties.grid_id),
          seeded: Number(properties.infected_2022) > 0,
          layer: featureLayer as L.Path,
          index: row * gridData.W + column,
          latitude: center.lat,
          longitude: center.lng,
        });
      },
    } as L.GeoJSONOptions).addTo(map);

    cellsRef.current = built;
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });

    paintInitial(built);
  }

  /** 시작 시점 표시. 감염 격자는 가장 짙은 붉은색으로 둔다. */
  function paintInitial(cells: CellFeature[]) {
    for (const cell of cells) {
      const probability = cell.seeded ? 1 : 0;
      cell.layer.setStyle({
        fillColor: riskColor(probability),
        fillOpacity: riskOpacity(probability),
        weight: 0,
      });
    }
  }

  // ---------------------------------------------------------------
  // 월별 프레임을 지도에 반영
  // ---------------------------------------------------------------
  useEffect(() => {
    const cells = cellsRef.current;
    if (!cells.length) return;

    if (!frames.length) {
      paintInitial(cells);
      return;
    }

    const frame = frames[Math.min(month, frames.length - 1)];
    for (const cell of cells) {
      const probability = frame[cell.index] ?? 0;
      cell.layer.setStyle({
        fillColor: riskColor(probability),
        fillOpacity: riskOpacity(probability),
        weight: 0,
      });
    }
  }, [frames, month]);

  // ---------------------------------------------------------------
  // 방제 구역 원 표시
  // ---------------------------------------------------------------
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    controlCircleRef.current?.remove();
    indirectCircleRef.current?.remove();
    controlCircleRef.current = null;
    indirectCircleRef.current = null;

    if (!controlCenter) return;

    indirectCircleRef.current = L.circle(controlCenter, {
      radius: indirectRadiusM,
      color: "#0284c7",
      weight: 1,
      dashArray: "4 4",
      fill: false,
      interactive: false,
    }).addTo(map);

    controlCircleRef.current = L.circle(controlCenter, {
      radius: directRadiusM,
      color: "#0369a1",
      weight: 2,
      fillColor: "#0ea5e9",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
  }, [controlCenter, directRadiusM, indirectRadiusM]);

  // ---------------------------------------------------------------
  // 재생
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying || !frames.length) return;
    const timer = window.setInterval(() => {
      setMonth((previous) => {
        if (previous >= frames.length - 1) {
          setIsPlaying(false);
          return previous;
        }
        return previous + 1;
      });
    }, 550);
    return () => window.clearInterval(timer);
  }, [isPlaying, frames]);

  // ---------------------------------------------------------------
  // 시뮬레이션 실행
  // ---------------------------------------------------------------
  const metersPerDegreeLatitude = 111_320;

  function buildSeed(withControl: boolean): Float32Array {
    const size = (grid?.H ?? 0) * (grid?.W ?? 0);
    const seed = new Float32Array(size);
    if (!grid) return seed;

    for (let i = 0; i < size; i += 1) seed[i] = grid.seed2022[i];
    if (!withControl || !controlCenter) return seed;

    // 직접 방제 구역 안의 감염원을 제거한 반사실 시나리오.
    const lngScale =
      metersPerDegreeLatitude * Math.cos((controlCenter.lat * Math.PI) / 180);
    for (const cell of cellsRef.current) {
      const dy = (cell.latitude - controlCenter.lat) * metersPerDegreeLatitude;
      const dx = (cell.longitude - controlCenter.lng) * lngScale;
      if (Math.sqrt(dx * dx + dy * dy) <= directRadiusM) {
        seed[cell.index] = 0;
      }
    }
    return seed;
  }

  function runSimulation(withControl: boolean) {
    if (!weights || !grid || isRunning) return;

    setIsRunning(true);
    setIsPlaying(false);
    setProgressText("모델을 실행하는 중...");

    // 무거운 계산이라 화면이 먼저 갱신되도록 다음 프레임으로 미룬다.
    window.setTimeout(() => {
      try {
        const stepFrames = runRollout(weights, grid, {
          seed: buildSeed(withControl),
          onStep: (step) => {
            setProgressText(`${step + 1} / ${CA_STEPS} 단계`);
          },
        });
        const monthly = toMonthlyFrames(stepFrames);
        setFrames(monthly);
        // 방제를 적용하지 않은 실행은 비교 기준으로 따로 보관한다.
        if (!withControl) setBaselineFrames(monthly);
        setMonth(0);
        setControlApplied(withControl);
        setProgressText("");
      } catch {
        setProgressText("");
        setLoadError("시뮬레이션 계산 중 오류가 발생했습니다.");
      } finally {
        setIsRunning(false);
      }
    }, 30);
  }

  function reset() {
    setFrames([]);
    setBaselineFrames([]);
    setMonth(0);
    setIsPlaying(false);
    setControlApplied(false);
    setControlCenter(null);
  }

  // ---------------------------------------------------------------
  // 요약 수치
  // ---------------------------------------------------------------
  const summary = useMemo(() => {
    if (!frames.length) return null;
    const index = Math.min(month, frames.length - 1);
    const frame = frames[index];

    let high = 0;
    let medium = 0;
    for (const cell of cellsRef.current) {
      const probability = frame[cell.index] ?? 0;
      if (probability >= 0.55) high += 1;
      else if (probability >= 0.35) medium += 1;
    }

    // 방제 결과를 보고 있고 기준 시나리오도 있으면 같은 시점끼리 비교한다.
    let baselineHigh: number | null = null;
    if (controlApplied && baselineFrames.length) {
      const baseFrame = baselineFrames[Math.min(index, baselineFrames.length - 1)];
      baselineHigh = 0;
      for (const cell of cellsRef.current) {
        if ((baseFrame[cell.index] ?? 0) >= 0.55) baselineHigh += 1;
      }
    }

    return {
      high,
      medium,
      total: cellsRef.current.length,
      baselineHigh,
      reduced: baselineHigh === null ? null : baselineHigh - high,
    };
  }, [frames, month, controlApplied, baselineFrames]);

  const isReady = Boolean(weights && grid);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-emerald-700" />
              <h2 className="text-base font-black text-slate-950">
                AI 확산 시나리오 시뮬레이션
              </h2>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
              경주·울주·포항 11,283개 격자를 대상으로 학습한 Neural CA로
              확산 진행을 재현합니다. 감염 확정 예측이 아니라
              의사결정 검토용 시나리오입니다.
            </p>
          </div>

        </div>
      </div>

      {loadError && (
        <div className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {loadError}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* 지도 */}
        <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div ref={mapRef} className="h-full w-full" />

          {/* 범례 */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-xl bg-white/95 px-3 py-2 shadow">
            <div className="mb-1 text-[9px] font-black text-slate-400">
              감염 확률
            </div>
            <div className="flex items-center gap-2">
              {[
                { color: "#7f1d1d", label: "75%+" },
                { color: "#b91c1c", label: "55%+" },
                { color: "#ef4444", label: "35%+" },
                { color: "#fb923c", label: "18%+" },
                { color: "#fed7aa", label: "낮음" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: item.color }}
                  />
                  <span className="text-[9px] font-bold text-slate-600">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {isRunning && (
            <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center gap-2 bg-white/70">
              <LoaderCircle size={26} className="animate-spin text-emerald-700" />
              <span className="text-xs font-black text-slate-700">
                {progressText || "계산 중..."}
              </span>
            </div>
          )}
        </div>

        {/* 컨트롤 */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-black text-slate-900">시뮬레이션</div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!isReady || isRunning}
                onClick={() => runSimulation(false)}
                className="flex-1 rounded-xl bg-emerald-800 py-2.5 text-[11px] font-black text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                기본 시나리오 실행
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {frames.length > 0 && (
              <>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying((value) => !value)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-800"
                  >
                    {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <input
                      type="range"
                      min={0}
                      max={frames.length - 1}
                      value={month}
                      onChange={(event) => {
                        setIsPlaying(false);
                        setMonth(Number(event.target.value));
                      }}
                      className="w-full accent-emerald-700"
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[11px] font-black text-slate-700">
                    +{month + 1}개월
                  </span>
                </div>

                <p className="mt-2 text-[10px] font-semibold text-slate-400">
                  월별은 실제 월 단위 예측이 아니라 연 단위 결과의 진행 단계를
                  나눈 것입니다.
                </p>
              </>
            )}
          </div>

          {/* 방제 시나리오 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5">
              <CircleDot size={14} className="text-sky-600" />
              <span className="text-xs font-black text-slate-900">
                방제 시나리오
              </span>
            </div>

            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              지도를 클릭해 방제 구역을 놓고 다시 실행하면, 그 구역의 감염원을
              제거했을 때의 확산을 비교할 수 있습니다.
            </p>

            {/* 방제 반경 선택 */}
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-black text-slate-500">
                방제 반경
              </div>
              <div className="flex gap-1">
                {RADIUS_OPTIONS_KM.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRadiusKm(option)}
                    className={
                      radiusKm === option
                        ? "flex-1 rounded-lg bg-sky-700 py-1.5 text-[10px] font-black text-white"
                        : "flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50"
                    }
                  >
                    {option}km
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
              {controlCenter
                ? `방제 구역 지정됨 · 직접 ${radiusKm}km / 간접 ${radiusKm * 2}km`
                : "지도를 클릭해 방제 구역을 지정하세요."}
            </div>

            <button
              type="button"
              disabled={!controlCenter || !isReady || isRunning}
              onClick={() => runSimulation(true)}
              className="mt-3 w-full rounded-xl bg-sky-700 py-2.5 text-[11px] font-black text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              방제 적용 후 재실행
            </button>

            {controlApplied && (
              <p className="mt-2 text-[10px] font-bold text-sky-700">
                현재 화면은 방제를 적용한 시나리오입니다.
              </p>
            )}
          </div>

          {/* 요약 */}
          {summary && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-black text-slate-900">
                +{month + 1}개월 시점
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-rose-50 p-3">
                  <div className="text-[9px] font-black text-rose-500">
                    고위험 (55%+)
                  </div>
                  <div className="mt-0.5 text-lg font-black text-rose-700">
                    {summary.high.toLocaleString("ko-KR")}
                  </div>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <div className="text-[9px] font-black text-amber-500">
                    주의 (35%+)
                  </div>
                  <div className="mt-0.5 text-lg font-black text-amber-700">
                    {summary.medium.toLocaleString("ko-KR")}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[10px] font-semibold text-slate-400">
                전체 {summary.total.toLocaleString("ko-KR")}개 격자 기준
              </p>

              {summary.reduced !== null && summary.baselineHigh !== null && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <div className="text-[9px] font-black text-sky-600">
                    방제 적용 효과 (같은 시점 비교)
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-black text-sky-800">
                      {summary.reduced > 0 ? "-" : ""}
                      {Math.abs(summary.reduced).toLocaleString("ko-KR")}
                    </span>
                    <span className="text-[10px] font-bold text-sky-700">
                      고위험 격자
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-sky-700/80">
                    미방제 {summary.baselineHigh.toLocaleString("ko-KR")}개 →
                    방제 후 {summary.high.toLocaleString("ko-KR")}개
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black text-slate-500">
              해석 시 유의사항
            </div>
            <ul className="mt-2 space-y-1 text-[10px] font-semibold leading-relaxed text-slate-500">
              <li>
                · 시간 전이 표본이 7개, 단일 지역 파일럿이라 정밀 역학모델이
                아닙니다.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
