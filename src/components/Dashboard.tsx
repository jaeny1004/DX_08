import { motion } from "motion/react";
import {
  ShieldAlert,
  MapPin,
  Drone,
  CheckCircle,
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

import DashboardRiskMapCard from "./DashboardRiskMapCard";

interface DashboardProps {
  grids: GridCell[];
  trees: TreeRecord[];
  workers: WorkerStatus[];
  reports: CrowdReport[];
  dispatchAssignments: DispatchAssignment[];
  onAssignWorker: (assignment: DispatchAssignment) => void;
  onGridSelect?: (grid: any) => void;
}

export default function Dashboard({
  grids,
  trees,
  workers,
  reports,
  dispatchAssignments,
  onAssignWorker,
  onGridSelect,
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

      <DashboardRiskMapCard
        dispatchAssignments={dispatchAssignments}
        onAssignWorker={onAssignWorker}
        onGridSelect={onGridSelect}
      />
    </div>
  );
}
