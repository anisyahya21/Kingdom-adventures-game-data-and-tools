"""Bounded read-only exports from canonical method extents; preserve tails after RET."""
import argparse, hashlib, json, sqlite3
from pathlib import Path
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN
from elftools.elf.elffile import ELFFile
root=Path('A:/KingdomAdventurersOptimizer/project')
db=root/'RE-evidence/20260920-native-index/build/ka-index.sqlite'
c=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True); c.row_factory=sqlite3.Row
binary=root/'RE-evidence/G2.1/39257e72291d/inputs/libil2cpp.so'
blob=binary.read_bytes(); digest=hashlib.sha256(blob).hexdigest()
assert digest=='fb834373cb3bd1dc7dac941fcf94113f3b5123e033cf0a41d5e00c0656e30208'
with binary.open('rb') as f: segments=[dict(s.header) for s in ELFFile(f).iter_segments() if s['p_type']=='PT_LOAD']
names=dict(c.execute('select rva,name from methods'))
engine=Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
out=Path('docs/chaos-stone-review/native-full-extents');out.mkdir(parents=True,exist_ok=True)
records=json.loads((out/'manifest.json').read_text()).get('methods',[]) if (out/'manifest.json').exists() else []
records=[entry for entry in records if entry['rva'] not in {hex(int(arg,16)) for arg in __import__('sys').argv[1:]}]
for arg in __import__('sys').argv[1:]:
 r=int(arg,16); extent=c.execute('select * from code_map where rva=?',(r,)).fetchone(); assert extent
 count=extent['instrs']; assert count<4000
 segment=next(s for s in segments if s['p_vaddr']<=r<s['p_vaddr']+s['p_filesz'])
 off=segment['p_offset']+r-segment['p_vaddr']; code=blob[off:off+count*4]
 lines=[]
 for ins in engine.disasm(code,r):
  label=names.get(int(ins.op_str[1:],16),'') if ins.mnemonic in ('bl','b') and ins.op_str.startswith('#') else ''
  lines.append(f'{ins.address:x}: {ins.mnemonic} {ins.op_str} {label}'.rstrip())
 (out/f'{r:x}.asm').write_text('\n'.join(lines)+'\n',encoding='utf-8')
 records.append({'rva':hex(r),'method':names.get(r),'instructions':len(lines),'codeSha256':hashlib.sha256(code).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'binarySha256':digest,'scope':'Canonical linear-sweep extents without RET trimming; padding and throw tails may be present. Static evidence only.','methods':records},indent=2))
print(json.dumps(records))
