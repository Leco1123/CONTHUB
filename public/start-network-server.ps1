param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

function Get-LocalIPv4 {
  $lines = ipconfig | Select-String "Endere.*IPv4|IPv4 Address"

  foreach ($line in $lines) {
    $text = [string]$line.Line
    if ($text -match "(\d{1,3}(\.\d{1,3}){3})") {
      $ip = $matches[1]
      if ($ip -ne "127.0.0.1" -and -not $ip.StartsWith("172.30.")) {
        return $ip
      }
    }
  }

  return "127.0.0.1"
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ip = Get-LocalIPv4

Write-Host ""
Write-Host "ContHub na rede local" -ForegroundColor Cyan
Write-Host "Pasta:" $root
Write-Host "URL local:   http://localhost:$Port/"
Write-Host "URL da rede: http://$ip`:$Port/"
Write-Host ""
Write-Host "Se o Windows pedir permissao de firewall, clique em Permitir acesso." -ForegroundColor Yellow
Write-Host "Para parar o servidor, pressione Ctrl+C." -ForegroundColor Yellow
Write-Host ""

Set-Location $root
python -m http.server $Port --bind 0.0.0.0
