@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Finans Otomasyonu - Gunluk Akis
echo   %date% %time%
echo ============================================

echo [1/4] Guncel veriler cekiliyor (ABD + BIST + Kripto)...
node src\fetch-all.js

echo [2/4] Temel teknik rapor uretiliyor...
node src\report.js

echo [3/4] Panel aciliyor...
start "FinansPanel" /min cmd /c "node server.js"
timeout /t 3 >nul
start "" "http://localhost:5174"

echo [4/4] AI makro/haber katmani uretiliyor (Claude, web arastirmasi - 1-2 dk)...
type routines\daily-report-prompt.md | claude -p --model claude-opus-4-8 --permission-mode bypassPermissions --allowedTools Read Write Edit WebSearch Glob Grep --output-format text

echo.
echo Gunluk akis tamamlandi. Panel: http://localhost:5174
