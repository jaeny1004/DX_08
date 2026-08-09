/**
 * 요원 배정(dispatch_assignments) 영속화.
 *
 * 지금까지 배정은 App.tsx 의 React state 에만 있었다. 새로고침하면 사라지고,
 * 같은 Supabase 를 보는 현장 모바일 앱(pine-app-main)에서는 아예 볼 수 없었다.
 * 이 모듈이 그 배정을 DB 로 올려서 "웹에서 배정 -> 앱에서 수행 -> 웹에서 확인"
 * 흐름을 잇는다.
 *
 * 컬럼 매핑은 rag-backend/supabase/migrations/012_workforce_and_dispatch.sql 과
 * src/types/dispatch.ts 의 DispatchAssignment 를 1:1 로 옮긴 것이다.
 * 셋 중 하나를 바꾸면 나머지도 함께 고쳐야 한다.
 *
 * Supabase 가 없거나 테이블이 아직 없을 때도 화면은 그대로 돌아가야 하므로,
 * 모든 함수는 실패를 던지지 않고 false / 빈 배열로 되돌린다.
 */
import { supabase } from "../lib/supabaseClient";
import type {
  DispatchAssignment,
  DispatchCapability,
  DispatchStatus,
  DispatchTaskType,
  DispatchWorkerType,
} from "../types/dispatch";

const TABLE = "dispatch_assignments";

/** DB 행 -> 화면 타입 */
function toAssignment(row: any): DispatchAssignment {
  return {
    assignmentId: String(row.assignment_id),

    workerId: String(row.worker_id ?? ""),
    workerName: String(row.worker_name ?? ""),
    workerType: (row.worker_type ?? "현장요원") as DispatchWorkerType,
    taskType: (row.task_type ?? "SURVEY") as DispatchTaskType,
    workerCapabilities: Array.isArray(row.worker_capabilities)
      ? (row.worker_capabilities as DispatchCapability[])
      : [],
    assignedSkillLevel: Number(row.assigned_skill_level ?? 0),

    homeSidoName: String(row.home_sido_name ?? ""),
    homeSigunguCode: String(row.home_sigungu_code ?? ""),
    homeSigunguName: String(row.home_sigungu_name ?? ""),

    targetSidoName: String(row.target_sido_name ?? ""),
    targetSigunguCode: String(row.target_sigungu_code ?? ""),
    targetSigunguName: String(row.target_sigungu_name ?? ""),
    targetEmdCode: String(row.target_emd_code ?? ""),
    targetEmdName: String(row.target_emd_name ?? ""),

    gridId: String(row.grid_id ?? ""),
    targetLatitude: row.target_latitude ?? undefined,
    targetLongitude: row.target_longitude ?? undefined,
    sourceTreeId: row.source_tree_id ?? undefined,

    priorityGrade: String(row.priority_grade ?? ""),
    riskGrade: String(row.risk_grade ?? ""),
    riskScore: Number(row.risk_score ?? 0),
    accessScore: Number(row.access_score ?? 0),

    distanceKm: row.distance_km ?? null,
    travelTimeHour: row.travel_time_hour ?? null,
    batteryPercent: row.battery_percent ?? null,
    remainingMinutesAtAssignment: Number(
      row.remaining_minutes_at_assignment ?? 0,
    ),

    recommendationReason: String(row.recommendation_reason ?? ""),
    assignmentType: (row.assignment_type ??
      "지역 내 배정") as DispatchAssignment["assignmentType"],

    status: (row.status ?? "배정 대기") as DispatchStatus,
    assignedAt: String(row.assigned_at ?? new Date().toISOString()),
  };
}

