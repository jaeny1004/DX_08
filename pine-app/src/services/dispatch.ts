/*
 * 웹 대시보드가 배정한 작업을 읽고, 현장에서 상태를 되돌려 쓴다.
 *
 * 웹(DX_08-dev)의 src/services/dispatchApi.ts 와 같은 테이블을 본다.
 * 컬럼 정의는 rag-backend/supabase/migrations/012_workforce_and_dispatch.sql 에 있다.
 * 세 곳 중 하나를 바꾸면 나머지도 함께 고쳐야 한다.
 */
import { supabase } from '../hooks/useSupabase';

export type DispatchTaskType =
  | 'SURVEY'
  | 'DRONE'
  | 'CONTROL';

export type DispatchStatus =
  | '배정 대기'
  | '배정 수락'
  | '출동'
  | '현장 도착'
  | '작업 중'
  | '작업 완료'
  | '복귀'
  | '복귀 완료';

/** 현장에서 순서대로 누르게 되는 진행 단계 */
export const DISPATCH_FLOW: DispatchStatus[] = [
  '배정 대기',
  '배정 수락',
  '출동',
  '현장 도착',
  '작업 중',
  '작업 완료',
];

export const TASK_TYPE_LABEL: Record<
  DispatchTaskType,
  string
> = {
  SURVEY: '예찰·조사',
  DRONE: '드론 촬영',
  CONTROL: '방제·시공',
};

export interface MyAssignment {
  assignmentId: string;

  workerId: string;
  workerName: string;
  taskType: DispatchTaskType;

  gridId: string;

  targetSidoName: string;
  targetSigunguName: string;
  targetEmdName: string;

  targetLatitude: number | null;
  targetLongitude: number | null;

  /*
   * 이 배정을 만든 확진목 관리 ID.
   * 현장사진·음성일지를 올릴 때 related_record_id 로 쓰면
   * 웹 확진목 타임라인에 그대로 붙는다.
   */
  sourceTreeId: string | null;

  priorityGrade: string;
  riskGrade: string;
  riskScore: number;

  recommendationReason: string;
  status: DispatchStatus;
  assignedAt: string;
}

function toAssignment(row: any): MyAssignment {
  return {
    assignmentId: String(row.assignment_id),

    workerId: String(row.worker_id ?? ''),
    workerName: String(row.worker_name ?? ''),
    taskType: (row.task_type ??
      'SURVEY') as DispatchTaskType,

    gridId: String(row.grid_id ?? ''),

    targetSidoName: String(
      row.target_sido_name ?? '',
    ),
    targetSigunguName: String(
      row.target_sigungu_name ?? '',
    ),
    targetEmdName: String(
      row.target_emd_name ?? '',
    ),

    targetLatitude: row.target_latitude ?? null,
    targetLongitude: row.target_longitude ?? null,

    sourceTreeId: row.source_tree_id ?? null,

    priorityGrade: String(
      row.priority_grade ?? '',
    ),
    riskGrade: String(row.risk_grade ?? ''),
    riskScore: Number(row.risk_score ?? 0),

    recommendationReason: String(
      row.recommendation_reason ?? '',
    ),
    status: (row.status ??
      '배정 대기') as DispatchStatus,
    assignedAt: String(row.assigned_at ?? ''),
  };
}

/**
 * 나에게 배정된 작업을 가져온다.
 *
 * 테이블이 아직 없으면(PGRST205) 조용히 빈 배열을 준다.
 * 마이그레이션 전에도 앱이 뜨게 하기 위함이다.
 */
export async function fetchMyAssignments(
  workerId: string,
): Promise<MyAssignment[]> {
  if (!supabase || !workerId) {
    return [];
  }

  const { data, error } = await supabase
    .from('dispatch_assignments')
    .select('*')
    .eq('worker_id', workerId)
    .order('assigned_at', {
      ascending: false,
    });

  if (error) {
    if (error.code !== 'PGRST205') {
      console.error(
        '배정 목록 조회 실패:',
        error,
      );
    }
    return [];
  }

  return (data ?? []).map(toAssignment);
}

const COMPLETION_STATUSES: DispatchStatus[] = [
  '작업 완료',
  '복귀',
  '복귀 완료',
];

/**
 * 방제 작업이 끝나면 원래 확진목도 방제완료로 넘긴다.
 *
 * 웹에도 같은 처리가 있지만(App.tsx handleUpdateDispatchStatus) 그건 웹에서
 * 상태를 바꿨을 때만 돈다. 앱에서 바꾸면 웹은 Realtime 으로 목록만 갱신할 뿐
 * 확진목까지 넘기지는 않았다. 웹을 안 켜 둔 채 현장에서 끝내는 경우가 정상이므로
 * 앱이 직접 쓴다. 웹은 confirmed_trees 구독으로 이 변경을 받아 화면에 반영한다.
 */
