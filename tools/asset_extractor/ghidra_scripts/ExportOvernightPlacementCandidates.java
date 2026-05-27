// Export a targeted Unity/Ghidra candidate set for mapchip/facility placement analysis.
// This script is intended for use inside Ghidra as a Java GhidraScript.

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.CodeUnit;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.Namespace;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import ghidra.program.model.symbol.ReferenceManager;
import ghidra.program.model.scalar.Scalar;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

public class ExportOvernightPlacementCandidates extends GhidraScript {

    private static final String OUTPUT_ROOT =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/mapchip-placement-anchor/overnight-placement-unity-export";

    private static final long[] SEED_RVAS = new long[] {
        0x015042E0L,
        0x0208E2A4L,
        0x02098B0CL,
        0x02053924L,
        0x02053A20L,
        0x020CAC40L
    };

    private static final String[] SEED_NAMES = new String[] {
        "FUN_01504134",
        "FUN_0208E2A4",
        "FUN_02098B0C",
        "FUN_02053924",
        "FUN_02053A20",
        "FUN_020CAC40"
    };

    private static final String[] STRING_KEYS = new String[] {
        "secretchip",
        "secretChipId",
        "area",
        "legendary",
        "ranking",
        "mapchip",
        "img.inf",
        "seb.inf",
        "frame",
        "draw",
        "origin",
        "hotspot",
        "anchor",
        "offset",
        "sizewidth",
        "sizeheight",
        "height",
        "layer",
        "relateddataid",
        "combination",
        "parentchipid",
        "neighbor",
        "neighbour",
        "port",
        "occupied",
        "footprint",
        "build",
        "collision",
        "terrain",
        "wasteland"
    };

    private static final int MAX_FUNCTIONS = 12000;
    private static final int PLACECHIP_GRAPH_DEPTH = 5;
    private static final String OVERNIGHT_NOTES_FILENAME = "overnight_export_notes.md";

    @Override
    public void run() throws Exception {
        File outRoot = new File(OUTPUT_ROOT);
        File actualRoot = prepareOutputRoot(outRoot);

        println("[CONFIRMATION] 742");
        println("[SCRIPT] ExportOvernightPlacementCandidates.java");
        println("[OUTPUT] " + actualRoot.getAbsolutePath());

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File seedResolution = new File(actualRoot, "seed_resolution.tsv");
        File exportedFunctions = new File(actualRoot, "exported_functions.tsv");
        File callgraphEdges = new File(actualRoot, "callgraph_edges.tsv");
        File unresolvedDynamic = new File(actualRoot, "unresolved_dynamic_calls.tsv");
        File candidateReason = new File(actualRoot, "candidate_reason.tsv");
        File stringHits = new File(actualRoot, "string_reference_hits.tsv");
        File constantHits = new File(actualRoot, "constant_reference_hits.tsv");
        File notes = new File(actualRoot, "placement_candidate_notes.md");
        File overnightNotes = new File(actualRoot, OVERNIGHT_NOTES_FILENAME);
        File exportFolder = new File(actualRoot, "exported_functions");
        if (!exportFolder.exists() && !exportFolder.mkdirs()) {
            throw new IOException("Unable to create export folder: " + exportFolder.getAbsolutePath());
        }

        List<TargetResolution> resolutions = resolveSeeds(imageBase);
        Map<String, FunctionEntry> selected = new LinkedHashMap<String, FunctionEntry>();
        Map<String, FunctionEntry> seedEntries = addResolvedSeeds(selected, resolutions);

        if (seedEntries.isEmpty()) {
            println("[WARN] No seed functions were resolved. Aborting export.");
            writeSeedResolution(seedResolution, resolutions);
            println("[CONFIRMATION] 742");
            println("[SCRIPT] ExportOvernightPlacementCandidates.java");
            println("[OUTPUT] " + actualRoot.getAbsolutePath());
            return;
        }

        collectPlaceChipGraph(seedEntries, selected, PLACECHIP_GRAPH_DEPTH);
        Map<String, HitRecord> stringHitMap = collectStringReferenceHits(selected);
        Map<String, HitRecord> constantHitMap = collectConstantReferenceHits(selected);
        Map<String, FunctionEntry> symbolHitEntries = collectSymbolNameHits();
        addCandidatesByHitMap(selected, stringHitMap, "string_hit");
        addCandidatesByHitMap(selected, constantHitMap, "constant_hit");
        for (FunctionEntry symbolEntry : symbolHitEntries.values()) {
            String key = symbolEntry.function.getEntryPoint().toString();
            if (!selected.containsKey(key)) {
                selected.put(key, symbolEntry);
            }
        }

        int selectedBeforeTrim = selected.size();
        boolean trimmed = false;
        if (selected.size() > MAX_FUNCTIONS) {
            println("[WARN] trimming to " + MAX_FUNCTIONS + " based on role priority");
            selected = trimToPriorityLimit(selected, MAX_FUNCTIONS);
            trimmed = true;
        }

        List<UnresolvedCall> unresolvedCalls = collectUnresolvedDynamicCalls(selected.values());
        writeSeedResolution(seedResolution, resolutions);
        writeExportedFunctions(exportedFunctions, selected);
        writeCallgraphEdges(callgraphEdges, selected);
        writeUnresolvedDynamicCalls(unresolvedDynamic, unresolvedCalls);
        writeCandidateReason(candidateReason, selected, stringHitMap, constantHitMap);
        writeStringReferenceHits(stringHits, stringHitMap);
        writeConstantReferenceHits(constantHits, constantHitMap);
        writeNotes(notes, actualRoot.getAbsolutePath(), selected, resolutions, stringHitMap, constantHitMap, unresolvedCalls);
        writeOvernightExportNotes(overnightNotes, selected.size(), selectedBeforeTrim, trimmed);
        decompileAndExport(selected.values(), exportFolder);

        println("[DONE] Export complete. Selected functions: " + selected.size());
        println("[CONFIRMATION] 742");
        println("[SCRIPT] ExportOvernightPlacementCandidates.java");
        println("[OUTPUT] " + actualRoot.getAbsolutePath());
    }

