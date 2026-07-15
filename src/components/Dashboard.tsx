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
import DashboardRiskMapCard from "./DashboardRiskMapCard";

interface DashboardProps {
  grids: GridCell[];
  trees: TreeRecord[];
  workers: WorkerStatus[];
  reports: CrowdReport[];
  onGridSelect?: (grid: any) => void;
}

export default function Dashboard({
  grids,
  trees,
  workers,
  reports,
  onGridSelect,
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
          <DashboardRiskMapCard
            onGridSelect={onGridSelect}
          />
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
