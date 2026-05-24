// Bulk export decompiled C for current Kingdom Adventures reverse-engineering targets.
//
// What this script does:
// - Seeds from key function addresses and known helper names.
// - Adds all functions whose names start with configured prefixes.
// - Walks both callees and callers transitively (breadth-first) up to configurable depths.
// - Exports one decompiled C file per function and writes an index TSV.
//
// Why use this:
// - Avoid manual one-by-one decompiler copying.
// - Export a larger-than-needed set in one pass to reduce back-and-forth.
//
// Run from Script Manager with an opened/analyzed program.

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.listing.CodeUnit;
import ghidra.program.model.listing.CodeUnitIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;

public class BulkExportSebRender extends GhidraScript {

    // Default output folder requested in this workspace.
    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active";

    // Seed by address (hex). If address is inside a function, that containing function is used.
    private static final String[] SEED_ADDRS = new String[] {
        // Step 11: static world-builder/facility placement targets.
        // Practical questions: footprint/occupied tiles, facility visual composition,
        // anchor/alignment, entrance/orientation, and draw order/layering.

        // Chip placement: core building/facility placement and preview drawing.
        "0x15042E0", // ChipPlaceSystem.PlaceChip static core
        "0x15039CC", // ChipPlaceSystem.CheckPlace simple static
        "0x1508238", // ChipPlaceSystem.CheckPlace rect static
        "0x1509380", // ChipPlaceSystem.CheckPlace instance
        "0x15094A8", // ChipPlaceSystem.Draw
        "0x150ADF0", // ChipPlaceSystem.DrawDynamic
        "0x150C128", // ChipPlaceSystem.DrawInRange
        "0x150C12C", // ChipPlaceSystem.DrawInCells static
        "0x15036A0", // ChipPlaceSystem.GetRange
        "0x15033F8", // ChipPlaceSystem.UpdateEntranceDir
        "0x1507DFC", // ChipPlaceSystem.getConnectDir
        "0x1508148", // ChipPlaceSystem.ChangePlaceDir
        "0x150814C", // ChipPlaceSystem.PlaceFence
        "0x150A7DC", // ChipPlaceSystem.DrawPopup static
        "0x150ABFC", // ChipPlaceSystem.DrawButtons static

        // Chip replacement/relocation: overlap and replacement rules.
        "0x150FBCC", // ChipReplaceSystem.PlaceChip
        "0x15106B8", // ChipReplaceSystem.GetRange
        "0x15107B8", // ChipReplaceSystem.Draw
        "0x1510D28", // ChipReplaceSystem.DrawDynamic
        "0x15112FC", // ChipReplaceSystem.CheckPlace static
        "0x1511308", // ChipReplaceSystem.CanReplace

        // Facility drawing: static icon/button and selection visuals.
        "0x156F788", // FacilitySystem.DrawDynamic
        "0x15729A4", // FacilitySystem.DrawFacilityButton
        "0x1573AA0", // FacilitySystem.OnPlaceMapChips
        "0x1576D88", // FacilitySystem.GetFacilityList

        // Map/grid helpers: map chip creation, footprint lookup, entrance direction,
        // height/layer hints, and land-state watch items.
        "0x15AF9CC", // MapSystem.ChangeMapChip
        "0x15B0878", // MapSystem.GetMapChipsOfCategoriesInRect
        "0x15B027C", // MapSystem.CheckLocationInRange
        "0x15B0B44", // MapSystem.GetHeight
        "0x15B0D70", // MapSystem.GetModifyState
        "0x15B0DE4", // MapSystem.SetModifyState
        "0x15B17D4", // MapSystem.CreateMapChips
        "0x15B30E8", // MapSystem.GetEntranceDir(Entity)
        "0x15B31F0", // MapSystem.GetEntranceDir(seblayer)
        "0x15B320C", // MapSystem.GetDirSebLayer

        // MapChipData visual/footprint getters. These may be tiny, but callers show
        // how the game consumes visual ids and dimensions.
        "0x162CFA0", // MapChipData.get_res
        "0x162CFB0", // MapChipData.get_img
        "0x162CFC0", // MapChipData.get_seb
        "0x162CFD0", // MapChipData.get_frame
        "0x162D060", // MapChipData.get_rotation
        "0x162D070", // MapChipData.get_sizeWidth
        "0x162D080", // MapChipData.get_sizeHeight
        "0x162D090", // MapChipData.get_unitWidth
        "0x162D0A0"  // MapChipData.get_unitHeight
    };

