import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Battery,
  ListCheckIcon,
  MapPin,
  Minus,
  Navigation,
  Plus,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import type { ControlTask, GridCell } from "../types";
import type {
  DispatchAssignment,
  DispatchStatus,
} from "../types/dispatch";
import {
  CONTROL_OPERATIONS,
  attachFallbackOperationLocation,
  type ControlOperation,
} from "../config/operationsMockData";
import { ControlOperationsMap } from "./ControlOperationsMap";
import { InventoryPanel } from "./InventoryPanel";
import {
  formatGridLocation,
  loadGridLookup,
  resolveGridByRegionText,
  resolveGridLocation,
} from "../utils/gridLookup";
import {
  filterAssignable,
  loadWorkforce,
  type WorkforceMember,
} from "../utils/workforce";

/** 두 지점 사이 거리(km). 요원을 가까운 순으로 정렬할 때 쓴다. */
function distanceKmBetween(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface ControlSectionProps {
  mode: "status" | "work";
  tasks: ControlTask[];
  grids: GridCell[];
  dispatchAssignments?: DispatchAssignment[];
  onAddTask: (task: ControlTask) => void;
  onUpdateTaskProgress: (id: string, progress: number) => void;
  onUpdateDispatchStatus?: (
    assignmentId: string,
    status: DispatchStatus,
  ) => void;
}

const DISPATCH_PROGRESS: Record<DispatchStatus, number> = {
  "배정 대기": 0,
  // 배정 직후 '진행'으로 잡히는 단계는 10%에서 시작한다.
  "배정 수락": 10,
  "출동": 10,
  "현장 도착": 40,
  "작업 중": 60,
  "작업 완료": 100,
  "복귀": 100,
  "복귀 완료": 100,
};

function controlTaskStatus(
  status: DispatchStatus,
): ControlTask["status"] {
  if (
    status === "작업 완료" ||
    status === "복귀" ||
    status === "복귀 완료"
  ) {
    return "완료";
  }

  if (
    status === "출동" ||
    status === "현장 도착" ||
    status === "작업 중"
  ) {
    return "진행";
  }

  return "예정";
}

function dispatchToControlOperation(
  assignment: DispatchAssignment,
  index: number,
): ControlOperation {
  const latitude = Number(assignment.targetLatitude);
  const longitude = Number(assignment.targetLongitude);
  const assignedAt = new Date(assignment.assignedAt);
  const startDate = Number.isNaN(assignedAt.getTime())
    ? new Date()
    : assignedAt;
  const endDate = new Date(
    startDate.getTime() + 7 * 24 * 60 * 60 * 1000,
  );
  const area = [
    assignment.targetSidoName,
    assignment.targetSigunguName,
    assignment.targetEmdName,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: `CTR-${assignment.gridId}-${assignment.workerId}`,
    assignmentId: assignment.assignmentId,
    area: area || `GRID-${assignment.gridId}`,
    method: "훈증",
    status: controlTaskStatus(assignment.status),
    company: `${assignment.assignmentType} 방제팀`,
    workers: 1,
    progress: DISPATCH_PROGRESS[assignment.status],
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    latitude: Number.isFinite(latitude)
      ? latitude
      : 37.979365 + index * 0.004,
    longitude: Number.isFinite(longitude)
      ? longitude
      : 127.649056 - index * 0.004,
    workerId: assignment.workerId,
    workerName: assignment.workerName,
    workerRole: "방제요원",
    vehicle: "차량 배정 대기",
    currentStage: assignment.status,
    batteryPercent: assignment.batteryPercent,
  };
}

function methodBadge(method: ControlTask["method"]) {
  switch (method) {
    case "훈증":
      return "border-yellow-200 bg-yellow-100 text-yellow-800";
    case "파쇄":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "소각":
      return "border-rose-200 bg-rose-100 text-rose-800";
    case "나무주사":
      return "border-sky-200 bg-sky-100 text-sky-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-800";
  }
}

function statusBadge(status: ControlTask["status"]) {
  if (status === "진행") return "bg-emerald-100 text-emerald-700";
  if (status === "완료") return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

export default function ControlSection({
  mode,
  tasks,
  grids,
  dispatchAssignments = [],
  onAddTask,
  onUpdateTaskProgress,
  onUpdateDispatchStatus,
}: ControlSectionProps) {
  // 좌표를 행정동·격자ID로 바꿔 표시하려면 룩업이 먼저 있어야 한다.
  // 판정 결과 useMemo가 이 값을 의존성으로 잡아야, 로드가 끝난 뒤에 다시 계산된다.
  // (없으면 로드 전에 입력한 주소가 계속 미판정으로 남는다.)
  const [gridLookupReady, setGridLookupReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadGridLookup().then((data) => {
      if (!cancelled && data) setGridLookupReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [demoOperations, setDemoOperations] = useState<ControlOperation[]>(
    () => CONTROL_OPERATIONS.map((item) => ({ ...item })),
  );
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(
    CONTROL_OPERATIONS[0]?.id ?? null,
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [area, setArea] = useState("");
  const [method, setMethod] = useState<ControlTask["method"]>("파쇄");
  const [company, setCompany] = useState("동해산림방제(주)");
  const [workers, setWorkers] = useState(10);

  // 다른 등록 화면과 같은 방식으로, 지역명 또는 좌표 중 하나만 넣어도
  // 행정동·격자를 찾아 준다.
  const [newLatitude, setNewLatitude] = useState("");
  const [newLongitude, setNewLongitude] = useState("");

  const newGridLocation = useMemo(
    () =>
      resolveGridLocation(newLatitude, newLongitude) ??
      resolveGridByRegionText(area),
    [newLatitude, newLongitude, area, gridLookupReady],
  );

  // 방제 담당 요원 선택
  const [workforce, setWorkforce] = useState<WorkforceMember[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadWorkforce().then((members) => {
      if (!cancelled) setWorkforce(filterAssignable(members, "CONTROL"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 대상 격자 기준으로 관내 요원을 먼저, 가까운 순으로 보여준다.
  const controlWorkerOptions = useMemo(() => {
    const point = newGridLocation;
    return workforce
      .map((worker) => ({
        worker,
        localRegion: Boolean(
          worker.homeSigunguName && area.includes(worker.homeSigunguName),
        ),
        distanceKm: point
          ? distanceKmBetween(
              worker.baseLatitude,
              worker.baseLongitude,
              point.latitude,
              point.longitude,
            )
          : null,
      }))
      .sort((left, right) => {
        if (left.localRegion !== right.localRegion) {
          return left.localRegion ? -1 : 1;
        }
        if (left.distanceKm !== null && right.distanceKm !== null) {
          return left.distanceKm - right.distanceKm;
        }
        return 0;
      })
      .slice(0, 30);
  }, [workforce, newGridLocation, area]);

  const selectedWorker =
    workforce.find((worker) => worker.workerId === selectedWorkerId) ?? null;

  /**
   * 방제 방식은 ControlTask에만 있는 값이라, 배정에서 파생된 작업에는
   * 저장할 자리가 없다. 화면에서 바꾼 값을 여기에 담아 표시에 반영한다.
   */
  const [methodOverrides, setMethodOverrides] = useState<
    Record<string, ControlTask["method"]>
  >({});

  void mode;
  void grids;

  const controlDispatchOperations = useMemo(
    () =>
      dispatchAssignments
        .filter(
          (assignment) =>
            assignment.taskType === "CONTROL",
        )
        .map(dispatchToControlOperation),
    [dispatchAssignments],
  );

  const operations = useMemo(() => {
    const knownOperationIds = new Set([
      ...demoOperations.map((operation) => operation.id),
      ...controlDispatchOperations.map(
        (operation) => operation.id,
      ),
    ]);
    const externalOperations = tasks
      .filter((task) => !knownOperationIds.has(task.id))
      .map((task, index) => attachFallbackOperationLocation(task, index));

    return [
      ...controlDispatchOperations,
      ...demoOperations,
      ...externalOperations,
    ];
  }, [controlDispatchOperations, demoOperations, tasks]);

  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ??
    operations[0] ??
    null;

  // 완료된 작업은 현황 탭에서 내린다. 진척률 100%도 완료로 본다.
  const activeOperations = useMemo(
    () =>
      operations.filter(
        (operation) =>
          operation.status !== "완료" && operation.progress < 100,
      ),
    [operations],
  );

  const handleRegisterTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!area.trim() && !newGridLocation) return;

    const taskId = `CTR-${Math.floor(100 + Math.random() * 900)}`;
    // 목록에 격자를 함께 남긴다. 나중에 지도·보고서에서 위치를 찾을 근거가 된다.
    const label = newGridLocation
      ? `${newGridLocation.emdName} · 격자 ${newGridLocation.gridId}`
      : area.trim();

    const newTask: ControlTask = {
      id: taskId,
      area: label,
      method,
      status: "예정",
      // 담당 요원을 고르면 그 요원의 소속을 시공 주체로 남긴다.
      company: selectedWorker?.organization || company,
      workers,
      progress: 0,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    };

    onAddTask(newTask);

    // ControlTask에는 좌표 칸이 없어서, 그대로 두면 지도에 임의 위치로 찍힌다.
    // 판정된 격자 좌표를 가진 운영 항목을 직접 만들어 같은 id로 넣는다
    // (operations가 id 기준으로 중복을 걸러 하나만 남는다).
    if (newGridLocation) {
      setDemoOperations((previous) => [
        {
          ...newTask,
          latitude: newGridLocation.latitude,
          longitude: newGridLocation.longitude,
          workerId: selectedWorker?.workerId ?? `CTR-W-${taskId}`,
          workerName: selectedWorker?.workerName ?? "미배정",
          workerRole: "방제 담당",
          vehicle: "차량 배정 대기",
          currentStage: "출동 준비",
        },
        ...previous,
      ]);
    }

    setArea("");
    setNewLatitude("");
    setNewLongitude("");
    setSelectedWorkerId("");
    setIsRegistering(false);
    setSelectedOperationId(taskId);
  };

  /** 목록에서 방제 방식을 바꾼다. */
  const updateMethod = (
    operation: ControlOperation,
    nextMethod: ControlTask["method"],
  ) => {
    const isDemo = demoOperations.some((item) => item.id === operation.id);
    if (isDemo) {
      setDemoOperations((previous) =>
        previous.map((item) =>
          item.id === operation.id ? { ...item, method: nextMethod } : item,
        ),
      );
      return;
    }
    // 배정에서 파생된 작업은 저장할 자리가 없어 화면 표시만 바꾼다.
    setMethodOverrides((previous) => ({
      ...previous,
      [operation.id]: nextMethod,
    }));
  };

  /**
   * 목록에서 진행 상태를 바꾼다.
   * 작업의 출처(데모/배정/외부 등록)에 따라 반영 경로가 달라서
   * 진척률로 환산해 기존 updateProgress와 같은 경로를 탄다.
   */
  const updateStatus = (
    operation: ControlOperation,
    nextStatus: ControlTask["status"],
  ) => {
    // 진행으로 바꾸면 10%에서 시작한다.
    const targetProgress =
      nextStatus === "완료" ? 100 : nextStatus === "진행" ? 10 : 0;
    updateProgress(operation, targetProgress - operation.progress);
  };

  const updateProgress = (operation: ControlOperation, delta: number) => {
    const progress = Math.min(100, Math.max(0, operation.progress + delta));
    const status: ControlTask["status"] =
      progress >= 100 ? "완료" : progress > 0 ? "진행" : "예정";

    const isDemo = demoOperations.some((item) => item.id === operation.id);
    if (isDemo) {
      setDemoOperations((previous) =>
        previous.map((item) =>
          item.id === operation.id ? { ...item, progress, status } : item,
        ),
      );
    } else if (
      operation.assignmentId &&
      onUpdateDispatchStatus
    ) {
      onUpdateDispatchStatus(
        operation.assignmentId,
        progress >= 100
          ? "작업 완료"
          : progress > 0
            ? "작업 중"
            : "배정 대기",
      );
    } else {
      onUpdateTaskProgress(operation.id, progress);
    }
  };

  return (
    <div className="h-full min-h-0">
      <div className="grid h-full min-h-0 grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-6 xl:col-span-6">
        <section className="flex min-h-0 flex-1">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ListCheckIcon size={18} className="text-emerald-700" />
                    <h2 className="text-base font-black text-slate-950">
                      감염목 방제 작업 리스트
                    </h2>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    등록·배정된 작업이 목록과 지도에 함께 표시됩니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsRegistering((value) => !value)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-900"
                >
                  {isRegistering ? <X size={14} /> : <Plus size={14} />}
                  {isRegistering ? "취소" : "신규 배정"}
                </button>
              </div>
            </header>

            <AnimatePresence initial={false}>
              {isRegistering && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleRegisterTask}
                  className="overflow-hidden border-b border-slate-200 bg-slate-50"
                >
                  <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">

                    {/* 방제 대상 위치 — 지역 또는 좌표 하나만 넣어도 됨 */}
                    <div className="md:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600">
                        방제 대상 위치
                        <span className="ml-1 font-semibold text-slate-400">
                          (지역 또는 좌표 중 하나만 입력해도 됩니다)
                        </span>
                      </label>

                      <input
                        value={area}
                        onChange={(event) => setArea(event.target.value)}
                        placeholder="예: 경상북도 포항시 북구 죽장면 상옥리 산42"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      />

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          inputMode="decimal"
                          value={newLatitude}
                          onChange={(event) => setNewLatitude(event.target.value)}
                          placeholder="위도 37.910052"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-emerald-500"
                        />
                        <input
                          inputMode="decimal"
                          value={newLongitude}
                          onChange={(event) => setNewLongitude(event.target.value)}
                          placeholder="경도 127.787793"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div
                        className={
                          newGridLocation
                            ? "mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2"
                            : "mt-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2"
                        }
                      >
                        <MapPin
                          size={13}
                          className={
                            newGridLocation
                              ? "shrink-0 text-emerald-600"
                              : "shrink-0 text-slate-400"
                          }
                        />
                        <span
                          className={
                            newGridLocation
                              ? "text-[11px] font-black text-emerald-800"
                              : "text-[11px] font-bold text-slate-500"
                          }
                        >
                          {newGridLocation
                            ? `${newGridLocation.emdName} · 격자 ${newGridLocation.gridId}`
                            : "지역명 또는 좌표를 입력하면 행정동과 격자를 찾습니다."}
                        </span>
                      </div>
                    </div>

                    <label className="text-[11px] font-bold text-slate-600">
                      방제 방법
                      <select
                        value={method}
                        onChange={(event) =>
                          setMethod(event.target.value as ControlTask["method"])
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      >
                        <option>파쇄</option>
                        <option>훈증</option>
                        <option>소각</option>
                        <option>나무주사</option>
                        <option>항공방제</option>
                      </select>
                    </label>

                    <label className="text-[11px] font-bold text-slate-600">
                      담당 요원
                      <select
                        value={selectedWorkerId}
                        onChange={(event) => setSelectedWorkerId(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      >
                        <option value="">미배정</option>
                        {controlWorkerOptions.map(
                          ({ worker, localRegion, distanceKm }) => (
                            <option key={worker.workerId} value={worker.workerId}>
                              {worker.workerName}
                              {localRegion ? " (관내)" : ""}
                              {` · ${worker.homeSigunguName}`}
                              {distanceKm !== null
                                ? ` · ${distanceKm.toFixed(1)}km`
                                : ""}
                            </option>
                          ),
                        )}
                      </select>
                      {selectedWorker && (
                        <span className="mt-1 block text-[10px] font-semibold text-slate-400">
                          소속 {selectedWorker.organization || "-"}
                        </span>
                      )}
                    </label>

                    <label className="text-[11px] font-bold text-slate-600">
                      투입 인력 (명)
                      <input
                        type="number"
                        min={1}
                        value={workers}
                        onChange={(event) => setWorkers(Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      />
                    </label>

                    <div className="flex items-end justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsRegistering(false)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        disabled={!area.trim() && !newGridLocation}
                        className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        배정 등록
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto">
              {activeOperations.length === 0 ? (
                <div className="flex h-full min-h-[320px] min-w-[660px] items-center justify-center px-6 py-12 text-center">
                  <div>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      <ListCheckIcon size={22} />
                    </div>
                    <p className="mt-4 text-sm font-black text-slate-700">
                      등록된 방제 작업이 없습니다.
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      홈 지도에서 방제 요원을 배정하거나 새 작업을 추가해 주세요.
                    </p>
                  </div>
                </div>
              ) : (
              <table className="w-full min-w-[660px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {['공정 ID', '방제 구역', '방제 방식', '담당 요원', '진척률', '상태'].map((label) => (
                      <th key={label} className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeOperations.map((operation) => {
                    const selected = operation.id === selectedOperation?.id;
                    return (
                      <tr
                        key={operation.id}
                        onClick={() => setSelectedOperationId(operation.id)}
                        className={`cursor-pointer border-b border-slate-100 transition ${
                          selected ? "bg-emerald-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[10px] font-bold text-slate-700">
                          {operation.id}
                        </td>
                        <td className="max-w-[170px] px-3 py-3 text-[11px] text-slate-700">
                          {operation.area}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={methodOverrides[operation.id] ?? operation.method}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateMethod(
                                operation,
                                event.target.value as ControlTask["method"],
                              );
                            }}
                            className={`rounded-md border px-1.5 py-1 text-[10px] font-bold outline-none ${methodBadge(
                              methodOverrides[operation.id] ?? operation.method,
                            )}`}
                          >
                            <option>파쇄</option>
                            <option>훈증</option>
                            <option>소각</option>
                            <option>나무주사</option>
                            <option>항공방제</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 text-[11px] font-bold text-slate-700">{operation.workerName}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${operation.progress}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-600">{operation.progress}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={operation.status}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              updateStatus(
                                operation,
                                event.target.value as ControlTask["status"],
                              );
                            }}
                            className={`rounded-full px-2 py-1 text-[9px] font-black outline-none ${statusBadge(
                              operation.status,
                            )}`}
                          >
                            <option value="예정">예정</option>
                            <option value="진행">진행</option>
                            <option value="완료">완료</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </section>

        <div className="shrink-0">
          <InventoryPanel />
        </div>
        </div>

        <div className="flex h-full min-h-0 min-w-0 flex-col gap-6 xl:col-span-6">
        <section className="min-w-0 shrink-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Navigation size={18} className="text-emerald-700" />
                    <h2 className="text-base font-black text-slate-950">현장 출동 요원 위치</h2>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    목록을 선택하면 해당 작업과 담당 요원의 위치로 이동합니다.
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> DEMO LIVE
                </span>
              </div>
            </header>

            <ControlOperationsMap
              operations={operations}
              selectedOperationId={selectedOperation?.id ?? null}
              onSelect={(operation) => setSelectedOperationId(operation.id)}
            />

            {selectedOperation && (
              <div className="border-t border-slate-100 p-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[9px] font-black text-slate-400">담당 요원</div>
                    <div className="mt-1 text-xs font-black text-slate-800">{selectedOperation.workerName}</div>
                    <div className="text-[9px] text-slate-500">{selectedOperation.workerRole}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center gap-1 text-[9px] font-black text-slate-400"><Activity size={11} />현재 단계</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-700">{selectedOperation.currentStage}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center gap-1 text-[9px] font-black text-slate-400"><MapPin size={11} />위치</div>
                    <div className="mt-1 text-[9px] font-bold text-slate-700">
                      <span>
                        {formatGridLocation(
                          selectedOperation.latitude,
                          selectedOperation.longitude,
                          selectedOperation.area,
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center gap-1 text-[9px] font-black text-slate-400"><Battery size={11} />진척률 조정</div>
                    <div className="mt-1 flex items-center gap-2">
                      <button type="button" onClick={() => updateProgress(selectedOperation, -10)} className="rounded-md border border-slate-200 bg-white p-1 text-slate-600"><Minus size={12} /></button>
                      <strong className="min-w-[32px] text-center text-xs text-emerald-700">{selectedOperation.progress}%</strong>
                      <button type="button" onClick={() => updateProgress(selectedOperation, 10)} className="rounded-md border border-slate-200 bg-white p-1 text-slate-600"><Plus size={12} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Navigation size={17} className="text-emerald-700" />
                  <h2 className="text-base font-black text-slate-950">
                    출동 중인 방제 요원
                  </h2>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  작업 목록과 지도에 표시된 방제 요원의 현재 정보를 확인합니다.
                </p>
              </div>

              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                {activeOperations.length}명
              </span>
            </div>
          </header>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pr-3">
            {activeOperations.length === 0 && (
              <div className="flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-400">
                현재 출동 중인 방제 요원이 없습니다.
              </div>
            )}

            {activeOperations.map((operation) => {
              const isSelected =
                operation.id === selectedOperation?.id;

              return (
                <button
                  key={operation.id}
                  type="button"
                  onClick={() =>
                    setSelectedOperationId(operation.id)
                  }
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-100 bg-slate-50/70 hover:border-emerald-200 hover:bg-emerald-50/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-black text-slate-800">
                        {operation.workerName}
                      </span>
                      <span className="font-mono text-[9px] font-bold text-slate-400">
                        {operation.workerId}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-black ${statusBadge(
                          operation.status,
                        )}`}
                      >
                        {operation.status}
                      </span>
                    </div>

                    <div className="mt-1.5 grid gap-1 text-[10px] font-semibold text-slate-500 sm:grid-cols-2">
                      <span>작업 ID: {operation.id}</span>
                      <span>
                        위치:{" "}
                        {formatGridLocation(
                          operation.latitude,
                          operation.longitude,
                          operation.area,
                        )}
                      </span>
                      <span>방제 방법: {operation.method}</span>
                      <span className="truncate">작업 구역: {operation.area}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[10px] font-black text-slate-600 shadow-sm">
                    <Battery size={12} className="text-emerald-600" />
                    {operation.batteryPercent == null
                      ? "-"
                      : `${operation.batteryPercent}%`}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
