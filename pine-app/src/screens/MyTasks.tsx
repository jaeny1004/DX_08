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
  Camera,
  ChevronLeft,
  ClipboardList,
  MapPin,
  Mic,
  RefreshCw,
  UserCircle2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useWorker } from '../hooks/useWorker';
import {
  DISPATCH_FLOW,
  DispatchStatus,
  MyAssignment,
  SubmissionCount,
  TASK_TYPE_LABEL,
  countSubmissions,
  fetchMyAssignments,
  subscribeMyAssignments,
  updateMyAssignmentStatus,
} from '../services/dispatch';
import { FieldPhotoPanel } from '../components/FieldPhotoPanel';
import { FieldSttPanel } from '../components/FieldSttPanel';

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
   * 예찰 결과 제출 시트.
   *
   * 예전에는 여기서 요원이 감염/미감염을 직접 정했다. 지금은 사진과 음성만 올리고
   * 판단은 관제(웹)가 한다. 현장에서 즉석으로 확진을 확정하면 근거가 남지 않는다.
   */
  const [submitTarget, setSubmitTarget] =
    useState<MyAssignment | null>(null);

  /* 시트 안에서 촬영·녹음 화면을 띄운다 */
  const [submitPanel, setSubmitPanel] =
    useState<'menu' | 'photo' | 'voice'>(
      'menu',
    );

  const [submitCount, setSubmitCount] =
    useState<SubmissionCount>({
      photos: 0,
      voiceLogs: 0,
    });

  const [submitBusy, setSubmitBusy] =
    useState(false);

  const [toast, setToast] = useState<
    string | null
  >(null);

  /** 시트를 열거나 자료를 올린 뒤 제출 건수를 다시 센다 */
  const refreshSubmissionCount = useCallback(
    async (assignmentId: string) => {
      setSubmitCount(
        await countSubmissions(assignmentId),
      );
    },
    [],
  );

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
     * 예찰은 자료를 올려야 끝난다. 사진·음성 없이 "작업 완료"만 찍으면
     * 관제가 판단할 근거가 없다. 그래서 상태를 바로 바꾸지 않고 제출 시트를 연다.
     */
    if (
      next === '작업 완료' &&
      assignment.taskType === 'SURVEY'
    ) {
      setSubmitTarget(assignment);
      setSubmitPanel('menu');
      void refreshSubmissionCount(
        assignment.assignmentId,
      );
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

  /**
   * 자료를 다 올렸으면 '작업 완료'로 넘긴다.
   * 이 상태가 관제 화면에서 "판정 대기"로 읽힌다.
   */
  const handleSubmitResult = async () => {
    const assignment = submitTarget;
    if (!assignment || submitBusy) {
      return;
    }

    if (submitCount.photos === 0) {
      window.alert(
        '현장사진을 최소 1장 올려야 제출할 수 있습니다.',
      );
      return;
    }

    setSubmitBusy(true);
    const ok = await updateMyAssignmentStatus(
      assignment.assignmentId,
      '작업 완료',
      assignment,
    );
    setSubmitBusy(false);

    if (!ok) {
      window.alert(
        '제출하지 못했습니다. 네트워크를 확인해 주세요.',
      );
      return;
    }

    setSubmitTarget(null);
    setToast(
      `격자 ${assignment.gridId} 예찰 결과를 제출했습니다. 관제에서 확인 후 판정합니다.`,
    );
    window.setTimeout(
      () => setToast(null),
      4000,
    );
    void reload();
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
                          ? '예찰 결과 제출'
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


      {/*
        예찰 결과 제출.

        요원은 감염 여부를 정하지 않는다. 사진과 음성을 올리고 제출하면
        관제(웹)가 그 자료를 보고 판단한다. 사진은 최소 1장을 요구한다.
        음성은 선택이다. 현장 상황을 말로 남기기 어려운 경우가 있어서다.
      */}
      <AnimatePresence>
        {submitTarget && submitPanel === 'menu' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 flex items-end z-50"
            onClick={() => {
              if (!submitBusy) {
                setSubmitTarget(null);
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
                격자 {submitTarget.gridId}
                {submitTarget.targetEmdName &&
                  ` · ${submitTarget.targetEmdName}`}
              </div>

              <h3 className="text-[16px] font-bold text-text-main mb-1">
                예찰 결과 제출
              </h3>
              <p className="text-[12px] text-text-sub mb-5 leading-relaxed">
                현장에서 확인한 내용을 사진과 음성으로
                남겨 주세요. 감염 여부 판단은 관제에서
                합니다.
              </p>

              <div className="space-y-2 mb-4">
                <button
                  onClick={() =>
                    setSubmitPanel('photo')
                  }
                  className="w-full py-3.5 bg-system-bg rounded-[12px] flex items-center gap-3 px-4 active:scale-[0.98] transition-transform"
                >
                  <Camera
                    size={20}
                    className="text-primary shrink-0"
                  />
                  <span className="flex-1 text-left text-[14px] font-bold text-text-main">
                    현장사진 촬영
                  </span>
                  <span
                    className={`text-[12px] font-bold ${
                      submitCount.photos > 0
                        ? 'text-primary'
                        : 'text-text-sub'
                    }`}
                  >
                    {submitCount.photos > 0
                      ? `${submitCount.photos}장`
                      : '필수'}
                  </span>
                </button>

                <button
                  onClick={() =>
                    setSubmitPanel('voice')
                  }
                  className="w-full py-3.5 bg-system-bg rounded-[12px] flex items-center gap-3 px-4 active:scale-[0.98] transition-transform"
                >
                  <Mic
                    size={20}
                    className="text-primary shrink-0"
                  />
                  <span className="flex-1 text-left text-[14px] font-bold text-text-main">
                    음성 작업일지
                  </span>
                  <span
                    className={`text-[12px] font-bold ${
                      submitCount.voiceLogs > 0
                        ? 'text-primary'
                        : 'text-text-sub'
                    }`}
                  >
                    {submitCount.voiceLogs > 0
                      ? `${submitCount.voiceLogs}건`
                      : '선택'}
                  </span>
                </button>
              </div>

              <button
                disabled={
                  submitBusy ||
                  submitCount.photos === 0
                }
                onClick={() =>
                  void handleSubmitResult()
                }
                className="w-full py-3.5 bg-primary text-white rounded-[12px] text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
              >
                {submitBusy
                  ? '제출 중...'
                  : '관제로 제출'}
              </button>

              {submitCount.photos === 0 && (
                <p className="text-center text-[11px] text-text-sub mt-3">
                  현장사진을 최소 1장 올려야 제출할 수
                  있습니다.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 촬영·녹음은 기존 화면을 그대로 띄운다. 배정 ID 로 자료를 묶는다. */}
      {submitTarget && submitPanel === 'photo' && (
        <div className="absolute inset-0 z-[60] bg-system-bg">
          <FieldPhotoPanel
            workMode="surveillance"
            relatedRecordId={
              submitTarget.assignmentId
            }
            onBack={() => {
              setSubmitPanel('menu');
              void refreshSubmissionCount(
                submitTarget.assignmentId,
              );
            }}
          />
        </div>
      )}

      {submitTarget && submitPanel === 'voice' && (
        <div className="absolute inset-0 z-[60] bg-system-bg">
          <FieldSttPanel
            workMode="surveillance"
            relatedRecordId={
              submitTarget.assignmentId
            }
            onBack={() => {
              setSubmitPanel('menu');
              void refreshSubmissionCount(
                submitTarget.assignmentId,
              );
            }}
            onComplete={() => {
              setSubmitPanel('menu');
              void refreshSubmissionCount(
                submitTarget.assignmentId,
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
