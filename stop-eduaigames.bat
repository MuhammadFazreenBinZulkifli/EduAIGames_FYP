@echo off
REM ===========================================================
REM  EduAIGames - stop the Docker stack (Windows)
REM  Double-click to stop the containers. Your database data is
REM  kept in the "pgdata" volume, so nothing is lost.
REM ===========================================================
setlocal EnableExtensions
cd /d "%~dp0"

title EduAIGames - stop Docker

echo(
echo  Stopping EduAIGames containers...
echo(
docker compose down
if errorlevel 1 (
    echo(
    echo  Could not stop the containers. Is Docker running?
    pause
    exit /b 1
)

echo(
echo  EduAIGames has been stopped. Your data is preserved.
echo  Start again any time with start-eduaigames.bat
echo(
pause
endlocal
