@echo off
REM Installs the pre-commit hook, so images are optimized automatically
REM every time you commit. Run this ONCE per computer, after Git is set up.
REM Re-running it is harmless.

cd /d "%~dp0"

if not exist "..\..\.git" (
    echo.
    echo   This folder is not a Git repository yet, so there is no
    echo   commit for the hook to attach to.
    echo.
    echo   Set up Git first, then run this file again.
    echo.
    pause
    exit /b 1
)

if not exist "..\..\.git\hooks" mkdir "..\..\.git\hooks"
copy /y "pre-commit" "..\..\.git\hooks\pre-commit" >nul
if errorlevel 1 (
    echo Could not copy the hook - see the message above.
    pause
    exit /b 1
)

echo.
echo   Hook installed.
echo   From now on, every commit converts new images first.
echo.
if not exist ".venv\Scripts\python.exe" (
    echo   One more step: double-click optimize.bat once, so the hook
    echo   has its Python environment. Until then, commits will stop
    echo   and remind you.
    echo.
)
pause
