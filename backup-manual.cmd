@echo off
cd /d "%~dp0"
for %%T in (node mongodump mongorestore mongosh rclone) do (
  where %%T >nul 2>nul
  if errorlevel 1 (
    echo Falta %%T en PATH.
    echo Instala Node.js, MongoDB Database Tools, MongoDB Shell y Rclone antes de continuar.
    echo Consulta docs\OPERATIONS.md, seccion A1.1.
    pause
    exit /b 1
  )
)
call npm run backup:manual
set "result=%errorlevel%"
echo.
if "%result%"=="0" (echo Proceso completado. Revisa el registro local.) else (echo Proceso incompleto. Revisa el registro local y los requisitos.)
pause
exit /b %result%
