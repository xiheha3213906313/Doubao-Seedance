@echo off
setlocal

cd /d "%~dp0"

echo Starting Doubao Seedance Dev (Agentation enabled)...
echo.

:: 1. Try to find packaged node
if exist "bin\node.exe" (
  echo Using packaged Node.js...
  set "NODE_EXE=bin\node.exe"
) else (
  :: 2. Try global node
  where node >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    echo Using global Node.js...
    set "NODE_EXE=node"
  ) else (
    echo Error: Node.js not found!
    echo Please ensure bin\node.exe exists or Node.js is installed.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo Installing dependencies...
  where npm >nul 2>nul
  if %ERRORLEVEL% NEQ 0 (
    echo Error: npm not found!
    echo Please install Node.js and npm, or provide preinstalled node_modules.
    pause
    exit /b 1
  )
  call npm install
  if %ERRORLEVEL% NEQ 0 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist "node_modules\vite\bin\vite.js" (
  echo Error: Vite is missing in node_modules.
  echo Please run "npm install" in this folder.
  pause
  exit /b 1
)

echo Starting dev servers (Backend + Vite)...
"%NODE_EXE%" scripts\dev.js
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Dev server exited with code %ERRORLEVEL%.
  pause
  exit /b %ERRORLEVEL%
)
pause
