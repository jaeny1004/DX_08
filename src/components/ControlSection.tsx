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

const ACTIVE_CONTROL_STATUSES: DispatchStatus[] = [
  "배정 대기",
  "배정 수락",
  "출동",
  "현장 도착",
  "작업 중",
  "작업 완료",
];

const DISPATCH_PROGRESS: Record<DispatchStatus, number> = {
  "배정 대기": 0,
  "배정 수락": 10,
  출동: 30,
  "현장 도착": 45,
  "작업 중": 65,
  "작업 완료": 100,
  복귀: 100,
  "복귀 완료": 100,
};

function toControlTaskStatus(
  status: DispatchStatus,
): ControlTask["status"] {
  if (["작업 완료", "복귀", "복귀 완료"].includes(status)) {
    return "완료";
  }

  if (["현장 도착", "작업 중"].includes(status)) {
    return "진행";
  }

  return "예정";
}

function formatAssignmentArea(
  assignment: DispatchAssignment,
) {
  const region = [
    assignment.targetSidoName,
    assignment.targetSigunguName,
    assignment.targetEmdName,
  ]
    .filter(Boolean)
    .join(" ");

  const gridLabel = assignment.gridId.startsWith("GRID-")
    ? assignment.gridId
    : `GRID-${assignment.gridId}`;

  return region ? `${region} ${gridLabel}` : gridLabel;
}

function isValidCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value !== 0
  );
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
  const controlAssignments = useMemo(
    () =>
      dispatchAssignments.filter(
        (assignment) =>
          assignment.taskType === "CONTROL" &&
          assignment.status !== "복귀 완료",
      ),
    [dispatchAssignments],
  );

  const [demoOperations, setDemoOperations] = useState<ControlOperation[]>(
    () => CONTROL_OPERATIONS.map((item) => ({ ...item })),
  );
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(
    () =>
      controlAssignments[0]?.assignmentId ??
      CONTROL_OPERATIONS[0]?.id ??
      null,
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [area, setArea] = useState("");
  const [method, setMethod] = useState<ControlTask["method"]>("파쇄");
  const [company, setCompany] = useState("동해산림방제(주)");
  const [workers, setWorkers] = useState(10);

  void mode;
  void grids;

  const operations = useMemo(() => {
    const assignmentOperations: ControlOperation[] =
      controlAssignments.map((assignment, index) => {
        const latitude = isValidCoordinate(assignment.targetLatitude)
          ? assignment.targetLatitude
          : 37.979365 + index * 0.004;
        const longitude = isValidCoordinate(assignment.targetLongitude)
          ? assignment.targetLongitude
          : 127.649056 - index * 0.004;
        const startDate = assignment.assignedAt.slice(0, 10);
        const endDate = new Date(
          new Date(assignment.assignedAt).getTime() +
            3 * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .slice(0, 10);

        return {
          id: assignment.assignmentId,
          area: formatAssignmentArea(assignment),
          method: "파쇄",
          status: toControlTaskStatus(assignment.status),
          company: `${assignment.assignmentType} 방제팀`,
          workers: 1,
          progress: DISPATCH_PROGRESS[assignment.status],
          startDate,
          endDate,
          latitude,
          longitude,
          workerId: assignment.workerId,
          workerName: assignment.workerName,
          workerRole: `방제 ${assignment.assignedSkillLevel}단계 담당`,
          vehicle: "차량 배정 대기",
          currentStage: assignment.status,
        };
      });

    const externalOperations = tasks
      .filter((task) => !demoOperations.some((demo) => demo.id === task.id))
      .map((task, index) => attachFallbackOperationLocation(task, index));

    return [
      ...assignmentOperations,
      ...demoOperations,
      ...externalOperations,
    ];
  }, [controlAssignments, demoOperations, tasks]);

  useEffect(() => {
    if (
      selectedOperationId !== null &&
      operations.some(
        (operation) => operation.id === selectedOperationId,
      )
    ) {
      return;
    }

    setSelectedOperationId(operations[0]?.id ?? null);
  }, [operations, selectedOperationId]);

  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ??
    operations[0] ??
    null;

  const handleRegisterTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!area.trim()) return;

    const newTask: ControlTask = {
      id: `CTR-${Math.floor(100 + Math.random() * 900)}`,
      area: area.trim(),
      method,
      status: "예정",
      company,
      workers,
      progress: 0,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    };

    onAddTask(newTask);
    setArea("");
    setIsRegistering(false);
    setSelectedOperationId(newTask.id);
  };

  const updateProgress = (operation: ControlOperation, delta: number) => {
    const linkedAssignment = controlAssignments.find(
      (assignment) => assignment.assignmentId === operation.id,
    );

    if (linkedAssignment && onUpdateDispatchStatus) {
      const currentIndex = Math.max(
        0,
        ACTIVE_CONTROL_STATUSES.indexOf(linkedAssignment.status),
      );
      const nextIndex = Math.min(
        ACTIVE_CONTROL_STATUSES.length - 1,
        Math.max(0, currentIndex + (delta > 0 ? 1 : -1)),
      );

      onUpdateDispatchStatus(
        linkedAssignment.assignmentId,
        ACTIVE_CONTROL_STATUSES[nextIndex],
      );
      return;
    }

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
    } else {
      onUpdateTaskProgress(operation.id, progress);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="min-w-0 xl:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                    목록과 지도는 동일한 시연용 작업 데이터를 사용합니다.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsRegistering((value) => !value)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-900"
                >
                  {isRegistering ? <X size={14} /> : <Plus size={14} />}
                  {isRegistering ? "취소" : "작업 추가 배정"}
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
                    <label className="text-[11px] font-bold text-slate-600">
                      대상 방제 구역/주소
                      <input
                        value={area}
                        onChange={(event) => setArea(event.target.value)}
                        placeholder="예: 강원 춘천시 북산면 산 42"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="text-[11px] font-bold text-slate-600">
                      표준 방제 기법
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
                      수주 시공사
                      <input
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="text-[11px] font-bold text-slate-600">
                      투입 인력
                      <input
                        type="number"
                        min={1}
                        value={workers}
                        onChange={(event) => setWorkers(Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500"
                      />
                    </label>
                    <div className="flex justify-end gap-2 md:col-span-2">
                      <button
                        type="button"
                        onClick={() => setIsRegistering(false)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white"
                      >
                        시공 배정 완료
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="custom-scrollbar max-h-[calc(100vh-220px)] overflow-x-auto overflow-y-scroll">
              <table className="w-full min-w-[660px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {['공정 ID', '방제 구역', '방제 방식', '시공 업체', '진척률', '상태'].map((label) => (
                      <th key={label} className="whitespace-nowrap px-3 py-2.5 text-[10px] font-bold text-slate-500">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operations.map((operation) => {
                    const selected = operation.id === selectedOperation?.id;
                    const linkedAssignment = controlAssignments.find(
                      (assignment) =>
                        assignment.assignmentId === operation.id,
                    );
                    const operationLabel = linkedAssignment
                      ? linkedAssignment.gridId.startsWith("GRID-")
                        ? linkedAssignment.gridId
                        : `GRID-${linkedAssignment.gridId}`
                      : operation.id;

                    return (
                      <tr
                        key={operation.id}
                        onClick={() => setSelectedOperationId(operation.id)}
                        className={`cursor-pointer border-b border-slate-100 transition ${
                          selected ? "bg-emerald-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[10px] font-bold text-slate-700">
                          <div>{operationLabel}</div>
                          {linkedAssignment && (
                            <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 font-sans text-[8px] font-black text-emerald-700">
                              홈 지도 배정
                            </span>
                          )}
                        </td>
                        <td className="max-w-[170px] px-3 py-3 text-[11px] text-slate-700">
                          {operation.area}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-md border px-1.5 py-1 text-[10px] font-bold ${methodBadge(operation.method)}`}>
                            {operation.method}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-slate-700">{operation.company}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${operation.progress}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-600">{operation.progress}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black ${statusBadge(operation.status)}`}>
                            {operation.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="min-w-0 xl:col-span-6">
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
                    <div className="flex items-center gap-1 text-[9px] font-black text-slate-400"><MapPin size={11} />좌표</div>
                    <div className="mt-1 font-mono text-[9px] font-bold text-slate-700">
                      {selectedOperation.latitude.toFixed(5)}, {selectedOperation.longitude.toFixed(5)}
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
      </div>

      <InventoryPanel />
    </div>
  );
}
