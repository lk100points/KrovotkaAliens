@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if not errorlevel 1 goto use_python
echo Python was not found. Install Python 3 and try again.
pause
exit /b 1

:use_py
start "Krovotkinskaya server" /min cmd /c "py -m http.server 8000"
goto open_browser

:use_python
start "Krovotkinskaya server" /min cmd /c "python -m http.server 8000"

:open_browser
timeout /t 2 /nobreak >nul
start "" http://localhost:8000
endlocal