async function propagateControlCompletion(
  assignment: Pick<
    MyAssignment,
    'taskType' | 'sourceTreeId' | 'workerName' | 'gridId'
  >,
): Promise<void> {
  if (
    !supabase ||
    assignment.taskType !== 'CONTROL' ||
    !assignment.sourceTreeId
  ) {
    return;
  }

  const { data: tree, error: readError } =
    await supabase
      .from('confirmed_trees')
      .select('status, timeline')
      .eq('id', assignment.sourceTreeId)
      .maybeSingle();

  if (readError || !tree) {
    console.warn(
      '확진목을 찾지 못해 방제완료를 반영하지 못했습니다:',
      readError,
    );
    return;
  }

  if (tree.status === '방제완료') {
    return;
  }

  const timeline = Array.isArray(tree.timeline)
    ? tree.timeline
    : [];

  const { error } = await supabase
    .from('confirmed_trees')
    .update({
      status: '방제완료',
      timeline: [
        ...timeline,
        {
          stage: '상태 변경: 방제완료',
          date: new Date().toLocaleString(),
          note:
            `${assignment.workerName} 요원이 현장에서 방제 작업을 완료했습니다. ` +
            `격자 ${assignment.gridId}`,
          actor: assignment.workerName,
        },
      ],
    })
    .eq('id', assignment.sourceTreeId);

  if (error) {
    console.error(
      '확진목 방제완료 반영 실패:',
      error,
    );
  }
}

/**
 * 현장에서 진행 상태를 바꾼다. 웹 화면이 Realtime 으로 따라간다.
 *
 * assignment 를 함께 넘기면 방제 완료 시 확진목까지 정리한다.
 */
export async function updateMyAssignmentStatus(
  assignmentId: string,
  status: DispatchStatus,
  assignment?: MyAssignment,
): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (COMPLETION_STATUSES.includes(status)) {
    patch.completed_at =
      new Date().toISOString();
  }

  const { error } = await supabase
    .from('dispatch_assignments')
    .update(patch)
    .eq('assignment_id', assignmentId);

  if (error) {
    console.error(
      '배정 상태 변경 실패:',
      error,
    );
    return false;
  }

  if (
    assignment &&
    COMPLETION_STATUSES.includes(status)
  ) {
    await propagateControlCompletion(
      assignment,
    );
  }

  return true;
}

/* ------------------------------------------------------------------
 * 예찰 결과 제출
 *
 * 감염 여부는 현장 요원이 정하지 않는다. 요원은 본 것을 사진과 음성으로 올리고,
 * 그 자료를 보고 관제(웹)가 감염/미감염을 판단한다. 현장에서 즉석으로 확진을
 * 확정하면 근거가 남지 않고 판단 주체도 흐려진다.
 *
 * 별도 테이블을 만들지 않았다. 앱이 이미 쓰던 field_photos / field_voice_logs 에
 * related_record_id = 배정 ID 로 넣으면 웹이 그대로 묶어서 볼 수 있다.
 *
 * 상태를 이렇게 읽는다. 상태값 자체는 추가하지 않았다.
 *   작업 완료 = 자료 제출됨, 관제 판정 대기
 *   복귀 완료 = 관제가 판정을 끝냄
 * ------------------------------------------------------------------ */

export interface SubmissionCount {
  photos: number;
  voiceLogs: number;
}

/** 이 배정에 올라간 자료 건수. 제출했는지 판단하는 데 쓴다. */
export async function countSubmissions(
  assignmentId: string,
): Promise<SubmissionCount> {
  if (!supabase) {
    return { photos: 0, voiceLogs: 0 };
  }

  const [photos, voices] = await Promise.all([
    supabase
      .from('field_photos')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('related_record_id', assignmentId),
    supabase
      .from('field_voice_logs')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('related_record_id', assignmentId),
  ]);

  return {
    photos: photos.count ?? 0,
    voiceLogs: voices.count ?? 0,
  };
}

/* ------------------------------------------------------------------
 * 아래 세 함수는 이제 앱에서 부르지 않는다.
 *
 * 판정이 관제로 넘어가면서 웹 FieldSection 이 같은 일을 한다.
 * 지우지 않고 남겨 둔 이유는, 통신이 끊긴 현장에서 요원이 직접 정리해야 하는
 * 상황이 생길 수 있다고 보고 되돌릴 여지를 남기기 위함이다.
 * 6개월쯤 지나도 쓰이지 않으면 지우는 편이 낫다.
 * ------------------------------------------------------------------ */

