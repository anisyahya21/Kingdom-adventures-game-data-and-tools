"""Compress the generated browser combat package into one cacheable static download."""
from pathlib import Path
from shutil import rmtree
from zipfile import ZipFile, ZIP_DEFLATED

app = Path(__file__).resolve().parents[1]
source = app / 'public' / 'battle-runtime'
target = app / 'public' / 'browser-combat.zip'
if not (source / 'browser-runtime-manifest.json').is_file():
    raise SystemExit('Run package-browser-battle-runtime.mjs first')
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(source).as_posix())
rmtree(source)
print(f'{target.name}: {target.stat().st_size} bytes')
