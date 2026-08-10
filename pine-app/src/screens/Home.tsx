import { ScreenName } from '../types';
import { Shield, Camera, UserSquare2, ChevronRight} from 'lucide-react';
import { motion } from 'motion/react';

interface HomeProps {
  navigate: (screen: ScreenName) => void;
  isAuthenticated: boolean;
}

export function Home({ navigate, isAuthenticated }: HomeProps) {


 
  

  return (
    <div className="h-full bg-system-bg p-6 flex flex-col overflow-y-auto">
      <div className="pt-4 pb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-primary p-2 rounded-xl shadow-sm">
            <Shield className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">ForestShield AI</h1>
        </div>
        <p className="text-text-sub font-medium">소나무 재선충병 스마트 예찰 시스템</p>
      </div>

      <div className="flex-1 flex flex-col gap-4 pb-6">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('report')}
          className="bg-primary text-white p-6 rounded-bento flex items-center justify-between shadow-bento"
        >
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <Camera size={28} />
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold mb-1">시민 의심목 신고</h2>
              <p className="text-white/80 text-sm">소나무 이상 증상을 제보해주세요</p>
            </div>
          </div>
          <ChevronRight className="text-white/70" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => isAuthenticated ? navigate('field') : navigate('login')}
          className="bento-card flex items-center justify-between p-6"
        >
          <div className="flex items-center gap-4">
            <div className="bg-system-bg p-3 rounded-2xl border border-[rgba(0,0,0,0.04)]">
              <UserSquare2 size={28} className="text-text-sub" />
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-text-main mb-1">현장 업무 관리</h2>
              <p className="text-text-sub text-sm">예찰원 및 방제 작업자 로그인</p>
            </div>
          </div>
          <ChevronRight className="text-text-sub opacity-50" />
        </motion.button>
      </div>
    </div>
  );
}
