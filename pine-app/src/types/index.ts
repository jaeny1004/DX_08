export type RecordStatus = 'pending' | 'in_progress' | 'completed';

export interface PineRecord {
  id: string;
  created_at: string;

  /*
   * 위치를 못 잡는 경우가 있어 null 을 허용한다.
   * 실내이거나 위치 권한을 거부하면 예전에는 신고 접수 자체가 막혔는데,
   * 사진과 연락처만 있어도 일단 접수해 두는 편이 낫다.
   * 지도(LeafletMap)는 Number.isFinite 로 걸러 표시하므로 영향이 없다.
   */
  latitude: number | null;
  longitude: number | null;
  image_url: string;
  phone_number: string;
  status: RecordStatus;
  ai_probability?: number | null;
  ai_label?: string | null;
  ai_status?: string | null;
  report_token?: string | null;
}

export type ScreenName =
  | 'home'
  | 'login'
  | 'report'
  | 'field'
  | 'tracking'
  | 'chatbot'
  | 'settings'
  | 'tickets'
  /** 웹 대시보드에서 배정받은 작업 목록 */
  | 'mytasks';