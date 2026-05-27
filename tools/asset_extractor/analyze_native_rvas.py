from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN
from elftools.elf.elffile import ELFFile


@dataclass
class Target:
    name: str
    rva: int


TARGETS = [
    Target("DrawSebEx", 0x13EB3D4),
    Target("DrawSebImg", 0x13EB4C8),
    Target("DrawScaledSeb_overload1", 0x13EBED8),
    Target("DrawScaledSeb_overload2", 0x13EC2B8),
    Target("DrawScaledSeb_overload3", 0x13EBF90),
    Target("ChipPlaceSystem.Draw", 0x15094A8),
    Target("ChipReplaceSystem.Draw", 0x15107B8),
    Target("MapSystem.CreateMapChips", 0x15B17D4),
    Target("TownNatureSystem.OnGrowNature", 0x15F0878),
]


def build_va_to_file_offset(elf: ELFFile):
    segments = []
    for seg in elf.iter_segments():
        if seg["p_type"] != "PT_LOAD":
            continue
        vaddr = int(seg["p_vaddr"])
        memsz = int(seg["p_memsz"])
        offset = int(seg["p_offset"])
        filesz = int(seg["p_filesz"])
        segments.append(
            {
                "vstart": vaddr,
                "vend": vaddr + memsz,
                "fstart": offset,
                "fend": offset + filesz,
            }
        )
    return segments


def va_to_offset(segments, va: int) -> int | None:
    for seg in segments:
        if seg["vstart"] <= va < seg["vend"]:
            delta = va - seg["vstart"]
            file_off = seg["fstart"] + delta
            if file_off < seg["fend"]:
                return file_off
            return None
    return None


def main() -> None:
    repo = Path(__file__).resolve().parents[2]
    so_path = repo / "tools" / "asset_extractor" / "apk_runtime_extract" / "extracted" / "lib" / "arm64-v8a" / "libil2cpp.so"
    out_dir = repo / "tools" / "asset_extractor" / "il2cpp_dump"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "native_rva_disasm.json"

    with so_path.open("rb") as f:
        blob = f.read()
        f.seek(0)
        elf = ELFFile(f)
        segments = build_va_to_file_offset(elf)

    md = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
    md.detail = True

    records = []
    window = 0x200

    for t in TARGETS:
        off = va_to_offset(segments, t.rva)
        if off is None:
            records.append(
                {
                    "name": t.name,
                    "rva": hex(t.rva),
                    "error": "RVA not mappable to file offset",
                }
            )
            continue

        code = blob[off : off + window]
        ins = []
        for i, insn in enumerate(md.disasm(code, t.rva)):
            ins.append(
                {
                    "address": hex(insn.address),
                    "mnemonic": insn.mnemonic,
                    "op_str": insn.op_str,
                }
            )
            if i >= 119:
                break

        records.append(
            {
                "name": t.name,
                "rva": hex(t.rva),
                "file_offset": hex(off),
                "instructions": ins,
            }
        )

    out_path.write_text(json.dumps({"lib": str(so_path), "targets": records}, indent=2), encoding="utf-8")
    print(str(out_path))


if __name__ == "__main__":
    main()
