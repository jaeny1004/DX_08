/**
 * 현장요원 데이터 로더.
 *
 * workforce_v2의 파일 4개(명단·역량·근무가능·현재상태)를 합쳐
 * 화면에서 바로 쓸 수 있는 형태로 만든다.
 *
 * MonitoringSection과 FieldSection이 각자 같은 로직을 들고 있었는데,
 * 세 번째 사본을 만들지 않으려고 여기로 뺐다.
 */
import type { DispatchTaskType } from "../types/dispatch";

const WORKERS_PATH = "/data/workforce_v2/workers.json";
const CAPABILITIES_PATH = "/data/workforce_v2/worker_capabilities.json";
const AVAILABILITY_PATH = "/data/workforce_v2/worker_availability.json";
const CURRENT_STATUS_PATH = "/data/workforce_v2/worker_current_status.json";

export interface WorkforceCapability {
  taskType: DispatchTaskType;
  skillLevel: number;
}

export interface WorkforceMember {
  workerId: string;
  workerName: string;
  organization: string;
  homeSidoName: string;
  homeSigunguCode: string;
  homeSigunguName: string;
  baseLatitude: number;
  baseLongitude: number;
  capabilities: WorkforceCapability[];
  availabilityStatus: string;
  currentStatus: string;
  remainingMinutes: number;
  batteryPercent: number | null;
}

/** 근무 가능으로 볼 값들. 데이터 출처마다 표기가 섞여 있어 함께 받는다. */
const AVAILABLE_VALUES = ["AVAILABLE", "PARTIAL", "대기", "가능"];
const ACTIVE_STATUS_VALUES = ["AVAILABLE", "대기", "복귀"];

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

let cache: WorkforceMember[] | null = null;
let loading: Promise<WorkforceMember[]> | null = null;

/** 배정 가능한 요원 목록을 받는다. 실패하면 빈 배열. */
export function loadWorkforce(): Promise<WorkforceMember[]> {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;

  loading = Promise.all(
    [
      WORKERS_PATH,
      CAPABILITIES_PATH,
      AVAILABILITY_PATH,
      CURRENT_STATUS_PATH,
    ].map((path) => fetch(path, { cache: "force-cache" })),
  )
    .then(async (responses) => {
      if (responses.some((response) => !response.ok)) {
        throw new Error("요원 데이터를 불러오지 못했습니다.");
      }

      const [workers, capabilities, availability, currentStatus] =
        await Promise.all(responses.map((response) => response.json()));

      if (
        !Array.isArray(workers) ||
        !Array.isArray(capabilities) ||
        !Array.isArray(availability) ||
        !Array.isArray(currentStatus)
      ) {
        throw new Error("요원 데이터 형식이 올바르지 않습니다.");
      }

      const capabilityMap = new Map<string, WorkforceCapability[]>();
      for (const row of capabilities) {
        const workerId = String(row.worker_id ?? "");
        const taskType = String(row.task_type ?? "") as DispatchTaskType;
        if (!workerId) continue;
        if (!["SURVEY", "DRONE", "CONTROL"].includes(taskType)) continue;

        const list = capabilityMap.get(workerId) ?? [];
        list.push({ taskType, skillLevel: toNumber(row.skill_level) });
        capabilityMap.set(workerId, list);
      }

      const availabilityMap = new Map(
        availability.map((row: any) => [String(row.worker_id ?? ""), row]),
      );
      const statusMap = new Map(
        currentStatus.map((row: any) => [String(row.worker_id ?? ""), row]),
      );

      const result: WorkforceMember[] = [];
      for (const row of workers) {
        const workerId = String(row.worker_id ?? "");
        if (!workerId) continue;

        const availabilityRow = availabilityMap.get(workerId);
        const statusRow = statusMap.get(workerId);
        const battery = statusRow?.battery_level;

        result.push({
          workerId,
          workerName: String(row.worker_name ?? ""),
          organization: String(row.organization ?? ""),
          homeSidoName: String(row.home_sido_name ?? ""),
          homeSigunguCode: String(row.home_sigungu_code ?? ""),
          homeSigunguName: String(row.home_sigungu_name ?? ""),
          baseLatitude: toNumber(row.base_lat),
          baseLongitude: toNumber(row.base_lon),
          capabilities: capabilityMap.get(workerId) ?? [],
          availabilityStatus: String(availabilityRow?.availability_status ?? ""),
          currentStatus: String(statusRow?.status ?? ""),
          remainingMinutes: toNumber(availabilityRow?.remaining_minutes),
          batteryPercent:
            battery === null || battery === undefined
              ? null
              : toNumber(battery),
        });
      }

      cache = result;
      return result;
    })
    .catch(() => []);

  return loading;
}

/** 특정 업무를 맡을 수 있고 지금 배정 가능한 요원만 추린다. */
export function filterAssignable(
  members: WorkforceMember[],
  taskType: DispatchTaskType,
): WorkforceMember[] {
  return members.filter((member) => {
    const capable = member.capabilities.some(
      (capability) => capability.taskType === taskType,
    );
    return (
      capable &&
      AVAILABLE_VALUES.includes(member.availabilityStatus) &&
      ACTIVE_STATUS_VALUES.includes(member.currentStatus) &&
      member.remainingMinutes > 0
    );
  });
}
