@echo off
set LOG=C:\Users\leandro.vieira\conthub le\public\tools\cloudflared-live.log
if exist "%LOG%" del /f /q "%LOG%"
"C:\Users\leandro.vieira\conthub le\public\tools\cloudflared.exe" tunnel --url http://localhost:3000 --no-autoupdate > "%LOG%" 2>&1
