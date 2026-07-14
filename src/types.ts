export interface IAScreen {
  No: string;
  depth1: string;
  depth2: string;
  screenId: string;
  name: string;
  definition: string;
}

export interface Requirement {
  reqId: string;
  name: string;
  screenId: string;
  detail: string;
  input: string;
  output: string;
  nfr: string;
  priority: "상" | "중" | "하";
}

export interface GridCell {
  id: string;
  region: string;
  x: number;
  y: number;
  riskScore: number;
  grade: "상" | "중" | "주의" | "하";
  pineDensity: number;
  elevation: number;
  temperature: number;
  precipitation: number;
  historyCount: number;
}

export interface TreeRecord {
  id: string;
  region: string;
  species: "소나무" | "해송" | "잣나무";
  confirmedDate: string;
  status: "예찰의심" | "현장확인" | "시료검사" | "확진완료" | "방제대기" | "방제중" | "방제완료" | "사후관리";
  severity: "경" | "중" | "심";
  x: number;
  y: number;
  inspector: string;
  photoUrl?: string;
  timeline: Array<{ stage: string; date: string; note: string; actor: string }>;
}

export interface WorkerStatus {
  id: string;
  name: string;
  region: string;
  status: "대기" | "출동" | "복귀";
  battery: number;
  progress: number;
  distance: string;
  lastActive: string;
}

export interface CrowdReport {
  id: string;
  title: string;
  region: string;
  reporter: string;
  date: string;
  status: "접수" | "검토" | "확진전환" | "반려";
  aiProbability: number;
  description: string;
  photoUrl?: string;

  latitude?: number;
  longitude?: number;
  phone_number?: string;
  created_at?: string;
}

export interface ControlTask {
  id: string;
  area: string;
  method: "훈증" | "파쇄" | "소각" | "나무주사" | "항공방제";
  status: "예정" | "진행" | "완료";
  company: string;
  workers: number;
  progress: number;
  startDate: string;
  endDate: string;
}

