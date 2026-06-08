@echo off
:: ────────────────────────────────────────────────────────────────────────────
::  Scoreboard Pro — Windows batch launcher
::  Double-click this file OR run from CMD:
::    run.bat          → dev mode
::    run.bat --prod   → production mode
::    run.bat --stop   → stop everything
:: ────────────────────────────────────────────────────────────────────────────

:: Check PowerShell is available
where powershell >nul 2>&1
if errorlevel 1 (
    echo [err] PowerShell is required but not found.
    echo       Install it from: https://aka.ms/powershell
    pause
    exit /b 1
)

:: Allow script execution for this session and run run.ps1
powershell -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*

:: Keep window open if there was an error
if errorlevel 1 (
    echo.
    echo [err] Something went wrong. See messages above.
    pause
)
