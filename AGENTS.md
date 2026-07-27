# CLAUDE.md

이 파일은 Claude Code가 이 프로젝트에서 작업을 시작할 때마다 자동으로 읽는 지침 파일입니다.
여기 적힌 내용은 매 세션 다시 설명할 필요가 없습니다.

## 프로젝트 개요

「산림과학 AI 활용 경진대회」 출품작 「AI 기반 소나무재선충병 통합 예찰 및 방제지원 플랫폼」.

핵심 방향: 감염목 이미지 분류가 아니라 **500m×500m 격자 기반 신규 확산위험 예측**이 핵심이다.
AI 결과를 예찰 우선순위·방제 검토·인력배정·현장보고·행정지원까지 연결한다.

## 절대 원칙 (반드시 지킬 것)

1. 개발 오류는 원인을 한 문장으로 먼저 설명한다.
2. 작업 순서는 번호로 구분해서 제시한다.
3. Windows PowerShell(로컬)과 Linux 서버 명령어를 명확히 구분한다.
4. 실제 파일을 확인하지 않은 상태에서 파일 구조·컬럼명·변수명을 임의로 추측하지 않는다.
   반드시 실제 파일을 Read/Grep으로 확인한 뒤 작업한다.
5. "기존 기능을 건드리지 말라"는 지시가 있으면 반드시 지킨다.
6. **다음 명령은 절대 사용하지 않는다**: `git reset --hard`, `git clean`, 전체 강제 `checkout`,
   전체 강제 `pull`. 저장소를 초기화하거나 서버의 다른 변경사항을 지우는 행위 금지.
7. 서버 배포는 필요한 파일만 선택적으로 반영한다 (`git checkout origin/브랜치 -- 특정파일`).
8. 삭제나 대규모 수정 전에는 항상 대상 목록만 먼저 보여주고 사용자 확인을 받는다.
9. 과장된 AI 표현이나 실제 감염 확정 표현을 사용하지 않는다.
10. **작업 자율성 범위**: 설정 변경, 반복적인 파일 처리, 코드 리팩터링처럼 위험도가
    낮고 되돌리기 쉬운 작업은 하위 단계마다 확인받지 않고 계획대로 계속 진행한다.
    단, 다음의 경우 반드시 멈추고 사용자에게 확인받는다:
    - 파일을 실제로 삭제하는 경우
    - git history 재작성 또는 force push가 필요한 경우
    - 이미 커밋된 것을 되돌리기 어려운 방식으로 변경하는 경우
    - 예상과 다른 결과가 나와 판단이 필요한 경우
    - 데이터베이스 스키마를 실제로 변경하는 경우 (테이블 생성/삭제 등)

## 용어 원칙

**우선 사용**: 신규 확산위험 후보 / 우선 예찰 검토지역 / 현장 확인 필요 / 감염 발생 이력 /
2023년 조사자료 기준 감염 발생 격자 / 상대위험 점수 / 방제 완료 가정

**금지**: 감염 확정 / 실제 미래 감염지역 / 감염확률 00% / "AI가 실제 확산을 정확히 예측했다"

위험점수는 감염확률이 아니라 0~100점 상대위험 점수다.

## 좌표계 및 데이터 규모

- 분석·공간조인: **EPSG:5186**
- 웹지도 GeoJSON: **EPSG:4326**
- EPSG:5179는 사용하지 않는다.
- 전체 격자: 남부권 전체 419,075개 / 신규 확산 예측 대상 375,490개
- 격자 면적: 250,000㎡ (0.25㎢)
- 위험도 등급 5단계: 매우 높음 / 높음 / 주의 / 관찰 / 낮음 (risk_stage_label 기준으로 정규화됨.
  `types.ts`의 GridCell.grade("상/중/주의/하")는 초기 목업 데이터일 뿐, 실제 등급 체계 아님)
- 예찰 우선순위 5단계: 최우선 예찰 / 우선 예찰 / 집중 관찰 / 정기 관찰 / 일반 관리

## 기술 스택 및 경로

- 프론트: React + Vite + TypeScript + Leaflet + VWorld 지도
- 백엔드: FastAPI + RAG + ChromaDB + SQLite(SQLAlchemy, `data/pine_wilt.db`)
- 배포: Naver Cloud + Nginx (정적 배포) + FastAPI 포트 8788
- 로컬: `C:\Users\User\Desktop\산림 데이터셋\DX_08`
- 서버: `/opt/pine-wilt` → Nginx 배포 경로 `/var/www/pine-wilt`
- 작업 브랜치: `feature/loh-ui`
- `rag-backend/data/final_ui_candidate_v4.geojson`은 반드시 Git 추적 상태 유지

## 확산 시뮬레이션 UI 핵심 규칙 (SimulationSection.tsx)

- Leaflet 지도는 최초 한 번만 생성. 확대·축소 시 격자 레이어를 새로 만들지 않는다.
- 위험 격자는 `riskGridPane`, 시군구 경계는 `sigunguPane`, 방제 영향권은 `controlPane`에 고정.
- 월·모드 변경 시 기존 polygon에 `setStyle()`만 적용 (레이어 재생성 금지).
- 직접 방제구역=상대위험 0점(1개월부터), 2km=강한 간접 저감, 5km=약한 간접 저감, 5km 밖=효과 없음.
- 월별 결과는 실제 월별 감염예측 모델이 아니라 의사결정용 상대위험 변화 시나리오다.
- 데이터는 `public/data/simulation_sigungu/index.json` + 시군구별 개별 GeoJSON 구조 사용.
  `public/data/simulation_tiles`(구 1도 단위 타일 구조)는 더 이상 사용하지 않음 — 삭제 후보.

