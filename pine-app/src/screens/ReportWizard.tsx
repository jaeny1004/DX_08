import React, { useEffect, useRef, useState } from 'react';
import { ScreenName } from '../types';
import {
  Camera,
  ChevronLeft,
  ImagePlus,
  Send,
  X,
} from 'lucide-react';
import { useSupabase } from '../hooks/useSupabase';

interface ReportWizardProps {
  navigate: (screen: ScreenName) => void;
  onSuccess: () => void;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

export function ReportWizard({
  navigate,
  onSuccess,
}: ReportWizardProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  const [cameraOpen, setCameraOpen] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { addRecord, uploadImage } = useSupabase();

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (imagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const startCamera = async () => {
    try {
      setCameraError('');
      setSubmitError('');

      // 기존 카메라가 실행 중이면 종료
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // 기존 사진이 있다면 제거하고 촬영 모드로 전환
      if (imagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }

      setImageFile(null);
      setImagePreview(null);
      setCameraOpen(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: 'environment',
          },
        },
        audio: false,
      });

      streamRef.current = stream;

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          videoRef.current.play().catch(error => {
            console.error('Video play error:', error);
          });
        }
      }, 100);
    } catch (error) {
      console.error('Camera start error:', error);

      setCameraOpen(false);
      setCameraError(
        '카메라를 실행할 수 없습니다. 브라우저의 카메라 권한을 허용해주세요.'
      );
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      startCamera();
    }, 300);

    return () => {
      window.clearTimeout(timer);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };

    // 최초 화면 진입 시 한 번만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    if (!video.videoWidth || !video.videoHeight) {
      setCameraError('카메라 화면이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      setCameraError('사진을 처리할 수 없습니다.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      blob => {
        if (!blob) {
          setCameraError('사진 생성에 실패했습니다.');
          return;
        }

        if (imagePreview?.startsWith('blob:')) {
          URL.revokeObjectURL(imagePreview);
        }

        const capturedFile = new File(
          [blob],
          `pine-report-${Date.now()}.jpg`,
          {
            type: 'image/jpeg',
          }
        );

        const previewUrl = URL.createObjectURL(capturedFile);

        setImageFile(capturedFile);
        setImagePreview(previewUrl);
        stopCamera();
      },
      'image/jpeg',
      0.9
    );
  };

  const handleGallerySelect = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    // 카메라 종료
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (imagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }

    setCameraOpen(false);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setCameraError('');
    setSubmitError('');

    event.target.value = '';
  };

  const removeImage = () => {
    if (imagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview(null);
  };

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 11);

    if (numbers.length <= 3) {
      return numbers;
    }

    if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    }

    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
  };

  const getCurrentCoordinates = (): Promise<Coordinates> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('이 기기에서는 위치정보를 사용할 수 없습니다.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        error => {
          console.error('Geolocation error:', error);
          reject(
            new Error(
              '위치정보를 가져올 수 없습니다. 브라우저의 위치 권한을 허용해주세요.'
            )
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        }
      );
    });
  };

  const saveReportTokenToDevice = (reportToken: string) => {
    const storageKey = 'myReportTokens';

    try {
      const storedValue = localStorage.getItem(storageKey);
      const existingTokens: string[] = storedValue
        ? JSON.parse(storedValue)
        : [];

      if (!existingTokens.includes(reportToken)) {
        localStorage.setItem(
          storageKey,
          JSON.stringify([...existingTokens, reportToken])
        );
      }
    } catch (error) {
      console.error('신고 토큰 저장 실패:', error);
    }
  };

  const handleSubmit = async () => {
    if (!imageFile) {
      setSubmitError('신고할 사진을 촬영하거나 갤러리에서 선택해주세요.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError('');

      const reportToken = crypto.randomUUID();

      // 화면에는 표시하지 않고 제출 시 위치정보만 수집
      const coordinates = await getCurrentCoordinates();

      // Supabase Storage에 사진 업로드
      const imageUrl = await uploadImage(imageFile);

      if (!imageUrl) {
        throw new Error('사진 업로드에 실패했습니다.');
      }

      // Supabase pine_records 테이블에 신고 데이터 저장
      const savedRecord = await addRecord({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        image_url: imageUrl,
        phone_number: phone || '미입력',
        status: 'pending',
        ai_probability: null,
        ai_label: null,
        ai_status: 'pending',
        report_token: reportToken,
      });

      if (!savedRecord) {
        throw new Error('신고 정보를 저장하지 못했습니다.');
      }

      saveReportTokenToDevice(reportToken);

      onSuccess();
    } catch (error) {
      console.error('Report submit error:', error);

      setSubmitError(
        error instanceof Error
          ? error.message
          : '신고 접수 중 오류가 발생했습니다.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full min-h-0 bg-system-bg flex flex-col overflow-hidden">
      {/* 상단 헤더 */}
      <div className="bg-card-bg px-4 py-3 flex items-center border-b border-[rgba(0,0,0,0.04)] sticky top-0 z-10 shadow-sm">        <button
        onClick={() => navigate('home')}
        className="p-2 -ml-2 text-text-sub active:bg-system-bg rounded-full transition-colors"
      >
        <ChevronLeft size={28} />
      </button>

        <div className="flex-1 text-center font-semibold text-text-main mr-8">
          의심목 신고
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-4 py-3 pb-36">        <div className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-text-main mb-1">
            의심목 사진 등록
          </h2>
        </div>

        {/* 사진 촬영 / 갤러리 미리보기 통합 영역 */}
        <div className="relative w-full h-56 bg-black border-2 border-dashed border-[rgba(0,0,0,0.1)] rounded-bento overflow-hidden shadow-bento">          {imagePreview ? (
          <>
            <img
              src={imagePreview}
              alt="신고 사진 미리보기"
              className="w-full h-full object-cover"
            />

            {/* 다시 촬영 */}
            <button
              type="button"
              onClick={startCamera}
              className="absolute top-3 left-3 px-3 py-2 rounded-xl bg-black/60 text-white text-xs font-bold flex items-center gap-1"
            >
              <Camera size={16} />
              다시 촬영
            </button>

            {/* 사진 삭제 */}
            <button
              type="button"
              onClick={startCamera}
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center"
              aria-label="사진 삭제"
            >
              <X size={21} />
            </button>
          </>
        ) : cameraOpen ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover bg-black"
            />

            {/* 촬영 버튼 */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
              <button
                type="button"
                onClick={capturePhoto}
                className="w-16 h-16 rounded-full border-4 border-white bg-white/30 flex items-center justify-center active:scale-95 transition-transform"
                aria-label="사진 촬영"
              >
                <div className="w-12 h-12 rounded-full bg-white" />
              </button>
            </div>

            <div className="pointer-events-none absolute top-4 left-4 right-4 text-center">
              <span className="inline-block bg-black/45 text-white text-xs rounded-full px-3 py-1.5">
                의심목 전체 모습이 보이도록 촬영해주세요
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-full bg-card-bg flex flex-col items-center justify-center text-text-sub">
            <Camera size={38} className="mb-3 opacity-60" />

            <span className="font-semibold mb-4">
              카메라를 시작할 수 없습니다
            </span>

            <button
              type="button"
              onClick={startCamera}
              className="bg-primary text-white px-5 py-3 rounded-xl font-bold"
            >
              카메라 다시 시작
            </button>
          </div>
        )}
        </div>


        {/* 갤러리 업로드 버튼 */}
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-card-bg text-text-main font-bold py-4 rounded-bento border border-[rgba(0,0,0,0.08)] flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform"
          >
            <ImagePlus size={20} />
            갤러리에서 사진 선택
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleGallerySelect}
          />
        </div>


        {cameraError && (
          <div className="bg-red-50 text-red-500 text-sm rounded-2xl p-4">
            {cameraError}
          </div>
        )}

        {/* 연락처 */}
        <div>
          <label className="block text-sm font-semibold text-text-main mb-2">
            연락처
          </label>

          <input
            type="tel"
            inputMode="numeric"
            placeholder="010-1234-5678"
            value={phone}
            onChange={event =>
              setPhone(formatPhoneNumber(event.target.value))
            }
            className="w-full bg-card-bg border border-[rgba(0,0,0,0.1)] rounded-[15px] px-4 py-4 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow shadow-sm"
          />

          <p className="text-xs text-text-sub mt-2">
            처리 결과 안내를 받을 전화번호를 입력해주세요.
          </p>
        </div>

        {submitError && (
          <div className="bg-red-50 text-red-500 text-sm rounded-2xl p-4">
            {submitError}
          </div>
        )}
        {/* 신고하기 */}
        <button
          type="button"
          disabled={!imageFile || submitting}
          onClick={handleSubmit}
          className="w-full bg-primary text-white font-bold py-4 rounded-bento disabled:opacity-50 shadow-bento flex items-center justify-center gap-2"
        >
          <Send size={20} />
          {submitting ? '신고 접수 중...' : '신고하기'}
        </button>
      </div>
      </div>

      {/* 카메라 캡처용 숨김 canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}