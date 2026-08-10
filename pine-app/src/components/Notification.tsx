import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TreePine } from 'lucide-react';

interface NotificationProps {
  message: string;
  show: boolean;
  onClick: () => void;
  onClose: () => void;
}

export function Notification({ message, show, onClick, onClose }: NotificationProps) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 16, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed top-0 left-0 right-0 z-[100] px-4 max-w-md mx-auto"
        >
          <div 
            onClick={() => { onClick(); onClose(); }}
            className="bg-card-bg/90 backdrop-blur-xl shadow-bento border border-[rgba(0,0,0,0.04)] rounded-[15px] p-4 flex items-center gap-3 cursor-pointer active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 bg-primary rounded-[10px] flex items-center justify-center shrink-0">
              <TreePine className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-main">ForestShield AI</p>
              <p className="text-[12px] text-text-sub leading-snug">{message}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