    // Offset-column addresses from Il2CppDumper dump.cs for the public entrypoints above.
    // These are exported side-by-side with RVA/VA targets to identify which address space
    // matches the loaded Ghidra program.
    private static final String[] DUMP_OFFSET_ADDRS = new String[] {
        // Offset-column mirrors for the Step 11 targets above.
        "0x15002E0", "0x14FF9CC", "0x1504238", "0x1505380", "0x15054A8",
        "0x1506DF0", "0x1508128", "0x150812C", "0x14FF6A0", "0x14FF3F8",
        "0x1503DFC", "0x1504148", "0x150414C", "0x15067DC", "0x1506BFC",
        "0x150BBCC", "0x150C6B8", "0x150C7B8", "0x150CD28", "0x150D2FC",
        "0x150D308", "0x156B788", "0x156E9A4", "0x156FAA0", "0x1572D88",
        "0x15AB9CC", "0x15AC878", "0x15AC27C", "0x15ACB44", "0x15ACD70",
        "0x15ACDE4", "0x15AD7D4", "0x15AF0E8", "0x15AF1F0", "0x15AF20C"
    };

    private static final String[] CALLER_CORRELATION_ADDRS = new String[] {
        "0x15042E0", "0x15039CC", "0x1508238", "0x15094A8", "0x150ADF0",
        "0x150C128", "0x150C12C", "0x15036A0", "0x15033F8", "0x1507DFC",
        "0x15106B8", "0x15107B8", "0x1510D28", "0x15112FC", "0x1511308",
        "0x156F788", "0x15729A4", "0x1573AA0", "0x1576D88",
        "0x15AF9CC", "0x15B0878", "0x15B027C", "0x15B0B44", "0x15B0D70",
        "0x15B0DE4", "0x15B17D4", "0x15B30E8", "0x15B31F0", "0x15B320C",
        "0x162CFA0", "0x162CFB0", "0x162CFC0", "0x162CFD0", "0x162D060",
        "0x162D070", "0x162D080", "0x162D090", "0x162D0A0"
    };

    private static final String[] DATA_TABLE_STARTS = new String[] {
        "0x02A28900"
    };
    private static final long DATA_TABLE_BYTES = 0x220;

    // Known helper function names.
    private static final String[] SEED_NAMES = new String[] {
    };

    // Additional broad capture by name prefix.
    private static final String[] INCLUDE_PREFIXES = new String[] {
        "FUN_0150",
        "FUN_0151",
        "FUN_0156",
        "FUN_0157",
        "FUN_015a",
        "FUN_015b",
        "FUN_0162"
    };

    // Expansion and scale knobs (SURGICAL MODE - exact targets only).
    private static final boolean INCLUDE_PREFIX_MATCHES = false;  // DISABLED: Only seed addresses
    private static final int CALLEE_EXPANSION_DEPTH = 1;           // Step 11: immediate helpers only
    private static final int CALLER_EXPANSION_DEPTH = 1;           // Step 11: direct callers only
    private static final int MAX_FUNCTIONS_TO_EXPORT = 700;        // Keep active folder focused
    private static final int DECOMPILE_TIMEOUT_SECONDS = 120;
    private static final long ADDRESS_WINDOW_BYTES = 0x80;
    private static final boolean TRY_DISASSEMBLE_UNDEFINED_TARGETS = true;

    // Keep these high-value functions at the front before truncation. Graph expansion can pull
    // many low-address IL2CPP helpers; without priority sorting, late/high-address targets can be
    // selected but not exported.
    private static final String[] IMPORTANT_EXPORT_ENTRIES = new String[] {
        "015042e0", "015039cc", "01508238", "01509380", "015094a8", "0150adf0",
        "0150c128", "0150c12c", "015036a0", "015033f8", "01507dfc", "01508148",
        "0150814c", "0150a7dc", "0150abfc", "0150fbcc", "015106b8", "015107b8",
        "01510d28", "015112fc", "01511308", "0156f788", "015729a4", "01573aa0",
        "01576d88", "015af9cc", "015b0878", "015b027c", "015b0b44", "015b0d70",
        "015b0de4", "015b17d4", "015b30e8", "015b31f0", "015b320c", "0162cfa0",
        "0162cfb0", "0162cfc0", "0162cfd0", "0162d060", "0162d070", "0162d080",
        "0162d090", "0162d0a0"
    };

