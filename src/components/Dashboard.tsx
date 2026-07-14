import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldAlert, 
  MapPin, 
  Drone, 
  CheckCircle, 
  Layers, 
  Clock, 
  ChevronRight, 
  AlertTriangle, 
  Search, 
  TrendingUp, 
  BarChart2, 
  Users 
} from "lucide-react";
import { GridCell, TreeRecord, WorkerStatus, CrowdReport } from "../types";

interface DashboardProps {
  grids: GridCell[];
  trees: TreeRecord[];
  workers: WorkerStatus[];
  reports: CrowdReport[];
}

export default function Dashboard({ 
  grids, 
  trees,
  workers,
  reports
}: DashboardProps) {
  const [selectedSido, setSelectedSido] = useState<string>("전국");
  const [selectedSigungu, setSelectedSigungu] = useState<string>("전체 시군구");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [timeLapseYear, setTimeLapseYear] = useState<number>(2026);
  const [activeLayer, setActiveLayer] = useState<"risk" | "density" | "history">("risk");
  const [tickerOffset, setTickerOffset] = useState(0);
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);

  // Filter grids based on sidebar region filters and topbar search
  const filteredGrids = grids.filter(g => {
    // Sido filter
    if (selectedSido !== "전국") {
      if (selectedSido === "경상북도" && !g.region.includes("경북")) return false;
      if (selectedSido === "경상남도" && !g.region.includes("경남")) return false;
      if (selectedSido === "전라남도" && !g.region.includes("전남")) return false;
      if (selectedSido === "강원특별자치도" && !g.region.includes("강원")) return false;
    }
    // Sigungu filter
    if (selectedSigungu !== "전체 시군구") {
      if (!g.region.includes(selectedSigungu)) return false;
    }
    // Search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      return g.id.toLowerCase().includes(q) || g.region.toLowerCase().includes(q);
    }
    return true;
  });

  // Dynamic factor multiplier simulating historical timeline deterioration for Time-Lapse (FR-HOM-002)
  const getSimulatedRisk = (baseScore: number, cellId: string) => {
    const seed = cellId.charCodeAt(5) || 1;
    // Over the years, risks generally spread and increase in some grids, while decreasing in others due to control
    const yearDiff = timeLapseYear - 2020; // baseline 2020
    let factor = 1 + (yearDiff * 0.04) * (seed % 2 === 0 ? 1 : -0.7);
    return Math.max(0.01, Math.min(0.99, baseScore * factor));
  };

  const getRiskColor = (score: number) => {
    if (score >= 0.7) return "bg-rose-500 hover:bg-rose-600 shadow-rose-300";
    if (score >= 0.4) return "bg-amber-500 hover:bg-amber-600 shadow-amber-200";
    if (score >= 0.2) return "bg-yellow-400 hover:bg-yellow-500 shadow-yellow-100";
    return "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100";
  };

  const getRiskGrade = (score: number) => {
    if (score >= 0.7) return { label: "상 (고위험)", color: "text-rose-600 bg-rose-50 border-rose-200" };
    if (score >= 0.4) return { label: "중 (우려)", color: "text-amber-600 bg-amber-50 border-amber-200" };
    if (score >= 0.2) return { label: "주의", color: "text-yellow-700 bg-yellow-50 border-yellow-200" };
    return { label: "하 (안전)", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  };

  return (
    <div className="space-y-6">
      {/* Telemetry KPI Dashboard (FR-HOM-003, FR-HOM-004) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
          id="kpi-risk-grids"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-300" />
          <div className="relative flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">고위험 위험 지역</span>
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">47 개소</div>
              <span className="text-xs text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full inline-block border border-rose-100">▲ 전주 대비 12%p</span>
            </div>
            <div className="p-3 bg-rose-500 rounded-xl text-white">
              <ShieldAlert size={20} />
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
          id="kpi-patrol"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-300" />
          <div className="relative flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">현장 요원 출동 현황</span>
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">28 명</div>
              <span className="text-xs text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full inline-block border border-amber-100">GPS 정상 26명 수신</span>
            </div>
            <div className="p-3 bg-amber-500 rounded-xl text-white">
              <MapPin size={20} />
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
          id="kpi-drone"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-300" />
          <div className="relative flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">드론 자동 예찰</span>
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">8 회 수행</div>
              <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full inline-block border border-blue-100">3개기 자율 비행 중</span>
            </div>
            <div className="p-3 bg-blue-500 rounded-xl text-white">
              <Drone size={20} />
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
          id="kpi-completion"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-300" />
          <div className="relative flex justify-between items-start">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">전체 방제 처리율</span>
              <div className="text-3xl font-extrabold text-slate-900 tracking-tight">89.4 %</div>
              <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-block border border-emerald-100">▲ 연도 목표 대비 우수</span>
            </div>
            <div className="p-3 bg-emerald-500 rounded-xl text-white">
              <CheckCircle size={20} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Interactive Map Section (FR-HOM-001, FR-HOM-002) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  🗺️ 500m 격자 위험도 히트맵 및 확산 감시 지형
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  XGBoost 예측 확률 기반 산림 환경 및 지형 특성이 통합 투영된 실시간 대화형 지도 레이어
                </p>
              </div>

              {/* Layer Selection */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
                <button 
                  onClick={() => setActiveLayer("risk")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${activeLayer === "risk" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
                >
                  위험지수
                </button>
                <button 
                  onClick={() => setActiveLayer("density")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${activeLayer === "density" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
                >
                  소나무밀도
                </button>
                <button 
                  onClick={() => setActiveLayer("history")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${activeLayer === "history" ? "bg-white text-slate-900 shadow-sm" : "hover:text-slate-900"}`}
                >
                  감염이력
                </button>
              </div>
            </div>

            {/* Custom Interactive GIS Grid Representation */}
            <div className="bg-gradient-to-br from-emerald-100/40 via-sky-50/20 to-emerald-50/60 border border-slate-200 rounded-2xl h-[420px] relative overflow-hidden flex items-center justify-center p-4">
              
              {/* Backgrid Topography Lines */}
              <div className="absolute inset-0 grid grid-cols-12 gap-0.5 pointer-events-none opacity-25">
                {Array.from({ length: 120 }).map((_, i) => (
                  <div key={i} className="border-t border-l border-slate-400/30 w-full h-12" />
                ))}
              </div>

              {/* South Korea Outbreak-prone Mountain Range Representation */}
              <div className="absolute w-[80%] h-[80%] rounded-full bg-emerald-200/20 filter blur-3xl pointer-events-none translate-x-12 translate-y-6" />
              <div className="absolute w-[60%] h-[70%] rounded-full bg-teal-200/10 filter blur-3xl pointer-events-none -translate-x-12 -translate-y-6" />

              {/* Grid Cells container */}
              <div className="relative z-10 w-full h-full max-w-[500px] max-h-[380px] grid grid-cols-5 gap-3">
                {filteredGrids.slice(0, 15).map((grid, index) => {
                  const dynamicRisk = getSimulatedRisk(grid.riskScore, grid.id);
                  let displayScore = dynamicRisk;
                  if (activeLayer === "density") displayScore = grid.pineDensity / 100;
                  if (activeLayer === "history") displayScore = grid.historyCount / 20;

                  return (
                    <motion.div
                      key={grid.id}
                      whileHover={{ scale: 1.1, zIndex: 30 }}
                      className={`relative rounded-xl cursor-pointer p-3 border border-white/60 shadow-sm transition-colors flex flex-col justify-between h-20 ${getRiskColor(displayScore)}`}
                      onClick={() => {
                        const updatedGrid = { ...grid, riskScore: Number(dynamicRisk.toFixed(3)) };
                        setSelectedCell(updatedGrid);
                      }}
                      id={`cell-${grid.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-mono text-white/90 drop-shadow-sm font-semibold">
                          {grid.id}
                        </span>
                        {displayScore >= 0.7 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-white tracking-tight drop-shadow">
                          {activeLayer === "risk" && `${Math.round(displayScore * 100)}%`}
                          {activeLayer === "density" && `${grid.pineDensity}%`}
                          {activeLayer === "history" && `${grid.historyCount}회`}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Legend overlay */}
              <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200/60 shadow-sm text-[10px] text-slate-600 font-semibold space-y-1.5">
                <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 mb-1">범례 (범주)</div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" />
                  <span>상 (0.7 이상)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" />
                  <span>중 (0.4 ~ 0.7)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-yellow-400 inline-block" />
                  <span>주의 (0.2 ~ 0.4)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
                  <span>하 (0.2 미만)</span>
                </div>
              </div>

              {/* Time lapse year display */}
              <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-white font-mono font-bold text-xs tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-emerald-400 animate-spin" style={{ animationDuration: "12s" }} />
                <span>시점: {timeLapseYear}년</span>
              </div>
            </div>

            {/* Time-Lapse Slider (FR-HOM-002) */}
            <div className="mt-4 bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  📅 시점 변경 타임랩스 (Time-Lapse Slider)
                </span>
                <p className="text-[11px] text-slate-500">
                  연도 조절 시 공간 통계 알고리즘이 과거와 미래의 병해충 확산 예측을 연쇄 연산합니다.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <span className="text-xs font-mono text-slate-400">2016</span>
                <input 
                  type="range" 
                  min={2016} 
                  max={2026} 
                  value={timeLapseYear}
                  onChange={(e) => setTimeLapseYear(Number(e.target.value))}
                  className="w-full accent-emerald-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-900 font-bold bg-white px-2 py-1 rounded border border-slate-300 shadow-sm">{timeLapseYear}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Grid Cell Inspector Popup Panel (FR-HOM-001) */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm min-h-[300px]">
            <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-1.5">
              🔬 XGBoost 위험도 원인 분석기 (SHAP)
            </h3>

            {selectedCell ? (
              <motion.div 
                key={selectedCell.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[11px] text-slate-400 font-mono font-bold">{selectedCell.id}</span>
                    <h4 className="text-sm font-bold text-slate-800">{selectedCell.region}</h4>
                  </div>
                  <div className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getRiskGrade(selectedCell.riskScore).color}`}>
                    {getRiskGrade(selectedCell.riskScore).label}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-600">AI 위험 점수</span>
                    <span className="font-mono font-black text-slate-900">{(selectedCell.riskScore * 100).toFixed(1)} / 100</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedCell.riskScore * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="bg-emerald-600 h-full rounded-full"
                    />
                  </div>
                </div>

                {/* SHAP Feature Contribution (FR-HOM-001, FR-SYS-005) */}
                <div className="space-y-2.5 pt-2">
                  <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase block">SHAP 기여 요인 분석</span>
                  
                  <div className="space-y-2 text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>인접 격자 감염 이력 빈도 (+36.7%)</span>
                        <span className="font-semibold text-slate-800">{selectedCell.historyCount}회</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-rose-400 h-full rounded-full" style={{ width: "80%" }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>소나무 분포 밀도 (+24.1%)</span>
                        <span className="font-semibold text-slate-800">{selectedCell.pineDensity}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${selectedCell.pineDensity}%` }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>산지 고도 / 경사도 기후 조건 (+14.3%)</span>
                        <span className="font-semibold text-slate-800">{selectedCell.elevation}m</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-400 h-full rounded-full" style={{ width: "55%" }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100/60 text-xs text-emerald-800/90 leading-relaxed">
                  💡 <b>추천 권장 조치:</b> 본 격자는 위험 등급이 높습니다. 인접 확진 밀도가 수렴되므로, <b>3. 스마트 예찰 요원 배정</b> 및 드론 상공 스캔을 실행하여 정밀 진단하십시오.
                </div>
              </motion.div>
            ) : (
              <div className="h-[260px] flex flex-col items-center justify-center text-center space-y-2 text-slate-400">
                <Layers size={32} className="stroke-[1.5] text-slate-300 animate-pulse" />
                <p className="text-xs font-semibold">지도에서 격자 셀을 클릭하시면<br />XGBoost SHAP 피처 분석 결과가 도출됩니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Outbreak charts and logs (FR-HOM-005) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Alarm log center (FR-COM-002) */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex justify-between items-center">
            <span className="flex items-center gap-1.5">🚨 실시간 통합 알림 로그</span>
            <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold">긴급 수신</span>
          </h3>

          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex gap-3">
              <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-rose-900">경북 포항 GRID-3629 위험등급 격상 (중 → 상)</div>
                <div className="text-[10px] text-rose-500 font-mono">14:28 | v2.3.1 실시간 추론 결과</div>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-amber-900">드론 #D-03기 경남 밀양 감염 의심목 감지</div>
                <div className="text-[10px] text-amber-500 font-mono">14:15 | 열화상 및 NDVI 오차 이상 검출</div>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex gap-3">
              <Clock className="text-blue-500 shrink-0 mt-0.5" size={16} />
              <div className="space-y-1 text-xs">
                <div className="font-bold text-blue-900">충남 공주 3구역 방제 작업 승인 대기</div>
                <div className="text-[10px] text-blue-500 font-mono">13:30 | 훈증 처리 현장 증빙 완료</div>
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Outbreak Trend Chart (FR-HOM-005) */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-1.5">📈 주간 예찰 제보 및 확진 추이</span>
            <span className="text-[10px] text-slate-400 font-mono">최근 7주</span>
          </h3>

          <div className="h-[210px] flex items-end justify-between gap-2 px-2 pt-6">
            {[
              { label: "5월 3주", reported: 45, confirmed: 15 },
              { label: "5월 4주", reported: 68, confirmed: 28 },
              { label: "6월 1주", reported: 90, confirmed: 45 },
              { label: "6월 2주", reported: 120, confirmed: 62 },
              { label: "6월 3주", reported: 85, confirmed: 50 },
              { label: "6월 4주", reported: 110, confirmed: 78 },
              { label: "7월 1주", reported: 145, confirmed: 94 },
            ].map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                {/* Tooltip on hover */}
                <div className="absolute -top-12 bg-slate-900 text-white text-[9px] p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow whitespace-nowrap">
                  제보: {d.reported}건 / 확진: {d.confirmed}건
                </div>

                <div className="w-full flex justify-center gap-1 items-end h-[140px]">
                  {/* Reported */}
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.reported / 160) * 140}px` }}
                    transition={{ delay: i * 0.05 }}
                    className="w-2 md:w-3 bg-sky-400/80 rounded-t-sm"
                  />
                  {/* Confirmed */}
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${(d.confirmed / 160) * 140}px` }}
                    transition={{ delay: i * 0.05 + 0.1 }}
                    className="w-2 md:w-3 bg-rose-500/90 rounded-t-sm"
                  />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 scale-90 whitespace-nowrap">{d.label}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4 mt-3 text-[10px] font-bold text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-sky-400 rounded-sm" />
              <span>크라우드 예찰 제보</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" />
              <span>PCR 확진 전환 건수</span>
            </div>
          </div>
        </div>

        {/* Outbreak Regional Sido Table (FR-HOM-004) */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
          <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <span className="flex items-center gap-1.5">📋 시도별 감염 누적 및 우선순위</span>
            <span className="text-[10px] text-slate-400">실시간 집계</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                  <th className="py-2">시도명</th>
                  <th className="py-2">감염 격자 수</th>
                  <th className="py-2">방제 완료율</th>
                  <th className="py-2 text-right">등급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
                {[
                  { name: "경상북도", count: "1,240 개", rate: "84%", grade: "위험", color: "text-rose-600 bg-rose-50" },
                  { name: "경상남도", count: "865 개", rate: "89%", grade: "경계", color: "text-amber-600 bg-amber-50" },
                  { name: "강원특별자치도", count: "510 개", rate: "92%", grade: "우려", color: "text-yellow-700 bg-yellow-50" },
                  { name: "전라남도", count: "340 개", rate: "95%", grade: "보통", color: "text-emerald-600 bg-emerald-50" },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 font-bold text-slate-800">{row.name}</td>
                    <td className="py-2.5 font-mono">{row.count}</td>
                    <td className="py-2.5 font-mono">{row.rate}</td>
                    <td className="py-2.5 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.color}`}>
                        {row.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
