# 완전 서버리스 마이그레이션 계획 (Naver Cloud → Vercel + Supabase)

이 문서는 rag-backend를 Vercel(서버리스) + Supabase(Postgres/Vector/Storage)로
완전히 옮기는 작업의 단계별 계획입니다. 각 단계는 순서대로 진행하고,
Claude Code 결과는 매번 이 채팅에 공유해서 검토받은 뒤 다음 단계로 넘어가세요.

**시작 전 필수: 별도 브랜치에서 작업**
```
git checkout -b feature/serverless-migration
```
`feature/loh-ui`(지금 잘 돌아가는 브랜치)는 건드리지 않고, 마이그레이션이 끝나고
검증된 뒤에 합칩니다.

**시작 전 필수: 별도 Supabase 프로젝트에서 작업**
조원이 쓰는 Supabase는 유료(실서비스용)이므로, 본인 계정으로 별도 무료 프로젝트를
새로 만들어 거기서 1~7단계를 전부 검증한다.
- 테이블 생성(`CREATE TABLE`), 확장 활성화(`CREATE EXTENSION vector`) 등은 대시보드에서
  손으로 하지 말고, `rag-backend/supabase/migrations/*.sql` 파일로 저장한다.
- 검증이 끝나면 이 SQL 파일들을 조원의 유료 프로젝트에 그대로 실행하고, 환경변수만
  교체해서 최종 테스트한다. 테스트용 더미 데이터는 옮기지 않는다.

---

## 0단계 — 체크포인트

```
지금 상태 그대로 커밋해줘. 커밋 메시지: "서버리스 마이그레이션 시작 전 체크포인트"
```

---

## 1단계 — ChromaDB → Supabase Vector, SQLite → Supabase Postgres (설정 변경 위주)

가장 쉬운 단계입니다. 코드는 이미 대부분 준비돼 있어요.

```
아래 작업을 진행해줘.

1. rag-backend/app/core/store.py의 make_store()에서 VECTOR_BACKEND=supabase일 때
   supabase_store.py의 SupabaseStore를 쓰도록 되어 있는지 다시 확인해줘.
   빠진 부분이 있으면 알려줘 (아직 고치지 마).
2. rag-backend/app/core/database.py의 _resolve_database_url()이 DATABASE_URL
   환경변수를 Postgres 연결 문자열로 받았을 때 문제없이 동작하는지 확인해줘.
3. requirements.txt에 psycopg2-binary(또는 psycopg[binary])를 추가하고,
   더 이상 안 쓰는 pymysql을 제거해줘.
4. .env.example 파일에 아래 환경변수 항목을 예시로 추가해줘:
   VECTOR_BACKEND=supabase, SUPABASE_URL, SUPABASE_KEY, DATABASE_URL
5. 다 끝나면 diff 보여주고, 아직 실제 배포·ingest는 하지 마.
```

**이 단계 끝나면 확인할 것**
- Supabase 대시보드에서 `vector` 확장(pgvector)이 활성화되어 있는지
- `document_chunks` 테이블과 `match_document_chunks` RPC가 실제로 존재하는지

---

## 2단계 — 문서·보고서 저장소를 Supabase Storage/Postgres로

```
아래 작업을 순서대로 진행해줘. 3번(실제 적용)은 나한테 먼저 계획을 보여준 뒤 진행해.

1. api/docs.py의 /docs/{filename}을 로컬 FileResponse 대신 Supabase Storage에서
   가져오도록 바꿔줘 (서명된 URL로 리다이렉트하는 방식 추천).
2. api/reports.py의 문서목록.csv 기반 로직(_read_rows, register_report의 append)을
   Supabase Postgres의 reports 테이블 기반으로 바꿀 계획을 세워줘. 테이블 스키마
   초안도 같이 제안해줘.
3. report_draft_service.py의 save_draft/load_draft(draft.json 파일 기반)를
   Postgres JSONB 컬럼 기반으로 바꿀 계획을 세워줘.
4. 위 계획들을 나한테 먼저 표로 정리해서 보여줘. 실제 코드 변경은 내 확인 후에 진행해.
```

---

## 3단계 — LibreOffice 변환 → reportlab로 재작성 (가장 큰 작업)

먼저 지금 보고서 양식이 정확히 어떻게 생겼는지 파악부터 시켜야 합니다.

```
report_template_service.py가 사용하는 docx 템플릿들(TEMPLATE_ROOT 하위)을 전부
찾아서, 각 템플릿에 어떤 필드(변수)가 들어가고 레이아웃이 어떤 구조인지
정리해줘. 아직 재작성은 하지 마. 이 정리 결과를 먼저 나한테 보여줘.
```

이 결과를 받으면 저한테 공유해주세요. 템플릿 구조를 보고 reportlab로 재작성하는
게 합리적인지, 아니면 일부는 다른 방식(예: HTML→PDF 변환 라이브러리)이 더
나을지 같이 판단한 뒤 다음 프롬프트를 만들어드릴게요.

---

## 4단계 — HWP 파싱을 "사전 변환" 방식으로 전환