// 51 Screen Information Architecture Database
export const IA_DATA: IAScreen[] = [
  { No: "1", depth1: "공통 영역", depth2: "지역 필터 및 검색", screenId: "COM-001", name: "행정구역 선택 및 통합 검색", definition: "전국/시도/시군구 행정구역 드롭다운 필터, 키워드 통합 검색, 격자ID 직접 검색 기능" },
  { No: "2", depth1: "공통 영역", depth2: "실시간 통합 알림", screenId: "COM-002", name: "알림센터", definition: "긴급 확진목 발생 알림, 현장 요원 요청, 위험도 변동 로그 실시간 팝업 및 알림 이력 조회" },
  { No: "3", depth1: "공통 영역", depth2: "시스템 정보", screenId: "COM-003", name: "시스템 정보 표시", definition: "현재 시간, 로그인 관리자 정보, 세션 관리, 마지막 데이터 갱신 시각 표시" },
  { No: "4", depth1: "공통 영역", depth2: "오늘의 할일", screenId: "COM-004", name: "할일 티커", definition: "보고서 제출, 방제 추진 등 당일 할일을 모션 텍스트(티커)로 상단에 표시" },
  { No: "5", depth1: "공통 영역", depth2: "사용자 관리", screenId: "COM-005", name: "사용자 계정 관리", definition: "관리자/현장요원/읽기전용 등 권한별 계정 생성·수정·삭제, 비밀번호 초기화" },
  { No: "6", depth1: "공통 영역", depth2: "사용자 관리", screenId: "COM-006", name: "권한 및 역할 관리", definition: "메뉴별 접근 권한 설정, 역할(Role) 정의 및 사용자 매핑" },
  { No: "7", depth1: "공통 영역", depth2: "접근 로그", screenId: "COM-007", name: "시스템 접근 로그", definition: "로그인/로그아웃 이력, 주요 기능 사용 이력 조회 및 감사 추적" },
  { No: "8", depth1: "1. 통합 관제 (홈)", depth2: "GIS 위험도 지도", screenId: "HOM-001", name: "실시간 위험도 지도", definition: "전국 500m 격자 단위 위험도 Heatmap 시각화, 격자 클릭 시 위험점수·주요 원인·감염이력 팝업" },
  { No: "9", depth1: "1. 통합 관제 (홈)", depth2: "GIS 위험도 지도", screenId: "HOM-002", name: "시점 변경(Time-Lapse)", definition: "연도별 위험도 변화를 슬라이더로 재생, 확산 추이 시각적 확인" },
  { No: "10", depth1: "1. 통합 관제 (홈)", depth2: "오늘의 예찰 현황", screenId: "HOM-003", name: "예찰 현황 대시보드", definition: "금일 위험 지역 수, 현장 요원 출동 수, 드론 임무 수행·자율 출격 현황, 확진목 처리 상태 KPI 카드" },
  { No: "11", depth1: "1. 통합 관제 (홈)", depth2: "전국 종합 현황", screenId: "HOM-004", name: "종합 현황 KPI", definition: "실시간 감염 의심목 수, 금주 신규 제보 건수, 전체 방제 완료율, 시도별 방제 우선순위 등급 표시" },
  { No: "12", depth1: "1. 통합 관제 (홈)", depth2: "실시간 감지 추이", screenId: "HOM-005", name: "감지 로그 및 추이 차트", definition: "현장 감지 실시간 로그 목록, 주간/월별 제보·확진 추이 그래프(라인/바 차트)" },
  { No: "13", depth1: "1. 통합 관제 (홈)", depth2: "백서 기반 챗봇", screenId: "HOM-006", name: "AI 챗봇", definition: "재선충병 백서·매뉴얼 기반 질의응답, 대화 이력 저장, 관련 문서 링크 제공" },
  { No: "14", depth1: "2. 병해충 모니터링", depth2: "확진 모니터링", screenId: "MON-001", name: "확진목 현황 목록", definition: "확진목 위치, 감염 수종, 확진일, 처리상태 등 목록 조회 및 필터링" },
  { No: "15", depth1: "2. 병해충 모니터링", depth2: "확진 모니터링", screenId: "MON-002", name: "확진목 등록/수정", definition: "신규 확진목 위치(GPS/지도 클릭) 등록, 감염 수종·피해 정도·사진 첨부, 이력 수정" },
  { No: "16", depth1: "2. 병해충 모니터링", depth2: "확진 모니터링", screenId: "MON-003", name: "확진목 상세 이력", definition: "개별 확진목의 발견→확진→방제→사후관리 전 과정 타임라인 조회" },
  { No: "17", depth1: "2. 병해충 모니터링", depth2: "드론 이미지 분석", screenId: "MON-004", name: "드론 촬영 이미지 뷰어", definition: "드론 전송 멀티스펙트럴/열화상 이미지 표시, 촬영 일시·지점·고도 메타정보 조회" },
  { No: "18", depth1: "2. 병해충 모니터링", depth2: "드론 이미지 분석", screenId: "MON-005", name: "AI 감염 판독 결과", definition: "AI가 분석한 감염 의심 영역 하이라이트, 감염 확률 스코어, 판독 근거(NDVI 등) 표시" },
  { No: "19", depth1: "2. 병해충 모니터링", depth2: "실시간 감지 통계", screenId: "MON-006", name: "감지 빈도 분석", definition: "시간대별 감지 빈도 히트맵, 소나무/해송 등 수종별 감염 현황 통계 차트" },
  { No: "20", depth1: "2. 병해충 모니터링", depth2: "매개충 확산 예측", screenId: "MON-007", name: "매개충 이동 경로 시뮬레이션", definition: "바람길·기온 데이터 기반 솔수염·북방수염하늘소 이동 경로 및 확산 방향 애니메이션 시각화" },
  { No: "21", depth1: "2. 병해충 모니터링", depth2: "매개충 확산 예측", screenId: "MON-008", name: "선단지 확산 예측 지도", definition: "감염 선단지(최전방) 격자 식별, 향후 확산 예상 방향·범위 지도 표시" },
  { No: "22", depth1: "3. 현장 스마트 예찰", depth2: "현장 요원 관리", screenId: "FLD-001", name: "요원 GPS 실시간 추적", definition: "산악 지형 내 현장 조사 요원의 실시간 위치·동선 GPS 맵핑, 이동 경로 이력 조회" },
  { No: "23", depth1: "3. 현장 스마트 예찰", depth2: "현장 요원 관리", screenId: "FLD-002", name: "요원 출동 배정", definition: "위험 격자 기반 예찰 구역 자동 추천, 요원별 출동 일정 배정 및 상태(대기/출동/복귀) 관리" },
  { No: "24", depth1: "3. 현장 스마트 예찰", depth2: "현장 요원 관리", screenId: "FLD-003", name: "요원 활동 보고", definition: "현장 조사 결과 입력(사진, GPS, 체크리스트), 일일 활동 보고서 자동 생성" },
  { No: "25", depth1: "3. 현장 스마트 예찰", depth2: "크라우드 제보 관리", screenId: "FLD-004", name: "제보 현황 목록", definition: "시민·산주 모바일 접수 제보 목록, 접수일·위치·상태(접수/검토/확진/반려) 필터링" },
  { No: "26", depth1: "3. 현장 스마트 예찰", depth2: "크라우드 제보 관리", screenId: "FLD-005", name: "제보 상세 보기", definition: "개별 제보 클릭 시 현장 사진, AI 감염 확률 피드백, 체크리스트, 처리 이력 상세 조회" },
  { No: "27", depth1: "3. 현장 스마트 예찰", depth2: "크라우드 제보 관리", screenId: "FLD-006", name: "제보 처리 및 피드백", definition: "제보 검토 결과 입력, 제보자에게 처리 결과 알림 발송, 확진 전환 처리" },
  { No: "28", depth1: "3. 현장 스마트 예찰", depth2: "드론 예찰 관리", screenId: "FLD-007", name: "드론 임무 계획", definition: "예찰 대상 구역 지정, 비행 경로 설정, 드론 자율 출격 스케줄 관리" },
  { No: "29", depth1: "3. 현장 스마트 예찰", depth2: "드론 예찰 관리", screenId: "FLD-008", name: "드론 운용 현황", definition: "운용 중인 드론 실시간 위치, 배터리 상태, 촬영 진행률, 임무 완료 현황 모니터링" },
  { No: "30", depth1: "4. 방제 관리", depth2: "방제 작업 현황", screenId: "CTR-001", name: "방제 구역 현황 지도", definition: "진행 중인 방제 구역 GIS 표시, 작업 종류(훈증/파쇄/벌채/항공방제)별 색상 구분" },
  { No: "31", depth1: "4. 방제 관리", depth2: "방제 작업 현황", screenId: "CTR-002", name: "방제 작업 목록", definition: "구역별 작업 상태(예정/진행/완료), 담당 업체, 투입 인력, 진척률 목록 조회" },
  { No: "32", "대메뉴": "4. 방제 관리", "중메뉴": "방제 작업 현황", "화면ID": "CTR-003", "화면명": "방제 작업 등록/수정", "화면 기능 정의": "신규 방제 작업 등록(구역 지정, 작업 종류, 일정, 담당자), 기존 작업 수정·완료 처리", "groupKey": "control" },
  { "No": "33", "대메뉴": "4. 방제 관리", "중메뉴": "방제 시뮬레이션", "화면ID": "CTR-004", "화면명": "확산 차단 시뮬레이션", "화면 기능 정의": "디지털 트윈 기반 예산/인력 투입 규모별 확산 차단 효과 시뮬레이션 및 비교 시나리오 뷰", "groupKey": "control" },
  { "No": "34", "대메뉴": "4. 방제 관리", "중메뉴": "방제 시뮬레이션", "화면ID": "CTR-005", "화면명": "방제 효과 분석", "화면 기능 정의": "과거 방제 구역의 사후 감염 추이 분석, 방제 방법별 효과 비교 차트", "groupKey": "control" },
  { "No": "35", "대메뉴": "4. 방제 관리", "중메뉴": "자원 관리", "화면ID": "CTR-006", "화면명": "약제/장비 현황", "화면 기능 정의": "방제 약제 재고, 장비(파쇄기/훈증천막 등) 가용 현황, 소모량 추이 대시보드", "groupKey": "control" },
  { "No": "36", "대메뉴": "4. 방제 관리", "중메뉴": "자원 관리", "화면ID": "CTR-007", "화면명": "인력 투입 현황", "화면 기능 정의": "방제 업체별·구역별 투입 인력 현황, 일별 투입 인원 추이 차트", "groupKey": "control" },
  { "No": "37", "대메뉴": "4. 방제 관리", "중메뉴": "방제 우선순위", "화면ID": "CTR-008", "화면명": "방제 우선순위 산정", "화면 기능 정의": "AI 위험점수 + 접근성 + 소나무 밀집도 등 기준으로 방제 우선순위 자동 산정 및 수동 조정", "groupKey": "control" },
  { "No": "38", "대메뉴": "5. 행정 지원 (통계/리포트)", "중메뉴": "보고서 관리", "화면ID": "ADM-001", "화면명": "보고서 처리 현황", "화면 기능 정의": "결재·발송 대기 중인 행정 문서 현황판, 처리 기한 알림", "groupKey": "admin" },
  { "No": "39", "대메뉴": "5. 행정 지원 (통계/리포트)", "중메뉴": "보고서 관리", "화면ID": "ADM-002", "화면명": "보고서 자동 생성", "화면 기능 정의": "연도별/기간별/지역별 발생 현황·방제 실적 기반 보고서(HWP, PDF, Excel) 원클릭 생성 및 미리보기", "groupKey": "admin" },
  { "No": "40", "대메뉴": "5. 행정 지원 (통계/리포트)", "중메뉴": "보고서 관리", "화면ID": "ADM-003", "화면명": "보고서 이력 관리", "화면 기능 정의": "생성된 보고서 이력 조회, 버전 관리, 재생성 및 다운로드", "groupKey": "admin" },
  { "No": "41", "대메뉴": "5. 행정 지원 (통계/리포트)", "중메뉴": "수종전환 추천", "화면ID": "ADM-004", "화면명": "AI 수종전환 분석", "화면 기능 정의": "피해 극심 지역의 기후·지형 적합 수종 AI 분석, 수종전환 조림 사업계획서 초안 자동 작성", "groupKey": "admin" },
  { "No": "42", "대메뉴": "5. 행정 지원 (통계/리포트)", "중메뉴": "수종전환 추천", "화면ID": "ADM-005", "화면명": "수종전환 공간 배치", "화면 기능 정의": "추천 수종의 지도 기반 공간 배치 시각화, 면적·예산 산출", "groupKey": "admin" },
  { "No": "43", "대메뉴": "5. 행정 지원 (통계/리포트)", "중메뉴": "통계 조회", "화면ID": "ADM-006", "화면명": "발생 통계 대시보드", "화면 기능 정의": "연도별/시도별/수종별 감염 발생 추이, 전년 대비 증감률, 다축 비교 차트", "groupKey": "admin" },
  { "No": "44", "대메뉴": "5. 행정 지원 (통계/리포트)", "중메뉴": "통계 조회", "화면ID": "ADM-007", "화면명": "방제 실적 통계", "화면 기능 정의": "방제 방법별/지역별/기간별 실적 집계, 목표 대비 달성률 차트", "groupKey": "admin" },
  { "No": "45", "대메뉴": "6. 시스템 관리", "중메뉴": "데이터 관리", "화면ID": "SYS-001", "화면명": "데이터 업로드", "화면 기능 정의": "병해충 발생 CSV, 드론 이미지, 기후 데이터 등 원천 데이터 업로드 및 검증", "groupKey": "system" },
  { "No": "46", "대메뉴": "6. 시스템 관리", "중메뉴": "데이터 관리", "화면ID": "SYS-002", "화면명": "데이터 갱신 이력", "화면 기능 정의": "데이터 업로드·갱신 이력 조회, 갱신 전후 변경 건수 요약", "groupKey": "system" },
  { "No": "47", "대메뉴": "6. 시스템 관리", "중메뉴": "모델 관리", "화면ID": "SYS-003", "화면명": "모델 버전 관리", "화면 기능 정의": "XGBoost 모델 버전별 성능(PR-AUC, Top-K 포착률) 비교, 운영 모델 전환", "groupKey": "system" },
  { "No": "48", "대메뉴": "6. 시스템 관리", "중메뉴": "모델 관리", "화면ID": "SYS-004", "화면명": "모델 재학습 실행", "화면 기능 정의": "월별/분기별 배치 재학습 실행, 학습 로그 및 결과 리포트 조회", "groupKey": "system" },
  { "No": "49", "대메뉴": "6. 시스템 관리", "중메뉴": "모델 관리", "화면ID": "SYS-005", "화면명": "SHAP 피처 중요도 뷰어", "화면 기능 정의": "모델별 SHAP 피처 중요도 시각화, 버전 간 피처 영향도 변화 비교", "groupKey": "system" },
  { "No": "50", "대메뉴": "6. 시스템 관리", "중메뉴": "코드 테이블 관리", "화면ID": "SYS-006", "화면명": "코드 테이블 관리", "화면 기능 정의": "수종 코드, 행정구역 코드, 방제 유형 코드 등 시스템 코드 조회·추가·수정", "groupKey": "system" },
  { "No": "51", "대메뉴": "6. 시스템 관리", "중메뉴": "API 관리", "화면ID": "SYS-007", "화면명": "외부 연동 현황", "화면 기능 정의": "기상청 API, 산림청 API, 드론 시스템 등 외부 연동 상태 모니터링 및 오류 로그", "groupKey": "system" }
].map((item) => ({
  No: item.No,
  depth1: item.대메뉴 || item.depth1 || "공통 영역",
  depth2: item.중메뉴 || item.depth2 || "",
  screenId: item.화면ID || item.screenId || "",
  name: item.화면명 || item.name || "",
  definition: item["화면 기능 정의"] || item.definition || "",
}));