    private List<TargetResolution> resolveSeeds(Address imageBase) {
        List<TargetResolution> results = new ArrayList<TargetResolution>();
        for (int i = 0; i < SEED_RVAS.length; i++) {
            results.add(resolveSeed(SEED_NAMES[i], SEED_RVAS[i], imageBase));
        }
        return results;
    }

    private TargetResolution resolveSeed(String name, long rva, Address imageBase) {
        Address directAddr = toAddr("0x" + Long.toHexString(rva));
        Address resolvedAddr = null;
        Function function = null;
        String method = "none";
        if (addressInMemory(directAddr) && currentProgram.getListing().getInstructionAt(directAddr) != null) {
            resolvedAddr = directAddr;
            function = getFunctionContaining(directAddr);
            method = "direct";
        }
        else {
            try {
                Address baseAddr = imageBase.add(rva);
                if (addressInMemory(baseAddr) && currentProgram.getListing().getInstructionAt(baseAddr) != null) {
                    resolvedAddr = baseAddr;
                    function = getFunctionContaining(baseAddr);
                    method = "image_base";
                }
            }
            catch (AddressOutOfBoundsException e) {
                // ignore
            }
        }
        String status = (resolvedAddr != null && function != null) ? "confirmed" : "failed";
        String note = "";
        if (status.equals("failed")) {
            note = "Could not resolve seed function by RVA or image-base address.";
        }
        println("[SEED] " + name + " rva=0x" + Long.toHexString(rva).toUpperCase() + " resolved=" + status + " addr=" + (resolvedAddr != null ? resolvedAddr : "<none>") + " function=" + (function != null ? function.getName() : "<none>") + " method=" + method);
        return new TargetResolution(name, rva, resolvedAddr, function, method, status, note);
    }

    private Map<String, FunctionEntry> addResolvedSeeds(Map<String, FunctionEntry> selected, List<TargetResolution> resolutions) {
        Map<String, FunctionEntry> seeds = new LinkedHashMap<String, FunctionEntry>();
        for (TargetResolution resolution : resolutions) {
            if (resolution.function != null) {
                String key = resolution.function.getEntryPoint().toString();
                FunctionEntry entry = new FunctionEntry(resolution.function, "seed", resolution.name);
                selected.put(key, entry);
                seeds.put(key, entry);
            }
        }
        return seeds;
    }

