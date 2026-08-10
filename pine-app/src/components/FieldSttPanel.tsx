import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ArrowLeft,
  CheckCircle2,
  Mic,
  RotateCcw,
  Save,
  Square,
} from 'lucide-react';

import { motion } from 'motion/react';

import {
  FieldPhotoWorkMode,
  useSupabase,
} from '../hooks/useSupabase';

interface FieldSttPanelProps {
  workMode: FieldPhotoWorkMode;

  relatedRecordId: string;

  onBack: () => void;

  onComplete: () => void;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

/*
 * 브라우저별로 지원되는 녹음 형식이 다를 수 있으므로
 * 지원 여부를 확인한 뒤 가장 적합한 형식을 선택합니다.
 */
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function getSupportedAudioMimeType(): string {
  if (
    typeof MediaRecorder ===
    'undefined'
  ) {
    return '';
  }

  return (
    AUDIO_MIME_CANDIDATES.find(
      mimeType =>
        MediaRecorder.isTypeSupported(
          mimeType
        )
    ) ?? ''
  );
}

function getAudioExtension(
  mimeType: string
): string {
  const normalized =
    mimeType.toLowerCase();

  if (
    normalized.includes(
      'mp4'
    )
  ) {
    return 'mp4';
  }

  if (
    normalized.includes(
      'ogg'
    )
  ) {
    return 'ogg';
  }

  if (
    normalized.includes(
      'wav'
    )
  ) {
    return 'wav';
  }

  if (
    normalized.includes(
      'mpeg'
    ) ||
    normalized.includes(
      'mp3'
    )
  ) {
    return 'mp3';
  }

  return 'webm';
}

function formatDuration(
  totalSeconds: number
): string {
  const safeSeconds =
    Math.max(
      0,
      Math.floor(totalSeconds)
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const seconds =
    safeSeconds % 60;

  return (
    `${String(minutes).padStart(
      2,
      '0'
    )}:` +
    `${String(seconds).padStart(
      2,
      '0'
    )}`
  );
}

export function FieldSttPanel({
  workMode,
  relatedRecordId,
  onBack,
  onComplete,
}: FieldSttPanelProps) {
  const {
    saveFieldVoiceLog,
  } = useSupabase();

  const [
    isRecording,
    setIsRecording,
  ] = useState(false);

  const [
    recordingSeconds,
    setRecordingSeconds,
  ] = useState(0);

  const [
    audioFile,
    setAudioFile,
  ] = useState<File | null>(
    null
  );

  const [
    audioUrl,
    setAudioUrl,
  ] = useState('');

  const [
    transcript,
    setTranscript,
  ] = useState('');

  const [
    recordError,
    setRecordError,
  ] = useState('');

  const [
    saveError,
    setSaveError,
  ] = useState('');

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    isSaved,
    setIsSaved,
  ] = useState(false);

  const [
    showSuccessModal,
    setShowSuccessModal,
  ] = useState(false);

  const mediaRecorderRef =
    useRef<MediaRecorder | null>(
      null
    );

  const streamRef =
    useRef<MediaStream | null>(
      null
    );

  const audioChunksRef =
    useRef<Blob[]>([]);

  const timerRef =
    useRef<number | null>(
      null
    );

  const recordingStartedAtRef =
    useRef<number>(0);

  const discardOnStopRef =
    useRef(false);

  const clearRecordingTimer =
    () => {
      if (
        timerRef.current !==
        null
      ) {
        window.clearInterval(
          timerRef.current
        );

        timerRef.current =
          null;
      }
    };

  const stopMicrophoneStream =
    () => {
      if (
        streamRef.current
      ) {
        streamRef.current
          .getTracks()
          .forEach(track =>
            track.stop()
          );

        streamRef.current =
          null;
      }
    };

  const clearCurrentRecording =
    () => {
      if (
        audioUrl.startsWith(
          'blob:'
        )
      ) {
        URL.revokeObjectURL(
          audioUrl
        );
      }

      setAudioFile(null);
      setAudioUrl('');
      setTranscript('');
      setRecordingSeconds(0);
      setIsSaved(false);
      setRecordError('');
      setSaveError('');
    };

  /*
   * 컴포넌트가 닫힐 때
   * 마이크와 타이머를 정리합니다.
   */
  useEffect(() => {
    return () => {
      if (
        timerRef.current !==
        null
      ) {
        window.clearInterval(
          timerRef.current
        );
      }

      const recorder =
        mediaRecorderRef.current;

      if (
        recorder &&
        recorder.state !==
          'inactive'
      ) {
        discardOnStopRef.current =
          true;

        recorder.stop();
      }

      if (
        streamRef.current
      ) {
        streamRef.current
          .getTracks()
          .forEach(track =>
            track.stop()
          );
      }
    };
  }, []);

  /*
   * Blob 미리보기 URL 정리
   */
  useEffect(() => {
    return () => {
      if (
        audioUrl.startsWith(
          'blob:'
        )
      ) {
        URL.revokeObjectURL(
          audioUrl
        );
      }
    };
  }, [audioUrl]);

  const startRecording =
    async () => {
      if (
        isSaving ||
        isRecording
      ) {
        return;
      }

      try {
        setRecordError('');
        setSaveError('');

        clearCurrentRecording();

        if (
          !navigator.mediaDevices
            ?.getUserMedia
        ) {
          throw new Error(
            '이 브라우저에서는 마이크 녹음을 지원하지 않습니다.'
          );
        }

        if (
          typeof MediaRecorder ===
          'undefined'
        ) {
          throw new Error(
            '이 브라우저에서는 음성 녹음 기능을 지원하지 않습니다.'
          );
        }

        const stream =
          await navigator
            .mediaDevices
            .getUserMedia({
              audio: {
                echoCancellation:
                  true,

                noiseSuppression:
                  true,

                autoGainControl:
                  true,
              },

              video:
                false,
            });

        streamRef.current =
          stream;

        const preferredMimeType =
          getSupportedAudioMimeType();

        const recorder =
          preferredMimeType
            ? new MediaRecorder(
                stream,
                {
                  mimeType:
                    preferredMimeType,
                }
              )
            : new MediaRecorder(
                stream
              );

        mediaRecorderRef.current =
          recorder;

        audioChunksRef.current =
          [];

        discardOnStopRef.current =
          false;

        recorder.ondataavailable =
          event => {
            if (
              event.data.size > 0
            ) {
              audioChunksRef.current
                .push(
                  event.data
                );
            }
          };

        recorder.onerror =
          () => {
            setRecordError(
              '녹음 중 오류가 발생했습니다.'
            );

            setIsRecording(
              false
            );

            clearRecordingTimer();
            stopMicrophoneStream();
          };

        recorder.onstop =
          () => {
            clearRecordingTimer();
            stopMicrophoneStream();

            setIsRecording(
              false
            );

            if (
              discardOnStopRef.current
            ) {
              audioChunksRef.current =
                [];

              return;
            }

            const elapsedMilliseconds =
              Math.max(
                0,
                Date.now() -
                  recordingStartedAtRef
                    .current
              );

            const durationSeconds =
              Math.max(
                0.1,
                Math.round(
                  elapsedMilliseconds /
                    100
                ) / 10
              );

            setRecordingSeconds(
              durationSeconds
            );

            const finalMimeType =
              recorder.mimeType ||
              preferredMimeType ||
              'audio/webm';

            const audioBlob =
              new Blob(
                audioChunksRef.current,
                {
                  type:
                    finalMimeType,
                }
              );

            audioChunksRef.current =
              [];

            if (
              audioBlob.size === 0
            ) {
              setRecordError(
                '녹음된 음성을 확인할 수 없습니다. 다시 녹음해 주세요.'
              );

              return;
            }

            const extension =
              getAudioExtension(
                finalMimeType
              );

            const file =
              new File(
                [audioBlob],

                `field-audio-${Date.now()}.${extension}`,

                {
                  type:
                    finalMimeType,
                }
              );

            const previewUrl =
              URL.createObjectURL(
                file
              );

            setAudioFile(file);
            setAudioUrl(
              previewUrl
            );
          };

        recordingStartedAtRef
          .current =
          Date.now();

        setRecordingSeconds(0);
        setIsRecording(true);

        recorder.start(250);

        timerRef.current =
          window.setInterval(
            () => {
              const elapsed =
                (
                  Date.now() -
                  recordingStartedAtRef
                    .current
                ) / 1000;

              setRecordingSeconds(
                elapsed
              );
            },
            250
          );
      } catch (error) {
        console.error(
          '현장 음성 녹음 시작 실패:',
          error
        );

        setIsRecording(false);

        clearRecordingTimer();
        stopMicrophoneStream();

        setRecordError(
          error instanceof Error
            ? error.message
            : '마이크를 실행하지 못했습니다.'
        );
      }
    };

  const stopRecording =
    () => {
      const recorder =
        mediaRecorderRef.current;

      if (
        !recorder ||
        recorder.state ===
          'inactive'
      ) {
        setIsRecording(false);

        clearRecordingTimer();
        stopMicrophoneStream();

        return;
      }

      recorder.stop();
    };

  const retryRecording =
    () => {
      if (
        isRecording ||
        isSaving
      ) {
        return;
      }

      clearCurrentRecording();
    };

  const getCurrentCoordinates =
    (): Promise<Coordinates> => {
      return new Promise(
        (
          resolve,
          reject
        ) => {
          if (
            !navigator.geolocation
          ) {
            reject(
              new Error(
                '이 기기에서는 위치정보를 사용할 수 없습니다.'
              )
            );

            return;
          }

          navigator.geolocation
            .getCurrentPosition(
              position => {
                resolve({
                  latitude:
                    position.coords
                      .latitude,

                  longitude:
                    position.coords
                      .longitude,
                });
              },

              error => {
                console.error(
                  '음성 작업일지 GPS 조회 실패:',
                  error
                );

                reject(
                  new Error(
                    '현재 위치를 가져올 수 없습니다. 브라우저의 위치 권한을 허용해 주세요.'
                  )
                );
              },

              {
                enableHighAccuracy:
                  true,

                timeout:
                  15000,

                maximumAge:
                  10000,
              }
            );
        }
      );
    };

  const handleSave =
    async () => {
      if (
        !audioFile
      ) {
        setSaveError(
          '저장할 녹음본을 먼저 생성해 주세요.'
        );

        return;
      }

      if (
        isRecording
      ) {
        setSaveError(
          '녹음을 중지한 후 저장해 주세요.'
        );

        return;
      }

      try {
        setIsSaving(true);
        setSaveError('');

        const coordinates =
          await getCurrentCoordinates();

        const result =
          await saveFieldVoiceLog({
            file:
              audioFile,

            workMode,

            relatedRecordId,

            durationSeconds:
              recordingSeconds,

            latitude:
              coordinates.latitude,

            longitude:
              coordinates.longitude,
          });

        if (
          !result.success
        ) {
          throw new Error(
            result.error ||
            '음성 작업일지를 저장하지 못했습니다.'
          );
        }

        setTranscript(
          result.transcript || ''
        );

        setIsSaved(true);

        setShowSuccessModal(
          true
        );
      } catch (error) {
        console.error(
          '음성 작업일지 저장 실패:',
          error
        );

        setSaveError(
          error instanceof Error
            ? error.message
            : '음성 작업일지 저장 중 오류가 발생했습니다.'
        );
      } finally {
        setIsSaving(false);
      }
    };

  const handleBack =
    () => {
      const recorder =
        mediaRecorderRef.current;

      if (
        recorder &&
        recorder.state !==
          'inactive'
      ) {
        discardOnStopRef.current =
          true;

        recorder.stop();
      }

      clearRecordingTimer();
      stopMicrophoneStream();

      onBack();
    };

  const handleComplete =
    () => {
      if (
        !isSaved
      ) {
        setSaveError(
          '방제 완료 전에 음성 작업일지를 먼저 저장해 주세요.'
        );

        return;
      }

      onComplete();
    };

  return (
    <div className="space-y-4">
      {/* 상단 */}
      <button
        type="button"
        onClick={handleBack}
        disabled={isSaving}
        className="flex items-center gap-2 text-sm font-bold text-text-sub disabled:opacity-50"
      >
        <ArrowLeft size={18} />

        방제·시공 메뉴로 돌아가기
      </button>

      <div>
        <h3 className="mb-1 text-xl font-bold text-text-main">
          작업 일지 STT 녹음
        </h3>

        <p className="text-sm text-text-sub">
          현장 상황을 음성으로 녹음하고 작업일지 문장으로 변환합니다.
        </p>
      </div>

      <div className="bento-card">
        <h3 className="mb-4 flex items-center gap-2 font-bold text-text-main">
          <Mic
            size={20}
            className="text-ios-blue"
          />

          음성 현장 로그
        </h3>

        {/* 녹음 상태 */}
        <div
          className={
            isRecording
              ? 'mb-4 rounded-2xl border border-red-100 bg-red-50 p-4'
              : 'mb-4 rounded-2xl border border-[rgba(0,0,0,0.04)] bg-system-bg p-4'
          }
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isRecording ? (
                <motion.div
                  animate={{
                    scale: [
                      1,
                      1.35,
                      1,
                    ],
                  }}
                  transition={{
                    repeat:
                      Infinity,

                    duration:
                      1,
                  }}
                  className="h-3 w-3 rounded-full bg-red-600"
                />
              ) : (
                <div className="h-3 w-3 rounded-full bg-slate-300" />
              )}

              <span
                className={
                  isRecording
                    ? 'text-xs font-bold text-red-600'
                    : 'text-xs font-bold text-text-sub'
                }
              >
                {isRecording
                  ? '녹음 중'
                  : audioFile
                    ? '녹음 완료'
                    : '녹음 대기'}
              </span>
            </div>

            <span
              className={
                isRecording
                  ? 'font-mono text-lg font-black text-red-600'
                  : 'font-mono text-lg font-black text-text-main'
              }
            >
              {formatDuration(
                recordingSeconds
              )}
            </span>
          </div>
        </div>

        {/* STT 결과 */}
        <div className="mb-4 min-h-[110px] rounded-2xl border border-[rgba(0,0,0,0.04)] bg-system-bg p-4 text-sm leading-6 text-text-main">
          {transcript ? (
            transcript
          ) : isSaving ? (
            <span className="text-text-sub">
              음성 내용을 분석하고 작업일지로 변환하고 있습니다.
            </span>
          ) : isRecording ? (
            <span className="text-text-sub">
              현장 음성을 녹음하고 있습니다. 녹음이 끝나면 중지 버튼을 눌러 주세요.
            </span>
          ) : audioFile ? (
            <span className="text-text-sub">
              아래 녹음본을 확인한 후 STT 변환 및 저장 버튼을 눌러 주세요.
            </span>
          ) : (
            <span className="text-text-sub">
              녹음 버튼을 눌러 현장 상황을 기록하세요.
            </span>
          )}
        </div>

        {/* 녹음 시작·중지 */}
        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-4 font-bold text-red-600 transition-colors active:scale-[0.99]"
          >
            <Square
              size={18}
              fill="currentColor"
            />

            녹음 중지
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              void startRecording()
            }
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ios-blue py-4 font-bold text-white transition-colors disabled:opacity-50 active:scale-[0.99]"
          >
            <Mic size={20} />

