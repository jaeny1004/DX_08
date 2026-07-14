import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldAlert, 
  Trash2, 
  Plus, 
  ListFilter, 
  Layers, 
  Database, 
  Hammer, 
  Flame, 
  Check, 
  Settings, 
  Activity, 
  AlertCircle 
} from "lucide-react";
import { ControlTask, GridCell } from "../types";

interface ControlSectionProps {
  tasks: ControlTask[];
  grids: GridCell[];
  onAddTask: (task: ControlTask) => void;
  onUpdateTaskProgress: (id: string, progress: number) => void;
}

export default function ControlSection({
  tasks,
  grids,
  onAddTask,
  onUpdateTaskProgress
}: ControlSectionProps) {
  const [activeTab, setActiveTab] = useState<"operations" | "simulator" | "priorities">("operations");

  // CTR-003 Registration Form
  const [area, setArea] = useState("");
  const [method, setMethod] = useState<ControlTask["method"]>("파쇄");
  const [company, setCompany] = useState("동해산림방제(주)");
  const [workers, setWorkers] = useState(10);
  const [isRegistering, setIsRegistering] = useState(false);

  // CTR-004 Sim Variables
  const [budget, setBudget] = useState<number>(12); // in 100M KRW
  const [headcount, setHeadcount] = useState<number>(45); // workforce

  // CTR-008 Attribute Weights
  const [weightRisk, setWeightRisk] = useState<number>(40);
  const [weightAccess, setWeightAccess] = useState<number>(30);
  const [weightDensity, setWeightDensity] = useState<number>(30);

  // Recalculating treatment priorities dynamically based on sliding weights (FR-CTR-008)
  const prioritizedGrids = useMemo(() => {
    return grids.map(g => {
      // Simulate accessibility index (higher elevation = lower access convenience)
      const simulatedAccessibility = Math.max(10, 100 - Math.round(g.elevation / 7));
      
      const weightedScore = (
        (g.riskScore * 100 * (weightRisk / 100)) +
        (simulatedAccessibility * (weightAccess / 100)) +
        (g.pineDensity * (weightDensity / 100))
      );

      return {
        ...g,
        accessibility: simulatedAccessibility,
        priorityScore: Number(weightedScore.toFixed(1))
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [grids, weightRisk, weightAccess, weightDensity]);

  const handleRegisterTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!area) return;

    const newTask: ControlTask = {
      id: `CTR-${Math.floor(100 + Math.random() * 900)}`,
      area,
      method,
      status: "예정",
      company,
      workers,
      progress: 0,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    };

    onAddTask(newTask);
    setArea("");
    setIsRegistering(false);
  };

  const getMethodBadge = (m: ControlTask["method"]) => {
    switch (m) {
      case "훈증": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "파쇄": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "소각": return "bg-rose-100 text-rose-800 border-rose-200";
      case "나무주사": return "bg-sky-100 text-sky-800 border-sky-200";
      default: return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 max-w-lg">
        <button 
          onClick={() => setActiveTab("operations")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "operations" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🛡️ 방제 현황 및 등록
        </button>
        <button 
          onClick={() => setActiveTab("priorities")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "priorities" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🎛️ AI 최적 방제 우선순위
        </button>
        <button 
          onClick={() => setActiveTab("simulator")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "simulator" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🔮 예산 대비 확산 예측기
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "operations" && (
          <motion.div 
            key="operations-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Control Tasks List (FR-CTR-002) */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      📋 국가 방제 공정 및 실적 대장 (CTR-002)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      구역별 작업 진행 상황, 투입 공수 및 시공 계약 업체 연동 현황
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="bg-emerald-800 text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-900 transition-colors"
                  >
                    <Plus size={14} />
                    <span>작업 추가 배정</span>
                  </button>
                </div>

                {isRegistering && (
                  <motion.form 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    onSubmit={handleRegisterTask}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 space-y-4 text-xs font-semibold"
                  >
                    <div className="text-xs font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-1">
                      <Settings size={14} className="text-emerald-700" />
                      <span>신규 방제 명령 등록 및 작업 구역 확정 (FR-CTR-003)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-slate-600 block">대상 방제 구역/주소</label>
                        <input 
                          type="text" 
                          required
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                          placeholder="예: 경북 포항시 죽장면 GRID-3629 산간"
                          className="w-full bg-white border border-slate-200 rounded-xl p-2 font-medium outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-600 block">표준 방제 기법</label>
                        <select 
                          value={method}
                          onChange={(e) => setMethod(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2 outline-none font-bold"
                        >
                          <option>파쇄</option>
                          <option>훈증</option>
                          <option>소각</option>
                          <option>나무주사</option>
                          <option>항공방제</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-600 block">수주 시공사</label>
                        <input 
                          type="text" 
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          className="w-full bg-white border border-slate-200 p-2 rounded-xl outline-none font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-600 block">투입 배정 인력 (공수)</label>
                        <input 
                          type="number" 
                          value={workers}
                          onChange={(e) => setWorkers(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 p-2 rounded-xl outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 text-xs pt-2">
                      <button 
                        type="button" 
                        onClick={() => setIsRegistering(false)}
                        className="px-3.5 py-2 border border-slate-200 bg-white rounded-xl font-bold text-slate-600"
                      >
                        취소
                      </button>
                      <button 
                        type="submit" 
                        className="px-4 py-2 bg-emerald-800 text-white rounded-xl font-bold hover:bg-emerald-900"
                      >
                        시공 배정 완료
                      </button>
                    </div>
                  </motion.form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
                        <th className="py-3 px-3">공정 ID</th>
                        <th className="py-3 px-3">방제 구역</th>
                        <th className="py-3 px-3">방제 방식</th>
                        <th className="py-3 px-3">시공 업체</th>
                        <th className="py-3 px-3">진척률 (게이지)</th>
                        <th className="py-3 px-3 text-right">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {tasks.map((task) => (
                        <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-3 font-mono font-bold text-emerald-950">{task.id}</td>
                          <td className="py-4 px-3 max-w-[140px] truncate">{task.area}</td>
                          <td className="py-4 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getMethodBadge(task.method)}`}>
                              {task.method}
                            </span>
                          </td>
                          <td className="py-4 px-3 truncate text-slate-500 max-w-[120px]">{task.company}</td>
                          <td className="py-4 px-3">
                            <div className="space-y-1 max-w-[120px]">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span>진척도</span>
                                <span>{task.progress}%</span>
                              </div>
                              <input 
                                type="range" 
                                min={0} 
                                max={100} 
                                value={task.progress}
                                onChange={(e) => onUpdateTaskProgress(task.id, Number(e.target.value))}
                                className="w-full accent-emerald-700 h-1 bg-slate-100 rounded-full appearance-none"
                              />
                            </div>
                          </td>
                          <td className="py-4 px-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              task.status === "완료" ? "bg-emerald-100 text-emerald-800" : task.status === "진행" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"
                            }`}>
                              {task.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Resources and inventory telemetry (FR-CTR-006) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-1.5">
                  <Database size={16} className="text-emerald-700" />
                  <span>약제 및 방제 소모품 재고 통합 센서 (CTR-006)</span>
                </h3>

                <div className="space-y-4 text-xs font-semibold">
                  <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl flex gap-3">
                    <AlertCircle className="text-rose-500 shrink-0" size={18} />
                    <div className="space-y-1">
                      <div className="font-bold text-rose-900">훈증 천막 (노란색 타프) 재고 소진 임계치 접근</div>
                      <p className="text-[10px] text-rose-700">포항 보관 창고에 잔여 천막 12개 검출됨. 긴급 훈증 수요 급증에 의한 자동 수급 경보 (FR-CTR-006 부합)</p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>아바멕틴 주사 수간 주입제</span>
                        <span className="text-slate-900 font-mono">840 리터 (84%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-600 h-full rounded-full" style={{ width: "84%" }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>메탐소듐 훈증 전용 액제</span>
                        <span className="text-slate-900 font-mono">1,200 리터 (91%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-600 h-full rounded-full" style={{ width: "91%" }} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>목재 자주식 파쇄기 가용도</span>
                        <span className="text-slate-900 font-mono">8대 가동 가능 / 총 12대</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: "66%" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Treatment Priorities weighted multi-factor calculation console (FR-CTR-008) */}
        {activeTab === "priorities" && (
          <motion.div 
            key="priorities-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Weight tuning console */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                  🎛️ 다차원 가중 방제 우선순위 수립
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI 위험점수, 도로 접근 편의도, 소나무림 면적 비율의 가중치를 정교하게 연산하여 실시간 방제 우선순위를 배정합니다.
                </p>
              </div>

              <div className="space-y-5 text-xs font-semibold border-b border-slate-100 pb-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-slate-700">
                    <span>1. XGBoost 예측 위험도 가중치</span>
                    <span className="font-mono text-emerald-800 font-bold">{weightRisk}%</span>
                  </div>
                  <input 
                    type="range" 
                    min={0} 
                    max={100} 
                    value={weightRisk}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setWeightRisk(v);
                      // Autoscale others
                      const rem = 100 - v;
                      setWeightAccess(Math.round(rem / 2));
                      setWeightDensity(100 - v - Math.round(rem / 2));
                    }}
                    className="w-full accent-emerald-800 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-slate-700">
                    <span>2. 도로 접근 및 지형 편의성 가중치</span>
                    <span className="font-mono text-emerald-800 font-bold">{weightAccess}%</span>
                  </div>
                  <input 
                    type="range" 
                    min={0} 
                    max={100} 
                    value={weightAccess}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setWeightAccess(v);
                      const rem = 100 - v;
                      setWeightRisk(Math.round(rem / 2));
                      setWeightDensity(100 - v - Math.round(rem / 2));
                    }}
                    className="w-full accent-emerald-800 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-slate-700">
                    <span>3. 소나무림 밀도 비율 가중치</span>
                    <span className="font-mono text-emerald-800 font-bold">{weightDensity}%</span>
                  </div>
                  <input 
                    type="range" 
                    min={0} 
                    max={100} 
                    value={weightDensity}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setWeightDensity(v);
                      const rem = 100 - v;
                      setWeightRisk(Math.round(rem / 2));
                      setWeightAccess(100 - v - Math.round(rem / 2));
                    }}
                    className="w-full accent-emerald-800 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 text-emerald-800 leading-relaxed text-xs">
                💡 <b>가중치 튜닝 정보:</b> 환경 보호 및 국립공원 인근 구역의 경우 <b>소나무림 밀도</b>에 높은 우선 가중치를 두어 주변 확산을 미연에 방지할 수 있습니다.
              </div>
            </div>

            {/* Calculated Priorities roster */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-6">
                🏆 실시간 가중 종합 방제 등급 및 수치 (FR-CTR-008)
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
                      <th className="py-3 px-3">우선순위</th>
                      <th className="py-3 px-3">지역구명</th>
                      <th className="py-3 px-3">위험점수</th>
                      <th className="py-3 px-3">접근편의도</th>
                      <th className="py-3 px-3 text-right">종합 등급점수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {prioritizedGrids.slice(0, 5).map((g, idx) => (
                      <tr key={g.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3 text-center">
                          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-black ${
                            idx === 0 ? "bg-rose-500 text-white shadow-md shadow-rose-200" : idx === 1 ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-600"
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-3 px-3 truncate max-w-[150px] font-bold text-slate-900">
                          {g.region} <span className="text-[10px] text-slate-400 font-normal font-mono block">{g.id}</span>
                        </td>
                        <td className="py-3 px-3 font-mono">{(g.riskScore * 100).toFixed(0)}%</td>
                        <td className="py-3 px-3 font-mono">{(g as any).accessibility}%</td>
                        <td className="py-3 px-3 text-right text-sm font-black text-emerald-900">
                          {(g as any).priorityScore}점
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* Digital Twin infection spread simulation dashboard (FR-CTR-004) */}
        {activeTab === "simulator" && (
          <motion.div 
            key="simulator-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                🔮 디지털 트윈 기반 예산 및 인원 투입 규모별 확산 차단 효과 (CTR-004)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                투입되는 연간 지자체 방제 예산과 예찰 요원의 실공수 비중에 따라 향후 3년 간의 예상 감염 면적 변화를 동적 그래프로 대조 예측합니다.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-6 text-xs">
                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>지자체 방제 연간 총 예산</span>
                    <span className="font-mono text-emerald-800 font-bold">{budget} 억원</span>
                  </div>
                  <input 
                    type="range" 
                    min={1} 
                    max={50} 
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="w-full accent-emerald-800"
                  />
                  <span className="text-[10px] text-slate-400 block font-medium">※ 예산 증가 시 아바멕틴 수간주사 구매 수량 및 대형 파쇄 장비 투입이 비례 증가합니다.</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>예찰 및 조사 가용 인력 (공수)</span>
                    <span className="font-mono text-emerald-800 font-bold">{headcount} 명</span>
                  </div>
                  <input 
                    type="range" 
                    min={10} 
                    max={150} 
                    value={headcount}
                    onChange={(e) => setHeadcount(Number(e.target.value))}
                    className="w-full accent-emerald-800"
                  />
                  <span className="text-[10px] text-slate-400 block font-medium">※ 요원 수가 증가하면 조기 예찰 확진목 검출 능력이 급격히 제고됩니다.</span>
                </div>
              </div>

              <div className="lg:col-span-8 flex flex-col justify-between">
                {/* Dynamically simulated prediction charts */}
                <div className="bg-slate-900 rounded-2xl h-[220px] p-6 relative flex flex-col justify-between">
                  <span className="text-[10px] text-slate-500 font-bold font-mono uppercase tracking-wider">// DYNAMIC PREDICTION GRAPH (EXPECTED TOTAL HA INFESTATION)</span>
                  
                  <div className="flex items-end justify-between gap-6 px-4 h-[120px] pt-6 border-b border-slate-800 pb-2">
                    {[
                      { year: "2026년", value: 340 },
                      { year: "2027년 (예측)", value: Math.max(20, Math.round(390 - (budget * 5.4) - (headcount * 0.8))) },
                      { year: "2028년 (예측)", value: Math.max(10, Math.round(440 - (budget * 9.8) - (headcount * 1.5))) },
                    ].map((item, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                        <motion.div 
                          animate={{ height: `${(item.value / 450) * 110}px` }}
                          transition={{ type: "spring", stiffness: 80 }}
                          className={`w-10 rounded-t-lg text-center flex items-center justify-center text-[10px] font-bold text-white ${
                            idx === 0 ? "bg-rose-500" : item.value <= 120 ? "bg-emerald-500" : "bg-amber-400"
                          }`}
                        >
                          <span className="drop-shadow-sm font-black">{item.value}ha</span>
                        </motion.div>
                        <span className="text-[10px] text-slate-400 font-semibold font-sans">{item.year}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-slate-400 font-bold text-center">
                    연간 예산 및 공수 조절에 따른 3개년 누적 고사목 확산 시뮬레이션
                  </div>
                </div>

                <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded-2xl border border-emerald-100 text-xs font-semibold leading-relaxed mt-4">
                  💡 <b>디지털 트윈 종합 평가:</b> 현재 가용한 {budget}억원의 방제비 및 {headcount}명의 예찰 인력 확보 시, 2년 뒤인 2028년에는 전국의 예상 감염 피해 면적이 약 <b>{Math.max(10, Math.round(440 - (budget * 9.8) - (headcount * 1.5)))} ha</b> 수준으로 수렴 및 통제될 것으로 분석됩니다.
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
