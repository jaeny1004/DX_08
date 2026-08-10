import { PineRecord } from '../types';
import { MapPin } from 'lucide-react';
import { motion } from 'motion/react';

interface MockMapProps {
  records: PineRecord[];
  onMarkerClick: (record: PineRecord) => void;
}

export function MockMap({ records, onMarkerClick }: MockMapProps) {
  // A simple grid map background mimicking a terrain or city layout
  return (
    <div className="relative w-full h-full bg-system-bg overflow-hidden rounded-bento border border-[rgba(0,0,0,0.04)] shadow-bento">
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, #1a4d2e 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }}
      />
      
      {/* Mock regions */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      {/* Render Markers - just randomly scatter them based on their index or latitude/longitude modulos to keep it looking nice within the box */}
      {records.filter(r => r.status === 'pending').map((record, i) => {
        const top = 10 + ((record.latitude * 100) % 80);
        const left = 10 + ((record.longitude * 100) % 80);
        
        return (
          <motion.button
            key={record.id}
            onClick={() => onMarkerClick(record)}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.1, type: 'spring' }}
            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
            style={{ top: `${top}%`, left: `${left}%` }}
          >
            <div className="bg-red-500 text-white p-1.5 rounded-full shadow-lg relative z-10">
              <MapPin size={20} fill="white" className="text-red-600" />
            </div>
            <div className="w-2 h-2 bg-red-500/50 rounded-full -mt-1 blur-[1px]" />
          </motion.button>
        );
      })}
    </div>
  );
}
