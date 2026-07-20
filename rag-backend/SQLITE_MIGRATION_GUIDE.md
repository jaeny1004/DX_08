# Cloud MySQL → 서버 SQLite 전환 가이드

## 핵심 구조

- 운영 DB: `/opt/pine-wilt/rag-backend/data/pine_wilt.db`
- 모든 조원은 SQLite 파일에 직접 접속하지 않고 `/api/auth/*`를 통해 공동 사용
- 지도 GeoJSON과 ChromaDB는 기존 방식 유지
- `data/final_ui_candidate_v4.geojson`은 계속 Git 추적 대상

## 로컬 초기화

```powershell
cd "C:\Users\User\Desktop\산림 데이터셋\DX_08\rag-backend"
python -m pip install -r requirements.txt
Copy-Item ".env.example" ".env"
python ".\scripts\init_sqlite_db.py"
```

`.env`에는 반드시 JWT 키를 입력합니다.

```env
JWT_SECRET_KEY=충분히_길고_랜덤한_문자열
DATABASE_URL=sqlite:///./data/pine_wilt.db
```

## MySQL 사용자 이전

Cloud DB를 삭제하기 전에 `.env`에 `MYSQL_SOURCE_*` 값을 임시로 입력한 뒤 실행합니다.

```powershell
python ".\scripts\migrate_mysql_to_sqlite.py"
python ".\scripts\check_sqlite_users.py"
```

이전 완료 후 `.env`에서 `MYSQL_SOURCE_PASSWORD`를 제거하는 것을 권장합니다.

## 서버 적용

```bash
cd /opt/pine-wilt/rag-backend
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p data backups
python scripts/init_sqlite_db.py
python scripts/migrate_mysql_to_sqlite.py
python scripts/check_sqlite_users.py
sudo systemctl restart pine-wilt-api
sudo systemctl status pine-wilt-api --no-pager
curl http://127.0.0.1:8788/health
```

## 권한

FastAPI systemd 서비스 실행 계정이 DB 폴더에 쓸 수 있어야 합니다.

```bash
sudo chown -R $(whoami):$(whoami) /opt/pine-wilt/rag-backend/data
chmod 750 /opt/pine-wilt/rag-backend/data
chmod 640 /opt/pine-wilt/rag-backend/data/pine_wilt.db
```

실제 systemd 실행 계정이 다르면 해당 계정으로 변경합니다.

## 백업

```bash
sqlite3 /opt/pine-wilt/rag-backend/data/pine_wilt.db \
  ".backup '/opt/pine-wilt/backups/pine_wilt_$(date +%Y%m%d_%H%M%S).db'"
```

## Cloud DB 삭제 전 확인

1. 회원가입
2. 로그인
3. `/api/auth/me`
4. 사용자 응답의 `sigunguCode`, `sigunguName`
5. 로그인 지역으로 지도 자동 이동
6. 조원 2명 이상 동시 로그인
7. 서버 재시작 후 사용자 유지
8. SQLite 백업 생성

위 항목이 전부 통과한 뒤 Cloud DB를 삭제합니다.
