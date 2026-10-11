@echo off
rem Story Zoom guncelleyici (Windows)
rem Bu klasoru GitHub'daki en son surume getirir. Eklenti 1 dakika icinde kendini yeniler.
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git bulunamadi. https://git-scm.com/download/win adresinden kurun.
  pause
  exit /b 1
)
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Guncelleme basarisiz oldu. Klasordeki dosyalari elle degistirdiyseniz geri alin.
  pause
  exit /b 1
)
echo.
echo Guncellendi. Eklenti 1 dakika icinde kendini yenileyecek; sonra Instagram sekmesini yenileyin.
if not "%1"=="/sessiz" timeout /t 5
