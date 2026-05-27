from pathlib import Path
import sys
sys.path.insert(0, str(Path('.').resolve()))
import config
from parsers.csv_parser import load_jobs, load_equip
jobs = load_jobs(config.CSV_JOB)
equip = {e['id']:e for e in load_equip(config.CSV_EQUIP)}
for j in jobs:
    if j['weapon'] is not None and j['weapon'] >= 0 and j['shield'] is not None and j['shield'] >= 0:
        eq_w = equip.get(j['weapon'], {})
        eq_s = equip.get(j['shield'], {})
        print(f"Job {j['id']} ({j['name']}): weapon={eq_w.get('name','?')} shield={eq_s.get('name','?')}")
