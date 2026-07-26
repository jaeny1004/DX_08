# DX_08 통합 정리 및 수정 내역

## 적용 완료

1. `rag-backend/app/main.py`에 보고서 초안 라우터 등록 및 시작 시 경로 검증 추가
2. 프론트 API 주소를 `src/config/api.ts` 한 곳으로 통합
3. 인증·RAG·기존 보고서·보고서 초안 서비스가 동일한 API 주소 생성 함수를 사용하도록 수정
4. `.env.example`에서 실제 값처럼 보이는 키와 클라이언트 비밀키 항목 제거
5. `.gitignore`의 잘못 들어간 PowerShell 문자열 제거 및 DB/캐시/백업 제외 규칙 보강
6. `rag-backend/data/final_ui_candidate_v4.geojson` 추적 유지 예외 규칙 명시
7. 브라우저에서 Roboflow 비밀키 존재 여부를 확인하던 코드 제거
8. 고도에서 접근성 점수를 임의 생성하던 로직 제거. 실제 `accessScore`가 없으면 `데이터 없음`으로 처리
9. 과거 Gemini/Express 서버는 삭제하지 않고 `docs/legacy/`로 이동
10. `dispatch.backup.ts`, Python 캐시와 `.pyc` 제거
11. 프론트 실행 명령을 Vite 전용으로 정리
12. 실제 SDK 사용을 단정하던 UI 문구를 중립적인 서버 연계 표현으로 변경

## 의도적으로 유지한 항목

- `api/roboflow.ts`: 현장 이미지 분석 화면이 `/api/roboflow`를 호출하므로 임의 삭제하지 않음. Naver Cloud 운영에서는 FastAPI 또는 Nginx 뒤의 서버 엔드포인트로 별도 구현·연결 필요.
- `MonitoringSection.tsx`의 시연 화면: 화면 전체 삭제는 기존 기능 변경 위험이 있어 유지. 발표 시 실제 구현과 시연 기능을 구분해야 함.
- 대용량 데이터: 업로드 압축본에서 제외되어 있어 데이터 컬럼·실행 결과 검증 대상이 아님.

## 보안 조치

기존 `.env.example`의 값이 실제 사용 키였다면 해당 공급자 콘솔에서 반드시 폐기·재발급해야 합니다. 파일에서 문자열을 지우는 것만으로 이미 노출된 키가 무효화되지는 않습니다.
