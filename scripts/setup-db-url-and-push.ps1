param(
  [string]$EnvFile = "lib/db/.env.local"
)

$ErrorActionPreference = "Stop"

function ConvertTo-PlainText([System.Security.SecureString]$secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot $EnvFile
$envDir = Split-Path -Parent $envPath

if (-not (Test-Path $envDir)) {
  New-Item -ItemType Directory -Path $envDir -Force | Out-Null
}

Write-Host "Paste your EXTERNAL database URL for local schema push." -ForegroundColor Cyan
Write-Host "Input is hidden and will not be printed." -ForegroundColor Yellow
$secureUrl = Read-Host "DATABASE_URL" -AsSecureString
$plainUrl = ConvertTo-PlainText $secureUrl

# Normalize pasted input from clipboards/UI wrappers.
$plainUrl = $plainUrl.Trim()
if ($plainUrl.StartsWith('"') -and $plainUrl.EndsWith('"')) { $plainUrl = $plainUrl.Trim('"') }
if ($plainUrl.StartsWith("'") -and $plainUrl.EndsWith("'")) { $plainUrl = $plainUrl.Trim("'") }
if ($plainUrl.StartsWith("<") -and $plainUrl.EndsWith(">")) { $plainUrl = $plainUrl.Trim('<', '>') }

if ([string]::IsNullOrWhiteSpace($plainUrl)) {
  throw "DATABASE_URL cannot be empty."
}
if ($plainUrl -notmatch "^postgres(ql)?://") {
  throw "DATABASE_URL must start with postgres:// or postgresql://"
}

Set-Content -Path $envPath -Value "DATABASE_URL=$plainUrl" -Encoding UTF8
Write-Host "Wrote local env file: $EnvFile" -ForegroundColor Green

$ignored = git -C $repoRoot check-ignore -q $EnvFile; $isIgnored = ($LASTEXITCODE -eq 0)
if (-not $isIgnored) {
  Write-Warning "$EnvFile is not ignored by git. Check .gitignore before continuing."
} else {
  Write-Host "$EnvFile is gitignored." -ForegroundColor Green
}

$env:DATABASE_URL = $plainUrl
try {
  Push-Location $repoRoot
  try {
    pnpm --filter @workspace/db run push
    if ($LASTEXITCODE -ne 0) {
      throw "Schema push failed."
    }
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}

Write-Host "Schema push completed successfully." -ForegroundColor Green