    private void collectPlaceChipGraph(Map<String, FunctionEntry> seedEntries, Map<String, FunctionEntry> selected, int depth) {
        List<Function> roots = new ArrayList<Function>();
        for (FunctionEntry entry : seedEntries.values()) {
            roots.add(entry.function);
        }
        expandGraph(selected, roots, depth, false, "direct_callee", "depth2_callee");
        expandGraph(selected, roots, depth, true, "direct_caller", "depth2_caller");
    }

    private void expandGraph(Map<String, FunctionEntry> selected, List<Function> baseFunctions, int depth, boolean callers, String directRole, String depth2Role) {
        List<Function> current = new ArrayList<Function>(baseFunctions);
        for (int level = 1; level <= depth; level++) {
            List<Function> next = new ArrayList<Function>();
            String role = level == 1 ? directRole : depth2Role;
            for (Function function : current) {
                Set<Function> neighbors = callers ? getDirectCallers(function) : getDirectCallees(function);
                for (Function neighbor : neighbors) {
                    if (neighbor == null) {
                        continue;
                    }
                    String key = neighbor.getEntryPoint().toString();
                    if (!selected.containsKey(key)) {
                        selected.put(key, new FunctionEntry(neighbor, role, "placechip_graph"));
                        next.add(neighbor);
                    }
                    else {
                        selected.get(key).upgradeRole(role);
                    }
                }
            }
            current = next;
        }
    }

    private Set<Function> getDirectCallees(Function function) {
        Set<Function> results = new HashSet<Function>();
        try {
            for (Function callee : function.getCalledFunctions(monitor)) {
                if (callee != null) {
                    results.add(callee);
                }
            }
        }
        catch (Exception e) {
            // ignore unsupported decomp call graphs
        }
        return results;
    }

    private Set<Function> getDirectCallers(Function function) {
        Set<Function> results = new HashSet<Function>();
        try {
            for (Function caller : function.getCallingFunctions(monitor)) {
                if (caller != null) {
                    results.add(caller);
                }
            }
        }
        catch (Exception e) {
            // ignore
        }
        ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(function.getEntryPoint());
        while (refs.hasNext()) {
            Reference ref = refs.next();
            if (!ref.getReferenceType().isCall()) {
                continue;
            }
            Function caller = getFunctionContaining(ref.getFromAddress());
            if (caller == null) {
                caller = getFunctionAt(ref.getFromAddress());
            }
            if (caller != null) {
                results.add(caller);
            }
        }
        return results;
    }

    private Map<String, HitRecord> collectStringReferenceHits(Map<String, FunctionEntry> selected) {
        Map<String, HitRecord> hits = new LinkedHashMap<String, HitRecord>();
        Listing listing = currentProgram.getListing();
        for (Data data : listing.getDefinedData(true)) {
            if (!data.hasStringValue()) {
                continue;
            }
            String value = data.getValue().toString().toLowerCase();
            for (String key : STRING_KEYS) {
                if (!value.contains(key)) {
                    continue;
                }
                ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(data.getMinAddress());
                while (refs.hasNext()) {
                    Reference ref = refs.next();
                    Function function = getFunctionContaining(ref.getFromAddress());
                    if (function == null) {
                        continue;
                    }
                    String keyName = function.getEntryPoint().toString();
                    HitRecord record = hits.get(keyName);
                    if (record == null) {
                        record = new HitRecord(function, "string", value, key);
                        hits.put(keyName, record);
                    }
                    else {
                        record.addDetail(value, key);
                    }
                }
            }
        }
        for (HitRecord record : hits.values()) {
            if (!selected.containsKey(record.function.getEntryPoint().toString())) {
                selected.put(record.function.getEntryPoint().toString(), new FunctionEntry(record.function, "string_hit", record.primaryReason));
            }
        }
        return hits;
    }

