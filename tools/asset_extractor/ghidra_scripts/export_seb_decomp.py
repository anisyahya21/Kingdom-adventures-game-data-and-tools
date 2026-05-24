# Export SEB render target functions and their direct callees to decompiled C files.
#
# Usage in Ghidra Script Manager (GUI):
# - Run script with optional arg[0] = output directory.
#
# Usage in analyzeHeadless:
# - -postScript export_seb_decomp.py "C:\\path\\to\\output"
#
# This script intentionally exports only a constrained target set plus direct callees.

from ghidra.app.decompiler import DecompInterface
import os
import re

TARGET_ADDRS = [
    "0x013EB4C8",  # DrawSebImg region
    "0x013EB3D4",  # DrawSebEx
    "0x013EBED8",  # DrawScaledSeb
    "0x013EBF90",  # DrawScaledSeb related
    "0x013EC2B8",  # DrawScaledSeb related
]

HELPER_NAMES = [
    "FUN_013eb2ac",
    "FUN_015c38c0",
    "FUN_01f530c4",
    "FUN_013edd24",
]


def sanitize_filename(name):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name)


def function_by_addr(hex_addr):
    addr = toAddr(hex_addr)
    func = getFunctionContaining(addr)
    if func is None:
        func = getFunctionAt(addr)
    return func


def add_function(func, fn_map):
    if func is None:
        return
    entry = func.getEntryPoint().toString()
    fn_map[entry] = func


def collect_seed_functions():
    fn_map = {}

    for hex_addr in TARGET_ADDRS:
        func = function_by_addr(hex_addr)
        if func is None:
            print("[WARN] No function found at {}".format(hex_addr))
        else:
            add_function(func, fn_map)

    for name in HELPER_NAMES:
        found_any = False
        for func in getGlobalFunctions(name):
            found_any = True
            add_function(func, fn_map)
        if not found_any:
            print("[WARN] Helper name not found: {}".format(name))

    return fn_map


def collect_direct_callees(seed_map):
    out = dict(seed_map)

    for func in list(seed_map.values()):
        try:
            callees = func.getCalledFunctions(monitor)
            for callee in callees:
                add_function(callee, out)
        except Exception as ex:
            print("[WARN] Failed collecting callees for {}: {}".format(func.getName(), ex))

    return out


def decompile_and_export(functions, export_dir):
    if not os.path.isdir(export_dir):
        os.makedirs(export_dir)

    ifc = DecompInterface()
    ifc.openProgram(currentProgram)

    index_lines = []

    # Sort by entrypoint address for stable output.
    sorted_funcs = sorted(
        list(functions.values()),
        key=lambda f: f.getEntryPoint().getOffset()
    )

    for func in sorted_funcs:
        entry = func.getEntryPoint().toString()
        name = func.getName()
        base_name = "{}_{}.c".format(sanitize_filename(name), sanitize_filename(entry))
        out_path = os.path.join(export_dir, base_name)

        result = ifc.decompileFunction(func, 90, monitor)
        if result is None or (not result.decompileCompleted()):
            err = "unknown"
            if result is not None:
                err = result.getErrorMessage()
            text = "/* Decompile failed for {} @ {}: {} */\n".format(name, entry, err)
        else:
            text = result.getDecompiledFunction().getC()

        header = "/* {} @ {} */\n\n".format(name, entry)
        with open(out_path, "w") as f:
            f.write(header)
            f.write(text)
            f.write("\n")

        index_lines.append("{}|{}|{}".format(name, entry, base_name))
        print("[OK] {} -> {}".format(name, out_path))

    index_path = os.path.join(export_dir, "index.tsv")
    with open(index_path, "w") as idx:
        idx.write("function|entrypoint|file\n")
        idx.write("\n".join(index_lines))
        idx.write("\n")

    print("[DONE] Exported {} functions to {}".format(len(sorted_funcs), export_dir))


def main():
    args = getScriptArgs()

    if len(args) > 0 and args[0].strip() != "":
        export_dir = args[0]
    else:
        # Default to requested workspace location when no argument is supplied.
        export_dir = r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\Reverse engineering\exports\seb-render-functions"

    print("[INFO] Export dir: {}".format(export_dir))

    seed_map = collect_seed_functions()
    all_map = collect_direct_callees(seed_map)

    print("[INFO] Seeds: {}".format(len(seed_map)))
    print("[INFO] Seeds + direct callees: {}".format(len(all_map)))

    decompile_and_export(all_map, export_dir)


if __name__ == "__main__":
    main()
