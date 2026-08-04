import React, { useState } from "react";
import {
  Plus,
  Minus,
  Layers,
  MapPin,
  PlayCircle,
  CheckCircle,
  Info,
  Trophy,
  SlidersHorizontal,
  ShieldAlert,
  Route,
  Trees,
  RefreshCw,
} from "lucide-react";

interface PriorityItem {
  rank: number;
  region: string;
  grid: string;
  risk: number;
  accessibility: number;
  total: number;
}

const initialPriorityData: PriorityItem[] = [
  {
    rank: 1,
    region: "경북 포항시 북구 죽장면",
    grid: "GRID-3629",
    risk: 94,
    accessibility: 51,
    total: 79.4,
  },
  {
    rank: 2,
    region: "경북 포항시 북구 기계면",
    grid: "GRID-3631",
    risk: 81,
    accessibility: 74,
    total: 77.2,
  },
  {
    rank: 3,
    region: "전남 순천시 승주읍",
    grid: "GRID-2041",
    risk: 74,
    accessibility: 70,
    total: 71.0,
  },
  {
    rank: 4,
    region: "경남 밀양시 산내면",
    grid: "GRID-1240",
    risk: 87,
    accessibility: 40,
    total: 70.9,
  },
  {
    rank: 5,
    region: "충남 공주시 계룡면",
    grid: "GRID-1123",
    risk: 58,
    accessibility: 63,
    total: 61.5,
  },
];

