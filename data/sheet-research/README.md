# Sheet Research

This folder is our working area for reverse-engineering the game sheets into
human-readable website data.

For the overall raw-vs-research rule, see [../README.md](../README.md).

Purpose:
- preserve discoveries even if the app or session crashes
- separate research notes from live website data
- keep a trail of what is confirmed vs guessed

Layout:
- `notes/`
  - markdown notes, rebuild manuals, and confirmed discoveries
- `mappings/`
  - JSON mapping files and structured helper data
- `raw-copies/`
  - copied CSVs kept close to research for convenience
- `html-captures/`
  - saved HTML/reference pages used during reverse-engineering

Suggested workflow:
- start with `../Sheet csv/` for canonical raw source data
- add raw observations from the sheet into `notes/`
- add in-game verification from manual testing
- promote only confirmed findings into website logic/data

Files:
- `mappings/sources.json`: source sheet IDs and tab notes
- `mappings/equip-mapping.json`: equipment slot/type translation work
- `mappings/job-equip-rules.json`: job equipment permission findings
- `notes/job-notes.md`: how `Job.csv` currently separates combat vs non-combat, plus mismatch notes
- `notes/facility-notes.md`: facility discoveries and rebuild notes
- `notes/wairo-dungeon.md`: Wairo Dungeon schedule interpretation

Status labels:
- `unknown`: not understood yet
- `hypothesis`: likely true, not confirmed in-game
- `confirmed`: checked against the game
