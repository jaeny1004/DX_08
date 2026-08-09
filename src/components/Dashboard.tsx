import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ShieldAlert,
  MapPin,
  Drone,
  CheckCircle,
} from "lucide-react";

import {
  CrowdReport,
  TreeRecord,
} from "../types";

import {
  DispatchAssignment,
} from "../types/dispatch";

import { AuthUser } from "../types/auth";

import DashboardRiskMapCard from "./DashboardRiskMapCard";
import type {
  DashboardMapViewState,
  DashboardRegionStats,
} from "./DashboardRiskMapCard";
import SectionTitle from "./SectionTitle";

interface DashboardLiveAlert {
  id: string;
  time: string;
  title: string;
  tone: "danger" | "warning" | "info";
}

interface DashboardProps {
  title: string;
  trees: TreeRecord[];
  reports: CrowdReport[];
  dispatchAssignments: DispatchAssignment[];
  onAssignWorker: (assignment: DispatchAssignment) => void;
  onGridSelect?: (grid: any) => void;
  authUser: AuthUser;
  liveAlerts: DashboardLiveAlert[];
  /** 탭을 옮겨도 유지되는 지도 상태(App 소유). */
  mapViewStateRef: React.MutableRefObject<DashboardMapViewState>;
}

export default function Dashboard({
  title,
  trees,
  reports,
  dispatchAssignments,
  onAssignWorker,
  onGridSelect,
  authUser,
  liveAlerts,
  mapViewStateRef,
}: DashboardProps) {
  const [now, setNow] = useState(() => new Date());

  // 지도에서 선택한 지역의 고위험 격자 수. 지도 카드가 계산해서 올려준다.
  const [regionStats, setRegionStats] = useState<DashboardRegionStats>({
    regionLabel: "전국",
    highRiskCount: 0,
  });

  // 출동 가능한 전체 요원 수(현장요원 데이터셋 기준).
  const [availableWorkerCount, setAvailableWorkerCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/workforce_v2/worker_current_status.json", {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((rows: Array<{ status?: string }> | null) => {
        if (!rows) return;
        // OFF_DUTY(비번)를 뺀 인원이 실제 배정 가능한 모수다.
        setAvailableWorkerCount(
          rows.filter((row) => row.status === "AVAILABLE").length,
        );
      })
      .catch(() => {
        /* 요원 수는 부가 지표라 실패해도 화면을 막지 않는다 */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const pad2 = (value: number) => String(value).padStart(2, "0");
  const hours24 = now.getHours();
  const period = hours24 < 12 ? "오전" : "오후";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const nowLabel = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${period} ${pad2(hours12)}:${pad2(now.getMinutes())}`;

  const tickerToneClass = (tone: DashboardLiveAlert["tone"]) =>
    tone === "danger"
      ? "text-rose-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-sky-600";
  // 출동 인원은 실제로 배정된 요원 수로 센다.
  // workers state는 아직 비어 있어 예전에는 항상 0명으로 보였다.
  // 같은 요원이 여러 건에 배정될 수 있으므로 요원 기준으로 중복을 제거한다.
  const dispatchedWorkerIds = new Set(
    dispatchAssignments
      .filter((assignment) => assignment.status !== "복귀 완료")
      .map((assignment) => assignment.workerId),
  );
  const activeWorkers = dispatchedWorkerIds.size;

  // 대기 인원은 요원 명단에서 출동 중인 인원을 뺀 값.
  // 명단을 못 받았으면(0명) 대기 인원도 표시하지 않는다.
  const fieldReadyWorkers = Math.max(
    availableWorkerCount - activeWorkers,
    0,
  );

  const reportCount = reports.length;

  const completedTreeCount = trees.filter(
    (tree) => tree.status === "방제완료",
  ).length;

  const controlRate =
    trees.length > 0
      ? (completedTreeCount / trees.length) * 100
      : 0;

  const kpis = [
    {
      id: "risk",
      label: "고위험 지역",
      // 지도에서 선택한 지역 기준(위험등급 "매우 높음"+"높음"). 미선택이면 전국 합계.
      value: `${regionStats.highRiskCount.toLocaleString("ko-KR")}개소`,
      caption: regionStats.regionLabel,
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
      label: "시민 제보 접수",
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
    <div className="flex h-full min-h-0 flex-col">
      <SectionTitle title={title} />

      <div
        className="grid min-h-0 flex-1 gap-3"
        style={{
          gridTemplateRows: "70px 36px minmax(0, 1fr)",
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
                className="flex items-center gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm transition-shadow hover:shadow-md"
              >
                <div
                  className={`shrink-0 rounded-xl p-2 text-white shadow-sm ${kpi.iconClass}`}
                >
                  <Icon size={16} />
                </div>

                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="truncate text-3xs font-extrabold uppercase tracking-wider text-slate-500">
                    {kpi.label}
                  </span>
                  <span className="shrink-0 text-lg font-black tracking-tight text-slate-900">
                    {kpi.value}
                  </span>
                </div>

                <div
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-3xs font-bold ${kpi.badgeClass}`}
                >
                  {kpi.caption}
                </div>
              </motion.article>
            );
          })}
        </section>

        <div className="group relative flex min-h-0 items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex w-max items-center gap-10 whitespace-nowrap text-xs font-bold text-slate-600 [animation:ticker-scroll_28s_linear_infinite] group-hover:[animation-play-state:paused]">
              {[...liveAlerts, ...liveAlerts].map((alert, index) => (
                <span
                  key={`${alert.id}-${index}`}
                  className="inline-flex items-center gap-2"
                >
                  <span className={tickerToneClass(alert.tone)}>●</span>
                  <span className="font-black text-slate-400">
                    {alert.time}
                  </span>
                  {alert.title}
                </span>
              ))}
            </div>
          </div>

          <div className="shrink-0 text-2xs font-bold text-slate-400">
            {nowLabel}
          </div>
        </div>

        <DashboardRiskMapCard
          dispatchAssignments={dispatchAssignments}
          onAssignWorker={onAssignWorker}
          onGridSelect={onGridSelect}
          initialSigunguCode={authUser.sigunguCode}
          initialSigunguName={authUser.sigunguName}
          viewStateRef={mapViewStateRef}
          onRegionStatsChange={setRegionStats}
        />
      </div>
    </div>
  );
}
