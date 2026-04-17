# Data folders

This `data/` directory has two different roles. Keeping those roles separate is important so we do not end up with multiple competing "truths" when rebuilding pages from game data.

## Folder roles

### `Sheet csv/`
- This is the canonical raw source folder.
- These files are the direct CSV exports added to the project.
- When we need to re-check a field, column, or row from the original game data, start here first.
- These files should stay as raw as possible.

### `sheet-research/`
- This is the derived research and documentation folder.
- It stores:
  - markdown notes and rebuild manuals
  - JSON mapping files
  - reverse-engineering discoveries
  - reference copies of raw files when helpful for research
  - captured HTML/reference pages used during reverse-engineering
- This folder explains how to interpret the raw CSVs for the website.

Current subfolders:
- `sheet-research/notes/`
  - human-written discoveries, rebuild manuals, and feature-specific notes
- `sheet-research/mappings/`
  - JSON maps, helper references, and structured interpretation files
- `sheet-research/raw-copies/`
  - research copies of CSV files kept near the notes when convenient
- `sheet-research/html-captures/`
  - saved HTML/reference pages used during investigation

## Source-of-truth rule

When the same data appears in more than one place:

1. `Sheet csv/` = raw source truth
2. `sheet-research/` = interpreted/researched explanation
3. website code = implemented display logic based on the above

If there is a mismatch:
- trust the raw CSV first
- then check whether the research notes explain a game behavior or interpretation layer
- if the website differs from raw CSV on purpose, document that in `sheet-research/notes/`

## Workflow rule

For every important discovery:
- verify it against raw CSV and/or in-game behavior
- write the discovery into `sheet-research/notes/`
- only then promote it into website code

That way, if the page code is ever deleted or rewritten, we still keep the rebuild trail.
