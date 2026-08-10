import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-[9000]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[10000] bg-card-bg rounded-t-[30px] max-w-md mx-auto shadow-bento border-t border-[rgba(0,0,0,0.04)]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="p-4 flex justify-center pb-2">
              <div className="w-12 h-1.5 bg-system-bg border border-[rgba(0,0,0,0.04)] rounded-full" />
            </div>
            <div className="absolute top-4 right-4">
              <button onClick={onClose} className="p-2 bg-system-bg rounded-full text-text-sub active:scale-95 transition-transform border border-[rgba(0,0,0,0.04)]">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 pt-2 overflow-y-auto max-h-[80vh]">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
