import {
  useMemo,
  useState,
} from 'react';
import { ScreenName } from '../types';
import { useSupabase } from '../hooks/useSupabase';
import { TicketCard } from '../components/TicketCard';
import {
  Trash2,
  RefreshCw,
} from 'lucide-react';

interface TicketsProps {
  navigate: (
    screen: ScreenName
  ) => void;

  isAuthenticated: boolean;

  onOpenRecord: (
    recordId: string
  ) => void;
}

export function Tickets({
  navigate: _navigate,
  isAuthenticated,
  onOpenRecord,
}: TicketsProps) {
  const {
    records,
    loading,
    fetchRecords,
    deleteRecord,
  } = useSupabase();

  const [
    deletingRecordId,
    setDeletingRecordId,
  ] = useState<string | null>(null);

  const visibleRecords =
    useMemo(() => {
      if (isAuthenticated) {
        return records;
      }

      try {
        const storedTokens =
          localStorage.getItem(
            'myReportTokens'
          );

        const myReportTokens:
          string[] = storedTokens
            ? JSON.parse(storedTokens)
            : [];

        if (
          myReportTokens.length === 0
        ) {
          return [];
        }

        return records.filter(
          record =>
            typeof record.report_token ===
              'string' &&
            myReportTokens.includes(
              record.report_token
            )
        );
      } catch (error) {
        console.error(
          '내 신고 토큰 조회 실패:',
          error
        );

        return [];
      }
    }, [
      records,
      isAuthenticated,
    ]);

  const handleDelete = async (
    recordId: string
  ) => {
    const confirmed =
      window.confirm(
        [
          '이 민원을 삭제하시겠습니까?',
          '',
          '삭제한 민원은 복구할 수 없습니다.',
        ].join('\n')
      );

    if (!confirmed) {
      return;
    }

    setDeletingRecordId(recordId);

    const success =
      await deleteRecord(recordId);

    setDeletingRecordId(null);

    if (!success) {
      window.alert(
        '민원을 삭제하지 못했습니다.'
      );
    }
  };

  return (
    <div className="h-full bg-system-bg flex flex-col">
      <div className="relative bg-card-bg p-4 pt-4 flex items-center border-b border-[rgba(0,0,0,0.04)] shadow-sm sticky top-0 z-10 shrink-0">
        <h1 className="text-xl font-bold text-text-main flex-1 text-center">
          {isAuthenticated
            ? '전체 민원'
            : '내 신고 내역'}
        </h1>

        <button
          type="button"
          onClick={() =>
            void fetchRecords()
          }
          disabled={loading}
          aria-label="민원 새로고침"
          className="absolute right-4 p-2 rounded-full text-text-sub hover:bg-system-bg disabled:opacity-50"
        >
          <RefreshCw
            size={19}
            className={
              loading
                ? 'animate-spin'
                : ''
            }
          />
        </button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1 pb-6">
        {visibleRecords.length === 0 ? (
          <div className="text-center text-text-sub mt-10">
            {loading
              ? '민원을 불러오는 중입니다.'
              : isAuthenticated
                ? '등록된 민원이 없습니다.'
                : '이 기기에서 신고한 민원이 없습니다.'}
          </div>
        ) : (
          visibleRecords.map(
            record => (
              <div
                key={record.id}
                className="space-y-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    onOpenRecord(
                      record.id
                    )
                  }
                  className="block w-full text-left rounded-2xl active:scale-[0.99] transition-transform"
                >
                  <TicketCard
                    record={record}
                  />
                </button>

                {isAuthenticated && (
                  <div className="flex justify-end px-1">
                    <button
                      type="button"
                      onClick={() =>
                        void handleDelete(
                          record.id
                        )
                      }
                      disabled={
                        deletingRecordId ===
                        record.id
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2
                        size={14}
                      />

                      {deletingRecordId ===
                      record.id
                        ? '삭제 중'
                        : '민원 삭제'}
                    </button>
                  </div>
                )}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}