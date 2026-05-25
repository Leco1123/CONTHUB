param(
  [string]$BackupRoot = "",
  [string]$DatabaseUrl = "",
  [string]$SheetBackupRoot = ""
)

$ErrorActionPreference = "Stop"

function Resolve-ConfigValue {
  param(
    [string]$ExplicitValue,
    [string]$EnvName
  )

  if ($ExplicitValue -and $ExplicitValue.Trim().Length -gt 0) {
    return $ExplicitValue.Trim()
  }

  $value = [Environment]::GetEnvironmentVariable($EnvName)
  if ($value -and $value.Trim().Length -gt 0) {
    return $value.Trim()
  }

  return ""
}

$resolvedBackupRoot = Resolve-ConfigValue -ExplicitValue $BackupRoot -EnvName "CONTHUB_BACKUP_ROOT"
if (-not $resolvedBackupRoot) {
  $resolvedBackupRoot = Join-Path $PSScriptRoot "..\generated\backups"
}

$resolvedDatabaseUrl = Resolve-ConfigValue -ExplicitValue $DatabaseUrl -EnvName "DATABASE_URL"
$resolvedSheetBackupRoot = Resolve-ConfigValue -ExplicitValue $SheetBackupRoot -EnvName "SHEET_BACKUP_ROOT"

if (-not $resolvedDatabaseUrl) {
  throw "DATABASE_URL não encontrado. Informe -DatabaseUrl ou configure a variável de ambiente."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$targetDir = Join-Path $resolvedBackupRoot $timestamp
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$dbDumpFile = Join-Path $targetDir "database.dump"
$pgDumpCmd = Get-Command "pg_dump" -ErrorAction SilentlyContinue
if (-not $pgDumpCmd) {
  throw "pg_dump não encontrado no PATH."
}

& $pgDumpCmd.Source --dbname="$resolvedDatabaseUrl" --file="$dbDumpFile" --format=custom --no-owner --no-privileges

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump retornou código $LASTEXITCODE."
}

if ($resolvedSheetBackupRoot -and (Test-Path $resolvedSheetBackupRoot)) {
  $sheetArchive = Join-Path $targetDir "sheet-backups.zip"
  Compress-Archive -Path (Join-Path $resolvedSheetBackupRoot "*") -DestinationPath $sheetArchive -Force
}

Write-Host "Backup concluído:"
Write-Host "Diretório: $targetDir"
Write-Host "Banco: $dbDumpFile"
