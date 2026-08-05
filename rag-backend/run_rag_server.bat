@echo off
cd /d %~dp0

if not exist .venv (
  py -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install -r requirements.txt

if not exist .env (
  copy .env.example .env > nul
  echo.
  echo [설정 필요] rag-backend\.env 파일에 OPENAI_API_KEY를 입력한 후 다시 실행하세요.
  pause
  exit /b 1
)

python -m uvicorn app.main:app --host 127.0.0.1 --port 8788 --reload
pause
