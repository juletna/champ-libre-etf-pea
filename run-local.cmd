@echo off
setlocal
set "PROJECT_DIR=%~dp0"
if not exist "%PROJECT_DIR%app\dist\index.html" (
  echo Interface compilee absente. Dans app\, executez npm ci puis npm run build.
  exit /b 1
)
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  py -3 "%PROJECT_DIR%local_server.py" --open %*
) else (
  python "%PROJECT_DIR%local_server.py" --open %*
)