// 51 Requirements Database matching 1-to-1 with IA
export const REQUIREMENTS_DATA: Requirement[] = [
  { reqId: "FR-COM-001", name: "행정구역 필터링", screenId: "COM-001", detail: "전국/시도/시군구 3단계 행정구역 드롭다운 선택 시 전체 화면 데이터가 해당 지역으로 필터링된다. 격자ID 직접 검색을 지원한다.", input: "행정구역 코드, 검색 키워드", output: "필터링된 지도·목록·통계 데이터", nfr: "필터 전환 응답시간 2초 이내", priority: "상" },
  { reqId: "FR-COM-002", name: "실시간 알림 수신", screenId: "COM-002", detail: "긴급 확진목 발생, 현장 요원 요청, 위험도 등급 변동 시 실시간 팝업 알림을 표시하고 알림 이력을 조회할 수 있다.", input: "이벤트 발생 데이터", output: "알림 팝업, 알림 이력 목록", nfr: "알림 지연 5초 이내, SSE/WebSocket 지원", priority: "상" },
  { reqId: "FR-COM-003", name: "시스템 정보 표시", screenId: "COM-003", detail: "현재 시간, 로그인 관리자 정보, 세션 유효시간, 마지막 데이터 갱신 시각을 상단에 상시 표시한다.", input: "세션 정보, 서버 시간", output: "상단 정보 영역", nfr: "세션 타임아웃 30분, 자동 갱신", priority: "중" },
  { reqId: "FR-COM-004", name: "오늘의 할일 티커", screenId: "COM-004", detail: "당일 예정된 보고서 제출, 방제 작업, 예찰 일정을 모션 텍스트(티커)로 상단에 흐르듯 표시한다.", input: "일정 데이터, 업무 목록", output: "모션 텍스트 티커 영역", nfr: "CSS 애니메이션 기반, 일시정지 가능", priority: "하" },
  { reqId: "FR-COM-005", name: "사용자 계정 관리", screenId: "COM-005", detail: "관리자/현장요원/읽기전용 등 권한별 계정을 생성·수정·삭제하고 비밀번호를 초기화한다.", input: "사용자 정보", output: "계정 목록, 처리 결과", nfr: "비밀번호 암호화 저장", priority: "상" },
  { reqId: "FR-COM-006", name: "권한 및 역할 관리", screenId: "COM-006", detail: "메뉴별 접근 권한을 설정하고 역할(Role)을 정의하여 사용자에 매핑한다.", input: "역할 정의, 메뉴 목록", output: "권한 매트릭스", nfr: "RBAC 기반 접근 제어", priority: "상" },
  { reqId: "FR-COM-007", name: "접근 로그 조회", screenId: "COM-007", detail: "로그인/로그아웃 이력 및 주요 기능 사용 이력을 조회하여 감사 추적을 지원한다.", input: "접근 로그 데이터", output: "로그 목록, 필터링·엑셀 다운로드", nfr: "로그 보관 1년 이상", priority: "중" },
  { reqId: "FR-HOM-001", name: "위험도 Heatmap 표시", screenId: "HOM-001", detail: "전국 500m 격자 단위로 AI 위험점수 기반 Heatmap을 GIS 지도 위에 렌더링한다. 격자 클릭 시 위험점수, 주요 원인(SHAP), 감염 이력을 팝업으로 표시한다.", input: "격자별 risk_score, SHAP 값", output: "GIS Heatmap, 격자 상세 팝업", nfr: "37만 격자 렌더링 시 5초 이내", priority: "상" },
  { reqId: "FR-HOM-002", name: "시점 변경 슬라이더", screenId: "HOM-002", detail: "연도별(2016~최신) 위험도 변화를 슬라이더로 재생하여 확산 추이를 시각적으로 확인한다.", input: "연도별 격자 위험점수", output: "Time-Lapse 애니메이션", nfr: "슬라이더 전환 시 1초 이내 렌더링", priority: "중" },
  { reqId: "FR-HOM-003", name: "예찰 현황 KPI 표시", screenId: "HOM-003", detail: "금일 위험 지역 수, 현장 요원 출동 수, 드론 임무 수행 현황, 확진목 처리 상태를 KPI 카드로 표시한다.", input: "당일 예찰 데이터", output: "KPI 카드 4~6개", nfr: "실시간 갱신(1분 주기)", priority: "상" },
  { reqId: "FR-HOM-004", name: "전국 종합 KPI", screenId: "HOM-004", detail: "감염 의심목 수, 신규 제보 건수, 방제 완료율, 시도별 방제 우선순위 등급을 종합 현황으로 표시한다.", input: "감염·제보·방제 집계 데이터", output: "KPI 카드, 시도별 등급 테이블", nfr: "일 1회 이상 갱신", priority: "상" },
  { reqId: "FR-HOM-005", name: "감지 로그 및 추이", screenId: "HOM-005", detail: "현장 감지 실시간 로그를 목록으로 표시하고, 주간/월별 제보·확진 추이를 그래프로 시각화한다.", input: "감지 로그, 제보·확진 집계", output: "로그 목록, 라인/바 차트", nfr: "최근 100건 실시간 스트리밍", priority: "중" },
  { reqId: "FR-HOM-006", name: "백서 기반 AI 챗봇", screenId: "HOM-006", detail: "재선충병 백서·매뉴얼을 학습한 AI가 사용자 질의에 응답하고, 관련 문서 링크를 제공한다. 대화 이력을 저장한다.", input: "사용자 질의, 백서 문서", output: "AI 응답, 문서 링크, 대화 이력", nfr: "응답 지연 5초 이내, RAG 기반", priority: "중" },
  { reqId: "FR-MON-001", name: "확진목 현황 조회", screenId: "MON-001", detail: "확진목의 위치, 감염 수종, 확진일, 처리 상태 등을 목록으로 조회하고 지역·기간·상태별 필터링을 지원한다.", input: "확진목 DB", output: "목록 테이블, 필터, 페이징", nfr: "1만 건 이상 페이징 처리", priority: "상" },
  { reqId: "FR-MON-002", name: "확진목 등록/수정", screenId: "MON-002", detail: "신규 확진목을 GPS 좌표 또는 지도 클릭으로 등록하고 감염 수종, 피해 정도, 현장 사진을 첨부한다. 기존 건을 수정한다.", input: "GPS 좌표, 사진, 수종 정보", output: "등록 완료 알림, DB 반영", nfr: "EPSG:5186 좌표 자동 변환", priority: "상" },
  { reqId: "FR-MON-003", name: "확진목 이력 타임라인", screenId: "MON-003", detail: "개별 확진목의 발견→확진→방제→사후관리 전 과정을 타임라인 UI로 표시한다.", input: "확진목 이력 데이터", output: "타임라인 뷰", nfr: "단계별 담당자·일시·사진 포함", priority: "중" },
  { reqId: "FR-MON-004", name: "드론 이미지 뷰어", screenId: "MON-004", detail: "드론이 전송한 멀티스펙트럴/열화상 이미지를 표시하고 촬영 일시, 지점, 고도 메타정보를 조회한다.", input: "드론 이미지, 메타데이터", output: "이미지 뷰어, 메타정보 패널", nfr: "고해상도 이미지 타일링 지원", priority: "상" },
  { reqId: "FR-MON-005", name: "AI 감염 판독", screenId: "MON-005", detail: "드론 이미지에서 AI가 감염 의심 영역을 하이라이트하고, 감염 확률 스코어와 판독 근거(NDVI 변화 등)를 표시한다.", input: "드론 이미지", output: "감염 영역 오버레이, 확률 스코어", nfr: "추론 시간 10초 이내/이미지", priority: "상" },
  { reqId: "FR-MON-006", name: "감지 빈도 분석", screenId: "MON-006", detail: "시간대별 감지 빈도를 히트맵으로, 수종별 감염 현황을 통계 차트로 시각화한다.", input: "감지 로그 데이터", output: "히트맵, 파이/바 차트", nfr: "기간 필터 적용 가능", priority: "중" },
  { reqId: "FR-MON-007", name: "매개충 이동 시뮬레이션", screenId: "MON-007", detail: "바람길·기온 데이터를 기반으로 솔수염·북방수염하늘소의 이동 경로를 시뮬레이션하고 애니메이션으로 시각화한다.", input: "풍향·풍속, 기온, 감염 위치", output: "이동 경로 애니메이션", nfr: "시뮬레이션 파라미터 조정 가능", priority: "중" },
  { reqId: "FR-MON-008", name: "선단지 확산 예측", screenId: "MON-008", detail: "감염 선단지(최전방) 격자를 식별하고 향후 확산 예상 방향·범위를 지도에 표시한다.", input: "감염 격자, 모델 예측 결과", output: "선단지 표시, 확산 예상 영역", nfr: "월 1회 이상 갱신", priority: "중" },
  { reqId: "FR-FLD-001", name: "요원 GPS 실시간 추적", screenId: "FLD-001", detail: "산악 지형 내 현장 요원의 실시간 위치를 GPS로 수신하여 지도에 표시하고 이동 경로 이력을 조회한다.", input: "요원 GPS 데이터", output: "지도 마커, 동선 폴리라인", nfr: "GPS 갱신 주기 30초, 오프라인 버퍼링", priority: "상" },
  { reqId: "FR-FLD-002", name: "예찰 구역 자동 배정", screenId: "FLD-002", detail: "AI 위험점수 기반으로 예찰 구역을 자동 추천하고, 요원별 출동 일정을 배정하며 상태(대기/출동/복귀)를 관리한다.", input: "위험점수, 요원 목록", output: "추천 구역, 배정 현황", nfr: "거리·위험도 가중 최적 배정 알고리즘", priority: "상" },
  { reqId: "FR-FLD-003", name: "요원 활동 보고", screenId: "FLD-003", detail: "현장 조사 결과(사진, GPS, 체크리스트)를 입력하고 일일 활동 보고서를 자동 생성한다.", input: "조사 결과 입력 데이터", output: "활동 보고서(PDF)", nfr: "모바일 입력 지원", priority: "중" },
  { reqId: "FR-FLD-004", name: "제보 현황 목록", screenId: "FLD-004", detail: "시민·산주가 모바일로 접수한 제보를 목록으로 조회하고 접수일·위치·상태별로 필터링한다.", input: "제보 데이터", output: "제보 목록, 필터", nfr: "상태: 접수/검토/확진/반려", priority: "상" },
  { reqId: "FR-FLD-005", name: "제보 상세 보기", screenId: "FLD-005", detail: "개별 제보 클릭 시 현장 사진, AI 감염 확률, 체크리스트, 처리 이력을 상세 조회한다.", input: "제보 상세 데이터", output: "상세 뷰 패널", nfr: "이미지 확대·회전 지원", priority: "중" },
  { reqId: "FR-FLD-006", name: "제보 처리 및 피드백", screenId: "FLD-006", detail: "제보 검토 결과를 입력하고, 제보자에게 처리 결과 알림을 발송하며, 확진 전환 처리를 수행한다.", input: "검토 결과", output: "알림 발송, 상태 변경", nfr: "제보자 SMS/푸시 알림 연동", priority: "중" },
  { reqId: "FR-FLD-007", name: "드론 임무 계획", screenId: "FLD-007", detail: "예찰 대상 구역을 지정하고 비행 경로를 설정하며 드론 자율 출격 스케줄을 관리한다.", input: "구역 지정, 비행 파라미터", output: "비행 계획서, 스케줄", nfr: "기상 조건 연동 자동 취소", priority: "중" },
  { reqId: "FR-FLD-008", name: "드론 운용 현황", screenId: "FLD-008", detail: "운용 중인 드론의 실시간 위치, 배터리 상태, 촬영 진행률, 임무 완료 현황을 모니터링한다.", input: "드론 텔레메트리", output: "드론 상태 대시보드", nfr: "배터리 20% 이하 자동 경고", priority: "중" },
  { reqId: "FR-CTR-001", name: "방제 구역 현황 지도", screenId: "CTR-001", detail: "진행 중인 방제 구역을 GIS 지도에 표시하고, 작업 종류(훈증/파쇄/벌채/항공방제)별로 색상을 구분한다.", input: "방제 구역 폴리곤, 작업 유형", output: "GIS 레이어 오버레이", nfr: "구역 폴리곤 편집 지원", priority: "상" },
  { reqId: "FR-CTR-002", name: "방제 작업 목록", screenId: "CTR-002", detail: "구역별 작업 상태(예정/진행/완료), 담당 업체, 투입 인력, 진척률을 목록으로 조회한다.", input: "방제 작업 데이터", output: "작업 목록, 진척률 게이지", nfr: "상태 변경 시 알림 발송", priority: "상" },
  { reqId: "FR-CTR-003", name: "방제 작업 등록/수정", screenId: "CTR-003", detail: "신규 방제 작업을 등록(구역 지정, 작업 종류, 일정, 담당자)하고 기존 작업을 수정·완료 처리한다.", input: "작업 정보 입력", output: "등록 완료, DB 반영", nfr: "구역 중복 검증", priority: "상" },
  { reqId: "FR-CTR-004", name: "확산 차단 시뮬레이션", screenId: "CTR-004", detail: "디지털 트윈 기반으로 예산/인력 투입 규모별 확산 차단 효과를 시뮬레이션하고 복수 시나리오를 비교한다.", input: "예산, 인력, 감염 데이터", output: "시뮬레이션 결과 비교 뷰", nfr: "시나리오 최대 5개 동시 비교", priority: "중" },
  { reqId: "FR-CTR-005", name: "방제 효과 분석", screenId: "CTR-005", detail: "과거 방제 구역의 사후 감염 추이를 분석하고, 방제 방법별 효과를 비교 차트로 시각화한다.", input: "방제 이력, 사후 감염 데이터", output: "효과 비교 차트, 통계 요약", nfr: "연도별 추이 비교 지원", priority: "중" },
  { reqId: "FR-CTR-006", name: "약제/장비 현황", screenId: "CTR-006", detail: "방제 약제 재고, 장비 가용 현황, 소모량 추이를 대시보드로 표시한다.", input: "자원 재고 데이터", output: "재고 현황, 소모 추이 차트", nfr: "재고 부족 시 자동 경고", priority: "중" },
  { reqId: "FR-CTR-007", name: "인력 투입 현황", screenId: "CTR-007", detail: "방제 업체별·구역별 투입 인력 현황과 일별 투입 인원 추이를 차트로 표시한다.", input: "인력 투입 데이터", output: "인력 현황 테이블, 추이 차트", nfr: "업체별 계약 인원 대비 표시", priority: "하" },
  { reqId: "FR-CTR-008", name: "방제 우선순위 산정", screenId: "CTR-008", detail: "AI 위험점수, 접근성, 소나무 밀집도 등을 기준으로 방제 우선순위를 자동 산정하고 수동 조정을 지원한다.", input: "위험점수, 접근성, 소나무 면적", output: "우선순위 랭킹, 조정 이력", nfr: "산정 기준 가중치 설정 가능", priority: "상" },
  { reqId: "FR-ADM-001", name: "보고서 처리 현황", screenId: "ADM-001", detail: "결재·발송 대기 중인 행정 문서를 현황판으로 표시하고 처리 기한 초과 시 알림을 발송한다.", input: "문서 상태 데이터", output: "현황판, 기한 알림", nfr: "기한 D-3/D-1/당일 단계별 알림", priority: "중" },
  { reqId: "FR-ADM-002", name: "보고서 자동 생성", screenId: "ADM-002", detail: "연도별/기간별/지역별 발생 현황 및 방제 실적 데이터를 기반으로 보고서(HWP, PDF, Excel)를 원클릭 생성하고 미리보기한다.", input: "기간·지역 조건, 통계 데이터", output: "보고서 파일, 미리보기", nfr: "템플릿 기반 생성, 3개 포맷 지원", priority: "상" },
  { reqId: "FR-ADM-003", name: "보고서 이력 관리", screenId: "ADM-003", detail: "생성된 보고서의 이력을 조회하고, 버전 관리, 재생성 및 다운로드를 지원한다.", input: "보고서 이력 데이터", output: "이력 목록, 파일 다운로드", nfr: "버전별 비교 기능", priority: "하" },
  { reqId: "FR-ADM-004", name: "AI 수종전환 분석", screenId: "ADM-004", detail: "피해 극심 지역의 기후·지형 데이터를 생성형 AI가 분석하여 적합 수종을 추천하고, 수종전환 조림 사업계획서 초안을 자동 작성한다.", input: "기후, 지형, 피해 지역 데이터", output: "추천 수종, 사업계획서 초안", nfr: "생성형 AI 기반, 수정 가능", priority: "중" },
  { reqId: "FR-ADM-005", name: "수종전환 공간 배치", screenId: "ADM-005", detail: "추천 수종의 지도 기반 공간 배치를 시각화하고, 면적 및 예산을 산출한다.", input: "추천 수종, 구역 폴리곤", output: "배치 지도, 면적·예산 산출", nfr: "드래그 앤 드롭 구역 편집", priority: "하" },
  { reqId: "FR-ADM-006", name: "발생 통계 대시보드", screenId: "ADM-006", detail: "연도별/시도별/수종별 감염 발생 추이, 전년 대비 증감률을 다축 비교 차트로 시각화한다.", input: "감염 발생 집계 데이터", output: "추이 차트, 증감률 테이블", nfr: "차트 유형 전환(라인/바/파이)", priority: "중" },
  { reqId: "FR-ADM-007", name: "방제 실적 통계", screenId: "ADM-007", detail: "방제 방법별/지역별/기간별 실적을 집계하고, 목표 대비 달성률을 차트로 표시한다.", input: "방제 실적 데이터", output: "실적 집계, 달성률 차트", nfr: "엑셀 다운로드 지원", priority: "중" },
  { reqId: "FR-SYS-001", name: "데이터 업로드", screenId: "SYS-001", detail: "병해충 발생 CSV, 드론 이미지, 기후 데이터 등 원천 데이터를 업로드하고 포맷·좌표계 검증을 수행한다.", input: "CSV, 이미지, 기후 파일", output: "업로드 결과, 검증 리포트", nfr: "EPSG:5186 자동 검증, 100MB 이하", priority: "상" },
  { reqId: "FR-SYS-002", name: "데이터 갱신 이력", screenId: "SYS-002", detail: "데이터 업로드·갱신 이력을 조회하고, 갱신 전후 변경 건수를 요약한다.", input: "갱신 로그 데이터", output: "이력 목록, 변경 요약", nfr: "롤백 기능 지원", priority: "중" },
  { reqId: "FR-SYS-003", name: "모델 버전 관리", screenId: "SYS-003", detail: "XGBoost 모델 버전별 성능(PR-AUC, Top-K 포착률)을 비교하고, 운영 모델을 전환한다.", input: "모델 메타데이터, 성능 지표", output: "버전 비교 테이블, 전환 버튼", nfr: "전환 시 이전 버전 자동 백업", priority: "상" },
  { reqId: "FR-SYS-004", name: "모델 재학습 실행", screenId: "SYS-004", detail: "월별/분기별 배치 재학습을 실행하고, 학습 로그 및 결과 리포트를 조회한다.", input: "학습 데이터, 하이퍼파라미터", output: "학습 로그, 성능 리포트", nfr: "백그라운드 실행, 완료 알림", priority: "상" },
  { reqId: "FR-SYS-005", name: "SHAP 피처 중요도 뷰어", screenId: "SYS-005", detail: "모델별 SHAP 피처 중요도를 시각화하고, 버전 간 피처 영향도 변화를 비교한다.", input: "SHAP 값, 모델 버전", output: "피처 중요도 차트, 버전 비교", nfr: "Summary/Force/Dependence Plot 지원", priority: "중" },
  { reqId: "FR-SYS-006", name: "코드 테이블 관리", screenId: "SYS-006", detail: "수종 코드, 행정구역 코드, 방제 유형 코드 등 시스템 코드를 조회·추가·수정한다.", input: "코드 데이터", output: "코드 목록, 편집 폼", nfr: "변경 이력 자동 기록", priority: "하" },
  { reqId: "FR-SYS-007", name: "외부 연동 현황", screenId: "SYS-007", detail: "기상청 API, 산림청 API, 드론 시스템 등 외부 연동 상태 모니터링하고 오류 로그를 조회한다.", input: "API 상태, 오류 로그", output: "연동 상태 대시보드", nfr: "헬스체크 1분 주기, 장애 알림", priority: "상" }
];

