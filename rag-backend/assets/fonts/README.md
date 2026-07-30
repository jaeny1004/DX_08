# 번들 폰트: Noto Sans KR

- 출처: https://github.com/google/fonts/tree/main/ofl/notosanskr (Google Fonts 저장소)
- 원본은 가변 폰트(`NotoSansKR[wght].ttf`, wght 축)로만 배포되어, `fonttools`의
  `varLib.instancer`로 두 개의 정적 인스턴스를 뽑아서 커밋했다:
  - `NotoSansKR-Regular.ttf` (wght=400)
  - `NotoSansKR-Bold.ttf` (wght=700)
- 라이선스: SIL Open Font License 1.1 (`OFL.txt` 참고). 인스턴싱(정적 웨이트 추출)은
  OFL이 명시적으로 허용하는 재배포 방식이다.
- 알려진 글리프 누락: `❍`(U+274D, SHADOWED WHITE CIRCLE)가 이 폰트에 없다.
  `report_render` 렌더러는 PDF로 그리기 직전에 `❍` → `○`(U+25CB, WHITE CIRCLE)로
  치환한다 (원본 템플릿 텍스트나 report_template_service.py의 치환 딕셔너리 자체는
  건드리지 않음 — reportlab 렌더링 직전 단계에서만 치환).
