@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== Publicar Otto =====
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Esta carpeta no es un repositorio git.
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git branch --show-current') do set "BRANCH=%%b"
echo Rama: %BRANCH%
echo.

for /f "delims=" %%c in ('git status --porcelain') do set "HAYCAMBIOS=1"
if not defined HAYCAMBIOS (
  echo No hay cambios que publicar.
  echo.
  pause
  exit /b 0
)

echo Cambios que se van a publicar:
echo ------------------------------
git status --short
echo ------------------------------
echo.

set "MSG="
set /p "MSG=Mensaje del commit (Intro = Actualizacion %date%): "
if not defined MSG set "MSG=Actualizacion %date%"
set "MSG=%MSG:"=%"

set "OK="
set /p "OK=Publicar estos cambios en %BRANCH%? (S/N): "
if /i not "%OK%"=="S" (
  echo Cancelado. No se ha hecho nada.
  pause
  exit /b 0
)

git add -A

rem Seguridad: nunca subir el archivo .env
git diff --cached --name-only | findstr /i /r /c:"\.env$" >nul
if not errorlevel 1 (
  git reset -q
  echo.
  echo ALTO: hay un archivo .env entre los cambios. No se ha publicado nada.
  echo Comprueba que .env esta en .gitignore.
  pause
  exit /b 1
)

git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo El commit ha fallado. No se ha subido nada.
  pause
  exit /b 1
)

git push
if errorlevel 1 (
  echo.
  echo El commit esta hecho pero el push ha fallado. Revisa el mensaje de arriba.
  pause
  exit /b 1
)

echo.
echo Listo. Vercel desplegara los cambios en uno o dos minutos.
echo.
pause
