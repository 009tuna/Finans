@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Finans - Astra arastirma ve tahmin olcumu
node scripts\daily-research.js
if errorlevel 1 exit /b 1
echo Gunluk akis tamamlandi. https://finans-dashboard-iota.vercel.app/
