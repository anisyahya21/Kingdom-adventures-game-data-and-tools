param(
  [string]$EnvFile = "lib/db/.env.local"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot $EnvFile

if (-not (Test-Path $envPath)) {
  Write-Error "Missing env file: $EnvFile"
  Write-Host "Create it from lib/db/.env.example and set DATABASE_URL locally."
  exit 1
}

$line = Get-Content $envPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) {
  Write-Error "DATABASE_URL entry not found in $EnvFile"
  exit 1
}

$value = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Trim('"') }
if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Trim("'") }
if ([string]::IsNullOrWhiteSpace($value)) {
  Write-Error "DATABASE_URL is empty in $EnvFile"
  exit 1
}

$env:DATABASE_URL = $value
Push-Location $repoRoot
try {
  pnpm --filter @workspace/db run push
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Pop-Location
}
