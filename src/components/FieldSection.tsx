import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Battery,
  CircleX,
  Image as ImageIcon,
  ListCheckIcon,
  LoaderCircle,
  MapPin,
  UserCheck,
  Users,
} from "lucide-react";

import {
  CrowdReport,
  FieldPhotoRecord,
  FieldVoiceLogRecord,
  TreeRecord,
  WorkerStatus,
} from "../types";
import { createTreeId } from "../utils/treeId";
import { buildStorageUrl } from "../utils/storageUrl";

import {
  DispatchAssignment,
  DispatchStatus,
} from "../types/dispatch";

import { LeafletMap } from "./LeafletMap";
import {
  FIELD_WORKERS,
  type FieldWorkerMarker,
} from "../config/operationsMockData";
import {
  formatGridLocation,
  loadGridLookup,
  type GridLocation,
} from "../utils/gridLookup";
import RegionPicker, {
  EMPTY_REGION,
  formatRegionText,
  type RegionPickerValue,
} from "./RegionPicker";

type SurveyWorkerCandidate = {
  workerId: string;
  workerName: string;
  homeSidoName: string;
  homeSigunguCode: string;
  homeSigunguName: string;
  baseLatitude: number;
  baseLongitude: number;
  skillLevel: number;
  batteryPercent: number | null;
  remainingMinutes: number;
};

/** 두 지점 사이 거리(km). 요원을 가까운 순으로 정렬할 때 쓴다. */
function calculateDistanceKm(
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

/**
 * 예찰 배정 진행 순서. 화면의 상태 선택 목록도 이 순서를 따른다.
 * 복귀·복귀 완료는 고르지 않는다 — 작업 완료 시 뜨는 현장 판정에서
 * 확진목 이관 / 방제 이관 / 반려 중 하나로 정리되면 시스템이 종료 처리한다.
 */
const DISPATCH_STATUS_FLOW: DispatchStatus[] = [
  "배정 대기",
  "배정 수락",
  "출동",
  "현장 도착",
  "작업 중",
  "작업 완료",
];

/** 진행 단계별 색상. 대기 -> 이동 -> 작업 -> 완료 순으로 톤을 바꾼다. */
function dispatchStatusClass(status: DispatchStatus): string {
  if (status === "배정 대기") {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }
  if (status === "배정 수락" || status === "출동") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "현장 도착" || status === "작업 중") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "작업 완료") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-300 bg-white text-slate-500";
}

interface FieldSectionProps {
  reports: CrowdReport[];

  /*
   * 현재 App.tsx 호출부와의 호환성을 위해 유지합니다.
   * 이 화면에서는 시민 제보 관련 기능만 사용합니다.
   */
  workers?: WorkerStatus[];
  dispatchAssignments?: DispatchAssignment[];

  /*
   * 현장 요원이 앱에서 올린 자료.
   * related_record_id 에 예찰 배정 ID 가 들어 있어 그것으로 묶어 본다.
   * 감염 여부 판단은 이 자료를 보고 관제가 한다.
   */
  fieldPhotos?: FieldPhotoRecord[];
  fieldVoiceLogs?: FieldVoiceLogRecord[];

  onUpdateDispatchStatus?: (
    assignmentId: string,
    status: DispatchStatus
  ) => void;

  onCancelDispatch?: (
    assignmentId: string
  ) => void;

  onUpdateWorkerStatus?: (
    id: string,
    status: WorkerStatus["status"]
  ) => void;

  onConfirmInfection?: (
    report: CrowdReport
  ) => boolean | Promise<boolean>;

  onRejectReport?: (
    report: CrowdReport
  ) => boolean | Promise<boolean>;

  onAssignWorker?: (
    assignment: DispatchAssignment
  ) => void;

  /** 작업 완료 시 감염이 확인되면 확진목으로 넘긴다. */
  onAddTree?: (tree: TreeRecord) => void;

  /** 확진목 관리 ID 채번용 기존 ID 목록. */
  existingTreeIds?: string[];
}

type FlexibleCrowdReport = CrowdReport & {
  image_url?: string;
  imageUrl?: string;
  photo_url?: string;
  photoUrl?: string;
  image?: string;
  file_url?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
};

function getReportImageUrl(report?: CrowdReport): string {
  if (!report) return "";

  const flexibleReport = report as FlexibleCrowdReport;

  return (
    flexibleReport.image_url ||
    flexibleReport.imageUrl ||
    flexibleReport.photo_url ||
    flexibleReport.photoUrl ||
    flexibleReport.image ||
    flexibleReport.file_url ||
    ""
  );
}

function getReportLatitude(
  report?: CrowdReport
): number | string | undefined {
  if (!report) return undefined;

  const flexibleReport = report as FlexibleCrowdReport;

  return (
    flexibleReport.latitude ??
    flexibleReport.lat
  );
}

function getReportLongitude(
  report?: CrowdReport
): number | string | undefined {
  if (!report) return undefined;

  const flexibleReport = report as FlexibleCrowdReport;

  return (
    flexibleReport.longitude ??
    flexibleReport.lng
  );
}

function formatCoordinate(
  value: number | string | undefined
): string {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "좌표 없음";
  }

  const numericValue = Number(value);

  if (Number.isFinite(numericValue)) {
    return numericValue.toFixed(7);
  }

  return String(value);
}

function toFiniteNumber(
  value: unknown,
  fallback = 0
): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue
    : fallback;
}


function getReportStatusLabel(
  status: CrowdReport["status"]
): string {
  switch (String(status)) {
    case "pending":
    case "접수 완료":
      return "접수 완료";

    case "in_progress":
    case "조사 완료":
      return "조사 완료";

    case "completed":
    case "방제 완료":
      return "방제 완료";

    default:
      return String(status);
  }
}