// Rich Seed Data Generators
export const initialGrids: GridCell[] = [
  { id: "GRID-3629", region: "경북 포항시 북구 죽장면", x: 62, y: 35, riskScore: 0.942, grade: "상", pineDensity: 88, elevation: 340, temperature: 24.5, precipitation: 82, historyCount: 14 },
  { id: "GRID-3631", region: "경북 포항시 북구 기계면", x: 66, y: 38, riskScore: 0.812, grade: "상", pineDensity: 75, elevation: 180, temperature: 25.1, precipitation: 90, historyCount: 8 },
  { id: "GRID-1240", region: "경남 밀양시 산내면", x: 52, y: 55, riskScore: 0.865, grade: "상", pineDensity: 81, elevation: 420, temperature: 23.8, precipitation: 75, historyCount: 19 },
  { id: "GRID-2041", region: "전남 순천시 승주읍", x: 28, y: 68, riskScore: 0.741, grade: "상", pineDensity: 68, elevation: 210, temperature: 24.9, precipitation: 110, historyCount: 11 },
  { id: "GRID-5092", region: "강원 원주시 신림면", x: 50, y: 15, riskScore: 0.612, grade: "중", pineDensity: 72, elevation: 510, temperature: 21.4, precipitation: 130, historyCount: 5 },
  { id: "GRID-1123", region: "충남 공주시 계룡면", x: 22, y: 39, riskScore: 0.584, grade: "중", pineDensity: 64, elevation: 260, temperature: 23.9, precipitation: 95, historyCount: 4 },
  { id: "GRID-4491", region: "전북 남원시 아영면", x: 34, y: 58, riskScore: 0.385, grade: "주의", pineDensity: 55, elevation: 380, temperature: 22.8, precipitation: 115, historyCount: 3 },
  { id: "GRID-8290", region: "충북 제천시 백운면", x: 44, y: 22, riskScore: 0.294, grade: "주의", pineDensity: 59, elevation: 460, temperature: 21.9, precipitation: 120, historyCount: 2 },
  { id: "GRID-9104", region: "경기 포천시 이동면", x: 38, y: 8, riskScore: 0.124, grade: "하", pineDensity: 42, elevation: 620, temperature: 20.1, precipitation: 140, historyCount: 0 },
  { id: "GRID-0451", region: "제주 서귀포시 안덕면", x: 24, y: 92, riskScore: 0.045, grade: "하", pineDensity: 30, elevation: 120, temperature: 26.2, precipitation: 180, historyCount: 1 },
];