    private Map<String, HitRecord> collectConstantReferenceHits(Map<String, FunctionEntry> selected) {
        Map<String, HitRecord> hits = new LinkedHashMap<String, HitRecord>();
        long[] constants = new long[]{7, 9, 17, 1, 2, 6, 172, 258, 196, 232};
        Listing listing = currentProgram.getListing();
        FunctionIterator functions = currentProgram.getFunctionManager().getFunctions(true);
        while (functions.hasNext()) {
            Function function = functions.next();
            boolean found = false;
            StringBuilder reason = new StringBuilder();
            Instruction inst = listing.getInstructionAt(function.getEntryPoint());
            while (inst != null && function.getBody().contains(inst.getAddress())) {
                for (int i = 0; i < inst.getNumOperands(); i++) {
                    Object[] objs = inst.getOpObjects(i);
                    if (objs == null) {
                        continue;
                    }
                    for (Object obj : objs) {
                        if (obj instanceof Scalar) {
                            long val = ((Scalar) obj).getValue();
                            for (long constant : constants) {
                                if (val == constant) {
                                    if (!found) {
                                        found = true;
                                        reason.append("const:" + constant);
                                    }
                                    else {
                                        reason.append("," + constant);
                                    }
                                }
                            }
                        }
                    }
                }
                inst = inst.getNext();
            }
            if (found) {
                String key = function.getEntryPoint().toString();
                HitRecord record = new HitRecord(function, "constant", reason.toString(), "const");
                hits.put(key, record);
                if (!selected.containsKey(key)) {
                    selected.put(key, new FunctionEntry(function, "constant_hit", record.primaryReason));
                }
            }
        }
        return hits;
    }

    private Map<String, FunctionEntry> collectSymbolNameHits() {
        Map<String, FunctionEntry> matches = new LinkedHashMap<String, FunctionEntry>();
        Namespace globalNamespace = currentProgram.getGlobalNamespace();
        SymbolIterator symbols = currentProgram.getSymbolTable().getSymbols(globalNamespace);
        while (symbols.hasNext()) {
            Symbol symbol = symbols.next();
            String name = symbol.getName().toLowerCase();
            for (String key : new String[]{"mapchip", "facility", "area", "secretchip", "parentchipid", "relateddataid", "seb", "img.inf", "combination", "port"}) {
                if (name.contains(key)) {
                    Function function = getFunctionContaining(symbol.getAddress());
                    if (function != null) {
                        String entry = function.getEntryPoint().toString();
                        if (!matches.containsKey(entry)) {
                            matches.put(entry, new FunctionEntry(function, "symbol_hit", "symbol:" + key));
                        }
                    }
                }
            }
        }
        return matches;
    }

    private void addCandidatesByHitMap(Map<String, FunctionEntry> selected, Map<String, HitRecord> hitMap, String role) {
        for (HitRecord record : hitMap.values()) {
            String key = record.function.getEntryPoint().toString();
            if (!selected.containsKey(key)) {
                selected.put(key, new FunctionEntry(record.function, role, record.primaryReason));
            }
        }
    }

    private Map<String, FunctionEntry> trimToPriorityLimit(Map<String, FunctionEntry> selected, int limit) {
        List<FunctionEntry> entries = new ArrayList<FunctionEntry>(selected.values());
        Collections.sort(entries, new Comparator<FunctionEntry>() {
            @Override
            public int compare(FunctionEntry a, FunctionEntry b) {
                int pa = a.priority();
                int pb = b.priority();
                if (pa != pb) {
                    return Integer.compare(pa, pb);
                }
                return Long.compare(a.function.getEntryPoint().getOffset(), b.function.getEntryPoint().getOffset());
            }
        });
        Map<String, FunctionEntry> trimmed = new LinkedHashMap<String, FunctionEntry>();
        for (int i = 0; i < Math.min(limit, entries.size()); i++) {
            FunctionEntry entry = entries.get(i);
            trimmed.put(entry.function.getEntryPoint().toString(), entry);
        }
        return trimmed;
    }

