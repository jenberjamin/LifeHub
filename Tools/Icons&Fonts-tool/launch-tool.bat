@echo off
cd /d "%~dp0"
start http://localhost:8080/Icons^&Fonts-tool.html
npx http-server -p 8080