export default function ControlWorkSection() {
  const [riskWeight, setRiskWeight] = useState(25);
  const [accessWeight, setAccessWeight] = useState(38);
  const [densityWeight, setDensityWeight] = useState(37);

  const [selectedGrid, setSelectedGrid] =
    useState("GRID-3629");

  const [isRunning, setIsRunning] =
    useState(false);

  const [isComplete, setIsComplete] =
    useState(false);

  const selectedItem =
    initialPriorityData.find(
      (item) => item.grid === selectedGrid
    ) ?? initialPriorityData[0];

  const handleSimulation = () => {
    if (isRunning) return;

    setIsRunning(true);
    setIsComplete(false);

    setTimeout(() => {
      setIsRunning(false);
      setIsComplete(true);

      setTimeout(() => {
        setIsComplete(false);
      }, 2500);
    }, 2000);
  };

  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-[#F5F7FA]">
      <div className="mx-auto h-full min-h-0 max-w-[1800px]">

        {/* =====================================================
            MAIN LAYOUT
            좌측 2 : 우측 1
        ====================================================== */}

        <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">

          {/* ===================================================
              LEFT : 방제 시뮬레이션
          ==================================================== */}

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* Header */}

            <header className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-5 py-4 xl:px-6">

              <div className="flex items-center justify-between gap-4">

                <div className="min-w-0">

                  <div className="flex items-center gap-2">

                    <SlidersHorizontal
                      size={18}
                      className="shrink-0 text-emerald-700"
                    />

                    <h2 className="text-base font-black text-slate-950">
                      방제 시뮬레이션
                    </h2>

                  </div>

                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    방제 여부에 따른 향후 감염 시뮬레이션을 제공합니다.
                  </p>

                </div>

              </div>

            </header>


            {/* =================================================
                MAP
            ================================================== */}

            <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-200">

              {/* Map Background */}

              <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 via-slate-100 to-lime-100">

                {/* Grid */}

                <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 opacity-30">

                  {Array.from({ length: 64 }).map(
                    (_, index) => (
                      <div
                        key={index}
                        className="border border-slate-400"
                      />
                    )
                  )}

                </div>


                {/* Risk Areas */}

                <div
                  className="
                    absolute
                    left-[28%]
                    top-[18%]
                    h-40
                    w-40
                    rounded-full
                    bg-red-500/30
                    blur-2xl
                  "
                />

                <div
                  className="
                    absolute
                    bottom-[20%]
                    right-[22%]
                    h-32
                    w-32
                    rounded-full
                    bg-orange-400/30
                    blur-2xl
                  "
                />


                {/* Selected Location */}

                <button
                  type="button"
                  onClick={() =>
                    setSelectedGrid("GRID-3629")
                  }
                  className="
                    absolute
                    left-[48%]
                    top-[38%]
                    flex
                    h-11
                    w-11
                    items-center
                    justify-center
                    rounded-full
                    border-4
                    border-white
                    bg-emerald-700
                    text-white
                    shadow-xl
                    transition
                    hover:scale-110
                    hover:bg-emerald-800
                  "
                  title="GRID-3629 선택"
                >
                  <MapPin size={20} />
                </button>


                {/* Additional Locations */}

                <button
                  type="button"
                  onClick={() =>
                    setSelectedGrid("GRID-3631")
                  }
                  className="
                    absolute
                    left-[62%]
                    top-[28%]
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-full
                    border-2
                    border-white
                    bg-orange-500
                    text-white
                    shadow-lg
                    transition
                    hover:scale-110
                  "
                  title="GRID-3631 선택"
                >
                  <MapPin size={15} />
                </button>


                <button
                  type="button"
                  onClick={() =>
                    setSelectedGrid("GRID-2041")
                  }
                  className="
                    absolute
                    bottom-[30%]
                    left-[30%]
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-full
                    border-2
                    border-white
                    bg-yellow-500
                    text-white
                    shadow-lg
                    transition
                    hover:scale-110
                  "
                  title="GRID-2041 선택"
                >
                  <MapPin size={15} />
                </button>

              </div>


              {/* Map Controls */}

              <div className="absolute right-4 top-4 flex flex-col gap-2">

                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50"
                  title="확대"
                >
                  <Plus size={17} />
                </button>

                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50"
                  title="축소"
                >
                  <Minus size={17} />
                </button>

                <button
                  type="button"
                  className="mt-2 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50"
                  title="레이어"
                >
                  <Layers size={17} />
                </button>

              </div>


              {/* Map Legend */}

              <div className="absolute bottom-4 left-4 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm">

                <div className="mb-2 text-[10px] font-black text-slate-700">
                  AI 위험도
                </div>

                <div className="space-y-1.5">

                  <LegendItem
                    color="bg-red-500"
                    label="고위험"
                  />

                  <LegendItem
                    color="bg-orange-400"
                    label="위험"
                  />

                  <LegendItem
                    color="bg-yellow-400"
                    label="주의"
                  />

                </div>

              </div>


              {/* AI Risk Detail */}

              <div className="absolute bottom-4 right-4 w-[300px] max-w-[calc(100%-32px)] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-md">

                <div className="mb-3 flex items-center justify-between gap-3">

                  <div className="flex items-center gap-2">

                    <MapPin
                      size={16}
                      className="text-emerald-700"
                    />

                    <h3 className="text-xs font-black text-emerald-800">
                      AI 위험도 상세
                    </h3>

                  </div>

                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-800">
                    {selectedGrid}
                  </span>

                </div>


                <div>

                  <InfoRow
                    label="격자 ID"
                    value="872904"
                  />

                  <InfoRow
                    label="AI 위험도"
                    value={`${selectedItem.risk}% / 높음`}
                    valueClassName="text-red-600"
                  />

                  <InfoRow
                    label="예찰 우선순위"
                    value={`${selectedItem.total}점 / 우선예찰`}
                    valueClassName="text-emerald-700"
                  />

                  <InfoRow
                    label="소나무류 비율"
                    value="21.3%"
                  />

                  <InfoRow
                    label="접근성 점수"
                    value={`${selectedItem.accessibility}점`}
                    last
                  />

                </div>

              </div>

            </div>


            {/* =================================================
                WEIGHT PANEL
            ================================================== */}

            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 xl:px-6">

              <div className="mb-4 flex items-center justify-between">

                <div>

                  <h3 className="text-xs font-black text-slate-900">
                    시뮬레이션 가중치 설정
                  </h3>

                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    가중치를 조정하여 방제 우선순위를 재계산합니다.
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() => {
                    setRiskWeight(25);
                    setAccessWeight(38);
                    setDensityWeight(37);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-500 transition hover:bg-slate-50"
                >
                  <RefreshCw size={12} />
                  초기화
                </button>

              </div>


              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

                <WeightSlider
                  icon={ShieldAlert}
                  label="AI 예측 위험도"
                  value={riskWeight}
                  onChange={setRiskWeight}
                />

                <WeightSlider
                  icon={Route}
                  label="도로 접근 및 인력 편의성"
                  value={accessWeight}
                  onChange={setAccessWeight}
                />

                <WeightSlider
                  icon={Trees}
                  label="소나무류 밀도 비율"
                  value={densityWeight}
                  onChange={setDensityWeight}
                />

              </div>

            </div>


            {/* =================================================
                BOTTOM CONTROL
            ================================================== */}

            <div className="shrink-0 border-t border-slate-200 bg-white p-4 xl:p-5">

              <button
                type="button"
                onClick={handleSimulation}
                disabled={isRunning}
                className="
                  flex
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-xl
                  bg-emerald-800
                  py-3
                  text-sm
                  font-black
                  text-white
                  shadow-md
                  transition
                  hover:bg-emerald-900
                  disabled:cursor-not-allowed
                  disabled:bg-slate-400
                "
              >

                {isRunning ? (
                  <>
                    <span className="animate-spin">
                      ⟳
                    </span>

                    시뮬레이션 중...
                  </>
                ) : isComplete ? (
                  <>
                    <CheckCircle size={18} />

                    시뮬레이션 완료
                  </>
                ) : (
                  <>
                    <PlayCircle size={19} />

                    방제 시뮬레이션 실행
                  </>
                )}

              </button>

            </div>

          </section>


          {/* ===================================================
              RIGHT : 종합 방제 우선순위
          ==================================================== */}

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* Header */}

            <header className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-5 py-4 xl:px-6">

              <div className="flex items-center justify-between gap-4">

                <div className="min-w-0">

                  <div className="flex items-center gap-2">

                    <Trophy
                      size={18}
                      className="shrink-0 text-emerald-700"
                    />

                    <h2 className="text-base font-black text-slate-950">
                      종합 방제 우선순위
                    </h2>

                  </div>

                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    시뮬레이션 결과를 기반으로 방제 우선순위를 제공합니다.
                  </p>

                </div>

              </div>

            </header>

            {/* =================================================
                RIGHT CONTENT
            ================================================== */}

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">


              {/* Table Header */}

              <div className="grid grid-cols-[42px_minmax(0,1fr)_58px_58px_65px] items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[9px] font-black text-slate-400">

                <div>
                  순위
                </div>

                <div>
                  지역구명 / 격자
                </div>

                <div className="text-center">
                  위험도
                </div>

                <div className="text-center">
                  접근성
                </div>

                <div className="text-right">
                  종합
                </div>

              </div>


              {/* Priority Rows */}

              <div className="divide-y divide-slate-100">

                {initialPriorityData.map((item) => {

                  const isSelected =
                    selectedGrid === item.grid;

                  return (

                    <button
                      key={item.grid}
                      type="button"
                      onClick={() =>
                        setSelectedGrid(item.grid)
                      }
                      className={`
                        grid
                        w-full
                        grid-cols-[42px_minmax(0,1fr)_58px_58px_65px]
                        items-center
                        gap-2
                        px-5
                        py-3.5
                        text-left
                        transition
                        ${
                          isSelected
                            ? "bg-emerald-50/70"
                            : "bg-white hover:bg-slate-50"
                        }
                      `}
                    >

                      {/* Rank */}

                      <div>

                        <span
                          className={`
                            text-sm
                            font-black
                            ${
                              item.rank === 1
                                ? "text-emerald-700"
                                : item.rank === 2
                                  ? "text-slate-700"
                                  : "text-slate-400"
                            }
                          `}
                        >
                          {String(item.rank).padStart(2, "0")}
                        </span>

                      </div>


                      {/* Region */}

                      <div className="min-w-0">

                        <div className="truncate text-xs font-black text-slate-800">
                          {item.region}
                        </div>

                        <div className="mt-1 text-[9px] font-bold tracking-wider text-slate-400">
                          {item.grid}
                        </div>

                      </div>


                      {/* Risk */}

                      <div className="text-center">

                        <span
                          className={`
                            text-xs
                            font-black
                            ${
                              item.risk >= 80
                                ? "text-red-600"
                                : item.risk >= 60
                                  ? "text-orange-500"
                                  : "text-slate-600"
                            }
                          `}
                        >
                          {item.risk}%
                        </span>

                      </div>


                      {/* Accessibility */}

                      <div className="text-center">

                        <span className="text-xs font-black text-slate-600">
                          {item.accessibility}%
                        </span>

                      </div>


                      {/* Total */}

                      <div className="text-right">

                        <span className="text-base font-black text-emerald-800">
                          {item.total.toFixed(1)}
                        </span>

                      </div>

                    </button>

                  );

                })}

              </div>


              {/* =================================================
                  LOGIC INFO
              ================================================== */}

              <div className="mx-5 mb-5 rounded-xl border border-lime-200 bg-lime-50/70 p-4">

                <div className="flex items-start gap-3">

                  <Info
                    size={16}
                    className="mt-0.5 shrink-0 text-lime-700"
                  />

                  <div>

                    <h4 className="text-xs font-black text-lime-900">
                      방제 우선순위 계산 로직
                    </h4>

                    <p className="mt-1.5 text-[10px] font-semibold leading-5 text-lime-900/70">
                      인공지능 기반 확산 예측 점수와 도로 접근성,
                      소나무류 밀도를 종합하여 방제 우선순위를 계산합니다.
                      가중치를 변경하면 결과가 갱신됩니다.
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </section>

        </div>

      </div>
    </div>
  );
}


