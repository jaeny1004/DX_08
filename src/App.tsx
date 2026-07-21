/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  TreePine,
  MessageSquare,
  X,
  LayoutDashboard,
  Radar,
  Footprints,
  ShieldCheck,
  FileText,
  Settings,
  FlaskConical,
  AlertTriangle,
  PanelLeftOpen,
  PanelLeftClose,
  Clock3,
  MapPinned,
  Radio,
  LogOut,
} from "lucide-react";

import Dashboard from "./components/Dashboard";
import MonitoringSection from "./components/MonitoringSection";
import FieldSection from "./components/FieldSection";
import ControlSection from "./components/ControlSection";
import AdminSection from "./components/AdminSection";
import SystemSection from "./components/SystemSection";
import Chatbot from "./components/Chatbot";
import SimulationSection from "./components/SimulationSection";
import AuthScreen from "./components/auth/AuthScreen";

import {
  getAccessToken,
  getCurrentUser,
  logout,
} from "./services/authApi";

import {
  AuthUser,
} from "./types/auth";

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

import {
  DispatchAssignment,
  DispatchStatus,
} from "./types/dispatch";

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

  const [
    dispatchAssignments,
    setDispatchAssignments,
  ] = useState<DispatchAssignment[]>(() => {
    try {
      const saved = localStorage.getItem(
        "pwd-dispatch-assignments"
      );

      if (!saved) {
        return [];
      }

      const parsed = JSON.parse(saved);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  });

  const [isChatOpen, setIsChatOpen] =
    useState(false);

  const [isSidebarOpen, setIsSidebarOpen] =
    useState(false);

  const [isAlertPanelOpen, setIsAlertPanelOpen] =
    useState(false);

  const [authUser, setAuthUser] =
    useState<AuthUser | null>(null);

  const [isAuthChecking, setIsAuthChecking] =
    useState(true);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      setIsAuthChecking(false);
      return;
    }

    getCurrentUser()
      .then((user) => {
        setAuthUser(user);
      })
      .catch(() => {
        logout();
        setAuthUser(null);
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "pwd-dispatch-assignments",
      JSON.stringify(dispatchAssignments)
    );
  }, [dispatchAssignments]);

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

  const handleAssignWorker = (
    assignment: DispatchAssignment
  ) => {
    setDispatchAssignments((previous) => {
      const duplicated = previous.some(
        (item) =>
          item.workerId === assignment.workerId &&
          item.gridId === assignment.gridId
      );

      if (duplicated) {
        return previous;
      }

      return [assignment, ...previous];
    });
  };

  const handleUpdateDispatchStatus = (
    assignmentId: string,
    status: DispatchStatus
  ) => {
    setDispatchAssignments((previous) =>
      previous.map((assignment) =>
        assignment.assignmentId === assignmentId
          ? {
              ...assignment,
              status,
            }
          : assignment
      )
    );
  };

  const handleCancelDispatch = (
    assignmentId: string
  ) => {
    setDispatchAssignments((previous) =>
      previous.filter(
        (assignment) =>
          assignment.assignmentId !== assignmentId
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
      label: "종합 상황판",
      icon: LayoutDashboard,
    },
    {
      id: "monitoring",
      label: "병해충 모니터링",
      icon: Radar,
    },
    {
      id: "field",
      label: "현장 스마트 예찰",
      icon: Footprints,
    },
    {
      id: "control",
      label: "방제 사업 관리",
      icon: ShieldCheck,
    },
    {
      id: "admin",
      label: "행정 기안 지원",
      icon: FileText,
    },
    {
      id: "system",
      label: "시스템 보안 관제",
      icon: Settings,
    },
    {
      id: "simulation",
      label: "확산 시뮬레이션",
      icon: FlaskConical,
    },
  ] as const;

  const activeModuleLabel =
    modules.find((module) => module.id === activeModule)?.label ??
    "종합 상황판";

  if (isAuthChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center text-white">
          <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-emerald-600">
            <TreePine size={27} />
          </div>
          <div className="mt-4 text-sm font-extrabold">
            로그인 상태 확인 중...
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthScreen
        onAuthenticated={(user) => {
          setAuthUser(user);
        }}
      />
    );
  }

  const liveAlerts = [
    {
      id: "ALERT-001",
      time: "14:28",
      title: "고위험 후보 격자 위험도 상승",
      description:
        "신규 확산위험 후보지역의 위험도가 상승해 우선 예찰 검토가 필요합니다.",
      tone: "danger" as const,
      icon: Radio,
    },
    {
      id: "ALERT-002",
      time: "14:15",
      title: "접근 취약지역 드론 예찰 검토",
      description:
        "도로 접근성이 낮은 후보지역에 대한 드론 사전 예찰 검토가 요청됐습니다.",
      tone: "warning" as const,
      icon: MapPinned,
    },
    {
      id: "ALERT-003",
      time: "13:30",
      title: "현장 확인 결과 입력 대기",
      description:
        "현장 예찰 완료 격자의 활동보고서 입력 상태를 확인해야 합니다.",
      tone: "info" as const,
      icon: Clock3,
    },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[#F5F7FA] font-sans text-slate-800">
      <div
        className="grid h-full transition-[grid-template-columns] duration-300 ease-out"
        style={{
          gridTemplateColumns: isSidebarOpen
            ? "260px minmax(0, 1fr)"
            : "88px minmax(0, 1fr)",
        }}
      >
        <aside className="relative flex h-full min-w-0 flex-col border-r border-slate-200 bg-white py-4 shadow-sm">
          <div
            className={
              isSidebarOpen
                ? "flex w-full items-center gap-3 px-4"
                : "flex w-full justify-center"
            }
          >
            <button
              type="button"
              onClick={() =>
                setIsAlertPanelOpen((previous) => !previous)
              }
              className={
                isAlertPanelOpen
                  ? "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-rose-300 bg-rose-100 text-rose-700 shadow-sm"
                  : "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm"
              }
              aria-label="실시간 알림 열기"
              title="실시간 알림"
            >
              <AlertTriangle size={25} />

              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-black text-white">
                {liveAlerts.length}
              </span>
            </button>

            {isSidebarOpen && (
              <button
                type="button"
                onClick={() =>
                  setIsAlertPanelOpen((previous) => !previous)
                }
                className="min-w-0 text-left"
              >
                <div className="truncate text-lg font-black text-slate-950">
                  실시간 알림
                </div>

                <div className="mt-0.5 truncate text-[10px] font-bold text-slate-400">
                  미확인 {liveAlerts.length}건
                </div>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setIsSidebarOpen((previous) => !previous)
            }
            className="absolute -right-4 top-[86px] z-30 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:text-emerald-700"
            aria-label={
              isSidebarOpen
                ? "사이드바 닫기"
                : "사이드바 열기"
            }
            title={
              isSidebarOpen
                ? "사이드바 닫기"
                : "사이드바 열기"
            }
          >
            {isSidebarOpen ? (
              <PanelLeftClose size={17} />
            ) : (
              <PanelLeftOpen size={17} />
            )}
          </button>

          <div
            className={
              isSidebarOpen
                ? "mx-4 my-4 h-px bg-slate-200"
                : "mx-auto my-4 h-px w-10 bg-slate-200"
            }
          />

          <nav
            className={
              isSidebarOpen
                ? "flex flex-1 flex-col gap-2 px-3"
                : "flex flex-1 flex-col items-center gap-2"
            }
          >
            {modules.map((module) => {
              const Icon = module.icon;
              const active = activeModule === module.id;

              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setActiveModule(module.id)}
                  title={module.label}
                  aria-label={module.label}
                  className={
                    isSidebarOpen
                      ? active
                        ? "group relative flex h-12 w-full items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-100 px-3 text-left text-emerald-900 shadow-sm"
                        : "group relative flex h-12 w-full items-center gap-3 rounded-xl border border-transparent px-3 text-left text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                      : active
                        ? "group relative flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100 text-emerald-900 shadow-sm"
                        : "group relative flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                  }
                >
                  <Icon size={21} className="shrink-0" />

                  {isSidebarOpen ? (
                    <span className="truncate text-sm font-extrabold">
                      {module.label}
                    </span>
                  ) : (
                    <span className="pointer-events-none absolute left-[58px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg group-hover:block">
                      {module.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div
            className={
              isSidebarOpen
                ? "mx-3 mt-3 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-emerald-800"
                : "mx-auto mt-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-emerald-800"
            }
          >
            <TreePine size={21} className="shrink-0" />

            {isSidebarOpen && (
              <div className="min-w-0">
                <div className="truncate text-xs font-extrabold">
                  PWD-ISCP
                </div>
                <div className="truncate text-[9px] font-bold text-slate-400">
                  의사결정 지원 플랫폼
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
            <div className="flex min-w-0 items-center gap-4">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                  Pine Wilt Control Center
                </div>

                <h1 className="mt-0.5 text-3xl font-black tracking-tight text-slate-950">
                  {activeModule === "dashboard"
                    ? "홈"
                    : activeModuleLabel}
                </h1>
              </div>

              <div className="hidden h-9 w-px bg-slate-200 xl:block" />

              <div className="hidden max-w-[560px] truncate text-xs font-semibold text-slate-500 xl:block">
                AI 기반 소나무재선충병 신규 확산위험 후보 분석 및 우선 예찰 의사결정 지원
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-4 text-[11px] font-bold text-slate-500 xl:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  행정망 연동 정상
                </span>

                <span className="rounded-full bg-slate-100 px-3 py-1.5">
                  PR-AUC 0.3183
                </span>
              </div>

              <div className="hidden text-right sm:block">
                <div className="text-xs font-extrabold text-slate-800">
                  {authUser.name}
                </div>
                <div className="mt-0.5 max-w-[180px] truncate text-[10px] font-bold text-slate-400">
                  {authUser.organization}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  logout();
                  setAuthUser(null);
                  setSelectedGrid(null);
                  setIsChatOpen(false);
                  setIsAlertPanelOpen(false);
                }}
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut size={16} />
                <span className="hidden md:inline">
                  로그아웃
                </span>
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden p-3 xl:p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="h-full min-h-0"
              >
                {activeModule === "dashboard" && (
                  <Dashboard
                    grids={grids}
                    trees={trees}
                    workers={workers}
                    reports={reports}
                    dispatchAssignments={dispatchAssignments}
                    onAssignWorker={handleAssignWorker}
                    onGridSelect={setSelectedGrid}
                    authUser={authUser}
                  />
                )}

                {activeModule === "monitoring" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <MonitoringSection
                      trees={trees}
                      onAddTree={handleAddTree}
                      onUpdateTreeStatus={handleUpdateTreeStatus}
                    />
                  </div>
                )}

                {activeModule === "field" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <FieldSection
                      workers={workers}
                      reports={reports}
                      dispatchAssignments={dispatchAssignments}
                      onUpdateDispatchStatus={handleUpdateDispatchStatus}
                      onCancelDispatch={handleCancelDispatch}
                      onUpdateWorkerStatus={handleUpdateWorkerStatus}
                      onUpdateReportStatus={handleUpdateReportStatus}
                      onConfirmInfection={handleConfirmInfection}
                    />
                  </div>
                )}

                {activeModule === "control" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <ControlSection
                      tasks={tasks}
                      grids={grids}
                      onAddTask={handleAddTask}
                      onUpdateTaskProgress={handleUpdateTaskProgress}
                    />
                  </div>
                )}

                {activeModule === "admin" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <AdminSection />
                  </div>
                )}

                {activeModule === "system" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <SystemSection />
                  </div>
                )}

                {activeModule === "simulation" && (
                  <div className="h-full overflow-y-auto pr-1">
                    <SimulationSection />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {isAlertPanelOpen && (
          <>
            <motion.button
              type="button"
              aria-label="실시간 알림 닫기"
              onClick={() => setIsAlertPanelOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1990] bg-slate-950/20"
            />

            <motion.aside
              initial={{
                opacity: 0,
                x: -18,
                scale: 0.98,
              }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                x: -18,
                scale: 0.98,
              }}
              transition={{
                duration: 0.18,
              }}
              className="fixed left-4 top-4 z-[2000] flex max-h-[calc(100vh-32px)] w-[390px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <div className="text-xs font-extrabold text-rose-600">
                    REAL-TIME ALERT
                  </div>

                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    실시간 통합 알림
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAlertPanelOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="실시간 알림 닫기"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {liveAlerts.map((alert) => {
                  const Icon = alert.icon;

                  const toneClass =
                    alert.tone === "danger"
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : alert.tone === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-blue-200 bg-blue-50 text-blue-800";

                  return (
                    <article
                      key={alert.id}
                      className={`rounded-2xl border p-4 ${toneClass}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80">
                          <Icon size={18} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-extrabold">
                              {alert.title}
                            </h3>

                            <span className="shrink-0 text-[10px] font-black opacity-70">
                              {alert.time}
                            </span>
                          </div>

                          <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
                            {alert.description}
                          </p>

                          <div className="mt-2 text-[10px] font-black opacity-60">
                            {alert.id}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] font-semibold leading-5 text-slate-500">
                알림은 감염 확정이 아닌 신규 확산위험 후보와 현장 확인 필요사항을 안내합니다.
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.button
              type="button"
              aria-label="챗봇 닫기"
              onClick={() => setIsChatOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] bg-slate-950/25 backdrop-blur-[1px]"
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 34,
              }}
              className="fixed bottom-0 right-0 top-0 z-[60] w-full border-l border-slate-200 bg-white shadow-2xl sm:w-[630px]"
            >
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="absolute right-5 top-5 z-50 flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="챗봇 닫기"
              >
                <X size={20} />
              </button>

              <Chatbot selectedGrid={selectedGrid} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {!isChatOpen && (
        <div className="fixed bottom-6 right-6 z-50">
          <motion.button
            type="button"
            onClick={() => setIsChatOpen(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="group relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-400/35 bg-emerald-800 text-white shadow-xl transition-colors hover:bg-emerald-900"
            aria-label="AI 챗봇 열기"
          >
            <MessageSquare size={22} />

            <span className="absolute -right-1 -top-1 animate-bounce rounded-full border border-white bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-emerald-950">
              AI
            </span>

            <span className="pointer-events-none absolute right-16 whitespace-nowrap rounded-xl bg-slate-900/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow transition-all group-hover:opacity-100">
              위험격자·백서 통합 질의 비서
            </span>
          </motion.button>
        </div>
      )}
    </div>
  );
}
