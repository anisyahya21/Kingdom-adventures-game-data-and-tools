# Kingdom Adventures Icon Pipeline

Local-only tool for extracting consistent square icons from mobile screenshots and manually mapping those icons to verified game item/equipment names.

The tool deliberately keeps each responsibility separate:

- `app.py` runs the Flask UI and stores mappings.
- `crop_profile_equipment.py` crops fixed character equipment slots.
- `crop_inventory_items.py` crops inventory grid slots from scrolling screenshots.
- `finalize_mapped_icons.py` copies mapped raw crops into final named PNG files.

No OCR, AI recognition, CSV matching, or automatic renaming happens in the croppers.

## Installation

From the repository root:

```bat
cd tools\icon_pipeline
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Run

From the repository root:

```bat
python tools/icon_pipeline/app.py
```

Open:

```txt
http://127.0.0.1:5057
```

Everything stays on your machine. Uploaded screenshots are saved locally in `tools/icon_pipeline/input/screenshots`.

## Workflow

1. Upload PNG/JPG screenshots in the local UI.
2. Run the equipment cropper or inventory cropper.
3. Review the raw crop gallery.
4. Map each raw crop to a game name with the searchable text picker.
5. Save mappings.
6. Finalize/export mapped icons.

Raw crop files are never renamed or deleted by the UI. Finalization copies them into `output/mapped_icons`.

## Folder Structure

```txt
tools/icon_pipeline/
  app.py
  crop_profile_equipment.py
  crop_inventory_items.py
  finalize_mapped_icons.py
  requirements.txt
  README.md
  input/
    screenshots/
  output/
    raw_crops/
    mapped_icons/
    debug/
    icon_mapping.json
    icon_mapping.csv
  templates/
    index.html
  static/
    styles.css
    app.js
```

## Name Sources

The UI loads possible names from these CSVs when present:

- `data/sheet-research/raw-copies/KA GameData - Equip.csv`
- `data/Sheet csv/KA GameData - Item.csv`

Names are only suggestions. Manual text input still works if the CSVs are missing or incomplete.

Name cleanup rules:

- `A/ Kairo Sword` becomes `A- Kairo Sword`
- tags like `<pic=...>` are stripped

## Mapping Files

Mappings are stored in:

- `output/icon_mapping.json`
- `output/icon_mapping.csv`

Example:

```json
{
  "raw_000001.png": "S- Fire Spear",
  "raw_000002.png": "A- Kairo Sword"
}
```

Duplicate mapped names are allowed during review but shown as warnings in the UI. During finalization, duplicate output filenames receive suffixes instead of overwriting existing files.

## Crop Settings

Edit crop settings at the top of the cropper scripts.

For equipment/profile screenshots:

- `OUTPUT_SIZE`
- `EXPECTED_SCREEN_SIZE`
- `SCALE_COORDINATES_WHEN_SIZE_DIFFERS`
- `EQUIPMENT_CROP_BOXES`
- `DEBUG_SAVE_OVERLAY`

For inventory screenshots:

- `OUTPUT_SIZE`
- `EXPECTED_SCREEN_SIZE`
- `GRID_SETTINGS`
- `ICON_CROP_RELATIVE_BOX`
- `SKIP_PARTIAL_SLOTS`
- `DEBUG_SAVE_OVERLAY`

After changing settings, run the cropper and inspect `output/debug`. Debug overlays show exactly where crops were taken.

## Troubleshooting

If crops are shifted:

- Open the newest debug overlay in `output/debug`.
- Adjust the configured crop boxes or grid settings.
- Run the cropper again.

If finalization says mappings are missing:

- Save mappings in the UI before finalizing.
- Confirm raw crops still exist in `output/raw_crops`.

If duplicate names exist:

- Use the duplicate filter in the UI.
- Either clear incorrect duplicates or keep them. Finalization will append safe suffixes.

If the UI starts but name suggestions are empty:

- Confirm the two CSV source paths exist.
- Continue manually; suggestions are optional.
