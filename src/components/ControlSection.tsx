import React, { useMemo, useState } from "react";
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
  onAddTask: (task: ControlTask) => void;
  onUpdateTaskProgress: (id: string, progress: number) => void;
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
  onAddTask,
  onUpdateTaskProgress,
}: ControlSectionProps) {
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

  void mode;
  void grids;

  const operations = useMemo(() => {
    const externalOperations = tasks
      .filter((task) => !demoOperations.some((demo) => demo.id === task.id))
      .map((task, index) => attachFallbackOperationLocation(task, index));

    return [...demoOperations, ...externalOperations];
  }, [demoOperations, tasks]);

  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ??
    operations[0] ??
    null;

  const activeOperations = useMemo(
    () =>
      operations.filter(
        (operation) => operation.status !== "완료",
      ),
    [operations],
  );

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
                      담당 요원
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

            <div className="custom-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto">
              {operations.length === 0 ? (
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
                  {operations.map((operation) => {
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
                          <span className={`rounded-md border px-1.5 py-1 text-[10px] font-bold ${methodBadge(operation.method)}`}>
                            {operation.method}
                          </span>
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
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black ${statusBadge(operation.status)}`}>
                            {operation.status}
                          </span>
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
                        위치: {operation.latitude.toFixed(6)}, {operation.longitude.toFixed(6)}
                      </span>
                      <span>방제 방법: {operation.method}</span>
                      <span className="truncate">작업 구역: {operation.area}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[10px] font-black text-slate-600 shadow-sm">
                    <Battery size={12} className="text-emerald-600" />
                    {operation.batteryPercent}%
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
