@echo off
title Poppy Engine Editor
cd /d "%~dp0"

set PORT=7331
set PAGE=PoppyEngine-Editor.html

echo.
echo   Starting Poppy Engine Editor...
echo   Folder: %CD%
echo.

REM --- make sure the html is actually here ---
if not exist "%PAGE%" (
    echo   [X] %PAGE% not found in this folder.
    echo       Check the file name or the path at the top of this script.
    echo.
    pause
    exit /b
)

REM --- make sure nothing else is squatting on the port ---
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo   [X] Port %PORT% is already in use by another server.
    echo       Close it - or change PORT at the top of this script - and try again.
    echo.
    pause
    exit /b
)

REM --- find python ---
set PY=
where py >nul 2>&1 && set PY=py
if not defined PY where python >nul 2>&1 && set PY=python

if not defined PY (
    echo   [X] Python not found on this machine.
    echo       Install it from python.org, or use VS Code Live Server instead.
    echo.
    pause
    exit /b
)

start "" cmd /c "timeout /t 2 >nul && start http://localhost:%PORT%/%PAGE%"

echo   Server running at http://localhost:%PORT%/%PAGE%
echo   Keep this window OPEN while you work.
echo   Close it (or press Ctrl+C) when you're done.
echo.

%PY% -m http.server %PORT%

pause
