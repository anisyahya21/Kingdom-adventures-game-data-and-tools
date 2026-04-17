# Wairo Dungeon research

Source file:
- `KA GameData - Guerrilla.csv`

Source header:
- `aka Wairo Dungeon`
- columns: `id,date,hour,terrain`

## Confirmed interpretation

- `date` is the day of the month.
- `hour` is the spawn hour in Japan time (`JST`, UTC+9).
- `terrain` is currently always `1` in the CSV rows we have.
- The CSV represents a monthly schedule, not a day-of-week rotation.

## Current website behavior

- The World Map page has a `Wairo Dungeon` tab.
- Spawn entries are converted from JST into the viewer's local time before display.
- The page shows:
  - all current-month spawn times
  - a countdown to the next spawn
  - the source JST hour alongside the localized display

## Confirmed schedule quirks from the CSV

- Day `1` has three entries: `09:00`, `13:00`, `18:00` JST.
- Day `30` has two entries: `15:00`, `22:00` JST.
- Day `31` has two entries: `10:00`, `21:00` JST.
- Most other days have one entry.

## Important rebuild note

- Do **not** interpret these hours as local browser time.
- Treat the CSV hours as JST first, then convert to local time for display.
- If the page is rebuilt later, reuse this rule so timers stay consistent with how weekly conquest is already shown locally.
