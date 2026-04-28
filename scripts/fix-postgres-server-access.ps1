param(
  [string]$DbName = "painel_db",
  [string]$DbUser = "postgres",
  [string]$DbPassword = "261202Le",
  [int]$DbPort = 5433,
  [string]$AllowedCidr = "192.168.0.0/24"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-PostgresServices {
  Get-CimInstance Win32_Service |
    Where-Object {
      $_.Name -match "postgres|pgsql" -or
      $_.DisplayName -match "postgres|pgsql" -or
      $_.PathName -match "postgres"
    } |
    Sort-Object Name
}

function Get-DataDirFromService($Service) {
  $pathName = [string]$Service.PathName
  $match = [regex]::Match($pathName, '-D\s+"([^"]+)"')
  if ($match.Success) { return $match.Groups[1].Value }

  $match = [regex]::Match($pathName, "-D\s+([^\s]+)")
  if ($match.Success) { return $match.Groups[1].Value }

  return $null
}

function Set-ConfigValue($Path, $Key, $Value) {
  $content = Get-Content -LiteralPath $Path
  $pattern = "^\s*#?\s*$([regex]::Escape($Key))\s*="
  $line = "$Key = $Value"
  $found = $false

  $next = foreach ($item in $content) {
    if ($item -match $pattern) {
      $found = $true
      $line
    } else {
      $item
    }
  }

  if (-not $found) {
    $next += $line
  }

  Set-Content -LiteralPath $Path -Value $next -Encoding UTF8
}

function Add-PgHbaLine($Path, $Line) {
  $content = Get-Content -LiteralPath $Path
  $normalizedTarget = ($Line -replace "\s+", " ").Trim()
  $exists = $content | Where-Object { (($_ -replace "\s+", " ").Trim()) -eq $normalizedTarget }

  if (-not $exists) {
    Add-Content -LiteralPath $Path -Value $Line -Encoding UTF8
  }
}

Write-Step "Localizando PostgreSQL no servidor"
$services = @(Get-PostgresServices)
if (-not $services.Count) {
  throw "Nenhum servico PostgreSQL encontrado neste servidor."
}

$candidates = foreach ($service in $services) {
  $dataDir = Get-DataDirFromService $service
  if (-not $dataDir) { continue }

  $postgresqlConf = Join-Path $dataDir "postgresql.conf"
  $pgHbaConf = Join-Path $dataDir "pg_hba.conf"
  if (-not (Test-Path -LiteralPath $postgresqlConf) -or -not (Test-Path -LiteralPath $pgHbaConf)) { continue }

  $confText = Get-Content -LiteralPath $postgresqlConf -Raw
  $configuredPort = $null
  $portMatch = [regex]::Match($confText, "(?m)^\s*port\s*=\s*(\d+)")
  if ($portMatch.Success) { $configuredPort = [int]$portMatch.Groups[1].Value }

  [pscustomobject]@{
    Service = $service
    DataDir = $dataDir
    PostgresqlConf = $postgresqlConf
    PgHbaConf = $pgHbaConf
    Port = $configuredPort
  }
}

$target = @($candidates | Where-Object { $_.Port -eq $DbPort } | Select-Object -First 1)
if (-not $target) {
  $target = @($candidates | Select-Object -First 1)
}
if (-not $target) {
  throw "Nao consegui localizar postgresql.conf/pg_hba.conf nos servicos encontrados."
}

$target = $target[0]
Write-Host "Servico: $($target.Service.Name)"
Write-Host "Data dir: $($target.DataDir)"
Write-Host "postgresql.conf: $($target.PostgresqlConf)"
Write-Host "pg_hba.conf: $($target.PgHbaConf)"

Write-Step "Criando backup dos arquivos de configuracao"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath $target.PostgresqlConf -Destination "$($target.PostgresqlConf).bak-$stamp" -Force
Copy-Item -LiteralPath $target.PgHbaConf -Destination "$($target.PgHbaConf).bak-$stamp" -Force

Write-Step "Liberando PostgreSQL para rede"
Set-ConfigValue -Path $target.PostgresqlConf -Key "listen_addresses" -Value "'*'"
Set-ConfigValue -Path $target.PostgresqlConf -Key "port" -Value "$DbPort"

$authMethod = "scram-sha-256"
Add-PgHbaLine -Path $target.PgHbaConf -Line "host    $DbName    $DbUser    $AllowedCidr    $authMethod"
Add-PgHbaLine -Path $target.PgHbaConf -Line "host    $DbName    $DbUser    127.0.0.1/32    $authMethod"
Add-PgHbaLine -Path $target.PgHbaConf -Line "host    $DbName    $DbUser    ::1/128         $authMethod"

Write-Step "Reiniciando servico PostgreSQL"
Restart-Service -Name $target.Service.Name -Force
Start-Sleep -Seconds 4

Write-Step "Localizando psql.exe"
$psql = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\bin\\psql\.exe$" } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $psql) {
  throw "psql.exe nao encontrado em C:\Program Files\PostgreSQL."
}

$env:PGPASSWORD = $DbPassword

Write-Step "Ajustando usuario e banco"
& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "ALTER USER $DbUser WITH PASSWORD '$DbPassword';"

$exists = & $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DbName';"
if (($exists -join "").Trim() -ne "1") {
  & $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DbName;"
}

& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE $DbName TO $DbUser;"
& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "GRANT USAGE, CREATE ON SCHEMA public TO $DbUser;"
& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DbUser;"
& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DbUser;"
& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DbUser;"
& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DbUser;"

Write-Step "Liberando firewall do Windows na porta $DbPort"
if (-not (Get-NetFirewallRule -DisplayName "PostgreSQL $DbPort" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "PostgreSQL $DbPort" -Direction Inbound -Protocol TCP -LocalPort $DbPort -Action Allow | Out-Null
}

Write-Step "Teste local no servidor"
& $psql.FullName -h 127.0.0.1 -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -c "select current_database(), current_user, inet_server_addr(), inet_server_port();"

Write-Host ""
Write-Host "OK: servidor PostgreSQL liberado para $AllowedCidr na porta $DbPort." -ForegroundColor Green
Write-Host "Agora rode no PC do app: npm run db:test-remote" -ForegroundColor Green
