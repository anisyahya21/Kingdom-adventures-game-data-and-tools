param(
    [string]$Repo = '.',
    [string]$BackupRemote = 'origin',
    [int]$Keep = 30,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
Push-Location $Repo

Write-Output "Fetching remote refs from $BackupRemote..."
git fetch $BackupRemote --prune 2>$null | Out-Null

$pattern = 'backup/autosave-*'
$lines = git ls-remote --heads $BackupRemote $pattern 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
if (-not $lines) {
    Write-Output "No backup branches found on $BackupRemote matching $pattern"
    Pop-Location
    exit 0
}

$branches = $lines | ForEach-Object { ($_ -split "\t")[1] -replace '^refs/heads/' , '' }

# sort lexically descending (timestamp format yyyyMMdd-HHmmss makes this work)
$sorted = $branches | Sort-Object -Descending

Write-Output "Found $($sorted.Count) backup branches; keeping $Keep newest."

$toDelete = $sorted | Select-Object -Skip $Keep
if (-not $toDelete) {
    Write-Output "Nothing to prune."
    Pop-Location
    exit 0
}

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