/** 화면 타입 -> DB 행 */
function toRow(assignment: DispatchAssignment) {
  return {
    assignment_id: assignment.assignmentId,

    worker_id: assignment.workerId,
    worker_name: assignment.workerName,
    worker_type: assignment.workerType,
    task_type: assignment.taskType,
    assigned_skill_level: assignment.assignedSkillLevel,
    worker_capabilities: assignment.workerCapabilities ?? [],

    home_sido_name: assignment.homeSidoName,
    home_sigungu_code: assignment.homeSigunguCode,
    home_sigungu_name: assignment.homeSigunguName,

    target_sido_name: assignment.targetSidoName,
    target_sigungu_code: assignment.targetSigunguCode,
    target_sigungu_name: assignment.targetSigunguName,
    target_emd_code: assignment.targetEmdCode,
    target_emd_name: assignment.targetEmdName,

    grid_id: assignment.gridId,
    target_latitude: assignment.targetLatitude ?? null,
    target_longitude: assignment.targetLongitude ?? null,
    source_tree_id: assignment.sourceTreeId ?? null,

    priority_grade: assignment.priorityGrade,
    risk_grade: assignment.riskGrade,
    risk_score: assignment.riskScore,
    access_score: assignment.accessScore,

    distance_km: assignment.distanceKm,
    travel_time_hour: assignment.travelTimeHour,
    battery_percent: assignment.batteryPercent,
    remaining_minutes_at_assignment: assignment.remainingMinutesAtAssignment,

    recommendation_reason: assignment.recommendationReason,
    assignment_type: assignment.assignmentType,

    status: assignment.status,
    assigned_at: assignment.assignedAt,
  };
}

/**
 * 저장된 배정을 모두 읽는다.
 * 테이블이 아직 없으면(PGRST205) 조용히 빈 배열을 준다 —
 * 마이그레이션 전에도 화면이 뜨게 하기 위함이다.
 */
export async function fetchDispatchAssignments(): Promise<
  DispatchAssignment[]
> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("assigned_at", { ascending: false });

  if (error) {
    if (error.code !== "PGRST205") {
      console.error("dispatch_assignments 조회 실패:", error);
    }
    return [];
  }

  return (data ?? []).map(toAssignment);
}

/** 배정 한 건을 저장한다. 같은 assignment_id 가 있으면 덮어쓴다. */
export async function saveDispatchAssignment(
  assignment: DispatchAssignment,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from(TABLE)
    .upsert(toRow(assignment), { onConflict: "assignment_id" });

  if (error) {
    console.error("배정 저장 실패:", error);
    return false;
  }
  return true;
}

/** 여러 건을 한 번에 저장한다. */
export async function saveDispatchAssignments(
  assignments: DispatchAssignment[],
): Promise<boolean> {
  if (!supabase || assignments.length === 0) return false;

  const { error } = await supabase
    .from(TABLE)
    .upsert(assignments.map(toRow), { onConflict: "assignment_id" });

  if (error) {
    console.error("배정 일괄 저장 실패:", error);
    return false;
  }
  return true;
}

/**
 * 상태만 바꾼다. 앱과 웹 양쪽이 호출한다.
 * "작업 완료" 계열이면 completed_at 도 함께 남긴다.
 */
export async function updateDispatchStatus(
  assignmentId: string,
  status: DispatchStatus,
): Promise<boolean> {
  if (!supabase) return false;

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "작업 완료" || status === "복귀" || status === "복귀 완료") {
    patch.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("assignment_id", assignmentId);

  if (error) {
    console.error("배정 상태 변경 실패:", error);
    return false;
  }
  return true;
}

/** 배정을 지운다. */
export async function deleteDispatchAssignment(
  assignmentId: string,
): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("assignment_id", assignmentId);

  if (error) {
    console.error("배정 삭제 실패:", error);
    return false;
  }
  return true;
}

/**
 * 배정 변경을 실시간으로 받는다. 앱이 상태를 바꾸면 웹 화면이 바로 따라간다.
 * 반환값을 호출하면 구독을 해제한다.
 */
export function subscribeDispatchAssignments(
  onChange: (event: {
    type: "INSERT" | "UPDATE" | "DELETE";
    assignment?: DispatchAssignment;
    assignmentId?: string;
  }) => void,
): () => void {
  if (!supabase) return () => {};

  const channel = supabase
    .channel("dispatch-assignments-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const removed = payload.old as { assignment_id?: string };
          onChange({
            type: "DELETE",
            assignmentId: removed?.assignment_id,
          });
          return;
        }

        onChange({
          type: payload.eventType as "INSERT" | "UPDATE",
          assignment: toAssignment(payload.new),
        });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
