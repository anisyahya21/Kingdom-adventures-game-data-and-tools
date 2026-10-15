"""Bounded original-ARM64 sound gain and screen rectangle reference export."""
import hashlib,json,math,struct,sys
from pathlib import Path
from elftools.elf.elffile import ELFFile
from unicorn import Uc,UC_ARCH_ARM64,UC_MODE_ARM,UC_HOOK_CODE
from unicorn.arm64_const import *
ROOT=Path(__file__).resolve().parents[3]
APP=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'KA-Website/artifacts/kingdom-adventures'
binary=ROOT/'RE-evidence/G2.1/39257e72291d/inputs/libil2cpp.so'
digest=hashlib.sha256(binary.read_bytes()).hexdigest()
assert digest=='fb834373cb3bd1dc7dac941fcf94113f3b5123e033cf0a41d5e00c0656e30208'
u=Uc(UC_ARCH_ARM64,UC_MODE_ARM)
with binary.open('rb') as f:
 for s in ELFFile(f).iter_segments():
  if s['p_type']=='PT_LOAD':
   start=s['p_vaddr']&~4095;end=(s['p_vaddr']+s['p_memsz']+4095)&~4095
   u.mem_map(start,end-start);u.mem_write(s['p_vaddr'],s.data())
u.mem_map(0x10000000,0x100000);u.mem_map(0x20000000,0x10000);u.mem_map(0x30000000,0x1000)
def w32(a,v):u.mem_write(a,struct.pack('<I',v&0xffffffff))
def w64(a,v):u.mem_write(a,struct.pack('<Q',v))
def r(n):return u.reg_read(globals()['UC_ARM64_REG_'+n])
def f(n):return struct.unpack('<f',struct.pack('<I',r(n)))[0]
obj,sound,klass,static,ptr,out=range(0x10001000,0x10007000,0x1000)
w64(0x2f5b810,ptr);w64(ptr,klass);w32(klass+0xe0,1);w64(klass+0xb8,static)
u.mem_write(0x316df07,b'\x01');captured=[]
def hook(machine,address,size,data):
 if 0x235ae8c<=address<0x235aff4 or 0x23513e0<=address<0x2351444 or 0x242b9ac<=address<0x242b9e8 or 0x23fe4fc<=address<0x23fe5b4:return
 if address==0x23592e0:machine.reg_write(UC_ARM64_REG_X0,sound)
 elif address==0x2b80e84:captured.append(f('S0'))
 elif address==0x23dd630:
  bits=struct.unpack('<I',struct.pack('<f',math.sin(math.radians(f('S0')))))[0];machine.reg_write(UC_ARM64_REG_S0,bits)
 else:raise RuntimeError(f'unexpected native call {address:#x}')
 machine.reg_write(UC_ARM64_REG_PC,r('LR'))
u.hook_add(UC_HOOK_CODE,hook)
def call(address,values):
 u.reg_write(UC_ARM64_REG_SP,0x20008000);u.reg_write(UC_ARM64_REG_LR,0x30000000)
 for i,v in enumerate(values):u.reg_write(globals()['UC_ARM64_REG_X'+str(i)],v&0xffffffffffffffff)
 u.emu_start(address,0x30000000,count=10000)
def gain(volume,platform=2,base=255,mute=False,editor=False):
 w32(static,platform);u.mem_write(static+0x30,bytes([editor]));w32(obj+0x10,volume)
 u.mem_write(obj+0x14,bytes([mute]));w64(obj+0x18,sound);w32(sound+0x30,base)
 captured.clear();call(0x235ae8c,[obj]);assert len(captured)==1;return captured[0]
gains={name:[gain(v,p) for v in range(256)] for name,p in [('android',2),('steam',4)]}
checks=0
for p in (2,3,4):
 for v in (0,1,64,127,200,255):
  assert gain(v,p,mute=True)==0;checks+=1
  assert abs(gain(v,p,base=127)-gain(v,p)*127/255)<1e-6;checks+=1
for v in range(256):assert abs(gains['android'][v]-v/255)<1e-7;checks+=1
human=json.loads((APP/'src/game-data/human-battle-animation.json').read_text())
monster=json.loads((APP/'src/game-data/battle-animation.json').read_text())
def bounds(frames):
 eligible=[r for r in frames if not (0<=r['tex']+9<=8 and (1<<(r['tex']+9))&0x103)]
 if not eligible:return [0,0,0,0]
 x=min(r['transX'] for r in eligible);y=min(r['transY'] for r in eligible)
 return [x,y,max(r['transX']+r['w'] for r in eligible)-x,max(r['transY']+r['h'] for r in eligible)-y]
clips=[]
for c in human['clips'].values():clips.append((str(c['humanBase']),c))
for group in ('reactions','walks'):
 for c in human[group].values():
  for direction in c['directions']:clips.append((str(direction['sebId']),direction))
human_bounds={key:dict(rect=bounds(c['frames']),flip=bool(c.get('flip',False))) for key,c in clips}
monster_bounds={key:dict(rect=bounds(c['frames']),flip=False) for key,c in monster['clips'].items() if c['group']=='monster'}
for record in [*human_bounds.values(),*monster_bounds.values()]:
 x,y,w,h=record['rect'];u.mem_write(sound+0x50,struct.pack('<4h',h,w,y,x))
 for mask in range(4):
  u.mem_write(sound+0x40,bytes([mask]));u.reg_write(UC_ARM64_REG_X8,out);call(0x23513e0,[sound])
  got=struct.unpack('<4i',u.mem_read(out,16));expected=(x if not mask&2 else -2*math.trunc(w/2)-x,y if not mask&1 else -2*math.trunc(h/2)-y,w,h)
  assert got==expected,(got,expected);checks+=1
edge_cases=[]
for x in (-11,-10,-9,0,239,240,241):
 for y in (-11,-10,-9,0,196,197,198):
  call(0x242b9ac,[x,y,10,10,0,0,240,197]);got=bool(r('W0'))
  assert got==(x+10>=0 and x<=240 and y+10>=0 and y<=197);checks+=1
  edge_cases.append([x,y,got])
result=dict(binarySha256=digest,gainRva='0x235ae8c',config='kairo.common.cfg.Config.APPLI_TYPE: Android=2, iPhone=3, Steam=4; UNITY_EDITOR=false',gains=gains,humanBounds=human_bounds,monsterBounds=monster_bounds)
(APP/'src/game-data/combat-sound-rules.json').write_text(json.dumps(result,indent=2)+'\n')
evidence=ROOT/'RE-evidence/20261015-combat-sound-completion';evidence.mkdir(exist_ok=True)
(evidence/'native-checks.json').write_text(json.dumps(dict(checks=checks,passed=True,rectangleCases=edge_cases,rules=result),indent=2)+'\n')
print(json.dumps(dict(passed=checks,humanClips=len(human_bounds),monsterClips=len(monster_bounds),output=str(APP/'src/game-data/combat-sound-rules.json'))))
