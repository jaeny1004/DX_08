/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  TreePine,
  MessageSquare,
  X,
  Calendar,
  Activity,
} from "lucide-react";

import Dashboard from "./components/Dashboard";
import MonitoringSection from "./components/MonitoringSection";
import FieldSection from "./components/FieldSection";
import ControlSection from "./components/ControlSection";
import AdminSection from "./components/AdminSection";
import SystemSection from "./components/SystemSection";
import Chatbot from "./components/Chatbot";
import SimulationSection from "./components/SimulationSection";

import {
  initialGrids,
  initialTrees,
  initialWorkers,
  initialCrowdReports,
  initialControlTasks,
  GridCell,
  TreeRecord,
  WorkerStatus,
  CrowdReport,
  ControlTask,
} from "./types";

type ModuleId =
  | "dashboard"
  | "monitoring"
  | "field"
  | "control"
  | "admin"
  | "system"
  | "simulation";

export default function App() {
  const [activeModule, setActiveModule] =
    useState<ModuleId>("dashboard");

  const [grids] =
    useState<GridCell[]>(initialGrids);

  const [trees, setTrees] =
    useState<TreeRecord[]>(initialTrees);

  const [workers, setWorkers] =
    useState<WorkerStatus[]>(initialWorkers);

  const [reports, setReports] =
    useState<CrowdReport[]>(initialCrowdReports);

  const [tasks, setTasks] =
    useState<ControlTask[]>(initialControlTasks);

  const [selectedGrid, setSelectedGrid] =
    useState<any>(null);

  const [isChatOpen, setIsChatOpen] =
    useState(false);

  const handleAddTree = (
    newTree: TreeRecord
  ) => {
    setTrees((prev) => [
      newTree,
      ...prev,
    ]);
  };

  const handleUpdateTreeStatus = (
    id: string,
    newStatus: TreeRecord["status"]
  ) => {
    setTrees((prev) =>
      prev.map((tree) => {
        if (tree.id !== id) {
          return tree;
        }

        const updatedTimeline = [
          ...tree.timeline,
          {
            stage: `상태 변경: ${newStatus}`,
            date: new Date().toLocaleString(),
            note:
              `운영 서버에서 상태를 ` +
              `[${tree.status}]에서 ` +
              `[${newStatus}]로 조정 연동 완료.`,
            actor: "산림청 통합시스템",
          },
        ];

        return {
          ...tree,
          status: newStatus,
          timeline: updatedTimeline,
        };
      })
    );
  };

  const handleUpdateWorkerStatus = (
    id: string,
    status: WorkerStatus["status"]
  ) => {
    setWorkers((prev) =>
      prev.map((worker) =>
        worker.id === id
          ? {
              ...worker,
              status,
            }
          : worker
      )
    );
  };

  const handleUpdateReportStatus = (
    id: string,
    status: CrowdReport["status"]
  ) => {
    setReports((prev) =>
      prev.map((report) =>
        report.id === id
          ? {
              ...report,
              status,
            }
          : report
      )
    );
  };

  const handleConfirmInfection = (
    report: CrowdReport
  ) => {
    const newTree: TreeRecord = {
      id:
        `PT-${new Date().getFullYear()}-` +
        `${Math.floor(
          1000 + Math.random() * 9000
        )}`,
      region: report.region,
      species: "소나무",
      confirmedDate:
        new Date()
          .toISOString()
          .split("T")[0],
      status: "확진완료",
      severity: "중",
      x:
        362947 +
        Math.floor(
          Math.random() * 400
        ),
      y:
        289014 +
        Math.floor(
          Math.random() * 400
        ),
      inspector:
        "시민 " + report.reporter,
      timeline: [
        {
          stage:
            "시민 제보 확진 대장 전환 완료 " +
            "(FR-FLD-006)",
          date:
            new Date().toLocaleString(),
          note:
            `시민 제보 [${report.title}] ` +
            `기반으로 전주기 타임라인 대입 연동. ` +
            `AI 신뢰도: ${report.aiProbability}%`,
          actor: "행정관 주무관",
        },
      ],
    };

    handleAddTree(newTree);
  };

  const handleAddTask = (
    newTask: ControlTask
  ) => {
    setTasks((prev) => [
      newTask,
      ...prev,
    ]);
  };

  const handleUpdateTaskProgress = (
    id: string,
    progress: number
  ) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) {
          return task;
        }

        const isComplete =
          progress >= 100;

        return {
          ...task,
          progress,
          status:
            isComplete
              ? "완료"
              : ("진행" as any),
        };
      })
    );
  };

  const modules = [
    {
      id: "dashboard",
      label: "🏠 종합 상황판",
      desc: "HOM-001 위성 상황 대시보드",
    },
    {
      id: "monitoring",
      label: "🌲 병해충 모니터링",
      desc: "MON-001 드론 및 감염목 감시",
    },
    {
      id: "field",
      label: "🚶 현장 스마트 예찰",
      desc: "FLD-001 스마트 출동 및 시민 참여",
    },
    {
      id: "control",
      label: "🛡️ 방제 사업 관리",
      desc: "CTR-001 AI 우선순위 및 실적 관리",
    },
    {
      id: "admin",
      label: "📋 행정 기안 지원",
      desc: "ADM-001 행정 문서 자동 생성",
    },
    {
      id: "system",
      label: "⚙️ 시스템 보안 관제",
      desc: "SYS-001 데이터 검증 및 ML 성능",
    },
    {
      id: "simulation",
      label: "🧪 확산 시뮬레이션",
      desc: "SIM-001 방제 전후 위험 변화",
    },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      <header className="bg-emerald-950 border-b border-emerald-900 sticky top-0 z-40 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-500 flex items-center justify-center text-white border border-emerald-400/40 shadow-inner">
              <TreePine
                size={22}
                className="animate-pulse"
              />
            </div>

            <div>
              <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5 uppercase">
                <span>
                  소나무재선충병 통합 예찰·방제 정보 플랫폼
                </span>

                <span className="text-[10px] bg-amber-400 text-emerald-950 font-bold px-2 py-0.5 rounded-full">
                  국가 표준 시범 시스템
                </span>
              </h1>

              <p className="text-[10px] text-emerald-300 font-semibold mt-0.5">
                Pine Wilt Disease Integrated Surveillance &amp; Control Platform (PWD-ISCP)
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-6 text-[11px] font-bold font-mono text-emerald-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>행정망 연동: 정상</span>
            </div>

            <div className="flex items-center gap-1.5 border-l border-emerald-800 pl-6">
              <Calendar
                size={12}
                className="text-amber-300"
              />
              <span>관제 기간: 2016-2026 타임랩스 활성</span>
            </div>

            <div className="flex items-center gap-1.5 border-l border-emerald-800 pl-6">
              <Activity
                size={12}
                className="text-rose-400"
              />
              <span>XGBoost·LightGBM 앙상블: PR-AUC 0.3183</span>
            </div>
          </div>
        </div>

        <div className="bg-emerald-900 border-t border-emerald-850/80">
          <div className="max-w-7xl mx-auto px-4 overflow-x-auto">
            <div className="flex gap-2 py-2 shrink-0">
              {modules.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() =>
                    setActiveModule(module.id)
                  }
                  className={
                    `px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex flex-col items-start ` +
                    `${
                      activeModule === module.id
                        ? "bg-white text-emerald-950 shadow-sm"
                        : "text-emerald-100 hover:bg-emerald-850 hover:text-white"
                    }`
                  }
                >
                  <span>{module.label}</span>

                  <span
                    className={
                      `text-[9px] font-medium mt-0.5 ` +
                      `${
                        activeModule === module.id
                          ? "text-slate-500"
                          : "text-emerald-300/80"
                      }`
                    }
                  >
                    {module.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeModule}
            initial={{
              opacity: 0,
              y: 15,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: -15,
            }}
            transition={{
              duration: 0.25,
            }}
            className="space-y-6"
          >
            {activeModule === "dashboard" && (
              <Dashboard
                grids={grids}
                trees={trees}
                workers={workers}
                reports={reports}
                onGridSelect={setSelectedGrid}
              />
            )}

            {activeModule === "monitoring" && (
              <MonitoringSection
                trees={trees}
                onAddTree={handleAddTree}
                onUpdateTreeStatus={handleUpdateTreeStatus}
              />
            )}

            {activeModule === "field" && (
              <FieldSection
                workers={workers}
                reports={reports}
                onUpdateWorkerStatus={handleUpdateWorkerStatus}
                onUpdateReportStatus={handleUpdateReportStatus}
                onConfirmInfection={handleConfirmInfection}
              />
            )}

            {activeModule === "control" && (
              <ControlSection
                tasks={tasks}
                grids={grids}
                onAddTask={handleAddTask}
                onUpdateTaskProgress={handleUpdateTaskProgress}
              />
            )}

            {activeModule === "admin" && (
              <AdminSection />
            )}

            {activeModule === "system" && (
              <SystemSection />
            )}

            {activeModule === "simulation" && (
              <SimulationSection />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.button
              type="button"
              aria-label="챗봇 닫기"
              onClick={() =>
                setIsChatOpen(false)
              }
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
              className="fixed inset-0 z-[55] bg-slate-950/25 backdrop-blur-[1px]"
            />

            <motion.aside
              initial={{
                x: "100%",
              }}
              animate={{
                x: 0,
              }}
              exit={{
                x: "100%",
              }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 34,
              }}
              className="fixed right-0 top-0 bottom-0 z-[60] w-full sm:w-[630px] bg-white shadow-2xl border-l border-slate-200"
            >
              <button
                type="button"
                onClick={() =>
                  setIsChatOpen(false)
                }
                className="absolute top-5 right-5 z-50 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="챗봇 닫기"
              >
                <X size={20} />
              </button>

              <Chatbot
                selectedGrid={selectedGrid}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {!isChatOpen && (
        <div className="fixed bottom-6 right-6 z-50">
          <motion.button
            type="button"
            onClick={() =>
              setIsChatOpen(true)
            }
            whileHover={{
              scale: 1.05,
            }}
            whileTap={{
              scale: 0.95,
            }}
            className="w-14 h-14 rounded-full bg-emerald-800 text-white shadow-xl hover:bg-emerald-900 transition-colors flex items-center justify-center border-2 border-emerald-400/35 relative group"
            aria-label="AI 챗봇 열기"
          >
            <MessageSquare size={22} />

            <span className="absolute -top-1 -right-1 bg-amber-400 text-emerald-950 font-black text-[9px] px-1.5 py-0.5 rounded-full border border-white animate-bounce">
              AI
            </span>

            <span className="absolute right-16 bg-slate-900/90 text-white text-[10px] font-bold py-1 px-2.5 rounded-xl shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
              위험격자·백서 통합 질의 비서
            </span>
          </motion.button>
        </div>
      )}

      <footer className="bg-slate-900 text-slate-500 py-6 border-t border-slate-800 mt-auto text-center text-xs">
        <div className="max-w-7xl mx-auto px-4 space-y-1.5 font-medium">
          <p>
            산림청·지자체 소나무재선충병 특별 방제대책본부
            (R&amp;D 통합 실증 인프라)
          </p>

          <p className="text-[10px] text-slate-600 font-mono">
            PWD Integrated Surveillance and Control Platform (PWD-ISCP) |
            Designed for High Efficiency Operations
          </p>
        </div>
      </footer>
    </div>
  );
}
