@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Finans paneli baslatiliyor...  http://localhost:5174
echo (Kapatmak icin bu pencereyi kapatin veya Ctrl+C)
start "" "http://localhost:5174"
node server.js
