@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "HOST=0.0.0.0"
set "PORT=5059"
if not exist .venv\Scripts\python.exe (
  python -m venv .venv
  if errorlevel 1 goto no_python
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt
)
start "Asset Linker Server" .venv\Scripts\python.exe app.py
timeout /t 3 >nul
start "" "http://localhost:5059"
exit /b 0
:no_python
  echo Python is required to run this tool. Please install Python 3.10+ and retry.
  pause
  exit /b 1
