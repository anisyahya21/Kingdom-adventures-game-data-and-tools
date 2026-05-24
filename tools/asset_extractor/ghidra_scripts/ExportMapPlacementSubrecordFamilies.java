// Focused export for Kingdom Adventures map placement subrecord families.
// Intended to run inside Ghidra with Java scripting enabled.
// Exports the deeper subrecord regions referenced by the descriptor island,
// and optionally exports only 16-byte functions directly connected to this island.

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.Symbol;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ExportMapPlacementSubrecordFamilies extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-subrecord-families";

    private static final TargetSpec[] SUBRECORD_SEEDS = new TargetSpec[] {
        new TargetSpec("BRANCH2_PAYLOAD_02A11144", 0x02A11144L),
        new TargetSpec("BRANCH2_PAYLOAD_02A1114C", 0x02A1114CL),
        new TargetSpec("BRANCH2_PAYLOAD_02A11154", 0x02A11154L),
        new TargetSpec("BRANCH2_PAYLOAD_02A11164", 0x02A11164L),
        new TargetSpec("BRANCH2_PAYLOAD_02A11174", 0x02A11174L),
        new TargetSpec("BRANCH2_PAYLOAD_02A118D4", 0x02A118D4L),
        new TargetSpec("BRANCH2_PAYLOAD_02A118DC", 0x02A118DCL),
        new TargetSpec("BRANCH2_PAYLOAD_02A118EC", 0x02A118ECL),
        new TargetSpec("BRANCH2_PAYLOAD_02A118E4", 0x02A118E4L),
        new TargetSpec("BRANCH2_PAYLOAD_02A118FC", 0x02A118FCL),
        new TargetSpec("BRANCH3_PAYLOAD_02A1192C", 0x02A1192CL),
        new TargetSpec("BRANCH3_PAYLOAD_02A11934", 0x02A11934L),
        new TargetSpec("BRANCH3_PAYLOAD_02A1193C", 0x02A1193CL),
        new TargetSpec("BRANCH3_PAYLOAD_02A11944", 0x02A11944L),
        new TargetSpec("BRANCH3_PAYLOAD_02A1194C", 0x02A1194CL),
        new TargetSpec("BRANCH3_PAYLOAD_02A11954", 0x02A11954L),
        new TargetSpec("BRANCH3_PAYLOAD_02A1195C", 0x02A1195CL),
        new TargetSpec("BRANCH3_PAYLOAD_02A11964", 0x02A11964L),
        new TargetSpec("BRANCH3_PAYLOAD_02A1196C", 0x02A1196CL),
        new TargetSpec("BRANCH3_PAYLOAD_02A1117C", 0x02A1117CL),
        new TargetSpec("BRANCH3_PAYLOAD_02A0EA54", 0x02A0EA54L),
        new TargetSpec("BRANCH3_PAYLOAD_02A0EDBC", 0x02A0EDBCL),
        new TargetSpec("BRANCH3_PAYLOAD_02A10FF4", 0x02A10FF4L),
        new TargetSpec("BRANCH3_PAYLOAD_02A0E754", 0x02A0E754L),
        new TargetSpec("BRANCH3_PAYLOAD_02A0FE0C", 0x02A0FE0CL),
        new TargetSpec("BRANCH3_PAYLOAD_02A0E784", 0x02A0E784L)
    };

    private static final String[] SUBRECORD_FAMILY_PREFIXES = new String[] {
        "02af72", // Branch 2 subrecords
        "02af76", // Branch 3 subrecords
        "02af71", // Shared companion subrecords
        "02af4f", // Typed subrecord payloads
        "02af52"  // Companion typed subrecords
    };

    private static final int CONTEXT_BYTES = 256;
    private static final int POINTER_SCAN_DEPTH = 1;
    private static final int LAYOUT_SCAN_BYTES = 128;
    private static final int MAX_EXPORT_FUNCTIONS = 32;
    private static final int DECOMP_TIMEOUT_SECONDS = 120;
    private static final boolean EXPORT_CONNECTED_16BYTE_FUNCTIONS = true;
    private static final boolean EXPORT_CONNECTED_16BYTE_FUNCTIONS_TO_FILES = true;

    @Override
    public void run() throws Exception {
        File outDir = new File(DEFAULT_OUTPUT_DIR).getAbsoluteFile();
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
        }
        println("[INFO] Export directory: " + outDir.getAbsolutePath());

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File rootsFile = new File(outDir, "subrecord_roots.tsv");
        File layoutsFile = new File(outDir, "subrecord_layouts.tsv");
        File fieldPatternsFile = new File(outDir, "subrecord_field_patterns.tsv");
        File pointerWalkFile = new File(outDir, "subrecord_pointer_walk.tsv");
        File similarityFile = new File(outDir, "subrecord_similarity_groups.tsv");
        File orderingFile = new File(outDir, "subrecord_ordering_analysis.tsv");
        File sizeTableFile = new File(outDir, "subrecord_size_table.tsv");
        File integerFieldsFile = new File(outDir, "subrecord_integer_fields.tsv");
        File relationshipFile = new File(outDir, "subrecord_relationship_graph.tsv");
        File connectedFunctionsFile = new File(outDir, "island_connected_16byte_functions.tsv");
        File notesFile = new File(outDir, "subrecord_semantic_notes.md");

        List<TargetResolution> seedResolutions = resolveTargets(imageBase);
        Set<Address> seedAddresses = collectIslandAddresses(seedResolutions);

        Set<Address> depth1Targets = collectPointerTargets(seedAddresses, POINTER_SCAN_DEPTH);
        Set<Address> subrecordRoots = filterSubrecordFamilyRoots(depth1Targets);
        int discoveredRoots = subrecordRoots.size();
        writeSubrecordRoots(rootsFile, seedResolutions, subrecordRoots);
        Set<Address> allSubrecordAddresses = new HashSet<Address>(subrecordRoots);
        allSubrecordAddresses.addAll(seedAddresses);

        Set<Address> depth2Targets = collectPointerTargets(subrecordRoots, 1);
        allSubrecordAddresses.addAll(depth2Targets);

        println("[DIAG] 02AF subrecord roots discovered=" + discoveredRoots + " / seed targets=" + depth1Targets.size());

        List<RecordPointer> pointerWalk = collectPointerWalk(allSubrecordAddresses);
        writePointerWalk(pointerWalkFile, pointerWalk);

        List<FieldPattern> patterns = buildFieldPatterns(subrecordRoots);
        writeSubrecordLayouts(layoutsFile, patterns);
        writeSubrecordFieldPatterns(fieldPatternsFile, patterns);
        writeSubrecordSizeTable(sizeTableFile, patterns);
        writeSubrecordIntegerFields(integerFieldsFile, patterns);

        Map<String, List<Address>> similarityGroups = buildSimilarityGroups(patterns);
        writeSubrecordSimilarityGroups(similarityFile, similarityGroups);

        Map<Address, String> originMap = buildOriginMap(seedResolutions, subrecordRoots);
        writeSubrecordOrderingAnalysis(orderingFile, patterns, originMap);

        println("[DIAG] 02AF roots analyzed=" + patterns.size() + " / failed=" + (discoveredRoots - patterns.size()));
        writeSubrecordRelationshipGraph(relationshipFile, pointerWalk);

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        List<FunctionExport> connectedFunctions = exportConnected16ByteFunctions(ifc, allSubrecordAddresses, outDir);
        writeConnected16ByteFunctionTable(connectedFunctionsFile, connectedFunctions);

        writeSemanticNotes(notesFile, seedAddresses, subrecordRoots, depth1Targets, depth2Targets, connectedFunctions);

        println("[DONE] Subrecord family export complete. Seed count=" + seedAddresses.size() + " subrecord roots=" + subrecordRoots.size());
    }

    private List<TargetResolution> resolveTargets(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : SUBRECORD_SEEDS) {
            resolutions.add(resolveTarget(spec, imageBase));
        }
        return resolutions;
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
        String status;
        String note;
        if (resolved) {
            status = "confirmed";
            note = "";
        }
        else if ((directAddress != null && isAddressInMemory(directAddress)) || (imageBaseAddress != null && isAddressInMemory(imageBaseAddress))) {
            status = "data_record";
            note = "Data-only record; no instruction function at target.";
        }
        else {
            status = "failed";
            note = "Address resolved but no instruction function at target";
        }

        println("[TARGET] " + spec.name + " direct=" + directAddress + " directInMem=" + directInMemory + " directInstr=" + directInstructionExists + " imgAddr=" + (imageBaseAddress != null ? imageBaseAddress.toString() : "<invalid>") + " imgInMem=" + imageBaseInMemory + " imgInstr=" + imageBaseInstructionExists + " chosen=" + (chosenAddress != null ? chosenAddress.toString() : "<none>") + " status=" + status);

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

    private Set<Address> collectIslandAddresses(List<TargetResolution> seedResolutions) {
        Set<Address> addresses = new HashSet<Address>();
        for (TargetResolution res : seedResolutions) {
            Address addr = res.getResolvedAddress();
            if (addr != null && isAddressInMemory(addr)) {
                addresses.add(addr);
            }
            else if (res.directAddress != null && isAddressInMemory(res.directAddress)) {
                addresses.add(res.directAddress);
            }
        }
        return addresses;
    }

    private Set<Address> collectPointerTargets(Set<Address> roots, int depth) {
        Set<Address> results = new HashSet<Address>();
        Set<Address> current = new HashSet<Address>(roots);
        for (int d = 1; d <= depth; d++) {
            Set<Address> next = new HashSet<Address>();
            for (Address address : current) {
                for (RecordPointer pointer : scanPointers(address)) {
                    Address target = pointer.pointerAddress;
                    if (target != null && isAddressInMemory(target) && !roots.contains(target)) {
                        next.add(target);
                    }
                }
            }
            results.addAll(next);
            current = next;
        }
        return results;
    }

    private Set<Address> filterSubrecordFamilyRoots(Set<Address> candidates) {
        Set<Address> filtered = new HashSet<Address>();
        for (Address candidate : candidates) {
            String addressText = normalizeAddress(candidate);
            for (String prefix : SUBRECORD_FAMILY_PREFIXES) {
                if (addressText.startsWith(prefix)) {
                    filtered.add(candidate);
                    break;
                }
            }
        }
        return filtered;
    }

    private String normalizeAddress(Address address) {
        if (address == null) {
            return "";
        }
        String text = address.toString().toLowerCase();
        if (text.startsWith("0x")) {
            text = text.substring(2);
        }
        return text;
    }

    private List<RecordPointer> collectPointerWalk(Set<Address> addresses) {
        List<RecordPointer> pointers = new ArrayList<RecordPointer>();
        for (Address address : addresses) {
            pointers.addAll(scanPointers(address));
        }
        Collections.sort(pointers, new Comparator<RecordPointer>() {
            @Override
            public int compare(RecordPointer a, RecordPointer b) {
                int cmp = a.recordAddress.compareTo(b.recordAddress);
                if (cmp != 0) return cmp;
                return Integer.compare(a.offset, b.offset);
            }
        });
        return pointers;
    }

    private List<FieldPattern> buildFieldPatterns(Set<Address> addresses) {
        List<FieldPattern> patterns = new ArrayList<FieldPattern>();
        for (Address address : addresses) {
            patterns.add(scanFieldPattern(address, LAYOUT_SCAN_BYTES));
        }
        return patterns;
    }

    private Map<String, List<Address>> buildSimilarityGroups(List<FieldPattern> patterns) {
        Map<String, List<Address>> groups = new HashMap<String, List<Address>>();
        for (FieldPattern pattern : patterns) {
            String key = pattern.pattern;
            List<Address> members = groups.get(key);
            if (members == null) {
                members = new ArrayList<Address>();
                groups.put(key, members);
            }
            members.add(pattern.address);
        }
        return groups;
    }

    private Map<Address, String> buildOriginMap(List<TargetResolution> seedResolutions, Set<Address> subrecordRoots) {
        Map<Address, String> map = new HashMap<Address, String>();
        for (TargetResolution seed : seedResolutions) {
            Address seedAddress = seed.getResolvedAddress();
            if (seedAddress == null) {
                seedAddress = seed.directAddress;
            }
            if (seedAddress == null) {
                continue;
            }
            String origin = seed.targetName.startsWith("BRANCH2") ? "branch2" : "branch3";
            for (RecordPointer pointer : scanPointers(seedAddress)) {
                Address target = pointer.pointerAddress;
                if (target != null && subrecordRoots.contains(target)) {
                    map.put(target, origin);
                }
            }
        }
        return map;
    }

    private List<FunctionExport> exportConnected16ByteFunctions(DecompInterface ifc, Set<Address> addresses, File outDir) {
        List<FunctionExport> exports = new ArrayList<FunctionExport>();
        if (!EXPORT_CONNECTED_16BYTE_FUNCTIONS) {
            return exports;
        }

        Set<Function> functions = new HashSet<Function>();
        for (Address address : addresses) {
            for (RecordPointer pointer : scanPointers(address)) {
                Function function = getFunctionContaining(pointer.pointerAddress);
                if (function != null && isSixteenByteFunction(function)) {
                    functions.add(function);
                }
            }
        }

        List<Function> sorted = new ArrayList<Function>(functions);
        Collections.sort(sorted, new Comparator<Function>() {
            @Override
            public int compare(Function a, Function b) {
                return a.getEntryPoint().compareTo(b.getEntryPoint());
            }
        });

        int count = 0;
        for (Function function : sorted) {
            if (count >= MAX_EXPORT_FUNCTIONS) {
                break;
            }
            String cFileName = sanitizeName(function.getName()) + "_" + sanitizeName(function.getEntryPoint().toString()) + ".c";
            String sFileName = sanitizeName(function.getName()) + "_" + sanitizeName(function.getEntryPoint().toString()) + ".s";
            if (EXPORT_CONNECTED_16BYTE_FUNCTIONS_TO_FILES) {
                writeFunctionExport(function, new File(outDir, cFileName), ifc);
                writeFunctionDisassembly(function, new File(outDir, sFileName));
            }
            exports.add(new FunctionExport(function, cFileName, sFileName, getFunctionCallers(function), getFunctionCallees(function), getFunctionSizeBytes(function)));
            count++;
        }

        return exports;
    }

    private FieldPattern scanFieldPattern(Address address, int totalBytes) {
        int pointerSize = currentProgram.getDefaultPointerSize();
        int maxWords = totalBytes / pointerSize;
        List<FieldInfo> fields = new ArrayList<FieldInfo>();
        for (int index = 0; index < maxWords; index++) {
            Address probe = address.add((long) index * pointerSize);
            byte[] bytes = new byte[pointerSize];
            try {
                currentProgram.getMemory().getBytes(probe, bytes, 0, pointerSize);
            }
            catch (MemoryAccessException e) {
                break;
            }
            long value = toUnsignedLong(bytes);
            FieldType type = FieldType.UNKNOWN;
            Address pointerAddress = null;
            String classification = "";
            if (value == 0L) {
                type = FieldType.ZERO;
            }
            else {
                pointerAddress = toAddr(String.format("0x%X", value));
                if (isAddressInMemory(pointerAddress)) {
                    classification = classifyPointerTarget(pointerAddress);
                    if (!classification.equals("unknown")) {
                        type = FieldType.POINTER;
                    }
                    else {
                        type = FieldType.INTEGER;
                    }
                }
                else {
                    type = FieldType.INTEGER;
                }
            }
            fields.add(new FieldInfo(index * pointerSize, value, type, pointerAddress, classification));
        }

        StringBuilder patternBuilder = new StringBuilder();
        for (FieldInfo field : fields) {
            if (patternBuilder.length() > 0) {
                patternBuilder.append(",");
            }
            patternBuilder.append(field.type.token);
        }

        return new FieldPattern(address, fields, patternBuilder.toString());
    }

    private boolean isSixteenByteFunction(Function function) {
        long size = getFunctionSizeBytes(function);
        return size == 16L;
    }

    private long getFunctionSizeBytes(Function function) {
        return function.getBody().getMaxAddress().subtract(function.getEntryPoint()) + 1;
    }

    private void writeSubrecordRoots(File outFile, List<TargetResolution> resolutions, Set<Address> subrecordRoots) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_type|seed_name|address|symbol|status|note");
        for (TargetResolution res : resolutions) {
            Address addr = res.getResolvedAddress();
            if (addr == null) {
                addr = res.directAddress;
            }
            lines.add("seed|" + res.targetName + "|" + addressToString(addr) + "|" + getSymbolName(addr) + "|" + res.status + "|" + sanitizeString(res.note));
        }
        for (Address root : subrecordRoots) {
            lines.add("subrecord|<discovered>|" + addressToString(root) + "|" + getSymbolName(root) + "|ok|filtered subrecord root");
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writePointerWalk(File outFile, List<RecordPointer> pointers) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|offset|pointer_value|pointer_address|classification");
        for (RecordPointer ptr : pointers) {
            lines.add(ptr.recordAddress + "|0x" + Integer.toHexString(ptr.offset).toUpperCase() + "|" + ptr.pointerAddress + "|" + ptr.pointerAddress + "|" + ptr.classification);
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSubrecordLayouts(File outFile, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|pattern|pointer_count|integer_count|zero_count|unknown_count");
        for (FieldPattern pattern : patterns) {
            lines.add(pattern.address + "|" + pattern.pattern + "|" + pattern.countType(FieldType.POINTER) + "|" + pattern.countType(FieldType.INTEGER) + "|" + pattern.countType(FieldType.ZERO) + "|" + pattern.countType(FieldType.UNKNOWN));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSubrecordFieldPatterns(File outFile, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|offset|type|value|pointer_target|classification");
        for (FieldPattern pattern : patterns) {
            for (FieldInfo field : pattern.fields) {
                lines.add(pattern.address + "|0x" + Integer.toHexString(field.offset).toUpperCase() + "|" + field.type.name() + "|0x" + Long.toHexString(field.value).toUpperCase() + "|" + (field.pointerTarget != null ? field.pointerTarget.toString() : "<none>") + "|" + field.classification);
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSubrecordSizeTable(File outFile, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|scan_bytes|word_count|pointer_count|integer_count|zero_count|unknown_count");
        for (FieldPattern pattern : patterns) {
            lines.add(pattern.address + "|" + LAYOUT_SCAN_BYTES + "|" + pattern.fields.size() + "|" + pattern.countType(FieldType.POINTER) + "|" + pattern.countType(FieldType.INTEGER) + "|" + pattern.countType(FieldType.ZERO) + "|" + pattern.countType(FieldType.UNKNOWN));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSubrecordIntegerFields(File outFile, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|offset|value_hex|value_dec");
        for (FieldPattern pattern : patterns) {
            for (FieldInfo field : pattern.fields) {
                if (field.type == FieldType.INTEGER) {
                    lines.add(pattern.address + "|0x" + Integer.toHexString(field.offset).toUpperCase() + "|0x" + Long.toHexString(field.value).toUpperCase() + "|" + field.value);
                }
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSubrecordSimilarityGroups(File outFile, Map<String, List<Address>> groups) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("group_id|pattern|member_count|members");
        int groupId = 1;
        for (Map.Entry<String, List<Address>> entry : groups.entrySet()) {
            List<Address> members = entry.getValue();
            Collections.sort(members);
            lines.add("G" + groupId + "|" + entry.getKey() + "|" + members.size() + "|" + joinAddresses(members));
            groupId++;
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSubrecordOrderingAnalysis(File outFile, List<FieldPattern> patterns, Map<Address, String> originMap) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|origin|pattern|pointer_count|integer_count|zero_count|unknown_count");
        for (FieldPattern pattern : patterns) {
            String origin = originMap.containsKey(pattern.address) ? originMap.get(pattern.address) : "unknown";
            lines.add(pattern.address + "|" + origin + "|" + pattern.pattern + "|" + pattern.countType(FieldType.POINTER) + "|" + pattern.countType(FieldType.INTEGER) + "|" + pattern.countType(FieldType.ZERO) + "|" + pattern.countType(FieldType.UNKNOWN));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSubrecordRelationshipGraph(File outFile, List<RecordPointer> pointers) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("source_address|offset|target_address|classification");
        for (RecordPointer pointer : pointers) {
            lines.add(pointer.recordAddress + "|0x" + Integer.toHexString(pointer.offset).toUpperCase() + "|" + pointer.pointerAddress + "|" + pointer.classification);
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeConnected16ByteFunctionTable(File outFile, List<FunctionExport> exports) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("function_name|entry_point|size_bytes|c_file|s_file|callers|callees");
        for (FunctionExport exp : exports) {
            lines.add(exp.function.getName() + "|" + exp.function.getEntryPoint() + "|" + exp.sizeBytes + "|" + exp.cFile + "|" + exp.sFile + "|" + sanitizeString(exp.callers) + "|" + sanitizeString(exp.callees));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSemanticNotes(File outFile, Set<Address> seeds, Set<Address> roots, Set<Address> depth1, Set<Address> depth2, List<FunctionExport> exports) throws IOException {
        StringBuilder builder = new StringBuilder();
        builder.append("# Subrecord Family Semantic Notes\n\n");
        builder.append("This export focuses on the deeper subrecord families directly referenced by the placement descriptor island.\n\n");
        builder.append("## Seed payload roots\n\n");
        for (Address seed : seeds) {
            builder.append("- ").append(seed).append("\n");
        }
        builder.append("\n## Discovered subrecord roots\n\n");
        for (Address root : roots) {
            builder.append("- ").append(root).append("\n");
        }
        builder.append("\n## Export intent\n\n");
        builder.append("- Capture the deeper families behind 0x02AF72xx, 0x02AF76xx, 0x02AF71xx, 0x02AF4Fxx, and 0x02AF52xx.\n");
        builder.append("- Produce layout, field, pointer, and relationship analysis for these subrecords.\n");
        builder.append("- Optionally export only 16-byte functions that are directly referenced by this island.\n");
        builder.append("\n## Connected 16-byte function summary\n\n");
        if (exports.isEmpty()) {
            builder.append("No 16-byte functions were directly referenced by the filtered subrecord island.\n");
        }
        else {
            for (FunctionExport exp : exports) {
                builder.append("- ").append(exp.function.getName()).append(" @ ").append(exp.function.getEntryPoint()).append(" size=").append(exp.sizeBytes).append("\n");
            }
        }
        writeFile(outFile, builder.toString());
    }

    private String joinAddresses(List<Address> addresses) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < addresses.size(); i++) {
            if (i > 0) {
                builder.append(",");
            }
            builder.append(addresses.get(i).toString());
        }
        return builder.toString();
    }

    private void writeFunctionExport(Function function, File outFile, DecompInterface ifc) {
        try {
            DecompileResults results = ifc.decompileFunction(function, DECOMP_TIMEOUT_SECONDS, monitor);
            String text;
            if (results == null || !results.decompileCompleted() || results.getDecompiledFunction() == null) {
                String err = (results == null) ? "null result" : results.getErrorMessage();
                text = "/* Decompile failed for " + function.getName() + " @ " + function.getEntryPoint().toString() + ": " + err + " */\n";
            }
            else {
                text = results.getDecompiledFunction().getC();
            }
            writeFile(outFile, "/* " + function.getName() + " @ " + function.getEntryPoint().toString() + " */\n\n" + text + "\n");
        }
        catch (Exception e) {
            try {
                writeFile(outFile, "/* Failed to decompile " + function.getName() + " @ " + function.getEntryPoint().toString() + ": " + e.getMessage() + " */\n");
            }
            catch (IOException ioe) {
                println("[WARN] Unable to write fallback decompile failure file for " + function.getName() + ": " + ioe.getMessage());
            }
        }
    }

    private void writeFunctionDisassembly(Function function, File outFile) {
        try {
            Listing listing = currentProgram.getListing();
            StringBuilder builder = new StringBuilder();
            builder.append("/* Disassembly for ").append(function.getName()).append(" @ ").append(function.getEntryPoint().toString()).append(" */\n\n");
            for (Instruction instr = listing.getInstructionAt(function.getEntryPoint()); instr != null && function.getBody().contains(instr.getAddress()); instr = instr.getNext()) {
                builder.append(instr.getAddress()).append(": ").append(instr.toString()).append("\n");
            }
            writeFile(outFile, builder.toString());
        }
        catch (IOException e) {
            // ignore write failure
        }
    }

    private String getFunctionCallers(Function function) {
        StringBuilder builder = new StringBuilder();
        ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(function.getEntryPoint());
        while (refs != null && refs.hasNext()) {
            Reference ref = refs.next();
            Address from = ref.getFromAddress();
            Function fromFunc = getFunctionContaining(from);
            if (fromFunc != null) {
                if (builder.length() > 0) builder.append(",");
                builder.append(fromFunc.getName()).append("@").append(fromFunc.getEntryPoint().toString());
            }
        }
        return builder.toString();
    }

    private String getFunctionCallees(Function function) {
        StringBuilder builder = new StringBuilder();
        Listing listing = currentProgram.getListing();
        for (Instruction instr = listing.getInstructionAt(function.getEntryPoint()); instr != null && function.getBody().contains(instr.getAddress()); instr = instr.getNext()) {
            for (Reference ref : instr.getReferencesFrom()) {
                Address to = ref.getToAddress();
                Function callee = getFunctionContaining(to);
                if (callee != null) {
                    if (builder.length() > 0) builder.append(",");
                    builder.append(callee.getName()).append("@").append(callee.getEntryPoint().toString());
                }
            }
        }
        return builder.toString();
    }

    private void writeFile(File file, String content) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
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

    private static String sanitizeName(String input) {
        return input.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private static String sanitizeString(String input) {
        if (input == null) {
            return "";
        }
        return input.replaceAll("[\r\n\t|]", " ").replaceAll("\\s+", " ").trim();
    }

    private static String addressToString(Address address) {
        return address != null ? address.toString() : "<none>";
    }

    private String classifyPointerTarget(Address pointerAddress) {
        if (!isAddressInMemory(pointerAddress)) {
            return "unmapped";
        }
        Function function = getFunctionContaining(pointerAddress);
        if (function != null) {
            return "function";
        }
        Data data = currentProgram.getListing().getDataAt(pointerAddress);
        if (data != null) {
            if (data.getValue() instanceof String) {
                return "string";
            }
            return "data";
        }
        Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(pointerAddress);
        if (symbol != null) {
            return "symbol";
        }
        return "unknown";
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

    private byte[] readBytes(Address address, int length) {
        byte[] bytes = new byte[length];
        try {
            currentProgram.getMemory().getBytes(address, bytes, 0, length);
        }
        catch (MemoryAccessException e) {
            return null;
        }
        return bytes;
    }

    private long toUnsignedLong(byte[] bytes) {
        long value = 0L;
        for (int i = 0; i < bytes.length; i++) {
            value |= ((long) bytes[i] & 0xFFL) << (8 * i);
        }
        return value;
    }

    private boolean isAddressInMemory(Address addr) {
        return addr != null && currentProgram.getMemory().contains(addr);
    }

    private Address getBoundedAddress(Address base, long delta) {
        Address candidate;
        try {
            candidate = base.add(delta);
        }
        catch (AddressOutOfBoundsException e) {
            Memory memory = currentProgram.getMemory();
            candidate = delta < 0 ? memory.getMinAddress() : memory.getMaxAddress();
        }
        Memory memory = currentProgram.getMemory();
        if (candidate.compareTo(memory.getMinAddress()) < 0) {
            candidate = memory.getMinAddress();
        }
        if (candidate.compareTo(memory.getMaxAddress()) > 0) {
            candidate = memory.getMaxAddress();
        }
        return candidate;
    }

    private List<RecordPointer> scanPointers(Address baseAddress) {
        List<RecordPointer> pointers = new ArrayList<RecordPointer>();
        Memory memory = currentProgram.getMemory();
        int pointerSize = currentProgram.getDefaultPointerSize();
        Address start = getBoundedAddress(baseAddress, 0);
        Address end = getBoundedAddress(baseAddress, CONTEXT_BYTES - pointerSize);
        for (Address probe = start; probe.compareTo(end) <= 0; probe = probe.add(pointerSize)) {
            byte[] bytes = new byte[pointerSize];
            try {
                memory.getBytes(probe, bytes, 0, pointerSize);
            }
            catch (MemoryAccessException e) {
                continue;
            }
            long ptrValue = toUnsignedLong(bytes);
            if (ptrValue == 0L) {
                continue;
            }
            Address pointerAddress = toAddr(String.format("0x%X", ptrValue));
            if (!isAddressInMemory(pointerAddress)) {
                continue;
            }
            String classification = classifyPointerTarget(pointerAddress);
            pointers.add(new RecordPointer(baseAddress, (int) probe.subtract(baseAddress), pointerAddress, classification));
        }
        return pointers;
    }

    private static class TargetSpec {
        public final String name;
        public final long rva;

        public TargetSpec(String name, long rva) {
            this.name = name;
            this.rva = rva;
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

        public Address getResolvedAddress() {
            return chosenAddress != null ? chosenAddress : directAddress != null ? directAddress : imageBaseAddress;
        }
    }

    private static class RecordPointer {
        public final Address recordAddress;
        public final int offset;
        public final Address pointerAddress;
        public final String classification;

        public RecordPointer(Address recordAddress, int offset, Address pointerAddress, String classification) {
            this.recordAddress = recordAddress;
            this.offset = offset;
            this.pointerAddress = pointerAddress;
            this.classification = classification;
        }
    }

    private static class FieldPattern {
        public final Address address;
        public final List<FieldInfo> fields;
        public final String pattern;

        public FieldPattern(Address address, List<FieldInfo> fields, String pattern) {
            this.address = address;
            this.fields = fields;
            this.pattern = pattern;
        }

        public int countType(FieldType type) {
            int count = 0;
            for (FieldInfo field : fields) {
                if (field.type == type) {
                    count++;
                }
            }
            return count;
        }
    }

    private static class FieldInfo {
        public final int offset;
        public final long value;
        public final FieldType type;
        public final Address pointerTarget;
        public final String classification;

        public FieldInfo(int offset, long value, FieldType type, Address pointerTarget, String classification) {
            this.offset = offset;
            this.value = value;
            this.type = type;
            this.pointerTarget = pointerTarget;
            this.classification = classification;
        }
    }

    private enum FieldType {
        POINTER("P"),
        INTEGER("I"),
        ZERO("Z"),
        UNKNOWN("U");

        public final String token;

        FieldType(String token) {
            this.token = token;
        }
    }

    private static class FunctionExport {
        public final Function function;
        public final String cFile;
        public final String sFile;
        public final String callers;
        public final String callees;
        public final long sizeBytes;

        public FunctionExport(Function function, String cFile, String sFile, String callers, String callees, long sizeBytes) {
            this.function = function;
            this.cFile = cFile;
            this.sFile = sFile;
            this.callers = callers;
            this.callees = callees;
            this.sizeBytes = sizeBytes;
        }
    }
}