```
parsers.py의 HWP 파싱 로직(_parse_hwp, hwp5txt 호출 부분)을 실행 시점이 아니라
"사전 처리" 방식으로 바꾸는 스크립트를 만들어줘.

1. scripts/preconvert_hwp.py를 새로 만들어서, data/docs 안의 모든 .hwp 파일을
   미리 텍스트로 변환해 data/docs_converted/ 같은 캐시 폴더에 저장하게 해줘.
2. ingest.py는 이제 .hwp를 직접 파싱하지 않고, 이 캐시 폴더의 변환 결과를
   읽도록 바꿔줘.
3. README나 CLAUDE.md에 "새 HWP 문서를 추가하면 배포 전에 반드시
   scripts/preconvert_hwp.py를 먼저 실행해야 한다"는 안내를 추가해줘.
```

---

## 5단계 — OCR을 외부 API로 전환

```
parsers.py의 pytesseract 기반 OCR(_ocr_page)을 외부 OCR API 호출로 바꾸려고 해.
먼저 재작성하지 말고, Naver Clova OCR과 Google Cloud Vision OCR 중 이 프로젝트
(한글 문서, PDF 스캔본)에 더 적합한 쪽과 그 이유, 대략적인 비용 구조를
비교해서 알려줘. 결정은 내가 할게.
```

이 비교 결과를 저한테 공유해주시면, 어느 쪽으로 갈지 같이 정하고 실제 구현
프롬프트를 이어서 드릴게요.

---

## 6단계 — prediction_template_service.py 리팩터링 (venv/subprocess 제거)

```
prediction_template_service.py가 report-venv를 subprocess로 호출해서
scripts/prediction_report_single.py를 실행하는 구조로 되어 있어. 이걸
scripts/prediction_report_single.py의 로직을 rag-backend 패키지 안으로
옮겨서 직접 import해 함수 호출하는 방식으로 리팩터링해줘. 동작 결과(생성되는
보고서 내용)는 지금과 완전히 동일해야 해. 리팩터링 전후 diff와 테스트 결과를
보여줘.
```

---

## 7단계 — 최종 정리 및 Vercel 배포 설정

```
아래를 진행해줘.

1. requirements.txt에서 chromadb, pymupdf 중 이제 안 쓰는 게 있으면 정리해줘
   (pymupdf는 OCR과 무관하게 PDF 텍스트 추출에 계속 쓰일 수 있으니 실제
   사용 여부 확인 후 판단해줘).
2. vercel.json을 만들어서 FastAPI 앱을 Vercel Python 런타임으로 배포할 수
   있게 설정해줘.
3. 필요한 환경변수 전체 목록(VECTOR_BACKEND, SUPABASE_URL, SUPABASE_KEY,
   DATABASE_URL, OCR API 키 등)을 정리해서 보여줘 — 이건 내가 Vercel
   대시보드에 직접 등록할 거야.
```

---

## 각 단계 진행 시 공통 원칙

- 매 단계 시작 전 `git commit`으로 체크포인트를 남긴다.
- "계획을 보여달라"고 명시한 단계는 실제 파일 변경 전에 반드시 결과를 채팅에
  공유하고 검토받는다.
- 기존 `feature/loh-ui`(현재 운영 중인 UI)는 이 작업과 분리된 브랜치에서 진행한다.

## 이 마이그레이션 전체가 끝난 뒤 해야 할 것

1. **Supabase 프로젝트 설정 확인**
   - `vector` 확장 활성화 여부
   - Storage 버킷 생성 및 파일 업로드 테스트 (50MB 제한 재확인)
   - Postgres 테이블(`reports`, `drafts`, `document_chunks` 등) 마이그레이션 실행
2. **Vercel 프로젝트 설정**
   - 위 7단계에서 정리한 환경변수 전체를 Vercel 대시보드에 등록
   - 배포 리전(region)을 한국과 가까운 곳으로 설정했는지 확인
   - 함수 실행 시간 제한(플랜별 상이)이 실제 요청 처리 시간보다 넉넉한지 확인
3. **엔드투엔드 테스트**
   - 회원가입/로그인, RAG 챗봇 질의응답, 보고서 생성, HWP 문서 검색 각각
     실제로 동작하는지 브라우저에서 확인
   - 특히 "초안 생성 → 양식 적용 → 등록"처럼 여러 요청에 걸친 흐름이
     끊기지 않는지 확인 (서버리스 인스턴스 분산 문제였던 부분)
4. **CLAUDE.md 업데이트**
   - 배포 절차 섹션을 Naver Cloud 기준에서 Vercel+Supabase 기준으로 전면 수정
   - 이 문서(SERVERLESS_MIGRATION_PLAN.md)는 마이그레이션 완료 후 archive 처리
5. **feature/loh-ui와 병합**
   - 검증이 끝나면 `feature/serverless-migration`을 `feature/loh-ui`(또는 최종 배포
     브랜치)로 병합
6. **Naver Cloud 서버 정리**
   - 완전 서버리스로 전환했으니, 기존 Naver Cloud 서버는 문제없이 동작하는 것을
     충분히 확인한 뒤 종료/해지 (당장 지우지 말고 며칠은 롤백용으로 남겨두는 걸 추천)
