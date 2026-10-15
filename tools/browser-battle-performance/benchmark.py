"""Bounded browser-session parity and end-to-end CPython timing (not a browser rate)."""
import argparse,hashlib,json,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'artifacts/kingdom-adventures/api/_battle_runtime'))
from browser_battle_session import BrowserBattleSession
from combat_replay_export import export_replay
p=argparse.ArgumentParser();p.add_argument('--fixtures',required=True);p.add_argument('--out',required=True);p.add_argument('--baseline');args=p.parse_args()
def digest(replay):return hashlib.sha256(json.dumps(replay,sort_keys=True,separators=(',',':')).encode()).hexdigest()
report={}
for name in ('RL','R4'):
 scenario=json.loads((Path(args.fixtures)/(name+'.scenario.json')).read_text(encoding='utf-8'))
 scenario['holyHerbStock']=1 # Explicit diagnostic stock for the rollback parity check.
 session=BrowserBattleSession(scenario,window_ticks=80,checkpoint_limit=16)
 samples=[];start=time.perf_counter()
 for index in range(6 if name=='RL' else 3):
  t=time.perf_counter();replay=session.start() if index==0 else session.advance(100)
  # Include the same JSON serialization cost as the Pyodide transport.
  payload=json.dumps(replay,separators=(',',':'))
  samples.append(dict(tick=session.stop_tick,seconds=time.perf_counter()-t,bytes=len(payload),events=len(replay['events']),sha256=digest(replay)))
 elapsed=time.perf_counter()-start
 oracle=export_replay(session.working,stop_tick=session.stop_tick,include_events=True)
 assert replay==oracle,('unbranched oracle mismatch',name)
 if name=='RL':
  session.use_consumable('holy_herb',250)
  replay=session.advance(100)
  oracle=export_replay(session.working,stop_tick=session.stop_tick,include_events=True)
  assert replay==oracle,'consumable rollback must preserve the entire replay and RNG state'
 report[name]=dict(samples=samples,seconds=elapsed,ticksPerSecond=(samples[-1]['tick']+1)/elapsed,oracleParity=True,branchSha256=digest(replay))
# The production worker retains enough dense points for 480 ticks of lookahead plus one batch.
# R4 is intentionally short; use the long real fixture for this diagnostic.
long_scenario=json.loads((Path(args.fixtures)/'RL.scenario.json').read_text(encoding='utf-8'));long_scenario['holyHerbStock']=1
ahead=BrowserBattleSession(long_scenario,window_ticks=160,checkpoint_limit=40);ahead.start()
for _ in range(3):ahead.advance(200)
assert len(ahead._checkpoints)<=40
assert 60<=ahead._resume_below(80)['tick']<80,'playback rollback point must stay dense under maximum prefetch'
branched=ahead.use_consumable('holy_herb',80)['replay']
assert branched==export_replay(ahead.working,stop_tick=ahead.stop_tick,include_events=True)
if args.baseline:
 baseline=json.loads(Path(args.baseline).read_text())
 for name,case in report.items():
  assert [x['sha256'] for x in case['samples']]==[x['sha256'] for x in baseline[name]['samples']],('window stream changed',name)
  assert case['branchSha256']==baseline[name]['branchSha256'],('branch stream changed',name)
  case['speedup']=baseline[name]['seconds']/case['seconds']
Path(args.out).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({name:{k:v for k,v in case.items() if k not in ('samples','branchSha256')} for name,case in report.items()}))
