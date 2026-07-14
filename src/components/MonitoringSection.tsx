import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ShieldAlert, 
  Layers, 
  MapPin, 
  Camera, 
  Plus, 
  Eye, 
  Wind, 
  Thermometer, 
  Play, 
  Calendar, 
  Check, 
  Trash2 
} from "lucide-react";
import { TreeRecord } from "../types";

interface MonitoringSectionProps {
  trees: TreeRecord[];
  onAddTree: (newTree: TreeRecord) => void;
  onUpdateTreeStatus: (id: string, newStatus: TreeRecord["status"]) => void;
}

export default function MonitoringSection({ 
  trees, 
  onAddTree, 
  onUpdateTreeStatus 
}: MonitoringSectionProps) {
  const [activeTab, setActiveLayer] = useState<"list" | "drone" | "emergence">("list");
  
  // Tree registration form state (FR-MON-002)
  const [region, setRegion] = useState("");
  const [species, setSpecies] = useState<TreeRecord["species"]>("소나무");
  const [severity, setSeverity] = useState<TreeRecord["severity"]>("중");
  const [gpsX, setX] = useState("362947");
  const [gpsY, setY] = useState("289014");
  const [inspector, setInspector] = useState("김지원");
  const [isRegistering, setIsRegistering] = useState(false);

  // Drone Spectral simulation options (FR-MON-004, FR-MON-005)
  const [droneMode, setDroneMode] = useState<"rgb" | "thermal" | "ndvi">("rgb");
  const [aiAnalysisRunning, setAiAnalysisRunning] = useState(false);
  const [aiScore, setAiScore] = useState<number | null>(null);

  // Emergence simulation state (FR-MON-007)
  const [windDirection, setWindDirection] = useState<"NE" | "SW" | "NW" | "SE">("SW");
  const [temperature, setTemperature] = useState<number>(24);
  const [isSimulatingEmergence, setIsSimulatingEmergence] = useState(false);

  // Timeline detailed view selection (FR-MON-003)
  const [selectedTreeId, setSelectedTreeId] = useState<string>(trees[0]?.id || "");

  const handleRegisterTree = (e: React.FormEvent) => {
    e.preventDefault();
    if (!region) return;

    // Simulate coordinates projection conversion to EPSG:5186 (FR-MON-002)
    const newRecord: TreeRecord = {
      id: `PT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      region,
      species,
      confirmedDate: new Date().toISOString().split("T")[0],
      status: "예찰의심",
      severity,
      x: Number(gpsX),
      y: Number(gpsY),
      inspector,
      timeline: [
        { 
          stage: "현장 제보 등록 (MON-002)", 
          date: new Date().toLocaleString(), 
          note: `GPS 등록 완료 (EPSG:5186 가상 투영변화 완료). 피해정도: ${severity}`, 
          actor: inspector 
        }
      ]
    };

    onAddTree(newRecord);
    setRegion("");
    setIsRegistering(false);
  };

  const selectedTree = trees.find(t => t.id === selectedTreeId) || trees[0];

  const handleRunAiAnalysis = () => {
    setAiAnalysisRunning(true);
    setAiScore(null);
    setTimeout(() => {
      setAiAnalysisRunning(false);
      setAiScore(88.4);
    }, 1800);
  };

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/80 text-sm font-bold text-slate-600 max-w-lg">
        <button 
          onClick={() => setActiveLayer("list")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "list" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🌲 확진목 현황 &amp; 상세 이력
        </button>
        <button 
          onClick={() => setActiveLayer("drone")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "drone" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🚁 AI 드론 스펙트럴 분석
        </button>
        <button 
          onClick={() => setActiveLayer("emergence")}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === "emergence" ? "bg-white text-emerald-950 shadow-sm" : "hover:text-slate-900"}`}
        >
          🦟 매개충 확산 시뮬레이션
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "list" && (
          <motion.div 
            key="list-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Outbreak Registry List (FR-MON-001) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      📋 국가 확진목 관리 이력 대장 (MON-001)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      PCR 검사 확진 및 감염 강도에 따라 분류된 고사목 격재 좌표 통계
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="bg-emerald-800 text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-900 transition-colors"
                  >
                    <Plus size={14} />
                    <span>신규 등록</span>
                  </button>
                </div>

                {isRegistering && (
                  <motion.form 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    onSubmit={handleRegisterTree}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 space-y-4"
                  >
                    <div className="text-xs font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-1">
                      <Camera size={14} className="text-emerald-700" />
                      <span>신규 확진 및 예찰 의심 고사목 신규 가입 (FR-MON-002)</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">지역 상세 주소</label>
                        <input 
                          type="text" 
                          required
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="예: 경북 포항시 북구 죽장면 산42"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">수종 선택</label>
                        <select 
                          value={species}
                          onChange={(e) => setSpecies(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
                        >
                          <option>소나무</option>
                          <option>해송</option>
                          <option>잣나무</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">피해 심각 정도</label>
                        <div className="flex gap-4 pt-1 font-bold text-slate-700">
                          {["경", "중", "심"].map((item) => (
                            <label key={item} className="flex items-center gap-1.5 cursor-pointer">
                              <input 
                                type="radio" 
                                name="severity" 
                                checked={severity === item}
                                onChange={() => setSeverity(item as any)}
                                className="accent-emerald-700"
                              />
                              <span>{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">담당 요원 (서명자)</label>
                        <input 
                          type="text" 
                          value={inspector}
                          onChange={(e) => setInspector(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">중부 원점 좌표 X (EPSG:5186)</label>
                        <input 
                          type="text" 
                          value={gpsX}
                          onChange={(e) => setX(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">중부 원점 좌표 Y (EPSG:5186)</label>
                        <input 
                          type="text" 
                          value={gpsY}
                          onChange={(e) => setY(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-medium font-mono"
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
                        대장 추가 등록
                      </button>
                    </div>
                  </motion.form>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50">
                        <th className="py-3 px-3">관리 ID</th>
                        <th className="py-3 px-3">발견 지역</th>
                        <th className="py-3 px-3">수종</th>
                        <th className="py-3 px-3 text-center">심각도</th>
                        <th className="py-3 px-3 text-right">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {trees.map((t) => (
                        <tr 
                          key={t.id} 
                          onClick={() => setSelectedTreeId(t.id)}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${selectedTreeId === t.id ? "bg-emerald-50/60" : ""}`}
                        >
                          <td className="py-3 px-3 font-mono font-bold text-emerald-950">{t.id}</td>
                          <td className="py-3 px-3 truncate max-w-[150px]">{t.region}</td>
                          <td className="py-3 px-3 text-slate-500">{t.species}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              t.severity === "심" ? "bg-rose-100 text-rose-700" : t.severity === "중" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {t.severity}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <select 
                              value={t.status}
                              onChange={(e) => onUpdateTreeStatus(t.id, e.target.value as any)}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] font-bold border border-slate-200 rounded-lg p-1 outline-none bg-white"
                            >
                              <option value="예찰의심">예찰의심</option>
                              <option value="현장확인">현장확인</option>
                              <option value="시료검사">시료검사</option>
                              <option value="확진완료">확진완료</option>
                              <option value="방제대기">방제대기</option>
                              <option value="방제중">방제중</option>
                              <option value="방제완료">방제완료</option>
                              <option value="사후관리">사후관리</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Tree detailed timelines (FR-MON-003) */}
            <div className="lg:col-span-5">
              <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm min-h-[400px]">
                <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                  <span>🧬 감염목 검출 전주기 타임라인 (MON-003)</span>
                  <span className="text-xs text-emerald-800 font-mono font-black">{selectedTree?.id}</span>
                </h3>

                {selectedTree ? (
                  <div className="space-y-6 pt-2">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs">
                      <div className="font-bold text-slate-900 mb-1">위치: {selectedTree.region}</div>
                      <div className="text-[11px] text-slate-500 font-semibold font-mono">가상 중부원점좌표: {selectedTree.x}, {selectedTree.y}</div>
                    </div>

                    <div className="relative border-l-2 border-slate-100 pl-4 ml-2 space-y-5">
                      {selectedTree.timeline.map((step, idx) => (
                        <div key={idx} className="relative">
                          {/* Indicator circle */}
                          <div className="absolute -left-[23px] top-0.5 w-2.5 h-2.5 rounded-full bg-emerald-800 border border-white" />
                          
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>{step.stage}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-medium">{step.date}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{step.note}</p>
                            <div className="text-[10px] text-emerald-700 font-bold">인계인수 주체: {step.actor}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-slate-400 text-xs">
                    대장을 선택하면 타임라인이 출력됩니다.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Drone Image analyzer simulation (FR-MON-004, FR-MON-005) */}
        {activeTab === "drone" && (
          <motion.div 
            key="drone-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                  🚁 드론 텔레메트리 멀티스펙트럴 분광 뷰어
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  RGB 촬영 이미지, 열화상(Thermal), NDVI(식생지수) 분광 분석 오버레이 시뮬레이터 (FR-MON-004, FR-MON-005)
                </p>
              </div>

              {/* Spectral toggles */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">
                <button 
                  onClick={() => setDroneMode("rgb")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${droneMode === "rgb" ? "bg-white text-slate-950 shadow-sm" : ""}`}
                >
                  RGB 실사
                </button>
                <button 
                  onClick={() => setDroneMode("thermal")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${droneMode === "thermal" ? "bg-white text-slate-950 shadow-sm" : ""}`}
                >
                  열화상 분광
                </button>
                <button 
                  onClick={() => setDroneMode("ndvi")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${droneMode === "ndvi" ? "bg-white text-slate-950 shadow-sm" : ""}`}
                >
                  NDVI 식생
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                {/* Simulated Camera Feed Grid Canvas */}
                <div className="bg-slate-900 rounded-3xl aspect-[16/9] w-full relative overflow-hidden flex items-center justify-center border border-slate-800">
                  
                  {/* Dynamic Color filter based on Spectral mode */}
                  {droneMode === "rgb" && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900 via-emerald-850 to-green-950 flex flex-col justify-between p-6">
                      <div className="relative border border-emerald-500/40 w-full h-full rounded-2xl flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full border-2 border-emerald-400/80 animate-ping absolute" />
                        <div className="border border-emerald-400 px-3 py-1 text-[10px] text-emerald-400 font-mono font-bold rounded-lg backdrop-blur-sm">
                          RGB LIVE: 수관 우거짐 수림 구역 스캔 중
                        </div>
                      </div>
                    </div>
                  )}

                  {droneMode === "thermal" && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-purple-900 via-orange-800 to-indigo-950 flex flex-col justify-between p-6">
                      <div className="relative border border-amber-500/40 w-full h-full rounded-2xl flex items-center justify-center">
                        {/* Red Heat spots symbolizing infested dry tree water transpiration failure */}
                        <div className="absolute top-1/3 left-1/3 w-20 h-20 rounded-full bg-rose-500/80 filter blur-xl animate-pulse" />
                        <div className="absolute top-1/2 right-1/4 w-12 h-12 rounded-full bg-red-400/90 filter blur-lg animate-pulse" />
                        <div className="border border-amber-400 px-3 py-1 text-[10px] text-amber-400 font-mono font-bold rounded-lg backdrop-blur-sm">
                          THERMAL: 고사 수관부 발열 밀집대 감지 (+4.5°C 편차)
                        </div>
                      </div>
                    </div>
                  )}

                  {droneMode === "ndvi" && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-yellow-700 via-amber-800 to-emerald-950 flex flex-col justify-between p-6">
                      <div className="relative border border-yellow-500/40 w-full h-full rounded-2xl flex items-center justify-center">
                        {/* Yellow spots indicating low chlorophyll density */}
                        <div className="absolute top-1/3 left-1/3 w-24 h-24 rounded-full bg-yellow-400/40 border-2 border-dashed border-yellow-300 flex items-center justify-center">
                          <span className="text-[10px] text-yellow-300 font-bold">NDVI &lt; 0.15</span>
                        </div>
                        <div className="border border-yellow-400 px-3 py-1 text-[10px] text-yellow-400 font-mono font-bold rounded-lg backdrop-blur-sm">
                          NDVI: 광합성 엽록소 반사율 급감 분석
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Camera Reticle Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[85%] h-[80%] border border-dashed border-white/25 rounded-2xl relative">
                      <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-white" />
                      <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-white" />
                      <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-white" />
                      <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-white" />
                    </div>
                  </div>

                  {/* Corner telemetry info */}
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 text-[10px] text-white font-mono space-y-1">
                    <div>DRONE: DR-204 (78%)</div>
                    <div>ALT: 120.4m</div>
                    <div>COORDS: X 362947 / Y 289014</div>
                  </div>
                </div>
              </div>

              {/* AI analysis result sidebar (FR-MON-005) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">AI 이미지 병변 분석 모델</h4>
                  
                  <div className="space-y-3">
                    <button 
                      onClick={handleRunAiAnalysis}
                      disabled={aiAnalysisRunning}
                      className="w-full bg-emerald-800 text-white rounded-xl py-3 text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-900 transition-colors disabled:bg-slate-300"
                    >
                      {aiAnalysisRunning ? "격자 화소 분석 중..." : "AI 감염 정밀 판독 실행"}
                    </button>
                    
                    {aiAnalysisRunning && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div className="bg-emerald-600 h-full w-[60%] animate-pulse" />
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold block text-center">전기 전도성 및 분광 밴드 화소 연산 중...</span>
                      </div>
                    )}

                    {aiScore !== null && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white border border-slate-200 p-4 rounded-xl space-y-3"
                      >
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-600">감염 매핑 신뢰도</span>
                          <span className="text-rose-600 text-sm font-black">{aiScore}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-rose-500 h-full rounded-full" style={{ width: `${aiScore}%` }} />
                        </div>
                        
                        <div className="text-[11px] text-slate-500 font-medium leading-relaxed">
                          🔍 <b>판독 근거:</b> 식생 NDVI 대조 결과 0.12로 떨어져 수분 고사 징후가 현저하며, 열화상 이미지 상 주변 정상 임목 대비 4.2도 높게 측정되어 소나무재선충 기생에 의한 수분 통로 차단 상태로 분석됩니다.
                        </div>

                        <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                          <span className="text-[10px] text-emerald-800 font-bold">요구사항 FR-MON-005 부합</span>
                          <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-black border border-rose-100">위험 판단</span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Emergence Vector Beetle flight path spread simulator (FR-MON-007) */}
        {activeTab === "emergence" && (
          <motion.div 
            key="emergence-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                🦟 매개충 성충 우화 및 비행 방향 공간 확산 시뮬레이터 (FR-MON-007)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                바람길(Wind flow), 지상 평균 기온(Temperature)을 기반으로 솔수염하늘소와 북방수염하늘소의 최장 확산 예상 범위 연산
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Simulator Options bar */}
              <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-5 text-xs">
                <div className="space-y-2">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Thermometer size={14} className="text-rose-500" />
                    <span>평균 기온 설정</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min={15} 
                      max={32} 
                      value={temperature}
                      onChange={(e) => setTemperature(Number(e.target.value))}
                      className="w-full accent-emerald-700"
                    />
                    <span className="font-mono font-bold text-slate-900 bg-white border px-2 py-1 rounded shadow-sm text-xs shrink-0">{temperature}°C</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block font-medium">※ 기온이 25°C를 초과할 경우 우화 성충의 날개 근육 활성도가 극대화되어 비행 거리가 최대 1.8배 증가합니다.</span>
                </div>

                <div className="space-y-2">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Wind size={14} className="text-sky-500" />
                    <span>풍향풍속 풍속계</span>
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {(["SW", "NE", "NW", "SE"] as const).map((dir) => (
                      <button
                        key={dir}
                        onClick={() => setWindDirection(dir)}
                        className={`py-2 rounded-lg font-bold border ${windDirection === dir ? "bg-emerald-800 text-white border-emerald-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                      >
                        {dir}풍
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setIsSimulatingEmergence(true);
                    setTimeout(() => setIsSimulatingEmergence(false), 2500);
                  }}
                  className="w-full bg-emerald-800 text-white py-3 rounded-xl font-bold hover:bg-emerald-900 flex items-center justify-center gap-2"
                >
                  <Play size={14} />
                  <span>확산 경로 예측 시뮬레이션 가동</span>
                </button>
              </div>

              {/* Simulating visualization canvas */}
              <div className="lg:col-span-8">
                <div className="bg-gradient-to-br from-teal-50 to-green-50/60 border border-slate-200 rounded-3xl h-[320px] relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 grid grid-cols-12 gap-0.5 pointer-events-none opacity-20">
                    {Array.from({ length: 120 }).map((_, i) => (
                      <div key={i} className="border-t border-l border-slate-400/20 w-full h-12" />
                    ))}
                  </div>

                  {/* Hotspot source wood */}
                  <div className="absolute text-center space-y-1 shrink-0 z-10">
                    <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center text-white border-2 border-white shadow-lg animate-pulse">
                      🌲
                    </div>
                    <span className="text-[10px] bg-slate-900/90 text-white px-2 py-0.5 rounded-full font-bold">감염 핵심지</span>
                  </div>

                  {/* Wind Direction indicators */}
                  <div className="absolute top-4 left-4 bg-white/90 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] text-slate-600 font-bold space-y-0.5">
                    <div>우화 시기: 5월~7월 하순</div>
                    <div>적합 매개충: 솔수염하늘소</div>
                    <div className="text-emerald-700">비행 근육 상태: {temperature >= 25 ? "매우 활발" : "보통 활발"}</div>
                  </div>

                  {/* Motion spread path */}
                  {isSimulatingEmergence && (
                    <motion.div 
                      initial={{ scale: 1, opacity: 0.8 }}
                      animate={{ 
                        scale: temperature >= 25 ? 4.5 : 2.8, 
                        opacity: 0,
                        x: windDirection === "SW" ? 140 : windDirection === "NE" ? -140 : windDirection === "NW" ? 140 : -140,
                        y: windDirection === "SW" ? -80 : windDirection === "NE" ? 80 : windDirection === "NW" ? 80 : -80
                      }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                      className="absolute w-16 h-16 rounded-full border-2 border-dashed border-rose-500 bg-rose-300/20 z-0 flex items-center justify-center"
                    >
                      <span className="text-[8px] text-rose-700 font-bold">최장비행선</span>
                    </motion.div>
                  )}

                  {/* Simulation overlay results text */}
                  <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md rounded-2xl p-3 border border-white/10 text-white text-[11px] font-medium leading-relaxed z-10">
                    🌐 <b>풍향 확산 시뮬레이션 결과:</b> 금일 {windDirection}풍기류 및 지상 {temperature}°C 조건 하에서 우화한 솔수염하늘소 성충은 풍속 가중에 따라 {windDirection === "SW" ? "북동(NE)" : windDirection === "NE" ? "남서(SW)" : windDirection === "NW" ? "남동(SE)" : "북서(NW)"} 방향으로 최대 <b>{temperature >= 25 ? "2.4km" : "1.2km"}</b> 영역에 걸쳐 비행 확산될 가능성이 농후합니다. 해당 통로 내 소나무림에 대한 <b>우선 방제 나무주사</b>를 주입하십시오.
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
