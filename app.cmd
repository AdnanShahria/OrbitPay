@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
where bun >nul 2>&1
if %errorlevel%==0 (
  bun "%SCRIPT_DIR%scripts\app-cli.mjs" %*
) else (
  node "%SCRIPT_DIR%scripts\app-cli.mjs" %*
)
exit /b %errorlevel%