/** PT-YYYY-NNNN. 웹 src/utils/treeId.ts 와 같은 형식이어야 목록 정렬이 맞는다. */
async function nextTreeId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PT-${year}-`;

  let maxSequence = 0;

  if (supabase) {
    const { data } = await supabase
      .from('confirmed_trees')
      .select('id')
      .like('id', `${prefix}%`);

    for (const row of data ?? []) {
      const matched = /^PT-(\d{4})-(\d{4})$/.exec(
        String(row.id),
      );
      if (!matched) continue;
      if (Number(matched[1]) !== year) continue;
      maxSequence = Math.max(
        maxSequence,
        Number(matched[2]),
      );
    }
  }

  return (
    prefix +
    String(maxSequence + 1).padStart(4, '0')
  );
}

function regionOf(
  assignment: MyAssignment,
): string {
  return (
    [
      assignment.targetSigunguName,
      assignment.targetEmdName,
    ]
      .filter(Boolean)
      .join(' ') ||
    `격자 ${assignment.gridId}`
  );
}

export interface OutcomeResult {
  success: boolean;
  message: string;
}

/** 감염 확인 -> 확진목으로 넘긴다. */
export async function completeAsInfected(
  assignment: MyAssignment,
): Promise<OutcomeResult> {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase 연결이 없습니다.',
    };
  }

  const region = regionOf(assignment);
  const treeId = await nextTreeId();
  const now = new Date();

  const { error } = await supabase
    .from('confirmed_trees')
    .insert({
      id: treeId,
      region,
      species: '소나무',
      confirmed_date: now
        .toISOString()
        .split('T')[0],
      status: '방제대기',
      severity: '중',
      x: 0,
      y: 0,
      latitude: assignment.targetLatitude,
      longitude: assignment.targetLongitude,
      inspector: assignment.workerName,
      timeline: [
        {
          stage: '현장 예찰 완료',
          date: now.toLocaleString(),
          note:
            `${assignment.workerName} 요원이 현장 확인 결과 감염 의심목을 확인. ` +
            `위치: ${region} · 격자 ${assignment.gridId}`,
          actor: assignment.workerName,
        },
      ],
    });

  if (error) {
    console.error('확진목 등록 실패:', error);
    return {
      success: false,
      message: `확진목 등록에 실패했습니다. ${error.message}`,
    };
  }

  await updateMyAssignmentStatus(
    assignment.assignmentId,
    '복귀 완료',
  );

  return {
    success: true,
    message: `${region} 확인 결과를 확진목 ${treeId} 로 넘겼습니다.`,
  };
}

/** 미감염이지만 방제가 필요한 경우 -> 같은 격자에 방제 배정을 만든다. */
export async function transferToControl(
  assignment: MyAssignment,
): Promise<OutcomeResult> {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase 연결이 없습니다.',
    };
  }

  /*
   * 담당 요원을 정하는 것은 관제 몫이라 여기서는 원래 요원을 그대로 둔 채
   * '배정 대기' 로 만든다. 웹 방제 화면에서 재배정할 수 있다.
   */
  const { error } = await supabase
    .from('dispatch_assignments')
    .insert({
      assignment_id: `CONTROL-${assignment.gridId}-${Date.now()}`,
      worker_id: assignment.workerId,
      worker_name: assignment.workerName,
      worker_type: '방제요원',
      task_type: 'CONTROL',
      worker_capabilities: [],
      target_sido_name: assignment.targetSidoName,
      target_sigungu_name:
        assignment.targetSigunguName,
      target_emd_name: assignment.targetEmdName,
      grid_id: assignment.gridId,
      target_latitude: assignment.targetLatitude,
      target_longitude: assignment.targetLongitude,
      source_tree_id: assignment.sourceTreeId,
      priority_grade: assignment.priorityGrade,
      risk_grade: assignment.riskGrade,
      risk_score: assignment.riskScore,
      recommendation_reason:
        `현장 예찰 결과 감염은 미확인이나 담당자 판단으로 방제 검토 이관 ` +
        `(예찰 배정 ${assignment.assignmentId})`,
      assignment_type: '지역 내 배정',
      status: '배정 대기',
      assigned_at: new Date().toISOString(),
    });

  if (error) {
    console.error('방제 이관 실패:', error);
    return {
      success: false,
      message: `방제 이관에 실패했습니다. ${error.message}`,
    };
  }

  await updateMyAssignmentStatus(
    assignment.assignmentId,
    '복귀 완료',
  );

  return {
    success: true,
    message: `격자 ${assignment.gridId} 건을 방제 검토로 이관했습니다.`,
  };
}

/** 조치 불필요 -> 배정을 지운다. */
export async function rejectAssignment(
  assignment: MyAssignment,
): Promise<OutcomeResult> {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase 연결이 없습니다.',
    };
  }

  const { error } = await supabase
    .from('dispatch_assignments')
    .delete()
    .eq(
      'assignment_id',
      assignment.assignmentId,
    );

  if (error) {
    console.error('반려 처리 실패:', error);
    return {
      success: false,
      message: `반려 처리에 실패했습니다. ${error.message}`,
    };
  }

  return {
    success: true,
    message: `격자 ${assignment.gridId} 예찰 건을 반려 처리했습니다.`,
  };
}

/**
 * 배정 변경을 실시간으로 받는다.
 * 웹에서 새 작업을 배정하면 앱 목록에 바로 뜬다.
 */
export function subscribeMyAssignments(
  workerId: string,
  onChange: () => void,
): () => void {
  if (!supabase || !workerId) {
    return () => {};
  }

  const channel = supabase
    .channel(`my-assignments-${workerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dispatch_assignments',
        filter: `worker_id=eq.${workerId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