export const initialTrees: TreeRecord[] = [
  {
    id: "PT-2026-0712",
    region: "경북 포항시 북구 죽장면 산42",
    species: "소나무",
    confirmedDate: "2026-07-06",
    status: "방제대기",
    severity: "심",
    x: 62.4,
    y: 35.2,
    inspector: "김지원",
    timeline: [
      { stage: "AI 드론 판독 (MON-005)", date: "2026-07-01 09:12", note: "드론 열화상 및 NDVI 식생지수 급감 감지. 감염 확률 92%", actor: "AI 분석기" },
      { stage: "현장 확인 배정 (FLD-002)", date: "2026-07-03 14:00", note: "포항북구 예찰 2팀 출동 배정", actor: "박예찰" },
      { stage: "시료 검사 (MON-002)", date: "2026-07-05 11:30", note: "목질부 칩 시료 채취 완료 및 현장 사진 등록", actor: "박예찰" },
      { stage: "확진 등록", date: "2026-07-06 16:45", note: "PCR 검사 결과 소나무재선충 검출 (확진 판정)", actor: "산림환경연구소" },
    ],
  },
  {
    id: "PT-2026-0711",
    region: "경남 밀양시 산내면 삼양리 산5",
    species: "해송",
    confirmedDate: "2026-07-04",
    status: "방제중",
    severity: "중",
    x: 52.1,
    y: 55.4,
    inspector: "이현장",
    timeline: [
      { stage: "시민 제보 접수 (FLD-004)", date: "2026-06-28 15:30", note: "등산객에 의한 수관부 적갈색 변색 고사목 발견 제보", actor: "홍길동(시민)" },
      { stage: "현장 검토", date: "2026-06-30 11:00", note: "송진 분비 중단 및 솔수염하늘소 산란흔 발견", actor: "이현장" },
      { stage: "확진 및 훈증 명령", date: "2026-07-04 10:20", note: "국립산림과학원 최종 확진에 따른 훈증 구역 설정", actor: "밀양시청 산림과" },
    ],
  },
  {
    id: "PT-2026-0708",
    region: "전남 순천시 승주읍 죽학리 산12",
    species: "소나무",
    confirmedDate: "2026-07-01",
    status: "방제완료",
    severity: "경",
    x: 28.3,
    y: 68.1,
    inspector: "최산림",
    timeline: [
      { stage: "AI 예찰 경보", date: "2026-06-25 08:00", note: "인접 격자 확산으로 인한 위험 점수 0.74 돌파 경보", actor: "AI 예측 시스템" },
      { stage: "현장 시료 채취", date: "2026-06-27 13:40", note: "나무 기둥 천공 시료 확보", actor: "최산림" },
      { stage: "방제 작업 완료", date: "2026-07-07 15:00", note: "벌채 후 대형 파쇄기 동원 1.2cm 미만 완전 파쇄 완료", actor: "동해방제(주)" },
    ],
  },
];

