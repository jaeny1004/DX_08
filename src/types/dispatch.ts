export type DispatchTaskType = "SURVEY" | "DRONE" | "CONTROL";

/**
 * 기존 화면과의 호환을 위해 유지하는 한글 표시용 유형입니다.
 * 실제 요원의 고정 직군이 아니라, 이번 출동에서 맡은 업무를 뜻합니다.
 */
export type DispatchWorkerType =
  | "현장요원"
  | "드론요원"
  | "방제요원";

export type DispatchStatus =
  | "배정 대기"
  | "배정 수락"
  | "출동"
  | "현장 도착"
  | "작업 중"
  | "작업 완료"
  | "복귀"
  | "복귀 완료";

export type DispatchCapability = {
  taskType: DispatchTaskType;
  skillLevel: number;
};

export type DispatchAssignment = {
  assignmentId: string;

  workerId: string;
  workerName: string;

  /** 이번 출동에서 맡은 업무의 한글 표시값 */
  workerType: DispatchWorkerType;
  /** 실제 업무 코드 */
  taskType: DispatchTaskType;
  /** 해당 요원이 보유한 전체 복수 역량 */
  workerCapabilities: DispatchCapability[];
  /** 이번 업무에 적용된 숙련도 */
  assignedSkillLevel: number;

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
  remainingMinutesAtAssignment: number;

  recommendationReason: string;
  assignmentType:
    | "지역 내 배정"
    | "인접지역 지원"
    | "광역 지원";

  status: DispatchStatus;
  assignedAt: string;
};
