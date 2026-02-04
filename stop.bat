@echo off
setlocal

cd /d "%~dp0"

if /i "%~1"=="dry" (
  node scripts\stop.js --dry-run
) else if /i "%~1"=="--dry-run" (
  node scripts\stop.js --dry-run
) else if /i "%~1"=="-n" (
  node scripts\stop.js --dry-run
) else (
  node scripts\stop.js
)

set "STOP_EXIT_CODE=%errorlevel%"

echo.
echo Exit code: %STOP_EXIT_CODE%

rem If launched via Explorer (cmd.exe /c "...bat"), pause before exit
echo %CMDCMDLINE% | findstr /i /c:"/c " >nul 2>&1 && (
  echo.
  pause
)

endlocal
exit /b %STOP_EXIT_CODE%
