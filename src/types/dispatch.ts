export type DispatchWorkerType =
  | "현장요원"
  | "드론요원"
  | "방제요원";

export type DispatchStatus =
  | "배정 대기"
  | "출동"
  | "현장"
  | "복귀";

export type DispatchAssignment = {
  assignmentId: string;

  workerId: string;
  workerName: string;
  workerType: DispatchWorkerType;

  homeSidoName: string;
  homeSigunguCode: string;
  homeSigunguName: string;

  targetSidoName: string;
  targetSigunguCode: string;
  targetSigunguName: string;
  targetEmdCode: string;
  targetEmdName: string;

  gridId: string;
  priorityGrade: string;
  riskGrade: string;
  riskScore: number;
  accessScore: number;

  distanceKm: number | null;
  travelTimeHour: number | null;
  batteryPercent: number | null;

  recommendationReason: string;
  assignmentType:
    | "지역 내 배정"
    | "동일 시도 지원"
    | "권역 지원";

  status: DispatchStatus;
  assignedAt: string;
};
