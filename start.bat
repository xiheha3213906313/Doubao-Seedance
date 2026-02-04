@echo off
echo Starting Doubao Seedance Server...
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

:: 3. Pick an available port (default 3000)
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$p=3000; while($true){ try{ $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p); $l.Start(); $l.Stop(); break } catch { $p++ } }; $p"`) do set "PORT=%%P"
echo Using port: %PORT%

:: 4. Run Server
echo Opening browser...
start "" "http://localhost:%PORT%"
set "PORT=%PORT%"
"%NODE_EXE%" server.js

pause
