@echo off
setlocal
cd /d "%~dp0"
echo ===== KuberKet =====

if /I "%~1"=="rebuild" (
  echo Rebuilding the frontend...
  pushd frontend
  call npm run build
  popd
)

if not exist "frontend\dist\index.html" (
  echo Building the frontend ^(first run only, needs Node.js^)...
  pushd frontend
  if not exist node_modules call npm install
  call npm run build
  popd
)

echo.
echo KuberKet is starting at http://127.0.0.1:8000
echo Press Ctrl+C in this window to stop it.
start "" http://127.0.0.1:8000
python -m uvicorn api:app --host 127.0.0.1 --port 8000
