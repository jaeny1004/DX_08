import { useState, useEffect } from 'react';
import { ScreenName } from '../types';
import { motion } from 'motion/react';
import { ChevronLeft, Delete, Search, UserCircle2 } from 'lucide-react';
import { useWorker } from '../hooks/useWorker';

interface LoginProps {
  navigate: (screen: ScreenName) => void;
  setIsAuthenticated: (val: boolean) => void;
}

export function Login({ navigate, setIsAuthenticated }: LoginProps) {
  const [passcode, setPasscode] = useState<string>('');
  const [error, setError] = useState(false);

  /*
   * 패스코드만으로는 "누가 로그인했는지"를 알 수 없어서
   * 웹이 배정한 작업을 골라낼 수 없었다.
   * 패스코드를 통과하면 본인을 선택하는 단계를 둔다.
   */
  const [step, setStep] = useState<'passcode' | 'worker'>('passcode');
  const [keyword, setKeyword] = useState('');

  const {
    worker,
    loading: workerLoading,
    loadError,
    selectWorker,
    searchCandidates,
  } = useWorker();

  useEffect(() => {
    if (passcode.length === 4) {
      if (passcode === '1111') {
        setIsAuthenticated(true);

        /*
         * 저장된 요원이 있어도 선택 화면을 건너뛰지 않는다.
         * 한 기기를 여러 요원이 돌려 쓰는데 예전에 고른 사람으로 계속 들어가
         * 남의 작업 목록이 뜨는 문제가 있었다.
         * 로그인은 "지금 누가 쓰는지" 정하는 행위이므로 매번 묻는다.
         * (앱을 껐다 켜기만 한 경우에는 useWorker 가 localStorage 에서 복구한다)
         */
        setTimeout(() => setStep('worker'), 250);
      } else {
        setError(true);
        setTimeout(() => {
          setPasscode('');
          setError(false);
        }, 500);
      }
    }
  }, [passcode, setIsAuthenticated]);

  const handleSelectWorker = (workerId: string) => {
    selectWorker(workerId);
    navigate('mytasks');
  };

  if (step === 'worker') {
    const results = searchCandidates(keyword);

    return (
      <div className="h-full bg-system-bg flex flex-col">
        <div className="bg-card-bg p-4 flex items-center border-b border-[rgba(0,0,0,0.04)] shrink-0">
          <button
            onClick={() => setStep('passcode')}
            className="p-2 -ml-2 text-text-sub"
          >
            <ChevronLeft size={28} />
          </button>
          <span className="flex-1 font-semibold text-text-main text-center mr-8">
            담당 요원 선택
          </span>
        </div>

        <div className="p-4 shrink-0 space-y-3">
          {/* 지난번에 고른 요원. 같은 사람이면 한 번에 들어간다 */}
          {worker && (
            <button
              onClick={() => navigate('mytasks')}
              className="w-full bg-primary/10 border border-primary/20 rounded-[12px] p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                <UserCircle2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-primary font-bold">
                  최근 선택
                </div>
                <div className="text-[13px] font-bold text-text-main truncate">
                  {worker.workerName}
                  <span className="ml-2 text-[11px] font-normal text-text-sub">
                    {worker.organization}
                  </span>
                </div>
              </div>
            </button>
          )}

          <div className="flex items-center gap-2 bg-card-bg rounded-[10px] px-3 py-2.5 shadow-sm">
            <Search size={16} className="text-text-sub shrink-0" />
            <input
              type="text"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="이름 · 시군구 · 소속으로 검색"
              className="flex-1 bg-transparent text-[13px] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {workerLoading ? (
            <p className="text-center text-[13px] text-text-sub py-16">
              요원 목록을 불러오는 중...
            </p>
          ) : loadError ? (
            <p className="text-center text-[12px] text-text-sub py-16 px-6 leading-relaxed">
              {loadError}
            </p>
          ) : results.length === 0 ? (
            <p className="text-center text-[13px] text-text-sub py-16">
              검색 결과가 없습니다.
            </p>
          ) : (
            results.map((candidate) => (
              <button
                key={candidate.workerId}
                onClick={() => handleSelectWorker(candidate.workerId)}
                className="w-full bg-card-bg rounded-[12px] p-3 flex items-center gap-3 text-left shadow-sm active:scale-[0.99] transition-transform"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UserCircle2 size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-text-main truncate">
                    {candidate.workerName}
                    <span className="ml-2 text-[11px] font-normal text-text-sub">
                      {candidate.positionName}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-sub truncate">
                    {candidate.organization}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  const handlePress = (num: string) => {
    if (passcode.length < 4) {
      setPasscode(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setPasscode(prev => prev.slice(0, -1));
  };

  const padNumbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  return (
    <div className="h-full bg-system-bg flex flex-col items-center">
      <div className="w-full p-4 flex items-center pt-4">
        <button onClick={() => navigate('home')} className="p-2 text-text-sub">
          <ChevronLeft size={28} />
        </button>
      </div>

      <div className="flex-1 w-full flex flex-col items-center justify-center -mt-16">
        <h2 className="text-xl font-bold text-text-main mb-8">Enter Passcode</h2>
        
        <motion.div 
          animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="flex gap-4 mb-16"
        >
          {[0, 1, 2, 3].map(i => (
            <div 
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-colors duration-200 ${
                i < passcode.length ? 'bg-text-main border-text-main' : 'border-[rgba(0,0,0,0.1)]'
              } ${error ? 'bg-red-500 border-red-500' : ''}`}
            />
          ))}
        </motion.div>

        <div className="grid grid-cols-3 gap-6 px-12">
          {padNumbers.map((item, idx) => {
            if (item === '') return <div key={idx} />;
            if (item === 'back') {
              return (
                <button 
                  key={idx}
                  onClick={handleBackspace}
                  className="w-20 h-20 flex items-center justify-center rounded-full active:bg-black/5 transition-colors"
                >
                  <Delete size={28} className="text-text-sub" />
                </button>
              );
            }
            return (
              <button
                key={idx}
                onClick={() => handlePress(item)}
                className="w-20 h-20 flex items-center justify-center text-3xl font-light text-text-main rounded-full bg-card-bg shadow-sm border border-[rgba(0,0,0,0.04)] active:bg-system-bg transition-colors"
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
