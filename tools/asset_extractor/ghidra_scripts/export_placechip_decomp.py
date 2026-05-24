# Export ChipPlaceSystem.PlaceChip and its direct caller/callee graph to decompiled C files.
#
# Usage in Ghidra Script Manager (GUI):
# - Run script with optional arg[0] = output directory.
#
# Usage in analyzeHeadless:
# - -postScript export_placechip_decomp.py "C:\path\to\output"
#
# This script is intended to produce a fresh PlaceChip-centered export slice, with:
# - `FUN_01504134` / ChipPlaceSystem.PlaceChip
# - direct helpers by address
# - direct caller/callee graph edges
# - inventory metadata for fresh export validation

from ghidra.app.decompiler import DecompInterface
import os
import re

# The primary placement anchor.
SEED_TARGETS = [
    ("0x15042E0", "ChipPlaceSystem.PlaceChip / FUN_01504134"),
]

# Known direct helper addresses observed in the PlaceChip path.
HELPER_TARGETS = [
    ("0x0208E2A4", "FUN_0208e2a4"),
    ("0x02098B0C", "FUN_02098b0c"),
    ("0x02053924", "FUN_02053924"),
    ("0x02053A20", "FUN_02053a20"),
    ("0x020CAC40", "FUN_020cac40"),
    ("0x014512F8", "FUN_014512f8"),
    ("0x01452E38", "FUN_01452e38"),
]

DEFAULT_OUTPUT_DIR = r"C:\Users\anisb\OneDrive\Desktop\replit kingdom adventures - Copy\KA-Website\Reverse engineering\exports\active\placechip-ghidra-fresh"


def sanitize_filename(name):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name)


def get_function_by_addr(hex_addr):
    addr = toAddr(hex_addr)
    func = getFunctionContaining(addr)
    if func is None:
        func = getFunctionAt(addr)
    return func


def add_function(func, function_map):
    if func is None:
        return
    function_map[func.getEntryPoint().toString()] = func


def resolve_seeds():
    resolved = {}
    for hex_addr, label in SEED_TARGETS + HELPER_TARGETS:
        func = get_function_by_addr(hex_addr)
        if func is None:
            print('[WARN] No function found for seed {} ({})'.format(label, hex_addr))
        else:
            add_function(func, resolved)
    return resolved


def get_direct_callees(func):
    callees = []
    try:
        for callee in func.getCalledFunctions(monitor):
            if callee is not None:
                callees.append(callee)
    except Exception as ex:
        print('[WARN] Failed collecting callees for {}: {}'.format(func.getName(), ex))
    return callees


def get_direct_callers(func):
    callers = {}
    try:
        for caller in func.getCallingFunctions(monitor):
            if caller is not None:
                callers[caller.getEntryPoint().toString()] = caller
    except Exception as ex:
        print('[WARN] Failed collecting callers via getCallingFunctions for {}: {}'.format(func.getName(), ex))

    try:
        ref_mgr = currentProgram.getReferenceManager()
        for ref in ref_mgr.getReferencesTo(func.getEntryPoint()):
            if ref.getReferenceType().isCall():
                caller_func = getFunctionContaining(ref.getFromAddress())
                if caller_func is None:
                    caller_func = getFunctionAt(ref.getFromAddress())
                if caller_func is not None:
                    callers[caller_func.getEntryPoint().toString()] = caller_func
    except Exception as ex:
        print('[WARN] Failed scanning references to {}: {}'.format(func.getName(), ex))

    return list(callers.values())


def collect_graph(seed_functions, callee_depth=1, caller_depth=1):
    selected = dict(seed_functions)

    current = list(seed_functions.values())
    for depth in range(callee_depth):
        next_level = []
        for func in current:
            for callee in get_direct_callees(func):
                if callee is None:
                    continue
                entry = callee.getEntryPoint().toString()
                if entry not in selected:
                    selected[entry] = callee
                    next_level.append(callee)
        current = next_level

    current = list(seed_functions.values())
    for depth in range(caller_depth):
        next_level = []
        for func in current:
            for caller in get_direct_callers(func):
                if caller is None:
                    continue
                entry = caller.getEntryPoint().toString()
                if entry not in selected:
                    selected[entry] = caller
                    next_level.append(caller)
        current = next_level

    return selected


def collect_callgraph_edges(functions):
    edges = set()
    for func in functions:
        source = func.getEntryPoint().toString()
        for callee in get_direct_callees(func):
            if callee is None:
                continue
            edges.add((source, callee.getEntryPoint().toString(), 'direct-callee'))
        for caller in get_direct_callers(func):
            if caller is None:
                continue
            edges.add((caller.getEntryPoint().toString(), source, 'direct-caller'))
    return sorted(edges)


def collect_dynamic_call_notes(func):
    notes = []
    try:
        listing = currentProgram.getListing()
        instructions = listing.getInstructions(func.getBody(), True)
        for instr in instructions:
            flow = instr.getFlowType()
            if flow is not None and flow.isCall():
                refs = currentProgram.getReferenceManager().getReferencesFrom(instr.getAddress())
                call_refs = [ref for ref in refs if ref.getReferenceType().isCall()]
                if not call_refs:
                    notes.append((instr.getAddress().toString(), instr.getMnemonicString(), instr.toString()))
    except Exception as ex:
        print('[WARN] Failed scanning dynamic calls for {}: {}'.format(func.getName(), ex))
    return notes


