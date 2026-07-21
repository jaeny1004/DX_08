import {
  AnimatePresence,
  motion,
} from "motion/react";
import {
  ShieldAlert,
  MapPin,
  Drone,
  CheckCircle,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  CrowdReport,
  GridCell,
  TreeRecord,
  WorkerStatus,
} from "../types";

import {
  DispatchAssignment,
} from "../types/dispatch";

import { AuthUser } from "../types/auth";

import DashboardRiskMapCard from "./DashboardRiskMapCard";

interface LiveAlert {
  id: string;
  time: string;
  title: string;
  description: string;
  tone: "danger" | "warning" | "info";
  icon: LucideIcon;
}

interface DashboardProps {
  grids: GridCell[];
  trees: TreeRecord[];
  workers: WorkerStatus[];
  reports: CrowdReport[];
  dispatchAssignments: DispatchAssignment[];
  onAssignWorker: (assignment: DispatchAssignment) => void;
  onGridSelect?: (grid: any) => void;
  authUser: AuthUser;
  isAlertPanelOpen: boolean;
  onCloseAlertPanel: () => void;
  liveAlerts: LiveAlert[];
}

export default function Dashboard({
  grids,
  trees,
  workers,
  reports,
  dispatchAssignments,
  onAssignWorker,
  onGridSelect,
  authUser,
  isAlertPanelOpen,
  onCloseAlertPanel,
  liveAlerts,
}: DashboardProps) {
  const activeWorkers = workers.filter(
    (worker) => worker.status !== "대기",
  ).length;

  const fieldReadyWorkers = workers.filter(
    (worker) => worker.status === "대기",
  ).length;

  const reportCount = reports.length;

  const completedTreeCount = trees.filter(
    (tree) => tree.status === "방제완료",
  ).length;

  const controlRate =
    trees.length > 0
      ? (completedTreeCount / trees.length) * 100
      : 0;

  const highRiskGridCount = grids.filter(
    (grid) => grid.riskScore >= 0.7,
  ).length;

  const kpis = [
    {
      id: "risk",
      label: "고위험 위험 지역",
      value: `${highRiskGridCount.toLocaleString("ko-KR")}개소`,
      caption: "신규 확산위험 후보",
      icon: ShieldAlert,
      iconClass: "bg-rose-500",
      accentClass: "bg-rose-50",
      badgeClass: "border-rose-100 bg-rose-50 text-rose-600",
    },
    {
      id: "worker",
      label: "현장 요원 출동 현황",
      value: `${activeWorkers.toLocaleString("ko-KR")}명`,
      caption: `대기 ${fieldReadyWorkers.toLocaleString("ko-KR")}명`,
      icon: MapPin,
      iconClass: "bg-amber-500",
      accentClass: "bg-amber-50",
      badgeClass: "border-amber-100 bg-amber-50 text-amber-600",
    },
    {
      id: "drone",
      label: "예찰 제보 접수",
      value: `${reportCount.toLocaleString("ko-KR")}건`,
      caption: "현장 확인 연계 대상",
      icon: Drone,
      iconClass: "bg-blue-500",
      accentClass: "bg-blue-50",
      badgeClass: "border-blue-100 bg-blue-50 text-blue-600",
    },
    {
      id: "control",
      label: "전체 방제 처리율",
      value: `${controlRate.toFixed(1)}%`,
      caption: "등록 대상 기준",
      icon: CheckCircle,
      iconClass: "bg-emerald-500",
      accentClass: "bg-emerald-50",
      badgeClass: "border-emerald-100 bg-emerald-50 text-emerald-600",
    },
  ];

  return (
    <div
      className="grid min-h-0 gap-3"
      style={{
        height: "calc(100vh - 178px)",
        gridTemplateRows: "108px minmax(0, 1fr)",
      }}
    >
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;

          return (
            <motion.article
              key={kpi.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className={`absolute right-0 top-0 h-20 w-20 translate-x-7 -translate-y-7 rounded-full transition-transform duration-300 group-hover:scale-110 ${kpi.accentClass}`}
              />

              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    {kpi.label}
                  </div>
                  <div className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                    {kpi.value}
                  </div>
                  <div
                    className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${kpi.badgeClass}`}
                  >
                    {kpi.caption}
                  </div>
                </div>

                <div
                  className={`rounded-xl p-2.5 text-white shadow-sm ${kpi.iconClass}`}
                >
                  <Icon size={20} />
                </div>
              </div>
            </motion.article>
          );
        })}
      </section>

      <div className="relative min-h-0 overflow-hidden rounded-2xl">
        <DashboardRiskMapCard
          dispatchAssignments={dispatchAssignments}
          onAssignWorker={onAssignWorker}
          onGridSelect={onGridSelect}
          initialSigunguCode={authUser.sigunguCode}
          initialSigunguName={authUser.sigunguName}
        />

        <AnimatePresence>
          {isAlertPanelOpen && (
            <>
              <motion.button
                type="button"
                aria-label="실시간 알림 닫기"
                onClick={onCloseAlertPanel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[900] bg-slate-950/20"
              />

              <motion.aside
                initial={{ opacity: 0, x: -18, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -18, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="absolute left-4 top-4 z-[1000] flex max-h-[calc(100%-32px)] w-[390px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
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
                    onClick={onCloseAlertPanel}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
                  알림은 감염 확정이 아닌 신규 확산위험 후보와 현장 확인
                  필요사항을 안내합니다.
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
