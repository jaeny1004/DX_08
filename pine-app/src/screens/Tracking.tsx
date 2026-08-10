import { ScreenName } from '../types';
import { ChevronLeft, CheckCircle2, Clock, Truck, FileCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useSupabase } from '../hooks/useSupabase';

interface TrackingProps {
  navigate: (screen: ScreenName) => void;
}

export function Tracking({ navigate }: TrackingProps) {
  const { records } = useSupabase();
  const latestRecord = records[0];

  if (!latestRecord) {
    return (
      <div className="h-full bg-system-bg flex flex-col">
        <div className="p-4 pt-4">
          <button onClick={() => navigate('home')} className="p-2 text-text-sub">
            <ChevronLeft size={28} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-sub">
          신고 내역이 없습니다.
        </div>
      </div>
    );
  }

  const steps = [
    { id: 'pending', label: '접수 완료', icon: FileCheck, date: new Date(latestRecord.created_at).toLocaleDateString() },
    { id: 'in_progress_1', label: '현장 출동', icon: Truck, date: '-' },
    { id: 'in_progress_2', label: '정밀 진단', icon: Clock, date: '-' },
    { id: 'completed', label: '방제 완료', icon: CheckCircle2, date: '-' },
  ];

  let currentStepIdx = 0;
  if (latestRecord.status === 'in_progress') currentStepIdx = 1;
  if (latestRecord.status === 'completed') currentStepIdx = 3;

  return (
    <div className="h-full bg-system-bg flex flex-col overflow-y-auto">
      <div className="bg-card-bg p-4 pt-4 flex items-center border-b border-[rgba(0,0,0,0.04)] shrink-0">
        <button onClick={() => navigate('home')} className="p-2 -ml-2 text-text-sub">
          <ChevronLeft size={28} />
        </button>
        <div className="flex-1 text-center font-semibold text-text-main mr-8">
          진행 상태 추적
        </div>
      </div>

      <div className="p-6">
        <div className="bento-card mb-6">
          <div className="flex gap-4 mb-6">
            <img src={latestRecord.image_url} className="w-24 h-24 rounded-lg object-cover bg-system-bg" />
            <div>
              <h3 className="font-bold text-text-main mb-1">의심목 신고</h3>
              <p className="text-[12px] text-text-sub mb-2">접수번호: {latestRecord.id.slice(0,8).toUpperCase()}</p>
              <div className="inline-block bg-[rgba(26,77,46,0.1)] text-primary text-xs font-bold px-2 py-1 rounded-md">
                {steps[currentStepIdx].label}
              </div>
            </div>
          </div>

          <div className="relative pl-6 space-y-8 py-4">
            <div className="absolute top-4 bottom-4 left-[35px] w-[2px] bg-system-bg" />
            <motion.div 
              className="absolute top-4 left-[35px] w-[2px] bg-primary origin-top"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: currentStepIdx / (steps.length - 1) }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />

            {steps.map((step, idx) => {
              const isPast = idx <= currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              const Icon = step.icon;

              return (
                <div key={idx} className="relative flex items-center gap-6">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 shrink-0 ${
                    isPast ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-system-bg border border-[rgba(0,0,0,0.04)] text-text-sub'
                  } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}>
                    <Icon size={14} />
                  </div>
                  <div>
                    <p className={`font-bold text-[12px] ${isPast ? 'text-text-main' : 'text-text-sub'}`}>
                      {step.label}
                    </p>
                    <p className="text-[10px] text-text-sub">{step.date}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
