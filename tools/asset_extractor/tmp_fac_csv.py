import csv; from pathlib import Path
import sys; sys.path.insert(0, '.')
import config

# Parse the facility CSV properly to find the image/chip column
with open(config.CSV_FACILITY, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    rows = list(reader)

# Row 0 = col group labels, Row 1 = sub-labels, Row 2 = col names, Row 3+ = data
# Find which cols have "dataId", "chips", "combination"
header = rows[2]
print("Relevant header columns:")
for i, h in enumerate(header):
    if h.strip():
        print(f"  col {i:3d}: '{h}'")

print()
# Look at data rows 3-10
print("Data rows cols 0-45:")
for r in rows[3:10]:
    vals = r[:46]
    named = {i: v for i, v in enumerate(vals) if v.strip()}
    print(f"  id={r[0]}, name={r[1]!r}: {named}")

# Also look at 'chips' label in line 1
print()
print("Line 1 sub-labels:")
for i, h in enumerate(rows[1]):
    if h.strip():
        print(f"  col {i:3d}: '{h}'")
