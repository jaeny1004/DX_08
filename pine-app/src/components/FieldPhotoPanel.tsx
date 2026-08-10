import {
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    ArrowLeft,
    Camera,
    RotateCcw,
    Save,
    CheckCircle2,
} from 'lucide-react';

import {
    FieldPhotoWorkMode,
    useSupabase,
} from '../hooks/useSupabase';

interface FieldPhotoPanelProps {
    workMode: FieldPhotoWorkMode;
    relatedRecordId: string;
    onBack: () => void;

    /*
     * GPS 를 못 쓸 때 대신 쓸 좌표.
     * field_photos 의 위도·경도는 NOT NULL 이라 좌표가 없으면 저장 자체가 안 된다.
     * 예전에는 위치 권한이 거부되거나 실내라 잡히지 않으면 그대로 실패했다.
     * 예찰 배정에서 넘어온 경우 격자 중심 좌표를 넘겨 저장은 되게 한다.
     */
    fallbackLatitude?: number;
    fallbackLongitude?: number;
}

interface Coordinates {
    latitude: number;
    longitude: number;
}

export function FieldPhotoPanel({
    workMode,
    relatedRecordId,
    onBack,
    fallbackLatitude,
    fallbackLongitude,
}: FieldPhotoPanelProps) {
    const { saveFieldPhoto } =
        useSupabase();

    const [imageFile, setImageFile] =
        useState<File | null>(null);
    const [showSuccessModal, setShowSuccessModal] =
        useState(false);

    const [imagePreview, setImagePreview] =
        useState<string | null>(null);

    const [cameraOpen, setCameraOpen] =
        useState(false);

    const [cameraError, setCameraError] =
        useState('');

    const [saveError, setSaveError] =
        useState('');

    const [saving, setSaving] =
        useState(false);

    const videoRef =
        useRef<HTMLVideoElement>(null);

    const canvasRef =
        useRef<HTMLCanvasElement>(null);

    const streamRef =
        useRef<MediaStream | null>(null);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current
                .getTracks()
                .forEach(track =>
                    track.stop()
                );

            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject =
                null;
        }

        setCameraOpen(false);
    };

    const clearPreview = () => {
        if (
            imagePreview?.startsWith(
                'blob:'
            )
        ) {
            URL.revokeObjectURL(
                imagePreview
            );
        }

        setImageFile(null);
        setImagePreview(null);
    };

    const startCamera = async () => {
        try {
            setCameraError('');
            setSaveError('');

            stopCamera();
            clearPreview();

            const stream =
                await navigator.mediaDevices
                    .getUserMedia({
                        video: {
                            facingMode: {
                                ideal: 'environment',
                            },
                        },
                        audio: false,
                    });

            streamRef.current = stream;
            setCameraOpen(true);

            window.setTimeout(() => {
                if (!videoRef.current) {
                    return;
                }

                videoRef.current.srcObject =
                    stream;

                videoRef.current
                    .play()
                    .catch(error => {
                        console.error(
                            '현장 카메라 재생 실패:',
                            error
                        );
                    });
            }, 100);
        } catch (error) {
            console.error(
                '현장 카메라 실행 실패:',
                error
            );

            setCameraOpen(false);

            setCameraError(
                '카메라를 실행할 수 없습니다. 브라우저의 카메라 권한을 허용해 주세요.'
            );
        }
    };

    useEffect(() => {
        const timer =
            window.setTimeout(() => {
                void startCamera();
            }, 250);

        return () => {
            window.clearTimeout(timer);

            if (streamRef.current) {
                streamRef.current
                    .getTracks()
                    .forEach(track =>
                        track.stop()
                    );

                streamRef.current = null;
            }
        };

        // 화면 최초 진입 시 한 번 실행
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        return () => {
            if (
                imagePreview?.startsWith(
                    'blob:'
                )
            ) {
                URL.revokeObjectURL(
                    imagePreview
                );
            }
        };
    }, [imagePreview]);

    const capturePhoto = () => {
        const video =
            videoRef.current;

        const canvas =
            canvasRef.current;

        if (!video || !canvas) {
            return;
        }

        if (
            !video.videoWidth ||
            !video.videoHeight
        ) {
            setCameraError(
                '카메라 화면이 아직 준비되지 않았습니다. 잠시 후 다시 촬영해 주세요.'
            );

            return;
        }

        canvas.width =
            video.videoWidth;

        canvas.height =
            video.videoHeight;

        const context =
            canvas.getContext('2d');

        if (!context) {
            setCameraError(
                '사진을 처리할 수 없습니다.'
            );

            return;
        }

        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        canvas.toBlob(
            blob => {
                if (!blob) {
                    setCameraError(
                        '사진 생성에 실패했습니다.'
                    );

                    return;
                }

                clearPreview();

                const capturedFile =
                    new File(
                        [blob],
                        `field-photo-${Date.now()}.jpg`,
                        {
                            type: 'image/jpeg',
                        }
                    );

                const previewUrl =
                    URL.createObjectURL(
                        capturedFile
                    );

                setImageFile(
                    capturedFile
                );

                setImagePreview(
                    previewUrl
                );

                stopCamera();
            },
            'image/jpeg',
            0.9
        );
    };

    /** 폴백 좌표가 넘어왔는지 */
    const hasFallback =
        typeof fallbackLatitude === 'number' &&
        Number.isFinite(fallbackLatitude) &&
        typeof fallbackLongitude === 'number' &&
        Number.isFinite(fallbackLongitude);

    /*
     * 현재 좌표를 구한다.
     *
     * GPS 가 안 잡히면 예전에는 여기서 실패시켜 사진 저장 자체가 막혔다.
     * 실내이거나 위치 권한을 거부한 경우가 흔한데, 그때마다 현장 기록을
     * 통째로 못 남기는 건 과하다. 배정에서 넘어온 격자 중심 좌표가 있으면
     * 그것으로 대신한다. 둘 다 없을 때만 실패시킨다.
     */
    const getCurrentCoordinates =
        (): Promise<Coordinates> => {
            return new Promise(
                (resolve, reject) => {
                    const useFallback = (
                        reason: string
                    ) => {
                        if (hasFallback) {
                            console.warn(
                                `${reason} 배정 격자 좌표로 대신합니다.`
                            );

                            resolve({
                                latitude:
                                    fallbackLatitude as number,

                                longitude:
                                    fallbackLongitude as number,
                            });

                            return;
                        }

                        reject(
                            new Error(
                                '현재 위치를 가져올 수 없습니다. 브라우저의 위치 권한을 허용해 주세요.'
                            )
                        );
                    };

                    if (
                        !navigator.geolocation
                    ) {
                        useFallback(
                            '이 기기에서는 위치정보를 쓸 수 없습니다.'
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
                                    '현장사진 GPS 조회 실패:',
                                    error
                                );

                                useFallback(
                                    'GPS 조회에 실패했습니다.'
                                );
                            },

                            {
                                enableHighAccuracy:
                                    true,

                                timeout: 15000,

                                maximumAge: 10000,
                            }
                        );
                }
            );
        };

    const handleSave = async () => {
        if (!imageFile) {
            setSaveError(
                '저장할 현장사진을 먼저 촬영해 주세요.'
            );

            return;
        }

        try {
            setSaving(true);
            setSaveError('');

            const coordinates =
                await getCurrentCoordinates();

            const success =
                await saveFieldPhoto({
                    file: imageFile,

                    workMode,

                    relatedRecordId,

                    latitude:
                        coordinates.latitude,

                    longitude:
                        coordinates.longitude,
                });

            if (!success) {
                throw new Error(
                    '현장사진을 저장하지 못했습니다.'
                );
            }

            setShowSuccessModal(true);


        } catch (error) {
            console.error(
                '현장사진 저장 실패:',
                error
            );

            setSaveError(
                error instanceof Error
                    ? error.message
                    : '현장사진 저장 중 오류가 발생했습니다.'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleBack = () => {
        stopCamera();
        clearPreview();
        onBack();
    };

    const handleSuccessConfirm = () => {
        setShowSuccessModal(false);
        clearPreview();
        onBack();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-system-bg text-text-main"
                    aria-label="이전 화면"
                >
                    <ArrowLeft size={20} />
                </button>

                <div>
                    <h3 className="text-lg font-bold text-text-main">
                        현장 사진 촬영
                    </h3>

                    <p className="mt-0.5 text-xs text-text-sub">
                        {workMode ===
                            'surveillance'
                            ? '예찰·조사 현장사진'
                            : '방제·시공 현장사진'}
                    </p>
                </div>
            </div>

            <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-black">
                {imagePreview ? (
                    <img
                        src={imagePreview}
                        alt="현장사진 미리보기"
                        className="h-full w-full object-cover"
                    />
                ) : cameraOpen ? (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-full w-full bg-black object-cover"
                        />

                        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                            <button
                                type="button"
                                onClick={capturePhoto}
                                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/30 active:scale-95"
                                aria-label="현장사진 촬영"
                            >
                                <div className="h-12 w-12 rounded-full bg-white" />
                            </button>
                        </div>

                        <div className="pointer-events-none absolute left-3 right-3 top-3 text-center">
                            <span className="inline-block rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white">
                                작업 대상과 주변 환경이 보이도록 촬영해 주세요
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center text-white">
                        <Camera
                            size={42}
                            className="mb-3 opacity-70"
                        />

                        <p className="text-sm font-bold">
                            카메라가 실행되지 않았습니다
                        </p>

                        <button
                            type="button"
                            onClick={() =>
                                void startCamera()
                            }
                            className="mt-4 rounded-xl bg-primary px-5 py-3 text-xs font-bold text-white"
                        >
                            카메라 다시 시작
                        </button>
                    </div>
                )}
            </div>

            {imagePreview && (
                <button
                    type="button"
                    onClick={() =>
                        void startCamera()
                    }
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-card-bg py-3 text-sm font-bold text-text-main disabled:opacity-50"
                >
                    <RotateCcw size={17} />
                    다시 촬영
                </button>
            )}

            {cameraError && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-500">
                    {cameraError}
                </div>
            )}

            {saveError && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-500">
                    {saveError}
                </div>
            )}

            <button
                type="button"
                disabled={
                    !imageFile || saving
                }
                onClick={() =>
                    void handleSave()
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-white disabled:opacity-50"
            >
                <Save size={18} />

                {saving
                    ? '위치 확인 및 저장 중...'
                    : '현장사진 저장'}
            </button>

            <p className="text-center text-[11px] leading-relaxed text-text-sub">
                사진은 현장관리 전용으로 저장되며 민원 목록에는 새 신고로 표시되지 않습니다.
            </p>

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
                                현장사진 저장 완료
                            </h3>

                            <p className="mt-2 text-sm leading-relaxed text-text-sub">
                                현장사진과 촬영 위치가
                                정상적으로 저장되었습니다.
                            </p>

                            <div className="mt-4 w-full rounded-2xl bg-system-bg px-4 py-3 text-left text-xs text-text-sub">
                                <div className="flex justify-between">
                                    <span>업무 구분</span>
                                    <span className="font-bold text-text-main">
                                        {workMode === 'surveillance'
                                            ? '예찰·조사'
                                            : '방제·시공'}
                                    </span>
                                </div>

                                <div className="mt-2 flex justify-between">
                                    <span>저장 상태</span>
                                    <span className="font-bold text-primary">
                                        저장 완료
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleSuccessConfirm}
                                className="mt-5 w-full rounded-2xl bg-primary py-4 text-sm font-bold text-white active:scale-[0.98]"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <canvas
                ref={canvasRef}
                className="hidden"
            />
        </div>
    );
}