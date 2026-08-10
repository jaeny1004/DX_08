export type RecordStatus = 'pending' | 'in_progress' | 'completed';

export interface PineRecord {
  id: string;
  created_at: string;
  latitude: number;
  longitude: number;
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