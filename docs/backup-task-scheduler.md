Windows Task Scheduler installation notes

1. Save `scripts/save-backup.ps1` to the repository (already added).
2. Open Task Scheduler and create a new task:
   - General: Run whether user is logged on or not (and set to run with highest privileges if needed).
   - Triggers: On a schedule (e.g., every hour) or At log on.
   - Actions: Start a program: `powershell.exe` with argument: `-NoProfile -ExecutionPolicy Bypass -File "C:\path\to\repo\scripts\save-backup.ps1"`
   - Conditions: disable 'Start the task only if the computer is on AC power' if you want it on laptop battery.
   - Settings: Allow task to be run on demand; stop if runs longer than X minutes (optional).

3. Create a second scheduled task (daily) to run `scripts/prune-backups.ps1` with `-Keep 30`.

Notes:
- The local autosave process stashes your working tree temporarily, creates a backup branch from the stash commit, then restores your working tree.
- The task must run on the machine where you edit files to capture uncommitted changes.
- Ensure `git` is on the PATH for the scheduled user (System PATH or full path to git.exe in action).