/* ============================================================
   Legend Item
============================================================ */

interface LegendItemProps {
  color: string;
  label: string;
}

function LegendItem({
  color,
  label,
}: LegendItemProps) {
  return (
    <div className="flex items-center gap-2">

      <span
        className={`h-2.5 w-2.5 rounded-full ${color}`}
      />

      <span className="text-[9px] font-bold text-slate-500">
        {label}
      </span>

    </div>
  );
}


/* ============================================================
   Info Row
============================================================ */

interface InfoRowProps {
  label: string;
  value: string;
  valueClassName?: string;
  last?: boolean;
}

function InfoRow({
  label,
  value,
  valueClassName = "text-slate-800",
  last = false,
}: InfoRowProps) {
  return (
    <div
      className={
        last
          ? "flex items-center justify-between py-2 text-[10px]"
          : "flex items-center justify-between border-b border-slate-100 py-2 text-[10px]"
      }
    >

      <span className="font-semibold text-slate-500">
        {label}
      </span>

      <span
        className={`font-black ${valueClassName}`}
      >
        {value}
      </span>

    </div>
  );
}


/* ============================================================
   Weight Slider
============================================================ */

interface WeightSliderProps {
  icon: React.ElementType;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function WeightSlider({
  icon: Icon,
  label,
  value,
  onChange,
}: WeightSliderProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">

      <div className="flex items-center justify-between gap-3">

        <div className="flex min-w-0 items-center gap-2">

          <Icon
            size={14}
            className="shrink-0 text-emerald-700"
          />

          <label className="truncate text-[10px] font-black text-slate-600">
            {label}
          </label>

        </div>

        <span className="shrink-0 text-sm font-black text-emerald-800">
          {value}%
        </span>

      </div>


      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        className="mt-3 w-full accent-emerald-800"
      />

    </div>
  );
}

/* ============================================================
   Detail Metric
============================================================ */

interface DetailMetricProps {
  label: string;
  value: string;
}

function DetailMetric({
  label,
  value,
}: DetailMetricProps) {
  return (
    <div className="rounded-lg bg-white px-3 py-2.5">

      <div className="text-[9px] font-bold text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-sm font-black text-slate-800">
        {value}
      </div>

    </div>
  );
}