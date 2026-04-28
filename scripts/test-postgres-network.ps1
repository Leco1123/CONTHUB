$ErrorActionPreference = "Stop"

$env:PGPASSWORD = "261202Le"
$Psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

if (-not (Test-Path -LiteralPath $Psql)) {
  $Psql = (Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\bin\\psql\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1).FullName
}

if (-not $Psql) {
  throw "psql.exe nao encontrado."
}

Write-Host "Teste TCP 192.168.0.94:5433" -ForegroundColor Cyan
Test-NetConnection 192.168.0.94 -Port 5433

Write-Host ""
Write-Host "Teste PostgreSQL remoto" -ForegroundColor Cyan
& $Psql -h 192.168.0.94 -p 5433 -U postgres -d painel_db -v ON_ERROR_STOP=1 -c "select current_database(), current_user, inet_server_addr(), inet_server_port();"

Write-Host ""
Write-Host "Teste Prisma" -ForegroundColor Cyan
npm run db:test-remote
