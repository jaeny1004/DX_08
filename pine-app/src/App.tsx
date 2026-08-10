import {
  useState,
  useCallback,
} from 'react';
import { ScreenName } from './types';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { ReportWizard } from './screens/ReportWizard';
import { FieldManagement } from './screens/FieldManagement';
import { Tracking } from './screens/Tracking';
import { Chatbot } from './screens/Chatbot';
import { Settings } from './screens/Settings';
import { Tickets } from './screens/Tickets';
import { MyTasks } from './screens/MyTasks';
import { Notification } from './components/Notification';
import { MessageSquare, Home as HomeIcon, Edit3, FileText, ClipboardList, Settings as SettingsIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SupabaseProvider } from './hooks/useSupabase';
import { WorkerProvider } from './hooks/useWorker';

export default function App() {
  return (
    <SupabaseProvider>
      {/* 웹 대시보드가 배정한 작업을 골라내려면 "누가 쓰는 기기인지"가 필요하다 */}
      <WorkerProvider>
        <AppContent />
      </WorkerProvider>
    </SupabaseProvider>
  );
}

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [notification, setNotification] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [
    fieldTargetRecordId,
    setFieldTargetRecordId,
  ] = useState<string | null>(null);

  const handleOpenFieldRecord = (
    recordId: string
  ) => {
    setFieldTargetRecordId(recordId);
    setCurrentScreen('field');
  };

  const handleFieldTargetHandled =
    useCallback(() => {
      setFieldTargetRecordId(null);
    }, []);

  const handleReportSuccess = () => {
    setCurrentScreen('home');
    setNotification({
      show: true,
      message: '🌳 의심목 신고가 정상 접수되었습니다.'
    });
  };

  const handleNotificationClick = () => {
    setCurrentScreen('tracking');
    setNotification(prev => ({ ...prev, show: false }));
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home': return <Home navigate={setCurrentScreen} isAuthenticated={isAuthenticated} />;
      case 'login': return <Login navigate={setCurrentScreen} setIsAuthenticated={setIsAuthenticated} />;
      case 'report': return <ReportWizard navigate={setCurrentScreen} onSuccess={handleReportSuccess} />;
      case 'field':
        return (
          <FieldManagement
            navigate={setCurrentScreen}
            initialRecordId={fieldTargetRecordId}
            onInitialRecordHandled={
              handleFieldTargetHandled
            }
          />
        );
      case 'tracking': return <Tracking navigate={setCurrentScreen} />;
      case 'chatbot': return <Chatbot navigate={setCurrentScreen} />;
      case 'settings': return <Settings navigate={setCurrentScreen} setIsAuthenticated={setIsAuthenticated} />;
      case 'tickets':
        return (
          <Tickets
            navigate={setCurrentScreen}
            isAuthenticated={isAuthenticated}
            onOpenRecord={handleOpenFieldRecord}
          />
        );
      case 'mytasks':
        return (
          <MyTasks
            navigate={setCurrentScreen}
            onOpenRecord={handleOpenFieldRecord}
          />
        );
      default: return <Home navigate={setCurrentScreen} isAuthenticated={isAuthenticated} />;
    }
  };

  return (
    <div className="w-full h-[100dvh] bg-black sm:py-8 sm:px-4 flex justify-center items-center overflow-hidden">
      <div className="w-full max-w-md h-full bg-system-bg sm:rounded-[40px] sm:shadow-2xl overflow-hidden relative border-8 border-transparent sm:border-gray-900 flex flex-col">

        {/* Dynamic Island / Status Bar area space */}
        <div className="hidden sm:block absolute top-0 inset-x-0 h-7 bg-gray-900 rounded-b-3xl z-50 w-32 mx-auto" />

        <Notification
          show={notification.show}
          message={notification.message}
          onClick={handleNotificationClick}
          onClose={() => setNotification(prev => ({ ...prev, show: false }))}
        />

        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentScreen}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full overflow-hidden"
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Global Bottom Navigation */}
        {currentScreen !== 'login' && (
          <div className="bg-card-bg border-t border-[rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)] flex justify-around items-center px-2 py-2 shrink-0 z-40">
            <button onClick={() => setCurrentScreen('home')} className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentScreen === 'home' ? 'text-primary' : 'text-text-sub hover:text-primary/70'}`}>
              <HomeIcon size={22} className={currentScreen === 'home' ? 'fill-primary/20' : ''} />
              <span className="text-[10px] font-bold">홈</span>
            </button>
            <button onClick={() => setCurrentScreen('report')} className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentScreen === 'report' ? 'text-primary' : 'text-text-sub hover:text-primary/70'}`}>
              <Edit3 size={22} className={currentScreen === 'report' ? 'fill-primary/20' : ''} />
              <span className="text-[10px] font-bold">신고</span>
            </button>
            <button onClick={() => setCurrentScreen('tickets')} className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentScreen === 'tickets' ? 'text-primary' : 'text-text-sub hover:text-primary/70'}`}>
              <FileText size={22} className={currentScreen === 'tickets' ? 'fill-primary/20' : ''} />
              <span className="text-[10px] font-bold">민원</span>
            </button>
            {/* 웹 대시보드에서 배정받은 작업 */}
            <button onClick={() => setCurrentScreen('mytasks')} className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentScreen === 'mytasks' ? 'text-primary' : 'text-text-sub hover:text-primary/70'}`}>
              <ClipboardList size={22} className={currentScreen === 'mytasks' ? 'fill-primary/20' : ''} />
              <span className="text-[10px] font-bold">내 작업</span>
            </button>
            <button onClick={() => setCurrentScreen('settings')} className={`flex flex-col items-center gap-1 p-2 w-16 transition-colors ${currentScreen === 'settings' ? 'text-primary' : 'text-text-sub hover:text-primary/70'}`}>
              <SettingsIcon size={22} className={currentScreen === 'settings' ? 'fill-primary/20' : ''} />
              <span className="text-[10px] font-bold">설정</span>
            </button>
          </div>
        )}

        {/* Floating Chatbot Button */}
        {(currentScreen === 'home' || currentScreen === 'tracking') && (
          <button
            onClick={() => setCurrentScreen('chatbot')}
            className="absolute bottom-24 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-xl shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform z-40"
          >
            <MessageSquare size={24} />
          </button>
        )}
      </div>
    </div>
  );
}

