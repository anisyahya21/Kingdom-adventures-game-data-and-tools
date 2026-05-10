"""Diagnose grid row positions in IMG_0660.png by sampling pixel brightness."""
from PIL import Image

img = Image.open(r'C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\artifacts\kingdom-adventures\public\Images\IMG_0660.png')

# Sample at x=200, sweep y from 400 to 2200
col_x = 200
dark_runs = []
in_dark = False
dark_start = 0

for y in range(400, 2200):
    r, g, b = img.getpixel((col_x, y))[:3]
    avg = (r + g + b) // 3
    if avg < 30 and not in_dark:
        in_dark = True
        dark_start = y
    elif avg >= 30 and in_dark:
        in_dark = False
        dark_runs.append((dark_start, y - 1, y - dark_start))

print("Dark bands (likely row separators or UI bars):")
for s, e, length in dark_runs:
    print(f"  y={s}–{e}  ({length}px)")

# Also print brightness at every 20px for manual inspection
print("\ny  avg")
for y in range(400, 2200, 10):
    r, g, b = img.getpixel((col_x, y))[:3]
    avg = (r + g + b) // 3
    bar = "#" * (avg // 8)
    print(f"{y:4d}  {avg:3d}  {bar}")
