@echo off
setlocal
set "AGY_CHAT_EXPORT_SOURCE=%~dp0."
powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $script = Join-Path $env:AGY_CHAT_EXPORT_SOURCE 'install.ps1'; & ([scriptblock]::Create([IO.File]::ReadAllText($script, [Text.Encoding]::UTF8)))"
set "AGY_CHAT_EXPORT_RESULT=%ERRORLEVEL%"
if /i not "%~1"=="--no-pause" pause
exit /b %AGY_CHAT_EXPORT_RESULT%
