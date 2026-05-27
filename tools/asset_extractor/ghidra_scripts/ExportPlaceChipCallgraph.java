// Export a fresh PlaceChip-centered callgraph slice for Kingdom Adventures placement analysis.
// This script resolves the PlaceChip anchor and its known helper seeds, collects caller/callee
// relationships, decompiles selected functions, and writes evidence files.

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.Symbol;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

public class ExportPlaceChipCallgraph extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/mapchip-placement-anchor/placechip-ghidra-fresh";

    private static final TargetSpec[] SEEDS = new TargetSpec[] {
        new TargetSpec("FUN_01504134", 0x15042E0L),
        new TargetSpec("FUN_0208e2a4", 0x0208E2A4L),
        new TargetSpec("FUN_02098b0c", 0x02098B0CL),
        new TargetSpec("FUN_02053924", 0x02053924L),
        new TargetSpec("FUN_02053a20", 0x02053A20L),
        new TargetSpec("FUN_020cac40", 0x020CAC40L)
    };

    private static final int CALLEE_DEPTH = 2;
    private static final int CALLER_DEPTH = 2;
    private static final int MAX_EXPORT_FUNCTIONS = 400;
    private static final int DECOMP_TIMEOUT_SECONDS = 120;

    @Override
    public void run() throws Exception {
        File outDir = new File(DEFAULT_OUTPUT_DIR).getAbsoluteFile();
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
        }
        println("[INFO] Export directory: " + outDir.getAbsolutePath());

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File resolutionFile = new File(outDir, "seed_resolution.tsv");
        File exportedFunctionsFile = new File(outDir, "exported_functions.tsv");
        File callgraphFile = new File(outDir, "callgraph_edges.tsv");
        File unresolvedFile = new File(outDir, "unresolved_dynamic_calls.tsv");
        File notesFile = new File(outDir, "placechip_export_notes.md");

        List<TargetResolution> resolutions = resolveSeeds(imageBase);
        Map<String, FunctionEntry> seedFunctions = collectSeedFunctions(resolutions);
        Map<String, FunctionEntry> selectedFunctions = collectSelectedGraph(seedFunctions, CALLEE_DEPTH, CALLER_DEPTH);
        selectedFunctions = trimToLimit(selectedFunctions, MAX_EXPORT_FUNCTIONS);

        writeSeedResolution(resolutionFile, resolutions);
        List<UnresolvedCall> unresolvedCalls = collectUnresolvedDynamicCalls(selectedFunctions.values());
        writeExportedFunctions(exportedFunctionsFile, selectedFunctions);
        writeCallgraphEdges(callgraphFile, selectedFunctions);
        writeUnresolvedDynamicCalls(unresolvedFile, unresolvedCalls);
        writeNotes(notesFile, selectedFunctions, unresolvedCalls);

        decompileFunctions(selectedFunctions.values(), outDir);

        println("[DONE] PlaceChip callgraph export complete. Selected functions: " + selectedFunctions.size());
    }

    private List<TargetResolution> resolveSeeds(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : SEEDS) {
            resolutions.add(resolveTarget(spec, imageBase));
        }
        return resolutions;
    }

    private TargetResolution resolveTarget(TargetSpec spec, Address imageBase) {
        Address directAddress = toAddr(String.format("0x%08X", spec.rva));
        boolean directInMemory = isAddressInMemory(directAddress);
        boolean directHasInstruction = directInMemory && currentProgram.getListing().getInstructionAt(directAddress) != null;
        Function directFunction = directHasInstruction ? getFunctionContaining(directAddress) : getFunctionContaining(directAddress);
        if (directFunction == null && directHasInstruction) {
            directFunction = getFunctionAt(directAddress);
        }

        Address imageBaseAddress = null;
        boolean imageBaseInMemory = false;
        boolean imageBaseHasInstruction = false;
        Function imageBaseFunction = null;
        try {
            imageBaseAddress = imageBase.add(spec.rva);
            imageBaseInMemory = isAddressInMemory(imageBaseAddress);
            imageBaseHasInstruction = imageBaseInMemory && currentProgram.getListing().getInstructionAt(imageBaseAddress) != null;
            if (imageBaseHasInstruction) {
                imageBaseFunction = getFunctionContaining(imageBaseAddress);
                if (imageBaseFunction == null) {
                    imageBaseFunction = getFunctionAt(imageBaseAddress);
                }
            }
        }
        catch (AddressOutOfBoundsException e) {
            imageBaseAddress = null;
        }

        Address resolvedAddress = null;
        Function resolvedFunction = null;
        String resolutionMethod = "none";
        if (directHasInstruction) {
            resolvedAddress = directAddress;
            resolvedFunction = directFunction;
            resolutionMethod = "direct";
        }
        else if (imageBaseHasInstruction) {
            resolvedAddress = imageBaseAddress;
            resolvedFunction = imageBaseFunction;
            resolutionMethod = "image_base";
        }

        String status = (resolvedAddress != null && currentProgram.getListing().getInstructionAt(resolvedAddress) != null) ? "confirmed" : "failed";
        String note = "";
        if (status.equals("failed")) {
            note = "Target could not be resolved to a function by direct or image-base address.";
        }

        println("[TARGET] " + spec.name + " direct=" + directAddress + " directInMem=" + directInMemory + " directInstr=" + directHasInstruction + " imageBase=" + (imageBaseAddress != null ? imageBaseAddress : "<invalid>") + " imgInMem=" + imageBaseInMemory + " imgInstr=" + imageBaseHasInstruction + " chosen=" + (resolvedAddress != null ? resolvedAddress : "<none>") + " status=" + status);

        return new TargetResolution(
            spec.name,
            spec.rva,
            directAddress,
            directHasInstruction,
            imageBaseAddress,
            imageBaseHasInstruction,
            resolvedAddress,
            resolvedFunction,
            resolutionMethod,
            status,
            note
        );
    }

    private Map<String, FunctionEntry> collectSeedFunctions(List<TargetResolution> resolutions) {
        Map<String, FunctionEntry> seedMap = new LinkedHashMap<String, FunctionEntry>();
        for (TargetResolution res : resolutions) {
            if (res.resolvedFunction != null) {
                String key = res.resolvedFunction.getEntryPoint().toString();
                seedMap.put(key, new FunctionEntry(res.resolvedFunction, "seed"));
            }
        }
        return seedMap;
    }

    private Map<String, FunctionEntry> collectSelectedGraph(Map<String, FunctionEntry> seedFunctions, int calleeDepth, int callerDepth) {
        Map<String, FunctionEntry> selected = new LinkedHashMap<String, FunctionEntry>(seedFunctions);
        expandGraph(selected, seedFunctions.values(), calleeDepth, false);
        expandGraph(selected, seedFunctions.values(), callerDepth, true);
        return selected;
    }

    private void expandGraph(Map<String, FunctionEntry> selected, Iterable<FunctionEntry> startEntries, int depth, boolean callers) {
        List<Function> current = new ArrayList<Function>();
        for (FunctionEntry entry : startEntries) {
            current.add(entry.function);
        }

        for (int level = 1; level <= depth; level++) {
            List<Function> nextLevel = new ArrayList<Function>();
            String role = callers ? (level == 1 ? "direct_caller" : "depth2_caller") : (level == 1 ? "direct_callee" : "depth2_callee");
            for (Function function : current) {
                Set<Function> neighbors = callers ? getDirectCallers(function) : getDirectCallees(function);
                for (Function neighbor : neighbors) {
                    if (neighbor == null) {
                        continue;
                    }
                    String key = neighbor.getEntryPoint().toString();
                    if (!selected.containsKey(key)) {
                        selected.put(key, new FunctionEntry(neighbor, role));
                        nextLevel.add(neighbor);
                    }
                    else {
                        updateRolePriority(selected.get(key), role);
                    }
                }
            }
            current = nextLevel;
        }
    }

    private void updateRolePriority(FunctionEntry entry, String newRole) {
        if (rolePriority(newRole) < rolePriority(entry.role)) {
            entry.role = newRole;
        }
    }

    private int rolePriority(String role) {
        switch (role) {
            case "seed": return 0;
            case "direct_callee":
            case "direct_caller": return 1;
            case "depth2_callee":
            case "depth2_caller": return 2;
            default: return 10;
        }
    }

    private Set<Function> getDirectCallees(Function function) {
        Set<Function> callees = new HashSet<Function>();
        try {
            for (Function callee : function.getCalledFunctions(monitor)) {
                if (callee != null) {
                    callees.add(callee);
                }
            }
        }
        catch (Exception ignored) {
        }
        return callees;
    }

    private Set<Function> getDirectCallers(Function function) {
        Set<Function> callers = new HashSet<Function>();
        try {
            callers.addAll(function.getCallingFunctions(monitor));
        }
        catch (Exception ignored) {
        }

        try {
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
                    callers.add(caller);
                }
            }
        }
        catch (Exception ignored) {
        }
        return callers;
    }

    private Map<String, FunctionEntry> trimToLimit(Map<String, FunctionEntry> selected, int limit) {
        if (selected.size() <= limit) {
            return selected;
        }
        println("[WARN] Selected " + selected.size() + " functions, trimming to " + limit + " based on role priority.");
        List<FunctionEntry> entries = new ArrayList<FunctionEntry>(selected.values());
        Collections.sort(entries, (a, b) -> {
            int pa = rolePriority(a.role);
            int pb = rolePriority(b.role);
            if (pa != pb) {
                return Integer.compare(pa, pb);
            }
            return Long.compare(a.function.getEntryPoint().getOffset(), b.function.getEntryPoint().getOffset());
        });

        Map<String, FunctionEntry> trimmed = new LinkedHashMap<String, FunctionEntry>();
        for (int i = 0; i < limit; i++) {
            FunctionEntry entry = entries.get(i);
            trimmed.put(entry.function.getEntryPoint().toString(), entry);
        }
        return trimmed;
    }

    private void decompileFunctions(Iterable<FunctionEntry> entries, File outDir) {
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        int exported = 0;
        for (FunctionEntry entry : entries) {
            Function function = entry.function;
            String entrypoint = function.getEntryPoint().toString();
            String fileName = sanitizeFileName(function.getName()) + "_" + sanitizeFileName(entrypoint) + ".c";
            File outFile = new File(outDir, fileName);
            String text;
            try {
                DecompileResults results = ifc.decompileFunction(function, DECOMP_TIMEOUT_SECONDS, monitor);
                if (results != null && results.decompileCompleted() && results.getDecompiledFunction() != null) {
                    text = "/* " + function.getName() + " @ " + entrypoint + " */\n\n" + results.getDecompiledFunction().getC() + "\n";
                }
                else {
                    String error = results == null ? "null result" : String.valueOf(results.getErrorMessage());
                    text = "/* Decompile failed for " + function.getName() + " @ " + entrypoint + ": " + error + " */\n";
                }
            }
            catch (Exception e) {
                text = "/* Decompile exception for " + function.getName() + " @ " + entrypoint + ": " + e.getMessage() + " */\n";
            }

            try {
                writeText(outFile, text);
            }
            catch (IOException e) {
                println("[WARN] Failed writing decompiled output for " + function.getName() + " @ " + entrypoint + ": " + e.getMessage());
            }
            println("[OK] Decompiled " + function.getName() + " @ " + entrypoint + " -> " + outFile.getName());
            exported++;
        }
        println("[INFO] Decompiled " + exported + " functions.");
    }

    private List<UnresolvedCall> collectUnresolvedDynamicCalls(Iterable<FunctionEntry> entries) {
        List<UnresolvedCall> unresolved = new ArrayList<UnresolvedCall>();
        Listing listing = currentProgram.getListing();
        for (FunctionEntry entry : entries) {
            Function function = entry.function;
            InstructionIterator instructions = listing.getInstructions(function.getBody(), true);
            while (instructions.hasNext()) {
                Instruction instr = instructions.next();
                if (instr.getFlowType() == null || !instr.getFlowType().isCall()) {
                    continue;
                }
                boolean hasCallRef = false;
                boolean unresolvedTarget = false;
                Reference[] refs = instr.getReferencesFrom();
                for (Reference ref : refs) {
                    if (!ref.getReferenceType().isCall()) {
                        continue;
                    }
                    hasCallRef = true;
                    Address target = ref.getToAddress();
                    Function targetFunction = getFunctionContaining(target);
                    if (targetFunction == null) {
                        targetFunction = getFunctionAt(target);
                    }
                    if (targetFunction == null) {
                        unresolvedTarget = true;
                    }
                }
                if (!hasCallRef || unresolvedTarget) {
                    String note = !hasCallRef ? "UNKNOWN indirect/dynamic call: no call reference" : "UNKNOWN indirect/dynamic call: call target not resolved to function";
                    unresolved.add(new UnresolvedCall(function.getName(), function.getEntryPoint().toString(), instr.getAddress().toString(), instr.getMnemonicString(), instr.toString(), note));
                }
            }
        }
        return unresolved;
    }

    private void writeSeedResolution(File file, List<TargetResolution> resolutions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("seed_name|rva|direct_address|direct_instruction|image_base_address|image_base_instruction|resolved_address|resolved_symbol|resolution_method|status|note");
        for (TargetResolution res : resolutions) {
            String symbol = res.resolvedAddress != null ? getSymbolName(res.resolvedAddress) : "<none>";
            lines.add(res.targetName + "|0x" + Long.toHexString(res.rva) + "|" + addressToString(res.directAddress) + "|" + res.directInstruction + "|" + addressToString(res.imageBaseAddress) + "|" + res.imageBaseInstruction + "|" + addressToString(res.resolvedAddress) + "|" + symbol + "|" + res.resolutionMethod + "|" + res.status + "|" + sanitizeString(res.note));
        }
        writeText(file, join(lines, "\n") + "\n");
    }

    private void writeExportedFunctions(File file, Map<String, FunctionEntry> selected) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("function_name|entrypoint|file|role");
        for (FunctionEntry entry : selected.values()) {
            String entrypoint = entry.function.getEntryPoint().toString();
            String fileName = sanitizeFileName(entry.function.getName()) + "_" + sanitizeFileName(entrypoint) + ".c";
            lines.add(entry.function.getName() + "|" + entrypoint + "|" + fileName + "|" + entry.role);
        }
        writeText(file, join(lines, "\n") + "\n");
    }

    private void writeCallgraphEdges(File file, Map<String, FunctionEntry> selected) throws IOException {
        Set<String> edgeLines = new HashSet<String>();
        List<String> edges = new ArrayList<String>();
        for (FunctionEntry entry : selected.values()) {
            String sourceName = entry.function.getName();
            String sourceAddress = entry.function.getEntryPoint().toString();
            for (Function callee : getDirectCallees(entry.function)) {
                if (callee == null) {
                    continue;
                }
                String targetKey = callee.getEntryPoint().toString();
                if (!selected.containsKey(targetKey)) {
                    continue;
                }
                String line = sourceName + "|" + sourceAddress + "|" + callee.getName() + "|" + targetKey + "|direct_callee";
                if (edgeLines.add(line)) {
                    edges.add(line);
                }
            }
            for (Function caller : getDirectCallers(entry.function)) {
                if (caller == null) {
                    continue;
                }
                String sourceKey = caller.getEntryPoint().toString();
                if (!selected.containsKey(sourceKey)) {
                    continue;
                }
                String line = caller.getName() + "|" + sourceKey + "|" + sourceName + "|" + sourceAddress + "|direct_caller";
                if (edgeLines.add(line)) {
                    edges.add(line);
                }
            }
        }
        Collections.sort(edges);
        List<String> lines = new ArrayList<String>();
        lines.add("source_name|source_address|target_name|target_address|relationship");
        lines.addAll(edges);
        writeText(file, join(lines, "\n") + "\n");
    }

    private void writeUnresolvedDynamicCalls(File file, List<UnresolvedCall> unresolvedCalls) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("function_name|function_entry|instruction_address|mnemonic|instruction_text|note");
        for (UnresolvedCall call : unresolvedCalls) {
            lines.add(call.functionName + "|" + call.functionEntry + "|" + call.instructionAddress + "|" + call.mnemonic + "|" + sanitizeString(call.instructionText) + "|" + sanitizeString(call.note));
        }
        writeText(file, join(lines, "\n") + "\n");
    }

    private void writeNotes(File file, Map<String, FunctionEntry> selected, List<UnresolvedCall> unresolvedCalls) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("# PlaceChip Export Notes");
        lines.add("");
        lines.add("- This export is explicitly PlaceChip-centered around the gameplay placement anchor at `0x15042E0` / `FUN_01504134` / `ChipPlaceSystem.PlaceChip`.");
        lines.add("- The export resolves the seed function and known helper addresses, collects direct callers, direct callees, and depth-2 caller/callee expansion where manageable.");
        lines.add("- Older 0x02B semantic exports are not treated as the primary placement model for this placement analysis.");
        lines.add("- Unknown indirect or dynamic calls are marked as UNKNOWN; this script does not guess their semantics.");
        lines.add("");
        lines.add("## Summary");
        lines.add("- selected functions: " + selected.size());
        lines.add("- unresolved dynamic call sites: " + unresolvedCalls.size());
        lines.add("");
        lines.add("## Output files");
        lines.add("- `seed_resolution.tsv`: seed address resolution report");
        lines.add("- `exported_functions.tsv`: selected functions and roles");
        lines.add("- `callgraph_edges.tsv`: caller/callee edges within the selected slice");
        lines.add("- `unresolved_dynamic_calls.tsv`: dynamic call sites marked UNKNOWN");
        lines.add("- `placechip_export_notes.md`: this note file");
        lines.add("- decompiled C files for each selected function in the same folder");
        lines.add("");
        lines.add("## Notes");
        lines.add("- This script is intended as a fresh Ghidra evidence export, not as a file copy of prior exported C assets.");
        lines.add("- The selected functions are the seed placement anchor plus surrounding caller/callee graph context.");
        lines.add("- Indirect or unresolved calls found during function scanning are intentionally listed, not inferred.");
        writeText(file, join(lines, "\n") + "\n");
    }

    private String sanitizeFileName(String name) {
        return name.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private String getSymbolName(Address address) {
        if (address == null) {
            return "<none>";
        }
        Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(address);
        if (symbol != null) {
            return symbol.getName();
        }
        return "<none>";
    }

    private String join(List<String> items, String sep) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) {
                builder.append(sep);
            }
            builder.append(items.get(i));
        }
        return builder.toString();
    }

    private static String sanitizeString(String input) {
        if (input == null) {
            return "";
        }
        return input.replaceAll("[\\n\\r|]", " ").replaceAll("\\s+", " ").trim();
    }

    private void writeText(File file, String text) throws IOException {
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
            writer.write(text);
        }
    }

    private boolean isAddressInMemory(Address address) {
        return address != null && currentProgram.getMemory().contains(address);
    }

    private String addressToString(Address address) {
        return address != null ? address.toString() : "<none>";
    }

    private static class TargetSpec {
        private final String name;
        private final long rva;

        private TargetSpec(String name, long rva) {
            this.name = name;
            this.rva = rva;
        }
    }

    private static class TargetResolution {
        private final String targetName;
        private final long rva;
        private final Address directAddress;
        private final boolean directInstruction;
        private final Address imageBaseAddress;
        private final boolean imageBaseInstruction;
        private final Address resolvedAddress;
        private final Function resolvedFunction;
        private final String resolutionMethod;
        private final String status;
        private final String note;

        private TargetResolution(
            String targetName,
            long rva,
            Address directAddress,
            boolean directInstruction,
            Address imageBaseAddress,
            boolean imageBaseInstruction,
            Address resolvedAddress,
            Function resolvedFunction,
            String resolutionMethod,
            String status,
            String note
        ) {
            this.targetName = targetName;
            this.rva = rva;
            this.directAddress = directAddress;
            this.directInstruction = directInstruction;
            this.imageBaseAddress = imageBaseAddress;
            this.imageBaseInstruction = imageBaseInstruction;
            this.resolvedAddress = resolvedAddress;
            this.resolvedFunction = resolvedFunction;
            this.resolutionMethod = resolutionMethod;
            this.status = status;
            this.note = note;
        }
    }

    private static class FunctionEntry {
        private final Function function;
        private String role;

        private FunctionEntry(Function function, String role) {
            this.function = function;
            this.role = role;
        }
    }

    private static class UnresolvedCall {
        private final String functionName;
        private final String functionEntry;
        private final String instructionAddress;
        private final String mnemonic;
        private final String instructionText;
        private final String note;

        private UnresolvedCall(String functionName, String functionEntry, String instructionAddress, String mnemonic, String instructionText, String note) {
            this.functionName = functionName;
            this.functionEntry = functionEntry;
            this.instructionAddress = instructionAddress;
            this.mnemonic = mnemonic;
            this.instructionText = instructionText;
            this.note = note;
        }
    }
}
