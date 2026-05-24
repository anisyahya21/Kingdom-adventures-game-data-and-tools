// Export a bounded descriptor island for Kingdom Adventures map placement.
//
// This script is intended to run inside Ghidra with Java scripting enabled.
// It exports a broader but bounded island around the two special-case placement
// descriptor records and their connected payload families.

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

public class ExportMapPlacementDescriptorIsland extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-descriptor-island";

    private static final TargetSpec[] SEED_TARGETS = new TargetSpec[] {
        new TargetSpec("SELECTOR_SLOT_0x2A08B18", 0x2A08B18L),
        new TargetSpec("SELECTOR_SLOT_0x2A08B6C", 0x2A08B6CL),
        new TargetSpec("POINTED_RECORD_0x02B56BF4", 0x02B56BF4L),
        new TargetSpec("POINTED_RECORD_0x02B56D14", 0x02B56D14L),
        new TargetSpec("SHARED_POINTER_0x02B3980C", 0x02B3980CL),
        new TargetSpec("BRANCH2_PAYLOAD_0x02A11144", 0x02A11144L),
        new TargetSpec("BRANCH2_PAYLOAD_0x02A118D4", 0x02A118D4L),
        new TargetSpec("BRANCH2_PAYLOAD_0x02A1114C", 0x02A1114CL),
        new TargetSpec("BRANCH2_PAYLOAD_0x02A118EC", 0x02A118ECL),
        new TargetSpec("BRANCH3_PAYLOAD_0x02A1192C", 0x02A1192CL),
        new TargetSpec("BRANCH3_PAYLOAD_0x02A0EA54", 0x02A0EA54L),
        new TargetSpec("BRANCH3_PAYLOAD_0x02A0EDBC", 0x02A0EDBCL),
        new TargetSpec("BRANCH3_PAYLOAD_0x02A10FF4", 0x02A10FF4L)
    };

    private static final int CONTEXT_BYTES = 256;
    private static final int POINTER_SCAN_SIZE = 256;
    private static final int MAX_EXPORT_FUNCTIONS = 80;
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
        File rootsFile = new File(outDir, "descriptor_roots.tsv");
        File pointerWalkFile = new File(outDir, "pointer_walk_depth2.tsv");
        File memoryIndexFile = new File(outDir, "record_memory_index.tsv");
        File xrefFile = new File(outDir, "record_xrefs.tsv");
        File symbolsFile = new File(outDir, "nearby_symbols.tsv");
        File codeExportFile = new File(outDir, "code_pointer_exports.tsv");
        File comparisonFile = new File(outDir, "branch2_vs_branch3_comparison.tsv");
        File metadataFile = new File(outDir, "metadata_candidates.tsv");
        File stringsFile = new File(outDir, "strings_near_records.tsv");
        File summaryFile = new File(outDir, "descriptor_island_summary.md");

        List<TargetResolution> seedResolutions = resolveTargets(imageBase);
        writeResolutionReport(resolutionFile, seedResolutions, imageBase);
        writeDescriptorRoots(rootsFile, seedResolutions);

        Set<Address> islandAddresses = collectIslandAddresses(seedResolutions);
        Set<Address> depth1Targets = collectPointerTargets(islandAddresses, 1);
        Set<Address> depth2Targets = collectPointerTargets(depth1Targets, 2);
        Set<Address> allIslandAddresses = new HashSet<Address>();
        allIslandAddresses.addAll(islandAddresses);
        allIslandAddresses.addAll(depth1Targets);
        allIslandAddresses.addAll(depth2Targets);

        List<RecordPointer> pointerWalk = collectPointerWalk(allIslandAddresses);
        writePointerWalk(pointerWalkFile, pointerWalk);

        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);

        List<String> memoryIndexLines = new ArrayList<String>();
        List<Function> exportedFunctions = new ArrayList<Function>();

        for (Address address : allIslandAddresses) {
            if (!isAddressInMemory(address)) {
                continue;
            }
            String name = sanitizeName("REC_" + address.toString().replace(':', '_'));
            String fileName = "record_memory_" + name + ".txt";
            File outFile = new File(outDir, fileName);
            writeRecordMemory(outFile, address);
            memoryIndexLines.add(address.toString() + "|" + fileName);
        }

        writeMemoryIndex(memoryIndexFile, memoryIndexLines);
        writeRecordXrefs(xrefFile, allIslandAddresses);
        writeNearbySymbols(symbolsFile, allIslandAddresses);
        writeStringsNearRecords(stringsFile, allIslandAddresses);

        List<CodeExport> codeExports = exportCodePointers(ifc, allIslandAddresses);
        writeCodePointerExports(codeExportFile, codeExports);

        compareBranchDescriptors(comparisonFile, toAddr("0x02B56BF4"), toAddr("0x02B56D14"));
        writeMetadataCandidates(metadataFile, allIslandAddresses);
        writeDescriptorSummary(summaryFile, islandAddresses, depth1Targets, depth2Targets, codeExports);

        println("[DONE] Descriptor island export complete. Addresses processed: " + allIslandAddresses.size());
    }

    private List<TargetResolution> resolveTargets(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : SEED_TARGETS) {
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
        String status = resolved ? "confirmed" : "failed";
        String note = resolved ? "" : "Address resolved but no instruction function at target";

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

    private List<CodeExport> exportCodePointers(DecompInterface ifc, Set<Address> addresses) {
        List<CodeExport> exports = new ArrayList<CodeExport>();
        Set<Function> functions = new HashSet<Function>();
        for (Address address : addresses) {
            Function function = getFunctionContaining(address);
            if (function != null) {
                functions.add(function);
            }
        }

        List<Function> exportsList = new ArrayList<Function>(functions);
        Collections.sort(exportsList, new Comparator<Function>() {
            @Override
            public int compare(Function a, Function b) {
                return a.getEntryPoint().compareTo(b.getEntryPoint());
            }
        });

        int count = 0;
        for (Function function : exportsList) {
            if (count >= MAX_EXPORT_FUNCTIONS) {
                break;
            }
            File cOut = new File(DEFAULT_OUTPUT_DIR, sanitizeName(function.getName()) + "_" + sanitizeName(function.getEntryPoint().toString()) + ".c");
            File sOut = new File(DEFAULT_OUTPUT_DIR, sanitizeName(function.getName()) + "_" + sanitizeName(function.getEntryPoint().toString()) + ".s");
            writeFunctionExport(function, cOut, ifc);
            writeFunctionDisassembly(function, sOut);
            String callers = collectCallers(function);
            String callees = collectCallees(function);
            exports.add(new CodeExport(function, cOut.getName(), sOut.getName(), callers, callees));
            count++;
        }
        return exports;
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

    private String collectCallers(Function function) {
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

    private String collectCallees(Function function) {
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

    private void writeDescriptorRoots(File outFile, List<TargetResolution> seedResolutions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("seed_name|address|symbol|status|note");
        for (TargetResolution res : seedResolutions) {
            Address addr = res.getResolvedAddress();
            if (addr == null) {
                addr = res.directAddress;
            }
            lines.add(res.targetName + "|" + addressToString(addr) + "|" + getSymbolName(addr) + "|" + res.status + "|" + sanitizeString(res.note));
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

    private void writeCodePointerExports(File outFile, List<CodeExport> exports) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("function_name|entry_point|c_file|s_file|callers|callees");
        for (CodeExport export : exports) {
            lines.add(export.function.getName()
                + "|" + export.function.getEntryPoint()
                + "|" + export.cFile
                + "|" + export.sFile
                + "|" + sanitizeString(export.callers)
                + "|" + sanitizeString(export.callees));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeMemoryIndex(File outFile, List<String> lines) throws IOException {
        writeFile(outFile, "address|memory_file\n" + join(lines, "\n") + "\n");
    }

    private void writeRecordXrefs(File outFile, Set<Address> addresses) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|from_address|from_symbol|reference_type");
        for (Address address : addresses) {
            ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(address);
            if (refs == null || !refs.hasNext()) {
                lines.add(address + "|<none>|<none>|<none>");
                continue;
            }
            while (refs.hasNext()) {
                Reference ref = refs.next();
                Address from = ref.getFromAddress();
                String fromSymbol = getSymbolName(from);
                lines.add(address + "|" + from + "|" + fromSymbol + "|" + ref.getReferenceType().getName());
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeNearbySymbols(File outFile, Set<Address> addresses) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|address|symbol_name|data_type|data_value");
        Listing listing = currentProgram.getListing();
        for (Address address : addresses) {
            Address start = getBoundedAddress(address, -CONTEXT_BYTES / 2);
            Address end = getBoundedAddress(address, CONTEXT_BYTES / 2);
            for (Address probe = start; probe.compareTo(end) <= 0; probe = probe.add(1)) {
                Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(probe);
                Data data = listing.getDataAt(probe);
                if (symbol == null && data == null) {
                    continue;
                }
                String symbolName = symbol != null ? symbol.getName() : "<none>";
                String dataType = data != null ? data.getDataType().getName() : "<none>";
                String dataValue = data != null && data.getValue() != null ? sanitizeString(data.getValue().toString()) : "<none>";
                lines.add(address + "|" + probe + "|" + symbolName + "|" + dataType + "|" + dataValue);
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeStringsNearRecords(File outFile, Set<Address> addresses) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|string_address|string_value");
        Listing listing = currentProgram.getListing();
        for (Address address : addresses) {
            Address start = getBoundedAddress(address, -CONTEXT_BYTES / 2);
            Address end = getBoundedAddress(address, CONTEXT_BYTES / 2);
            for (Address probe = start; probe.compareTo(end) <= 0; probe = probe.add(1)) {
                Data data = listing.getDataAt(probe);
                if (data != null && data.isDefined() && data.getValue() instanceof String) {
                    lines.add(address + "|" + probe + "|" + sanitizeString((String) data.getValue()));
                }
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeMetadataCandidates(File outFile, Set<Address> addresses) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|address|source_file|matched_line");
        File dumpCs = new File("C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/tools/asset_extractor/il2cpp_dump/dump.cs");
        File scriptJson = new File("C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/tools/asset_extractor/il2cpp_dump/script.json");
        for (Address address : addresses) {
            String addrHex = String.format("0x%X", address.getOffset());
            if (dumpCs.exists()) {
                scanFileForAddress(addrHex, dumpCs, address, lines);
            }
            if (scriptJson.exists()) {
                scanFileForAddress(addrHex, scriptJson, address, lines);
            }
        }
        if (lines.size() == 1) {
            lines.add("<none>|<none>|<none>|<none>");
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void scanFileForAddress(String addrHex, File file, Address address, List<String> lines) throws IOException {
        BufferedReader reader = new BufferedReader(new FileReader(file));
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.contains(addrHex) || line.contains(addrHex.substring(2))) {
                lines.add(address + "|" + addrHex + "|" + file.getName() + "|" + sanitizeString(line));
            }
        }
        reader.close();
    }

    private void writeDescriptorSummary(File outFile, Set<Address> roots, Set<Address> depth1, Set<Address> depth2, List<CodeExport> codeExports) throws IOException {
        StringBuilder builder = new StringBuilder();
        builder.append("# Descriptor Island Summary\n\n");
        builder.append("## Root seeds\n\n");
        for (Address address : roots) {
            builder.append("- ").append(address).append("\n");
        }
        builder.append("\n## Depth 1 pointer targets\n\n");
        for (Address address : depth1) {
            builder.append("- ").append(address).append("\n");
        }
        builder.append("\n## Depth 2 pointer targets\n\n");
        for (Address address : depth2) {
            builder.append("- ").append(address).append("\n");
        }
        builder.append("\n## Code exports\n\n");
        for (CodeExport export : codeExports) {
            builder.append("- ").append(export.function.getName()).append("@").append(export.function.getEntryPoint()).append(" -> ").append(export.cFile).append(" / ").append(export.sFile).append("\n");
        }
        writeFile(outFile, builder.toString());
    }

    private void compareBranchDescriptors(File outFile, Address branch2, Address branch3) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("offset|branch2_pointer|branch2_symbol|branch3_pointer|branch3_symbol|same");
        Map<Integer, Address> branch2Map = pointerMap(branch2);
        Map<Integer, Address> branch3Map = pointerMap(branch3);
        Set<Integer> offsets = new HashSet<Integer>();
        offsets.addAll(branch2Map.keySet());
        offsets.addAll(branch3Map.keySet());
        List<Integer> sorted = new ArrayList<Integer>(offsets);
        Collections.sort(sorted);
        for (Integer offset : sorted) {
            Address b2 = branch2Map.get(offset);
            Address b3 = branch3Map.get(offset);
            String b2sym = b2 != null ? getSymbolName(b2) : "<none>";
            String b3sym = b3 != null ? getSymbolName(b3) : "<none>";
            String same = (b2 != null && b2.equals(b3)) ? "yes" : "no";
            lines.add(String.format("0x%X|%s|%s|%s|%s|%s", offset, addressToString(b2), b2sym, addressToString(b3), b3sym, same));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private Map<Integer, Address> pointerMap(Address baseAddress) {
        Map<Integer, Address> map = new HashMap<Integer, Address>();
        for (RecordPointer ptr : scanPointers(baseAddress)) {
            map.put(ptr.offset, ptr.pointerAddress);
        }
        return map;
    }

    private void writeRecordMemory(File outFile, Address address) throws IOException {
        Memory memory = currentProgram.getMemory();
        StringBuilder builder = new StringBuilder();
        builder.append("Record: ").append(address).append("\n");
        builder.append("Resolved address: ").append(address).append("\n\n");
        builder.append(dumpMemoryRegion(address, CONTEXT_BYTES, memory));
        builder.append("\n\nPointer candidates around record:\n");
        for (RecordPointer ptr : scanPointers(address)) {
            builder.append(String.format("offset=0x%X pointer=%s classification=%s\n", ptr.offset, ptr.pointerAddress, ptr.classification));
        }
        writeFile(outFile, builder.toString());
    }

    private String dumpMemoryRegion(Address center, int totalBytes, Memory memory) {
        StringBuilder builder = new StringBuilder();
        int half = totalBytes / 2;
        Address start = getBoundedAddress(center, -half);
        Address end = getBoundedAddress(center, half - 1);
        byte[] raw = new byte[16];
        Address lineAddress = start;
        while (lineAddress.compareTo(end) <= 0) {
            int remaining = (int) Math.min(raw.length, end.subtract(lineAddress) + 1);
            StringBuilder hex = new StringBuilder();
            StringBuilder ascii = new StringBuilder();
            try {
                memory.getBytes(lineAddress, raw, 0, remaining);
                for (int i = 0; i < remaining; i++) {
                    byte b = raw[i];
                    hex.append(String.format("%02X ", b));
                    ascii.append((b >= 0x20 && b < 0x7F) ? (char) b : '.');
                }
            }
            catch (MemoryAccessException e) {
                for (int i = 0; i < remaining; i++) {
                    hex.append("?? ");
                    ascii.append('.');
                }
            }
            String marker = lineAddress.equals(center) ? " <<< record" : "";
            builder.append(String.format("%s  %-48s  %s%s\n", lineAddress, hex.toString().trim(), ascii.toString(), marker));
            lineAddress = lineAddress.add(16);
        }
        return builder.toString();
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

    private String sanitizeName(String input) {
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

    private void writeResolutionReport(File resolutionFile, List<TargetResolution> resolutions, Address imageBase) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_name|requested_rva|program_image_base|direct_address|direct_in_memory|direct_instruction|direct_function|image_base_address|image_base_in_memory|image_base_instruction|image_base_function|chosen_address|chosen_function|resolution_method|status|note");
        for (TargetResolution res : resolutions) {
            lines.add(res.toTsvLine());
        }
        writeFile(resolutionFile, join(lines, "\n") + "\n");
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
                "|" + addressToString(getResolvedAddress()) +
                "|" + functionInfo(chosenFunction) +
                "|" + resolutionMethod +
                "|" + status +
                "|" + sanitizeString(note);
        }

        private String functionInfo(Function function) {
            if (function == null) {
                return "<none>";
            }
            return function.getName() + "@" + function.getEntryPoint().toString();
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

    private static class CodeExport {
        public final Function function;
        public final String cFile;
        public final String sFile;
        public final String callers;
        public final String callees;

        public CodeExport(Function function, String cFile, String sFile, String callers, String callees) {
            this.function = function;
            this.cFile = cFile;
            this.sFile = sFile;
            this.callers = callers;
            this.callees = callees;
        }
    }
}
