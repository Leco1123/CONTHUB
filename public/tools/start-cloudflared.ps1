$ErrorActionPreference = "Stop"
$log = "C:\Users\leandro.vieira\conthub le\public\tools\cloudflared-live.log"
if (Test-Path $log) {
  Remove-Item -LiteralPath $log -Force
}

& "C:\Users\leandro.vieira\conthub le\public\tools\cloudflared.exe" tunnel --url http://localhost:3000 --no-autoupdate 2>&1 |
  Tee-Object -FilePath $log
