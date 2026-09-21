@echo off
title Pull PoppyEngine
REM --- LifeHub root = two folders up from this file, so renaming/moving is safe ---
cd /d "%~dp0..\.."

echo.
echo   Rebuilding JS\poppy\PoppyEngine-core.js from the editor's Firebase...
echo.

REM --- node does the work; without it there is nothing to run ---
where node >nul 2>&1
if errorlevel 1 (
    echo   [X] Node.js not found on this machine.
    echo       Install it from nodejs.org, then run this again.
    echo.
    pause
    exit /b
)

node "Tools\Poppy-engine-editor\pull-engine.js" %*

echo.
pause
