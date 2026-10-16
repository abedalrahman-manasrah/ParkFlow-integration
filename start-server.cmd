@echo off
cd /d "%~dp0"
docker compose --env-file server/.env -f server/docker-compose.yml -f server/docker-compose.dev.yml up -d --no-build --force-recreate backend
if errorlevel 1 exit /b 1
echo ParkFlow API: http://localhost:4000
