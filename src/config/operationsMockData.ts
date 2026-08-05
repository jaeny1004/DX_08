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

export const FIELD_WORKERS: FieldWorkerMarker[] = [
  {
    id: "FLD-W-101",
    name: "김예찰",
    region: "강원 춘천시 북산면",
    status: "출동",
    battery: 86,
    progress: 65,
    distance: "1.8km",
    lastActive: "방금 전",
    latitude: 37.98582,
    longitude: 127.65391,
    assignment: "시민 제보 현장 1차 확인",
    team: "춘천 예찰 1팀",
    updatedAt: "10초 전",
  },
  {
    id: "FLD-W-102",
    name: "박현장",
    region: "강원 춘천시 북산면",
    status: "출동",
    battery: 72,
    progress: 40,
    distance: "3.2km",
    lastActive: "1분 전",
    latitude: 37.97444,
    longitude: 127.64226,
    assignment: "감염 의심목 시료 채취",
    team: "춘천 예찰 2팀",
    updatedAt: "35초 전",
  },
  {
    id: "FLD-W-103",
    name: "이산림",
    region: "강원 춘천시 북산면",
    status: "복귀",
    battery: 58,
    progress: 100,
    distance: "5.1km",
    lastActive: "2분 전",
    latitude: 37.9667,
    longitude: 127.66138,
    assignment: "예찰 완료 후 거점 복귀",
    team: "춘천 예찰 3팀",
    updatedAt: "1분 전",
  },
];

export const CONTROL_OPERATIONS: ControlOperation[] = [
  {
    id: "CTR-2026-014",
    area: "강원 춘천시 북산면 부귀리 산 42",
    method: "훈증",
    status: "진행",
    company: "강원산림방제(주)",
    workers: 8,
    progress: 75,
    startDate: "2026-08-04",
    endDate: "2026-08-08",
    latitude: 37.99114,
    longitude: 127.65982,
    workerId: "CTR-W-201",
    workerName: "김방제",
    workerRole: "현장 반장",
    vehicle: "강원 83가 1024",
    currentStage: "훈증 천막 밀폐 점검",
  },
  {
    id: "CTR-2026-015",
    area: "강원 춘천시 북산면 물로리 산 18",
    method: "파쇄",
    status: "진행",
    company: "동해산림방제(주)",
    workers: 10,
    progress: 48,
    startDate: "2026-08-04",
    endDate: "2026-08-09",
    latitude: 37.97466,
    longitude: 127.64431,
    workerId: "CTR-W-202",
    workerName: "박방제",
    workerRole: "파쇄기 책임자",
    vehicle: "강원 91나 4812",
    currentStage: "피해목 운반 및 파쇄",
  },
  {
    id: "CTR-2026-016",
    area: "강원 춘천시 북산면 청평리 산 7",
    method: "나무주사",
    status: "예정",
    company: "푸른숲방제(주)",
    workers: 6,
    progress: 0,
    startDate: "2026-08-05",
    endDate: "2026-08-07",
    latitude: 37.96541,
    longitude: 127.66622,
    workerId: "CTR-W-203",
    workerName: "최예방",
    workerRole: "예방주사 팀장",
    vehicle: "강원 80다 3361",
    currentStage: "약제 및 천공 장비 준비",
  },
];

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
    vehicle: "차량 배정 대기",
    currentStage: task.status === "예정" ? "출동 준비" : "현장 작업",
  };
}
