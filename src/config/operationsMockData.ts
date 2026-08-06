import type { ControlTask, WorkerStatus } from "../types";

export type FieldWorkerMarker = WorkerStatus & {
  latitude: number;
  longitude: number;
  assignment: string;
  team: string;
  updatedAt: string;
};

export type ControlOperation = ControlTask & {
  latitude: number;
  longitude: number;
  workerId: string;
  workerName: string;
  workerRole: string;
  batteryPercent: number;
  vehicle: string;
  currentStage: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  displayValue: string;
  percent: number;
  detail: string;
  kind: "warning" | "chemical" | "equipment";
  activeUnits?: number;
  totalUnits?: number;
};

export const FIELD_WORKERS: FieldWorkerMarker[] = [];

export const CONTROL_OPERATIONS: ControlOperation[] = [];

export const INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: "fumigation-sheet",
    name: "훈증 천막 재고 소진",
    displayValue: "잔여 12개",
    percent: 18,
    detail: "포항 보관 창고 잔여 12개 · 긴급 발주 권장",
    kind: "warning",
  },
  {
    id: "abamectin",
    name: "아바멕틴 주사 수간 주입제",
    displayValue: "840L · 84%",
    percent: 84,
    detail: "정상 재고",
    kind: "chemical",
  },
  {
    id: "metam-sodium",
    name: "메탐소듐 훈증 전용 액제",
    displayValue: "1,200L · 91%",
    percent: 91,
    detail: "정상 재고",
    kind: "chemical",
  },
  {
    id: "wood-chipper",
    name: "목재 자주식 파쇄기 가동도",
    displayValue: "8 / 12대",
    percent: 67,
    detail: "가동 8대 · 정비 4대",
    kind: "equipment",
    activeUnits: 8,
    totalUnits: 12,
  },
];

export function attachFallbackOperationLocation(
  task: ControlTask,
  index: number,
): ControlOperation {
  const offset = index * 0.004;

  return {
    ...task,
    latitude: 37.979365 + offset,
    longitude: 127.649056 - offset,
    workerId: `CTR-W-${300 + index}`,
    workerName: "신규 배정 요원",
    workerRole: "현장 담당자",
    batteryPercent: 78 - (index % 4) * 7,
    vehicle: "차량 배정 대기",
    currentStage: task.status === "예정" ? "출동 준비" : "현장 작업",
  };
}