function getReportStatusClass(
  status: CrowdReport["status"]
): string {
  switch (String(status)) {
    case "접수 완료":
    case "pending":
      return "bg-sky-100 text-sky-700";

    case "조사 완료":
    case "in_progress":
      return "bg-amber-100 text-amber-700";

    case "방제 완료":
    case "completed":
    case "확진전환":
      return "bg-emerald-100 text-emerald-700";

    case "반려":
      return "bg-slate-200 text-slate-600";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function FieldSection({
  reports,
  onConfirmInfection,
  onRejectReport,
  onAssignWorker,
  onUpdateDispatchStatus,
  onCancelDispatch,
  onAddTree,
  existingTreeIds = [],
  dispatchAssignments = [],
  fieldPhotos = [],
  fieldVoiceLogs = [],
}: FieldSectionProps) {
  // 좌표를 행정동·격자ID로 바꿔 표시하려면 룩업이 먼저 있어야 한다.
  // 판정 결과 useMemo가 이 값을 의존성으로 잡아야, 로드가 끝난 뒤에 다시 계산된다.
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

  const [selectedReportId, setSelectedReportId] =
    useState<string | null>(null);

  const [selectedWorkerId, setSelectedWorkerId] =
    useState<string | null>(null);

  const [selectedAssignmentId, setSelectedAssignmentId] =
    useState<string | null>(null);

  const [convertedReportIds, setConvertedReportIds] =
    useState<Set<string>>(() => new Set());


  const [processingReportId, setProcessingReportId] =
    useState<string | null>(null);

  const [rejectingReportId, setRejectingReportId] =
    useState<string | null>(null);

  const [surveyWorkerCandidates, setSurveyWorkerCandidates] =
    useState<SurveyWorkerCandidate[]>([]);

  const [workerLoadError, setWorkerLoadError] =
    useState("");

  // ---------------------------------------------------------
  // 신규 예찰 배정 등록
  // 시민 제보 없이도 지역을 직접 지정해 예찰 요원을 배정할 수 있게 한다.
  // ---------------------------------------------------------
  const [isCreatingSurvey, setIsCreatingSurvey] = useState(false);
  const [surveyRegionValue, setSurveyRegionValue] =
    useState<RegionPickerValue>(EMPTY_REGION);
  const [surveyGridLocation, setSurveyGridLocation] =
    useState<GridLocation | null>(null);
  const [surveyMessage, setSurveyMessage] = useState("");

  const surveyRegion = formatRegionText(surveyRegionValue);

  // 작업 완료 시 뜨는 현장 판정 팝업.
  // step: 감염 여부 -> (미감염일 때) 방제 이관 / 반려 선택
  const [completionTarget, setCompletionTarget] =
    useState<DispatchAssignment | null>(null);
  const [completionStep, setCompletionStep] =
    useState<"infection" | "clean">("infection");

  const selectedReport =
    reports.find(
      (report) =>
        String(report.id) === selectedReportId
    ) || null;

  const selectedWorker =
    FIELD_WORKERS.find(
      (worker) => worker.id === selectedWorkerId
    ) || null;

  const surveyAssignments = useMemo(
    () => dispatchAssignments.filter(
      (assignment) =>
        assignment.taskType === "SURVEY" &&
        assignment.status !== "복귀 완료"
    ),
    [dispatchAssignments]
  );

  const unassignedSurveyWorkers = useMemo(() => {
    const assignedWorkerIds = new Set(
      surveyAssignments.map(
        (assignment) => assignment.workerId
      )
    );

    return surveyWorkerCandidates.filter(
      (worker) => !assignedWorkerIds.has(worker.workerId)
    );
  }, [surveyAssignments, surveyWorkerCandidates]);

  /**
   * 대상 위치 기준으로 요원을 정렬한다.
   * 같은 시군구 소속을 먼저 올리고, 그 안에서는 가까운 순으로 둔다.
   * 위치를 모르면 기존처럼 숙련도 순(로드 시 정렬된 순서)을 그대로 쓴다.
   */
  /*
   * 위치 정보가 전혀 없을 때 기준으로 삼는 지역.
   * 이 사업의 주 대상지가 경북 포항이라 그쪽 요원을 먼저 올린다.
   * 다른 지역을 기준으로 삼으려면 이 값만 바꾸면 된다.
   */
  const FALLBACK_SIGUNGU_NAME = "포항시";

  const rankWorkersForLocation = (
    latitude: number | undefined,
    longitude: number | undefined,
    sigunguName?: string,
  ) => {
    const hasPoint =
      typeof latitude === "number" &&
      Number.isFinite(latitude) &&
      typeof longitude === "number" &&
      Number.isFinite(longitude);

    /*
     * 위치도 지역명도 없으면 예전에는 전국 요원이 숙련도 순으로 그냥 쏟아졌다.
     * 그 목록에서는 누구를 골라야 할지 판단할 근거가 없다.
     * 이럴 때는 기준 지역을 하나 정해 그 지역 요원을 먼저 보여준다.
     * (시민 제보에 좌표가 없는 경우가 실제로 있다 — 위치 권한을 거부하면 그렇다)
     */
    if (!hasPoint && !sigunguName) {
      const fallback = unassignedSurveyWorkers
        .map((worker) => ({
          worker,
          distanceKm: null as number | null,
          localRegion:
            worker.homeSigunguName === FALLBACK_SIGUNGU_NAME,
        }))
        .sort((left, right) => {
          if (left.localRegion !== right.localRegion) {
            return left.localRegion ? -1 : 1;
          }
          return right.worker.skillLevel - left.worker.skillLevel;
        });

      return fallback;
    }

    return unassignedSurveyWorkers
      .map((worker) => ({
        worker,
        distanceKm: hasPoint
          ? calculateDistanceKm(
              worker.baseLatitude,
              worker.baseLongitude,
              latitude!,
              longitude!,
            )
          : null,
        localRegion: Boolean(
          sigunguName &&
            worker.homeSigunguName &&
            sigunguName.includes(worker.homeSigunguName),
        ),
      }))
      .sort((left, right) => {
        if (left.localRegion !== right.localRegion) {
          return left.localRegion ? -1 : 1;
        }
        if (left.distanceKm !== null && right.distanceKm !== null) {
          return left.distanceKm - right.distanceKm;
        }
        return right.worker.skillLevel - left.worker.skillLevel;
      });
  };

  // 신규 등록 폼에서 쓸 목록 — 입력한 위치 기준.
  const surveyWorkerOptions = useMemo(
    () =>
      rankWorkersForLocation(
        surveyGridLocation?.latitude,
        surveyGridLocation?.longitude,
        surveyRegion,
      ).slice(0, 30),
    // rankWorkersForLocation은 아래 값들만 참조한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unassignedSurveyWorkers, surveyGridLocation, surveyRegion],
  );

  const selectedAssignment =
    surveyAssignments.find(
      (assignment) =>
        assignment.assignmentId ===
        selectedAssignmentId
    ) || null;

  useEffect(() => {
    if (
      selectedReportId !== null &&
      !reports.some(
        (report) =>
          String(report.id) === selectedReportId
      )
    ) {
      setSelectedReportId(null);
    }
  }, [reports, selectedReportId]);

  useEffect(() => {
    if (
      selectedAssignmentId !== null &&
      !surveyAssignments.some(
        (assignment) =>
          assignment.assignmentId ===
          selectedAssignmentId
      )
    ) {
      setSelectedAssignmentId(null);
    }
  }, [surveyAssignments, selectedAssignmentId]);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch("/data/workforce_v2/workers.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch("/data/workforce_v2/worker_capabilities.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch("/data/workforce_v2/worker_availability.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
      fetch("/data/workforce_v2/worker_current_status.json", {
        cache: "no-cache",
        signal: controller.signal,
      }),
    ])
      .then(async (responses) => {
        for (const response of responses) {
          if (!response.ok) {
            throw new Error(
              `요원 데이터 로드 실패 (${response.status})`
            );
          }
        }

        const [
          workersData,
          capabilitiesData,
          availabilityData,
          currentStatusData,
        ] = await Promise.all(
          responses.map((response) => response.json())
        );

        if (
          !Array.isArray(workersData) ||
          !Array.isArray(capabilitiesData) ||
          !Array.isArray(availabilityData) ||
          !Array.isArray(currentStatusData)
        ) {
          throw new Error("요원 데이터 형식이 올바르지 않습니다.");
        }

        const surveySkillMap = new Map<string, number>();
        for (const row of capabilitiesData) {
          if (String(row.task_type ?? "") !== "SURVEY") {
            continue;
          }

          surveySkillMap.set(
            String(row.worker_id ?? ""),
            toFiniteNumber(row.skill_level, 1)
          );
        }

        const availabilityMap = new Map(
          availabilityData.map((row: any) => [
            String(row.worker_id ?? ""),
            row,
          ])
        );

        const currentStatusMap = new Map(
          currentStatusData.map((row: any) => [
            String(row.worker_id ?? ""),
            row,
          ])
        );

        const candidates = workersData
          .map((row: any): SurveyWorkerCandidate | null => {
            const workerId = String(row.worker_id ?? "");
            const skillLevel = surveySkillMap.get(workerId);

            if (!workerId || skillLevel === undefined) {
              return null;
            }

            const availability =
              availabilityMap.get(workerId) ?? {};
            const currentStatus =
              currentStatusMap.get(workerId) ?? {};
            const availabilityStatus = String(
              availability.availability_status ?? "UNAVAILABLE"
            );
            const status = String(
              currentStatus.status ?? "UNAVAILABLE"
            );

            if (
              !["AVAILABLE", "PARTIAL", "대기", "가능"].includes(
                availabilityStatus
              ) ||
              !["AVAILABLE", "대기", "복귀"].includes(status) ||
              toFiniteNumber(availability.remaining_minutes) <= 0
            ) {
              return null;
            }

            return {
              workerId,
              workerName: String(row.worker_name ?? "현장 요원"),
              homeSidoName: String(row.home_sido_name ?? ""),
              homeSigunguCode: String(row.home_sigungu_code ?? ""),
              homeSigunguName: String(row.home_sigungu_name ?? ""),
              baseLatitude: toFiniteNumber(row.base_lat),
              baseLongitude: toFiniteNumber(row.base_lon),
              skillLevel,
              batteryPercent:
                currentStatus.battery_level == null
                  ? null
                  : toFiniteNumber(currentStatus.battery_level),
              remainingMinutes: toFiniteNumber(
                availability.remaining_minutes
              ),
            };
          })
          .filter(
            (worker: SurveyWorkerCandidate | null): worker is SurveyWorkerCandidate =>
              worker !== null
          )
          .sort(
            (left, right) =>
              right.skillLevel - left.skillLevel ||
              right.remainingMinutes - left.remainingMinutes
          );

        setSurveyWorkerCandidates(candidates);
        setWorkerLoadError("");
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("예찰 요원 데이터 로드 실패:", error);
        setWorkerLoadError(
          error instanceof Error
            ? error.message
            : "요원 목록을 불러오지 못했습니다."
        );
      });

    return () => controller.abort();
  }, []);

  const handleToggleReport = (
    reportId: string
  ) => {
    setSelectedReportId((previous) =>
      previous === reportId
        ? null
        : reportId
    );
  };

  const handleAssignAndConfirm = async (
    report: CrowdReport,
    worker: SurveyWorkerCandidate
  ) => {
    const reportId = String(report.id);

    if (
      convertedReportIds.has(reportId) ||
      processingReportId === reportId
    ) {
      return;
    }

    setProcessingReportId(reportId);

    try {
      const confirmed = await onConfirmInfection?.(report);

      if (confirmed === false) {
        return;
      }

      const latitude = toFiniteNumber(
        getReportLatitude(report),
        worker.baseLatitude
      );
      const longitude = toFiniteNumber(
        getReportLongitude(report),
        worker.baseLongitude
      );
      const regionParts = String(report.region ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      onAssignWorker?.({
        assignmentId: `REPORT-${reportId}-${Date.now()}`,
        workerId: worker.workerId,
        workerName: worker.workerName,
        workerType: "현장요원",
        taskType: "SURVEY",
        workerCapabilities: [
          {
            taskType: "SURVEY",
            skillLevel: worker.skillLevel,
          },
        ],
        assignedSkillLevel: worker.skillLevel,
        homeSidoName: worker.homeSidoName,
        homeSigunguCode: worker.homeSigunguCode,
        homeSigunguName: worker.homeSigunguName,
        targetSidoName: regionParts[0] ?? "",
        targetSigunguCode: "",
        targetSigunguName: regionParts[1] ?? report.region ?? "",
        targetEmdCode: "",
        targetEmdName: regionParts.slice(2).join(" "),
        gridId: `CIVIL-${reportId}`,
        targetLatitude: latitude,
        targetLongitude: longitude,
        priorityGrade: "현장 확인",
        riskGrade:
          report.aiProbability >= 75
            ? "매우 높음"
            : report.aiProbability >= 45
              ? "높음"
              : "주의",
        riskScore: report.aiProbability,
        accessScore: 0,
        distanceKm: null,
        travelTimeHour: null,
        batteryPercent: worker.batteryPercent,
        remainingMinutesAtAssignment: worker.remainingMinutes,
        recommendationReason:
          `시민 제보 ${reportId} 확진 전환 후 현장 확인 배정`,
        assignmentType: "지역 내 배정",
        status: "출동",
        assignedAt: new Date().toISOString(),
      });

      setConvertedReportIds((previous) => {
        const next = new Set(previous);
        next.add(reportId);
        return next;
      });
    } finally {
      setProcessingReportId(null);
    }
  };

  /**
   * 확진목 전환만 한다.
   *
   * 예전에는 이 버튼이 요원 선택 목록을 열고, 요원을 고르면 그때서야 확진
   * 전환과 배정이 함께 처리됐다. 두 판단은 시점이 다르다. 확진 여부는 제보를
   * 보고 바로 정하지만, 누구를 보낼지는 인력 상황을 보고 나중에 정한다.
   * 요원을 고르지 않으면 확진 전환도 안 되는 구조라 제보가 계속 쌓였다.
   *
   * 배정은 아래 "예찰 요원 배정"에서 따로 한다.
   */
  const handleConfirmOnly = async (report: CrowdReport) => {
    const reportId = String(report.id);

    if (
      convertedReportIds.has(reportId) ||
      processingReportId === reportId
    ) {
      return;
    }

    setProcessingReportId(reportId);

    try {
      const confirmed = await onConfirmInfection?.(report);

      if (confirmed === false) {
        return;
      }

      setConvertedReportIds((previous) => {
        const next = new Set(previous);
        next.add(reportId);
        return next;
      });

      setSurveyMessage(
        `시민 제보 ${reportId}을 확진목으로 전환했습니다. ` +
          "예찰 요원 배정에서 담당자를 지정하세요.",
      );
    } finally {
      setProcessingReportId(null);
    }
  };

  /**
   * 시민 제보를 거치지 않고 지역을 직접 지정해 예찰 요원을 배정한다.
   * 위치는 지역명 또는 좌표 중 하나만 있어도 되고, 격자·행정동은 역조회로 채운다.
   */
  const handleCreateSurveyAssignment = (
    worker: SurveyWorkerCandidate,
  ) => {
    if (!surveyGridLocation) {
      setSurveyMessage(
        "발견 위치를 먼저 입력하세요. 행정동이 확인되어야 배정할 수 있습니다.",
      );
      return;
    }

    onAssignWorker?.({
      assignmentId: `SURVEY-${surveyGridLocation.gridId}-${Date.now()}`,
      workerId: worker.workerId,
      workerName: worker.workerName,
      workerType: "현장요원",
      taskType: "SURVEY",
      workerCapabilities: [
        {
          taskType: "SURVEY",
          skillLevel: worker.skillLevel,
        },
      ],
      assignedSkillLevel: worker.skillLevel,
      homeSidoName: worker.homeSidoName,
      homeSigunguCode: worker.homeSigunguCode,
      homeSigunguName: worker.homeSigunguName,
      targetSidoName: surveyRegionValue.sido,
      targetSigunguCode: "",
      targetSigunguName: surveyRegionValue.sigungu,
      targetEmdCode: "",
      targetEmdName: surveyGridLocation.emdName,
      gridId: surveyGridLocation.gridId,
      targetLatitude: surveyGridLocation.latitude,
      targetLongitude: surveyGridLocation.longitude,
      priorityGrade: "현장 확인",
      riskGrade: "주의",
      riskScore: 0,
      accessScore: 0,
      distanceKm: null,
      travelTimeHour: null,
      batteryPercent: worker.batteryPercent,
      remainingMinutesAtAssignment: worker.remainingMinutes,
      recommendationReason:
        `${surveyGridLocation.emdName} 격자 ${surveyGridLocation.gridId} 신규 예찰 배정`,
      assignmentType: "지역 내 배정",
      // 새 배정은 배정 대기에서 시작해 단계별로 전환한다.
      status: "배정 대기",
      assignedAt: new Date().toISOString(),
    });

    setSurveyMessage(
      `${worker.workerName} 요원을 ${surveyGridLocation.emdName} 격자 ` +
        `${surveyGridLocation.gridId}에 배정했습니다.`,
    );
    setSurveyRegionValue(EMPTY_REGION);
    setIsCreatingSurvey(false);
  };

  /**
   * 상태 변경 진입점.
   * '작업 완료'를 고르면 바로 반영하지 않고 판정 화면을 먼저 띄운다.
   * 감염 여부에 따라 이후 흐름(확진목 / 방제 / 반려)이 갈리기 때문이다.
   */
  const handleDispatchStatusChange = (
    assignment: DispatchAssignment,
    nextStatus: DispatchStatus,
  ) => {
    if (nextStatus === "작업 완료") {
      setCompletionTarget(assignment);
      setCompletionStep("infection");
      return;
    }
    onUpdateDispatchStatus?.(assignment.assignmentId, nextStatus);
  };

  /*
   * 현장 요원이 앱에서 자료를 올리고 '작업 완료'로 넘긴 건들.
   * 관제가 사진·음성을 보고 감염 여부를 정해야 하는 대상이다.
   * 판정이 끝나면 '복귀 완료'가 되거나 삭제되므로 목록에서 빠진다.
   */
  const pendingReviews = useMemo(
    () =>
      surveyAssignments.filter(
        (assignment) => assignment.status === "작업 완료",
      ),
    [surveyAssignments],
  );

  /** 판정 대상에 딸린 제출 자료를 배정 ID 로 묶는다. */
  const reviewPhotos = useMemo(
    () =>
      completionTarget
        ? fieldPhotos.filter(
            (photo) =>
              photo.relatedRecordId === completionTarget.assignmentId,
          )
        : [],
    [completionTarget, fieldPhotos],
  );

  const reviewVoiceLogs = useMemo(
    () =>
      completionTarget
        ? fieldVoiceLogs.filter(
            (log) =>
              log.relatedRecordId === completionTarget.assignmentId,
          )
        : [],
    [completionTarget, fieldVoiceLogs],
  );

  /** 목록에서 "자료 N건" 배지를 띄우기 위한 건수 */
  const submissionCountOf = (assignmentId: string) => ({
    photos: fieldPhotos.filter(
      (photo) => photo.relatedRecordId === assignmentId,
    ).length,
    voiceLogs: fieldVoiceLogs.filter(
      (log) => log.relatedRecordId === assignmentId,
    ).length,
  });

  /** 감염이 확인된 경우: 확진목으로 넘기고 배정을 종료한다. */
  const handleCompletionInfected = () => {
    const assignment = completionTarget;
    if (!assignment) return;

    const location =
      [assignment.targetSigunguName, assignment.targetEmdName]
        .filter(Boolean)
        .join(" ") || `격자 ${assignment.gridId}`;

    onAddTree?.({
      id: createTreeId(existingTreeIds),
      region: location,
      species: "소나무",
      confirmedDate: new Date().toISOString().split("T")[0],
      status: "방제대기",
      severity: "중",
      x: 0,
      y: 0,
      ...(typeof assignment.targetLatitude === "number" &&
      typeof assignment.targetLongitude === "number"
        ? {
            latitude: assignment.targetLatitude,
            longitude: assignment.targetLongitude,
          }
        : {}),
      emdName: assignment.targetEmdName || undefined,
      gridId: assignment.gridId,
      inspector: assignment.workerName,
      /*
       * 현장에서 올린 사진·음성은 related_record_id 에 배정 ID 를 달고 있다.
       * 확진목의 source_report_id 를 같은 값으로 맞춰 두면 확진목 타임라인이
       * 그 자료를 그대로 묶어서 보여준다(MonitoringSection 이 이 값으로 찾는다).
       * 무엇을 보고 확진했는지 확진목에 남는다.
       */
      sourceReportId: assignment.assignmentId,
      timeline: [
        {
          stage: "현장 예찰 완료",
          date: new Date().toLocaleString(),
          note:
            `${assignment.workerName} 요원이 현장 확인 결과 감염 의심목을 확인. ` +
            `위치: ${location} · 격자 ${assignment.gridId}`,
          actor: assignment.workerName,
        },
      ],
    });

    onUpdateDispatchStatus?.(assignment.assignmentId, "복귀 완료");
    setCompletionTarget(null);
    setSurveyMessage(
      `${location} 현장 확인 결과를 확진목 리스트로 넘겼습니다.`,
    );
  };

  /** 미감염 + 방제 이관: 같은 격자에 방제 작업을 만든다. */
  const handleCompletionToControl = () => {
    const assignment = completionTarget;
    if (!assignment) return;

    onAssignWorker?.({
      ...assignment,
      assignmentId: `CONTROL-${assignment.gridId}-${Date.now()}`,
      workerType: "방제요원",
      taskType: "CONTROL",
      workerCapabilities: [
        {
          taskType: "CONTROL",
          skillLevel: assignment.assignedSkillLevel,
        },
      ],
      recommendationReason:
        `현장 예찰 결과 감염은 미확인이나 담당자 판단으로 방제 검토 이관 ` +
        `(예찰 배정 ${assignment.assignmentId})`,
      status: "배정 대기",
      assignedAt: new Date().toISOString(),
    });

    onUpdateDispatchStatus?.(assignment.assignmentId, "복귀 완료");
    setCompletionTarget(null);
    setSurveyMessage(
      `격자 ${assignment.gridId} 건을 방제 검토로 이관했습니다.`,
    );
  };

  /** 미감염 + 반려: 배정을 삭제해 목록에서 내린다. */
  const handleCompletionReject = () => {
    const assignment = completionTarget;
    if (!assignment) return;

    if (onCancelDispatch) {
      onCancelDispatch(assignment.assignmentId);
    } else {
      onUpdateDispatchStatus?.(assignment.assignmentId, "복귀 완료");
    }

    setCompletionTarget(null);
    setSelectedAssignmentId(null);
    setSurveyMessage(
      `격자 ${assignment.gridId} 예찰 건을 반려 처리했습니다.`,
    );
  };

  const handleRejectReport = async (
    report: CrowdReport
  ) => {
    const reportId = String(report.id);

    if (rejectingReportId === reportId) {
      return;
    }

    setRejectingReportId(reportId);

    try {
      const rejected = await onRejectReport?.(report);

      if (rejected !== false) {
        setSelectedReportId(null);
      }
    } finally {
      setRejectingReportId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="h-full min-h-0 w-full min-w-0"
    >
      <div className="grid h-full min-h-0 grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
      {/* 왼쪽: 목록과 선택 항목 상세를 하나의 패널에 통합 */}
      <section className="min-h-0 min-w-0 xl:col-span-6">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListCheckIcon
                  size={18}
                  className="shrink-0 text-emerald-700"
                />

                <h2 className="text-base font-black text-slate-950">
                  감염 의심목 예찰 리스트
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsCreatingSurvey((previous) => !previous);
                  setSurveyMessage("");
                }}
                className={
                  isCreatingSurvey
                    ? "shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
                    : "shrink-0 rounded-xl bg-emerald-800 px-3 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:bg-emerald-900"
                }
              >
                {isCreatingSurvey ? "배정 닫기" : "예찰 요원 배정"}
              </button>
            </div>

            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              항목을 선택하면 현장 이미지와 처리 정보를 확인할 수 있습니다.
              확진목으로 전환한 건은 [예찰 요원 배정]에서 담당자를 지정합니다.
            </p>
          </header>

          {/*
            예찰 요원 배정.
            확진목 전환과 분리된 뒤로는 여기가 배정 창구다.
            위치를 입력하면 가까운 순으로, 위치를 모르면 기준 지역 요원부터 뜬다.
          */}
          {isCreatingSurvey && (
            <div className="shrink-0 space-y-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <RegionPicker
                label="예찰 대상 위치"
                value={surveyRegionValue}
                onChange={setSurveyRegionValue}
                onResolve={setSurveyGridLocation}
              />

              {/* 요원 선택 */}
              <div>
                <label className="mb-1 block text-[11px] font-black text-slate-600">
                  예찰 요원
                </label>

                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  {surveyWorkerOptions.length === 0 && (
                    <div className="px-3 py-4 text-center text-[11px] font-bold text-slate-400">
                      배정 가능한 예찰 요원이 없습니다.
                    </div>
                  )}

                  {surveyWorkerOptions.map((option) => (
                    <button
                      key={option.worker.workerId}
                      type="button"
                      disabled={!surveyGridLocation}
                      onClick={() =>
                        handleCreateSurveyAssignment(option.worker)
                      }
                      className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-black text-slate-800">
                            {option.worker.workerName}
                          </span>
                          {option.localRegion && (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
                              관내
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] font-semibold text-slate-500">
                          {option.worker.homeSigunguName} · 숙련도{" "}
                          {option.worker.skillLevel}
                          {" · 잔여 "}
                          {option.worker.remainingMinutes}분
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {option.distanceKm !== null && (
                          <span className="block text-[10px] font-black text-slate-400">
                            {option.distanceKm.toFixed(1)}km
                          </span>
                        )}
                        <span className="block text-[10px] font-black text-emerald-700">
                          배정
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {surveyMessage && (
                <p className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-emerald-700">
                  {surveyMessage}
                </p>
              )}
            </div>
          )}

          <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pr-3">
            {reports.length === 0 && surveyAssignments.length === 0 && (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
                등록된 시민 제보 또는 예찰 배정이 없습니다.
              </div>
            )}

            {surveyAssignments.map((assignment) => {
              const isSelected =
                selectedAssignmentId ===
                assignment.assignmentId;
              const latitude =
                assignment.targetLatitude;
              const longitude =
                assignment.targetLongitude;

              return (
                <article
                  key={assignment.assignmentId}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    isSelected
                      ? "border-emerald-300 shadow-sm"
                      : "border-emerald-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssignmentId(
                        assignment.assignmentId
                      );
                      setSelectedReportId(null);
                      setSelectedWorkerId(null);
                    }}
                    className={`w-full p-4 text-left transition ${
                      isSelected
                        ? "bg-emerald-50"
                        : "bg-emerald-50/40 hover:bg-emerald-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-emerald-600" />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400">
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-700">
                              격자 예찰 배정
                            </span>

                            {/*
                              현장에서 자료를 올리고 넘긴 건. 관제가 봐야 할 대상이라
                              목록에서 바로 눈에 띄게 표시한다.
                            */}
                            {assignment.status === "작업 완료" && (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 font-black text-rose-700">
                                판정 대기
                                {(() => {
                                  const counts = submissionCountOf(
                                    assignment.assignmentId,
                                  );
                                  const total =
                                    counts.photos + counts.voiceLogs;
                                  return total > 0 ? ` · 자료 ${total}건` : "";
                                })()}
                              </span>
                            )}

                            <span>
                              {new Date(
                                assignment.assignedAt
                              ).toLocaleDateString("ko-KR")}
                            </span>
                          </div>

                          <h3 className="mt-1 truncate text-sm font-bold text-slate-800">
                            GRID-{assignment.gridId} 예찰 작업
                          </h3>

                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {formatGridLocation(latitude, longitude)}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-bold text-slate-400">
                          담당 요원
                        </div>
                        <div className="mt-0.5 text-sm font-black text-emerald-700">
                          {assignment.workerName}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/*
                    상태 전환. 카드 선택 버튼 안에 두면 버튼이 중첩되므로
                    바깥에 별도 줄로 배치한다.
                  */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-2">
                    <span className="text-[10px] font-bold text-slate-400">
                      진행 상태
                    </span>

                    <select
                      value={assignment.status}
                      onChange={(event) =>
                        handleDispatchStatusChange(
                          assignment,
                          event.target.value as DispatchStatus,
                        )
                      }
                      className={`rounded-lg border px-2 py-1 text-[10px] font-black outline-none ${dispatchStatusClass(
                        assignment.status,
                      )}`}
                    >
                      {DISPATCH_STATUS_FLOW.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/*
                    현장 자료가 올라온 건은 판정 버튼을 따로 둔다.
                    상태 드롭다운을 다시 건드리게 하면 이미 '작업 완료'인 값을
                    또 골라야 해서 동작하지 않는다.
                  */}
                  {assignment.status === "작업 완료" && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompletionTarget(assignment);
                        setCompletionStep("infection");
                      }}
                      className="w-full border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-[11px] font-black text-rose-700 transition hover:bg-rose-100"
                    >
                      현장 자료 확인하고 판정하기
                    </button>
                  )}
                </article>
              );
            })}

            {reports.map((report) => {
              const reportId = String(report.id);
              const isSelected =
                selectedReportId === reportId;
              const imageUrl =
                getReportImageUrl(report);
              const latitude =
                getReportLatitude(report);
              const longitude =
                getReportLongitude(report);

              // 제보 위치 기준으로 관내 요원을 먼저, 가까운 순으로 보여준다.
              const reportWorkerOptions = rankWorkersForLocation(
                Number(latitude),
                Number(longitude),
                report.region,
              ).slice(0, 8);

              return (
                <article
                  key={reportId}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    isSelected
                      ? "border-emerald-300 shadow-sm"
                      : "border-slate-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleReport(reportId)
                    }
                    className={`w-full p-4 text-left transition ${
                      isSelected
                        ? "bg-emerald-50"
                        : "bg-slate-50/60 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <span
                          className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
                            report.aiProbability >= 75
                              ? "bg-rose-500"
                              : report.aiProbability >= 45
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                        />

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-400">
                            <span className="font-mono">
                              {reportId}
                            </span>
                            <span>{report.date}</span>
                          </div>

                          <h3 className="mt-1 truncate text-sm font-bold text-slate-800">
                            {report.title}
                          </h3>

                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {formatGridLocation(latitude, longitude)}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-bold text-slate-400">
                          AI 감염 가능성
                        </div>

                        <div
                          className={`text-lg font-black ${
                            report.aiProbability >= 75
                              ? "text-rose-600"
                              : report.aiProbability >= 45
                                ? "text-amber-600"
                                : "text-emerald-600"
                          }`}
                        >
                          {report.aiProbability}%
                        </div>

                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${getReportStatusClass(
                            report.status
                          )}`}
                        >
                          {getReportStatusLabel(report.status)}
                        </span>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isSelected && (
                      <motion.div
                        initial={{
                          height: 0,
                          opacity: 0,
                        }}
                        animate={{
                          height: "auto",
                          opacity: 1,
                        }}
                        exit={{
                          height: 0,
                          opacity: 0,
                        }}
                        transition={{ duration: 0.24 }}
                        className="overflow-hidden border-t border-emerald-200 bg-white"
                      >
                        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                          {/* 상세 정보 */}
                          <div className="space-y-3">
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                              <div className="text-[10px] font-bold text-slate-400">
                                제보 상세 내용
                              </div>

                              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                                {report.description ||
                                  "등록된 상세 설명이 없습니다."}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                <div className="text-[10px] font-bold text-slate-400">
                                  위치
                                </div>

                                <div className="mt-1 break-all text-[11px] font-black leading-5 text-slate-800">
                                  {formatGridLocation(latitude, longitude)}
                                </div>
                              </div>

                              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                                <div className="text-[10px] font-bold text-rose-400">
                                  AI 감염 매핑지수
                                </div>

                                <div className="mt-1 text-lg font-black text-rose-600">
                                  {report.aiProbability}%
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              {/*
                                확진 전환과 요원 배정을 분리했다.
                                요원을 고르지 않으면 확진 전환도 안 되던 구조라
                                제보가 계속 쌓였다. 배정은 아래 전용 패널에서 한다.
                              */}
                              <button
                                type="button"
                                onClick={() => {
                                  void handleConfirmOnly(report);
                                }}
                                disabled={
                                  convertedReportIds.has(reportId) ||
                                  processingReportId === reportId ||
                                  rejectingReportId === reportId
                                }
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-800 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-100 disabled:text-emerald-700"
                              >
                                {processingReportId === reportId ? (
                                  <LoaderCircle
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <UserCheck size={14} />
                                )}
                                {convertedReportIds.has(reportId)
                                  ? "확진목 전환 완료"
                                  : processingReportId === reportId
                                    ? "전환 중"
                                    : "확진목 전환"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void handleRejectReport(report);
                                }}
                                disabled={
                                  processingReportId === reportId ||
                                  rejectingReportId === reportId
                                }
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {rejectingReportId === reportId ? (
                                  <LoaderCircle
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <CircleX size={14} />
                                )}
                                {rejectingReportId === reportId
                                  ? "삭제 중"
                                  : "반려"}
                              </button>
                            </div>

                          </div>

                          {/* 현장 이미지 */}
                          <div className="space-y-3">
                            <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl bg-slate-950">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt="시민 제보 현장 이미지"
                                  className="max-h-[360px] w-full object-contain"
                                  onError={(event) => {
                                    event.currentTarget.style.display =
                                      "none";
                                  }}
                                />
                              ) : (
                                <div className="p-6 text-center text-slate-400">
                                  <ImageIcon
                                    size={36}
                                    className="mx-auto mb-3 opacity-60"
                                  />

                                  <p className="text-xs font-bold">
                                    등록된 제보 이미지가 없습니다.
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <MapPin size={13} />
                                제보 위치
                              </div>

                              <p className="mt-1 break-all text-[11px] font-bold text-slate-700">
                                {formatGridLocation(
                                  latitude,
                                  longitude,
                                  report.region,
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 오른쪽: 위치 지도 */}
      <section className="min-h-0 min-w-0 xl:col-span-6">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin
                    size={18}
                    className="shrink-0 text-rose-500"
                  />

                  <h2 className="text-base font-black text-slate-950">
                    시민 제보 및 현장 예찰 요원 지도
                  </h2>
                </div>

                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  제보 마커와 현장 예찰 요원의 현재 위치를 함께 확인합니다.
                </p>
              </div>

              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                <Users size={12} /> 요원 {surveyAssignments.length}명
              </span>
            </div>
          </header>

          <div className="h-[360px] w-full min-w-0">
            <LeafletMap
              records={reports}
              selectedRecordId={
                selectedReport?.id
              }
              onMarkerClick={(
                record: CrowdReport
              ) => {
                setSelectedWorkerId(null);
                setSelectedAssignmentId(null);
                setSelectedReportId(
                  String(record.id)
                );
              }}
              workers={FIELD_WORKERS}
              assignments={surveyAssignments}
              selectedAssignmentId={selectedAssignmentId}
              onAssignmentClick={(assignment: DispatchAssignment) => {
                setSelectedReportId(null);
                setSelectedWorkerId(null);
                setSelectedAssignmentId(
                  assignment.assignmentId
                );
              }}
              selectedWorkerId={selectedWorkerId}
              onWorkerClick={(worker: FieldWorkerMarker) => {
                setSelectedReportId(null);
                setSelectedAssignmentId(null);
                setSelectedWorkerId(worker.id);
              }}
            />
          </div>

          <div className="border-t border-slate-100 p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-black text-slate-400">
                선택 위치
              </div>

              <div className="mt-1 break-all text-xs font-bold text-slate-800">
                <span>
                  {selectedReport
                    ? formatGridLocation(
                        getReportLatitude(selectedReport),
                        getReportLongitude(selectedReport),
                        selectedReport.region,
                      )
                    : selectedAssignment
                      ? formatGridLocation(
                          selectedAssignment.targetLatitude,
                          selectedAssignment.targetLongitude,
                          selectedAssignment.targetEmdName,
                        )
                      : selectedWorker
                        ? formatGridLocation(
                            selectedWorker.latitude,
                            selectedWorker.longitude,
                          )
                        : "마커를 선택하세요"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-t border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-emerald-700" />
                  <h3 className="text-sm font-black text-slate-900">
                    출동 중인 예찰 요원
                  </h3>
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  현재 배정된 요원의 위치와 작업 상태입니다.
                </p>
              </div>

              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                {surveyAssignments.length}명
              </span>
            </div>

            <div className="custom-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {surveyAssignments.length === 0 && (
                <div className="flex h-full min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-400">
                  현재 출동 중인 예찰 요원이 없습니다.
                </div>
              )}

              {surveyAssignments.map((assignment) => (
                <button
                  key={assignment.assignmentId}
                  type="button"
                  onClick={() => {
                    setSelectedReportId(null);
                    setSelectedWorkerId(null);
                    setSelectedAssignmentId(
                      assignment.assignmentId
                    );
                  }}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border p-3 text-left transition ${
                    selectedAssignmentId === assignment.assignmentId
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-100 bg-slate-50/70 hover:border-emerald-200 hover:bg-emerald-50/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-black text-slate-800">
                        {assignment.workerName}
                      </span>
                      <span className="font-mono text-[9px] font-bold text-slate-400">
                        {assignment.workerId}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${dispatchStatusClass(
                          assignment.status,
                        )}`}
                      >
                        {assignment.status}
                      </span>
                    </div>

                    <div className="mt-1.5 grid gap-1 text-[10px] font-semibold text-slate-500 sm:grid-cols-2">
                      <span>작업 ID: {assignment.assignmentId}</span>
                      <span>
                        위치:{" "}
                        {formatGridLocation(
                          assignment.targetLatitude,
                          assignment.targetLongitude,
                          assignment.targetEmdName,
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[10px] font-black text-slate-600 shadow-sm">
                    <Battery size={12} className="text-emerald-600" />
                    {assignment.batteryPercent ?? "-"}%
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* =========================================================
          작업 완료 시 현장 판정 팝업
          지도 컨트롤(z-index 최대 1000) 위로 올라오도록 2100대를 쓴다.
      ========================================================= */}
      <AnimatePresence>
        {completionTarget && (
          <>
            <motion.button
              type="button"
              aria-label="현장 판정 닫기"
              onClick={() => setCompletionTarget(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2100] bg-slate-950/40"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.16 }}
              className="fixed left-1/2 top-1/2 z-[2110] w-[420px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="bg-emerald-900 px-5 py-4 text-white">
                <div className="text-[10px] font-black tracking-widest">
                  FIELD SURVEY RESULT
                </div>
                <h3 className="mt-1 text-sm font-black">
                  현장 예찰 결과 입력
                </h3>
                <p className="mt-1 text-[11px] font-semibold text-white/70">
                  {[
                    completionTarget.targetSigunguName,
                    completionTarget.targetEmdName,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  {" · 격자 "}
                  {completionTarget.gridId}
                  {" · "}
                  {completionTarget.workerName}
                </p>
              </div>

              {/*
                현장 요원이 올린 근거 자료.
                감염 여부는 관제가 이 자료를 보고 정한다. 자료 없이 판정하면
                무엇을 보고 확진했는지 남지 않는다.
              */}
              {(reviewPhotos.length > 0 ||
                reviewVoiceLogs.length > 0) && (
                <div className="border-b border-slate-100 bg-slate-50 p-5">
                  <p className="mb-3 text-[11px] font-black text-slate-500">
                    현장 제출 자료 · 사진 {reviewPhotos.length}장 · 음성{" "}
                    {reviewVoiceLogs.length}건
                  </p>

                  {reviewPhotos.length > 0 && (
                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                      {reviewPhotos.map((photo) => (
                        <img
                          key={photo.id}
                          src={buildStorageUrl(
                            "field-photos",
                            photo.storagePath,
                          )}
                          alt="현장 예찰 사진"
                          className="h-24 w-24 shrink-0 rounded-xl border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  )}

                  {reviewVoiceLogs.map((log) => (
                    <div
                      key={log.id}
                      className="mb-2 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <audio
                        controls
                        preload="none"
                        src={buildStorageUrl(
                          log.storageBucket || "field-audio",
                          log.storagePath,
                        )}
                        className="w-full"
                      />
                      {log.transcript && (
                        <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-600">
                          {log.transcript}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 p-5">
                {completionStep === "infection" ? (
                  <>
                    <p className="text-xs font-bold text-slate-700">
                      해당 지역에서 감염 의심목이 확인되었습니까?
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400">
                      확인 시 확진목 리스트로 넘어가 방제대기 상태로 등록됩니다.
                    </p>

                    {reviewPhotos.length === 0 &&
                      reviewVoiceLogs.length === 0 && (
                        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
                          현장에서 올린 자료가 아직 없습니다. 자료를 확인한 뒤
                          판정하는 것을 권합니다.
                        </p>
                      )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCompletionInfected}
                        className="rounded-xl bg-rose-600 px-3 py-3 text-xs font-black text-white transition hover:bg-rose-700"
                      >
                        감염 확인
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompletionStep("clean")}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        미감염
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-700">
                      감염은 확인되지 않았습니다. 이후 처리를 선택하세요.
                    </p>
                    <p className="text-[11px] font-semibold text-slate-400">
                      현장 요원 판단에 따라 예방 차원의 방제를 검토하거나,
                      추가 조치 없이 반려할 수 있습니다.
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCompletionToControl}
                        className="rounded-xl bg-emerald-800 px-3 py-3 text-xs font-black text-white transition hover:bg-emerald-900"
                      >
                        방제 검토로 이관
                      </button>
                      <button
                        type="button"
                        onClick={handleCompletionReject}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        반려
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCompletionStep("infection")}
                      className="w-full pt-1 text-[11px] font-bold text-slate-400 transition hover:text-slate-600"
                    >
                      이전으로
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
