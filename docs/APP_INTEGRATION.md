# 현장 모바일 앱 연동

웹 대시보드(이 저장소)와 현장 모바일 앱(`pine-app-main`)을 한 Supabase 프로젝트로
묶는 방법을 적는다. 순서대로 하지 않으면 중간에 테이블이 없어 실패한다.

## 무엇이 이어지는가

```
앱: 신고 등록            ->  pine_records.id = 42
웹: 확진 처리            ->  confirmed_trees.source_report_id = '42'
웹: 요원 배정            ->  dispatch_assignments.worker_id = 'W00123'   (신규)
앱: "내 작업"에서 수행    ->  dispatch_assignments.status 변경          (신규)
앱: 사진·음성 기록        ->  field_photos / field_voice_logs
                             .related_record_id = '42'
웹: 확진목 타임라인       ->  source_report_id 로 묶어서 사진·음성·STT 표시
```

사진·음성은 원래 이어져 있었다. 이번에 추가한 것은 **작업 배정 축**이다.
예전에는 배정이 웹의 React state 에만 있어서 새로고침하면 사라졌고 앱은 볼 수 없었다.

## 1. 마이그레이션 적용

Supabase 대시보드 -> 프로젝트 -> **SQL Editor** 에서 순서대로 실행한다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `rag-backend/supabase/migrations/011_app_shared_tables.sql` | `pine_records` / `confirmed_trees` / `field_photos` / `field_voice_logs` + Storage 버킷 3개 + RLS |
| 2 | `rag-backend/supabase/migrations/012_workforce_and_dispatch.sql` | `workforce_*` 4개 + `dispatch_assignments` + RLS |

둘 다 추가 전용이다. 기존 테이블을 바꾸거나 지우지 않는다.
두 번 실행해도 안전하도록 `if not exists` 로 감쌌다.

## 2. 요원 명단 적재

914명 명단과 역량·근무가능·현재상태를 테이블로 올린다.

```powershell
cd "C:\Users\User\Desktop\산림 데이터셋\DX_08-dev"
.\rag-backend\venv\Scripts\python.exe .\scripts\seed_workforce_supabase.py
```

`rag-backend/.env` 의 `SUPABASE_URL` / `SUPABASE_KEY`(service_role)를 쓴다.
먼저 `--dry-run` 으로 변환 결과만 확인할 수 있다.

적재 후 건수:

| 테이블 | 건수 |
|---|---|
| `workforce_workers` | 914 |
| `workforce_capabilities` | 1,825 |
| `workforce_availability` | 914 |
| `workforce_status` | 914 |

## 3. 환경변수 맞추기

**웹과 앱이 같은 Supabase 프로젝트를 봐야 한다.** 다르면 앱이 올린 사진이
웹에 안 보인다.

웹 `.env` / `.env.production`

```
VITE_SUPABASE_URL=<프로젝트 URL>
VITE_SUPABASE_ANON_KEY=<publishable 키>
```

앱 `pine-app-main/.env.local`

```
VITE_SUPABASE_URL=<같은 값>
VITE_SUPABASE_ANON_KEY=<같은 값>
VITE_RAG_API_BASE=http://127.0.0.1:8788      # 로컬 백엔드
```

## 4. 실행

```powershell
# 백엔드
cd "C:\Users\User\Desktop\산림 데이터셋\DX_08-dev"
.\rag-backend\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir rag-backend --port 8788

# 웹 (다른 터미널)
npm run dev            # 5173

# 앱 (또 다른 터미널)
cd "C:\Users\User\Desktop\산림 데이터셋\pine-app-main"
npm run dev            # 3000
```

백엔드 CORS 기본 허용 목록에 `localhost:3000` 과 `localhost:5173` 이 이미 있다.

## 5. 연동 확인 시나리오

1. 앱에서 **로그인**(패스코드 `1111`) -> 담당 요원 선택
2. 웹 예찰/방제 탭에서 그 요원에게 작업 배정
3. 앱 하단 **내 작업** 탭에 즉시 표시된다 (Realtime)
4. 앱에서 `배정 수락` -> `출동` -> ... -> `작업 완료` 로 단계 변경
5. 웹 작업 현황에서 상태가 따라 바뀐다 (Realtime)
6. 방제 작업을 `작업 완료` 로 바꾸면 해당 확진목이 `방제완료` 가 된다

## 바뀐 파일

**웹**