def decompile_and_export(functions, export_dir):
    if not os.path.isdir(export_dir):
        os.makedirs(export_dir)

    ifc = DecompInterface()
    ifc.openProgram(currentProgram)

    sorted_funcs = sorted(
        list(functions.values()),
        key=lambda f: f.getEntryPoint().getOffset()
    )

    index_lines = []
    for func in sorted_funcs:
        entry = func.getEntryPoint().toString()
        name = func.getName()
        file_name = "{}_{}.c".format(sanitize_filename(name), sanitize_filename(entry))
        out_path = os.path.join(export_dir, file_name)

        result = ifc.decompileFunction(func, 90, monitor)
        if result is None or not result.decompileCompleted():
            err = 'unknown'
            if result is not None:
                err = result.getErrorMessage()
            text = '/* Decompile failed for {} @ {}: {} */\n'.format(name, entry, err)
        else:
            text = result.getDecompiledFunction().getC()

        with open(out_path, 'w', encoding='utf-8') as f:
            f.write('/* {} @ {} */\n\n'.format(name, entry))
            f.write(text)
            f.write('\n')

        index_lines.append('{}|{}|{}'.format(name, entry, file_name))
        print('[OK] {} -> {}'.format(name, out_path))

    index_path = os.path.join(export_dir, 'index.tsv')
    with open(index_path, 'w', encoding='utf-8') as idx:
        idx.write('function|entrypoint|file\n')
        idx.write('\n'.join(index_lines))
        idx.write('\n')

    print('[INFO] Exported {} functions to {}'.format(len(sorted_funcs), export_dir))


def write_callgraph(export_dir, edges):
    callgraph_path = os.path.join(export_dir, 'callgraph_edges.tsv')
    with open(callgraph_path, 'w', encoding='utf-8') as f:
        f.write('source|target|relationship\n')
        for source, target, kind in edges:
            f.write('{}|{}|{}\n'.format(source, target, kind))
    print('[INFO] callgraph written to {}'.format(callgraph_path))


def write_seed_resolution(export_dir, seed_targets, resolved_map):
    path = os.path.join(export_dir, 'seed_resolution.tsv')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('seed_address|seed_label|resolved_name|resolved_entry|status\n')
        for hex_addr, label in seed_targets:
            func = get_function_by_addr(hex_addr)
            if func is None:
                f.write('{}|{}|none|none|missing\n'.format(hex_addr, label))
            else:
                f.write('{}|{}|{}|{}|resolved\n'.format(
                    hex_addr,
                    label,
                    func.getName(),
                    func.getEntryPoint().toString()
                ))
    print('[INFO] seed resolution written to {}'.format(path))


def write_inventory(export_dir, seed_map, selected_funcs, callgraph_edges, dynamic_notes):
    path = os.path.join(export_dir, 'placechip_export_inventory.md')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('# PlaceChip Ghidra Export Inventory\n\n')
        f.write('Seed target: `ChipPlaceSystem.PlaceChip` @ 0x15042E0 (`FUN_01504134`)\n\n')
        f.write('## Summary\n\n')
        f.write('- seed functions: {}\n'.format(len(seed_map)))
        f.write('- selected functions: {}\n'.format(len(selected_funcs)))
        f.write('- callgraph edges: {}\n'.format(len(callgraph_edges)))
        f.write('\n## Seed functions\n\n')
        for func in sorted(seed_map.values(), key=lambda f: f.getEntryPoint().getOffset()):
            f.write('- {} @ {}\n'.format(func.getName(), func.getEntryPoint().toString()))
        f.write('\n## Export files\n\n')
        f.write('- `index.tsv`: exported function index\n')
        f.write('- `callgraph_edges.tsv`: direct caller/callee edges\n')
        f.write('- `seed_resolution.tsv`: seed address resolution report\n')
        f.write('- `placechip_export_inventory.md`: this inventory\n')
        if dynamic_notes:
            f.write('\n## Dynamic call notes\n\n')
            f.write('The following call instructions in `FUN_01504134` appear to use non-trivial call flows and may require manual review:\n\n')
            f.write('| instruction address | mnemonic | instruction text |\n')
            f.write('| --- | --- | --- |\n')
            for addr, mnemonic, text in dynamic_notes:
                f.write('| {} | {} | {} |\n'.format(addr, mnemonic, text))
        else:
            f.write('\n## Dynamic call notes\n\n')
            f.write('- no unresolved call-flow instructions were detected by this scan.\n')
    print('[INFO] inventory written to {}'.format(path))


def main():
    args = getScriptArgs()
    export_dir = args[0] if len(args) > 0 and args[0].strip() != '' else DEFAULT_OUTPUT_DIR

    print('[INFO] Export dir: {}'.format(export_dir))
    seed_map = resolve_seeds()
    if not seed_map:
        raise RuntimeError('No seed functions were resolved.')

    selected = collect_graph(seed_map, callee_depth=1, caller_depth=1)
    edges = collect_callgraph_edges(selected.values())
    dynamic_notes = []
    placechip_func = get_function_by_addr('0x15042E0')
    if placechip_func is not None:
        dynamic_notes = collect_dynamic_call_notes(placechip_func)

    if not os.path.isdir(export_dir):
        os.makedirs(export_dir)

    write_seed_resolution(export_dir, SEED_TARGETS + HELPER_TARGETS, seed_map)
    decompile_and_export(selected, export_dir)
    write_callgraph(export_dir, edges)
    write_inventory(export_dir, seed_map, selected, edges, dynamic_notes)

    print('[DONE] PlaceChip export complete.')


if __name__ == '__main__':
    main()