    @Override
    public void run() throws Exception {
        String exportDir = askString(
            "Export Directory",
            "Folder to write decompiled C files",
            DEFAULT_OUTPUT_DIR
        );

        File outDir = new File(exportDir);
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Failed to create export directory: " + exportDir);
        }

        LinkedHashMap<String, Function> selected = new LinkedHashMap<String, Function>();

        println("\n[SURGICAL MODE] Exporting exact target addresses only.");
        if (TRY_DISASSEMBLE_UNDEFINED_TARGETS) {
            println("[SURGICAL MODE] Attempting disassembly at undefined target bytes before selection.");
            tryDisassembleTargets(SEED_ADDRS, "RVA/VA target");
            tryDisassembleTargets(DUMP_OFFSET_ADDRS, "dump.cs Offset target");
        }

        addSeedByAddress(selected);
        println("[SURGICAL MODE] After address seeds: " + selected.size() + " functions.");
        addSeedByAddressList(selected, DUMP_OFFSET_ADDRS, "dump.cs Offset");
        println("[SURGICAL MODE] After dump.cs Offset seeds: " + selected.size() + " functions.");
        
        addSeedByName(selected);
        println("[SURGICAL MODE] After name seeds: " + selected.size() + " functions.");
        
        if (INCLUDE_PREFIX_MATCHES) {
            println("[SURGICAL MODE] Prefix matching DISABLED (INCLUDE_PREFIX_MATCHES=false).");
            addByPrefix(selected);
        }

        println("[SURGICAL MODE] Expanding transitive graph (callees depth=" + CALLEE_EXPANSION_DEPTH + 
                ", callers depth=" + CALLER_EXPANSION_DEPTH + ")...");
        expandTransitiveGraph(selected, CALLEE_EXPANSION_DEPTH, CALLER_EXPANSION_DEPTH);
        println("[SURGICAL MODE] After expansion: " + selected.size() + " functions.");

        List<Function> funcs = new ArrayList<Function>(selected.values());
        Collections.sort(funcs, new Comparator<Function>() {
            @Override
            public int compare(Function a, Function b) {
                int pa = exportPriority(a);
                int pb = exportPriority(b);
                if (pa != pb) {
                    return Integer.compare(pa, pb);
                }
                return Long.compare(a.getEntryPoint().getOffset(), b.getEntryPoint().getOffset());
            }
        });

        if (funcs.size() > MAX_FUNCTIONS_TO_EXPORT) {
            println("[WARN] Selected " + funcs.size() + " functions; truncating to " + MAX_FUNCTIONS_TO_EXPORT);
            funcs = funcs.subList(0, MAX_FUNCTIONS_TO_EXPORT);
        }

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        List<String> indexLines = new ArrayList<String>();
        int okCount = 0;
        int failCount = 0;

        for (Function f : funcs) {
            if (monitor.isCancelled()) {
                println("[INFO] Cancelled by user.");
                break;
            }

            String name = f.getName();
            String entry = f.getEntryPoint().toString();
            String fileName = sanitize(name) + "_" + sanitize(entry) + ".c";
            File outFile = new File(outDir, fileName);

            String text;
            DecompileResults res = ifc.decompileFunction(f, DECOMPILE_TIMEOUT_SECONDS, monitor);
            if (res != null && res.decompileCompleted() && res.getDecompiledFunction() != null) {
                text = "/* " + name + " @ " + entry + " */\n\n" + res.getDecompiledFunction().getC() + "\n";
                okCount++;
            } else {
                String err = (res == null) ? "null decompile result" : String.valueOf(res.getErrorMessage());
                text = "/* Decompile failed for " + name + " @ " + entry + ": " + err + " */\n";
                failCount++;
            }

            writeText(outFile, text);
            indexLines.add(name + "|" + entry + "|" + fileName);
        }

        File indexFile = new File(outDir, "index.tsv");
        StringBuilder sb = new StringBuilder();
        sb.append("function|entrypoint|file\n");
        for (String line : indexLines) {
            sb.append(line).append('\n');
        }
        writeText(indexFile, sb.toString());

