# Sheet Research

This folder is our working area for reverse-engineering the game sheets into
human-readable website data.

Purpose:
- preserve discoveries even if the app or session crashes
- separate research notes from live website data
- keep a trail of what is confirmed vs guessed

Suggested workflow:
- add raw observations from the sheet
- add in-game verification from manual testing
- promote only confirmed findings into website logic/data

Files:
- `sources.json`: source sheet IDs and tab notes
- `equip-mapping.json`: equipment slot/type translation work
- `job-equip-rules.json`: job equipment permission findings

Status labels:
- `unknown`: not understood yet
- `hypothesis`: likely true, not confirmed in-game
- `confirmed`: checked against the game
