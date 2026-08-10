import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, PenTool, QrCode, ScanLine } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface SampleQrPanelProps {
  onBack: () => void;
  onScan: () => void;
  onComplete: () => void;
}

type ScanStatus = 'idle' | 'scanning' | 'success' | 'error';

const QR_READER_ID = 'sample-qr-reader';

const mockSampleDatabase: Record<
  string,
  {
    sampleId: string;
    treeType: string;
    collector: string;
    collectedAt: string;
    location: string;
    result: string;
  }
> = {
  'SAMPLE-PINE-1024': {
    sampleId: 'SMP-2026-1024',
    treeType: '소나무',
    collector: '예찰원 김재현',
    collectedAt: '2026-07-15 14:30',
    location: '춘천시 북산면 예찰구역 A-03',
    result: '시료 등록 완료',
  },
  'SAMPLE-NEMA-2026': {
    sampleId: 'SMP-2026-2026',
    treeType: '소나무 의심목',
    collector: '현장 예찰팀',
    collectedAt: '2026-07-15 15:10',
    location: '가평군 산림 예찰구역 B-12',
    result: '시료 등록 완료',
  },
};

export function SampleQrPanel({
  onBack,
  onScan,
  onComplete,
}: SampleQrPanelProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isRunningRef = useRef(false);

  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scannedCode, setScannedCode] = useState('');
  const [scanError, setScanError] = useState('');

  const sampleInfo =
    scannedCode && mockSampleDatabase[scannedCode]
      ? mockSampleDatabase[scannedCode]
      : scannedCode
        ? {
            sampleId: '미등록 시료',
            treeType: '확인 불가',
            collector: '확인 불가',
            collectedAt: '-',
            location: '-',
            result: '미등록 시료 QR',
          }
        : null;

  const stopScannerSafely = async () => {
    const scanner = scannerRef.current;

    if (!scanner || !isRunningRef.current) {
      return;
    }

    try {
      await scanner.stop();
    } catch (error) {
      console.warn('Sample QR scanner stop skipped:', error);
    }

    try {
      await scanner.clear();
    } catch (error) {
      console.warn('Sample QR scanner clear skipped:', error);
    }

    isRunningRef.current = false;
    scannerRef.current = null;
  };

  const startScanner = async () => {
    try {
      setScanStatus('scanning');
      setScanError('');

      await stopScannerSafely();

      const scanner = new Html5Qrcode(QR_READER_ID);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
        },
        async decodedText => {
          setScannedCode(decodedText);
          setScanStatus('success');
          onScan();

          await stopScannerSafely();
        },
        () => {
          // QR을 못 찾는 프레임마다 호출되므로 무시
        }
      );

      isRunningRef.current = true;
    } catch (error) {
      console.error('Sample QR scanner error:', error);

      isRunningRef.current = false;
      setScanStatus('error');
      setScanError(
        '카메라를 시작할 수 없습니다. 다른 앱에서 카메라를 사용 중인지, 브라우저 권한이 허용되어 있는지 확인해주세요.'
      );
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      startScanner();
    }, 300);

    return () => {
      window.clearTimeout(timer);
      stopScannerSafely();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restartScan = async () => {
    setScannedCode('');
    setScanStatus('idle');
    setScanError('');

    window.setTimeout(() => {
      startScanner();
    }, 300);
  };

  const handleBack = async () => {
    await stopScannerSafely();
    onBack();
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-text-sub text-sm font-bold"
      >
        <ArrowLeft size={18} />
        예찰·조사 메뉴로 돌아가기
      </button>

      <div>
        <h3 className="font-bold text-xl text-text-main mb-1">
          시료 채취 QR 등록
        </h3>
        <p className="text-text-sub text-sm">
          채취한 시료 QR코드를 카메라 영역에 비추면 자동으로 등록됩니다.
        </p>
      </div>

      {scanStatus !== 'success' && (
        <div className="bento-card">
          <div className="flex items-center gap-2 mb-4">
            <QrCode size={20} className="text-accent" />
            <h3 className="font-bold text-text-main">시료 QR 자동 스캔</h3>
          </div>

          <div className="relative w-full h-[340px] bg-black rounded-2xl overflow-hidden mb-4">
            <div
              id={QR_READER_ID}
              className="absolute inset-0 w-full h-full"
            />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-[220px] h-[220px]">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-yellow-300 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-yellow-300 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-yellow-300 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-yellow-300 rounded-br-lg" />

                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.9)]" />

                <ScanLine
                  size={28}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-300"
                />
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-4 left-4 right-4 bg-black/50 text-white text-xs text-center rounded-xl py-2">
              카메라를 시료 QR코드에 향하세요
            </div>
          </div>

          {scanStatus === 'scanning' && (
            <p className="text-sm text-text-sub text-center">
              시료 QR 코드를 자동으로 인식 중입니다.
            </p>
          )}

          {scanStatus === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-red-500 text-center">
                {scanError}
              </p>

              <button
                onClick={restartScan}
                className="w-full bg-primary text-white font-bold py-4 rounded-xl"
              >
                카메라 다시 시작
              </button>
            </div>
          )}

          <button className="w-full bg-system-bg text-text-main font-bold py-4 rounded-xl border border-[rgba(0,0,0,0.04)] flex items-center justify-center gap-2 mt-4">
            <PenTool size={18} />
            수동 시료번호 입력
          </button>
        </div>
      )}

      {scanStatus === 'success' && sampleInfo && (
        <div className="bento-card border border-primary/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-primary/10 p-3 rounded-2xl">
              <CheckCircle2 size={28} className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-text-main text-lg">
                시료 QR 등록 완료
              </h3>
              <p className="text-text-sub text-sm">
                시료 정보가 정상적으로 인식되었습니다.
              </p>
            </div>
          </div>

          <div className="bg-system-bg rounded-2xl p-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-text-sub">QR 코드</span>
              <span className="font-bold text-text-main text-right">
                {scannedCode}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-text-sub">시료번호</span>
              <span className="font-bold text-text-main text-right">
                {sampleInfo.sampleId}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-text-sub">수종/대상</span>
              <span className="font-bold text-text-main text-right">
                {sampleInfo.treeType}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-text-sub">채취자</span>
              <span className="font-bold text-text-main text-right">
                {sampleInfo.collector}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-text-sub">채취일시</span>
              <span className="font-bold text-text-main text-right">
                {sampleInfo.collectedAt}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-text-sub">채취 위치</span>
              <span className="font-bold text-text-main text-right">
                {sampleInfo.location}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-text-sub">등록 결과</span>
              <span className="font-bold text-primary text-right">
                {sampleInfo.result}
              </span>
            </div>
          </div>

          <button
            onClick={restartScan}
            className="w-full bg-system-bg text-text-main font-bold py-4 rounded-xl border border-[rgba(0,0,0,0.04)] mt-4"
          >
            다시 스캔하기
          </button>
        </div>
      )}

      <button
        onClick={onComplete}
        className="w-full bg-primary text-white font-bold py-4 rounded-xl"
      >
        조치완료
      </button>
    </div>
  );
}