@echo off
rem 더블클릭용: main 최신 받고 캠퍼스 지도 실행 (run.ps1 호출)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
pause