export const initialWorkers: WorkerStatus[] = [
  { id: "W-101", name: "김예찰", region: "경북 포항 죽장면", status: "출동", battery: 94, progress: 75, distance: "1.2km", lastActive: "14:32" },
  { id: "W-102", name: "박조사", region: "경남 밀양 산내면", status: "출동", battery: 82, progress: 40, distance: "3.4km", lastActive: "14:29" },
  { id: "W-103", name: "이요원", region: "전남 순천 승주읍", status: "대기", battery: 100, progress: 0, distance: "-", lastActive: "14:00" },
  { id: "W-104", name: "최예찰", region: "강원 원주 신림면", status: "복귀", battery: 45, progress: 100, distance: "8.1km", lastActive: "14:31" },
];

export const initialCrowdReports: CrowdReport[] = [
  { id: "CR-9204", title: "학구산 정상 등산로 부근 소나무 집단 변색", region: "전남 순천시 서면", reporter: "이민우", date: "2026-07-07", status: "검토", aiProbability: 84, description: "등산로 우측 20m 지점에 잎이 적갈색으로 완전히 말라버린 소나무 3그루가 밀집해 있습니다." },
  { id: "CR-9202", title: "농장 경계지 해송 고사 의심", region: "경북 포항시 기계면", reporter: "박순옥", date: "2026-07-06", status: "접수", aiProbability: 76, description: "송진이 전혀 나오지 않고 잎 끝부터 노랗게 타들어가고 있습니다." },
  { id: "CR-9195", title: "밀양강변 인근 소나무 단일 고사", region: "경남 밀양시 삼문동", reporter: "최범수", date: "2026-07-04", status: "확진전환", aiProbability: 92, description: "강변 자전거도로 인근 소나무 가변이 급속히 일어남." },
];

export const initialControlTasks: ControlTask[] = [
  { id: "CTR-034", area: "경북 포항 죽장면 산42", method: "파쇄", status: "진행", company: "동해산림방제(주)", workers: 12, progress: 65, startDate: "2026-07-07", endDate: "2026-07-12" },
  { id: "CTR-035", area: "경남 밀양 산내면 산5", method: "훈증", status: "예정", company: "영남임업", workers: 8, progress: 0, startDate: "2026-07-10", endDate: "2026-07-15" },
  { id: "CTR-031", area: "전남 순천 승주읍 산12", method: "나무주사", status: "완료", company: "순천산림조합", workers: 15, progress: 100, startDate: "2026-07-01", endDate: "2026-07-05" },
];