            {audioFile
              ? '새 음성 기록 시작'
              : '음성 기록 시작'}
          </button>
        )}

        {/* 녹음 미리 듣기 */}
        {audioUrl && (
          <div className="mt-4 space-y-3 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-main">
                녹음본 미리 듣기
              </span>

              <span className="font-mono text-xs font-bold text-text-sub">
                {formatDuration(
                  recordingSeconds
                )}
              </span>
            </div>

            <audio
              src={audioUrl}
              controls
              preload="metadata"
              className="w-full"
            />

            {!isSaved && (
              <button
                type="button"
                onClick={retryRecording}
                disabled={isSaving}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-card-bg py-3 text-sm font-bold text-text-main disabled:opacity-50"
              >
                <RotateCcw
                  size={17}
                />

                녹음 삭제 후 다시 시작
              </button>
            )}
          </div>
        )}

        {recordError && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold leading-5 text-red-600">
            {recordError}
          </div>
        )}

        {saveError && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold leading-5 text-red-600">
            {saveError}
          </div>
        )}

        {/* STT 변환 및 저장 */}
        <button
          type="button"
          onClick={() =>
            void handleSave()
          }
          disabled={
            !audioFile ||
            isRecording ||
            isSaving ||
            isSaved
          }
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaved ? (
            <>
              <CheckCircle2
                size={18}
              />

              작업일지 저장 완료
            </>
          ) : (
            <>
              <Save size={18} />

              {isSaving
                ? '음성 분석 및 저장 중...'
                : 'STT 변환 및 작업일지 저장'}
            </>
          )}
        </button>
      </div>

      {/* 방제 상태 변경 */}
      <button
        type="button"
        onClick={handleComplete}
        disabled={
          !isSaved ||
          isSaving ||
          isRecording
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-white disabled:opacity-40"
      >
        <CheckCircle2 size={20} />

        방제 완료
      </button>

      <p className="text-center text-[11px] leading-relaxed text-text-sub">
        녹음 원본과 STT 작업일지가 저장된 후 방제 완료 처리가 활성화됩니다.
      </p>

      {/* 저장 성공 모달 */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-6">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2
                  size={34}
                  className="text-primary"
                />
              </div>

              <h3 className="mt-4 text-xl font-bold text-text-main">
                음성 작업일지 저장 완료
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-text-sub">
                녹음 원본과 STT 변환 결과가 정상적으로 저장되었습니다.
              </p>

              {transcript && (
                <div className="mt-4 max-h-40 w-full overflow-y-auto rounded-2xl bg-system-bg p-4 text-left">
                  <p className="mb-2 text-[10px] font-bold text-text-sub">
                    STT 변환 결과
                  </p>

                  <p className="text-sm font-medium leading-6 text-text-main">
                    {transcript}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setShowSuccessModal(
                    false
                  )
                }
                className="mt-5 w-full rounded-2xl bg-primary py-4 text-sm font-bold text-white active:scale-[0.98]"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}