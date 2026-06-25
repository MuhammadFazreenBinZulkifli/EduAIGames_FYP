@echo off
REM ===========================================================
REM  EduAIGames - one-click Docker launcher (Windows)
REM  Double-click this file to build & run the app in Docker.
REM  Opens http://localhost:5000 when ready.
REM ===========================================================
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title EduAIGames - Docker launcher

echo(
echo  ============================================
echo   Starting EduAIGames in Docker
echo  ============================================
echo(

REM --- Make sure the Docker engine is running ---
docker info >nul 2>&1
if errorlevel 1 (
    echo  Docker is not running. Launching Docker Desktop...
    if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo  Could not find Docker Desktop automatically.
        echo  Please open Docker Desktop manually, then run this again.
        pause
        exit /b 1
    )

    echo  Waiting for Docker to be ready ^(this can take a minute^)...
    call :waitForDocker
    if errorlevel 1 (
        echo  Docker did not start in time. Open Docker Desktop, then retry.
        pause
        exit /b 1
    )
)

echo  Docker is ready. Building and starting containers...
echo(
docker compose up --build -d
if errorlevel 1 (
    echo(
    echo  Something went wrong starting the containers. See the messages above.
    pause
    exit /b 1
)

echo(
echo  Containers are up. Opening http://localhost:5000 ...
start "" http://localhost:5000

echo(
echo  EduAIGames is now running in Docker.
echo  - Web app:  http://localhost:5000
echo  - To stop:  run stop-eduaigames.bat
echo(
echo  You can close this window; the app keeps running in Docker.
pause
exit /b 0

REM --- Poll until the Docker engine responds (max ~120s) ---
:waitForDocker
set /a __tries=0
:wfd_loop
timeout /t 3 >nul
docker info >nul 2>&1
if not errorlevel 1 exit /b 0
set /a __tries+=1
if !__tries! geq 40 exit /b 1
goto wfd_loop