| 파일 | 내용 |
|---|---|
| `src/lib/supabaseClient.ts` | 공용 Supabase 클라이언트 (신규) |
| `src/services/dispatchApi.ts` | 배정 저장·조회·상태변경·Realtime (신규) |
| `src/utils/workforce.ts` | Supabase 우선, 정적 JSON 폴백 |
| `src/App.tsx` | 배정 3개 핸들러에 DB 반영 + 최초 로드 + 구독 |

**앱**

| 파일 | 내용 |
|---|---|
| `src/services/dispatch.ts` | 내 배정 조회·상태변경·Realtime (신규) |
| `src/hooks/useWorker.tsx` | 요원 신원 컨텍스트 (신규) |
| `src/screens/MyTasks.tsx` | 내 작업 화면 (신규) |
| `src/screens/Login.tsx` | 패스코드 통과 후 요원 선택 단계 추가 |
| `src/screens/Chatbot.tsx` | Edge Function `chat-rag` -> 웹 백엔드 `/chat` |
| `src/hooks/useSupabase.ts` | Edge Function `field-audio-stt` -> 웹 백엔드 `/api/field-audio-stt` |
| `src/App.tsx` | `WorkerProvider`, `mytasks` 화면·탭 추가 |
| `tsconfig.json` | Deno 함수 제외 (lint 가 항상 실패하던 문제) |

**백엔드**

| 파일 | 내용 |
|---|---|
| `rag-backend/app/api/field_audio.py` | 음성 STT (신규). Storage 에서 녹음을 받아 Whisper 로 전사 |
| `rag-backend/app/main.py` | `field_audio` 라우터 등록 |

## Edge Function 을 왜 걷어냈나

앱은 원래 Supabase Edge Function 세 개에 의존했다.

| 함수 | 처리 |
|---|---|
| `chat-rag` | 웹 백엔드 `/chat` 으로 통합 |
| `ingest-rag` | 불필요. 문서 적재는 `scripts/preprocess_docs.py` + 백엔드가 한다 |
| `field-audio-stt` | 웹 백엔드 `/api/field-audio-stt` 로 통합 |

Edge Function 은 프로젝트마다 따로 배포해야 해서, Supabase 프로젝트를 옮기는
순간 챗봇과 음성 변환만 조용히 망가졌다. `OPENAI_API_KEY` 도 두 곳에서 관리해야 했다.
백엔드로 모으면 프로젝트를 옮겨도 `VITE_RAG_API_BASE` 하나만 맞추면 된다.

## 남은 것

- **앱이 Git 저장소가 아니다.** `pine-app-main` 에 `.git` 이 없어 변경 이력이 남지
  않는다. 별도 저장소로 만들거나 이 저장소 안으로 옮기는 편이 안전하다.
- 앱 `Tickets` 화면은 아직 `localStorage` 의 `myReportTokens` 로 본인 신고를
  거른다. 요원 신원이 생겼으니 이쪽도 정리할 수 있다.
- 조원 프로젝트 `pine_records` 에는 `trg_auto_roboflow_analysis`(AFTER INSERT)
  트리거가 있는데 011 에서는 만들지 않았다. 자동 AI 판독이 필요하면 따로 옮겨야 한다.
- 배포 백엔드(`rag-backend-rho.vercel.app`)는 아직 옛 빌드다. Vercel 함수 225MB
  한도 때문에 재배포가 막혀 있어서 `/api/geocode` 와 `/api/field-audio-stt` 가
  배포본에는 없다. 로컬 백엔드로는 전부 동작한다.

## 검증 기록 (2026-08-09)

마이그레이션 적용 후 실제로 확인한 것.

```
테이블 9개          전부 생성, RLS 켜짐, 정책 부여됨
요원 데이터          914 / 1,825 / 914 / 914 건 적재
Storage 버킷        pine-images / field-photos / field-audio  전부 public, 정책 3/3
Realtime            5개 테이블 등록됨
anon 키 경로         11개 테이블 조회 성공, 버킷 3개 접근 가능
```

전체 흐름을 실제 INSERT 로 통과시킨 뒤 ROLLBACK 했다(DB 에 잔여물 없음).

```
1) 앱 신고 등록        pine_records.id = 2
2) 웹 확진 처리        confirmed_trees.source_report_id = '2'
3) 웹 요원 배정        정하윤(W00002) <- 확진목 PT-2026-9999
4) 앱 사진·음성        related_record_id 로 연결
5) 웹 타임라인 조회    사진 1건 / 음성 1건 / 배정 1건
6) 앱 작업 완료        -> 웹이 확진목을 방제완료로 전환
7) 앱 내 작업 조회     worker_id=W00002 -> 1건
```
