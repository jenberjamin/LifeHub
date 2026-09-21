@echo off
REM LifeHub image optimizer - double-click this file to run it.
REM Sets up its own private Python environment on first run, then reuses it.

cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo.
    echo   Python is not installed.
    echo   Get it from https://www.python.org/downloads/
    echo   During setup, tick "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo First run - setting up. This takes a minute, only happens once.
    python -m venv .venv
    if errorlevel 1 goto fail
    .venv\Scripts\python.exe -m pip install --quiet --upgrade pip
    .venv\Scripts\python.exe -m pip install --quiet Pillow
    if errorlevel 1 goto fail
    echo Setup done.
    echo.
)

.venv\Scripts\python.exe optimize.py %*
if errorlevel 1 goto fail

echo.
echo Finished.
pause
exit /b 0

:fail
echo.
echo Something went wrong - see the messages above.
pause
exit /b 1
