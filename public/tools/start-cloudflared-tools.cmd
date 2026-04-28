@echo off
cd /d "C:\Users\leandro.vieira\conthub le\public\tools"
cloudflared.exe tunnel --url http://localhost:3000 --no-autoupdate > cloudflared-live.log 2>&1
