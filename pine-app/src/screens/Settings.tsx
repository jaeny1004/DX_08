import { ScreenName } from '../types';
import { ChevronLeft, LogOut, DownloadCloud, Bell } from 'lucide-react';

interface SettingsProps {
  navigate: (screen: ScreenName) => void;
  setIsAuthenticated: (val: boolean) => void;
}

export function Settings({ navigate, setIsAuthenticated }: SettingsProps) {
  return (
    <div className="h-full bg-system-bg flex flex-col">
      <div className="bg-card-bg px-4 py-4 flex items-center border-b border-[rgba(0,0,0,0.04)] shadow-sm">
        <button onClick={() => navigate('field')} className="p-2 -ml-2 text-text-sub">
          <ChevronLeft size={28} />
        </button>
        <div className="flex-1 text-center font-semibold text-text-main mr-8">
          설정
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="bento-card overflow-hidden divide-y divide-[rgba(0,0,0,0.04)] !p-0">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-ios-blue/10 p-2 rounded-xl text-ios-blue">
                <DownloadCloud size={20} />
              </div>
              <div>
                <p className="font-semibold text-text-main text-sm">오프라인 지도 동기화</p>
                <p className="text-[11px] text-text-sub">통신 불가 지역용 데이터 다운로드</p>
              </div>
            </div>
            <div className="w-12 h-7 bg-primary rounded-full relative shadow-inner">
              <div className="absolute right-1 top-1 w-5 h-5 bg-card-bg rounded-full shadow" />
            </div>
          </div>
          
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-accent/10 p-2 rounded-xl text-accent">
                <Bell size={20} />
              </div>
              <div>
                <p className="font-semibold text-text-main text-sm">푸시 알림</p>
                <p className="text-[11px] text-text-sub">신규 민원 및 작업 지시 알림</p>
              </div>
            </div>
            <div className="w-12 h-7 bg-primary rounded-full relative shadow-inner">
              <div className="absolute right-1 top-1 w-5 h-5 bg-card-bg rounded-full shadow" />
            </div>
          </div>
        </div>

        <button 
          onClick={() => {
            setIsAuthenticated(false);
            navigate('home');
          }}
          className="w-full bg-card-bg text-red-500 font-bold p-4 rounded-bento flex items-center justify-center gap-2 border border-red-100 shadow-bento"
        >
          <LogOut size={20} />
          로그아웃
        </button>
      </div>
    </div>
  );
}
