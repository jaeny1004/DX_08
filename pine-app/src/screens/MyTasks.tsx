/*
 * 내 작업 — 웹 대시보드가 나에게 배정한 예찰·드론·방제 작업 목록.
 *
 * 이 화면이 "웹에서 배정 -> 현장에서 수행 -> 웹에서 확인" 흐름의 현장 쪽 끝이다.
 * 상태를 바꾸면 dispatch_assignments 에 바로 쓰이고, 웹 화면은 Realtime 으로 따라간다.
 *
 * 작업을 열면 현장관리 화면으로 넘어가 사진·음성일지를 남길 수 있다.
 * 이때 sourceTreeId 를 함께 넘겨 확진목 타임라인에 붙게 한다.
 */
import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { ScreenName } from '../types';
import {
  ChevronLeft,
  ClipboardList,
  MapPin,
  RefreshCw,
  UserCircle2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useWorker } from '../hooks/useWorker';
import {
  DISPATCH_FLOW,
  DispatchStatus,
  MyAssignment,
  TASK_TYPE_LABEL,
  completeAsInfected,
  fetchMyAssignments,
  rejectAssignment,
  subscribeMyAssignments,
  transferToControl,
  updateMyAssignmentStatus,
} from '../services/dispatch';

interface MyTasksProps {
  navigate: (screen: ScreenName) => void;
  onOpenRecord: (recordId: string) => void;
}

/** 진행 단계에서 다음으로 누를 수 있는 상태 */
function nextStatus(
  current: DispatchStatus,
): DispatchStatus | null {
  const index =
    DISPATCH_FLOW.indexOf(current);

  if (
    index === -1 ||
    index >= DISPATCH_FLOW.length - 1
  ) {
    return null;
  }

  return DISPATCH_FLOW[index + 1];
}

function statusColor(
  status: DispatchStatus,
): string {
  if (status === '작업 완료') {
    return 'bg-green-100 text-green-700';
  }
  if (status === '배정 대기') {
    return 'bg-gray-100 text-gray-600';
  }
  return 'bg-blue-100 text-blue-700';
}

