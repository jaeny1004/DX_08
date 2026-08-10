import { SampleQrPanel } from '../components/SampleQrPanel';
import {
  FieldPhotoPanel,
} from '../components/FieldPhotoPanel';
import {
  useState,
  useEffect,
  useMemo,
} from 'react';
import { PineRecord, ScreenName } from '../types';
import {
  Mic,
  QrCode,
  MapPin,
  CheckCircle2,
  Camera,
} from 'lucide-react';
import { LeafletMap } from '../components/LeafletMap';
import { BottomSheet } from '../components/BottomSheet';
import { useSupabase } from '../hooks/useSupabase';
import { motion } from 'motion/react';
import { FieldSttPanel } from '../components/FieldSttPanel';
import { ChemicalQrPanel } from '../components/ChemicalQrPanel';

interface FieldManagementProps {
  navigate: (screen: ScreenName) => void;
  initialRecordId?: string | null;
  onInitialRecordHandled?: () => void;
}

type FieldPanelMode = 'menu' | 'stt' | 'chemical' | 'sample' | 'photo';

export function FieldManagement({
  navigate: _navigate,
  initialRecordId,
  onInitialRecordHandled,
}: FieldManagementProps) {
  const [activeTab, setActiveTab] = useState<'surveillance' | 'control'>('surveillance');
  const { records, updateStatus } = useSupabase();
  const [selectedRecord, setSelectedRecord] =
    useState<PineRecord | null>(null);

  const [
    focusedRecordId,
    setFocusedRecordId,
  ] = useState<string | null>(
    initialRecordId ?? null
  );

  const [controlPanelMode, setControlPanelMode] = useState<FieldPanelMode>('menu');


  // 여기부터 추가
  useEffect(() => {
    if (!initialRecordId) {
      return;
    }

    const targetRecord = records.find(
      record => record.id === initialRecordId
    );

    if (!targetRecord) {
      return;
    }

    if (targetRecord.status === 'in_progress') {
      setActiveTab('control');
    } else {
      setActiveTab('surveillance');
    }

    setSelectedRecord(targetRecord);
    setFocusedRecordId(targetRecord.id);
    setControlPanelMode('menu');

    onInitialRecordHandled?.();
  }, [
    initialRecordId,
    records,
    onInitialRecordHandled,
  ]);
  // 여기까지 추가

  const closeBottomSheet = () => {
    setSelectedRecord(null);
    setControlPanelMode('menu');
  };

  const openRecordSheet = (
    record: PineRecord
  ) => {
    setSelectedRecord(record);
    setFocusedRecordId(record.id);
    setControlPanelMode('menu');
  };


  const handleComplete = async () => {
    if (!selectedRecord) {
      return;
    }

    const nextStatus: PineRecord['status'] =
      activeTab === 'surveillance'
        ? 'in_progress'
        : 'completed';

    const success = await updateStatus(
      selectedRecord.id,
      nextStatus
    );

    if (!success) {
      console.error(
        '민원 상태를 변경하지 못했습니다.'
      );

      return;
    }

    setFocusedRecordId(null);
    closeBottomSheet();
  };

  const handleLocationCheck = () => {
    closeBottomSheet();
  };

  const handleSampleQrRegister = () => {
    console.log('시료 QR 등록 완료');
  };

  const handleChemicalQrScan = () => {
    console.log('약제 QR 인식 완료');
  };

  /*
 * 예찰·조사 지도에는 아직 조사하지 않은 민원만 표시
 */
  const surveillanceRecords = useMemo(() => {
    const pendingRecords = records.filter(
      record => record.status === 'pending'
    );

    if (!focusedRecordId) {
      return pendingRecords;
    }

    const focusedRecord = records.find(
      record => record.id === focusedRecordId
    );

    if (
      !focusedRecord ||
      pendingRecords.some(
        record => record.id === focusedRecord.id
      )
    ) {
      return pendingRecords;
    }

    /*
     * 민원 화면에서 이미 조사·방제 완료된 건을 눌렀을 때도
     * 위치 확인을 위해 해당 민원만 지도에 임시로 포함
     */
    return [focusedRecord, ...pendingRecords];
  }, [records, focusedRecordId]);

  /*
   * 방제·시공 지도에는 조사 완료된 민원만 표시
   */
  const controlRecords = useMemo(() => {
    return records.filter(
      record => record.status === 'in_progress'
    );
  }, [records]);

  return (
    <div className="h-full bg-system-bg flex flex-col overflow-hidden">
      {/* Header Tabs */}
      <div className="bg-card-bg pt-4 pb-4 px-4 shadow-sm z-10 border-b border-[rgba(0,0,0,0.04)] shrink-0">
        <h1 className="text-xl font-bold text-text-main mb-4">현장 업무 관리</h1>

        <div className="flex bg-system-bg p-1 rounded-xl">
          {[
            { id: 'surveillance', label: '예찰·조사' },
            { id: 'control', label: '방제·시공' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as 'surveillance' | 'control');
                setFocusedRecordId(null);
                closeBottomSheet();
              }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors relative ${activeTab === tab.id ? 'text-text-main' : 'text-text-sub'
                }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-card-bg shadow-sm rounded-lg"
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content: 지도만 표시 */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'surveillance' && (
          <div className="absolute inset-0 p-4 pb-4">
            <div className="w-full h-full">
              <LeafletMap
                records={surveillanceRecords}
                focusRecordId={focusedRecordId}
                onMarkerClick={openRecordSheet}
              />
            </div>
          </div>
        )}

        {activeTab === 'control' && (
          <div className="absolute inset-0 p-4 pb-4">
            <div className="w-full h-full">
              <LeafletMap
                records={controlRecords}
                focusRecordId={focusedRecordId}
                onMarkerClick={openRecordSheet}
              />
            </div>
          </div>
        )}
      </div>

      <BottomSheet isOpen={!!selectedRecord} onClose={closeBottomSheet}>
        {/* 예찰·조사 모드 BottomSheet */}
        {selectedRecord && activeTab === 'surveillance' && controlPanelMode === 'menu' && (

          <div className="space-y-4">
            {selectedRecord.image_url && (
              <img
                src={selectedRecord.image_url}
                className="w-full h-44 object-cover rounded-2xl bg-system-bg"
                alt="의심목 신고 이미지"
              />
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-xl text-text-main">의심목 신고건</h3>
                <span className="px-3 py-1 rounded-full bg-red-50 text-red-500 text-xs font-bold">
                  대기
                </span>
              </div>
              <p className="text-text-sub text-sm">
                신고자 연락망 {selectedRecord.phone_number || '정보 없음'}
              </p>
            </div>

            <div className="bg-system-bg rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-text-sub">GPS 정밀좌표</span>
                <span className="font-bold text-text-main text-right">
                  {selectedRecord.latitude && selectedRecord.longitude
                    ? `${selectedRecord.latitude}, ${selectedRecord.longitude}`
                    : '좌표 정보 없음'}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-text-sub">AI 의심 확률</span>
                <span className="font-bold text-primary">
                  분석 대기
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={handleLocationCheck}
                className="bg-card-bg border border-[rgba(0,0,0,0.08)] text-text-main font-bold py-3 rounded-xl flex flex-col items-center justify-center gap-1 text-xs"
              >
                <MapPin size={18} className="text-red-500" />
                GPS 마킹
              </button>

              <button
                onClick={() => setControlPanelMode('sample')}
                className="bg-card-bg border border-[rgba(0,0,0,0.08)] text-text-main font-bold py-3 rounded-xl flex flex-col items-center justify-center gap-1 text-xs"
              >
                <QrCode size={18} className="text-accent" />
                시료 QR
              </button>

              <button
                type="button"
                onClick={() =>
                  setControlPanelMode('photo')
                }
                className="bg-card-bg border border-[rgba(0,0,0,0.08)] text-text-main font-bold py-3 rounded-xl flex flex-col items-center justify-center gap-1 text-[11px]"
              >
                <Camera
                  size={18}
                  className="text-ios-blue"
                />
                현장 촬영
              </button>

              {selectedRecord.status === 'pending' ? (
                <button
                  onClick={handleComplete}
                  className="bg-primary text-white font-bold py-3 rounded-xl flex flex-col items-center justify-center gap-1 text-xs"
                >
                  <CheckCircle2 size={18} />
                  조사 완료
                </button>
              ) : (
                <div className="bg-gray-100 text-text-sub font-bold py-3 rounded-xl flex flex-col items-center justify-center gap-1 text-xs">
                  <CheckCircle2 size={18} />
                  처리 완료
                </div>
              )}
            </div>
          </div>
        )}

        {/* 예찰·조사 모드: 시료 채취 QR 등록 화면 */}
        {selectedRecord && activeTab === 'surveillance' && controlPanelMode === 'sample' && (
          <SampleQrPanel
            onBack={() => setControlPanelMode('menu')}
            onScan={handleSampleQrRegister}
            onComplete={handleComplete}
          />
        )}

        {/* 방제·시공 모드: 기본 작은 메뉴 */}
        {selectedRecord && activeTab === 'control' && controlPanelMode === 'menu' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-xl text-text-main">방제·시공 대상지</h3>
                <span className="px-3 py-1 rounded-full bg-orange-50 text-orange-500 text-xs font-bold">
                  방제 대기
                </span>
              </div>
              <p className="text-text-sub text-sm">
                신고자 연락망 {selectedRecord.phone_number || '정보 없음'}
              </p>
            </div>

            <div className="bg-system-bg rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-text-sub">GPS 정밀좌표</span>
                <span className="font-bold text-text-main text-right">
                  {selectedRecord.latitude && selectedRecord.longitude
                    ? `${selectedRecord.latitude}, ${selectedRecord.longitude}`
                    : '좌표 정보 없음'}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-text-sub">작업 상태</span>
                <span className="font-bold text-primary">
                  방제 대기
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setControlPanelMode('stt')}
                className="bg-card-bg border border-[rgba(0,0,0,0.08)] text-text-main font-bold py-4 rounded-xl flex flex-col items-center justify-center gap-2 text-xs"
              >
                <Mic size={18} className="text-ios-blue" />
                작업 일지 STT 녹음
              </button>

              <button
                onClick={() => setControlPanelMode('chemical')}
                className="bg-card-bg border border-[rgba(0,0,0,0.08)] text-text-main font-bold py-4 rounded-xl flex flex-col items-center justify-center gap-2 text-xs"
              >
                <QrCode size={18} className="text-accent" />
                자재·약제 QR 인증
              </button>
              <button
                type="button"
                onClick={() =>
                  setControlPanelMode('photo')
                }
                className="bg-card-bg border border-[rgba(0,0,0,0.08)] text-text-main font-bold py-4 rounded-xl flex flex-col items-center justify-center gap-2 text-[11px]"
              >
                <Camera
                  size={18}
                  className="text-ios-blue"
                />
                현장 촬영
              </button>

              <button
                onClick={handleComplete}
                className="bg-primary text-white font-bold py-4 rounded-xl flex flex-col items-center justify-center gap-2 text-xs"
              >
                <CheckCircle2 size={18} />
                방제 완료
              </button>
            </div>
          </div>
        )}

        {/* 예찰·방제 공통: 현장사진 촬영 화면 */}
        {selectedRecord &&
          controlPanelMode ===
          'photo' && (
            <FieldPhotoPanel
              workMode={activeTab}
              relatedRecordId={String(
                selectedRecord.id
              )}
              onBack={() =>
                setControlPanelMode(
                  'menu'
                )
              }
            />
          )}

        {/* 방제·시공 모드: STT 화면 */}
        {selectedRecord && activeTab === 'control' && controlPanelMode === 'stt' && (
          <FieldSttPanel
            workMode={activeTab}
            relatedRecordId={String(
              selectedRecord.id
            )}
            onBack={() =>
              setControlPanelMode(
                'menu'
              )
            }
            onComplete={
              handleComplete
            }
          />
        )}

        {/* 방제·시공 모드: 약제 QR 화면 */}
        {selectedRecord && activeTab === 'control' && controlPanelMode === 'chemical' && (
          <ChemicalQrPanel
            onBack={() => setControlPanelMode('menu')}
            onScan={handleChemicalQrScan}
            onComplete={handleComplete}
          />
        )}
      </BottomSheet>
    </div>
  );
}