## 알려진 코드 중복 이슈 (정리 작업 시 참고)

- `riskColor` 함수가 `SimulationSection.tsx`(percentile 기반 연속 그라데이션)와
  `ReportGridSelector.tsx`(risk_grade 기반 4단계 고정색)에 서로 다르게 중복 구현되어 있음.
- 등급 정규화 로직(`normalizeRiskGrade`/`normalizePriorityGrade`)이 프론트
  `DashboardRiskMapCard.tsx`와 백엔드 `build_workforce_allocation.py`에 각각 따로 구현됨.
  등급 매핑 규칙을 바꿀 때는 두 곳 모두 확인할 것.
- `Chatbot.tsx`의 `createMessageId()`가 `crypto.randomUUID()`를 호출해야 하는데
  자기 자신을 재귀 호출하는 버그가 있음 (무한 재귀 위험).
- `rag-backend_backup_before_sqlite/`, `docs/legacy/` 폴더는 SQLite 전환 전 백업/레거시로 추정됨.
  삭제 전 반드시 실제 참조 여부를 grep으로 확인하고 목록으로 먼저 보고할 것.

## 데이터 저장 규칙 (신규 데이터 추가 시 필수)

새 데이터 파일을 저장할 때 "어디에 넣어야 할지 헷갈리는 문제"를 막기 위한 단일 기준.

- **원본/소스 데이터는 항상 `data/`(프로젝트 루트) 한 곳에만 저장한다.**
  예: CSV 원본, 임상도, DEM, 산림입지도, 행정구역 경계, 요원 명단 원본 등.
- **`public/data/`는 프론트엔드가 직접 fetch하는 "빌드 산출물" 전용 폴더다.**
  사람이 손으로 파일을 넣지 않는다. `scripts/build_simulation_sigungu_files.py` 같은
  스크립트가 `data/`의 원본을 읽어 여기에 경량화된 결과물을 생성한다.
- **`rag-backend/data/`는 백엔드(FastAPI)가 직접 읽는 파일 전용이다.**
  RAG 문서(PDF 등), `final_ui_candidate_v4.geojson`(`chat.py`가 grid_id 조회용으로 로드)처럼
  브라우저가 아니라 서버 프로세스만 접근하는 파일만 둔다. 가능하면 이것도 `data/`의
  원본에서 스크립트로 생성·복사하도록 한다.
- 새 데이터 파일을 받으면 우선 `data/`에 넣고, 프론트/백엔드 중 어디에 필요한지에 따라
  위 규칙대로 산출물을 생성한다. `public/`이나 `rag-backend/data/`에 원본을 직접
  복사해 넣지 않는다.
- 지도(`simulation_sigungu` 등) 데이터는 시군구당 0.15~2MB 수준으로 이미 경량화되어
  있으므로, 인증이 걸린 백엔드 API로 옮기지 않고 정적 파일 서빙을 유지한다.

## 로컬 개발 서버(dev) 종료 규칙

- Windows에서 `npm run dev`는 `bash → bash → node(npm-cli) → cmd.exe → node(vite) → esbuild.exe`
  형태의 깊은 프로세스 트리를 만든다. 최상위 프로세스만 종료하면 Windows는 자식 프로세스를
  자동으로 정리하지 않아서, vite(node.exe)가 포트(5173 등)를 붙잡은 채 orphan으로 계속
  살아남는다 (2026-07-26 실측으로 원인 확인).
- 반대로 포트를 실제로 점유 중인 프로세스(트리 맨 아래, vite node.exe)를 직접 종료하면
  부모 프로세스들이 자식 종료를 감지하고 연쇄적으로 함께 종료된다 (실측 확인됨).
- 그래서 **dev 서버를 시작하기 전, 그리고 세션을 끝낼 때 항상 `npm run devkill`을 실행한다.**
  (`kill-port`로 4173/5173/8788/9222 포트를 직접 정리 — 포트 기준이라 프로세스 트리 깊이와
  무관하게 항상 동작한다.)
- 종료 후에는 `netstat -ano | findstr "4173 5173 8788 9222"` (PowerShell:
  `Get-NetTCPConnection -LocalPort 4173,5173,8788,9222`)로 실제로 비어있는지 확인한다.

## Git / 서버 배포 절차

```
# 로컬
cd "C:\Users\User\Desktop\산림 데이터셋\DX_08"
npm run build
git add <파일>
git commit -m "수정 내용"
git push origin feature/loh-ui

# 서버 (필요한 파일만 선택 반영)
cd /opt/pine-wilt
git fetch origin
git checkout origin/feature/loh-ui -- <파일 경로>
npm run build
sudo rm -rf /var/www/pine-wilt/*
sudo cp -r dist/* /var/www/pine-wilt/
sudo chown -R www-data:www-data /var/www/pine-wilt
sudo chmod -R 755 /var/www/pine-wilt
sudo nginx -t
sudo systemctl reload nginx
```

## 이 저장소는 Claude Code와 Codex CLI가 동시에 작업할 수 있습니다
- 두 도구가 같은 파일을 동시에 건드리지 않도록, 작업을 시작하기 전에 사용자(팀장)가
  배정한 파일/범위 밖은 건드리지 않는다.
- 커밋은 반드시 한 번에 한 도구만 진행한다. 다른 도구가 커밋 중일 수 있으니,
  커밋 직전 항상 git status와 git log --oneline -3으로 예상 밖의 커밋이
  없는지 확인한다.
- 작업 범위가 다른 도구와 겹칠 가능성이 있다고 판단되면, 진행하지 말고 먼저
  사용자에게 확인을 받는다.
