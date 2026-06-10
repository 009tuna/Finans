@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Finans Otomasyonu - Gunluk Akis
echo   %date% %time%
echo ============================================

echo [1/5] Guncel veriler cekiliyor (ABD + BIST + Kripto)...
node src\fetch-all.js

echo [2/5] Tahminler cozuluyor...
node src\prediction-resolver.js

echo [3/5] Temel teknik rapor uretiliyor...
node src\report.js

echo [4/5] Panel aciliyor...
start "FinansPanel" /min cmd /c "node server.js"
timeout /t 3 >nul
start "" "http://localhost:5174"

echo [5/5] AI makro/haber katmani uretiliyor (Claude, web arastirmasi - 1-2 dk)...
type routines\daily-report-prompt.md | claude -p --model claude-opus-4-8 --permission-mode bypassPermissions --allowedTools Read Write Edit WebSearch Glob Grep --output-format text

echo Arşiv güncelleniyor...
node scripts\archive-tip.js

echo.
echo Gunluk akis tamamlandi. Panel: http://localhost:5174
