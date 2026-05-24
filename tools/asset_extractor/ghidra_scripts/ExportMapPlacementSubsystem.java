// Export the map placement and chip-render subsystem for Kingdom Adventures.
//
// This script is intended to run inside Ghidra with Java scripting enabled.
// It resolves target RVAs against the loaded program image base before exporting.
// It writes a seed resolution report and only exports confirmed target-related functions.

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.symbol.Reference;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ExportMapPlacementSubsystem extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-pre-stub-logic";

    private static final TargetSpec[] TARGETS = new TargetSpec[] {
        new TargetSpec("FUN_01504134", 0L),
        new TargetSpec("FUN_02053924", 0L),
        new TargetSpec("FUN_02053a20", 0L),
        new TargetSpec("FUN_009c4d4c", 0L),
        new TargetSpec("FUN_0208e2a4", 0L),
        new TargetSpec("FUN_02098b0c", 0L),
        new TargetSpec("thunk_FUN_00a225b8", 0L),
        new TargetSpec("FUN_009c4dac", 0L)
    };

    private static final int MAX_EXPORT_FUNCTIONS = 400;
    private static final int DECOMP_TIMEOUT_SECONDS = 120;

    @Override
    public void run() throws Exception {
        String exportDir = askString("Export directory", "Output folder for decompiled and disassembly exports", DEFAULT_OUTPUT_DIR);
        if (exportDir == null || exportDir.trim().isEmpty()) {
            exportDir = DEFAULT_OUTPUT_DIR;
        }
        File outDir = new File(exportDir).getAbsoluteFile();
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
        }
        println("[INFO] Export directory: " + outDir.getAbsolutePath());

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File resolutionFile = new File(outDir, "seed_resolution.tsv");
        File callgraphFile = new File(outDir, "callgraph_edges.tsv");
        File relevanceFile = new File(outDir, "relevance_notes.tsv");
        File indexFile = new File(outDir, "index.tsv");
        File stringIndexFile = new File(outDir, "strings.tsv");

        List<TargetResolution> resolutions = resolveTargets(imageBase);
        writeResolutionReport(resolutionFile, resolutions, imageBase);

        List<Function> seedFunctions = collectConfirmedTargetFunctions(resolutions);
        if (seedFunctions.isEmpty()) {
            writeFailureReport(outDir, resolutions);
            println("[ERROR] No confirmed target functions were resolved. See seed_resolution.tsv and failure_report.txt.");
            return;
        }

        Set<Function> selectedFunctions = collectSemanticFunctions(seedFunctions);

        List<Function> functions = new ArrayList<Function>(selectedFunctions);
        Collections.sort(functions, new Comparator<Function>() {
            @Override
            public int compare(Function a, Function b) {
                return Long.compare(a.getEntryPoint().getOffset(), b.getEntryPoint().getOffset());
            }
        });

        if (functions.size() > MAX_EXPORT_FUNCTIONS) {
            println("[WARN] Selected " + functions.size() + " functions, truncating to " + MAX_EXPORT_FUNCTIONS);
            functions = functions.subList(0, MAX_EXPORT_FUNCTIONS);
        }

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        List<String> indexLines = new ArrayList<String>();

        for (Function f : functions) {
            if (monitor.isCancelled()) {
                println("[INFO] Cancelled by user.");
                break;
            }
            exportFunction(f, outDir, ifc, indexLines, stringIndexFile);
        }

        writeIndex(indexFile, indexLines);
        writeCallgraph(callgraphFile, selectedFunctions);
        writeRelevanceNotes(relevanceFile, selectedFunctions);
        println("[DONE] Export complete. Functions exported: " + functions.size());
    }

    private List<TargetResolution> resolveTargets(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : TARGETS) {
            if (spec.hasRva()) {
                resolutions.add(resolveTarget(spec, imageBase));
            }
            else {
                resolutions.addAll(resolveTargetByName(spec, imageBase));
            }
        }
        return resolutions;
    }

    private List<TargetResolution> resolveTargetByName(TargetSpec spec, Address imageBase) {
        List<TargetResolution> results = new ArrayList<TargetResolution>();
        List<Function> functions = getGlobalFunctions(spec.name);
        if (functions == null || functions.isEmpty()) {
            functions = getFunctionsByNameSubstring(spec.name);
            if (functions != null && !functions.isEmpty()) {
                println("[FALLBACK] Found functions by substring for seed: " + spec.name + " count=" + functions.size());
            }
        }

        if (functions == null || functions.isEmpty()) {
            println("[WARN] No functions found for name seed: " + spec.name);
            results.add(new TargetResolution(
                spec.name,
                spec.rva,
                imageBase,
                null,
                false,
                false,
                null,
                null,
                false,
                false,
                null,
                null,
                null,
                "name",
                "failed",
                "No function name match found"
            ));
            return results;
        }

        for (Function f : functions) {
            Address chosenAddress = f.getEntryPoint();
            boolean instructionExists = currentProgram.getListing().getInstructionAt(chosenAddress) != null;
            String status = instructionExists ? "confirmed" : "failed";
            String note = instructionExists ? "" : "Function entry exists but no instruction at entry";
            String containingAddress = chosenAddress.toString();
            println("[TARGET] " + spec.name + " name seed resolved to " + containingAddress + " function=" + f.getName() + " status=" + status);
            results.add(new TargetResolution(
                spec.name,
                spec.rva,
                imageBase,
                null,
                false,
                false,
                null,
                null,
                false,
                false,
                null,
                chosenAddress,
                f,
                "name",
                status,
                note
            ));
        }
        return results;
    }

    private List<Function> getFunctionsByNameSubstring(String substring) {
        List<Function> matches = new ArrayList<Function>();
        FunctionIterator iter = currentProgram.getFunctionManager().getFunctions(true);
        while (iter.hasNext()) {
            Function f = iter.next();
            if (f.getName().contains(substring)) {
                matches.add(f);
            }
        }
        return matches;
    }

    private TargetResolution resolveTarget(TargetSpec spec, Address imageBase) {
        Address directAddress = toAddr(String.format("0x%08X", spec.rva));
        boolean directInMemory = isAddressInMemory(directAddress);
        boolean directInstructionExists = directInMemory && currentProgram.getListing().getInstructionAt(directAddress) != null;
        Function directFunction = directInstructionExists ? getFunctionContaining(directAddress) : getFunctionContaining(directAddress);
        if (directFunction == null && directInstructionExists) {
            directFunction = getFunctionAt(directAddress);
        }

        Address imageBaseAddress = null;
        boolean imageBaseInMemory = false;
        boolean imageBaseInstructionExists = false;
        Function imageBaseFunction = null;
        try {
            imageBaseAddress = imageBase.add(spec.rva);
            imageBaseInMemory = isAddressInMemory(imageBaseAddress);
            imageBaseInstructionExists = imageBaseInMemory && currentProgram.getListing().getInstructionAt(imageBaseAddress) != null;
            if (imageBaseInstructionExists) {
                imageBaseFunction = getFunctionContaining(imageBaseAddress);
                if (imageBaseFunction == null) {
                    imageBaseFunction = getFunctionAt(imageBaseAddress);
                }
            }
        }
        catch (AddressOutOfBoundsException e) {
            imageBaseAddress = null;
            imageBaseInMemory = false;
            imageBaseInstructionExists = false;
        }

        Address chosenAddress = null;
        Function chosenFunction = null;
        String resolutionMethod = "none";
        if (directInstructionExists) {
            chosenAddress = directAddress;
            chosenFunction = directFunction;
            resolutionMethod = "direct";
        }
        else if (imageBaseInstructionExists) {
            chosenAddress = imageBaseAddress;
            chosenFunction = imageBaseFunction;
            resolutionMethod = "image_base";
        }

        boolean resolved = chosenAddress != null && currentProgram.getListing().getInstructionAt(chosenAddress) != null;
        String status = resolved ? "confirmed" : "failed";
        String note = resolved ? "" : "Could not resolve target from direct or image-base addresses.";

        String containingName = chosenFunction != null ? chosenFunction.getName() : "<none>";
        String containingAddress = chosenFunction != null ? chosenFunction.getEntryPoint().toString() : "<none>";

        println("[TARGET] " + spec.name + " RVA=0x" + Long.toHexString(spec.rva).toUpperCase() +
            " imageBase=" + imageBase.toString() +
            " direct=" + directAddress.toString() +
            " directInMem=" + directInMemory +
            " directInstr=" + directInstructionExists +
            " imgAddr=" + (imageBaseAddress != null ? imageBaseAddress.toString() : "<invalid>") +
            " imgInMem=" + imageBaseInMemory +
            " imgInstr=" + imageBaseInstructionExists +
            " chosen=" + (chosenAddress != null ? chosenAddress.toString() : "<none>") +
            " function=" + containingName + "@" + containingAddress +
            " status=" + status);

        return new TargetResolution(
            spec.name,
            spec.rva,
            imageBase,
            directAddress,
            directInMemory,
            directInstructionExists,
            directFunction,
            imageBaseAddress,
            imageBaseInMemory,
            imageBaseInstructionExists,
            imageBaseFunction,
            chosenAddress,
            chosenFunction,
            resolutionMethod,
            status,
            note
        );
    }

    private boolean isAddressInMemory(Address addr) {
        return addr != null && currentProgram.getMemory().contains(addr);
    }

    private List<Function> collectConfirmedTargetFunctions(List<TargetResolution> resolutions) {
        List<Function> confirmed = new ArrayList<Function>();
        for (TargetResolution res : resolutions) {
            if (res.chosenAddress != null && res.chosenFunction != null) {
                confirmed.add(res.chosenFunction);
            }
        }
        return confirmed;
    }

    private Set<Function> collectSemanticFunctions(List<Function> seedFunctions) {
        Set<Function> selected = new HashSet<Function>();
        Map<Function, Integer> functionDepth = new java.util.HashMap<Function, Integer>();
        java.util.Queue<Function> queue = new java.util.LinkedList<Function>();

        for (Function seed : seedFunctions) {
            if (seed != null && !functionDepth.containsKey(seed)) {
                functionDepth.put(seed, 0);
                queue.add(seed);
                selected.add(seed);
            }
        }

        while (!queue.isEmpty()) {
            Function current = queue.poll();
            int depth = functionDepth.get(current);

            if (depth == 0) {
                addCallersToQueue(selected, functionDepth, queue, current, 1);
                addCalleesToQueue(selected, functionDepth, queue, current, 1);
            }
            else if (depth == 1) {
                addCalleesDepth2(selected, functionDepth, queue, current);
            }
        }

        return selected;
    }

    private void addCallersToQueue(Set<Function> selected, Map<Function, Integer> functionDepth, java.util.Queue<Function> queue, Function f, int depth) {
        Set<Function> callers = f.getCallingFunctions(monitor);
        if (callers != null) {
            for (Function caller : callers) {
                enqueueFunction(selected, functionDepth, queue, caller, depth);
            }
        }
    }

    private void addCalleesToQueue(Set<Function> selected, Map<Function, Integer> functionDepth, java.util.Queue<Function> queue, Function f, int depth) {
        Set<Function> callees = f.getCalledFunctions(monitor);
        if (callees != null) {
            for (Function callee : callees) {
                enqueueFunction(selected, functionDepth, queue, callee, depth);
            }
        }
    }

    private void addCalleesDepth2(Set<Function> selected, Map<Function, Integer> functionDepth, java.util.Queue<Function> queue, Function f) {
        Set<Function> callees = f.getCalledFunctions(monitor);
        if (callees != null) {
            for (Function callee : callees) {
                if (callee != null && shouldIncludeDepth2(callee)) {
                    enqueueFunction(selected, functionDepth, queue, callee, 2);
                }
            }
        }
    }

    private void enqueueFunction(Set<Function> selected, Map<Function, Integer> functionDepth, java.util.Queue<Function> queue, Function function, int depth) {
        if (function == null) {
            return;
        }
        Integer existingDepth = functionDepth.get(function);
        if (existingDepth != null && existingDepth <= depth) {
            return;
        }
        if (depth > 2) {
            return;
        }
        functionDepth.put(function, depth);
        selected.add(function);
        queue.add(function);
    }

    private boolean shouldIncludeDepth2(Function f) {
        return computeRelevanceScore(f) > 0 || isLikelyPlacementHelper(f);
    }

    private int computeRelevanceScore(Function f) {
        int score = 0;
        String name = f.getName();
        if (name.contains("Map") || name.contains("Chip") || name.contains("Place") || name.contains("Edge") || name.contains("Anchor") || name.contains("Port") || name.contains("Bridge")) {
            score += 2;
        }
        if (name.startsWith("FUN_015") || name.startsWith("FUN_020")) {
            score += 1;
        }

        Listing listing = currentProgram.getListing();
        for (Instruction instr = listing.getInstructionAt(f.getEntryPoint()); instr != null && f.getBody().contains(instr.getAddress()); instr = instr.getNext()) {
            String text = instr.toString();
            if (text.contains("+4") || text.contains("+8") || text.contains("+0x10") || text.contains("+0x18") || text.contains("+0x20")) {
                score += 2;
            }
            if (text.contains("[") && text.contains("]")) {
                score += 1;
            }
            if (text.contains("BNE") || text.contains("BEQ") || text.contains("BL")) {
                score += 1;
            }
            if (text.contains("LDR") || text.contains("STR") || text.contains("MOV")) {
                score += 0;
            }
        }
        return score;
    }

    private boolean isLikelyPlacementHelper(Function f) {
        String name = f.getName();
        return name.contains("Place") || name.contains("Map") || name.contains("Chip") || name.contains("Edge") || name.contains("Port") || name.contains("Anchor");
    }

    private void writeCallgraph(File outFile, Set<Function> functions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("caller|callee");
        for (Function caller : functions) {
            Set<Function> callees = caller.getCalledFunctions(monitor);
            if (callees != null) {
                for (Function callee : callees) {
                    if (callee != null && functions.contains(callee)) {
                        lines.add(caller.getName() + "@" + caller.getEntryPoint().toString() + "|" + callee.getName() + "@" + callee.getEntryPoint().toString());
                    }
                }
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeRelevanceNotes(File outFile, Set<Function> functions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("function|entrypoint|score|reasons");
        for (Function f : functions) {
            int score = computeRelevanceScore(f);
            String reasons = collectRelevanceReasons(f);
            lines.add(f.getName() + "@" + f.getEntryPoint().toString() + "|" + score + "|" + sanitizeString(reasons));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private String collectRelevanceReasons(Function f) {
        StringBuilder reasons = new StringBuilder();
        String name = f.getName();
        if (name.contains("Map")) {
            reasons.append("name=Map;");
        }
        if (name.contains("Chip")) {
            reasons.append("name=Chip;");
        }
        if (name.contains("Place")) {
            reasons.append("name=Place;");
        }
        if (name.contains("Edge")) {
            reasons.append("name=Edge;");
        }
        if (name.contains("Anchor")) {
            reasons.append("name=Anchor;");
        }
        if (name.contains("Port")) {
            reasons.append("name=Port;");
        }

        Listing listing = currentProgram.getListing();
        for (Instruction instr = listing.getInstructionAt(f.getEntryPoint()); instr != null && f.getBody().contains(instr.getAddress()); instr = instr.getNext()) {
            String text = instr.toString();
            if (text.contains("+4") || text.contains("+8") || text.contains("+0x10") || text.contains("+0x18") || text.contains("+0x20")) {
                reasons.append("fields;");
            }
            if (text.contains("[") && text.contains("]")) {
                reasons.append("array_access;");
            }
            if (text.contains("BL")) {
                reasons.append("calls;");
            }
            if (text.contains("BNE") || text.contains("BEQ")) {
                reasons.append("branch;");
            }
        }
        if (reasons.length() == 0) {
            reasons.append("generic");
        }
        return reasons.toString();
    }

    private void writeResolutionReport(File resolutionFile, List<TargetResolution> resolutions, Address imageBase) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_name|requested_rva|program_image_base|direct_address|direct_in_memory|direct_instruction|direct_function|image_base_address|image_base_in_memory|image_base_instruction|image_base_function|chosen_address|chosen_function|resolution_method|status|note");
        for (TargetResolution res : resolutions) {
            lines.add(res.toTsvLine());
        }
        writeFile(resolutionFile, join(lines, "\n") + "\n");
    }

    private void writeFailureReport(File outDir, List<TargetResolution> resolutions) throws IOException {
        File failFile = new File(outDir, "failure_report.txt");
        StringBuilder builder = new StringBuilder();
        builder.append("Target resolution failed for Phase 2.11a export\n");
        builder.append("The script did not confirm any requested target functions.\n\n");
        for (TargetResolution res : resolutions) {
            if (!"confirmed".equals(res.status)) {
                builder.append(res.targetName).append(" RVA=0x").append(Long.toHexString(res.requestedRva).toUpperCase()).append(" status=").append(res.status).append(" note=").append(res.note).append("\n");
            }
        }
        writeFile(failFile, builder.toString());
    }

    private void exportFunction(Function f, File outDir, DecompInterface ifc, List<String> indexLines, File stringFile) {
        String entry = f.getEntryPoint().toString();
        String name = sanitizeName(f.getName());
        String baseName = name + "_" + sanitizeName(entry);

        File cOut = new File(outDir, baseName + ".c");
        File sOut = new File(outDir, baseName + ".s");

        try {
            writeDecompilation(f, cOut, ifc);
            writeDisassembly(f, sOut);
            writeReferencedStrings(f, stringFile);
            indexLines.add(name + "|" + entry + "|" + cOut.getName() + "|" + sOut.getName());
            println("[OK] Exported " + name + " @ " + entry);
        }
        catch (Exception e) {
            println("[ERROR] Failed export for " + name + " @ " + entry + ": " + e.getMessage());
        }
    }

    private void writeDecompilation(Function f, File outFile, DecompInterface ifc) throws IOException {
        DecompileResults results = ifc.decompileFunction(f, DECOMP_TIMEOUT_SECONDS, monitor);
        String text;
        if (results == null || !results.decompileCompleted() || results.getDecompiledFunction() == null) {
            String err = (results == null) ? "null result" : results.getErrorMessage();
            text = "/* Decompile failed for " + f.getName() + " @ " + f.getEntryPoint().toString() + ": " + err + " */\n";
        }
        else {
            text = results.getDecompiledFunction().getC();
        }
        writeFile(outFile, "/* " + f.getName() + " @ " + f.getEntryPoint().toString() + " */\n\n" + text + "\n");
    }

    private void writeDisassembly(Function f, File outFile) throws IOException {
        Listing listing = currentProgram.getListing();
        StringBuilder builder = new StringBuilder();
        builder.append("/* Disassembly for ").append(f.getName()).append(" @ ").append(f.getEntryPoint().toString()).append(" */\n\n");
        for (Instruction instr = listing.getInstructionAt(f.getEntryPoint()); instr != null && f.getBody().contains(instr.getAddress()); instr = instr.getNext()) {
            builder.append(instr.getAddress()).append(": ").append(instr.toString()).append("\n");
        }
        writeFile(outFile, builder.toString());
    }

    private void writeReferencedStrings(Function f, File outFile) throws IOException {
        if (!outFile.exists()) {
            writeFile(outFile, "function|address|string\n");
        }
        List<String> lines = new ArrayList<String>();
        Listing listing = currentProgram.getListing();
        for (Instruction instr = listing.getInstructionAt(f.getEntryPoint()); instr != null && f.getBody().contains(instr.getAddress()); instr = instr.getNext()) {
            for (Reference ref : instr.getReferencesFrom()) {
                Data data = listing.getDataAt(ref.getToAddress());
                if (data != null && data.isDefined()) {
                    Object value = data.getValue();
                    if (value instanceof String) {
                        lines.add(f.getName() + "|" + ref.getToAddress().toString() + "|" + sanitizeString((String) value));
                    }
                }
            }
        }
        if (!lines.isEmpty()) {
            appendFile(outFile, join(lines, "\n") + "\n");
        }
    }

    private String sanitizeName(String input) {
        return input.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private static String sanitizeString(String input) {
        return input.replaceAll("[\\r\\n\\t|]", " ").replaceAll("\\s+", " ").trim();
    }

    private void writeIndex(File indexFile, List<String> lines) throws IOException {
        writeFile(indexFile, "function|entrypoint|decomp|disasm\n" + join(lines, "\n") + "\n");
    }

    private void writeFile(File file, String content) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write(content);
        writer.close();
    }

    private void appendFile(File file, String content) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file, true));
        writer.write(content);
        writer.close();
    }

    private String join(List<String> items, String sep) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(items.get(i));
        }
        return sb.toString();
    }

    private static class TargetSpec {
        public final String name;
        public final long rva;

        public TargetSpec(String name, long rva) {
            this.name = name;
            this.rva = rva;
        }

        public boolean hasRva() {
            return rva != 0L;
        }
    }

    private static class TargetResolution {
        public final String targetName;
        public final long requestedRva;
        public final Address programImageBase;
        public final Address directAddress;
        public final boolean directInMemory;
        public final boolean directInstructionExists;
        public final Function directFunction;
        public final Address imageBaseAddress;
        public final boolean imageBaseInMemory;
        public final boolean imageBaseInstructionExists;
        public final Function imageBaseFunction;
        public final Address chosenAddress;
        public final Function chosenFunction;
        public final String resolutionMethod;
        public final String status;
        public final String note;

        public TargetResolution(
            String targetName,
            long requestedRva,
            Address programImageBase,
            Address directAddress,
            boolean directInMemory,
            boolean directInstructionExists,
            Function directFunction,
            Address imageBaseAddress,
            boolean imageBaseInMemory,
            boolean imageBaseInstructionExists,
            Function imageBaseFunction,
            Address chosenAddress,
            Function chosenFunction,
            String resolutionMethod,
            String status,
            String note
        ) {
            this.targetName = targetName;
            this.requestedRva = requestedRva;
            this.programImageBase = programImageBase;
            this.directAddress = directAddress;
            this.directInMemory = directInMemory;
            this.directInstructionExists = directInstructionExists;
            this.directFunction = directFunction;
            this.imageBaseAddress = imageBaseAddress;
            this.imageBaseInMemory = imageBaseInMemory;
            this.imageBaseInstructionExists = imageBaseInstructionExists;
            this.imageBaseFunction = imageBaseFunction;
            this.chosenAddress = chosenAddress;
            this.chosenFunction = chosenFunction;
            this.resolutionMethod = resolutionMethod;
            this.status = status;
            this.note = note;
        }

        public String toTsvLine() {
            return targetName + "|0x" + Long.toHexString(requestedRva).toUpperCase() +
                "|" + addressToString(programImageBase) +
                "|" + addressToString(directAddress) +
                "|" + directInMemory +
                "|" + directInstructionExists +
                "|" + functionInfo(directFunction) +
                "|" + addressToString(imageBaseAddress) +
                "|" + imageBaseInMemory +
                "|" + imageBaseInstructionExists +
                "|" + functionInfo(imageBaseFunction) +
                "|" + addressToString(chosenAddress) +
                "|" + functionInfo(chosenFunction) +
                "|" + resolutionMethod +
                "|" + status +
                "|" + sanitizeString(note);
        }

        private String addressToString(Address address) {
            if (address == null) {
                return "<none>";
            }
            return address.toString();
        }

        private String functionInfo(Function function) {
            if (function == null) {
                return "<none>";
            }
            return function.getName() + "@" + function.getEntryPoint().toString();
        }
    }
}
