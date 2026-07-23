프론트 연결 파일

덮어쓸 경로:
- src/services/reportDraftApi.ts
- src/components/NewReportGenerator.tsx

기능:
- 행정양식 적용
- 실제 PDF Blob 미리보기
- 인증 토큰 포함 DOCX/PDF/XLSX 다운로드
- 기존 초안 저장 유지

주의:
- 현재 행정양식 적용은 신규 확산위험 분석 보고서(prediction)만 지원
- 중심 격자 ID는 정확히 1개 필요
- 수종전환 탭과 과거 보고서 조회 기능은 수정하지 않음
