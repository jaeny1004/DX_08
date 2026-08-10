# 소나무재선충병 현장 모바일 앱

「AI 기반 소나무재선충병 통합 예찰 및 방제지원 플랫폼」의 현장 요원용 앱이다.
웹 관제 대시보드(`DX_08`)와 **같은 Supabase 프로젝트**를 보며 짝을 이룬다.

React 19 + Vite + Tailwind + Supabase.

## 무슨 일을 하나

| 화면 | 내용 |
|---|---|
| 신고 | 시민·현장 의심목 신고 (사진 + 위치) |
| 민원 | 내가 넣은 신고 추적 |
| **내 작업** | 웹에서 배정받은 예찰·드론·방제 작업. 현장에서 진행 단계를 바꾼다 |
| 현장관리 | 현장사진 촬영, 음성 작업일지(STT), 약제·시료 QR |
| 챗봇 | 방제 지침 RAG 질의 |

## 웹과 어떻게 이어지나

```
앱 신고 등록           ->  pine_records.id = 42
웹 확진 처리           ->  confirmed_trees.source_report_id = '42'
웹 요원 배정           ->  dispatch_assignments.worker_id = 'W00123'
앱 "내 작업"에서 수행   ->  dispatch_assignments.status 변경
앱 사진·음성 기록       ->  field_photos / field_voice_logs
                          .related_record_id = '42'
웹 확진목 타임라인      ->  source_report_id 로 묶어서 표시
```

양쪽 다 Realtime 을 구독한다. 앱에서 상태를 바꾸면 웹 화면이 새로고침 없이 따라간다.

## 실행

**전제**: 웹 저장소의 마이그레이션 `011` / `012` 가 적용돼 있어야 한다.
자세한 내용은 웹 저장소의 `docs/APP_INTEGRATION.md` 참고.

```bash
npm install
cp .env.example .env.local     # 값을 채운다
npm run dev                    # http://localhost:3000
```

챗봇과 음성 STT 는 웹 백엔드를 부른다. 따로 띄워야 한다.

```powershell
# 웹 저장소에서
.\rag-backend\venv\Scripts\python.exe -m uvicorn app.main:app --app-dir rag-backend --port 8788
```

백엔드 CORS 기본 허용 목록에 `localhost:3000` 이 들어 있다.

## 로그인

패스코드 `1111` -> 담당 요원 선택.

별도 인증 체계가 아니다. 시연 범위에서 "이 기기를 쓰는 요원이 누구인지"만 정하면
되기 때문이다. 선택한 요원은 `localStorage` 에 남아 다음 실행에도 유지된다.

## Supabase Edge Function 을 쓰지 않는다

`supabase/functions/` 에 `chat-rag` 와 `ingest-rag` 가 남아 있지만 **더 이상
호출하지 않는다.** Edge Function 은 프로젝트마다 따로 배포해야 해서, Supabase
프로젝트를 옮기면 챗봇과 음성 변환만 조용히 망가졌다. 지금은 둘 다 웹 백엔드로
합쳤다.

| 예전 | 지금 |
|---|---|
| Edge Function `chat-rag` | 웹 백엔드 `POST /chat` |
| Edge Function `field-audio-stt` | 웹 백엔드 `POST /api/field-audio-stt` |

프로젝트를 옮겨도 `VITE_RAG_API_BASE` 하나만 맞추면 된다.

## 정리하면 좋을 것

- `package.json` 의 `express`, `@google/genai`, `openai` 는 `src/` 어디에서도
  쓰지 않는다. AI Studio 생성 템플릿에 딸려온 것으로 보인다.
- `Tickets` 화면은 `localStorage` 의 `myReportTokens` 로 본인 신고를 거른다.
  요원 신원(`useWorker`)이 생겼으니 이쪽도 정리할 수 있다.
- `supabase/functions/` 는 실제로 안 쓰므로 삭제 후보다.
  (`tsconfig.json` 에서는 이미 제외했다 — Deno 런타임이라 Node 기준 tsc 가 실패한다)
