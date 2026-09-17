@echo off
title AlphaDesk
cd /d "%~dp0"
echo.
echo   AlphaDesk - demarrage...
echo.
start "" http://localhost:4321
node server.js
pause
