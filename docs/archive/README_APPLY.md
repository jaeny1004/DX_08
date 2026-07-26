# 행정기안 자동 양식·지도 선택·보고서 등록 수정본

수정 파일
- src/components/NewReportGenerator.tsx
- src/components/ReportGridSelector.tsx
- src/components/AdminSection.tsx
- src/services/reportDraftApi.ts
- rag-backend/app/api/report_drafts.py
- rag-backend/app/services/report_draft_service.py
- rag-backend/app/services/report_template_service.py
- rag-backend/data/report_templates/*.docx

핵심 변경
1. 문서 유형 3종만 제공
2. 시도·시군구 선택 목록
3. 지역 격자 지도에서 중심 격자 1개 선택
4. 과거 문서번호 입력 제거
5. 초안 생성과 동시에 유형별 빈 행정양식 자동 적용
6. PDF 즉시 미리보기
7. 보고서 등록 시 generated_reports 및 문서목록.csv에 저장
8. 등록 후 과거 보고서 조회 탭 자동 이동