export function MyTasks({
  navigate,
  onOpenRecord,
}: MyTasksProps) {
  const { worker, loading: workerLoading } =
    useWorker();

  const [assignments, setAssignments] =
    useState<MyAssignment[]>([]);

  const [loading, setLoading] = useState(true);

  const [pendingId, setPendingId] = useState<
    string | null
  >(null);

  /*
   * 예찰 완료 판정 팝업.
   * 'infection' 에서 감염 여부를 묻고, 미감염이면 'followup' 으로 넘어가
   * 방제로 넘길지 반려할지 고르게 한다. 웹 FieldSection 완료 팝업과 같은 흐름이다.
   */
  const [outcomeTarget, setOutcomeTarget] =
    useState<MyAssignment | null>(null);

  const [outcomeStep, setOutcomeStep] =
    useState<'infection' | 'followup'>(
      'infection',
    );

  const [outcomeBusy, setOutcomeBusy] =
    useState(false);

  const [toast, setToast] = useState<
    string | null
  >(null);

  const reload = useCallback(async () => {
    if (!worker) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const rows = await fetchMyAssignments(
      worker.workerId,
    );
    setAssignments(rows);
    setLoading(false);
  }, [worker]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* 웹에서 새 작업을 배정하면 바로 목록에 뜬다 */
  useEffect(() => {
    if (!worker) {
      return;
    }

    const unsubscribe = subscribeMyAssignments(
      worker.workerId,
      () => {
        void reload();
      },
    );

    return unsubscribe;
  }, [worker, reload]);

  const handleAdvance = async (
    assignment: MyAssignment,
  ) => {
    const next = nextStatus(assignment.status);

    if (!next) {
      return;
    }

    /*
     * 예찰은 "작업 완료"로 끝나지 않는다. 현장에서 본 것을
     * 확진목 / 방제 이관 / 반려 중 하나로 정리해야 다음 단계가 정해진다.
     * 그래서 바로 반영하지 않고 판정 팝업을 먼저 띄운다.
     */
    if (
      next === '작업 완료' &&
      assignment.taskType === 'SURVEY'
    ) {
      setOutcomeTarget(assignment);
      setOutcomeStep('infection');
      return;
    }

    setPendingId(assignment.assignmentId);

    /* 응답을 기다리지 않고 화면부터 바꾼다 */
    setAssignments((previous) =>
      previous.map((item) =>
        item.assignmentId ===
        assignment.assignmentId
          ? { ...item, status: next }
          : item,
      ),
    );

    /* assignment 를 넘기면 방제 완료 시 확진목까지 방제완료로 정리한다 */
    const ok =
      await updateMyAssignmentStatus(
        assignment.assignmentId,
        next,
        assignment,
      );

    if (!ok) {
      /* 실패하면 되돌린다 */
      setAssignments((previous) =>
        previous.map((item) =>
          item.assignmentId ===
          assignment.assignmentId
            ? {
                ...item,
                status: assignment.status,
              }
            : item,
        ),
      );
      window.alert(
        '상태를 변경하지 못했습니다. 네트워크를 확인해 주세요.',
      );
    }

    setPendingId(null);
  };

  /** 판정 세 갈래를 한 곳에서 처리한다. 결과 문구는 서비스가 만들어 준다. */
  const runOutcome = async (
    action: (
      assignment: MyAssignment,
    ) => Promise<{
      success: boolean;
      message: string;
    }>,
  ) => {
    const assignment = outcomeTarget;
    if (!assignment || outcomeBusy) {
      return;
    }

    setOutcomeBusy(true);
    const result = await action(assignment);
    setOutcomeBusy(false);

    if (result.success) {
      setOutcomeTarget(null);
      setToast(result.message);
      window.setTimeout(
        () => setToast(null),
        4000,
      );
      void reload();
    } else {
      window.alert(result.message);
    }
  };

  return (
    <div className="h-full bg-system-bg flex flex-col">
      <div className="bg-card-bg p-4 flex items-center border-b border-[rgba(0,0,0,0.04)] shadow-sm z-10 shrink-0">
        <button
          onClick={() => navigate('home')}
          className="p-2 -ml-2 text-text-sub"
        >
          <ChevronLeft size={28} />
        </button>

        <span className="flex-1 font-semibold text-text-main text-center mr-8">
          내 작업
        </span>

        <button
          onClick={() => void reload()}
          className="p-2 -mr-2 text-text-sub active:scale-90 transition-transform"
          aria-label="새로고침"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      {/* 현재 요원 */}
      {worker && (
        <div className="bg-card-bg px-4 py-3 border-b border-[rgba(0,0,0,0.04)] flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <UserCircle2 size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-text-main truncate">
              {worker.workerName}
              <span className="ml-2 text-[11px] font-normal text-text-sub">
                {worker.positionName}
              </span>
            </div>
            <div className="text-[11px] text-text-sub truncate">
              {worker.organization}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {workerLoading || loading ? (
          <div className="text-center text-text-sub text-[13px] py-16">
            불러오는 중...
          </div>
        ) : !worker ? (
          <div className="text-center py-16 px-6">
            <ClipboardList
              size={40}
              className="mx-auto text-text-sub/40 mb-3"
            />
            <p className="text-[13px] text-text-sub mb-4">
              먼저 로그인해서 담당 요원을
              선택해 주세요.
            </p>
            <button
              onClick={() =>
                navigate('login')
              }
              className="px-5 py-2.5 bg-primary text-white rounded-[10px] text-[13px] font-bold"
            >
              로그인
            </button>
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-16 px-6">
            <ClipboardList
              size={40}
              className="mx-auto text-text-sub/40 mb-3"
            />
            <p className="text-[13px] text-text-sub">
              아직 배정된 작업이 없습니다.
            </p>
            <p className="text-[11px] text-text-sub/70 mt-1">
              관제 대시보드에서 배정하면 여기에
              바로 표시됩니다.
            </p>
          </div>
        ) : (
          assignments.map(
            (assignment, index) => {
              const next = nextStatus(
                assignment.status,
              );

              const region = [
                assignment.targetSigunguName,
                assignment.targetEmdName,
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <motion.div
                  key={
                    assignment.assignmentId
                  }
                  initial={{
                    opacity: 0,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  transition={{
                    delay: index * 0.03,
                  }}
                  className="bg-card-bg rounded-[15px] p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-text-main">
                        {
                          TASK_TYPE_LABEL[
                            assignment
                              .taskType
                          ]
                        }
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-text-sub mt-0.5">
                        <MapPin size={12} />
                        <span className="truncate">
                          {region ||
                            '지역 정보 없음'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-1 rounded-full text-[10px] font-bold shrink-0 ${statusColor(
                        assignment.status,
                      )}`}
                    >
                      {assignment.status}
                    </span>
                  </div>

                  <div className="text-[11px] text-text-sub space-y-0.5 mb-3">
                    <div>
                      격자 {assignment.gridId}
                      {assignment.riskGrade && (
                        <span className="ml-2">
                          위험도{' '}
                          {
                            assignment.riskGrade
                          }
                        </span>
                      )}
                    </div>
                    {assignment.priorityGrade && (
                      <div>
                        예찰 우선순위{' '}
                        {
                          assignment.priorityGrade
                        }
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {next && (
                      <button
                        onClick={() =>
                          void handleAdvance(
                            assignment,
                          )
                        }
                        disabled={
                          pendingId ===
                          assignment.assignmentId
                        }
                        className="flex-1 py-2.5 bg-primary text-white rounded-[10px] text-[12px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
                      >
                        {/* 예찰 완료는 곧바로 끝나지 않고 판정 단계로 간다 */}
                        {next === '작업 완료' &&
                        assignment.taskType ===
                          'SURVEY'
                          ? '예찰 결과 입력'
                          : `${next}로 변경`}
                      </button>
                    )}

                    {assignment.sourceTreeId && (
                      <button
                        onClick={() =>
                          onOpenRecord(
                            assignment.sourceTreeId as string,
                          )
                        }
                        className="flex-1 py-2.5 bg-system-bg text-text-main rounded-[10px] text-[12px] font-bold active:scale-[0.98] transition-transform"
                      >
                        현장 기록
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            },
          )
        )}
      </div>

      {/* 처리 결과 안내 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 inset-x-4 bg-text-main text-white rounded-[12px] px-4 py-3 text-[12px] leading-relaxed shadow-xl z-50"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 예찰 완료 판정 */}
      <AnimatePresence>
        {outcomeTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-end z-50"
            onClick={() => {
              if (!outcomeBusy) {
                setOutcomeTarget(null);
              }
            }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{
                type: 'spring',
                damping: 28,
                stiffness: 280,
              }}
              onClick={(event) =>
                event.stopPropagation()
              }
              className="w-full bg-card-bg rounded-t-[20px] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            >
              <div className="w-10 h-1 bg-black/10 rounded-full mx-auto mb-4" />

              <div className="text-[11px] text-text-sub mb-1">
                격자 {outcomeTarget.gridId}
                {outcomeTarget.targetEmdName &&
                  ` · ${outcomeTarget.targetEmdName}`}
              </div>

              {outcomeStep === 'infection' ? (
                <>
                  <h3 className="text-[16px] font-bold text-text-main mb-1">
                    현장에서 감염목을 확인했습니까?
                  </h3>
                  <p className="text-[12px] text-text-sub mb-5 leading-relaxed">
                    확인한 경우 확진목 리스트로
                    넘어가 방제 배정 대상이 됩니다.
                  </p>

                  <div className="space-y-2">
                    <button
                      disabled={outcomeBusy}
                      onClick={() =>
                        void runOutcome(
                          completeAsInfected,
                        )
                      }
                      className="w-full py-3.5 bg-red-500 text-white rounded-[12px] text-[14px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      감염 확인 · 확진목으로 넘김
                    </button>

                    <button
                      disabled={outcomeBusy}
                      onClick={() =>
                        setOutcomeStep('followup')
                      }
                      className="w-full py-3.5 bg-system-bg text-text-main rounded-[12px] text-[14px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      미감염
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-[16px] font-bold text-text-main mb-1">
                    다음 조치를 골라 주세요
                  </h3>
                  <p className="text-[12px] text-text-sub mb-5 leading-relaxed">
                    감염은 확인되지 않았습니다.
                    예방 차원의 방제가 필요하면
                    방제로 넘기고, 아니면 반려할 수
                    있습니다.
                  </p>

                  <div className="space-y-2">
                    <button
                      disabled={outcomeBusy}
                      onClick={() =>
                        void runOutcome(
                          transferToControl,
                        )
                      }
                      className="w-full py-3.5 bg-primary text-white rounded-[12px] text-[14px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      방제로 넘김
                    </button>

                    <button
                      disabled={outcomeBusy}
                      onClick={() =>
                        void runOutcome(
                          rejectAssignment,
                        )
                      }
                      className="w-full py-3.5 bg-system-bg text-text-main rounded-[12px] text-[14px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      반려
                    </button>

                    <button
                      disabled={outcomeBusy}
                      onClick={() =>
                        setOutcomeStep('infection')
                      }
                      className="w-full py-2 text-text-sub text-[12px] disabled:opacity-50"
                    >
                      뒤로
                    </button>
                  </div>
                </>
              )}

              {outcomeBusy && (
                <p className="text-center text-[11px] text-text-sub mt-3">
                  처리 중...
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
