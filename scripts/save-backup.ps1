param(
    [string]$Repo = '.',
    [string]$BackupRemote = 'origin'
)

Set-StrictMode -Version Latest
Push-Location $Repo

function Run-Git([string]$args) {
    $out = git $args 2>&1
    if ($LASTEXITCODE -ne 0) { throw "git $args failed: $out" }
    return $out
}

# Only create a snapshot if there are working-tree changes (including untracked)
$status = git status --porcelain --untracked-files=all
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Output "No working changes detected. Skipping backup."
    Pop-Location
    exit 0
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$branchName = "backup/autosave-$ts"

Write-Output "Creating autosave snapshot: $branchName"

# Create a stash including untracked files. Use stash so we don't permanently change HEAD.
try {
    $pushOut = git stash push -u -m "autosave $ts" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "stash push failed: $pushOut" }
    # stash now on top; read its ref
    $stashRef = git rev-parse refs/stash 2>&1
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($stashRef)) { throw "failed to read refs/stash" }

    # Create a branch pointing at the stash commit
    git branch $branchName $stashRef | Out-Null

    # Push the backup branch to the backup remote
    Write-Output "Pushing $branchName to $BackupRemote..."
    git push $BackupRemote $branchName 2>&1 | Out-Null

    # Reapply the stash to restore working tree; use pop to remove stash if successful
    $popOut = git stash pop --index 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "git stash pop failed: $popOut -- attempting git stash apply"
        git stash apply --index 2>&1 | Out-Null
        # leave the stash in place if pop failed
    }

    Write-Output "Backup created: $branchName"
}
catch {
    Write-Error "Autosave backup failed: $_"
    # Try to recover: if stash exists and working tree is empty, attempt to apply
    try { git stash apply --index 2>$null | Out-Null } catch { }
    Pop-Location
    exit 1
}

Pop-Location
