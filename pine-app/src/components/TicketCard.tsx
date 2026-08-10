import { PineRecord } from '../types';

interface TicketCardProps {
  record: PineRecord;
}

export function TicketCard({ record }: TicketCardProps) {
  const statusColors = {
    pending: 'bg-red-100 text-red-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700'
  };

  const statusText = {
    pending: '접수 완료 (Pending)',
    in_progress: '현장 출동 (In Progress)',
    completed: '방제 완료 (Completed)'
  };

  return (
    <div className="report-card bento-card p-3 flex gap-3 mb-0">
      <img
        src={record.image_url}
        alt="Report"
        className="w-[60px] h-[60px] object-cover rounded-lg bg-system-bg shrink-0"
      />
      <div className="flex-1">
        <div className="flex justify-between items-start mb-1">
          <p className="text-[11px] text-text-sub">
            {new Date(record.created_at).toLocaleDateString()}
          </p>
          <span className={`text-[10px] px-2 py-0.5 rounded-[10px] ${statusColors[record.status]}`}>
            {statusText[record.status]}
          </span>
        </div>
        <p className="text-[14px] font-semibold text-text-main mb-0.5">
          {record.phone_number.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')}
        </p>
        <p className="text-[11px] text-text-sub">
          {record.latitude != null && record.longitude != null
            ? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`
            : '좌표 정보 없음'}
        </p>
      </div>
    </div>
  );
}
