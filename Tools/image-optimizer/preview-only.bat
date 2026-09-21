@echo off
REM Shows what WOULD be converted. Changes nothing at all. Safe to run anytime.
cd /d "%~dp0"
call optimize.bat --dry-run
