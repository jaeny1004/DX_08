import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Plus,
  Database,
  Settings,
  AlertCircle
} from "lucide-react";
import { ControlTask, GridCell } from "../types";
import SectionTitle from "./SectionTitle";

interface ControlSectionProps {
  title: string;
  tasks: ControlTask[];
  grids: GridCell[];
  onAddTask: (task: ControlTask) => void;
  onUpdateTaskProgress: (id: string, progress: number) => void;
}

export default function ControlSection({
  title,
  tasks,
  onAddTask,
  onUpdateTaskProgress
}: ControlSectionProps) {
  // CTR-003 Registration Form
  const [area, setArea] = useState("");
  const [method, setMethod] = useState<ControlTask["method"]>("파쇄");
  const [company, setCompany] = useState("동해산림방제(주)");
  const [workers, setWorkers] = useState(10);
  const [isRegistering, setIsRegistering] = useState(false);

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
      <SectionTitle title={title} />

      {(
          <motion.div
            key="operations-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* 1행: 감염목 방제 작업 리스트 (전체 폭). 지도 추가 예정 — 지금은 목록 1칸만 채움 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      📋 감염목 방제 작업 리스트
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      방제 작업 리스트의 상세 정보를 관리합니다.
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
                        <th className="py-3 px-3">진척률</th>
                        <th className="py-3 px-3 text-right">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {tasks.map((task) => (
                        <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-3 font-mono font-bold text-emerald-950">{task.id}</td>
                          <td className="py-4 px-3 max-w-[140px] truncate">{task.area}</td>
                          <td className="py-4 px-3">
                            <span className={`px-2 py-0.5 rounded text-3xs font-bold border ${getMethodBadge(task.method)}`}>
                              {task.method}
                            </span>
                          </td>
                          <td className="py-4 px-3 truncate text-slate-500 max-w-[120px]">{task.company}</td>
                          <td className="py-4 px-3">
                            <div className="space-y-1 max-w-[120px]">
                              <div className="flex justify-between text-3xs font-bold">
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
                          <td className="py-4 px-3 text-right text-slate-600 font-bold">
                            {task.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 지도 추가 예정: 여기에 lg:col-span-4 등으로 목록과 나란히 배치 예정 */}
            </div>

            {/* 2행: 약제 및 방제 소모품 재고 (전체 폭) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Database size={16} className="text-emerald-700" />
                  <span>약제 및 방제 소모품 재고</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  실시간 재고 및 방제 장비 가동 현황을 확인합니다.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold border-t border-slate-100 pt-4">
                <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl flex gap-3">
                  <AlertCircle className="text-rose-500 shrink-0" size={18} />
                  <div className="space-y-1">
                    <div className="font-bold text-rose-900">훈증 천막 재고 소진</div>
                    <p className="text-3xs text-rose-700">포항 보관 창고 잔여 12개 · 긴급 발주 권장</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-600">아바멕틴 주사 수간 주입제</div>
                  <div className="text-slate-900 font-mono">840 리터 (84%)</div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full rounded-full" style={{ width: "84%" }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-600">메탐소듐 훈증 전용 액제</div>
                  <div className="text-slate-900 font-mono">1,200 리터 (91%)</div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full rounded-full" style={{ width: "91%" }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-600">목재 자주식 파쇄기 가동도</div>
                  <div className="text-slate-900 font-mono">8 / 12대</div>
                  <div className="grid grid-cols-6 gap-1 pt-1">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-3 rounded-sm ${i < 8 ? "bg-emerald-500" : "bg-slate-100"}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
      )}
    </div>
  );
}
