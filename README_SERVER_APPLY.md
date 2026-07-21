# 신규 확산위험 보고서 연결 파일

## 포함 파일

- `scripts/prediction_report_single.py`
- `scripts/repair_main_report_drafts.py`
- `rag-backend/app/services/prediction_template_service.py`
- `rag-backend/app/api/report_drafts.py`

## 서버 업로드 위치

압축을 푼 뒤 `/opt/pine-wilt` 아래에 같은 구조로 덮어씁니다.

## 서버 실행 순서

```bash
cd /opt/pine-wilt

python3 scripts/repair_main_report_drafts.py

cd /opt/pine-wilt/rag-backend

./venv/bin/python -m py_compile \
  app/main.py \
  app/api/report_drafts.py \
  app/services/prediction_template_service.py

/opt/pine-wilt/report-venv/bin/python \
  -m py_compile \
  /opt/pine-wilt/scripts/prediction_report_single.py

./venv/bin/python - <<'PY'
from app.main import app

for route in app.routes:
    path = getattr(route, "path", "")
    if "report-drafts" in path:
        print(
            sorted(getattr(route, "methods", []) or []),
            path,
        )
PY

sudo systemctl restart pine-wilt-api
sudo systemctl status pine-wilt-api --no-pager -l
```

## 정상 API

- `GET /api/report-drafts/types`
- `POST /api/report-drafts`
- `GET /api/report-drafts/{draft_id}`
- `PUT /api/report-drafts/{draft_id}`
- `POST /api/report-drafts/{draft_id}/apply-template`
- `GET /api/report-drafts/{draft_id}/preview/pdf`
- `POST /api/report-drafts/{draft_id}/export/{file_format}`

## 보호 대상

이 묶음은 다음 기능을 수정하지 않습니다.

- 기존 수종전환 탭
- 과거 보고서 조회 기능
- 기존 배치 생성기 `generate_vworld_prediction_reports.py`