    private List<UnresolvedCall> collectUnresolvedDynamicCalls(Iterable<FunctionEntry> functions) {
        List<UnresolvedCall> unresolved = new ArrayList<UnresolvedCall>();
        Listing listing = currentProgram.getListing();
        for (FunctionEntry entry : functions) {
            Instruction inst = listing.getInstructionAt(entry.function.getEntryPoint());
            while (inst != null && entry.function.getBody().contains(inst.getAddress())) {
                if (inst.getFlowType().isIndirect() && inst.getMnemonicString().toLowerCase().contains("call")) {
                    unresolved.add(new UnresolvedCall(entry.function, inst.getAddress(), inst.toString()));
                }
                inst = inst.getNext();
            }
        }
        return unresolved;
    }

    private void writeSeedResolution(File file, List<TargetResolution> resolutions) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("seed\tstatus\tmethod\taddress\tfunction\tnote\n");
        for (TargetResolution res : resolutions) {
            writer.write(res.name + "\t" + res.status + "\t" + res.method + "\t" + (res.address != null ? res.address.toString() : "<none>") + "\t" + (res.function != null ? res.function.getName() : "<none>") + "\t" + res.note + "\n");
        }
        writer.close();
    }

    private void writeExportedFunctions(File file, Map<String, FunctionEntry> selected) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("address\tfunction\trole\treason\tpriority\n");
        for (FunctionEntry entry : selected.values()) {
            writer.write(entry.function.getEntryPoint().toString() + "\t" + entry.function.getName() + "\t" + entry.role + "\t" + entry.reason + "\t" + entry.priority() + "\n");
        }
        writer.close();
    }

    private void writeCallgraphEdges(File file, Map<String, FunctionEntry> selected) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("caller\tcallee\tedge_role\n");
        for (FunctionEntry entry : selected.values()) {
            Set<Function> callees = getDirectCallees(entry.function);
            for (Function callee : callees) {
                if (callee == null) {
                    continue;
                }
                String calleeKey = callee.getEntryPoint().toString();
                if (!selected.containsKey(calleeKey)) {
                    continue;
                }
                writer.write(entry.function.getName() + "\t" + callee.getName() + "\tcallee\n");
            }
            Set<Function> callers = getDirectCallers(entry.function);
            for (Function caller : callers) {
                if (caller == null) {
                    continue;
                }
                String callerKey = caller.getEntryPoint().toString();
                if (!selected.containsKey(callerKey)) {
                    continue;
                }
                writer.write(caller.getName() + "\t" + entry.function.getName() + "\tcaller\n");
            }
        }
        writer.close();
    }

    private void writeUnresolvedDynamicCalls(File file, List<UnresolvedCall> calls) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("function\taddress\tinstruction\n");
        for (UnresolvedCall call : calls) {
            writer.write(call.function.getName() + "\t" + call.address.toString() + "\t" + call.instructionText + "\n");
        }
        writer.close();
    }

    private void writeCandidateReason(File file, Map<String, FunctionEntry> selected, Map<String, HitRecord> stringHits, Map<String, HitRecord> constantHits) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("address\tfunction\trole\treason\tstring_hit\tconstant_hit\n");
        for (FunctionEntry entry : selected.values()) {
            String stringHit = stringHits.containsKey(entry.function.getEntryPoint().toString()) ? stringHits.get(entry.function.getEntryPoint().toString()).details : "";
            String constantHit = constantHits.containsKey(entry.function.getEntryPoint().toString()) ? constantHits.get(entry.function.getEntryPoint().toString()).details : "";
            writer.write(entry.function.getEntryPoint().toString() + "\t" + entry.function.getName() + "\t" + entry.role + "\t" + entry.reason + "\t" + stringHit + "\t" + constantHit + "\n");
        }
        writer.close();
    }

    private void writeStringReferenceHits(File file, Map<String, HitRecord> hits) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("address\tfunction\tmatch_key\tstring_value\n");
        for (HitRecord record : hits.values()) {
            writer.write(record.function.getEntryPoint().toString() + "\t" + record.function.getName() + "\t" + record.matchKey + "\t" + record.primaryReason + "\n");
        }
        writer.close();
    }
    
    private boolean addressInMemory(Address address) {
        if (address == null) {
            return false;
        }
        return currentProgram.getMemory().contains(address);
    }

    private void writeConstantReferenceHits(File file, Map<String, HitRecord> hits) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("address\tfunction\tconstants\n");
        for (HitRecord record : hits.values()) {
            writer.write(record.function.getEntryPoint().toString() + "\t" + record.function.getName() + "\t" + record.primaryReason + "\n");
        }
        writer.close();
    }

    private void writeNotes(File file, String actualRootPath, Map<String, FunctionEntry> selected, List<TargetResolution> resolutions, Map<String, HitRecord> stringHits, Map<String, HitRecord> constantHits, List<UnresolvedCall> unresolved) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("# Overnight Placement Export Notes\n\n");
        writer.write("Export root: " + actualRootPath + "\n\n");
        writer.write("## Summary\n");
        writer.write("- selected_functions: " + selected.size() + "\n");
        writer.write("- seed_functions: " + resolutions.size() + "\n");
        writer.write("- string_hit_functions: " + stringHits.size() + "\n");
        writer.write("- constant_hit_functions: " + constantHits.size() + "\n");
        writer.write("- unresolved_dynamic_calls: " + unresolved.size() + "\n\n");
        writer.write("## Seed resolutions\n");
        for (TargetResolution res : resolutions) {
            writer.write("- " + res.name + ": " + res.status + " (" + res.method + ") addr=" + (res.address != null ? res.address.toString() : "<none>") + " function=" + (res.function != null ? res.function.getName() : "<none>") + "\n");
        }
        writer.write("\n## Candidate selection criteria\n");
        writer.write("- seed functions and their direct callers/callees to depth " + PLACECHIP_GRAPH_DEPTH + "\n");
        writer.write("- functions referencing placement-related strings\n");
        writer.write("- functions referencing mapchip/facility constants 7/9/17 and known special ids (1/2/172/232/196/258)\n");
        writer.write("- symbol name hits for mapchip, facility, area, secretChip, port, combination, seb\n\n");
        writer.write("## Notes\n");
        writer.write("- This export is intentionally broad and focused on placement/render candidates.\n");
        writer.write("- If the selected set exceeds " + MAX_FUNCTIONS + ", it is trimmed by category priority: seed > placechip_graph > string_hit > constant_hit > symbol_hit.\n");
        writer.write("\n");
        writer.close();
    }

    private void decompileAndExport(Iterable<FunctionEntry> entries, File exportFolder) throws Exception {
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);
        for (FunctionEntry entry : entries) {
            if (monitor.isCancelled()) {
                break;
            }
            String cleanName = sanitizeName(entry.function.getName());
            String prefix = cleanName + "_" + entry.function.getEntryPoint().toString().replace(':', '_');
            File cFile = new File(exportFolder, prefix + ".c");
            File asmFile = new File(exportFolder, prefix + ".asm");
            decompileFunctionToFile(entry.function, ifc, cFile);
            exportFunctionAsm(entry.function, asmFile);
        }
        ifc.dispose();
    }

    private void decompileFunctionToFile(Function function, DecompInterface ifc, File outFile) throws IOException {
        ensureParentDirectory(outFile);
        DecompileResults results = ifc.decompileFunction(function, 120, monitor);
        BufferedWriter writer = new BufferedWriter(new FileWriter(outFile));
        if (results != null && results.decompileCompleted()) {
            writer.write(results.getDecompiledFunction().getC());
        }
        else {
            writer.write("/* Decompilation failed for function " + function.getName() + " at " + function.getEntryPoint().toString() + " */\n");
        }
        writer.close();
    }

    private void exportFunctionAsm(Function function, File outFile) throws IOException {
        ensureParentDirectory(outFile);
        BufferedWriter writer = new BufferedWriter(new FileWriter(outFile));
        Instruction inst = currentProgram.getListing().getInstructionAt(function.getEntryPoint());
        while (inst != null && function.getBody().contains(inst.getAddress())) {
            writer.write(inst.toString() + "\n");
            inst = inst.getNext();
        }
        writer.close();
    }

    private String sanitizeName(String name) {
        return name.replaceAll("[^A-Za-z0-9_\\-]", "_");
    }

    private void ensureParentDirectory(File file) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) {
            if (!parent.mkdirs()) {
                throw new IOException("Unable to create parent directory: " + parent.getAbsolutePath());
            }
        }
    }

    private File prepareOutputRoot(File outRoot) throws IOException {
        if (!outRoot.exists()) {
            if (!outRoot.mkdirs()) {
                throw new IOException("Unable to create output root: " + outRoot.getAbsolutePath());
            }
            return outRoot;
        }
        if (!outRoot.isDirectory()) {
            throw new IOException("Output root exists but is not a directory: " + outRoot.getAbsolutePath());
        }
        File[] children = outRoot.listFiles();
        if (children == null || children.length == 0) {
            return outRoot;
        }
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
        File timestamped = new File(outRoot, "run_" + timestamp);
        if (!timestamped.exists() && !timestamped.mkdirs()) {
            throw new IOException("Unable to create timestamped output root: " + timestamped.getAbsolutePath());
        }
        println("[INFO] Existing output folder detected; using timestamped folder: " + timestamped.getAbsolutePath());
        return timestamped;
    }

    private void writeOvernightExportNotes(File file, int selectedCount, int beforeTrimCount, boolean trimmed) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write("# Overnight Export Run Summary\n\n");
        writer.write("configured_max_functions: " + MAX_FUNCTIONS + "\n");
        writer.write("actual_selected_count: " + selectedCount + "\n");
        writer.write("trimming_happened: " + trimmed + "\n");
        if (trimmed) {
            writer.write("selected_before_trimming: " + beforeTrimCount + "\n");
            writer.write("trimmed_to: " + MAX_FUNCTIONS + "\n");
        }
        writer.write("\n");
        writer.close();
    }

    private String getFunctionNameOrAddress(Function function) {
        return function != null ? function.getName() : "<none>";
    }

    private static class TargetResolution {
        public final String name;
        public final long rva;
        public final Address address;
        public final Function function;
        public final String method;
        public final String status;
        public final String note;

        public TargetResolution(String name, long rva, Address address, Function function, String method, String status, String note) {
            this.name = name;
            this.rva = rva;
            this.address = address;
            this.function = function;
            this.method = method;
            this.status = status;
            this.note = note;
        }
    }

    private static class FunctionEntry {
        public final Function function;
        public String role;
        public String reason;

        public FunctionEntry(Function function, String role, String reason) {
            this.function = function;
            this.role = role;
            this.reason = reason;
        }

        public void upgradeRole(String newRole) {
            if (priority(newRole) < priority(this.role)) {
                this.role = newRole;
            }
        }

        public int priority() {
            return priority(role);
        }

        private static int priority(String role) {
            if (role.equals("seed")) {
                return 0;
            }
            if (role.equals("direct_callee") || role.equals("direct_caller")) {
                return 1;
            }
            if (role.equals("depth2_callee") || role.equals("depth2_caller")) {
                return 2;
            }
            if (role.equals("placechip_graph")) {
                return 3;
            }
            if (role.equals("string_hit")) {
                return 4;
            }
            if (role.equals("constant_hit")) {
                return 5;
            }
            if (role.equals("symbol_hit")) {
                return 6;
            }
            return 10;
        }
    }

    private static class HitRecord {
        public final Function function;
        public final String type;
        public final String primaryReason;
        public final String matchKey;
        public String details;

        public HitRecord(Function function, String type, String primaryReason, String matchKey) {
            this.function = function;
            this.type = type;
            this.primaryReason = primaryReason;
            this.matchKey = matchKey;
            this.details = primaryReason;
        }

        public void addDetail(String detail, String matchKey) {
            if (!details.contains(detail)) {
                details += ";" + detail;
            }
        }
    }

    private static class UnresolvedCall {
        public final Function function;
        public final Address address;
        public final String instructionText;

        public UnresolvedCall(Function function, Address address, String instructionText) {
            this.function = function;
            this.address = address;
            this.instructionText = instructionText;
        }
    }
}
