param(
    [string]$Repo = '.',
    [string]$BackupRemote = 'origin',
    [int]$KeepDays = 7,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
Push-Location $Repo

Write-Output "Fetching remote refs from $BackupRemote..."
git fetch $BackupRemote --prune 2>$null | Out-Null

# find backup branches and delete those older than $KeepDays
$pattern = 'backup/autosave-*'
$lines = git ls-remote --heads $BackupRemote $pattern 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if (-not $lines) {
    Write-Output "No backup branches found on $BackupRemote matching $pattern"
    Pop-Location
    exit 0
}

$branches = $lines | ForEach-Object { ($_ -split "\t")[1] -replace '^refs/heads/' , '' }

$cutoff = (Get-Date).AddDays(-$KeepDays)

$toDelete = @()
foreach ($b in $branches) {
    # expect format backup/autosave-YYYYMMDD-HHMMSS
    if ($b -match 'backup/autosave-(\d{8}-\d{6})') {
        $ts = $matches[1]
        try {
            $dt = [datetime]::ParseExact($ts, 'yyyyMMdd-HHmmss', $null)
        }
        catch {
            continue
        }
        if ($dt -lt $cutoff) { $toDelete += $b }
    }
}

if (-not $toDelete) {
    Write-Output "No backup branches older than $KeepDays days found. Nothing to prune."
    Pop-Location
    exit 0
}

Write-Output "Found $($toDelete.Count) branches older than $KeepDays days."
Write-Output "Branches to delete:"
$toDelete | ForEach-Object { Write-Output " - $_" }

if ($DryRun) {
    Write-Output "Dry run enabled; no branches will be deleted."
    Pop-Location
    exit 0
}

foreach ($b in $toDelete) {
    Write-Output "Deleting $b from $BackupRemote..."
    git push $BackupRemote --delete $b 2>&1 | Out-Null
}

Write-Output "Prune complete."
Pop-Location