        writeTargetBoundaryReports(outDir);
        writeCallerCorrelationReport(outDir);
        writeDataTableCorrelationReport(outDir);

        println("[DONE] Export directory: " + outDir.getAbsolutePath());
        println("[DONE] Exported: " + indexLines.size());
        println("[DONE] Decompile success: " + okCount + ", failed: " + failCount);
        println("[DONE] Index: " + indexFile.getAbsolutePath());
        println("[DONE] Target boundary report: " + new File(outDir, "target-boundary-report.md").getAbsolutePath());
        println("[DONE] Caller correlation report: " + new File(outDir, "caller-correlation-report.md").getAbsolutePath());
        println("[DONE] Data table correlation report: " + new File(outDir, "data-table-correlation-report.md").getAbsolutePath());
    }

    private void addSeedByAddress(LinkedHashMap<String, Function> selected) {
        println("\n[SURGICAL] === FORCING EXACT TARGET ADDRESSES ===");
        for (String s : SEED_ADDRS) {
            try {
                Address a = toAddr(s);
                Function f = getFunctionContaining(a);
                if (f == null) {
                    f = getFunctionAt(a);
                }
                if (f != null) {
                    selected.put(f.getEntryPoint().toString(), f);
                    println("[SURGICAL] Force-seeded: " + s + " -> " + f.getName() + " @ " + 
                            f.getEntryPoint() + " (size: " + f.getBody().getNumAddresses() + " bytes)");
                } else {
                    println("[WARN] No function found at " + s);
                }
            } catch (Exception ex) {
                println("[WARN] Bad address " + s + ": " + ex.getMessage());
            }
        }
        println("[SURGICAL] === DONE SEEDING ===\n");
    }

    private void writeTargetBoundaryReports(File outDir) throws IOException {
        StringBuilder report = new StringBuilder();
        report.append("# Target Boundary Report\n\n");
        report.append("Purpose: identify whether each IL2CPP RVA is a function entry, lies inside a larger Ghidra function, ");
        report.append("or needs manual function-boundary correction before semantic decoding.\n\n");

        for (String s : SEED_ADDRS) {
            appendTargetBoundary(report, outDir, s, "RVA/VA target");
        }

        report.append("\n# dump.cs Offset Column Targets\n\n");
        for (String s : DUMP_OFFSET_ADDRS) {
            appendTargetBoundary(report, outDir, s, "dump.cs Offset target");
        }

        writeText(new File(outDir, "target-boundary-report.md"), report.toString());
    }

    private void appendTargetBoundary(StringBuilder report, File outDir, String s, String label) throws IOException {
            Address a;
            try {
                a = toAddr(s);
            } catch (Exception ex) {
                report.append("## ").append(s).append("\n\n");
                report.append("- Error: bad address: ").append(ex.getMessage()).append("\n\n");
                return;
            }

            Function at = getFunctionAt(a);
            Function containing = getFunctionContaining(a);
            Function previous = findNearestFunction(a, false);
            Function next = findNearestFunction(a, true);

            report.append("## ").append(s).append("\n\n");
            report.append("- Label: ").append(label).append("\n");
            report.append("- Function at address: ").append(formatFunction(at)).append("\n");
            report.append("- Containing function: ").append(formatFunction(containing)).append("\n");
            report.append("- Previous function: ").append(formatFunction(previous)).append("\n");
            report.append("- Next function: ").append(formatFunction(next)).append("\n");
            if (containing != null) {
                report.append("- Containing body min: ").append(containing.getBody().getMinAddress()).append("\n");
                report.append("- Containing body max: ").append(containing.getBody().getMaxAddress()).append("\n");
            }
            report.append("- Disassembly window: ").append(disasmFileName(a)).append("\n\n");

            writeText(new File(outDir, disasmFileName(a)), buildDisassemblyWindow(a));
    }

    private void writeCallerCorrelationReport(File outDir) throws IOException {
        StringBuilder report = new StringBuilder();
        report.append("# Caller Correlation Report\n\n");
        report.append("Purpose: determine whether the current export slice can connect public method targets ");
        report.append("to one of the mirrored SEB staging families.\n\n");

        report.append("## Function Caller Targets\n\n");
        for (String s : CALLER_CORRELATION_ADDRS) {
            appendCallerTarget(report, s);
        }

        report.append("\n## Public RVA/VA Address References\n\n");
        for (String s : SEED_ADDRS) {
            appendRawAddressReferences(report, s);
        }

        report.append("\n## dump.cs Offset Address References\n\n");
        for (String s : DUMP_OFFSET_ADDRS) {
            appendRawAddressReferences(report, s);
        }

        writeText(new File(outDir, "caller-correlation-report.md"), report.toString());
    }

    private void appendCallerTarget(StringBuilder report, String s) {
        report.append("### ").append(s).append("\n\n");
        try {
            Address a = toAddr(s);
            Function f = getFunctionAt(a);
            if (f == null) {
                f = getFunctionContaining(a);
            }
            report.append("- Function: ").append(formatFunction(f)).append("\n");
            if (f == null) {
                report.append("- Status: no function found at/containing target\n\n");
                return;
            }

            Set<Function> callers = f.getCallingFunctions(monitor);
            report.append("- getCallingFunctions count: ").append(callers.size()).append("\n");
            for (Function caller : callers) {
                report.append("  - ").append(formatFunction(caller)).append("\n");
            }

            report.append("- References to entrypoint:\n");
            appendReferenceList(report, f.getEntryPoint());
            report.append("\n");
        } catch (Exception ex) {
            report.append("- Error: ").append(ex.getMessage()).append("\n\n");
        }
    }

    private void appendRawAddressReferences(StringBuilder report, String s) {
        report.append("### ").append(s).append("\n\n");
        try {
            Address a = toAddr(s);
            report.append("- Function at address: ").append(formatFunction(getFunctionAt(a))).append("\n");
            report.append("- Containing function: ").append(formatFunction(getFunctionContaining(a))).append("\n");
            report.append("- References to exact address:\n");
            appendReferenceList(report, a);
            report.append("\n");
        } catch (Exception ex) {
            report.append("- Error: ").append(ex.getMessage()).append("\n\n");
        }
    }

    private void appendReferenceList(StringBuilder report, Address target) {
        ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(target);
        int count = 0;
        while (refs.hasNext()) {
            Reference ref = refs.next();
            Address from = ref.getFromAddress();
            Function fromFunction = getFunctionContaining(from);
            report.append("  - from ").append(from)
                    .append(" in ").append(formatFunction(fromFunction))
                    .append(" type=").append(ref.getReferenceType())
                    .append("\n");
            count++;
            if (count >= 80) {
                report.append("  - truncated after 80 references\n");
                break;
            }
        }
        if (count == 0) {
            report.append("  - none\n");
        }
    }

    private void writeDataTableCorrelationReport(File outDir) throws IOException {
        StringBuilder report = new StringBuilder();
        report.append("# Data Table Correlation Report\n\n");
        report.append("Purpose: decode DATA references around suspected IL2CPP function-pointer tables ");
        report.append("and resolve pointer-sized values to known functions where possible.\n\n");

        for (String startText : DATA_TABLE_STARTS) {
            appendDataTable(report, startText);
        }

        writeText(new File(outDir, "data-table-correlation-report.md"), report.toString());
    }

    private void appendDataTable(StringBuilder report, String startText) {
        report.append("## Table from ").append(startText).append("\n\n");
        try {
            Address start = toAddr(startText);
            Memory memory = currentProgram.getMemory();
            int pointerSize = currentProgram.getDefaultPointerSize();
            report.append("- Pointer size: ").append(pointerSize).append("\n");
            report.append("- Bytes scanned: 0x").append(Long.toHexString(DATA_TABLE_BYTES)).append("\n\n");
            report.append("| Address | Raw value | Resolved function | References to slot |\n");
            report.append("| --- | --- | --- | --- |\n");

            for (long offset = 0; offset < DATA_TABLE_BYTES; offset += pointerSize) {
                Address slot = start.add(offset);
                long raw;
                if (pointerSize == 8) {
                    raw = memory.getLong(slot);
                } else {
                    raw = memory.getInt(slot) & 0xffffffffL;
                }
                Address valueAddress = currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(raw);
                Function valueFunction = getFunctionAt(valueAddress);
                if (valueFunction == null) {
                    valueFunction = getFunctionContaining(valueAddress);
                }
                String refsToSlot = compactReferenceSummary(slot);
                report.append("| ").append(slot)
                        .append(" | 0x").append(Long.toHexString(raw))
                        .append(" | ").append(formatFunction(valueFunction))
                        .append(" | ").append(refsToSlot)
                        .append(" |\n");
            }
            report.append("\n");
        } catch (Exception ex) {
            report.append("- Error: ").append(ex.getMessage()).append("\n\n");
        }
    }

    private String compactReferenceSummary(Address target) {
        ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(target);
        List<String> items = new ArrayList<String>();
        while (refs.hasNext() && items.size() < 5) {
            Reference ref = refs.next();
            Function fromFunction = getFunctionContaining(ref.getFromAddress());
            items.add(ref.getFromAddress() + " " + ref.getReferenceType() + " " + formatFunction(fromFunction));
        }
        if (refs.hasNext()) {
            items.add("truncated");
        }
        if (items.isEmpty()) {
            return "none";
        }
        return String.join("<br>", items);
    }

    private Function findNearestFunction(Address target, boolean forward) {
        Function best = null;
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
        while (it.hasNext()) {
            Function f = it.next();
            Address entry = f.getEntryPoint();
            int cmp = entry.compareTo(target);
            if (forward) {
                if (cmp > 0 && (best == null || entry.compareTo(best.getEntryPoint()) < 0)) {
                    best = f;
                }
            } else {
                if (cmp < 0 && (best == null || entry.compareTo(best.getEntryPoint()) > 0)) {
                    best = f;
                }
            }
        }
        return best;
    }

    private String formatFunction(Function f) {
        if (f == null) {
            return "none";
        }
        return f.getName() + " @ " + f.getEntryPoint() + " (" + f.getBody().getNumAddresses() + " bytes)";
    }

    private String disasmFileName(Address a) {
        return "disasm_window_" + sanitize(a.toString()) + ".asm";
    }

    private String buildDisassemblyWindow(Address center) {
        StringBuilder sb = new StringBuilder();
        sb.append("; Disassembly window around ").append(center).append("\n");
        sb.append("; Window: +/- 0x").append(Long.toHexString(ADDRESS_WINDOW_BYTES)).append(" bytes\n\n");

        Address start;
        Address end;
        try {
            start = center.subtract(ADDRESS_WINDOW_BYTES);
        } catch (Exception ex) {
            start = currentProgram.getMinAddress();
        }
        try {
            end = center.add(ADDRESS_WINDOW_BYTES);
        } catch (Exception ex) {
            end = currentProgram.getMaxAddress();
        }

        Listing listing = currentProgram.getListing();
        CodeUnitIterator it = listing.getCodeUnits(start, true);
        while (it.hasNext()) {
            CodeUnit cu = it.next();
            Address addr = cu.getAddress();
            if (addr.compareTo(end) > 0) {
                break;
            }
            String marker = addr.equals(center) ? " <== TARGET" : "";
            sb.append(addr).append(": ").append(cu.toString()).append(marker).append("\n");
        }
        return sb.toString();
    }

    private void addSeedByName(LinkedHashMap<String, Function> selected) {
        for (String name : SEED_NAMES) {
            List<Function> found = getGlobalFunctions(name);
            if (found.isEmpty()) {
                println("[WARN] Name not found: " + name);
                continue;
            }
            for (Function f : found) {
                selected.put(f.getEntryPoint().toString(), f);
                println("[SEED name] " + name + " -> " + f.getEntryPoint());
            }
        }
    }

    private void tryDisassembleTargets(String[] addrs, String label) {
        Listing listing = currentProgram.getListing();
        for (String s : addrs) {
            try {
                Address a = toAddr(s);
                Instruction ins = listing.getInstructionAt(a);
                Function containing = getFunctionContaining(a);
                if (ins != null) {
                    println("[DISASM] " + label + " " + s + " already has instruction: " + ins);
                    continue;
                }
                if (containing != null) {
                    println("[DISASM] " + label + " " + s + " is inside " + containing.getName() +
                            " @ " + containing.getEntryPoint() + "; not forcing disassembly/function split.");
                    continue;
                }
                boolean ok = disassemble(a);
                println("[DISASM] Attempted disassembly at " + label + " " + s + ": " + ok);
                if (ok && getFunctionAt(a) == null) {
                    Function made = createFunction(a, "FORCED_" + sanitize(a.toString()));
                    println("[DISASM] Attempted function creation at " + s + ": " + formatFunction(made));
                }
            } catch (Exception ex) {
                println("[DISASM] Failed for " + label + " " + s + ": " + ex.getMessage());
            }
        }
    }

    private void addSeedByAddressList(LinkedHashMap<String, Function> selected, String[] addrs, String label) {
        println("\n[SURGICAL] === FORCING " + label + " ADDRESSES ===");
        for (String s : addrs) {
            try {
                Address a = toAddr(s);
                Function f = getFunctionContaining(a);
                if (f == null) {
                    f = getFunctionAt(a);
                }
                if (f != null) {
                    selected.put(f.getEntryPoint().toString(), f);
                    println("[SURGICAL] Force-seeded " + label + ": " + s + " -> " + f.getName() + " @ " +
                            f.getEntryPoint() + " (size: " + f.getBody().getNumAddresses() + " bytes)");
                } else {
                    println("[WARN] No function found for " + label + " " + s);
                }
            } catch (Exception ex) {
                println("[WARN] Bad " + label + " address " + s + ": " + ex.getMessage());
            }
        }
        println("[SURGICAL] === DONE " + label + " SEEDING ===\n");
    }

    private void addByPrefix(LinkedHashMap<String, Function> selected) {
        Set<String> prefixes = new HashSet<String>(Arrays.asList(INCLUDE_PREFIXES));
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
        while (it.hasNext()) {
            Function f = it.next();
            String n = f.getName();
            for (String p : prefixes) {
                if (n.startsWith(p)) {
                    selected.put(f.getEntryPoint().toString(), f);
                    break;
                }
            }
        }
        println("[INFO] After prefix add, selected count = " + selected.size());
    }

    private void expandTransitiveGraph(LinkedHashMap<String, Function> selected, int calleeDepth, int callerDepth) {
        class Node {
            Function f;
            int d;
            int dir;
            Node(Function f, int d, int dir) { this.f = f; this.d = d; this.dir = dir; }
        }

        ArrayDeque<Node> q = new ArrayDeque<Node>();
        Set<String> seen = new HashSet<String>();

        for (Function f : selected.values()) {
            String k = f.getEntryPoint().toString();
            seen.add(k);
            q.add(new Node(f, 0, 0));
        }

        while (!q.isEmpty()) {
            Node n = q.removeFirst();
            if (n.dir >= 0 && n.d >= calleeDepth) {
                continue;
            }
            if (n.dir < 0 && n.d >= callerDepth) {
                continue;
            }
            try {
                if (n.dir >= 0) {
                    Set<Function> callees = n.f.getCalledFunctions(monitor);
                    for (Function c : callees) {
                        String k = c.getEntryPoint().toString();
                        if (!seen.contains(k)) {
                            seen.add(k);
                            selected.put(k, c);
                            q.add(new Node(c, n.d + 1, 0));
                        }
                    }
                }

                if (n.dir <= 0) {
                    Set<Function> callers = n.f.getCallingFunctions(monitor);
                    for (Function c : callers) {
                        String k = c.getEntryPoint().toString();
                        if (!seen.contains(k)) {
                            seen.add(k);
                            selected.put(k, c);
                            q.add(new Node(c, n.d + 1, -1));
                        }
                    }
                }
            } catch (Exception ex) {
                println("[WARN] Failed graph expansion for " + n.f.getName() + ": " + ex.getMessage());
            }

            if (selected.size() >= MAX_FUNCTIONS_TO_EXPORT) {
                println("[INFO] Reached max function cap during expansion.");
                break;
            }
        }

        println("[INFO] After graph expansion, selected count = " + selected.size());
    }

    private String sanitize(String s) {
        return s.replaceAll("[^A-Za-z0-9_.-]+", "_");
    }

    private int exportPriority(Function f) {
        String entry = f.getEntryPoint().toString().toLowerCase();
        for (int i = 0; i < IMPORTANT_EXPORT_ENTRIES.length; i++) {
            if (entry.equals(IMPORTANT_EXPORT_ENTRIES[i].toLowerCase())) {
                return i;
            }
        }
        return 100000;
    }

    private void writeText(File file, String text) throws IOException {
        BufferedWriter w = new BufferedWriter(new FileWriter(file));
        try {
            w.write(text);
        } finally {
            w.close();
        }
    }
}
