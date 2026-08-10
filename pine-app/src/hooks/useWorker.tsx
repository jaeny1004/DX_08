/*
 * 현장 요원 신원.
 *
 * 기존 로그인은 패스코드 1111 하나뿐이라 "누가 로그인했는지"가 없었다.
 * 그래서 웹이 배정한 작업을 앱이 골라낼 수 없었다.
 * 여기서 workforce_workers 목록을 읽어 요원을 고르게 하고,
 * 선택한 요원을 localStorage 에 남겨 다음 실행에도 유지한다.
 *
 * 별도 인증 체계를 만들지 않는다. 경진대회 시연 범위에서는
 * 패스코드 통과 후 본인을 선택하는 방식으로 충분하다.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { supabase } from './useSupabase';

const STORAGE_KEY = 'pineApp.workerId';

export interface WorkerProfile {
  workerId: string;
  workerName: string;
  organization: string;
  department: string;
  positionName: string;
  homeSidoName: string;
  homeSigunguName: string;
  baseLocationName: string;
}

function toProfile(row: any): WorkerProfile {
  return {
    workerId: String(row.worker_id ?? ''),
    workerName: String(row.worker_name ?? ''),
    organization: String(
      row.organization ?? '',
    ),
    department: String(row.department ?? ''),
    positionName: String(
      row.position_name ?? '',
    ),
    homeSidoName: String(
      row.home_sido_name ?? '',
    ),
    homeSigunguName: String(
      row.home_sigungu_name ?? '',
    ),
    baseLocationName: String(
      row.base_location_name ?? '',
    ),
  };
}

interface WorkerContextType {
  /** 현재 이 기기를 쓰는 요원. 아직 안 골랐으면 null */
  worker: WorkerProfile | null;

  /** 고를 수 있는 요원 목록 */
  candidates: WorkerProfile[];

  loading: boolean;

  /** 목록을 못 불러온 이유 (마이그레이션 전이면 안내 문구를 띄운다) */
  loadError: string | null;

  selectWorker: (workerId: string) => void;
  clearWorker: () => void;

  /** 시군구 이름으로 후보를 좁힌다 */
  searchCandidates: (
    keyword: string,
  ) => WorkerProfile[];
}

const WorkerContext = createContext<
  WorkerContextType | undefined
>(undefined);

export function WorkerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [candidates, setCandidates] = useState<
    WorkerProfile[]
  >([]);

  const [worker, setWorker] =
    useState<WorkerProfile | null>(null);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!supabase) {
        if (!cancelled) {
          setLoadError(
            'Supabase 연결이 없어 요원 목록을 불러올 수 없습니다.',
          );
          setLoading(false);
        }
        return;
      }

      /*
       * 914명 전체를 받으면 무겁다. 배정 가능한 요원만,
       * 이름순으로 상위 500명까지만 받는다.
       */
      const { data, error } = await supabase
        .from('workforce_workers')
        .select(
          'worker_id, worker_name, organization, department, ' +
            'position_name, home_sido_name, home_sigungu_name, ' +
            'base_location_name',
        )
        .eq('is_dispatchable', true)
        .order('worker_name', {
          ascending: true,
        })
        .limit(500);

      if (cancelled) {
        return;
      }

      if (error) {
        setLoadError(
          error.code === 'PGRST205'
            ? '요원 명단 테이블이 아직 없습니다. 012 마이그레이션을 먼저 적용해 주세요.'
            : `요원 목록을 불러오지 못했습니다. ${error.message}`,
        );
        setLoading(false);
        return;
      }

      const profiles = (data ?? []).map(
        toProfile,
      );
      setCandidates(profiles);

      /*
       * 지난 실행에서 고른 요원을 되살린다.
       */
      const savedId =
        localStorage.getItem(STORAGE_KEY);

      if (savedId) {
        const found = profiles.find(
          (item) =>
            item.workerId === savedId,
        );
        if (found) {
          setWorker(found);
        }
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectWorker = useCallback(
    (workerId: string) => {
      const found = candidates.find(
        (item) => item.workerId === workerId,
      );

      if (!found) {
        return;
      }

      localStorage.setItem(
        STORAGE_KEY,
        workerId,
      );
      setWorker(found);
    },
    [candidates],
  );

  const clearWorker = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setWorker(null);
  }, []);

  const searchCandidates = useCallback(
    (keyword: string) => {
      const query = keyword.trim();

      if (!query) {
        return candidates.slice(0, 50);
      }

      return candidates
        .filter(
          (item) =>
            item.workerName.includes(query) ||
            item.homeSigunguName.includes(
              query,
            ) ||
            item.organization.includes(query),
        )
        .slice(0, 50);
    },
    [candidates],
  );

  return React.createElement(
    WorkerContext.Provider,
    {
      value: {
        worker,
        candidates,
        loading,
        loadError,
        selectWorker,
        clearWorker,
        searchCandidates,
      },
    },
    children,
  );
}

export function useWorker() {
  const context = useContext(WorkerContext);

  if (!context) {
    throw new Error(
      'useWorker must be used within a WorkerProvider',
    );
  }

  return context;
}
