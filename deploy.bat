@echo off
REM Dali Party — one-click deploy: commit local changes + push to GitHub.
REM The VPS auto-pulls within ~1 minute (systemd timer dali-deploy.timer).
cd /d "%~dp0"
set "msg=%*"
if "%msg%"=="" set "msg=update"
echo.
echo === Dang day len GitHub: "%msg%" ===
git add -A
git commit -m "%msg%"
if errorlevel 1 echo (Khong co thay doi moi de commit)
git push origin main
if errorlevel 1 (
  echo.
  echo *** PUSH LOI — kiem tra ket noi / dang nhap GitHub ***
) else (
  echo.
  echo === Xong! Server se tu cap nhat trong ~1 phut. ===
  echo Mo: https://dalipart.tranhdali.vn
)
echo.
pause
