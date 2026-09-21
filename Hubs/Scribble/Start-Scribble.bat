@echo off
REM ====================================================
REM  SCRIBBLE - LOCAL SERVER
REM  Double-click this to run Scribble.
REM
REM  Optional port:   Start-Scribble.bat 8081
REM  Stop it with Ctrl+C, or just close this window.
REM ====================================================

setlocal
cd /d "%~dp0"

set PORT=%1
if "%PORT%"=="" set PORT=8080

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Node.js was not found on this machine.
    echo.
    echo   Scribble needs a server because browsers switch off
    echo   ES modules, service workers and crypto.subtle on
    echo   file:// pages - which is most of what Scribble uses.
    echo.
    echo   Install Node from https://nodejs.org  then run this again.
    echo.
    pause
    exit /b 1
)

echo.
echo   Starting Scribble on port %PORT% ...

REM Give the server a moment to bind before the browser asks for it,
REM otherwise the first load can land on a connection error.
start "" /b cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:%PORT%/Scribble.html"

node "%~dp0dev-server.js" %PORT%

REM Only reached once the server stops.
echo.
echo   Scribble server stopped.
echo.
pause
